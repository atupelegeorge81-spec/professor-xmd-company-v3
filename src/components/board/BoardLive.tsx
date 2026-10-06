"use client";
/* BoardLive — chanzo kimoja cha ukweli cha Board Room kwa app nzima (kiko kwenye layout).
 * Kinasoma NDJSON HALISI ya engine (/api/boardroom*), kinapitisha kila tukio kwenye adapter,
 * na kinaweka session hai hata ukihama ukurasa. Pia huonyesha session zilizohifadhiwa (replay). */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createBoardAdapter, savedToEvents, type AdapterEvent, type AdapterSnapshot, type BoardAdapter, type SavedItem } from "@/lib/board/adapter";
import { readUsageChip } from "@/lib/usageChip";
import { missingParts, readResumeState } from "@/lib/board/finale";
import { DEFAULT_TZ } from "@/lib/time";
import { AGENTS, getAgent, type AgentId } from "@/lib/team";
import { useApp, type UsageMap } from "../shell/AppState";
import { boardMarkdown } from "./exportMarkdown";
import { readBriefChip } from "@/lib/board/factSheet";

export type BoardMode = "idle" | "live" | "replay";
/** R16.1: "pausing" = Detach imetumwa · "paused" = engine imesimama KABISA (Resume inaendelea pale pale) */
export type Conn = "idle" | "connecting" | "streaming" | "pausing" | "paused" | "detached" | "closed" | "error";

interface Ctx {
  snap: AdapterSnapshot;
  mode: BoardMode;
  conn: Conn;
  runnerId: string | null;
  sessionId: string | null;
  prompt: string;
  /** ms za mjadala: msingi (resume/replay) + tangu kuanza */
  startedAt: number | null;
  elapsedBaseMs: number;
  error: string | null;
  start: (prompt: string) => Promise<void>;
  attach: (runnerId?: string) => Promise<boolean>;
  resume: (id: string) => Promise<void>;
  open: (sessionId: string) => Promise<void>;
  detach: () => void | Promise<void>;
  clear: () => void;
  exportMarkdown: () => void;
  /** R16.1: mjadala uliosimamishwa kwenye server (baada ya refresh / ukurasa mwingine) — kwa kitufe cha Resume */
  pausedInfo: PausedInfo | null;
  /** R20: session ya replay ambayo haijakamilika — kinachokosekana (kwa kitufe cha Endeleza); [] = imekamilika */
  unfinished: string[];
}

const BoardCtx = createContext<Ctx | null>(null);

const emptySnap = (): AdapterSnapshot => createBoardAdapter().snapshot();

interface ActiveInfo { id: string; status: string; project: string; sessionId: string | null; startedAt: number }
export interface PausedInfo { id: string; project: string; sessionId: string | null; pausedAt: number | null }

async function getBoardState(): Promise<{ active: ActiveInfo | null; paused: PausedInfo | null }> {
  try {
    const r = await fetch("/api/boardroom/active", { cache: "no-store" });
    const j = await r.json();
    return {
      active: j?.active?.status === "running" ? (j.active as ActiveInfo) : null,
      paused: j?.paused?.status === "paused" ? (j.paused as PausedInfo) : null,
    };
  } catch {
    return { active: null, paused: null };
  }
}
async function getActive(): Promise<ActiveInfo | null> {
  return (await getBoardState()).active;
}

export function BoardLiveProvider({ children }: { children: ReactNode }) {
  const app = useApp();
  const appRef = useRef(app);
  appRef.current = app;

  const adapter = useRef<BoardAdapter>(createBoardAdapter());
  const [snap, setSnap] = useState<AdapterSnapshot>(emptySnap);
  const [mode, setMode] = useState<BoardMode>("idle");
  const [conn, setConn] = useState<Conn>("idle");
  const [runnerId, setRunnerId] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [prompt, setPrompt] = useState("");
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsedBaseMs, setElapsedBaseMs] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const gen = useRef(0);
  const abortRef = useRef<AbortController | null>(null);
  const runnerRef = useRef<string | null>(null);
  const modeRef = useRef<BoardMode>("idle");
  const connRef = useRef<Conn>("idle");
  const agendaFetched = useRef(false);
  const ledgerTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const flushQueued = useRef(false);
  // R16.1 PAUSE/RESUME
  const pausingRef = useRef(false);        // Detach imetumwa: stream ikifungwa → "paused" (si "detached")
  const replayingRef = useRef(false);      // historia ya buffer inacheza (mpaka tukio "sync")
  const lastLogAt = useRef(0);             // logs zilizokwisha onekana hazirudiwi wakati wa Resume
  // R32.1: "New session" ilibonyezwa — auto-attach isirudishe mjadala wa zamani kabla user
  // hajaweka kazi yake mpya (start/open/resume zinauondoa suppress mara moja)
  const suppressAttachUntil = useRef(0);
  const lastStartAt = useRef(0);           // kinga ya double-click (ombi lileile < 1.5s)
  const lastStartText = useRef("");
  const [pausedInfo, setPausedInfo] = useState<PausedInfo | null>(null);
  const [unfinished, setUnfinished] = useState<string[]>([]);

  modeRef.current = mode;
  connRef.current = conn;

  /* ---------------- flush (mara moja kwa frame) ---------------- */
  const flush = useCallback(() => {
    flushQueued.current = false;
    const s = adapter.current.snapshot();
    setSnap(s);
    if (modeRef.current === "live" && (connRef.current === "streaming" || connRef.current === "connecting")) {
      appRef.current.setStatusMap(s.status);
      const u = {} as UsageMap;
      for (const a of AGENTS) u[a.id] = { requests: s.usage[a.id].requests, tokens: s.usage[a.id].tokens + s.liveByAgent[a.id] };
      appRef.current.setBoardUsage(u);
    }
  }, []);
  const scheduleFlush = useCallback(() => {
    if (flushQueued.current) return;
    flushQueued.current = true;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") setTimeout(flush, 250);
    else requestAnimationFrame(flush);
  }, [flush]);

  /* ---------------- metadata (agenda owners/requiresCode + ledger ids) ---------------- */
  const fetchAgenda = useCallback(async (id: string, g: number) => {
    agendaFetched.current = true;
    try {
      const j = await (await fetch(`/api/boardroom/agenda?id=${encodeURIComponent(id)}`, { cache: "no-store" })).json();
      if (g !== gen.current) return;
      if (j?.runnerId && !runnerRef.current) { runnerRef.current = j.runnerId; setRunnerId(j.runnerId); }
      if (Array.isArray(j?.agenda) && j.agenda.length) {
        adapter.current.apply({ type: "agenda_meta", agenda: j.agenda });
        scheduleFlush();
      } else agendaFetched.current = false;
    } catch {
      agendaFetched.current = false;
    }
  }, [scheduleFlush]);

  const fetchLedger = useCallback((g: number, delay = 1200) => {
    if (ledgerTimer.current) clearTimeout(ledgerTimer.current);
    ledgerTimer.current = setTimeout(async () => {
      const rid = runnerRef.current;
      if (!rid) return;
      try {
        const j = await (await fetch(`/api/ledger?runner=${encodeURIComponent(rid)}`, { cache: "no-store" })).json();
        if (g !== gen.current || !Array.isArray(j?.entries)) return;
        adapter.current.apply({ type: "ledger_meta", entries: j.entries });
        scheduleFlush();
      } catch {}
    }, delay);
  }, [scheduleFlush]);

  /* ---------------- tukio moja ---------------- */
  const handle = useCallback((e: AdapterEvent, g: number) => {
    if (g !== gen.current) return;
    if (e.type === "sync") {
      // R16.1: historia imekwisha chorwa papo hapo — kuanzia sasa ni live (animation kama kawaida)
      replayingRef.current = false;
      adapter.current.setInstant(false);
      scheduleFlush();
      return;
    }
    adapter.current.apply(e);
    const a = appRef.current;
    if (e.type === "log") {
      const at = e.entry.at || 0;
      if (replayingRef.current && at && at <= lastLogAt.current) return; // tayari iko kwenye Logs
      if (at > lastLogAt.current) lastLogAt.current = at;
      const tz = a.config?.timezone || DEFAULT_TZ;
      const time = e.entry.at ? new Date(e.entry.at).toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }) : e.entry.timestamp;
      a.addLog(e.entry.type, e.entry.message, time);
    }
    if (e.type === "system") {
      const t = e.text.trim();
      if (/^(📋 Agenda \(|Agenda \d+\/\d+:)/.test(t) && !agendaFetched.current && runnerRef.current) fetchAgenda(runnerRef.current, g);
      if (/^(🔒 LOCKED|🟠 OPEN|🔁 SUPERSEDED)/.test(t)) fetchLedger(g);
      if (/^💾 Conversation imeundwa/.test(t)) {
        getActive().then((act) => { if (g === gen.current && act?.sessionId) setSessionId(act.sessionId); });
        a.refresh("sessions");
      }
    }
    if (e.type === "error") a.addLog("error", e.message);
    if (e.type === "report") a.refresh("reports");
    if (e.type === "done") {
      setConn("closed");
      a.setBoardLive(false);
      a.resetStatus();
      fetchLedger(g, 300);
      // session imehifadhiwa → stats za leo zinaijumuisha; usage ya live inaondolewa BAADA ya stats mpya (isihesabiwe mara mbili)
      setTimeout(() => {
        a.refresh("all").then(() => {
          if (g === gen.current || modeRef.current !== "live") a.setBoardUsage(Object.fromEntries(AGENTS.map((x) => [x.id, { requests: 0, tokens: 0 }])) as UsageMap);
        });
      }, 800);
    }
    scheduleFlush();
  }, [fetchAgenda, fetchLedger, scheduleFlush]);

  /* ---------------- stream reader ---------------- */
  const consume = useCallback(async (res: Response, g: number, first?: (e: AdapterEvent) => Promise<void> | void) => {
    const rid = res.headers.get("X-Runner-Id");
    if (rid) { runnerRef.current = rid; setRunnerId(rid); }
    if (!res.body) throw new Error("Hakuna stream kutoka server");
    setConn("streaming");
    appRef.current.setBoardLive(true);
    const reader = res.body.getReader();
    const dec = new TextDecoder();
    let buf = "";
    let firstSeen = false;
    let sawDone = false;
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (g !== gen.current) { reader.cancel().catch(() => {}); return; }
      buf += dec.decode(value, { stream: true });
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let e: AdapterEvent;
        try { e = JSON.parse(line); } catch { continue; }
        if (!firstSeen) { firstSeen = true; if (first) await first(e); }
        if (e.type === "done") sawDone = true;
        handle(e, g);
      }
    }
    if (g === gen.current && !sawDone) {
      if (pausingRef.current) {
        // R16.1: Detach — server imesimamisha mjadala na kufunga stream
        pausingRef.current = false;
        setConn("paused");
      } else {
        // stream ilikatika bila `done` (mtandao/server) — engine huenda bado inaendelea
        setConn("detached");
      }
      appRef.current.setBoardLive(false);
      appRef.current.resetStatus();
      scheduleFlush();
    }
  }, [handle, scheduleFlush]);

  const fresh = useCallback((opts: { instant?: boolean; replay?: boolean } = {}) => {
    gen.current++;
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    // replay: historia ya buffer (Attach/Resume) inachorwa papo hapo mpaka tukio "sync"
    adapter.current = createBoardAdapter({ instant: opts.instant || opts.replay });
    agendaFetched.current = false;
    runnerRef.current = null;
    pausingRef.current = false;
    replayingRef.current = !!opts.replay;
    setRunnerId(null);
    setSessionId(null);
    setError(null);
    if (ledgerTimer.current) clearTimeout(ledgerTimer.current);
    return gen.current;
  }, []);

  const fail = useCallback((g: number, msg: string) => {
    if (g !== gen.current) return;
    setError(msg);
    setConn("error");
    adapter.current.apply({ type: "error", message: msg });
    appRef.current.setBoardLive(false);
    appRef.current.addLog("error", msg);
    scheduleFlush();
  }, [scheduleFlush]);

  /* ---------------- actions ---------------- */
  const attach = useCallback(async (id?: string) => {
    suppressAttachUntil.current = 0;
    const act = await getActive();
    const target = id || act?.id;
    if (!target) return false;
    const g = fresh({ replay: true });
    setMode("live");
    setConn("connecting");
    if (act?.project) { setPrompt(act.project); adapter.current.apply({ type: "user_prompt", text: act.project }); }
    if (act?.sessionId) setSessionId(act.sessionId);
    setStartedAt(act?.startedAt || Date.now());
    setElapsedBaseMs(0);
    scheduleFlush();
    try {
      const res = await fetch(`/api/boardroom/attach?id=${encodeURIComponent(target)}`, { cache: "no-store", signal: abortRef.current!.signal });
      if ((res.headers.get("content-type") || "").includes("application/json")) {
        if (g === gen.current) { setConn("closed"); setMode("idle"); }
        return false;
      }
      await consume(res, g, (e) => {
        // buffer ya engine hukatwa (>6000 matukio) — mwanzo ukikosekana, tunasema wazi
        const t = e.type === "system" ? e.text : "";
        if (!/^(🏛️|♻️)/.test(t) && e.type !== "title_done" && e.type !== "log" && e.type !== "sync") {
          adapter.current.apply({ type: "system", text: "ℹ️ Mwanzo wa mjadala huu haupo tena kwenye buffer ya server — historia kamili iko kwenye Sessions." });
        }
      });
      return true;
    } catch (err: any) {
      if (err?.name !== "AbortError") fail(g, `Attach imeshindwa: ${err?.message || err}`);
      return false;
    }
  }, [consume, fail, fresh, scheduleFlush]);

  const start = useCallback(async (text: string) => {
    const project = text.trim();
    if (!project) return;
    // kinga ya double-click: ombi LILEILE ndani ya 1.5s limerudiwa — subiri (re-click ya makusudi
    // baada ya muda / maandishi tofauti haina mgomo: hiyo ni session mpya kwa makusudi)
    const nowMs = Date.now();
    if (nowMs - lastStartAt.current < 1500 && lastStartText.current === project) return;
    lastStartAt.current = nowMs;
    lastStartText.current = project;
    // R32.1 (agizo la CEO 06-10): kazi mpya = session MPYA daima. Mjadala unaoendelea server
    // unapuuzwa (paused — unaendelea nayo kutoka Sessions); UI inaonyesha KAZI HII ikienda live.
    modeRef.current = "live"; // kinga ya race: auto-attach isirudishe kwenye mjadala wa zamani
    suppressAttachUntil.current = 0;
    const g = fresh();
    setMode("live");
    setConn("connecting");
    setPrompt(project);
    setStartedAt(Date.now());
    setElapsedBaseMs(0);
    appRef.current.setBoardUsage(Object.fromEntries(AGENTS.map((a) => [a.id, { requests: 0, tokens: 0 }])) as UsageMap);
    adapter.current.apply({ type: "user_prompt", text: project });
    appRef.current.addLog("system", "🏛️ Board Room imeitishwa");
    scheduleFlush();
    try {
      const res = await fetch("/api/boardroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project, force: true }),
        signal: abortRef.current!.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        return fail(g, j?.error || `Server imejibu ${res.status}`);
      }
      await consume(res, g);
    } catch (err: any) {
      if (err?.name !== "AbortError") fail(g, `Stream imekatika: ${err?.message || err}`);
    }
  }, [consume, fail, fresh, scheduleFlush]);

  const replayInto = useCallback(async (id: string, g: number): Promise<{ status: string; project: string } | null> => {
    const j = await (await fetch(`/api/conversations?id=${encodeURIComponent(id)}`, { cache: "no-store" })).json().catch(() => null);
    const c = j?.conversation;
    if (!c || g !== gen.current) return null;
    const items: SavedItem[] = c.items || [];
    const u = readUsageChip(items);
    adapter.current.setInstant(true);
    for (const e of savedToEvents(items, c.project || "")) adapter.current.apply(e);
    if (u) {
      for (const [eid, row] of Object.entries(u.usage)) adapter.current.apply({ type: "usage", agentId: eid, requests: row.requests, tokens: row.tokens });
      if (u.byProvider) adapter.current.apply({ type: "usage_provider", byProvider: u.byProvider });
      // R26: muda wa session iliyoendelezwa = muda uliohifadhiwa + muda wa sasa (si wa tangu ukurasa ulipofunguliwa tu)
      adapter.current.setBaseSeconds(u.elapsedMs / 1000);
      if (c.status === "completed") {
        const total = Object.values(u.usage).reduce((a, r) => ({ requests: a.requests + r.requests, tokens: a.tokens + r.tokens }), { requests: 0, tokens: 0 });
        adapter.current.apply({ type: "summary", usage: { ...u.usage, total } });
      }
      setElapsedBaseMs(u.elapsedMs);
    }
    adapter.current.setInstant(false);
    setPrompt(readBriefChip(items) || c.project || ""); // R26 (A1): brief kamili (project ina herufi 500 tu)
    // R20: finale/mjadala uliokatika → orodha ya kinachokosekana (Endeleza)
    const rs = readResumeState(items);
    setUnfinished(rs ? missingParts({ status: String(c.status || ""), items, agendaTotal: rs.agendaTotal, done: rs.done, finale: rs.finale }) : []);
    return { status: c.status, project: c.project || "" };
  }, []);

  const open = useCallback(async (id: string) => {
    suppressAttachUntil.current = 0;
    const act = await getActive();
    if (act && act.sessionId === id) { await attach(act.id); return; }
    const g = fresh({ instant: true });
    setMode("replay");
    setConn("connecting");
    setStartedAt(null);
    setSessionId(id);
    scheduleFlush();
    const c = await replayInto(id, g);
    if (g !== gen.current) return;
    if (!c) return fail(g, "Session haikupatikana (Appwrite).");
    adapter.current.finalize();
    setConn("closed");
    // runner id (kwa ledger) + agenda meta kutoka resume state
    await fetchAgenda(id, g);
    fetchLedger(g, 0);
    scheduleFlush();
  }, [attach, fail, fetchAgenda, fetchLedger, fresh, replayInto, scheduleFlush]);

  const resume = useCallback(async (id: string) => {
    suppressAttachUntil.current = 0;
    const g = fresh({ replay: true });
    setMode("live");
    setConn("connecting");
    setSessionId(id);
    setPausedInfo(null);
    setUnfinished([]);
    scheduleFlush();
    try {
      const res = await fetch("/api/boardroom/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
        signal: abortRef.current!.signal,
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        // onyesha historia hata kama haiwezi kuendelea
        replayingRef.current = false;
        await replayInto(id, g);
        return fail(g, j?.error || `Resume imeshindwa (${res.status})`);
      }
      const st = await getActive();
      setStartedAt(st?.startedAt || Date.now());
      if (st?.sessionId) setSessionId(st.sessionId);
      if (st?.project) { setPrompt(st.project); adapter.current.apply({ type: "user_prompt", text: st.project }); }
      // R18: njia zote mbili (memory na Appwrite baada ya server kuanza upya) — buffer ya server ina historia YOTE
      // (prompt, title, chips, ujumbe, usage) kabla ya "sync", kwa hiyo hakuna replay ya pili hapa (ingerudia historia).
      await consume(res, g);
    } catch (err: any) {
      if (err?.name !== "AbortError") fail(g, `Resume imeshindwa: ${err?.message || err}`);
    }
  }, [consume, fail, fresh, replayInto, scheduleFlush]);

  /**
   * R16.1 — Detach = SIMAMISHA KABISA. Server inakata zamu inayoendelea na kusimamisha engine (hakuna agent
   * anayeendelea background); stream inafungwa na server baada ya chip ya ⏸️. Resume inaendelea pale pale.
   */
  const detach = useCallback(async () => {
    const id = runnerRef.current;
    const finish = () => {
      appRef.current.setBoardLive(false);
      appRef.current.resetStatus();
      appRef.current.addLog("warning", "⏸️ Mjadala umesimamishwa — bonyeza Resume kuendelea pale pale ulipoishia");
      scheduleFlush();
    };
    if (!id) {
      gen.current++;
      abortRef.current?.abort();
      setConn("paused");
      finish();
      return;
    }
    pausingRef.current = true;
    setConn("pausing");
    const g = gen.current;
    try {
      const r = await fetch("/api/boardroom/pause", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!r.ok) throw new Error(`pause ${r.status}`);
      finish();
      // kinga: stream isipofungwa na server ndani ya 4s → ifunge hapa
      setTimeout(() => {
        if (g === gen.current && pausingRef.current) {
          pausingRef.current = false;
          gen.current++;
          abortRef.current?.abort();
          setConn("paused");
          scheduleFlush();
        }
      }, 4000);
    } catch {
      pausingRef.current = false;
      if (g === gen.current) {
        setConn(connRef.current === "pausing" ? "streaming" : connRef.current);
        appRef.current.addLog("error", "Detach imeshindwa kufika kwenye server — mjadala bado unaendelea. Jaribu tena.");
      }
    }
  }, [scheduleFlush]);

  const clear = useCallback(() => {
    fresh();
    // R32.1: hii ni "New session" ya makusudi — auto-attach isirudishe mjadala wa zamani
    // ndani ya dakika 10 kabla user hajaweka kazi mpya (draft yake isipotee kwenye composer)
    suppressAttachUntil.current = Date.now() + 10 * 60_000;
    setMode("idle");
    setConn("idle");
    setPrompt("");
    setStartedAt(null);
    setElapsedBaseMs(0);
    appRef.current.setBoardLive(false);
    appRef.current.resetStatus();
    setSnap(adapter.current.snapshot());
  }, [fresh]);

  /* ---------------- export (kipengele cha zamani: window.__xmdExportConversation) ---------------- */
  const exportMarkdown = useCallback(() => {
    const s = adapter.current.snapshot();
    const md = boardMarkdown(s.title, prompt, s.items);
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(s.title || "board-room").replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "board-room"}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }, [prompt]);

  useEffect(() => {
    (window as any).__xmdExportConversation = exportMarkdown;
    return () => { delete (window as any).__xmdExportConversation; };
  }, [exportMarkdown]);

  /* ---------------- auto-attach: mjadala unaoendelea kwenye server unaonekana popote ---------------- */
  useEffect(() => {
    let stop = false;
    const check = async () => {
      if (stop) return;
      // R32.1: user amebonyeza "New session" — mjadala wa zamani haigwi kwake kwa nguvu;
      // ataweka kazi mpya (start force) au kufungua session yake mwenyewe (open/resume)
      if (Date.now() < suppressAttachUntil.current) return;
      const { active: act, paused } = await getBoardState();
      if (stop) return;
      // R16.1: mjadala uliosimamishwa HAUJIUNGANISHI wenyewe — unaonyeshwa kwa kitufe cha Resume
      setPausedInfo(paused);
      if (modeRef.current !== "idle") return;
      if (act) attach(act.id);
    };
    check();
    const t = setInterval(check, 20_000);
    return () => { stop = true; clearInterval(t); };
  }, [attach]);

  useEffect(() => () => { abortRef.current?.abort(); }, []);

  const value = useMemo<Ctx>(() => ({
    snap, mode, conn, runnerId, sessionId, prompt, startedAt, elapsedBaseMs, error,
    start, attach, resume, open, detach, clear, exportMarkdown, pausedInfo, unfinished,
  }), [snap, mode, conn, runnerId, sessionId, prompt, startedAt, elapsedBaseMs, error, start, attach, resume, open, detach, clear, exportMarkdown, pausedInfo, unfinished]);

  return <BoardCtx.Provider value={value}>{children}</BoardCtx.Provider>;
}

export function useBoardLive() {
  const c = useContext(BoardCtx);
  if (!c) throw new Error("useBoardLive outside BoardLiveProvider");
  return c;
}
