"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CircleDashed, Clock, Coins, Download, Link2, Loader2, Lock, X, ArrowDown, Circle, PlugZap, AlertTriangle, Pause, Play } from "lucide-react";
import { AGENTS, getAgent, type AgentId } from "@/lib/team";
import type { Source } from "@/lib/ui-types";
import type { StageItem } from "@/lib/stage/types";
import { cn, compact, domainOf } from "@/lib/utils";
import { AgentAvatar } from "../ui/AgentAvatar";
import { PromptComposer } from "../ui/PromptComposer";
import { BoardGraph } from "./BoardGraph";
import { StageStream } from "./stage/StageStream";
import { StageRail } from "./stage/StageRail";
import { useBoardLive } from "./BoardLive";

/** R20: provider → lebo + rangi (rangi ya akaunti ya kwanza ya provider huyo kwenye Pulse) */
const PROVIDER_ROWS = [
  { id: "xkiro", label: "XKiro", color: "#3d7bff" },
  { id: "unorouter", label: "Uno", color: "#10b981" },
  { id: "openrouter", label: "OpenRouter", color: "#06b6d4" },
  { id: "gemini", label: "Gemini", color: "#84cc16" },
  { id: "groq", label: "Groq", color: "#f97316" },
] as const;

/* Board Room — stream HALISI ya engine (kupitia BoardLive provider → adapter → stage/*).
 * Modes: ?prompt=… (anzisha) · ?session=… (historia) · ?resume=… (endelea) · /board (hali ya sasa). */

// kinga dhidi ya kuanzisha mara mbili (StrictMode/remount) kwa URL ile ile
let lastUrlAction = "";

export function BoardRoom() {
  const params = useSearchParams();
  const router = useRouter();
  const board = useBoardLive();
  const { snap, mode, conn } = board;
  const { items, stage, agendaList } = snap;
  const status = snap.status;
  const [panel, setPanel] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [atBottom, setAtBottom] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const running = mode === "live" && (conn === "streaming" || conn === "connecting");
  const phase = mode === "idle" ? "idle" : running ? "running" : "done";

  /* ---------------- external session details trigger ---------------- */
  useEffect(() => {
    const open = () => setPanel(true);
    window.addEventListener("xmd:open-session-details", open);
    return () => window.removeEventListener("xmd:open-session-details", open);
  }, []);

  /* ---------------- URL-driven modes ---------------- */
  const key = params.toString();
  useEffect(() => {
    const prompt = params.get("prompt");
    const session = params.get("session");
    const resume = params.get("resume");
    follow.current = true;
    if (prompt) {
      if (lastUrlAction !== `p:${prompt}`) { lastUrlAction = `p:${prompt}`; board.start(prompt); }
      router.replace("/board");
      return;
    }
    if (resume) {
      if (lastUrlAction !== `r:${resume}`) { lastUrlAction = `r:${resume}`; board.resume(resume); }
      router.replace("/board");
      return;
    }
    if (params.get("new")) {
      // R32.1: "New session" = board tupu DAIMA. Mjadala unaendelea haupotei — unaendelea
      // kwenye server (unapatikana Sessions / auto-attach ya baadaye); kazi mpya (start force)
      // ndiyo itaipuuza. Guard ya zamani (usisafishe ukiwa live) ilirudisha user kwenye
      // session ya zamani bila kufanya kitu — ndiyo kilichulizwa.
      board.clear();
      lastUrlAction = "new";
      router.replace("/board");
      return;
    }
    if (session) {
      lastUrlAction = `s:${session}`;
      if (board.sessionId !== session || board.mode === "idle") board.open(session);
      return;
    }
    if (lastUrlAction !== "new") lastUrlAction = "";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  /* ---------------- URL ifuate session iliyo mbele (refresh = unabaki pale pale) ---------------- */
  useEffect(() => {
    const sid = board.sessionId;
    if (!sid || mode === "idle" || key !== "") return;
    if (lastUrlAction === "new" && mode !== "live") return; // "New session" iliyobonyezwa haifunguliwi upya
    lastUrlAction = `s:${sid}`;
    router.replace(`/board?session=${encodeURIComponent(sid)}`, { scroll: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [board.sessionId, mode, key]);

  /* ---------------- elapsed (halisi) ---------------- */
  useEffect(() => {
    const calc = () => {
      if (mode === "replay" || !board.startedAt) return Math.floor(board.elapsedBaseMs / 1000);
      return Math.floor((board.elapsedBaseMs + Date.now() - board.startedAt) / 1000);
    };
    setElapsed(calc());
    if (!running) return;
    const t = setInterval(() => setElapsed(calc()), 1000);
    return () => clearInterval(t);
  }, [running, mode, board.startedAt, board.elapsedBaseMs]);

  /* ---------------- smart autoscroll ---------------- */
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    // acha kufuata TU mtumiaji akiskrolla mwenyewe (maudhui yanayokua haraka yasivunje follow)
    let intent = 0;
    const mark = () => { intent = Date.now(); };
    const onScroll = () => {
      const near = el.scrollHeight - el.scrollTop - el.clientHeight < 140;
      if (near) follow.current = true;
      else if (Date.now() - intent < 900) follow.current = false;
      setAtBottom(follow.current || near);
    };
    const opts = { passive: true } as const;
    el.addEventListener("scroll", onScroll, opts);
    el.addEventListener("wheel", mark, opts);
    el.addEventListener("touchmove", mark, opts);
    el.addEventListener("keydown", mark);
    el.addEventListener("pointerdown", mark, opts);
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("wheel", mark);
      el.removeEventListener("touchmove", mark);
      el.removeEventListener("keydown", mark);
      el.removeEventListener("pointerdown", mark);
    };
  }, [phase]);
  useEffect(() => {
    const el = scrollRef.current;
    if (el && follow.current && running) el.scrollTop = el.scrollHeight;
  }, [items, running]);

  /* ---------------- derived (panel) ---------------- */
  const seals = items.filter((i): i is Extract<StageItem, { kind: "seal" }> => i.kind === "seal");
  const supersedes = items.filter((i): i is Extract<StageItem, { kind: "supersede" }> => i.kind === "supersede");
  const locked = Object.values(stage.ledger).filter((l) => l.status !== "OPEN").length;
  // R31: tokens za XMD Computer ("computer") zinaingia jumla pia
  const liveTokens = AGENTS.reduce((n, a) => n + (snap.usage[a.id]?.tokens || 0), 0) + (snap.usage.computer?.tokens || 0) + snap.liveTokens;
  // R20: mgawanyo wa tokens za session kwa provider (sessions za zamani hazina — mstari haujitokezi)
  const providerRows = PROVIDER_ROWS.filter((p) => (snap.providers?.[p.id]?.tokens || 0) > 0).map((p) => ({ ...p, tokens: snap.providers[p.id].tokens }));
  const sources = useMemo(() => {
    const m = new Map<string, Source & { agent: AgentId }>();
    items.forEach((i) => {
      const tr = i.kind === "evidence" ? i.trace : i.kind === "turn" ? i.search : undefined;
      if (tr && (i.kind === "evidence" || i.kind === "turn")) tr.sources.forEach((s) => m.set(s.url, { ...s, agent: i.agent }));
    });
    return [...m.values()];
  }, [items]);
  const mmss = elapsed >= 3600
    ? `${Math.floor(elapsed / 3600)}:${String(Math.floor((elapsed % 3600) / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`
    : `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const turnsOf = (id: AgentId) => items.filter((i) => i.kind === "turn" && i.agent === id).length;
  const agendaTotal = agendaList.length || stage.total;
  const resumeId = board.runnerId || board.sessionId;

  /* ================= EMPTY STATE ================= */
  if (phase === "idle") {
    return (
      <div className="relative flex min-h-[calc(100dvh-56px)] flex-col items-center justify-center overflow-hidden px-4 pb-10 pt-8">
        <div className="grid-lines pointer-events-none absolute inset-0" />
        <BoardGraph className="relative mb-8 max-w-[720px] animate-[rise_0.6s_both]" />
        <PromptComposer autoFocus onSubmit={(t) => board.start(t)} className="w-full max-w-[640px] animate-[rise_0.6s_0.15s_both]" />
      </div>
    );
  }

  /* ================= PANEL ================= */
  const PanelStats = (
    <div>
    <div className="grid grid-cols-3 gap-2">
      {[
        { icon: Clock, label: "Elapsed", value: mmss },
        { icon: Lock, label: "Locked", value: `${locked}/${agendaTotal || "—"}` },
        { icon: Coins, label: "Tokens", value: compact(liveTokens) },
      ].map((s) => (
        <div key={s.label} className="surface rounded-xl p-2.5">
          <s.icon size={13} className="text-[var(--color-faint)]" />
          <p className="mt-1.5 font-mono text-[14px] font-semibold">{s.value}</p>
          <p className="text-[10.5px] text-[var(--color-faint)]">{s.label}</p>
        </div>
      ))}
    </div>
    {providerRows.length > 0 && (
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] tabular-nums text-[var(--color-faint)]" title="Tokens za session hii kwa provider (kutoka majibu halisi ya provider)">
        {providerRows.map((p) => (
          <span key={p.id} className="flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.color }} />
            {p.label} <span className="text-[var(--color-muted)]">{compact(p.tokens)}</span>
          </span>
        ))}
      </div>
    )}
    <div className="mt-2 flex items-center gap-2 text-[11px] text-[var(--color-faint)]">
      <span className={cn("h-1.5 w-1.5 rounded-full", running ? "bg-[var(--color-ok)]" : conn === "error" ? "bg-[var(--color-bad)]" : "bg-[var(--color-faint)]")} />
      <span className="min-w-0 flex-1 truncate">
        {mode === "replay" ? "Historia (Appwrite)" : running ? "Live — engine" : conn === "pausing" ? "Inasimamisha…" : conn === "paused" ? "Imesimamishwa" : conn === "detached" ? "Umejitenga" : snap.done ? "Imekamilika" : "Imesimama"}
        {snap.sessionShort ? ` · #${snap.sessionShort}` : ""}
      </span>
      {items.length > 0 && (
        <button onClick={board.exportMarkdown} className="flex h-6 items-center gap-1 rounded-md px-1.5 text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]" title="Pakua mjadala kama Markdown">
          <Download size={11} /> Export
        </button>
      )}
    </div>
    </div>
  );

  const PanelBody = (
    <div className="space-y-5">
      <section>
        <p className="eyebrow mb-2.5">Agenda</p>
        {agendaList.length === 0 && (
          <p className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-3 text-center text-[11.5px] text-[var(--color-faint)]">{running ? "Optimus anaunda agenda…" : "Hakuna agenda bado"}</p>
        )}
        <ol className="space-y-1">
          {agendaList.map((a) => {
            const l = stage.ledger[a.index];
            const active = !l && stage.scope === "agenda" && stage.agenda?.index === a.index;
            const st = l?.status === "SUPERSEDED+LOCKED" ? { t: "SUPERSEDED → v2", c: "#c4b5fd", I: Link2 } : l?.status === "OPEN" ? { t: "OPEN", c: "var(--color-warn)", I: CircleDashed } : l ? { t: "LOCKED", c: "var(--color-ok)", I: Lock } : active ? { t: "inajadiliwa", c: "#a78bfa", I: Loader2 } : { t: "inasubiri", c: "var(--color-faint)", I: Circle };
            return (
              <li key={a.index} className={cn("flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-[12.5px]", active && "bg-white/[0.04]")}>
                <st.I size={14} style={{ color: st.c }} className={cn(active && running && "anim-spin")} />
                <span className={cn("min-w-0 flex-1 truncate", !l && !active ? "text-[var(--color-muted)]" : "text-[var(--color-fg)]")}>{a.title}</span>
                <span className="shrink-0 font-mono text-[9.5px] font-semibold tracking-wide" style={{ color: st.c }}>{st.t}</span>
              </li>
            );
          })}
        </ol>
      </section>

      <section>
        <p className="eyebrow mb-2.5">Ledger</p>
        {seals.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-3 text-center text-[11.5px] text-[var(--color-faint)]">Maamuzi yanaonekana hapa yakifungwa</p>
        ) : (
          <div className="space-y-1">
            {seals.map((s) => {
              const sup = supersedes.find((x) => x.agenda === s.agenda.index);
              return (
                <div key={s.id} className="rounded-xl border border-[var(--color-line)] bg-white/[0.015] px-2.5 py-2 text-[11.5px]">
                  <div className="flex items-center gap-2 font-mono text-[10.5px]">
                    <span className="text-[var(--color-muted)]">A{s.agenda.index}</span>
                    <span className={cn(s.superseded ? "text-[var(--color-faint)] line-through" : s.status === "OPEN" ? "text-[var(--color-warn)]" : "text-[var(--color-ok)]")}>#{s.ledgerId}</span>
                    {sup && <><span className="text-[var(--color-faint)]">→</span><span className="text-[var(--color-ok)]">#{sup.to.ledgerId}</span></>}
                    <span className="ml-auto text-[var(--color-faint)]">{s.status === "OPEN" ? "OPEN" : sup ? `v${sup.to.version}` : `v${s.version}`}</span>
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[var(--color-fg-2)]">{s.decision.replace(/\s*\[Condition added by [^\]]+\]\s*:?\s*/gi, " · ").replace(/[`*]/g, "")}</p>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <p className="eyebrow mb-2.5">At the table</p>
        <div className="space-y-1">
          {AGENTS.map((a) => {
            const s = status[a.id];
            const busy = running && (s === "thinking" || s === "speaking");
            return (
              <div key={a.id} className={cn("flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition", busy && "bg-white/[0.04]")}>
                <AgentAvatar agent={a} size={28} status={busy ? s : "online"} />
                <div className="min-w-0 flex-1 leading-tight">
                  <p className="text-[12.5px] font-medium">{a.name}</p>
                  <p className="text-[10.5px]" style={{ color: busy ? a.accent : "var(--color-faint)" }}>
                    {busy ? (s === "thinking" ? "anafikiri / anatafuta…" : "anaongea…") : `zamu ${turnsOf(a.id)}`}
                  </p>
                </div>
                <span className="font-mono text-[10px]" style={{ color: a.accent }}>{a.chip}</span>
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <p className="eyebrow mb-2.5">Background</p>
        <div className="space-y-1.5 rounded-xl border border-[var(--color-line)] bg-white/[0.015] p-2.5 text-[11.5px]">
          <p className={cn("flex items-center gap-2", stage.background && running ? "shimmer-text font-medium" : "text-[var(--color-faint)]")}>
            {!(stage.background && running) && <Circle size={10} />} {stage.background && running ? stage.background : "Hakuna kazi ya background sasa hivi"}
          </p>
        </div>
      </section>

      <section>
        <div className="mb-2.5 flex items-center justify-between">
          <p className="eyebrow">Evidence</p>
          <span className="font-mono text-[10.5px] text-[var(--color-faint)]">{sources.length}</span>
        </div>
        {sources.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--color-line)] px-3 py-4 text-center text-[11.5px] text-[var(--color-faint)]">Sources zinaonekana hapa agents wakitafiti</p>
        ) : (
          <div className="space-y-1.5">
            {sources.map((s, i) => (
              <a key={`${s.url}#${i}`} href={s.url} target="_blank" rel="noreferrer" className="flex items-start gap-2.5 rounded-xl border border-[var(--color-line)] bg-white/[0.015] p-2.5 transition hover:bg-white/[0.04] animate-[rise_0.4s_both]">
                <span className="grid h-[18px] w-[18px] shrink-0 place-items-center rounded-md bg-white/[0.07] font-mono text-[10px] text-[var(--color-fg-2)]">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[12px] font-medium text-[var(--color-fg-2)]">{s.title}</p>
                  <p className="text-[10.5px] text-[var(--color-faint)]">{domainOf(s.url)} · via {getAgent(s.agent)!.name}</p>
                </div>
              </a>
            ))}
          </div>
        )}
      </section>
    </div>
  );

  /* ================= SESSION ================= */
  return (
    <div className="flex h-[calc(100dvh-56px)] min-h-0">
      <div className="relative flex min-w-0 flex-1 flex-col">
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none">
          <div className="mx-auto max-w-[860px] px-4 pb-10 sm:px-6">
            <StageRail stage={stage} agenda={agendaList} live={running} />
            <div className="pt-5">
              {items.length === 0 && conn === "connecting" && (
                <p className="flex items-center justify-center gap-2 py-16 text-[12.5px] text-[var(--color-muted)]"><Loader2 size={14} className="anim-spin" /> {mode === "replay" ? "Inapakia session…" : "Inaunganisha na engine…"}</p>
              )}
              <StageStream items={items} onResume={() => resumeId && board.resume(resumeId)} sessionId={board.sessionId} />
            </div>
          </div>
        </div>

        {!atBottom && (
          <button onClick={() => { const el = scrollRef.current; if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" }); }} className="glass absolute bottom-28 left-1/2 z-30 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--color-fg-2)] shadow-lg">
            <ArrowDown size={13} /> Latest
          </button>
        )}

        <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 sm:px-6">
          {mode === "live" && conn === "detached" && board.runnerId && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2 text-[12px] text-[var(--color-muted)]">
              <PlugZap size={13} className="text-[var(--color-warn)]" />
              <span className="min-w-0 flex-1">Umejitenga na stream — mjadala unaweza kuwa bado unaendelea kwenye server.</span>
              <button onClick={() => board.attach(board.runnerId!)} className="btn-white h-7 rounded-lg px-2.5 text-[11.5px] font-medium">Attach</button>
            </div>
          )}
          {/* R16.1 — Detach = simama kabisa; Resume = endelea pale pale */}
          {(conn === "pausing" || (mode === "live" && conn === "paused")) && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2 text-[12px] text-[var(--color-muted)]">
              {conn === "pausing" ? <Loader2 size={13} className="anim-spin text-[var(--color-warn)]" /> : <Pause size={13} className="text-[var(--color-warn)]" />}
              <span className="min-w-0 flex-1">{conn === "pausing" ? "Inasimamisha mjadala…" : "Mjadala umesimamishwa — hakuna agent anayeendelea. Utaendelea pale pale ulipoishia."}</span>
              {conn === "paused" && resumeId && (
                <button onClick={() => board.resume(resumeId)} className="btn-white flex h-7 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-medium"><Play size={11} /> Resume</button>
              )}
            </div>
          )}
          {/* R20 — session iliyokatika (mtandao/server): kinachokosekana + Endeleza (inakamilisha kilichobaki tu) */}
          {mode === "replay" && conn === "closed" && board.unfinished.length > 0 && board.sessionId && !board.pausedInfo && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2 text-[12px] text-[var(--color-muted)]">
              <AlertTriangle size={13} className="shrink-0 text-[var(--color-warn)]" />
              <span className="min-w-0 flex-1">Haijakamilika: <span className="text-[var(--color-fg-2)]">{board.unfinished.join(" · ")}</span></span>
              <button onClick={() => board.resume(board.sessionId!)} className="btn-white flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-medium"><Play size={11} /> Endeleza</button>
            </div>
          )}
          {mode !== "live" && board.pausedInfo && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center gap-2 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2 text-[12px] text-[var(--color-muted)]">
              <Pause size={13} className="shrink-0 text-[var(--color-warn)]" />
              <span className="min-w-0 flex-1 truncate">Mjadala umesimamishwa: <span className="text-[var(--color-fg-2)]">{board.pausedInfo.project}</span></span>
              <button onClick={() => board.resume(board.pausedInfo!.id)} className="btn-white flex h-7 shrink-0 items-center gap-1 rounded-lg px-2.5 text-[11.5px] font-medium"><Play size={11} /> Resume</button>
            </div>
          )}
          {conn === "error" && board.error && (
            <div className="mx-auto mb-2 flex max-w-[860px] items-center gap-2 rounded-xl border border-[rgb(248_113_113/0.3)] bg-[rgb(248_113_113/0.06)] px-3 py-2 text-[12px] text-[var(--color-fg-2)]">
              <AlertTriangle size={13} className="text-[var(--color-bad)]" />
              <span className="min-w-0 flex-1">{board.error}</span>
            </div>
          )}
          <PromptComposer
            size="md"
            running={running}
            onStop={board.detach}
            stopLabel="Detach"
            stopTitle="Simamisha mjadala kabisa — hakuna agent atakayeendelea mpaka ubonyeze Resume (utaendelea pale pale ulipoishia)."
            onSubmit={(t) => board.start(t)}
            placeholder={running ? "Board iko kikaoni — engine haipokei maoni katikati ya mjadala" : "Anzisha session mpya…"}
            className="mx-auto max-w-[860px]"
          />
        </div>
      </div>

      <aside className="hidden w-[320px] shrink-0 overflow-y-auto border-l border-[var(--color-line)] bg-[rgb(12_14_19/0.5)] p-4 xl:block">
        <div className="space-y-5">{PanelStats}{PanelBody}</div>
      </aside>
      {panel && (
        <div className="fixed inset-0 z-[60] flex justify-end bg-black/50 xl:hidden" onClick={() => setPanel(false)}>
          <aside onClick={(e) => e.stopPropagation()} className="surface-solid anim-slide-right m-2 flex min-h-0 w-full max-w-[340px] flex-col overflow-hidden rounded-2xl">
            <div className="shrink-0 border-b border-[var(--color-line)] bg-[rgb(12_14_19/0.92)] p-4 backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <p className="text-[14px] font-semibold">Session details</p>
                <button onClick={() => setPanel(false)} className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5" aria-label="Close session details">
                  <X size={16} />
                </button>
              </div>
              <div className="mt-3">{PanelStats}</div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">{PanelBody}</div>
          </aside>
        </div>
      )}
    </div>
  );
}
