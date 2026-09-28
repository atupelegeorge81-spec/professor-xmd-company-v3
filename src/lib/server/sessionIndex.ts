// src/lib/server/sessionIndex.ts
// Hugeuza sessions zilizohifadhiwa Appwrite kuwa muhtasari halisi (tokens, agenda, maamuzi,
// muda, agents, sources) kwa Sessions page, Overview na Sidebar. Hakuna data ya mfano.

import { Query } from "node-appwrite";
import { unpack } from "./packed";
import { activeRunner, pausedRunners } from "../boardRunner";
import { readUsageChip, RESUME_PREFIX, type UsageMap } from "../usageChip";
import { missingParts, readResumeState } from "../board/finale";
import { appwriteConfigured, databases, DB, SESSIONS_COL, REPORTS_COL } from "./appwrite";

export type SessionState = "complete" | "live" | "stopped";

export interface SessionMeta {
  id: string;
  title: string;
  project: string;
  state: SessionState;
  rawStatus: string;
  createdAt: string;
  tokens: number;
  requests: number;
  usage: UsageMap;
  elapsedMs: number;
  agendaTotal: number;
  agendaReached: number;
  agenda: string[];
  locked: number;
  open: number;
  agents: string[]; // engine ids (pm, designer, ...)
  /** idadi ya michango (messages zenye maudhui) kwa kila agent */
  agentMessages: Record<string, number>;
  /** sources za web kwa kila agent */
  agentSources: Record<string, number>;
  sources: number;
  messages: number;
  resumable: boolean;
  /** R20: kinachokosekana ili mjadala ukamilike (finale iliyokatika) — [] kama imekamilika */
  missing: string[];
}

export interface ReportMeta {
  id: string;
  title: string;
  project: string;
  agents: string;
  content: string;
  createdAt: string;
}

function parseItems(raw: unknown): any[] {
  if (Array.isArray(raw)) return raw;
  try {
    const v = JSON.parse(unpack(raw) || "[]"); // R18: items zinaweza kuwa zimebanwa (gz1:)
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function metaFromItems(doc: { id: string; title?: string; project?: string; status?: string; created_at?: string; $createdAt?: string }, items: any[]): SessionMeta {
  const live = activeRunner();
  const chips: string[] = items.filter((i) => i?.kind === "chip" && typeof i.text === "string").map((i) => i.text);
  const msgs = items.filter((i) => i?.kind === "msg");
  const rounds = items.filter((i) => i?.kind === "round");
  const usageChip = readUsageChip(items);
  const usage = usageChip?.usage || {};
  let tokens = 0;
  let requests = 0;
  for (const u of Object.values(usage)) {
    tokens += u.tokens;
    requests += u.requests;
  }

  let agenda: string[] = [];
  const resume = chips.find((t) => t.startsWith(RESUME_PREFIX));
  if (resume) {
    try {
      agenda = (JSON.parse(resume.slice(RESUME_PREFIX.length)).agenda || []).map((a: any) => String(a?.item || ""));
    } catch {}
  }
  if (!agenda.length) {
    const agChip = chips.find((t) => /^📋 Agenda \(\d+/.test(t));
    if (agChip) agenda = agChip.replace(/^📋 Agenda \(\d+ vipengele\):\s*/, "").split(" · ").filter(Boolean);
  }

  const rawStatus = String(doc.status || "in_progress");
  const isLive = !!live && live.status === "running" && live.sessionId === doc.id;
  const state: SessionState = isLive ? "live" : rawStatus === "completed" ? "complete" : "stopped";
  // agenda iliyofikiwa: chip ya engine " Agenda i/N: …" (chanzo cha uhakika), round kama akiba
  const reached = Math.max(
    chips.reduce((m, t) => { const x = t.match(/^\s*Agenda (\d+)\/(\d+):/); return x ? Math.max(m, Number(x[1])) : m; }, 0),
    rounds.reduce((m, r) => Math.max(m, Number(r.round ?? r.n ?? r.index) || 0), 0),
  );

  return {
    id: doc.id,
    title: String(doc.title || items.find((i) => i?.kind === "title")?.text || "Untitled"),
    project: String(doc.project || ""),
    state,
    rawStatus,
    createdAt: String(doc.created_at || doc.$createdAt || ""),
    tokens,
    requests,
    usage,
    elapsedMs: usageChip?.elapsedMs || 0,
    agendaTotal: agenda.length || (rounds[0]?.total ?? 0),
    agendaReached: reached,
    agenda,
    locked: chips.filter((t) => t.startsWith("🔒 LOCKED:")).length,
    open: chips.filter((t) => t.startsWith("🟠 OPEN:")).length,
    agents: Array.from(new Set(msgs.map((m) => String(m.agentId || "")).filter(Boolean))),
    agentMessages: msgs.reduce((acc: Record<string, number>, m) => {
      const id = String(m.agentId || "");
      if (id && String(m.content || "").trim()) acc[id] = (acc[id] || 0) + 1;
      return acc;
    }, {}),
    agentSources: msgs.reduce((acc: Record<string, number>, m) => {
      const id = String(m.agentId || "");
      if (id && Array.isArray(m.sources) && m.sources.length) acc[id] = (acc[id] || 0) + m.sources.length;
      return acc;
    }, {}),
    sources: msgs.reduce((n, m) => n + (Array.isArray(m.sources) ? m.sources.length : 0), 0),
    messages: msgs.length,
    // R16.1: iliyosimamishwa kwa Detach (iko hai kwenye memory) inaendelea pale pale hata kabla ya agenda kuhifadhiwa
    resumable: state === "stopped" && (!!resume || pausedRunners().some((r) => r.sessionId === doc.id)),
    missing: (() => {
      if (state !== "stopped") return [];
      const rs = readResumeState(items);
      return rs ? missingParts({ status: rawStatus, items, agendaTotal: rs.agendaTotal, done: rs.done, finale: rs.finale }) : [];
    })(),
  };
}

export async function listSessionMeta(limit = 100): Promise<SessionMeta[]> {
  if (!appwriteConfigured) return [];
  try {
    const res = await databases.listDocuments(DB, SESSIONS_COL, [Query.limit(limit), Query.orderDesc("$createdAt")]);
    return res.documents.map((d: any) => metaFromItems({ ...d, id: d.$id }, parseItems(d.items)));
  } catch (e) {
    console.error("❌ sessionIndex:", e);
    return [];
  }
}

export async function listReportMeta(limit = 100): Promise<ReportMeta[]> {
  if (!appwriteConfigured) return [];
  try {
    const res = await databases.listDocuments(DB, REPORTS_COL, [Query.limit(limit), Query.orderDesc("$createdAt")]);
    return res.documents.map((d: any) => ({
      id: d.$id,
      title: String(d.title || "Ripoti"),
      project: String(d.project || ""),
      agents: String(d.agents || ""),
      content: unpack(d.content),
      createdAt: String(d.created_at || d.$createdAt || ""),
    }));
  } catch (e) {
    console.error("❌ reportIndex:", e);
    return [];
  }
}

/** YYYY-MM-DD katika timezone ya app (default Africa/Dar_es_Salaam). */
export function dayKey(d: Date | string, tz = appTimezone()): string {
  const date = typeof d === "string" ? new Date(d) : d;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
}

export function appTimezone(): string {
  const tz = process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dar_es_Salaam";
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz;
  } catch {
    return "Africa/Dar_es_Salaam";
  }
}
