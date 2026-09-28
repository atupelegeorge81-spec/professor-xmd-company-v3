// src/lib/brain/site/query.ts — ZANA YA WEBSITE (R15): `SITE: <topic>` → data HALISI ya website hii (kusoma tu).
// Just-in-time: prompt kuu ina orodha fupi ya topics tu (SITE_INDEX); data kamili inaletwa pale agent anapoiomba.
// Majibu ni mafupi (muhtasari + vitambulisho vya kuomba zaidi) — kanuni za Anthropic "writing tools for agents".
// Imports nzito ni za dynamic (sessionIndex → boardRunner → brain) ili kuepuka mzunguko wa imports.
import { guideText, GUIDE_KEYS } from "./guide";
import { stateBus } from "../stateBus";

export const SITE_TOPICS = ["guide", "sessions", "session", "reports", "report", "board", "chats", "usage", "agents"] as const;

/** Mstari mmoja kwa prompt kuu — orodha ya kinachopatikana (si data yenyewe). */
export const SITE_INDEX = `SITE: <topic> reads LIVE data of this website (read-only). Topics: guide [${GUIDE_KEYS.join("|")}] · sessions (count + latest) · session <id|latest> · reports (count + latest) · report <id|latest|word> (full text) · board (Board Room right now) · chats [agent] (private chat threads) · usage (all 5 API accounts in detail) · agents (team + model each one uses now).`;

const TZ = () => process.env.APP_TIMEZONE || "Africa/Dar_es_Salaam";
const day = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "?" : d.toLocaleString("en-GB", { timeZone: TZ(), day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
};
const n = (v: number) => Math.round(v || 0).toLocaleString("en-US");
const cut = (s: string, max: number) => (s.length > max ? `${s.slice(0, max)}\n…[truncated — ${n(s.length - max)} more chars]` : s);

export interface SiteCtx { agentId: string; surface: "chat" | "board"; sessionId?: string }

/** Mistari ya `SITE: …` kwenye maandishi ya agent (hadi 3, bila marudio). */
export function parseSiteLines(text: string): string[] {
  const out: string[] = [];
  for (const m of String(text || "").matchAll(/(?:^|\n)\s*\**SITE\**\s*:\s*([^\n]{2,120})/gi)) {
    const q = m[1].trim().replace(/[`*]+/g, "");
    if (/^none$/i.test(q)) continue;
    if (!out.some((x) => x.toLowerCase() === q.toLowerCase())) out.push(q);
    if (out.length >= 3) break;
  }
  return out;
}

async function sessions(): Promise<string> {
  const { listSessionMeta } = await import("@/lib/server/sessionIndex");
  const all = await listSessionMeta(100);
  if (!all.length) return "SESSIONS: none stored (or Appwrite not configured).";
  const by = (s: string) => all.filter((x) => x.state === s).length;
  const rows = all.slice(0, 8).map((s) => `- ${s.id} · "${s.title.slice(0, 70)}" · ${day(s.createdAt)} · ${s.state} · agenda ${s.agendaReached}/${s.agendaTotal} · locked ${s.locked}, open ${s.open} · ${n(s.tokens)} tokens`);
  return `SESSIONS (Board Room conversations): total ${all.length}${all.length >= 100 ? "+" : ""} · complete ${by("complete")} · stopped ${by("stopped")} · live ${by("live")}\nLatest 8:\n${rows.join("\n")}\n(Details: SITE: session <id>)`;
}

async function session(arg: string): Promise<string> {
  const { listSessionMeta } = await import("@/lib/server/sessionIndex");
  const all = await listSessionMeta(100);
  const s = !arg || /^latest$/i.test(arg) ? all[0] : all.find((x) => x.id === arg) || all.find((x) => x.title.toLowerCase().includes(arg.toLowerCase()));
  if (!s) return `SESSION "${arg}": not found. Use SITE: sessions for the list.`;
  const agents = s.agents.join(", ");
  return `SESSION ${s.id} · "${s.title}"\n- Project: ${s.project.slice(0, 400)}\n- ${day(s.createdAt)} · state ${s.state}${s.resumable ? " (resumable)" : ""} · ${Math.round(s.elapsedMs / 60000)} min · ${n(s.tokens)} tokens in ${n(s.requests)} calls\n- Agenda (${s.agendaReached}/${s.agendaTotal} reached; locked ${s.locked}, open ${s.open}):\n${s.agenda.map((a, i) => `  ${i + 1}. ${a.slice(0, 140)}`).join("\n") || "  (none)"}\n- Agents: ${agents || "—"} · messages ${s.messages} · web sources ${s.sources}`;
}

async function reports(): Promise<string> {
  const { listReportMeta } = await import("@/lib/server/sessionIndex");
  const all = await listReportMeta(100);
  if (!all.length) return "REPORTS: none stored (or Appwrite not configured).";
  return `REPORTS: total ${all.length}${all.length >= 100 ? "+" : ""}\nLatest 8:\n${all.slice(0, 8).map((r) => `- ${r.id} · "${r.title.slice(0, 80)}" · ${day(r.createdAt)} · ${n(r.content.length)} chars`).join("\n")}\n(Full text: SITE: report <id>)`;
}

async function report(arg: string): Promise<string> {
  const { listReportMeta } = await import("@/lib/server/sessionIndex");
  const all = await listReportMeta(100);
  const a = arg.toLowerCase();
  const r = !arg || a === "latest" ? all[0] : all.find((x) => x.id === arg) || all.find((x) => `${x.title} ${x.project}`.toLowerCase().includes(a));
  if (!r) return `REPORT "${arg}": not found. Use SITE: reports for the list.`;
  return `REPORT ${r.id} · "${r.title}" · ${day(r.createdAt)} · agents ${r.agents || "—"}\n${cut(r.content, 9000)}`;
}

function board(): string {
  const all = stateBus.all();
  const live = all.find((s) => s.status === "running");
  if (!all.length) return "BOARD ROOM: no Board has run on this server since it started. Nothing is running now. (Past ones: SITE: sessions)";
  const line = (s: (typeof all)[number]) =>
    `"${s.project.slice(0, 120)}" · ${s.status.toUpperCase()}${s.status === "running" ? ` · agenda ${s.agendaIndex}/${s.agendaTotal}${s.agendaItem ? ` (${s.agendaItem.slice(0, 90)})` : ""} · phase ${s.phase}` : ""} · locked ${s.locked.filter((l) => l.status === "LOCKED").length}${s.usage ? ` · ${n(s.usage.total)} tokens` : ""}${s.locked.length ? `\n${s.locked.slice(-6).map((l) => `   · A${l.index} ${l.status}: ${l.decision.replace(/\s+/g, " ").slice(0, 160)}`).join("\n")}` : ""}`;
  return `BOARD ROOM: ${live ? "a Board IS RUNNING now" : "nothing running now"}.\n${all.slice(0, 3).map((s) => `- ${line(s)}`).join("\n")}`;
}

async function chats(arg: string, ctx: SiteCtx): Promise<string> {
  const { chatStoreState, loadLatestThread, isChatAgent, CHAT_AGENTS } = await import("@/lib/server/agentChats");
  if (!chatStoreState().stored) return "CHATS: chat history is not stored in Appwrite right now (browser-only).";
  const want = arg.toLowerCase().trim();
  const list = (isChatAgent(want) ? [want] : [...CHAT_AGENTS]) as (typeof CHAT_AGENTS)[number][];
  const rows = await Promise.all(list.map(async (a) => {
    try {
      const r = await loadLatestThread(a, 200);
      const user = r.messages.filter((m) => m.role === "user").length;
      const last = r.messages[r.messages.length - 1];
      const head = `- ${a}: current thread ${r.messages.length} messages (Mkuu ${user}, agent ${r.messages.length - user})${last ? ` · last ${day(last.created_at || "")}` : ""}`;
      if (list.length > 1) return head;
      const tail = r.messages.slice(-6).map((m) => `   ${m.role === "user" ? "Mkuu" : a}: ${String(m.content || "").replace(/\s+/g, " ").slice(0, 220)}`).join("\n");
      return `${head}\n${tail}`;
    } catch { return `- ${a}: could not read`; }
  }));
  return `CHATS (private rooms; you are ${ctx.agentId}):\n${rows.join("\n")}`;
}

async function usage(ctx: SiteCtx): Promise<string> {
  const { resourcesBlock } = await import("../resources");
  return (await resourcesBlock({ surface: ctx.surface, agentId: ctx.agentId, sessionId: ctx.sessionId, full: false })).replace(/^=== .*? ===\n/, "USAGE (live):\n");
}

async function agents(): Promise<string> {
  const { ledger } = await import("@/lib/server/usageLedger");
  const { accountMeta } = await import("@/lib/usage/accounts");
  const routes = ledger().routes;
  const team: [string, string, string][] = [["pm", "Optimus", "Project Manager"], ["designer", "Ultron", "UI/UX Designer"], ["frontend", "Vextron", "Frontend Engineer"], ["backend", "Megatron", "Backend & DB Engineer"], ["qa", "Cybertron", "QA & DevOps"]];
  return `AGENTS:\n${team.map(([e, name, role]) => {
    const r = routes[e];
    return `- ${name} — ${role}${r ? ` · last call ${accountMeta(r.account).label} · ${r.model} · ${day(new Date(r.at).toISOString())}${r.ok ? "" : " (failed)"}` : " · no call recorded yet"}`;
  }).join("\n")}`;
}

/** Tekeleza topic moja. Kosa lolote → ujumbe wazi (agent asibuni data). */
export async function siteQuery(raw: string, ctx: SiteCtx): Promise<{ topic: string; text: string }> {
  const q = String(raw || "").trim();
  const [head, ...rest] = q.split(/\s+/);
  const topic = (head || "").toLowerCase().replace(/[^a-z]/g, "");
  const arg = rest.join(" ").trim();
  try {
    switch (topic) {
      case "guide": return { topic: `guide ${arg}`.trim(), text: guideText(arg) };
      case "sessions": case "conversations": return { topic: "sessions", text: await sessions() };
      case "session": case "conversation": return { topic: `session ${arg}`.trim(), text: await session(arg) };
      case "reports": return { topic: "reports", text: await reports() };
      case "report": return { topic: `report ${arg}`.trim(), text: await report(arg) };
      case "board": case "boardroom": return { topic: "board", text: board() };
      case "chats": case "chat": return { topic: `chats ${arg}`.trim(), text: await chats(arg, ctx) };
      case "usage": case "tokens": return { topic: "usage", text: await usage(ctx) };
      case "agents": case "team": return { topic: "agents", text: await agents() };
      default: return { topic: q, text: `SITE "${q}": unknown topic. ${SITE_INDEX}` };
    }
  } catch (err: any) {
    return { topic: q, text: `SITE "${q}": could not be read right now (${String(err?.message || err).slice(0, 120)}). Say so honestly — do not guess.` };
  }
}

/** Block ya prompt kwa matokeo ya SITE. */
export function siteBlock(results: { topic: string; text: string }[]): string {
  if (!results.length) return "";
  return `=== WEBSITE DATA (live, read just now for you) ===\n${results.map((r) => `[SITE: ${r.topic}]\n${r.text}`).join("\n\n")}`;
}
