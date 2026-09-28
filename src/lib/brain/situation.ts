// src/lib/brain/situation.ts — UELEWA WA HALI (R15): tarehe halisi (juu kabisa) + "uko wapi" + "unaweza / huwezi nini".
// Utafiti: model isiyoambiwa tarehe hudhani "sasa" ni mwaka wa data yake (temporal hallucination); agent asiyepewa
// mipaka ya uwezo hudai vitendo asivyoweza (MIRAGE-Bench, Protective Capacity Hallucination 2026).
// Tarehe (siku tu — si sekunde) iko JUU ili isisahaulike na isivunje prompt cache kila dakika; saa kamili iko mwisho.
import { SITE_INDEX } from "./site/query";

const TZ = () => process.env.APP_TIMEZONE || "Africa/Dar_es_Salaam";

export function todayLong(d = new Date()): string {
  return d.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ() });
}
export function nowTime(d = new Date()): string {
  return d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: TZ() });
}

/** Mstari wa kwanza wa KILA prompt. */
export function nowBlock(): string {
  const y = new Date().toLocaleDateString("en-GB", { year: "numeric", timeZone: TZ() });
  return `TODAY IS ${todayLong()} (${TZ()}). The year ${y} is the PRESENT, not the future. Your training data is older than today: anything current (prices, tariffs, versions, laws, news) must come from search or the website data you are given — never from memory, and never say "${y} has not happened yet".`;
}

/** Chat: uko wapi + unaweza / huwezi + zana (mistari mifupi; maelezo kamili yanasomwa kwa SITE: guide …). */
export function situationChat(o: { chatMessages?: number }): string {
  return `=== WHERE YOU ARE & WHAT YOU CAN DO ===
- You are in your PRIVATE CHAT ROOM with Mkuu (the CEO)${o.chatMessages ? ` · this thread has ${o.chatMessages} messages` : ""}. You are NOT in the Board Room, and you cannot enter it or speak inside it from here.
- You CAN: answer; search the web (automatic before your answer when needed); read this website's live data with ${SITE_INDEX}
- You can OFFER to start a Board Room session: when Mkuu asks for the Board, a confirmation card "Anzisha Board" appears under your reply — the Board starts only if HE presses it. Never claim the Board has started, never write a Board discussion, report or decisions yourself.
- You CANNOT: run code, open links outside search results, change settings, delete data, or contact anyone. If asked, say so plainly and name what Mkuu can do on the website instead.
- Unknown = say you do not know or check with SITE:/search. Never invent numbers, URLs, counts or events.`;
}

/** Board: uko wapi + zana (fupi). Mjadala wenyewe (agenda/owners) uko kwenye LIVE CONTEXT. */
export function situationBoard(): string {
  return `=== WHERE YOU ARE & WHAT YOU CAN DO ===
- You are INSIDE the Board Room (multi-agent session). Mkuu is not here; he reads the stage and the final report.
- Tools: RESEARCH_REQUEST: <query> (web search) · READ_SOURCE: <url> (full page/PDF) · SITE: <topic> (live website data — e.g. past sessions, reports, usage; the answer arrives in your next turn) · SKILL_REQUEST: <skill>. You cannot run code or contact anyone outside the Board.`;
}
