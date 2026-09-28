"use client";
import Link from "next/link";
import { use, useEffect, useRef, useState } from "react";
import { notFound } from "next/navigation";
import { ArrowLeft, BrainCircuit, Cpu, Hourglass, Sparkles, Trash2, Coins, Cloud, CloudOff, HardDrive, X } from "lucide-react";
import { AGENTS, getAgent } from "@/lib/team";
import { useApp } from "@/components/shell/AppState";
import { AgentAvatar } from "@/components/ui/AgentAvatar";
import { PromptComposer } from "@/components/ui/PromptComposer";
import { useLiveModels } from "@/components/shell/useLiveModels";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { ACCOUNTS } from "@/lib/usage/accounts";
import { UserPrompt } from "@/components/board/parts";
import { ChatMessage, type ChatTurn } from "@/components/agents/ChatMessage";
import { useAgentChat, type ChatMsg, type TurnMeta } from "@/lib/chat/useAgentChat";
import { DEFAULT_TZ } from "@/lib/time";
import { compact } from "@/lib/utils";

/* Chumba binafsi cha agent — kimeunganishwa na POST /api/agent (engine halisi: think → search → verify → answer).
 * Historia: Appwrite (agent_conversations) kupitia useAgentChat; bila collection → localStorage. */

type Wire =
  | { type: "thinking"; text: string }
  | { type: "search"; query: string }
  | { type: "sources"; sources: { title?: string; url: string; content?: string }[] }
  | { type: "search_error"; message: string }
  | { type: "token"; text: string }
  | { type: "done" }
  | { type: "error"; message: string }
  | { type: "log"; entry: { type: "info" | "success" | "warning" | "error" | "api" | "search" | "system"; message: string; timestamp: string; at?: number } }
  | { type: "usage"; sessionRequests: number; totalTokens: number }
  | { type: "usage_live"; prompt: number; completion: number }
  | { type: "usage_turn"; prompt: number; completion: number; total: number; exact: boolean }
  | { type: "memory"; state: "start" | "saved" | "none" | "fail" }
  | { type: "action"; action: "start_board"; task: string }
  | { type: "capacity"; waiting: boolean; until?: number | null };

const splitThink = (t: string) => t.replace(/<\/?think>/gi, "").split(/\n{2,}/).map((x) => x.trim()).filter(Boolean);
const nid = () => Math.random().toString(36).slice(2, 12);

export default function AgentRoom({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const agent = getAgent(id);
  const { setStatus, bumpUsage, addLog, stats, modelOf, config, refresh } = useApp();
  const chat = useAgentChat(agent?.id);
  const { msgs, setMsgs, cache } = chat;
  const [busy, setBusy] = useState(false);
  const [regenId, setRegenId] = useState<string | null>(null);
  const [liveTok, setLiveTok] = useState<number | null>(null);
  /** Agent Brain: agent anaandika Self Memory yake (background — shimmer tu, maudhui hayaonyeshwi) */
  const [memNote, setMemNote] = useState<null | "run" | "saved" | "none" | "fail">(null);
  /** R16 Capacity Broker: lanes zote zimejaa kwa sekunde chache → shimmer "anasubiri nafasi" (hakuna ujumbe wa quota) */
  const [waitNote, setWaitNote] = useState(false);
  const liveModels = useLiveModels();
  /** R15: Clear inauliza kwanza (popup) — Delete / Cancel */
  const [askClear, setAskClear] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const ctrl = useRef<AbortController | null>(null);

  useEffect(() => { if (!busy) cache(msgs); }, [msgs, busy, cache]);
  useEffect(() => { scroll.current?.scrollTo({ top: scroll.current.scrollHeight }); }, [msgs]);
  useEffect(() => () => { ctrl.current?.abort(); }, []);
  if (!agent) return notFound();

  const act = stats?.perAgentActivity[agent.engineId];
  const liveModel = liveModels?.[agent.id];
  const model = liveModel?.model || modelOf(agent.id);
  const tz = config?.timezone || DEFAULT_TZ;

  /** Tuma swali jipya, au (regenerate) tengeneza upya jibu la mwisho kwa swali lile lile. */
  const run = async (q: string, base: ChatMsg[], userMsg: ChatMsg | null) => {
    const c = new AbortController();
    ctrl.current = c;
    setBusy(true);
    setLiveTok(0);
    // messages 60 za karibuni: jibu linatumia 14 verbatim; za zamani → rolling checkpoint ya server;
    // memory ya chat (kila 20) inasoma 24 za mwisho. offset = messages za thread zilizo kabla ya dirisha.
    const convoAll = base.filter((m) => m.kind === "user" || (m.kind === "turn" && m.content.trim()));
    const offset = Math.max(0, convoAll.length - 60);
    const history = convoAll
      .slice(-60)
      .map((m) => (m.kind === "user" ? { role: "user", content: m.text } : { role: "assistant", content: (m as ChatTurn).content }));
    let turn: ChatTurn = { kind: "turn", id: nid(), agent: agent.id, thinking: [], thinkShown: 0, sources: [], content: "", phase: "thinking", seconds: 0, feedback: null, model };
    const seq = base.length + (userMsg ? 1 : 0);
    setMsgs([...base, ...(userMsg ? [userMsg] : []), turn]);
    if (userMsg) chat.persist(userMsg, base.length);
    // turn ya sasa inahifadhiwa hapa pia (setState updater si ya kuaminika kusoma hali ya mwisho)
    const patch = (p: Partial<ChatTurn> | ((t: ChatTurn) => Partial<ChatTurn>)) => {
      turn = { ...turn, ...(typeof p === "function" ? p(turn) : p) };
      const snap = turn;
      setMsgs((m) => m.map((x) => (x.id === snap.id ? snap : x)));
    };
    setStatus(agent.id, "thinking");
    const t0 = Date.now();
    let think = "";
    let answered = false;
    let finished = false;
    const meta: TurnMeta = { status: "done", model, prompt: 0, completion: 0, total: 0, exact: true, requests: 0 };
    let turnsTok = 0;
    const finish = (extra?: Partial<ChatTurn>, status: TurnMeta["status"] = "done") => {
      if (finished) return;
      finished = true;
      patch((t) => ({ phase: "done", thinkShown: t.thinking.length, seconds: t.seconds || Math.round((Date.now() - t0) / 1000), ...extra }));
      setStatus(agent.id, "online");
      setBusy(false);
      setWaitNote(false);
      window.dispatchEvent(new Event("xmd:model-refresh"));
      setRegenId(null);
      meta.status = status;
      if (!meta.total) meta.total = (meta.prompt || 0) + (meta.completion || 0);
      if (turn.content.trim() || turn.thinking.length) {
        chat.persist(turn, seq, meta).then((ok) => { if (ok) refresh("stats"); });
      }
    };
    const handle = (e: Wire) => {
      switch (e.type) {
        case "thinking":
          think += e.text;
          { const parts = splitThink(think); patch({ thinking: parts, thinkShown: parts.length }); }
          break;
        case "search":
          patch({ phase: "searching", search: e.query });
          break;
        case "sources":
          patch({ sources: e.sources.filter((x) => x?.url).map((x) => ({ title: x.title || x.url, url: x.url, snippet: x.content })) });
          break;
        case "search_error":
          addLog("warning", `${agent.name}: search imeshindwa — ${e.message}`);
          break;
        case "token":
          if (!answered) {
            answered = true;
            setStatus(agent.id, "speaking");
            patch({ phase: "answering", seconds: Math.round((Date.now() - t0) / 1000) });
          }
          patch((t) => ({ content: t.content + e.text }));
          break;
        case "usage_live":
          setLiveTok(turnsTok + e.prompt + e.completion);
          break;
        case "usage_turn":
          turnsTok += e.total;
          meta.prompt! += e.prompt;
          meta.completion! += e.completion;
          meta.exact = meta.exact && e.exact;
          setLiveTok(turnsTok);
          break;
        case "usage":
          setLiveTok(e.totalTokens);
          meta.total = e.totalTokens;
          meta.requests = e.sessionRequests;
          bumpUsage(agent.id, e.totalTokens, e.sessionRequests);
          break;
        case "log":
          addLog(e.entry.type, e.entry.message, e.entry.at ? new Date(e.entry.at).toLocaleTimeString("en-GB", { timeZone: tz, hour12: false }) : e.entry.timestamp);
          break;
        case "error":
          addLog("error", `${agent.name}: ${e.message}`);
          finish({ content: turn.content || `⚠️ ${e.message}` }, "error");
          break;
        case "done":
          finish();
          break;
        case "action":
          if (e.action === "start_board") patch({ action: { kind: "start_board", task: e.task } });
          break;
        case "capacity":
          setWaitNote(e.waiting);
          break;
        case "memory":
          if (e.state === "start") setMemNote("run");
          else { setMemNote(e.state); setTimeout(() => setMemNote(null), 2600); }
          break;
      }
    };
    try {
      const res = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentId: agent.engineId, prompt: q, messages: history, offset, count: seq + 1, threadId: chat.threadId() }),
        signal: c.signal,
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j?.error || `Server imejibu ${res.status}`);
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try { handle(JSON.parse(line) as Wire); } catch {}
        }
      }
      finish();
    } catch (err: any) {
      if (err?.name === "AbortError") finish(undefined, "stopped");
      else { addLog("error", `${agent.name}: ${err?.message || err}`); finish({ content: turn.content || `⚠️ ${err?.message || "Imeshindwa kuwasiliana na server"}` }, "error"); }
    }
  };

  const send = (q: string) => {
    if (busy) return;
    run(q, msgs, { kind: "user", id: `u${nid()}`, text: q });
  };

  /** Regenerate: jibu la mwisho linaondolewa (pia Appwrite) na swali lile lile linatumwa tena. */
  const regenerate = () => {
    if (busy) return;
    const li = msgs.length - 1;
    const last = msgs[li];
    const prev = msgs[li - 1];
    if (!last || last.kind !== "turn" || !prev || prev.kind !== "user") return;
    setRegenId(last.id);
    chat.remove(last.id);
    run(prev.text, msgs.slice(0, li - 1).concat(prev), null);
  };

  const stop = () => {
    ctrl.current?.abort();
  };

  /** Mwisho wa thread (Clear): agent anaandika Self Memory yake kutoka mazungumzo haya (background). */
  const endThreadMemory = () => {
    const convo = msgs
      .filter((m) => m.kind === "user" || (m.kind === "turn" && (m as ChatTurn).content.trim()))
      .slice(-24)
      .map((m) => (m.kind === "user" ? { role: "user", content: m.text } : { role: "assistant", content: (m as ChatTurn).content }));
    if (convo.length < 4) return;
    addLog("info", `🧠 ${agent.name}: anaandika Self Memory kutoka thread hii (background)…`);
    fetch("/api/agent/memory", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ agentId: agent.engineId, threadId: chat.threadId(), messages: convo }), keepalive: true })
      .then((r) => r.json())
      .then((j: { status?: string }) => addLog(j.status === "saved" ? "success" : "info", `🧠 ${agent.name}: Self Memory — ${j.status === "saved" ? "imesasishwa" : j.status === "none" ? "hakuna jipya (NO_MEMORY)" : j.status === "skipped" ? "thread fupi, imerukwa" : "imeshindwa"}`))
      .catch(() => {});
  };

  return (
    <div className="flex h-[calc(100dvh-56px)] min-h-0">
      {/* profile column */}
      <aside className="hidden w-[330px] shrink-0 overflow-y-auto border-r border-[var(--color-line)] lg:block">
        <div className="relative aspect-square overflow-hidden" style={{ maskImage: "linear-gradient(180deg,#000 60%,transparent 100%)" }}>
          <div className="absolute inset-0" style={{ background: `radial-gradient(70% 60% at 50% 35%, rgb(${agent.rgb} / 0.4), transparent 70%), #050608` }} />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={agent.avatar} alt={agent.name} className="relative h-full w-full scale-[1.2] object-cover" style={{ maskImage: "linear-gradient(180deg,#000 50%,transparent 100%)" }} />
          <Link href="/agents" className="glass absolute left-3 top-3 flex h-8 items-center gap-1.5 rounded-full px-3 text-[12px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"><ArrowLeft size={13} /> All agents</Link>
        </div>
        <div className="-mt-16 space-y-5 px-5 pb-6">
          <div className="relative">
            <span className="rounded-md px-1.5 py-0.5 font-mono text-[10.5px] font-bold" style={{ color: agent.accent, background: `rgb(${agent.rgb} / 0.14)` }}>{agent.chip}</span>
            <h1 className="mt-2 text-[26px] font-semibold tracking-[-0.03em]">{agent.name}</h1>
            <p className="text-[13px] font-medium" style={{ color: agent.accent }}>{agent.role}</p>
            <p className="mt-3 text-[13px] leading-[21px] text-[var(--color-fg-2)]">{agent.bio}</p>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[["Sessions", act?.sessions], ["Michango", act?.messages], ["Sources", act?.sources]].map(([l, v]) => (
              <div key={l as string} className="surface rounded-xl px-2 py-2.5 text-center">
                <p className="font-mono text-[14px] font-semibold">{stats ? (v ?? 0) : "—"}</p>
                <p className="text-[10px] text-[var(--color-faint)]">{l}</p>
              </div>
            ))}
          </div>
          <div>
            <p className="eyebrow mb-2">Skills</p>
            <div className="flex flex-wrap gap-1.5">
              {agent.skills.map((s) => <span key={s} className="rounded-lg border border-[var(--color-line)] bg-white/[0.02] px-2 py-1 text-[11.5px] text-[var(--color-fg-2)]">{s}</span>)}
            </div>
          </div>
          <div className="surface flex items-center gap-3 rounded-xl p-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-white/[0.05] text-[var(--color-muted)]"><Cpu size={15} /></span>
            <div className="leading-tight">
              <p className="text-[10.5px] text-[var(--color-faint)]">Model</p>
              <p key={liveModel?.model || model} className="break-all font-mono text-[12px] animate-[rise_0.35s_both]">{liveModel?.model || model || "—"}</p>
              {liveModel && <p className="mt-0.5 text-[10.5px]" style={{ color: ACCOUNTS.find((x) => x.id === liveModel.account)?.color }}>{liveModel.label}</p>}
            </div>
          </div>
          <div>
            <p className="eyebrow mb-2">Other agents</p>
            <div className="flex gap-2">
              {AGENTS.filter((a) => a.id !== agent.id).map((a) => (
                <Link key={a.id} href={`/agents/${a.id}`} title={a.name}><AgentAvatar agent={a} size={34} /></Link>
              ))}
            </div>
          </div>
        </div>
      </aside>

      {/* chat column */}
      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-3 border-b border-[var(--color-line)] px-3 py-2.5 sm:px-6">
          <Link href="/agents" className="grid h-8 w-8 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 lg:hidden"><ArrowLeft size={16} /></Link>
          <AgentAvatar agent={agent} size={32} status="online" />
          <div className="min-w-0 flex-1 leading-tight">
            <p className="text-[14px] font-semibold">{agent.name}</p>
            <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--color-muted)]">
              <span className="truncate"><span className="hidden sm:inline">Private room · </span>{agent.role}</span>
              {chat.stored !== null && (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[var(--color-line)] px-1.5 py-px text-[10px]"
                  title={chat.stored ? "Historia imehifadhiwa Appwrite (agent_conversations · 6ab6d7990026978d4ba9)" : chat.reason || "Historia iko kwenye kivinjari hiki tu"}
                >
                  {chat.stored ? <Cloud size={10} className="text-[var(--color-ok)]" /> : <HardDrive size={10} />}
                  {chat.stored ? "Appwrite" : "Browser"}
                </span>
              )}
            </p>
          </div>
          {liveTok !== null && (
            <span className="flex items-center gap-1 rounded-full border border-[var(--color-line)] px-2 py-0.5 font-mono text-[10.5px] text-[var(--color-muted)]" title="Tokens za jibu hili (live)">
              <Coins size={11} /> {compact(liveTok)}
            </span>
          )}
          {msgs.length > 0 && (
            <button onClick={() => setAskClear(true)} aria-label="Clear chat" title="Clear chat" className="btn-ghost flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[12px]"><Trash2 size={13} /> <span className="hidden sm:inline">Clear</span></button>
          )}
        </div>
        {chat.saveError && (
          <div role="alert" className="flex shrink-0 items-start gap-2 bg-[color-mix(in_oklab,var(--color-warn)_12%,transparent)] px-3 py-2 text-[11.5px] leading-snug text-[var(--color-warn)] sm:px-6">
            <CloudOff size={13} className="mt-px shrink-0" />
            <span className="min-w-0 flex-1 break-words">Appwrite haikuhifadhi ujumbe: {chat.saveError}</span>
            <button onClick={chat.dismissError} aria-label="Funga" className="shrink-0 rounded p-0.5 hover:bg-white/10"><X size={13} /></button>
          </div>
        )}

        <div ref={scroll} className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-x-none">
          {msgs.length === 0 ? (
            <div className="mx-auto flex min-h-full max-w-[640px] flex-col items-center justify-center px-4 py-10 text-center">
              <div className="relative animate-[rise_0.5s_both]">
                <div className="absolute inset-0 -z-10 scale-150 rounded-full blur-3xl" style={{ background: `rgb(${agent.rgb} / 0.35)` }} />
                <AgentAvatar agent={agent} size={88} />
              </div>
              <h2 className="mt-5 text-[22px] font-semibold tracking-tight animate-[rise_0.5s_0.05s_both]">Habari Mkuu, I&apos;m {agent.name}.</h2>
              <p className="mt-1.5 max-w-[420px] text-[13.5px] leading-6 text-[var(--color-muted)] animate-[rise_0.5s_0.1s_both]">{agent.bio}</p>
              <div className="mt-7 grid w-full gap-2 sm:grid-cols-3 animate-[rise_0.5s_0.15s_both]">
                {agent.starters.map((s) => (
                  <button key={s} onClick={() => send(s)} className="surface group rounded-2xl p-3.5 text-left transition hover:border-white/15">
                    <Sparkles size={14} style={{ color: agent.accent }} />
                    <p className="mt-2 text-[12.5px] leading-5 text-[var(--color-fg-2)] group-hover:text-[var(--color-fg)]">{s}</p>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="mx-auto max-w-[780px] space-y-6 px-3 py-6 sm:px-6">
              {msgs.map((m, i) =>
                m.kind === "user" ? (
                  <UserPrompt key={m.id} text={m.text} />
                ) : (
                  <ChatMessage
                    key={m.id}
                    turn={m}
                    canRegenerate={i === msgs.length - 1 && !busy && msgs[i - 1]?.kind === "user"}
                    regenerating={regenId !== null}
                    onRegenerate={regenerate}
                    onFeedback={(f) => chat.feedback(m.id, f)}
                  />
                ),
              )}
            </div>
          )}
        </div>

        <div className="shrink-0 px-3 pb-[max(12px,env(safe-area-inset-bottom))] pt-2 sm:px-6">
          {waitNote && busy && (
            <div className="mx-auto mb-1.5 flex max-w-[780px] animate-[fade_0.3s_both] items-center gap-2 px-1 text-[11.5px]" aria-live="polite">
              <Hourglass size={13} className="animate-pulse text-[#a78bfa]" />
              <span className="shimmer-text font-medium">{agent.name} anasubiri nafasi…</span>
            </div>
          )}
          {memNote && (
            <div className="mx-auto mb-1.5 flex max-w-[780px] animate-[fade_0.3s_both] items-center gap-2 px-1 text-[11.5px]" aria-live="polite">
              <BrainCircuit size={13} className={memNote === "run" ? "animate-pulse text-[#a78bfa]" : "text-[var(--color-faint)]"} />
              <span className={memNote === "run" ? "shimmer-text font-medium" : "text-[var(--color-muted)]"}>
                {memNote === "run" ? `${agent.name} anaandika kumbukumbu binafsi…` : memNote === "saved" ? `${agent.name}: kumbukumbu imesasishwa` : memNote === "none" ? `${agent.name}: hakuna jipya la kukumbuka` : `${agent.name}: kumbukumbu haikuhifadhiwa`}
              </span>
            </div>
          )}
          <ConfirmDialog
            open={askClear}
            title="Are you sure you want to delete this message?"
            message={`Mazungumzo yote ya chumba hiki na ${agent.name} yatafutwa. Hatua hii hairudishwi.`}
            confirmLabel="Delete"
            cancelLabel="Cancel"
            onCancel={() => setAskClear(false)}
            onConfirm={() => { setAskClear(false); stop(); endThreadMemory(); chat.clear(); setLiveTok(null); }}
          />
          <PromptComposer size="md" running={busy} onStop={stop} onSubmit={send} placeholder={`Message ${agent.name}…`} className="mx-auto max-w-[780px]" />
        </div>
      </div>
    </div>
  );
}
