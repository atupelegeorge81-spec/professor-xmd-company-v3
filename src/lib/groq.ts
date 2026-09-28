import OpenAI from "openai";
import { searchWeb, searchWebDirect, type SearchResult } from "./search";
import { curateSources } from "./brain/skills/runTools";
import { parseSiteLines, siteBlock } from "./brain/site/query";
import { XTROUTER_MODEL } from "./env";
import type { AgentEvent, LogEntry } from "./types";
import { brokerRun, continuationMessages, idleGuard, isBrokerExhausted, type Lease, type WorkClass } from "./broker";
import { readUsage, createLiveMeter, type ExactUsage } from "./tokenMeter";

export const GROQ_MODEL = XTROUTER_MODEL; // jina la zamani (imports za nje) — model halisi huchaguliwa na broker

type History = { role: "user" | "assistant"; content: string };

const MAX_VERIFY_RETRIES = 3;
const MAX_HOPS = 6;

function emitLog(onEvent: (e: AgentEvent) => void, type: LogEntry["type"], message: string, details?: string) {
  onEvent({ type: "log", entry: { id: Math.random().toString(36).slice(2, 9), timestamp: new Date().toLocaleTimeString("en-GB"), at: Date.now(), type, message, details } });
}

const TZ = process.env.APP_TIMEZONE || "Africa/Dar_es_Salaam";
/** Ujumbe MMOJA wazi pale lanes zote za bure zimejaa (hakuna maelezo ya quota ya provider). */
export function capacityMessage(nextReadyAt: number | null): string {
  if (!nextReadyAt) return "Akaunti zote za bure zimetumika kwa leo. Zitafunguka tena zikireset — jaribu baadaye.";
  const mins = Math.max(1, Math.round((nextReadyAt - Date.now()) / 60_000));
  const at = new Date(nextReadyAt).toLocaleTimeString("en-GB", { timeZone: TZ, hour: "2-digit", minute: "2-digit" });
  return mins <= 90 ? `Nafasi zote za bure zimejaa kwa muda huu. Jaribu tena baada ya dakika ${mins} (saa ${at}).` : `Nafasi zote za bure zimejaa. Zitafunguka saa ${at}.`;
}

export async function runAgentStream(opts: {
  agentId: string;
  systemPrompt: string;
  history: History[];
  userPrompt: string;
  onEvent: (e: AgentEvent) => void;
  /** R15: prompt fupi kwa hatua za kuamua (router/verify); prompt kamili → jibu la mwisho tu */
  liteSystemPrompt?: string;
  /** R15: zana ya website (SITE: <topic>) */
  site?: (q: string) => Promise<{ topic: string; text: string }>;
  /** R15: Mkuu ameomba Board waziwazi (regex ya server) — card ya "Anzisha Board" inaonyeshwa */
  boardIntent?: boolean;
  signal?: AbortSignal;
}): Promise<void> {
  const { agentId, systemPrompt, history, userPrompt, onEvent } = opts;
  // Hesabu za request HII pekee (si za process nzima).
  let sessionRequestCount = 0;
  let sessionTokenCount = 0;

  const baseMessages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];
  // R15: hatua za kuamua zinabeba prompt fupi (tokens chache) — jibu la mwisho linabeba kamili
  const liteMessages: Record<string, unknown>[] = [
    { role: "system", content: opts.liteSystemPrompt || systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  /*
   * R16 — Capacity Broker: kila hatua ni "run" moja. Broker anachagua lane (akaunti × model) yenye nafasi HALISI,
   * anasubiri ≤8s ikibidi (shimmer "anasubiri nafasi"), na kosa lolote la provider linazungushwa kimya kimya.
   *   decide/verify → LIGHT (Groq kwanza — ndogo) · jibu la mwisho → NORMAL (XKiro kwanza)
   * Jibu likikatika katikati (≥200 chars) → linaendelea kwenye lane nyingine bila kuanza upya.
   */
  const completeWithBroker = async (
    messages: Record<string, unknown>[],
    answerMode: boolean,
  ): Promise<{ content: string; tokens?: number }> => {
    const cls: WorkClass = answerMode ? "normal" : "light";
    let waitingShown = false;
    const run = brokerRun({
      agentId, purpose: answerMode ? "chat-answer" : "chat-decide", cls, messages: messages as never, maxOut: 2400,
      priority: "chat", reasoning: true, signal: opts.signal,
      onWait: (w) => {
        if (w && !waitingShown) { waitingShown = true; onEvent({ type: "capacity", waiting: true, until: w.until }); emitLog(onEvent, "info", `⏳ ${agentId}: anasubiri nafasi ya lane (${cls})…`); }
        if (!w && waitingShown) { waitingShown = false; onEvent({ type: "capacity", waiting: false, until: null }); }
      },
    });
    let msgs = messages;
    let prefix = ""; // maandishi yaliyokwisha kufika kabla ya kukatika (mid-stream)
    let empties = 0;
    let lastErr: unknown = null;
    for (let hop = 0; hop < MAX_HOPS; hop++) {
      let lease: Lease;
      try {
        lease = await run.next();
      } catch (e) {
        if (waitingShown) onEvent({ type: "capacity", waiting: false, until: null });
        if (isBrokerExhausted(e)) throw new Error(capacityMessage(e.nextReadyAt));
        throw e;
      }
      emitLog(onEvent, "api", `🛰️ ${agentId}: ${lease.label} (${cls}${hop ? ` · hop ${hop + 1}` : ""})`);
      try {
        const result = await streamCompletion(lease, msgs, onEvent, { answerMode, signal: opts.signal });
        sessionTokenCount += result.tokens || 0;
        const content = prefix + result.content;
        const visible = content.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
        if (!visible && empties < 2) {
          // jibu tupu: lane ilijibu lakini bila maandishi → jaribu lane nyingine (si kosa la mtumiaji)
          empties++;
          lease.fail(Object.assign(new Error("empty response"), { status: 502 }));
          emitLog(onEvent, "warning", `⚠️ ${agentId}: jibu tupu kutoka ${lease.label} — lane nyingine...`);
          continue;
        }
        lease.done();
        return { content, tokens: result.tokens };
      } catch (err) {
        lastErr = err;
        const v = lease.fail(err);
        const partial = String((err as { partial?: string })?.partial || "");
        const partialVisible = partial.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/<think>[\s\S]*$/i, "").trim();
        if (answerMode && partialVisible.length >= 200 && v.kind !== "fatal" && v.kind !== "aborted") {
          prefix += partialVisible;
          msgs = continuationMessages(messages as never, prefix) as never;
          emitLog(onEvent, "warning", `🔌 ${agentId}: jibu lilikatika (${lease.label}) — linaendelea kwenye lane nyingine bila kuanza upya.`);
          continue;
        }
        if (!v.reroute) throw err;
        emitLog(onEvent, "system", `🔁 ${agentId}: ${lease.label} → ${v.kind} · lane nyingine`);
      }
    }
    throw lastErr instanceof Error ? lastErr : new Error("LLM haikupatikana");
  };

  emitLog(onEvent, "system", "Mchakato umeanza. Kuandaa Phase 1 (Research)...");

  const researchUser = `${userPrompt}

=== DECIDE (tools) ===
First, reason inside <think>...</think> tags about what you need to know before answering. Then, after the closing </think>, output ONLY these lines:
SITE: <topic>   (0–3 lines; ONLY when the question is about THIS website — counts of conversations/sessions/reports, a report's content, chats, what is happening in the Board Room, token usage, how a page works. Topics: guide · sessions · session <id|latest> · reports · report <id|latest|word> · board · chats [agent] · usage · agents)
SEARCH: <your web search query>   OR   SEARCH: none   (web search for anything current or factual outside this website)
START_BOARD: yes   (ONLY if Mkuu asks to go to / start / convene the Board Room)
Do not write the final answer yet.`;

  emitLog(onEvent, "api", "Inatuma request ya Phase 1 (Decide: SITE / SEARCH / Board) kwa prompt fupi...");
  sessionRequestCount++;
  const research = await completeWithBroker(
    [...liteMessages, { role: "user", content: researchUser }],
    false,
  );
  emitLog(onEvent, "success", `Phase 1 imekamilika. Tokens zilizotumika: ${research.tokens || 0}`);

  // ---- R15: SITE (data halisi ya website) + START_BOARD (card ya uthibitisho) ----
  const extras: string[] = [];
  const siteQs = opts.site ? parseSiteLines(research.content) : [];
  if (siteQs.length && opts.site) {
    onEvent({ type: "search", query: `website · ${siteQs.join(" · ")}` });
    const got: { topic: string; text: string }[] = [];
    for (const q of siteQs) {
      const t0 = Date.now();
      const r = await opts.site(q);
      got.push(r);
      emitLog(onEvent, "info", `🌐 SITE: ${r.topic} → ${r.text.length} chars (${Date.now() - t0}ms)`);
    }
    extras.push(siteBlock(got));
  }
  const wantsBoard = opts.boardIntent || /(?:^|\n)\s*\**START_BOARD\**\s*:\s*yes/i.test(research.content);
  if (wantsBoard) {
    onEvent({ type: "action", action: "start_board", task: userPrompt });
    emitLog(onEvent, "info", "🏛️ Card ya \"Anzisha Board\" imeonyeshwa kwa Mkuu (Board inaanza akibonyeza tu).");
    extras.push(`=== WEBSITE ACTION ===\nA confirmation card "Anzisha Board" is shown to Mkuu right under your reply. The Board Room starts ONLY when he presses it. You are still in your chat room: say so in one or two sentences and, if useful, what the Board will work on. Do NOT write a Board discussion, decisions or a report.`);
  }
  const extra = extras.length ? `\n\n${extras.join("\n\n")}` : "";
  const HONEST = `Answer exactly what Mkuu asked. Use only facts from the sources / website data above or that you are sure of; cite only URLs that appear above — never invent URLs, numbers, prices or counts. If something is missing, say so plainly.`;

  const initialQuery = extractSearchQuery(research.content);

  if (!initialQuery) {
    emitLog(onEvent, "info", siteQs.length ? "Hakuna web search — jibu linatumia data ya website." : "Hakuna search inayohitajika. Inaruka moja kwa Phase 2...");
    sessionRequestCount++;
    await completeWithBroker(
      [
        ...baseMessages,
        {
          role: "user",
          content:
            userPrompt + extra +
            `\n=== ANSWER MODE ===\nReason inside <think>...</think> tags, then give Mkuu a clear, concise final answer. ${HONEST}`,
        },
      ],
      true,
    );
    onEvent({ type: "usage", sessionRequests: sessionRequestCount, totalTokens: sessionTokenCount });
    onEvent({ type: "done" });
    return;
  }

  let currentQuery = initialQuery;
  const seenQueries = new Set<string>();
  seenQueries.add(currentQuery.toLowerCase());
  let attempt = 0;
  let finalResults: SearchResult[] = [];
  let sourcesAccepted = false;

  while (attempt <= MAX_VERIFY_RETRIES) {
    emitLog(onEvent, "search", `🔍 Inatafuta: "${currentQuery}" (Jaribio ${attempt + 1}/${MAX_VERIFY_RETRIES + 1})`);
    onEvent({ type: "search", query: currentQuery });

    let results: SearchResult[] = [];
    try {
      if (attempt === 0) results = await searchWeb(currentQuery, onEvent);
      else results = await searchWebDirect(currentQuery, onEvent);
      emitLog(onEvent, "success", `SearXNG imerudisha matokeo ${results.length}.`);
      // R11: research-lookup — dedupe + rank kwa tier (log ndani ya activity ya chat)
      results = curateSources(results, "Chat", (t, m) => emitLog(onEvent, t === "warning" ? "warning" : "info", m));
    } catch (err) {
      const msg = (err as Error).message || "Search failed";
      onEvent({ type: "search_error", message: msg });
      emitLog(onEvent, "error", `SearXNG imefeli: ${msg}.`);
      break;
    }

    if (results.length === 0) { emitLog(onEvent, "warning", "Hakuna matokeo yaliyopatikana."); break; }

    onEvent({ type: "sources", sources: results });
    finalResults = results;
    emitLog(onEvent, "info", `🔎 [VERIFY] Agent anasoma sources ${results.length} ili kuthibitisha ubora...`);

    const verifyUser = `You searched the web for: "${currentQuery}"
Search results:
${formatResults(results)}

=== VERIFICATION MODE ===
Your task is to evaluate whether these search results are SUFFICIENT to answer Mkuu's original request: "${userPrompt}"
Reason inside <think>...</think> tags, considering:
1. Do the results actually address Mkuu's question?
2. Is the information current, specific, and trustworthy?
3. Are there obvious gaps that need more research?
Then, output EXACTLY ONE of the following after </think>:
Option A (satisfied):
SOURCES_OK
Option B (not satisfied — need new search):
SOURCES_INSUFFICIENT: <new search query that targets the missing information>
Do NOT write the final answer yet. Only judge the sources.`;

    sessionRequestCount++;
    const verify = await completeWithBroker(
      [...liteMessages, { role: "user", content: verifyUser }],
      false,
    );
    const verdict = extractVerdict(verify.content);

    if (verdict.ok) { emitLog(onEvent, "success", `✅ [VERIFY] Sources zinaridhisha — agent anatoa jibu la mwisho.`); sourcesAccepted = true; break; }
    emitLog(onEvent, "warning", `⚠️ [VERIFY] Sources hazitoshi — anarudi SearXNG moja kwa moja.`);
    if (!verdict.newQuery) { emitLog(onEvent, "warning", `⚠️ [VERIFY] Agent hakutoa query mpya. Inatumia sources zilizopo.`); sourcesAccepted = true; break; }

    const normalizedNew = verdict.newQuery.toLowerCase().trim();
    if (seenQueries.has(normalizedNew)) { emitLog(onEvent, "warning", `🛑 [VERIFY] Query mpya inafanana na ya zamani — early exit.`); sourcesAccepted = true; break; }

    attempt++;
    if (attempt > MAX_VERIFY_RETRIES) { emitLog(onEvent, "warning", `🔒 [VERIFY] Max retries (${MAX_VERIFY_RETRIES}) zimefika — inatumia sources zilizopo na ukweli.`); break; }

    emitLog(onEvent, "search", `🔄 [VERIFY] Kurudi SearXNG na query mpya: "${verdict.newQuery}"`);
    seenQueries.add(normalizedNew);
    currentQuery = verdict.newQuery;
  }

  if (finalResults.length > 0) {
    const honestyNote = sourcesAccepted ? "" : `\n\n[IMPORTANT: The search results above may not fully address Mkuu's request after ${MAX_VERIFY_RETRIES} verification attempts. Be HONEST: acknowledge what the data shows, acknowledge what is missing, and do NOT invent facts.]`;
    const answerUser = `You searched the web for: "${currentQuery}"
Search results:
${formatResults(finalResults)}${honestyNote}${extra}

=== ANSWER MODE ===
Reason inside <think>...</think> tags about these findings, then give Mkuu a clear, concise final answer to his message: "${userPrompt.slice(0, 600)}"
${HONEST} Be decisive where the evidence is clear; where it is not, say what is missing instead of guessing.`;
    emitLog(onEvent, "api", sourcesAccepted ? "Inatuma request ya mwisho (Final Answer)..." : "Inatuma request ya mwisho (HONEST MODE)...");
    sessionRequestCount++;
    await completeWithBroker(
      [...baseMessages, { role: "user", content: answerUser }],
      true,
    );
  } else {
    emitLog(onEvent, "info", "Hakuna sources. Inatoa jibu bila search context.");
    sessionRequestCount++;
    await completeWithBroker(
      [
        ...baseMessages,
        {
          role: "user",
          content:
            userPrompt + extra +
            `\n=== ANSWER MODE ===\nReason inside <think>...</think> tags, then give Mkuu a clear, concise final answer. ${HONEST}`,
        },
      ],
      true,
    );
  }

  onEvent({ type: "usage", sessionRequests: sessionRequestCount, totalTokens: sessionTokenCount });
  onEvent({ type: "done" });
}

function formatResults(results: SearchResult[]): string {
  if (results.length === 0) return "No useful results found.";
  return results.map((r, i) => `${i + 1}. ${r.title}\nURL: ${r.url}\n${r.content || ""}`).join("\n\n");
}

function extractSearchQuery(content: string): string | null {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, "\n");

  // Never treat the UI/query artifact as a real search query.
  const cleaned = stripped
    .replace(/<query>\s*or\s*SEARCH:\s*none\s*<\/query>/gi, "\n")
    .replace(/<query>\s*or\s*SEARCH:\s*none/gi, "\n");

  const m = cleaned.match(/SEARCH:\s*(.+)/i);
  if (!m) return null;

  let q = m[1].trim();
  q = q.replace(/^["']+|["']+$/g, "").trim();
  q = q.replace(/[.,;:!?]+$/g, "").trim();

  if (!q || /^(none|no|n\/?a\.?|no search)$/i.test(q)) return null;
  if (/^<query>\s*or\s*SEARCH:\s*none/i.test(q)) return null;

  return q;
}

function extractVerdict(content: string): { ok: boolean; newQuery?: string } {
  const stripped = content.replace(/<think>[\s\S]*?<\/think>/g, "\n");
  if (/\bSOURCES_OK\b/i.test(stripped)) return { ok: true };
  const m = stripped.match(/SOURCES_INSUFFICIENT:\s*(.+)/i);
  if (m) {
    let q = m[1].trim();
    q = q.replace(/^["']+|["']+$/g, "").trim();
    q = q.replace(/[.,;:!?]+$/g, "").trim();
    if (q && q.length > 0 && q.length < 300) return { ok: false, newQuery: q };
  }
  return { ok: true };
}

async function streamCompletion(lease: Lease, messages: Record<string, unknown>[], onEvent: (e: AgentEvent) => void, opts: { answerMode: boolean; signal?: AbortSignal }): Promise<{ content: string; tokens?: number; truncated: boolean }> {
  const parser = createThinkParser({
    onThink: (t) => onEvent({ type: "thinking", text: t }),
    onAnswer: (t) => { if (opts.answerMode) onEvent({ type: "token", text: t }); },
  });
  let content = "";
  let truncated = false;
  // R16.1: provider aliyekwama → idle guard inakata na broker anazungusha (si dakika 10 za kimya)
  const guard = idleGuard(opts.signal);
  let stream: any;
  try {
    stream = await (lease.client as OpenAI).chat.completions.create({
      model: lease.model,
      messages: messages as never,
      temperature: 0.4,
      max_tokens: lease.maxTokens,
      stream: true,
      stream_options: { include_usage: true },
      ...lease.extraBody,
    } as never, { signal: guard.signal });
  } catch (err) {
    guard.stop();
    throw guard.wrap(err);
  }
  const meter = createLiveMeter(messages, (u) => onEvent({ type: "usage_live", prompt: u.prompt, completion: u.completion }));
  let exactUsage: ExactUsage | null = null;
  // finally: timer ya meter isibaki hai stream ikitupa error katikati
  try {
    for await (const chunk of stream) {
      guard.touch();
      // Usage frame (choices: []) husomwa kabla ya delta — vinginevyo tokens hubaki 0.
      const frameUsage = readUsage(chunk);
      if (frameUsage) exactUsage = frameUsage;
      const delta = chunk.choices?.[0]?.delta;
      if (!delta) continue;
      // reasoning_content (XKiro/DeepSeek) · reasoning (Groq gpt-oss / OpenRouter)
      const reasoning = (delta as { reasoning_content?: string; reasoning?: string }).reasoning_content ?? (delta as { reasoning?: string }).reasoning;
      if (typeof reasoning === "string" && reasoning) {
        onEvent({ type: "thinking", text: reasoning });
        meter.add(reasoning);
      }
      if (typeof delta.content === "string" && delta.content) {
        content += delta.content;
        parser.feed(delta.content);
        meter.add(delta.content);
      }
      if (chunk.choices?.[0]?.finish_reason === "length") truncated = true;
    }
    // R16.1: SDK ya openai humeza AbortError na kumaliza loop kimya kimya — Stop/idle isionekane kama jibu kamili
    if (guard.signal.aborted) throw new Error("Request was aborted.");
  } catch (err) {
    // stream ilikatika katikati → mwitaji anaamua kuendelea kwenye lane nyingine (partial inabebwa)
    parser.flush();
    throw guard.wrap(Object.assign(err instanceof Error ? err : new Error(String(err)), { partial: content }));
  } finally {
    meter.stop();
    guard.stop();
  }

  parser.flush();
  const finalUsage = exactUsage || meter.snapshot();
  onEvent({ type: "usage_turn", prompt: finalUsage.prompt, completion: finalUsage.completion, total: finalUsage.total, exact: !!exactUsage });
  return { content, tokens: finalUsage.total, truncated };
}

function createThinkParser(opts: { onThink: (t: string) => void; onAnswer: (t: string) => void }) {
  const { onThink, onAnswer } = opts;
  const OPEN = "<think>"; const CLOSE = "</think>";
  let pending = ""; let inThink = false;
  const emit = (text: string) => { if (!text) return; if (inThink) onThink(text); else onAnswer(text); };
  const partialPrefix = (s: string, tag: string): number => {
    let best = 0;
    for (let k = 1; k <= Math.min(s.length, tag.length - 1); k++) if (tag.startsWith(s.slice(s.length - k))) best = k;
    return best;
  };
  const feed = (t: string) => {
    pending += t;
    let guard = 0;
    while (guard++ < 40) {
      if (!inThink) {
        const open = pending.indexOf(OPEN);
        if (open >= 0) { emit(pending.slice(0, open)); pending = pending.slice(open + OPEN.length); inThink = true; continue; }
        const keep = partialPrefix(pending, OPEN);
        const len = pending.length - keep;
        if (len > 0) { emit(pending.slice(0, len)); pending = pending.slice(len); }
        break;
      } else {
        const close = pending.indexOf(CLOSE);
        if (close >= 0) { emit(pending.slice(0, close)); pending = pending.slice(close + CLOSE.length); inThink = false; continue; }
        const keep = partialPrefix(pending, CLOSE);
        const len = pending.length - keep;
        if (len > 0) { emit(pending.slice(0, len)); pending = pending.slice(len); }
        break;
      }
    }
  };
  return { feed, flush: () => { if (pending) { emit(pending); pending = ""; } } };
}
