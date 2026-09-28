// R18 — Kurejesha Board baada ya server kuanza upya (njia ya Appwrite).
// Functions safi (hazigusi Appwrite wala LLM) ili zipimwe kwa unit tests:
//   • trimInterrupted — agenda iliyokatizwa katikati inafutiwa maneno yake ya zamani (itaanza upya safi, A=1);
//     finale: R20 — vipande vilivyokamilika vinabaki; kilichokatika na vilivyofuata vinaondolewa (finale.ts).
//   • agendaTalk     — mjadala wa agenda moja kutoka items (kwa kukamilisha mini-report iliyokosekana).
//   • seedEvents     — historia YOTE (title, chips, ujumbe, usage) kama matukio ya buffer, ili KILA
//     attach (refresh, tab nyingine, auto-attach) ipate mjadala kamili na jina sahihi la download.
import type { BoardEvent } from "@/lib/types";
import { getAgent } from "@/lib/agents";
import { savedToEvents, type SavedItem } from "./adapter";
import { scanFinale } from "./finale";

type Usage = Record<string, { requests: number; tokens: number }>;

/** Chip ya mwanzo wa agenda: " Agenda 3/10: … — owners: …" (emoji ya mbele inaweza kuwepo au isiwepo) */
const AGENDA_START = /^\s*(?:\p{Extended_Pictographic}\uFE0F?\s*)?Agenda (\d+)\/(\d+):/u;

const text = (it: SavedItem) => String(it.text || "");

export function agendaStartIndex(items: SavedItem[], index?: number): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it.kind !== "chip") continue;
    const m = text(it).match(AGENDA_START);
    if (m && (index === undefined || Number(m[1]) === index)) return i;
  }
  return -1;
}

export interface TrimResult<T> { items: T[]; restarted: number | null; finaleCut: boolean; dropped: number }

export function trimInterrupted<T extends SavedItem>(items: T[], resolved: Set<number>, agendaTotal: number): TrimResult<T> {
  const last = agendaStartIndex(items);
  if (last >= 0) {
    const n = Number(text(items[last]).match(AGENDA_START)![1]);
    if (!resolved.has(n)) {
      return { items: items.slice(0, last), restarted: n, finaleCut: false, dropped: items.length - last };
    }
  }
  const allDone = agendaTotal > 0 && Array.from({ length: agendaTotal }, (_, i) => i + 1).every((i) => resolved.has(i));
  if (allDone) {
    // R20: vipande vya finale vilivyokamilika (script, kipande cha ripoti chenye sehemu zake zote) vinabaki —
    // kipande cha kwanza kisichokamilika na vilivyofuata ndivyo vinaondolewa (Endeleza inaandika kilichokosekana tu)
    const sc = scanFinale(items);
    if (sc.dropped > 0) return { items: sc.keep, restarted: null, finaleCut: true, dropped: sc.dropped };
  }
  return { items, restarted: null, finaleCut: false, dropped: 0 };
}

/** Mjadala wa agenda `index` (ujumbe wa agents tu — si search/memory) kwa ajili ya mini-report. */
export function agendaTalk(items: SavedItem[], index: number): { name: string; text: string }[] {
  const start = agendaStartIndex(items, index);
  if (start < 0) return [];
  const out: { name: string; text: string }[] = [];
  for (let i = start + 1; i < items.length; i++) {
    const it = items[i];
    if (it.kind === "chip" && AGENDA_START.test(text(it))) break;
    if (it.kind !== "msg") continue;
    const c = String(it.content || "").trim();
    if (!c || /^(?:🔎 Evidence check:|🔍|📄|🧠 \(memory\))/u.test(c)) continue;
    out.push({ name: getAgent(it.agentId || "pm")?.name || it.agentId || "Agent", text: c });
  }
  return out;
}

/** Historia kamili kama matukio ya buffer (title ya collection inatumika kama item ya title haipo). */
export function seedEvents(items: SavedItem[], project: string, opts: { title?: string; usage?: Usage; byProvider?: Record<string, { requests: number; tokens: number }> } = {}): BoardEvent[] {
  // user_prompt HAIWEKWI: client (attach/resume) inaiongeza yenyewe kutoka /api/boardroom/active — ingejirudia.
  const ev = (savedToEvents(items, project) as { type: string }[]).filter((e) => e.type !== "user_prompt") as unknown as BoardEvent[];
  if (opts.title && !items.some((it) => it.kind === "title" && it.text)) {
    ev.unshift({ type: "title_done", title: opts.title } as BoardEvent);
  }
  for (const [agentId, row] of Object.entries(opts.usage || {})) {
    if (row && (row.requests || row.tokens)) ev.push({ type: "usage", agentId, requests: row.requests, tokens: row.tokens });
  }
  if (opts.byProvider && Object.keys(opts.byProvider).length) ev.push({ type: "usage_provider", byProvider: opts.byProvider } as BoardEvent);
  return ev;
}
