"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENTS, toUiAgent, type AgentId } from "@/lib/team";
import type { LogEntry, ReportMeta, SessionMeta } from "@/lib/ui-types";
import { DEFAULT_TZ, dayKeyOf } from "@/lib/time";

export type AgentStatus = "online" | "thinking" | "speaking" | "idle";
type UsageRow = { requests: number; tokens: number };
export type UsageMap = Record<AgentId, UsageRow>;

export interface Stats {
  timezone: string;
  today: string;
  totals: {
    sessions: number; complete: number; live: number; stopped: number; locked: number; open: number;
    reports: number; sources: number; tokens: number; tokensToday: number; sessionsToday: number; reportsToday: number;
  };
  perAgent: Record<string, UsageRow>;
  perAgentToday: Record<string, UsageRow>;
  perAgentActivity: Record<string, { sessions: number; messages: number; sources: number }>;
  /** Tokens za agent chat za leo kutoka Appwrite (key = UI id). null → chat haziko Appwrite (hesabu ya kivinjari inatumika). */
  chatToday?: Record<string, UsageRow> | null;
  liveSessionId: string | null;
  days: { day: string; sessions: number; tokens: number; locked: number }[];
}
export interface XkiroUsage {
  configured: boolean;
  accounts: { account: number; label: string; ok: boolean; plan?: string | null; usedToday?: number; limitPerDay?: number; remaining?: number; error?: string }[];
  usedToday: number; limitPerDay: number; remaining: number; fetchedAt: string;
}
export interface AppConfig {
  timezone: string;
  appwrite: boolean;
  searxng: "custom" | "default";
  primaryModel: string;
  lanes: { id: string; account: string; provider: string; label: string; model: string }[];
  agents: { id: string; name: string; role: string; model: string }[];
}

interface Ctx {
  activityOpen: boolean;
  setActivityOpen: (v: boolean) => void;
  mobileNavOpen: boolean;
  setMobileNavOpen: (v: boolean) => void;
  logs: LogEntry[];
  addLog: (type: LogEntry["type"], message: string, time?: string) => void;
  clearLogs: () => void;
  status: Record<AgentId, AgentStatus>;
  setStatus: (id: AgentId, s: AgentStatus) => void;
  setStatusMap: (m: Record<AgentId, AgentStatus>) => void;
  resetStatus: () => void;
  boardLive: boolean;
  setBoardLive: (v: boolean) => void;
  /** Usage ya LEO kwa agent: sessions za leo (Appwrite) + session hai (stream) + chats za agent. */
  usage: UsageMap;
  setBoardUsage: (u: UsageMap) => void;
  bumpUsage: (id: AgentId, tokens: number, requests?: number) => void;
  stats: Stats | null;
  xkiro: XkiroUsage | null;
  config: AppConfig | null;
  sessions: SessionMeta[] | null;
  reports: ReportMeta[] | null;
  refresh: (what?: "all" | "sessions" | "reports" | "stats") => Promise<void>;
  modelOf: (id: AgentId) => string;
}

const AppCtx = createContext<Ctx | null>(null);

const ALL_ONLINE: Record<AgentId, AgentStatus> = { optimus: "online", ultron: "online", vextron: "online", megatron: "online", cybertron: "online" };
const zeroUsage = (): UsageMap => Object.fromEntries(AGENTS.map((a) => [a.id, { requests: 0, tokens: 0 }])) as UsageMap;

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export function AppStateProvider({ children }: { children: ReactNode }) {
  const [activityOpen, setActivityOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [status, setStatusState] = useState(ALL_ONLINE);
  const [boardLive, setBoardLive] = useState(false);
  const [boardUsage, setBoardUsage] = useState<UsageMap>(zeroUsage);
  const [chatUsage, setChatUsage] = useState<UsageMap>(zeroUsage);
  const [stats, setStats] = useState<Stats | null>(null);
  const [xkiro, setXkiro] = useState<XkiroUsage | null>(null);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [sessions, setSessions] = useState<SessionMeta[] | null>(null);
  const [reports, setReports] = useState<ReportMeta[] | null>(null);
  const logSeq = useRef(0);
  const tzRef = useRef(DEFAULT_TZ);
  tzRef.current = config?.timezone || DEFAULT_TZ;

  const addLog = useCallback((type: LogEntry["type"], message: string, time?: string) => {
    setLogs((l) => [...l.slice(-299), { id: `${Date.now().toString(36)}-${logSeq.current++}`, time: time || new Date().toLocaleTimeString("en-GB", { timeZone: tzRef.current, hour12: false }), type, message }]);
  }, []);
  const setStatus = useCallback((id: AgentId, s: AgentStatus) => setStatusState((m) => (m[id] === s ? m : { ...m, [id]: s })), []);
  const setStatusMap = useCallback((m: Record<AgentId, AgentStatus>) => setStatusState((cur) => (AGENTS.every((a) => cur[a.id] === m[a.id]) ? cur : m)), []);
  const resetStatus = useCallback(() => setStatusState(ALL_ONLINE), []);
  const bumpUsage = useCallback(
    (id: AgentId, tokens: number, requests = 1) => setChatUsage((u) => ({ ...u, [id]: { requests: u[id].requests + requests, tokens: u[id].tokens + tokens } })),
    [],
  );
  // usage ya chats za agents haipo Appwrite → inahifadhiwa kwenye kivinjari kwa siku (inaanza upya kesho)
  const chatKey = `xmd:chatUsage:${dayKeyOf(new Date(), config?.timezone || DEFAULT_TZ)}`;
  const chatLoaded = useRef<string | null>(null);
  useEffect(() => {
    if (chatLoaded.current === chatKey) return;
    chatLoaded.current = chatKey;
    try {
      const raw = localStorage.getItem(chatKey);
      setChatUsage(raw ? { ...zeroUsage(), ...JSON.parse(raw) } : zeroUsage());
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k?.startsWith("xmd:chatUsage:") && k !== chatKey) localStorage.removeItem(k);
      }
    } catch {}
  }, [chatKey]);
  useEffect(() => {
    if (chatLoaded.current !== chatKey) return;
    try { localStorage.setItem(chatKey, JSON.stringify(chatUsage)); } catch {}
  }, [chatUsage, chatKey]);

  const refresh = useCallback(async (what: "all" | "sessions" | "reports" | "stats" = "all") => {
    const jobs: Promise<unknown>[] = [];
    if (what === "all" || what === "stats") jobs.push(getJson<Stats>("/api/stats").then((s) => {
      if (!s) return;
      setStats(s);
      // chat zimehifadhiwa Appwrite → stats tayari zinajumuisha tokens zake; hesabu ya kivinjari isiongezwe tena
      if (s.chatToday) setChatUsage((u) => (AGENTS.every((a) => !u[a.id].tokens && !u[a.id].requests) ? u : zeroUsage()));
    }));
    if (what === "all" || what === "sessions") jobs.push(getJson<{ sessions: SessionMeta[] }>("/api/board/sessions").then((s) => setSessions(s?.sessions ?? [])));
    if (what === "all" || what === "reports")
      jobs.push(getJson<{ reports: { id: string; title: string; project: string; agents: string; content: string; created_at: string }[] }>("/api/reports").then((r) =>
        setReports((r?.reports ?? []).map((x) => ({ id: x.id, title: x.title, project: x.project, agents: x.agents, content: x.content, createdAt: x.created_at }))),
      ));
    await Promise.all(jobs);
  }, []);

  // data halisi: mara ya kwanza + kila dakika (tarehe/usage ya leo haibaki ya zamani)
  useEffect(() => {
    refresh("all");
    getJson<AppConfig>("/api/config").then((c) => c && setConfig(c));
    const loadX = () => getJson<XkiroUsage>("/api/usage/xkiro").then((x) => x && setXkiro(x));
    loadX();
    const t1 = setInterval(() => refresh("all"), 60_000);
    const t2 = setInterval(loadX, 60_000);
    const onVis = () => { if (document.visibilityState === "visible") { refresh("all"); loadX(); } };
    document.addEventListener("visibilitychange", onVis);
    return () => { clearInterval(t1); clearInterval(t2); document.removeEventListener("visibilitychange", onVis); };
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setActivityOpen(false);
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const usage = useMemo(() => {
    const out = zeroUsage();
    for (const [eid, u] of Object.entries(stats?.perAgentToday || {})) {
      const id = toUiAgent(eid);
      out[id] = { requests: out[id].requests + u.requests, tokens: out[id].tokens + u.tokens };
    }
    for (const [uid, u] of Object.entries(stats?.chatToday || {})) {
      const id = uid as AgentId;
      if (out[id]) out[id] = { requests: out[id].requests + u.requests, tokens: out[id].tokens + u.tokens };
    }
    for (const a of AGENTS) {
      out[a.id] = {
        requests: out[a.id].requests + boardUsage[a.id].requests + chatUsage[a.id].requests,
        tokens: out[a.id].tokens + boardUsage[a.id].tokens + chatUsage[a.id].tokens,
      };
    }
    return out;
  }, [stats, boardUsage, chatUsage]);

  const modelOf = useCallback((id: AgentId) => {
    const a = AGENTS.find((x) => x.id === id);
    return config?.agents.find((x) => x.id === a?.engineId)?.model || config?.primaryModel || "";
  }, [config]);

  const clearLogs = useCallback(() => setLogs([]), []);

  // logs zibaki ukiburudisha tab (sessionStorage — tab hii tu)
  const logsLoaded = useRef(false);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("xmd:logs");
      if (raw) setLogs((cur) => (cur.length ? cur : (JSON.parse(raw) as LogEntry[])));
    } catch {}
    logsLoaded.current = true;
  }, []);
  useEffect(() => {
    if (!logsLoaded.current) return;
    const t = setTimeout(() => { try { sessionStorage.setItem("xmd:logs", JSON.stringify(logs.slice(-300))); } catch {} }, 400);
    return () => clearTimeout(t);
  }, [logs]);

  const value = useMemo(
    () => ({
      activityOpen, setActivityOpen, mobileNavOpen, setMobileNavOpen,
      logs, addLog, clearLogs, status, setStatus, setStatusMap, resetStatus, boardLive, setBoardLive,
      usage, setBoardUsage, bumpUsage, stats, xkiro, config, sessions, reports, refresh, modelOf,
    }),
    [activityOpen, mobileNavOpen, logs, addLog, clearLogs, status, setStatus, setStatusMap, resetStatus, boardLive, usage, bumpUsage, stats, xkiro, config, sessions, reports, refresh, modelOf],
  );
  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>;
}

export function useApp() {
  const c = useContext(AppCtx);
  if (!c) throw new Error("useApp outside provider");
  return c;
}
