import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { AGENTS, getAgent } from "@/lib/agents";
import type { BoardEvent, LogEntry, SearchResult } from "@/lib/types";
import { readNdjson } from "@/lib/stream";
import { Avatar } from "./Avatar";
import { Markdown } from "./Markdown";

const nid = () => Math.random().toString(36).slice(2, 10);

// Board status badge: timing (ms) na default height (px, kabla ya
// kupimwa kikamilifu na ResizeObserver).
const BADGE_SCROLL_IDLE_MS = 1300;
const BADGE_SETTLE_MS = 550;
const BADGE_DEFAULT_HEIGHT = 84;
const BADGE_COLLAPSE_MS = 520;
const BADGE_EXPAND_MS = 560;

type Item =
  | { kind: "msg"; id: string; agentId: string; content: string; thinking: string; query?: string; sources: SearchResult[]; searches: { query: string; sources: SearchResult[] }[]; done: boolean; failed?: boolean; error?: string; corrected?: boolean }
  | { kind: "system"; id: string; text: string }
  | { kind: "round"; id: string; round: number; total: number }
  | { kind: "report"; id: string; title: string; content: string };

type Phase = "idle" | "running" | "done" | "error";

export type ConvSignal = { kind: "open"; id: string; n: number } | { kind: "new"; n: number } | null;

interface Props {
  addLog: (type: LogEntry["type"], message: string) => void;
  setUsage: (u: Record<string, { requests: number; tokens: number }>) => void;
  onReport: () => void;
  convSignal: ConvSignal;
}


export function BoardRoom({ addLog, setUsage, onReport, convSignal }: Props) {
  const [items, setItems] = useState<Item[]>([]);
  const [phase, setPhase] = useState<Phase>("idle");
  const [title, setTitle] = useState("");

  // Export full conversation text for Logs "copy conversation" button (no thinking).
  useEffect(() => {
    const exportConversation = () => {
      const lines: string[] = [];
      if (title) lines.push(`# ${title}`, "");
      for (const it of items) {
        if (it.kind === "system") {
          lines.push(`[system] ${it.text}`, "");
          continue;
        }
        if (it.kind === "round") {
          lines.push(`--- Round ${it.round} / ${it.total} ---`, "");
          continue;
        }
        if (it.kind === "report") {
          lines.push(`[report] ${it.title}`, it.content || "", "");
          continue;
        }
        if (it.kind === "msg") {
          const agent = getAgent(it.agentId);
          const name = agent?.name ?? it.agentId;
          const role = agent?.role ?? "";
          lines.push(`${name}${role ? ` (${role})` : ""}`);
          if (it.query) lines.push(`Search: ${it.query}`);
          if (it.content) lines.push(it.content);
          if (it.sources?.length) {
            lines.push("Sources:");
            for (const s of it.sources) {
              lines.push(`- ${s.title || s.url} (${s.url})`);
            }
          }
          if (it.failed && it.error) lines.push(`Error: ${it.error}`);
          lines.push("");
        }
      }
      return lines.join("\n").trim();
    };

    (window as unknown as { __xmdExportConversation?: () => string }).__xmdExportConversation =
      exportConversation;

    return () => {
      const w = window as unknown as { __xmdExportConversation?: () => string };
      if (w.__xmdExportConversation === exportConversation) {
        delete w.__xmdExportConversation;
      }
    };
  }, [items, title]);

  const [titleLive, setTitleLive] = useState("");
  const [prompt, setPrompt] = useState("");
  const [round, setRound] = useState<{ round: number; total: number } | null>(null);
  const [activeAgents, setActiveAgents] = useState<Set<string>>(new Set());
  const [runId, setRunId] = useState<string | null>(null);
  const [conversationStatus, setConversationStatus] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const handledConv = useRef(0);
  const completedTurnIdsRef = useRef<Set<string>>(new Set());
  const [, forceTurnUpdate] = useState(0);
  const [loadedAsHistory, setLoadedAsHistory] = useState(false);
  const handleTurnComplete = useCallback((id: string) => {
    if (completedTurnIdsRef.current.has(id)) return;
    completedTurnIdsRef.current.add(id);
    forceTurnUpdate((n) => n + 1);
  }, []);

  // Board status badge: imefungwa (hidden) wakati wa "running" bila
  // uhuru wa kuonekana tena. Baada ya conversation kuisha, scroll
  // ndio inayoiamuru: movement -> jificha, idle -> onekana.
  const [badgeHidden, setBadgeHidden] = useState(false);
  const badgeIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const badgeCardRef = useRef<HTMLDivElement | null>(null);
  const badgeWrapperRef = useRef<HTMLDivElement | null>(null);
  const badgeNaturalHeightRef = useRef(BADGE_DEFAULT_HEIGHT);
  const badgeCurrentHeightRef = useRef(BADGE_DEFAULT_HEIGHT);
  const badgeAnimRef = useRef<number | null>(null);

  const handleScroll = useCallback(() => {
    // FIX: badge inaonekana tu wakati hamna conversation
    return;
  }, []);

  useEffect(() => {
    // FIX: badge ionekane TU wakati hamna conversation
    const shouldShow = items.length === 0 && phase === "idle";
    setBadgeHidden(!shouldShow);
    if (badgeIdleTimerRef.current) {
      clearTimeout(badgeIdleTimerRef.current);
      badgeIdleTimerRef.current = null;
    }
  }, [phase, items.length]);

  // Pima urefu halisi wa badge (avatar + maandishi) ili nafasi
  // iliyohifadhiwa (spacer) ILINGANE kabisa na badge halisi -- hivyo
  // background image / stream HAITASHIFT KAMWE, iwe badge inaonekana
  // au imefichwa.
  // Pima urefu halisi wa badge kila mara unavyobadilika (title/round
  // zikibadilika mistari), ili target ya "expand" iwe sahihi.
  useLayoutEffect(() => {
    const el = badgeCardRef.current;
    const wrapper = badgeWrapperRef.current;
    if (!el || !wrapper) return;

    const measure = () => {
      // +12 = mt-3 margin ya badge card (haihesabiwi na offsetHeight).
      const natural = el.offsetHeight + 12;
      badgeNaturalHeightRef.current = natural;

      // Kama hakuna animation inayoendelea, sync urefu wa wrapper moja
      // kwa moja na hali ya sasa (hidden -> 0, visible -> natural).
      if (badgeAnimRef.current === null) {
        const target = badgeHidden ? 0 : natural;
        badgeCurrentHeightRef.current = target;
        wrapper.style.height = `${target}px`;
      }
    };

    measure();

    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [badgeHidden]);

  // Animation MOJA ya JS (rAF) inayodhibiti KWA WAKATI MMOJA: (a) urefu
  // wa WRAPPER (hivyo nafasi ya KWELI inarudi kwa chat), NA (b) scrollTop
  // ya chat (frame moja moja) -- ndio inayozuia "mashindano" kati ya
  // animation mbili tofauti (chanzo halisi cha kutikisika kabla).
  const animateBadgeTo = useCallback((target: number, hiding: boolean) => {
    const wrapper = badgeWrapperRef.current;
    const card = badgeCardRef.current;
    if (!wrapper) return;

    if (badgeAnimRef.current !== null) {
      cancelAnimationFrame(badgeAnimRef.current);
      badgeAnimRef.current = null;
    }

    const start = badgeCurrentHeightRef.current;
    const delta = target - start;
    const natural = Math.max(badgeNaturalHeightRef.current, 1);
    const duration = hiding ? BADGE_COLLAPSE_MS : BADGE_EXPAND_MS;
    const startTime = performance.now();

    const easeInOutCubic = (t: number) =>
      t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

    const step = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(1, duration <= 0 ? 1 : elapsed / duration);
      const eased = easeInOutCubic(t);
      const h = start + delta * eased;

      badgeCurrentHeightRef.current = h;
      wrapper.style.height = `${Math.max(0, h)}px`;

      if (card) {
        card.style.transform = `translateY(${-(natural - h)}px)`;
      }

      // Sync scrollTop KWENYE FRAME HIYO HIYO ikiwa mtumiaji tayari
      // yupo karibu na chini -- hii ndiyo inayozuia mtikisiko.
      const scrollEl = scrollRef.current;
      if (scrollEl && nearBottomRef.current) {
        scrollEl.scrollTop = scrollEl.scrollHeight;
      }

      if (t < 1) {
        badgeAnimRef.current = requestAnimationFrame(step);
      } else {
        badgeAnimRef.current = null;
      }
    };

    badgeAnimRef.current = requestAnimationFrame(step);
  }, []);

  useEffect(() => {
    const target = badgeHidden ? 0 : badgeNaturalHeightRef.current;
    animateBadgeTo(target, badgeHidden);
  }, [badgeHidden, animateBadgeTo]);

  useEffect(() => {
    return () => {
      if (badgeAnimRef.current !== null) {
        cancelAnimationFrame(badgeAnimRef.current);
      }
    };
  }, []);

  // Smart auto-scroll: only follow stream when user is already near bottom.
  // Same idea as ThoughtProcess internal scroll — no up/down fight.
  const nearBottomRef = useRef(true);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      nearBottomRef.current = distance <= 80;
      handleScroll();
    };

    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [handleScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [items, titleLive]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const patchMsg = useCallback((id: string, patch: Partial<Extract<Item, { kind: "msg" }>>) => {
    setItems((list) => list.map((it) => (it.kind === "msg" && it.id === id ? { ...it, ...patch } : it)));
  }, []);

  const [codeDissolves, setCodeDissolves] = useState<
    Record<string, { oldCode: string; newCode: string }>
  >({});

  const handleEvent = useCallback(
    (e: BoardEvent) => {
      switch (e.type) {
        case "log":
          addLog(e.entry.type, e.entry.message);
          break;
        case "system":
          setItems((l) => [...l, { kind: "system", id: nid(), text: e.text }]);
          break;
        case "round":
          setRound({ round: e.round, total: e.total });
          setItems((l) => [...l, { kind: "round", id: nid(), round: e.round, total: e.total }]);
          break;
        case "msg_start":
          setActiveAgents((s) => new Set(s).add(e.agentId));
          setItems((l) => [
            ...l,
            { kind: "msg", id: e.id, agentId: e.agentId, content: "", thinking: "", sources: [], searches: [], done: false },
          ]);
          break;
        case "think":
          setItems((l) =>
            l.map((it) => (it.kind === "msg" && it.id === e.id ? { ...it, thinking: it.thinking + e.text } : it)),
          );
          break;
        case "search":
          setItems((l) =>
            l.map((it) =>
              it.kind === "msg" && it.id === e.id
                ? { ...it, query: e.query, searches: [...it.searches, { query: e.query, sources: [] }] }
                : it,
            ),
          );
          break;
        case "sources":
          setItems((l) =>
            l.map((it) => {
              if (it.kind !== "msg" || it.id !== e.id) return it;
              const searches = it.searches.length
                ? it.searches.map((s, i) =>
                    i === it.searches.length - 1 ? { ...s, sources: e.sources } : s,
                  )
                : [{ query: it.query || "", sources: e.sources }];
              return { ...it, sources: e.sources, searches };
            }),
          );
          break;
        case "token":
          setItems((l) =>
            l.map((it) => (it.kind === "msg" && it.id === e.id ? { ...it, content: it.content + e.text } : it)),
          );
          break;
        case "msg_reset":
          setItems((l) =>
            l.map((it) => (it.kind === "msg" && it.id === e.id ? { ...it, content: "" } : it)),
          );
          break;
        case "code_dissolve_start":
          setCodeDissolves((current) => ({
            ...current,
            [e.id]: { oldCode: e.oldCode, newCode: e.newCode },
          }));
          break;
        case "msg_corrected":
          patchMsg(e.id, { corrected: true });
          break;
        case "msg_remove":
          setCodeDissolves((current) => {
            const next = { ...current };
            delete next[e.id];
            return next;
          });
          setItems((l) => l.filter((it) => it.id !== e.id));
          break;
        case "msg_done":
          patchMsg(e.id, { done: true });
          setItems((l) => {
            const m = l.find((it) => it.kind === "msg" && it.id === e.id);
            if (m?.kind === "msg")
              setActiveAgents((s) => {
                const n = new Set(s);
                n.delete(m.agentId);
                return n;
              });
            return l;
          });
          break;
        case "title_stream":
          setTitleLive((t) => t + e.text);
          break;
        case "title_done":
          setTitle(e.title);
          setTitleLive("");
          break;
        case "usage":
          setUsage({ [e.agentId]: { requests: e.requests, tokens: e.tokens } });
          break;
        case "summary":
          setUsage(e.usage);
          break;
        case "report":
          setItems((l) => [...l, { kind: "report", id: e.id || nid(), title: e.title, content: e.content }]);
          onReport();
          break;
        case "error":
          setItems((l) => [...l, { kind: "system", id: nid(), text: `❌ ${e.message}` }]);
          addLog("error", e.message);
          setPhase("error");
          break;
        case "done":
          setPhase("done");
          setConversationStatus("completed");
          setActiveAgents(new Set());
          break;
      }
    },
    [addLog, onReport, patchMsg, setUsage],
  );

  const consume = useCallback(
    async (res: Response, ctrl: AbortController) => {
      await readNdjson<BoardEvent>(res, handleEvent, ctrl.signal);
    },
    [handleEvent],
  );

  const start = async (project: string) => {
    const p = project.trim();
    if (!p || phase === "running") return;
    setItems([]);
    setTitle("");
    setTitleLive("");
    setRound(null);
    setPhase("running");
    setPrompt("");
    completedTurnIdsRef.current = new Set();
    setLoadedAsHistory(false);
    addLog("system", `Board session starting: "${p.slice(0, 70)}"`);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/boardroom", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ project: p }),
        signal: ctrl.signal,
      });
      const rid = res.headers.get("X-Runner-Id");
      if (rid) setRunId(rid);
      await consume(res, ctrl);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setPhase("error");
        addLog("error", (err as Error)?.message || "Board stream failed");
      }
    }
  };

  const resume = async () => {
    if (!runId || phase === "running") return;
    setPhase("running");
    addLog("system", "♻️ Kuendelea na mjadala uliosimama...");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch("/api/boardroom/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: runId }),
        signal: ctrl.signal,
      });
      const rid = res.headers.get("X-Runner-Id");
      if (rid) setRunId(rid);
      await consume(res, ctrl);
    } catch (err) {
      if ((err as Error)?.name !== "AbortError") {
        setPhase("error");
        addLog("error", (err as Error)?.message || "Resume failed");
      }
    }
  };

  // Reattach to a run already in progress (e.g. after a reload).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/boardroom/active");
        const d = (await r.json()) as { active: { id: string; project: string } | null };
        if (cancelled || !d.active) return;
        setPhase("running");
        setRunId(d.active.id);
        addLog("system", "Reattached to live board session.");
        const ctrl = new AbortController();
        abortRef.current = ctrl;
        const res = await fetch(`/api/boardroom/attach?id=${encodeURIComponent(d.active.id)}`, { signal: ctrl.signal });
        await consume(res, ctrl);
      } catch {
        /* no active run */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Open a saved discussion / start a fresh one, signalled by the parent.
  useEffect(() => {
    if (!convSignal || convSignal.n === handledConv.current) return;
    handledConv.current = convSignal.n;
    abortRef.current?.abort();
    if (convSignal.kind === "new") {
      setItems([]);
      setTitle("");
      setTitleLive("");
      setRound(null);
      setRunId(null);
      setConversationStatus(null);
      completedTurnIdsRef.current = new Set();
      setLoadedAsHistory(false);
      setPhase("idle");
      setActiveAgents(new Set());
      return;
    }
    (async () => {
      try {
        const r = await fetch(`/api/conversations?id=${encodeURIComponent(convSignal.id)}`);
        const d = (await r.json()) as {
          conversation?: { id?: string; title: string; project: string; status: string; items: any[] };
        };
        const c = d.conversation;
        if (!c) return;
        setTitle(c.title || "");
        setConversationStatus(c.status || null);
        setRunId(c.id || null);
        setPhase(c.status === "running" ? "running" : "done");
        completedTurnIdsRef.current = new Set();
        setLoadedAsHistory(c.status !== "running");
        setItems(
          (c.items || [])
            .filter(
              (it: any) =>
                !(
                  it?.kind === "chip" &&
                  typeof it?.text === "string" &&
                  it.text.startsWith("__PROFESSOR_XMD_RESUME_STATE__:")
                )
            )
            .map((it): Item => {
            if (it.kind === "msg")
              return {
                kind: "msg",
                id: it.id || nid(),
                agentId: it.agentId || "pm",
                content: it.content || "",
                thinking: it.thinking || "",
                query: it.query,
                sources: it.sources || [],
                searches: it.searches || [],
                done: it.done !== false,
                failed: it.failed,
                error: it.error,
                corrected: it.corrected === true,
              };
            if (it.kind === "round") return { kind: "round", id: it.id || nid(), round: it.round, total: it.total };
            return { kind: "system", id: it.id || nid(), text: it.text || "" };
          }),
        );
        addLog("info", `Loaded discussion: "${(c.title || c.project).slice(0, 60)}"`);
      } catch {
        addLog("error", "Failed to load that discussion.");
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convSignal]);

  const running = phase === "running";
  const displayTitle = title || titleLive;
  const firstIncompleteMsgIndex = items.findIndex(
    (it) => it.kind === "msg" && !completedTurnIdsRef.current.has(it.id),
  );
  const frontierIndex =
    firstIncompleteMsgIndex === -1 ? items.length : firstIncompleteMsgIndex;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      {/* Board status strip */}
      {/* Wrapper -- urefu wake unadhibitiwa 100% na JS (rAF), hivyo
          nafasi HALISI inarudi kwa chat inaposhuka (si spacer isiyo-
          badilika). Height HAIPO kwenye JSX style ili React isiigongane
          na mutations za rAF kwenye re-render. */}
      <div
        ref={badgeWrapperRef}
        style={{ overflow: "hidden" }}
        className="shrink-0"
      >
        <div ref={badgeCardRef} className="glass mx-auto mt-3 flex w-[calc(100%-1.5rem)] max-w-3xl items-center gap-3 rounded-3xl px-4 py-3">
        <div className="flex -space-x-2.5">
          {AGENTS.map((a) => (
            <Avatar key={a.id} agent={a} size={34} live={activeAgents.has(a.id)} className="ring-2 ring-background" />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-bold text-foreground">
            {displayTitle || "The Board Room"}
            {titleLive && <span className="caret" />}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {running
              ? round
                ? `Round ${round.round} of ${round.total} — agents deliberating…`
                : "Warming up the table…"
              : phase === "done"
                ? "Session complete — report filed under Reports"
                : phase === "error"
                  ? "Session hit an error — check logs"
                  : "Five agents. One table. Your project."}
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-[0.14em] ${
            running ? "bg-primary/15 text-primary" : phase === "done" ? "bg-accent/15 text-accent" : "bg-secondary text-muted-foreground"
          }`}
        >
          {running ? "Live" : phase}
        </span>
      </div>
      </div>

      {/* Stream */}
      <div ref={scrollRef} data-board-stream-scroll onScroll={handleScroll} className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full max-w-3xl flex-col space-y-5 px-4 pb-6 pt-5">
          {items.length === 0 && phase === "idle" && (
<div className="rise-in flex min-h-full flex-col items-center justify-center px-4">
<div className="boardroom-hero w-full">
<img
src="/boardroomhero.png"
alt="The Board Room"
className="boardroom-hero-img"
loading="eager"
decoding="async"
/>
</div>
</div>
)}

          {items.map((it, idx) => {
            if (!loadedAsHistory && idx > frontierIndex) return null;
            if (it.kind === "round")
              return (
                <div key={it.id} className="rise-in flex items-center gap-3 py-1">
                  <span className="h-px flex-1 bg-border" />
                  <span className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
                    Round {it.round} / {it.total}
                  </span>
                  <span className="h-px flex-1 bg-border" />
                </div>
              );
            if (it.kind === "system")
              return (
                <p key={it.id} className="rise-in text-center text-[11.5px] italic text-muted-foreground">
                  {it.text}
                </p>
              );
            if (it.kind === "report") return <ReportCard key={it.id} title={it.title} content={it.content} />;
            return (
              <BoardMessage
                key={it.id}
                item={it}
                historyMode={loadedAsHistory}
                onTurnComplete={handleTurnComplete}
                dissolve={codeDissolves[it.id]}
              />
            );
          })}

          {conversationStatus &&
        conversationStatus !== "completed" &&
        phase !== "running" &&
        items.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-2">
              <button
                type="button"
                onClick={resume}
                className="rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-[11px] font-semibold text-primary transition hover:bg-primary/20"
              >
                ↻ Endelea na mjadala (Resume)
              </button>
            </div>
          )}

          {running && items.length > 0 && (
            <div className="flex items-center justify-center gap-2 py-2 text-[11px] text-muted-foreground">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
              Board in session{runId ? "" : "…"}
            </div>
          )}
        </div>
      </div>
    {items.length === 0 && phase === "idle" && (
      <div className="shrink-0 w-full px-4 pt-2 pb-[calc(18px+env(safe-area-inset-bottom,0px))]">
        <div className="glass-strong mx-auto flex w-full max-w-md items-end gap-1.5 rounded-[24px] border border-white/10 p-1.5 shadow-2xl backdrop-blur-xl transition-shadow focus-within:ring-signal">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onInput={(e) => {
              const el = e.currentTarget;
              el.style.height = "36px";
              el.style.height = `${Math.min(Math.max(el.scrollHeight, 36), 120)}px`;
            }}
            rows={1}
            placeholder="Eleza project yako hapa…"
            className="scroll-thin max-h-[120px] min-h-[36px] flex-1 resize-none overflow-y-auto bg-transparent px-3 py-1.5 text-[12px] leading-5 text-foreground outline-none placeholder:text-muted-foreground"
          />
          <button
            onClick={() => start(prompt)}
            disabled={!prompt.trim()}
            aria-label="Send"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-signal text-primary-foreground transition-transform duration-200 hover:scale-105 active:scale-95 disabled:opacity-35 disabled:hover:scale-100"
          >
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 19V5" />
              <path d="m5 12 7-7 7 7" />
            </svg>
          </button>
        </div>
      </div>
    )}
    </div>
  );
}

/* ========================================================================
 * Board Room message UX (copied style from agent rooms, self-contained).
 * - ThoughtProcess + typewriter
 * - Answer typewriter, document-style (no glass bubble)
 * - Sources pills → SourceDrawer
 * - Copy only (no regenerate)
 * ======================================================================== */

const TYPEWRITER_CHAR_MS = 3; // thought process — same as agent rooms
const TYPEWRITER_ANSWER_CHAR_MS = 3; // streaming kila herufi - fix 1
const TYPEWRITER_ANSWER_STEP = 1; // fallback only; stream is word-based

function boardGetDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function boardGetSnippet(source: SearchResult) {
  const value = (source as { content?: string; description?: string; snippet?: string }).content
    ?? (source as { description?: string }).description
    ?? (source as { snippet?: string }).snippet;
  return typeof value === "string" ? value : "";
}

function BoardBrainCircuitIcon({
  active,
  accent,
}: {
  active: boolean;
  accent: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center"
      style={{
        color: accent,
        filter: active
          ? `drop-shadow(0 0 6px ${accent})`
          : "drop-shadow(0 0 0 transparent)",
        transition: "filter 240ms ease, opacity 240ms ease",
        opacity: active ? 1 : 0.85,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-[18px] w-[18px] ${active ? "animate-pulse" : ""}`}
      >
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path d="M9 13a4.5 4.5 0 0 0 3-4" />
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
        <path d="M6 18a4 4 0 0 1-1.967-.516" />
        <path d="M12 13h4" />
        <path d="M12 18h6a2 2 0 0 1 2 2v1" />
        <path d="M12 8h8" />
        <path d="M16 8V5a2 2 0 0 1 2-2" />
        <circle cx="16" cy="13" r=".5" fill="currentColor" stroke="none" />
        <circle cx="18" cy="3" r=".5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="21" r=".5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="8" r=".5" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function BoardThoughtProcess({
  agent,
  thinking,
  live,
  onSettle,
  historyMode,
}: {
  agent: ReturnType<typeof getAgent>;
  thinking: string;
  live: boolean;
  onSettle?: () => void;
  historyMode: boolean;
}) {
  const accent = agent?.accent ?? "var(--primary)";
  const [open, setOpen] = useState(!historyMode);
  // History (!live): start with full text. Live: type from empty.
  const [displayedThinking, setDisplayedThinking] = useState(() =>
    historyMode ? thinking : "",
  );

  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const thinkingTargetRef = useRef(thinking);
  const displayedThinkingRef = useRef(displayedThinking);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousScrollHeightRef = useRef(0);
  const wasNearBottomRef = useRef(true);
  const settledRef = useRef(false);

  thinkingTargetRef.current = thinking;
  displayedThinkingRef.current = displayedThinking;

  useEffect(() => {
    if (live) {
      setOpen(true);
      settledRef.current = false;
      return;
    }
    // Thinking phase imeisha upande wa server (jibu limeanza), lakini
    // typewriter ya hapa chini bado inaweza kuwa inakamilisha reveal.
    // Funga + settle TU baada ya reveal kukamilika kweli.
    if (!thinking || displayedThinking.length >= thinking.length) {
      setOpen(false);
      if (!settledRef.current) {
        settledRef.current = true;
        onSettle?.();
      }
    }
  }, [live, thinking, displayedThinking, onSettle]);

  // Typewriter inaendelea kukamilisha `thinking` mpaka mwisho, HATA
  // baada ya `live` kuwa false -- hii inairuhusu ikamilike taratibu
  // hata kama server tayari imeanza kutuma jibu nyuma ya pazia.
  useEffect(() => {
    if (!thinking) {
      setDisplayedThinking("");
      previousScrollHeightRef.current = 0;
      wasNearBottomRef.current = true;
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
      return;
    }

    if (typingTimerRef.current) return;
    if (displayedThinkingRef.current.length >= thinking.length) return;

    const tick = () => {
      const target = thinkingTargetRef.current;
      if (!target) {
        typingTimerRef.current = null;
        return;
      }

      const previous = displayedThinkingRef.current;
      let next = previous;
      if (!target.startsWith(previous)) {
        next = target.slice(0, 1);
      } else if (previous.length < target.length) {
        next = target.slice(0, previous.length + 1);
      }

      if (next !== previous) {
        displayedThinkingRef.current = next;
        setDisplayedThinking(next);
      }

      if (next.length >= target.length && target.startsWith(next)) {
        typingTimerRef.current = null;
        return;
      }

      typingTimerRef.current = setTimeout(tick, TYPEWRITER_CHAR_MS);
    };

    tick();
  }, [thinking]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  useEffect(() => {
    const scroll = thinkingRef.current;
    if (!scroll || !open) return;

    const currentHeight = scroll.scrollHeight;
    const previousHeight = previousScrollHeightRef.current;

    if (previousHeight === 0) {
      previousScrollHeightRef.current = currentHeight;
      if (currentHeight > scroll.clientHeight) {
        scroll.scrollTop = currentHeight - scroll.clientHeight;
      }
      return;
    }

    const heightDelta = currentHeight - previousHeight;
    if (heightDelta > 0 && wasNearBottomRef.current) {
      scroll.scrollTop += heightDelta;
    }

    previousScrollHeightRef.current = currentHeight;
    const distanceFromBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;
    wasNearBottomRef.current = distanceFromBottom <= 32;
  }, [displayedThinking, open, live]);

  if (!thinking) return null;

  return (
    <section className="mt-1 w-full [overflow-anchor:none]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BoardBrainCircuitIcon active={live && open} accent={accent} />
        <span
          className="relative overflow-hidden text-[13.5px] font-medium tracking-normal"
          style={{ color: accent }}
        >
          <span className={live ? "xmd-board-thinking-sweep" : ""}>Thinking...</span>
        </span>
        <span
          aria-hidden="true"
          className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center"
          style={{ color: accent }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 ease-out"
            style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-2 flex h-40 max-w-full items-stretch">
          <span
            aria-hidden="true"
            className="mr-3 ml-[10px] w-[2.5px] shrink-0 self-stretch rounded-full"
            style={{
              background: accent,
              boxShadow: live ? `0 0 10px ${accent}` : "none",
              opacity: live ? 0.9 : 0.65,
            }}
          />
          <div
            ref={thinkingRef}
            className="scroll-thin min-w-0 h-full flex-1 overflow-y-auto overscroll-contain pr-2 text-[13px] leading-6 text-muted-foreground [overflow-anchor:none]"
            aria-live="off"
          >
            <pre className="m-0 whitespace-pre-wrap break-words font-sans">
              {displayedThinking}
            </pre>
          </div>
        </div>
      )}

      <style jsx>{`
        .xmd-board-thinking-sweep {
          position: relative;
          display: inline-block;
          color: ${accent};
          background: linear-gradient(
            90deg,
            ${accent} 0%,
            ${accent} 35%,
            rgba(255, 255, 255, 0.95) 50%,
            ${accent} 65%,
            ${accent} 100%
          );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: xmd-board-thinking-sweep 1.9s linear infinite;
        }

        @keyframes xmd-board-thinking-sweep {
          from {
            background-position: 180% 0;
          }
          to {
            background-position: -20% 0;
          }
        }
      `}</style>
    </section>
  );
}

function useBoardTypewriter(
  target: string,
  enabled: boolean,
  /** true = history/done — never animate */
  instant: boolean = false,
) {
  const [displayed, setDisplayed] = useState(() =>
    instant || !enabled ? target : "",
  );
  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  const instantRef = useRef(instant);
  const displayedRef = useRef(displayed);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  targetRef.current = target;
  enabledRef.current = enabled;
  instantRef.current = instant;
  displayedRef.current = displayed;

  useEffect(() => {
    if (instant) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      setDisplayed(target || "");
      return;
    }

    if (!enabled) {
      return;
    }

    if (!target) {
      setDisplayed("");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) return;

    if (
      displayedRef.current.length >= target.length &&
      target.startsWith(displayedRef.current)
    ) {
      return;
    }

    const step =
      typeof TYPEWRITER_ANSWER_STEP === "number" ? TYPEWRITER_ANSWER_STEP : 24;
    const delay =
      typeof TYPEWRITER_ANSWER_CHAR_MS === "number"
        ? TYPEWRITER_ANSWER_CHAR_MS
        : 0;

    const tick = () => {
      const currentTarget = targetRef.current;
      if (!currentTarget || !enabledRef.current || instantRef.current) {
        timerRef.current = null;
        return;
      }

      const previous = displayedRef.current;
      let next = previous;
      if (!currentTarget.startsWith(previous)) {
        const m = currentTarget.match(/^\S+\s*/);
        next = m ? m[0] : currentTarget.slice(0, 1);
      } else if (previous.length < currentTarget.length) {
        const rest = currentTarget.slice(previous.length);
        const m = rest.match(/^\S+\s*/);
        next = m ? previous + m[0] : currentTarget;
      }

      if (next !== previous) {
        displayedRef.current = next;
        setDisplayed(next);
      }

      if (next.length >= currentTarget.length && currentTarget.startsWith(next)) {
        timerRef.current = null;
        return;
      }

      timerRef.current = setTimeout(tick, delay);
    };

    tick();
  }, [target, enabled, instant]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (instant) return target || "";
  if (!enabled) return "";
  return displayed;
}

function BoardSourceFavicon({ url }: { url: string }) {
  const domain = boardGetDomain(url);
  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-white/5">
      <img
        src={`https://${domain}/favicon.ico`}
        alt=""
        className="h-4 w-4 object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function BoardSourcePill({
  source,
  onOpen,
}: {
  source: SearchResult;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mx-1 inline-flex max-w-[180px] translate-y-[1px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 align-middle text-[10px] text-muted-foreground backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10 hover:text-foreground"
      title={source.title || source.url}
    >
      <BoardSourceFavicon url={source.url} />
      <span className="truncate">{boardGetDomain(source.url)}</span>
    </button>
  );
}

function BoardSourceDrawer({
  sources,
  onClose,
}: {
  sources: SearchResult[];
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useState({ value: 0 })[0];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const primary = sources[0];
  const more = sources.slice(1);

  const finishSheetDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const delta = Math.max(0, event.clientY - dragStartY.value);
    setDragging(false);
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    if (delta > 110) {
      onClose();
      setDragY(0);
      return;
    }
    setDragY(0);
  };

  const onHandlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    dragStartY.value = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    setDragY(Math.max(0, event.clientY - dragStartY.value));
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close sources"
        className="absolute inset-0 bg-background/55 backdrop-blur-md"
        onClick={onClose}
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Sources"
          className="relative w-full max-w-2xl overflow-hidden rounded-t-[28px] border border-white/10 bg-background/95 shadow-[0_-20px_70px_-25px_rgba(0,0,0,.85)] backdrop-blur-2xl"
          style={{
            transform: `translateY(${dragY}px)`,
            transition: dragging ? "none" : "transform 180ms ease-out",
          }}
        >
          <div
            className="mx-auto mt-2 h-1 w-10 cursor-grab touch-none rounded-full bg-white/20 active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={finishSheetDrag}
            onPointerCancel={finishSheetDrag}
          />
          <div
            ref={scrollRef}
            className="max-h-[82dvh] overflow-y-auto overscroll-contain px-5 pb-7 pt-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[16px] font-bold text-foreground">
                Sources
              </h3>
              <button
                type="button"
                aria-label="Close sources"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
                  <path
                    d="m7 7 10 10M17 7 7 17"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {primary && (
              <a
                href={primary.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 transition hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <BoardSourceFavicon url={primary.url} />
                  <span className="truncate text-[11px] font-medium text-muted-foreground">
                    {boardGetDomain(primary.url)}
                  </span>
                </div>
                <div className="mt-2 font-semibold text-foreground">
                  {primary.title || boardGetDomain(primary.url)}
                </div>
                {boardGetSnippet(primary) && (
                  <div className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {boardGetSnippet(primary)}
                  </div>
                )}
                <div className="mt-3 text-[11px] font-medium text-primary">
                  Open source ↗
                </div>
              </a>
            )}

            {more.length > 0 && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="mb-3 font-display text-[13px] font-semibold text-foreground">
                  More
                </div>
                <div className="grid gap-2">
                  {more.map((source, index) => (
                    <a
                      key={`${source.url}-${index}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.055]"
                    >
                      <div className="flex items-center gap-2">
                        <BoardSourceFavicon url={source.url} />
                        <span className="truncate text-[11px] font-medium text-muted-foreground">
                          {boardGetDomain(source.url)}
                        </span>
                      </div>
                      <div className="mt-1.5 font-semibold text-foreground">
                        {source.title || boardGetDomain(source.url)}
                      </div>
                      {boardGetSnippet(source) && (
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {boardGetSnippet(source)}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function BoardCopyIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" aria-hidden="true">
      <rect x="8" y="8" width="11" height="11" rx="2" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M5 16V6a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}


function extractFence(code: string) {
  const m = code.match(/```([A-Za-z0-9_+#-]*)\s*\n([\s\S]*?)```/);
  return {
    lang: (m?.[1] || "code").trim() || "code",
    body: (m?.[2] ?? code).replace(/\n$/, ""),
  };
}

type DiffRow = { kind: "same" | "delete" | "insert"; text: string };

function buildDissolveDiff(oldCode: string, newCode: string): DiffRow[] {
  const oldLines = extractFence(oldCode).body.split("\n");
  const newLines = extractFence(newCode).body.split("\n");

  // Keep the UI safe for very large scripts; the normal final code remains unchanged.
  if (oldLines.length * newLines.length > 180000) {
    return [
      ...oldLines.map((text) => ({ kind: "delete" as const, text })),
      ...newLines.map((text) => ({ kind: "insert" as const, text })),
    ];
  }

  const cols = newLines.length + 1;
  const dp = Array.from({ length: oldLines.length + 1 }, () => new Uint32Array(cols));
  for (let i = oldLines.length - 1; i >= 0; i--) {
    for (let j = newLines.length - 1; j >= 0; j--) {
      dp[i][j] = oldLines[i] === newLines[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffRow[] = [];
  let i = 0;
  let j = 0;
  while (i < oldLines.length || j < newLines.length) {
    if (i < oldLines.length && j < newLines.length && oldLines[i] === newLines[j]) {
      rows.push({ kind: "same", text: oldLines[i] });
      i++; j++;
      continue;
    }
    if (i < oldLines.length && (j >= newLines.length || dp[i + 1][j] >= dp[i][j + 1])) {
      rows.push({ kind: "delete", text: oldLines[i] });
      i++;
      continue;
    }
    if (j < newLines.length) {
      rows.push({ kind: "insert", text: newLines[j] });
      j++;
    }
  }
  return rows;
}

function CodeDissolveBlock({
  oldCode,
  newCode,
}: {
  oldCode: string;
  newCode: string;
}) {
  const oldFence = extractFence(oldCode);
  const rows = buildDissolveDiff(oldCode, newCode);
  return (
    <div className="my-2 overflow-hidden rounded-xl border border-white/10">
      <div className="flex items-center justify-between gap-2 bg-white/[0.06] px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">{oldFence.lang}</span>
          <span className="rounded-full border border-amber-400/25 bg-amber-400/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-amber-300">
            correcting
          </span>
        </div>
        <span className="text-[9px] text-muted-foreground">Script revision</span>
      </div>
      <pre className="overflow-x-auto bg-black/50 p-3 text-[12.5px] leading-6">
        {rows.map((row, index) => {
          const prefix = row.kind === "delete" ? "− " : row.kind === "insert" ? "+ " : "  ";
          const cls =
            row.kind === "delete"
              ? "block bg-red-500/10 text-red-300 line-through decoration-red-300/70"
              : row.kind === "insert"
                ? "block bg-emerald-500/10 text-emerald-300"
                : "block text-zinc-300";
          return (
            <span key={`${index}-${row.kind}`} className={cls}>
              {prefix}{row.text}
            </span>
          );
        })}
      </pre>
    </div>
  );
}

function BoardMessage({
  item,
  historyMode,
  onTurnComplete,
  dissolve,
}: {
  item: Extract<Item, { kind: "msg" }>;
  historyMode: boolean;
  onTurnComplete?: (id: string) => void;
  dissolve?: { oldCode: string; newCode: string };
}) {
  const agent = getAgent(item.agentId);
  const live = !item.done;
  const hasThinking = Boolean(item.thinking);
  const mountedDoneRef = useRef(historyMode);
  const [thinkingSettled, setThinkingSettled] = useState(
    () => mountedDoneRef.current || !hasThinking,
  );
  // FIX SAHIHI: thinkingLive iwe true wakati thinking bado haija-settle
  // au jibu bado halijaanza - glow hadi mwisho, open mpaka streaming iishe
  const thinkingLive = hasThinking && !item.content;
  const handleThinkingSettle = useCallback(() => {
    setThinkingSettled(true);
  }, []);
  useEffect(() => {
    if (hasThinking && !item.content && !mountedDoneRef.current) {
      setThinkingSettled(false);
    }
  }, [hasThinking, item.content]);
  const showAnswer =
    Boolean(item.content) && (thinkingSettled || mountedDoneRef.current);
  const displayedContent = useBoardTypewriter(
    item.content || "",
    showAnswer,
    mountedDoneRef.current,
  );
  const answerCaughtUp =
    !item.content || displayedContent.length >= item.content.length;

  useEffect(() => {
    if (historyMode || !onTurnComplete) return;
    if (item.done && thinkingSettled && answerCaughtUp) {
      onTurnComplete(item.id);
    }
  }, [historyMode, onTurnComplete, item.done, item.id, thinkingSettled, answerCaughtUp]);

  // Scroll ifuate kila neno linaloongezeka (thinking au jibu) IKIWA TU
  // mtumiaji tayari yuko karibu na chini -- kanuni ile ile ya container
  // ya nje, kwa hiyo haipingani na scroll ya mkono kuelekea juu.
  useLayoutEffect(() => {
    if (mountedDoneRef.current) return;
    const el = document.querySelector(
      "[data-board-stream-scroll]",
    ) as HTMLElement | null;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [displayedContent, item.thinking, item.searches.length, item.sources.length, item.content]);

  const hasSources = item.sources.length > 0;
  // Show searching indicator only while live, query exists, sources not yet in.
  const isSearching = Boolean(item.query) && !hasSources && live;

  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const onCopy = async () => {
    const text = item.content || "";
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // ignore
    }
  };

  return (
    <>
      <div className="rise-in w-full space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <Avatar agent={agent} size={38} live={live} />
          <span className="font-display text-[14px] font-semibold text-foreground">
            {agent?.name ?? item.agentId}
          </span>
          <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
            {agent?.role}
          </span>
        </div>

          <BoardThoughtProcess
            agent={agent}
            thinking={item.thinking}
            live={thinkingLive}
            onSettle={handleThinkingSettle}
            historyMode={historyMode}
          />

          {item.searches.map((round, idx) => {
            const isLastRound = idx === item.searches.length - 1;
            const roundIsSearching = isLastRound && isSearching;
            const roundSources = round.sources;
            return (
              <div key={`${item.id}-search-${idx}`} className="flex flex-col gap-1.5">
                <div className="inline-flex max-w-full flex-wrap items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                  <span className="relative flex h-1.5 w-1.5 shrink-0">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                    <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                  </span>
                  {roundIsSearching && (
                    <span className="xmd-board-searching-sweep shrink-0">
                      🔍 searching...
                    </span>
                  )}
                  <span className="min-w-0 break-all">{round.query}</span>
                </div>
                {roundSources.length > 0 && (
                  <span className="inline-flex flex-wrap items-center">
                    {roundSources.slice(0, 2).map((source, index) => (
                      <BoardSourcePill
                        key={`${source.url}-${index}`}
                        source={source}
                        onOpen={() => setSourcesOpen(true)}
                      />
                    ))}
                    {roundSources.length > 2 && (
                      <button
                        type="button"
                        onClick={() => setSourcesOpen(true)}
                        className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                      >
                        +{roundSources.length - 2}
                      </button>
                    )}
                  </span>
                )}
              </div>
            );
          })}

          {/* Document-style answer — NOT inside a glass bubble box */}
          {dissolve ? (
            <div className="break-words text-[14px] leading-6 text-foreground">
              <CodeDissolveBlock oldCode={dissolve.oldCode} newCode={dissolve.newCode} />
            </div>
          ) : showAnswer ? (
            <div className="break-words text-[14px] leading-6 text-foreground">
              <div className="my-2 overflow-hidden rounded-xl">
                {item.corrected && item.done && /```[\s\S]*```/.test(item.content || "") && (
                  <div className="mb-1.5 flex items-center gap-2 text-[9px] font-semibold uppercase tracking-[0.14em] text-emerald-300/90">
                    <span className="grid h-4 w-4 place-items-center rounded-full border border-emerald-400/25 bg-emerald-400/10">✓</span>
                    Script corrected
                  </div>
                )}
                <Markdown
                  text={
                    mountedDoneRef.current || (item.done && answerCaughtUp)
                      ? item.content || ""
                      : displayedContent || ""
                  }
                />
              </div>
              {!mountedDoneRef.current &&
                displayedContent.length < (item.content?.length ?? 0) && (
                <span className="caret" />
              )}
            </div>
          ) : null}

          {item.failed && item.error && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-foreground">
              ❌ {item.error}
            </div>
          )}

          {/* Copy only — no regenerate */}
          {(mountedDoneRef.current || (item.done && answerCaughtUp)) && item.content && (
            <div className="flex items-center gap-1 pt-0.5">
              <button
                type="button"
                aria-label="Copy response"
                title={copied ? "Copied" : "Copy response"}
                onClick={onCopy}
                className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground"
              >
                <BoardCopyIcon />
              </button>
              {copied && (
                <span className="text-[10px] text-muted-foreground">Copied</span>
              )}
            </div>
          )}
      </div>

      {sourcesOpen && item.searches.some((s) => s.sources.length > 0) && (
        <BoardSourceDrawer
          sources={item.searches.flatMap((s) => s.sources)}
          onClose={() => setSourcesOpen(false)}
        />
      )}

      <style jsx>{`
        .xmd-board-searching-sweep {
          position: relative;
          display: inline-block;
          color: var(--primary);
          background: linear-gradient(
            90deg,
            var(--primary) 0%,
            var(--primary) 35%,
            rgba(255, 255, 255, 0.95) 50%,
            var(--primary) 65%,
            var(--primary) 100%
          );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: xmd-board-searching-sweep 1.6s linear infinite;
        }
        @keyframes xmd-board-searching-sweep {
          from { background-position: 180% 0; }
          to { background-position: -20% 0; }
        }
      `}</style>
    </>
  );
}

function ReportCard({ title, content }: { title: string; content: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rise-in glass rounded-3xl border-accent/25 p-4" style={{ borderLeft: "3px solid var(--accent)" }}>
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-accent/15 text-xl">📑</span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[14px] font-bold text-foreground">{title}</p>
          <p className="text-[11px] text-muted-foreground">Ripoti kamili imehifadhiwa kwenye Reports</p>
        </div>
        <button
          onClick={() => setOpen((o) => !o)}
          className="shrink-0 rounded-full border border-accent/35 bg-accent/10 px-3 py-1.5 text-[11px] font-semibold text-accent transition hover:bg-accent/20"
        >
          {open ? "Funga" : "Soma"}
        </button>
      </div>
      {open && (
        <div className="scroll-thin mt-3 max-h-[50vh] overflow-y-auto border-t border-border pt-3">
          <Markdown text={content} />
        </div>
      )}
    </div>
  );
}
