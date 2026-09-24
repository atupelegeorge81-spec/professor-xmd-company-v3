import OpenAI from "openai";
import { searchWeb, searchWebDirect, type SearchResult } from "./search";
import {
  groqApiKey,
  apiKeyFor,
  apiModelsFor,
  apiBaseUrlFor,
  type ApiStage,
} from "./env";
import type { AgentEvent, LogEntry } from "./types";

export const GROQ_MODEL = process.env.XTROUTER_MODEL || "qwen/qwen3.8-max:free";
export const GROQ_BASE_URL = process.env.XTROUTER_BASE_URL || "https://api.xkiro.com/v1";

type History = { role: "user" | "assistant"; content: string };

const MAX_VERIFY_RETRIES = 3;
let sessionRequestCount = 0;
let sessionTokenCount = 0;
const chatApiCycle: Record<string, ApiStage> = {};

function getChatStage(agentId: string): ApiStage {
  return chatApiCycle[agentId] ?? 0;
}

function setChatStage(agentId: string, stage: ApiStage): void {
  chatApiCycle[agentId] = stage;
}

function chatStageName(stage: ApiStage): string {
  return stage === 0
    ? "XKiRO Key 1"
    : stage === 1
      ? "XKiRO Key 2"
      : stage === 2
        ? "Groq Key 1"
        : "Groq Key 2";
}

function emitLog(onEvent: (e: AgentEvent) => void, type: LogEntry["type"], message: string, details?: string) {
  onEvent({ type: "log", entry: { id: Math.random().toString(36).slice(2, 9), timestamp: new Date().toLocaleTimeString("en-GB"), type, message, details } });
}

export async function runAgentStream(opts: {
  agentId: string;
  systemPrompt: string;
  history: History[];
  userPrompt: string;
  onEvent: (e: AgentEvent) => void;
  model?: string;
  apiKey?: string;
  modelChain?: string[];
}): Promise<void> {
  const { agentId, systemPrompt, history, userPrompt, onEvent } = opts;

  let stage: ApiStage = getChatStage(agentId);

  const stageInfo = () => ({
    key: apiKeyFor(agentId, stage),
    models: apiModelsFor(agentId, stage),
    baseURL: apiBaseUrlFor(agentId, stage),
  });

  let current = stageInfo();

  if (!current.key) {
    const fallbackKey = opts.apiKey || groqApiKey();

    if (!fallbackKey) {
      onEvent({
        type: "error",
        message: "GROQ_API_KEY is not configured.",
      });
      return;
    }

    current = {
      key: fallbackKey,
      models:
        opts.modelChain && opts.modelChain.length
          ? opts.modelChain
          : [opts.model || GROQ_MODEL],
      baseURL: GROQ_BASE_URL,
    };
  }

  let client = new OpenAI({
    apiKey: current.key!,
    baseURL: current.baseURL,
  });
  const baseMessages: Record<string, unknown>[] = [
    { role: "system", content: systemPrompt },
    ...history.map((m) => ({ role: m.role, content: m.content })),
  ];

  let modelIndex = 0;

  const rotateStage = () => {
    const previous = stage;

    stage = ((stage + 1) % 4) as ApiStage;
    setChatStage(agentId, stage);

    current = stageInfo();

    client = new OpenAI({
      apiKey: current.key!,
      baseURL: current.baseURL,
    });

    modelIndex = 0;

    emitLog(
      onEvent,
      "warning",
      `⚠️ ${agentId}: API cycle ${chatStageName(previous)} → ${chatStageName(stage)}`
    );

    emitLog(
      onEvent,
      "system",
      `🔁 ${agentId}: API key fallback → ${chatStageName(stage)} → ${current.models[0]}`
    );
  };

  /*
   * Token-limit/truncated lifecycle.
   *
   * Current API stage:
   *   model 0 → model 1
   *
   * After the last model in the current stage:
   *   stage 0 → stage 1 → stage 2 → stage 3 → stage 0
   *
   * Only a truncated response advances this lifecycle.
   */
  const completeWithApiCycle = async (
    messages: Record<string, unknown>[],
    answerMode: boolean,
  ): Promise<{ content: string; tokens?: number }> => {
    let providerRetries = 0;

    while (true) {
      try {
        const result = await streamCompletion(
          client,
          messages,
          onEvent,
          {
            answerMode,
            modelChain: current.models,
            _mi: modelIndex,
          },
        );

        const visible = result.content
          .replace(/<think>[\s\S]*?<\/think>/gi, "")
          .trim();

        // Empty/truncated response = model failure.
        if (result.truncated || !visible) {
          providerRetries++;

          if (providerRetries < MAX_VERIFY_RETRIES) {
            emitLog(
              onEvent,
              "warning",
              `⚠️ ${agentId}: model failed — retry ${providerRetries}/${MAX_VERIFY_RETRIES} same model`,
            );
            continue;
          }

          providerRetries = 0;

          if (modelIndex + 1 < current.models.length) {
            modelIndex += 1;
            emitLog(
              onEvent,
              "warning",
              `🔄 ${agentId}: model failed 3 retries — model swap → ${current.models[modelIndex]}`,
            );
            continue;
          }

          rotateStage();
          continue;
        }

        return result;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : String(err);

        const isLimit =
          /429|rate.?limit|quota|token quota|daily.*quota|TPD|tokens per day|too many requests/i.test(
            message,
          );

        const isSize =
          /413|too large|context length|maximum context/i.test(message);

        /*
         * 429 / quota / rate limit:
         * NO RETRY.
         * Immediately change model/stage.
         */
        if (isLimit) {
          providerRetries = 0;

          if (modelIndex + 1 < current.models.length) {
            modelIndex += 1;

            emitLog(
              onEvent,
              "warning",
              `🚫 ${agentId}: quota/rate limit — immediate model swap → ${current.models[modelIndex]}`,
            );

            continue;
          }

          emitLog(
            onEvent,
            "warning",
            `🚫 ${agentId}: quota/rate limit — models exhausted, API stage swap`,
          );

          rotateStage();
          continue;
        }

        /*
         * 413:
         * shrink ONCE, retry SAME model.
         */
        if (isSize && !messages.some(
          (m) =>
            typeof m.content === "string" &&
            m.content.includes("[…truncated…]"),
        )) {
          for (const m of messages) {
            if (
              typeof m.content === "string" &&
              m.content.length > 1500
            ) {
              m.content =
                m.content.slice(0, 1500) +
                "\n[…truncated…]";
            }
          }

          emitLog(
            onEvent,
            "warning",
            "✂️ 413 prompt kubwa — imepunguzwa, retry same model...",
          );

          continue;
        }

        /*
         * Other provider/model errors:
         * SAME model × 3, then swap.
         */
        providerRetries++;

        if (providerRetries < MAX_VERIFY_RETRIES) {
          emitLog(
            onEvent,
            "warning",
            `⚠️ ${agentId}: provider/model error — retry ${providerRetries}/${MAX_VERIFY_RETRIES} same model`,
            message,
          );
          continue;
        }

        providerRetries = 0;

        if (modelIndex + 1 < current.models.length) {
          modelIndex += 1;

          emitLog(
            onEvent,
            "warning",
            `🔄 ${agentId}: provider/model failed 3 retries — model swap → ${current.models[modelIndex]}`,
          );

          continue;
        }

        emitLog(
          onEvent,
          "warning",
          `🔄 ${agentId}: provider/model failed 3 retries — API stage swap`,
        );

        rotateStage();
      }
    }
  };

  emitLog(onEvent, "system", "Mchakato umeanza. Kuandaa Phase 1 (Research)...");

  const researchUser = `${userPrompt}

=== RESEARCH MODE ===
First, reason inside <think>...</think> tags about what you need to verify in the real world. Then, after the closing </think>, output EXACTLY one line on its own:
SEARCH: <your search query>
OR
SEARCH: none
Do not write the final answer yet.`;

  emitLog(onEvent, "api", "Inatuma request ya Phase 1 (Thinking & Search Query) kwa Groq...");
  sessionRequestCount++;
  const research = await completeWithApiCycle(
    [...baseMessages, { role: "user", content: researchUser }],
    false,
  );
  emitLog(onEvent, "success", `Phase 1 imekamilika. Tokens zilizotumika: ${research.tokens || 0}`);

  const initialQuery = extractSearchQuery(research.content);

  if (!initialQuery) {
    emitLog(onEvent, "info", "Hakuna search inayohitajika. Inaruka moja kwa Phase 2...");
    sessionRequestCount++;
    await completeWithApiCycle(
      [
        ...baseMessages,
        {
          role: "user",
          content:
            userPrompt +
            "\n=== ANSWER MODE ===\nReason inside <think>...</think> tags, then give Mkuu a clear, concise final answer.",
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
    const verify = await completeWithApiCycle(
      [...baseMessages, { role: "user", content: verifyUser }],
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
${formatResults(finalResults)}${honestyNote}

=== ANSWER MODE ===
Reason inside <think>...</think> tags about these findings, then give Mkuu a clear, concise final answer.
CRITICAL RULE: Mkuu asked for an IDEA or RECOMMENDATION. Synthesize a concrete, unique idea ("Mkuu, tujenge hivi..."), how it works, why it will succeed. DO NOT end by asking Mkuu a question. Be decisive.`;
    emitLog(onEvent, "api", sourcesAccepted ? "Inatuma request ya mwisho (Final Answer)..." : "Inatuma request ya mwisho (HONEST MODE)...");
    sessionRequestCount++;
    await completeWithApiCycle(
      [...baseMessages, { role: "user", content: answerUser }],
      true,
    );
  } else {
    emitLog(onEvent, "info", "Hakuna sources. Inatoa jibu bila search context.");
    sessionRequestCount++;
    await completeWithApiCycle(
      [
        ...baseMessages,
        {
          role: "user",
          content:
            userPrompt +
            "\n=== ANSWER MODE ===\nReason inside <think>...</think> tags, then give Mkuu a clear, concise final answer.",
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

async function streamCompletion(client: OpenAI, messages: Record<string, unknown>[], onEvent: (e: AgentEvent) => void, opts: { answerMode: boolean; modelChain?: string[]; _mi?: number; _shrunk?: boolean }): Promise<{ content: string; tokens?: number; truncated: boolean }> {
  const modelChain =
    opts.modelChain && opts.modelChain.length
      ? opts.modelChain
      : [GROQ_MODEL];
  const mi = opts._mi ?? 0;
  const parser = createThinkParser({
    onThink: (t) => onEvent({ type: "thinking", text: t }),
    onAnswer: (t) => { if (opts.answerMode) onEvent({ type: "token", text: t }); },
  });
  let content = "";
  let tokensUsed = 0;
  let truncated = false;
  let stream: any;
  try {
    stream = await client.chat.completions.create({
      model: modelChain[mi],
      messages: messages as never,
      temperature: 0.4,
      max_tokens: 2400,
      stream: true,
      include_reasoning: true,
      stream_options: { include_usage: true },
    } as never);
  } catch (err) {
    const em = (err as Error)?.message || "unknown";
    const isSize = /413|too large/i.test(em);

    /*
     * 413 ONLY:
     * shrink prompt once and retry SAME model.
     *
     * 429 / quota / rate-limit:
     * DO NOT retry here.
     * Throw upward to completeWithApiCycle().
     */
    if (isSize && !opts._shrunk) {
      for (const m of messages) {
        if (
          typeof m.content === "string" &&
          m.content.length > 1500
        ) {
          m.content =
            m.content.slice(0, 1500) +
            "\n[…truncated…]";
        }
      }

      emitLog(
        onEvent,
        "warning",
        "✂️ 413 prompt kubwa — imepunguzwa, retry same model..."
      );

      return streamCompletion(
        client,
        messages,
        onEvent,
        {
          ...opts,
          modelChain,
          _mi: mi,
          _shrunk: true,
        },
      );
    }

    throw err;
  }
  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta;
    if (!delta) continue;
    const reasoning = (delta as unknown as { reasoning_content?: string }).reasoning_content;
    if (typeof reasoning === "string" && reasoning) {
      onEvent({ type: "thinking", text: reasoning });
    }

    if (typeof delta.content === "string" && delta.content) {
      content += delta.content;
      parser.feed(delta.content);
    }
    if (chunk.choices?.[0]?.finish_reason === "length") {
      truncated = true;
    }

    if (chunk.usage) {
      tokensUsed = chunk.usage.total_tokens || 0;
      sessionTokenCount += tokensUsed;
    }
  }

  parser.flush();
  return {
    content,
    tokens: tokensUsed,
    truncated,
  };
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
