// src/lib/brain/memory/rolling.ts — ROLLING CHECKPOINT ya chat (MPANGO: "Chat itaacha kutegemea messages 14 tu").
//   • messages 14 za mwisho → verbatim (history ya model, kama zamani)
//   • messages za zamani zaidi → muhtasari wa rolling wa thread hii (LLM, async, haisubiriwi)
//     + kipande kilichobanwa (bila LLM) cha messages ambazo muhtasari bado haujazifunika
//   • muhtasari unahifadhiwa per (agent, threadId) ndani ya process + agent_memory_events (inarudi baada ya restart)
import { compactTranscript } from "./transcript";
import { saveEvent, listSessionEvents } from "./events";
import { memoryOn } from "./switch";
import { identityBlock, personaName } from "../identity";
import { stripThink, type LlmFn } from "../llm";
import { brainLine, fmtChars, consoleBlog, type BlogFn } from "../brainLog";
import { engineOf, type Persona } from "../ids";

export type Msg = { role: "user" | "assistant"; content: string };
export const RECENT = 14;
const SUMMARY_MAX = 2400;
const REFRESH_EVERY = 6; // messages mpya za zamani kabla ya kusasisha muhtasari
const COMPACT_MAX = 3500;

interface Roll { summary: string; covered: number; updatedAt: number; pending: boolean; loaded: boolean }
const g = globalThis as unknown as { __xmdRolling?: Map<string, Roll> };
const store: Map<string, Roll> = (g.__xmdRolling ||= new Map());
const keyOf = (p: Persona, threadId: string) => `${p}:${threadId}`;
const sessionOf = (p: Persona, threadId: string) => `chatroll:${p}:${threadId}`.slice(0, 64);

async function load(p: Persona, threadId: string): Promise<Roll> {
  const k = keyOf(p, threadId);
  let r = store.get(k);
  if (r?.loaded) return r;
  r = r || { summary: "", covered: 0, updatedAt: 0, pending: false, loaded: false };
  try {
    // restart ya server: soma muhtasari wa mwisho kutoka agent_memory_events
    const evs = await listSessionEvents(sessionOf(p, threadId), ["checkpoint"]);
    const best = evs.filter((e) => e.status === "memory" && e.self_note).sort((a, b) => (b.agenda_index || 0) - (a.agenda_index || 0))[0];
    if (best && (best.agenda_index || 0) > r.covered) { r.summary = best.self_note || ""; r.covered = best.agenda_index || 0; }
  } catch { /* hakuna Appwrite → process tu */ }
  r.loaded = true;
  store.set(k, r);
  return r;
}

export interface RollingResult { history: Msg[]; block: string; older: number; covered: number; summarized: boolean; chars: number }

/**
 * all = messages za dirisha (mteja anatuma 60 za mwisho, bila prompt ya sasa); offset = messages za thread
 * zilizo KABLA ya dirisha (index ya absolute). `covered` ya muhtasari ni absolute. Inarudisha history ya model (14 za mwisho) na
 * block ya system prompt ya mazungumzo ya zamani. Muhtasari mpya unaanzishwa nyuma (haisubiriwi).
 */
export async function rollingContext(
  o: { persona: Persona; threadId?: string; all: Msg[]; offset?: number; llm?: LlmFn; blog?: BlogFn },
): Promise<RollingResult> {
  const t0 = Date.now();
  const history = o.all.slice(-RECENT);
  const olderMsgs = o.all.slice(0, Math.max(0, o.all.length - RECENT));
  const who = personaName(o.persona);
  if (!olderMsgs.length) return { history, block: "", older: 0, covered: 0, summarized: false, chars: 0 };
  const threadId = o.threadId || "thread";
  const r = await load(o.persona, threadId);
  // covered ni ABSOLUTE (idadi ya messages za mwanzo wa thread zilizomo kwenye muhtasari)
  const offset = Math.max(0, Math.floor(o.offset || 0));
  const olderEnd = offset + olderMsgs.length;
  const covered = Math.min(r.covered, olderEnd);
  const uncovered = covered >= offset ? olderMsgs.slice(covered - offset) : olderMsgs;
  const talk = (ms: Msg[]) => ms.map((m) => ({ name: m.role === "user" ? "Mkuu" : who, text: m.content }));
  const parts: string[] = [];
  if (r.summary && covered > 0) parts.push(`SUMMARY OF THE EARLIER CONVERSATION (${covered} messages):\n${r.summary}`);
  if (uncovered.length) parts.push(`${covered > 0 ? "THEN (compacted)" : `EARLIER MESSAGES (${uncovered.length}, compacted)`}:\n${compactTranscript(talk(uncovered), COMPACT_MAX)}`);
  const block = `=== EARLIER IN THIS CONVERSATION (rolling checkpoint — context only; the last ${history.length} messages follow verbatim) ===\n${parts.join("\n\n")}`;

  // muhtasari mpya nyuma (LLM) — si kwenye njia ya jibu
  if (o.llm && memoryOn() && !r.pending && uncovered.length >= REFRESH_EVERY) {
    r.pending = true;
    void refresh(o.persona, threadId, r, uncovered, olderEnd, o.llm, o.blog).finally(() => { r.pending = false; });
  }
  o.blog?.("info", brainLine("memory.rolling", who, [`older ${olderEnd}${offset ? ` (window ${olderMsgs.length})` : ""}`, r.summary && covered ? `summary covers ${covered}` : "no summary yet", uncovered.length ? `compacted ${uncovered.length}` : "", `recent ${history.length}`, fmtChars(block.length)], Date.now() - t0));
  return { history, block, older: olderMsgs.length, covered, summarized: !!(r.summary && covered), chars: block.length };
}

async function refresh(p: Persona, threadId: string, r: Roll, fresh: Msg[], olderEnd: number, llm: LlmFn, sink?: BlogFn) {
  // inaweza kumaliza baada ya stream ya jibu kufungwa → console pia (log isipotee)
  const blog: BlogFn = (t, m) => { consoleBlog(t, m); try { sink?.(t, m); } catch { /* stream imefungwa */ } };
  const t0 = Date.now();
  const who = personaName(p);
  try {
    const raw = await llm(
      engineOf(p),
      [
        { role: "system", content: `${identityBlock(p)}\n\n=== TASK: ROLLING CHAT CHECKPOINT (private) ===\nYou keep a running summary of your private chat with Mkuu so you never lose the thread. Output only the summary.` },
        {
          role: "user",
          content: `PREVIOUS SUMMARY:\n${r.summary || "(none)"}\n\nNEW EARLIER MESSAGES TO FOLD IN:\n${compactTranscript(fresh.map((m) => ({ name: m.role === "user" ? "Mkuu" : who, text: m.content })), 12000)}\n\nWrite the COMPLETE updated summary (previous + new) in under ${SUMMARY_MAX} characters, as short bullet lines:\n- what Mkuu asked for and why\n- decisions, values and names agreed (exact numbers, colours, files, deliverables)\n- corrections Mkuu made to you\n- open questions / what is still pending\nNever invent. Keep Mkuu's own words for key requirements. Same language as the chat.`,
        },
      ],
      900,
    );
    const summary = stripThink(raw).trim().slice(0, SUMMARY_MAX + 400);
    if (!summary) throw new Error("empty summary");
    r.summary = summary;
    r.covered = olderEnd;
    r.updatedAt = Date.now();
    await saveEvent({ agent_id: p, session_id: sessionOf(p, threadId), project: "Chat", kind: "checkpoint", agenda_index: r.covered, agenda_item: "rolling chat checkpoint", self_note: summary, status: "memory", ms: Date.now() - t0 });
    blog("success", brainLine("memory.rolling", who, [`summary updated · covers ${r.covered}`, fmtChars(summary.length)], Date.now() - t0));
  } catch (err: any) {
    blog("warning", brainLine("memory.rolling", who, [`summary FAILED: ${String(err?.message || err).slice(0, 90)}`, "compacted fallback stays"], Date.now() - t0));
  }
}

/** Kwa tests/Clear: futa muhtasari wa thread. */
export function clearRolling(p: Persona, threadId: string) {
  store.delete(keyOf(p, threadId));
}
