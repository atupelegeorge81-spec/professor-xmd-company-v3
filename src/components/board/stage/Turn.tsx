"use client";
import React, { useState } from "react";
import { ArrowUpRight, Check, Copy, FileText, GitBranch, Gavel, Handshake, Hourglass, Puzzle, RotateCcw, Undo2, Vote } from "lucide-react";
import type { AgentId } from "@/lib/team";
import type { ChairItem, ConsensusItem, Signal, TurnItem } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { Markdown } from "../../ui/Markdown";
import { SourceChips } from "../parts";
import { Inline, Lane, Spinner, TONE, Tag, ag, type Tone } from "./kit";
import { ThinkTrace } from "./ThinkTrace";
import { uniqueByUrl } from "@/lib/searchHygiene";

/* ============================================================== parser
 * Engine inatumia maneno maalum kwenye jibu la agent. Tunayageuza kuwa blocks. */
type Block =
  | { t: "p"; text: string }
  | { t: "signal"; sig: Signal; text: string }
  | { t: "proposal" | "updated"; decision: string; rationale?: string; tradeoff?: string; evidence?: string }
  | { t: "agree"; text: string }
  | { t: "research"; q: string }
  | { t: "read"; url: string }
  | { t: "rejected"; text: string };

const KEY = /^(PROPOSED DECISION|UPDATED DECISION|RATIONALE|TRADE-OFF|EVIDENCE|AGREE|RESEARCH_REQUEST|READ_SOURCE|OBJECTION REJECTED|CLARIFY|OFF_TOPIC|CONTRADICTION|DISAGREE|INSUFFICIENT_EVIDENCE|I_WAS_WRONG|WAIT|SKILL_REQUEST):\s*(.*)$/;

export function parseTurn(src: string): Block[] {
  const out: Block[] = [];
  let para: string[] = [];
  const flush = () => { if (para.join("").trim()) out.push({ t: "p", text: para.join("\n").trim() }); para = []; };
  for (const line of src.split("\n")) {
    const m = line.match(KEY);
    if (!m) { if (!line.trim()) flush(); else para.push(line); continue; }
    flush();
    const [, k, v] = m;
    const last = out[out.length - 1];
    if (k === "PROPOSED DECISION") out.push({ t: "proposal", decision: v });
    else if (k === "UPDATED DECISION") out.push({ t: "updated", decision: v });
    else if (k === "RATIONALE" || k === "TRADE-OFF" || k === "EVIDENCE") {
      const f = k === "RATIONALE" ? "rationale" : k === "TRADE-OFF" ? "tradeoff" : "evidence";
      if (last && (last.t === "proposal" || last.t === "updated")) last[f] = v;
      else out.push({ t: "p", text: `**${k}:** ${v}` });
    } else if (k === "AGREE") out.push({ t: "agree", text: v });
    else if (k === "RESEARCH_REQUEST") out.push({ t: "research", q: v });
    else if (k === "READ_SOURCE") out.push({ t: "read", url: v.replace(/[<>]/g, "").trim() });
    else if (k === "OBJECTION REJECTED") out.push({ t: "rejected", text: v });
    else out.push({ t: "signal", sig: k as Signal, text: v });
  }
  flush();
  return out;
}

/* Judgment signals (brain parseSignals) — kila moja lina rangi na maana */
export const SIGNAL: Record<Signal, { label: string; tone: Tone }> = {
  CLARIFY: { label: "Clarify", tone: "sky" },
  OFF_TOPIC: { label: "Off topic", tone: "warn" },
  CONTRADICTION: { label: "Contradiction", tone: "bad" },
  DISAGREE: { label: "Disagree", tone: "bad" },
  INSUFFICIENT_EVIDENCE: { label: "Evidence haitoshi", tone: "warn" },
  I_WAS_WRONG: { label: "Nilikosea", tone: "violet" },
  WAIT: { label: "Subiri", tone: "warn" },
  SKILL_REQUEST: { label: "Skill request", tone: "violet" },
};

/* ============================================================== message
 * Muonekano wa BoardMessage ya v2: avatar + mstari, jina + role pill, ThinkingBlock, jibu, source chips. */
export function StageMessage({ it }: { it: TurnItem }) {
  const a = ag(it.agent);
  const live = it.phase !== "done";
  const blocks = parseTurn(it.content);
  const answering = it.phase === "answering";
  const [copied, setCopied] = useState(false);
  // R12: vyanzo vya gate + vya RESEARCH_REQUEST/READ_SOURCE za zamu hii (bila marudio)
  const sources = uniqueByUrl([...(it.search?.sources ?? []), ...(it.followUps ?? []).flatMap((f) => f.sources)]);

  return (
    <article className="group relative flex animate-[rise_0.45s_both] gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <AgentAvatar agent={a} size={36} status={live ? "speaking" : undefined} />
        <span className="mt-2 w-px flex-1 bg-gradient-to-b from-[var(--color-line-strong)] to-transparent" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold">{a.name}</span>
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: a.accent, background: `rgb(${a.rgb} / 0.1)` }}>{a.role}</span>
          {it.role === "responder" && <Tag tone="bad">jibu la pingamizi</Tag>}
          {it.skill && (
            <Tag tone={it.skill.found ? "violet" : "warn"}>
              <Puzzle size={10.5} /> {it.skill.name} · {it.skill.found ? "loaded" : "haipo"}
            </Tag>
          )}
          {live && it.phase !== "retrying" && (
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: a.accent }}>
              <span className="typing-dots flex gap-0.5"><span /><span /><span /></span>
            </span>
          )}
        </header>

        {(it.thinking.length > 0 || it.search) && <ThinkTrace turn={it} accent={a.accent} />}

        {it.phase === "retrying" && it.retry && (
          <div className="mb-3 flex items-center gap-2.5 rounded-xl border border-[rgb(251_191_36/0.22)] bg-[rgb(251_191_36/0.06)] px-3 py-2 text-[12.5px] text-[var(--color-fg-2)] animate-[rise_0.3s_both]">
            <Spinner size={12} color={TONE.warn.c} />
            <span className="shimmer-text font-medium">Jibu tupu/limekatika — retry {it.retry.n}/{it.retry.max}</span>
            <span className="ml-auto truncate font-mono text-[10.5px] text-[var(--color-muted)]">{it.retry.model}</span>
          </div>
        )}

        {(answering || it.phase === "done") && (
          <>
            <div className="space-y-2.5">
              {blocks.map((b, i) => (
                <BlockView key={i} b={b} agent={it.agent} caret={answering && i === blocks.length - 1} />
              ))}
            </div>
            {it.phase === "done" && !!it.followUps?.length && (
              <div className="mt-3">
                {it.followUps.map((f, i) => (
                  <ThinkTrace key={i} standalone accent={a.accent} turn={{ thinking: [], thinkShown: 0, seconds: -1, phase: f.done ? "done" : "searching", search: f }} />
                ))}
              </div>
            )}
            {it.phase === "done" && sources.length > 0 && <div className="mt-3"><SourceChips sources={sources} /></div>}
            {it.phase === "done" && (
              <div className="mt-2 flex items-center gap-0.5 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100">
                <button onClick={() => { navigator.clipboard?.writeText(it.content); setCopied(true); setTimeout(() => setCopied(false), 1200); }} className="grid h-7 w-7 place-items-center rounded-md text-[var(--color-faint)] hover:bg-white/5 hover:text-[var(--color-fg)]" aria-label="Copy">
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}

function BlockView({ b, agent, caret }: { b: Block; agent: AgentId; caret: boolean }) {
  const a = ag(agent);
  const c = caret ? "caret" : "";
  switch (b.t) {
    case "p":
      return <div className={cn(caret && "[&_.prose-xmd>*:last-child]:caret")}><Markdown text={b.text} accent={a.accent} /></div>;
    case "signal": {
      const s = SIGNAL[b.sig];
      return (
        <div className="flex flex-wrap items-start gap-2">
          <Tag tone={s.tone} className="mt-[2px] uppercase">{s.label}</Tag>
          <p className={cn("min-w-0 flex-1 text-[14px] leading-6 text-[var(--color-fg-2)]", c)}><Inline text={b.text} accent={a.accent} /></p>
        </div>
      );
    }
    case "proposal":
    case "updated": {
      // maandishi ya kawaida (si kadi): lebo ndogo ya rangi + aya za kawaida zinazostream
      const upd = b.t === "updated";
      const col = upd ? TONE.violet.c : a.accent;
      const fields = ([["Sababu", b.rationale], ["Trade-off", b.tradeoff], ["Evidence", b.evidence]] as const).filter(([, v]) => v);
      return (
        <div className="space-y-1.5">
          <Label color={col} icon={upd ? <GitBranch size={12} /> : <Vote size={12} />}>{upd ? "Uamuzi uliosasishwa" : "Pendekezo"}</Label>
          <p className={cn("text-[15px] font-medium leading-7 text-[var(--color-fg)]", !fields.length && c)}><Inline text={b.decision} accent={col} /></p>
          {fields.map(([k, v], i) => (
            <p key={k} className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", i === fields.length - 1 && c)}>
              <span className="font-semibold text-[var(--color-fg)]">{k}:</span> <Inline text={v!} accent={col} />
            </p>
          ))}
        </div>
      );
    }
    case "agree": {
      const [head, cond] = splitCondition(b.text);
      return (
        <div className="space-y-1.5">
          <Label color={TONE.ok.c} icon={<Check size={12} strokeWidth={3} />}>Agree</Label>
          <p className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", !cond && c)}><Inline text={head} /></p>
          {cond && (
            <p className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", c)}>
              <span className="font-semibold text-[var(--color-ok)]">Sharti:</span> <span className="text-[var(--color-fg)]"><Inline text={cond} /></span>
            </p>
          )}
        </div>
      );
    }
    case "research":
      return (
        <p className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", c)}>
          <span className="mr-1.5 inline-flex translate-y-[1px] items-center gap-1 font-semibold" style={{ color: TONE.violet.c }}><ArrowUpRight size={13} /> Research request:</span>
          <code className="rounded-md bg-white/[0.06] px-1.5 py-[1px] font-mono text-[12.5px] text-[var(--color-fg)]">{b.q}</code>
        </p>
      );
    case "read":
      return (
        <p className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", c)}>
          <span className="mr-1.5 inline-flex translate-y-[1px] items-center gap-1 font-semibold" style={{ color: TONE.sky.c }}><FileText size={13} /> Read source:</span>
          <code className="break-all rounded-md bg-white/[0.06] px-1.5 py-[1px] font-mono text-[12.5px] text-[var(--color-fg)]">{b.url}</code>
        </p>
      );
    case "rejected":
      return (
        <div className="space-y-1.5">
          <Label color="#7dd3fc" icon={<Undo2 size={12} />}>Pingamizi limekataliwa</Label>
          <p className={cn("text-[14px] leading-6 text-[var(--color-fg-2)]", c)}><Inline text={b.text} accent="#7dd3fc" /></p>
        </div>
      );
  }
}

/** Lebo ndogo ya rangi juu ya aya (badala ya kadi) */
function Label({ color, icon, children }: { color: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color }}>
      {icon} {children}
    </p>
  );
}

function splitCondition(t: string): [string, string | undefined] {
  // engine: "AGREE … [Condition added by X] …"
  const c = t.match(/^(.*?)\s*\[Condition added by [^\]]+\]\s*(.+)$/i);
  if (c) return [c[1].trim() || "Nakubali", c[2]];
  const m = t.match(/^(.*?)[—,-]?\s*kwa sharti( kwamba)?:?\s*(.+)$/i);
  if (!m) return [t, undefined];
  return [m[1].trim().replace(/[—,-]$/, "").trim() || "Nakubali", m[3]];
}

/* ============================================================== consensus
 * engine: proposal parser · approvals Set (reset kwa proposal mpya) · consensus gate · MAX_TURNS */
export function ConsensusTick({ it }: { it: ConsensusItem }) {
  const by = ag(it.by);
  const total = it.owners.length;
  const n = it.approvals.length;
  const tone: Tone = it.event === "reached" ? "ok" : it.event === "exhausted" ? "warn" : it.event === "reset" || it.event === "retract" ? "violet" : "blue";
  const t = TONE[tone];
  const text = {
    proposed: <>Pendekezo <b>v{it.version}</b> la {by.name} liko mezani</>,
    reset: <>{by.name} ameleta <b>v{it.version}</b> — kura za zamani zimefutwa</>,
    agreed: <>{by.name} amekubali</>,
    reached: <>Consensus <b>{n}/{total}</b> — v{it.version} imekubaliwa</>,
    retract: <>{by.name} <b>amekataa</b> — consensus imefunguka, mjadala unaendelea</>,
    exhausted: <>Zamu zimeisha bila consensus — <b>{n}/{total}</b></>,
  }[it.event];
  const Icon = it.event === "reached" ? Handshake : it.event === "exhausted" ? Hourglass : it.event === "reset" || it.event === "retract" ? RotateCcw : Vote;
  return (
    <Lane>
      <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2 text-[12.5px]" style={{ borderColor: `rgb(${t.rgb} / 0.16)`, background: `rgb(${t.rgb} / 0.04)` }}>
        <Icon size={14} style={{ color: t.c }} className="shrink-0" />
        <span className="min-w-0 flex-1 text-[var(--color-muted)] [&_b]:font-semibold [&_b]:text-[var(--color-fg)]">{text}</span>
        <span className="flex shrink-0 items-center gap-1">
          {it.owners.map((o) => {
            const yes = it.approvals.includes(o);
            const g = ag(o);
            return (
              <span key={o} className={cn("relative transition-opacity duration-500", yes ? "opacity-100" : "opacity-35 grayscale")} title={`${g.name}: ${yes ? "amekubali" : "bado"}`}>
                <AgentAvatar agent={g} size={20} ring={false} />
                {yes && <span className="absolute -bottom-1 -right-1 grid h-3 w-3 place-items-center rounded-full bg-[var(--color-ok)] text-black"><Check size={8} strokeWidth={4} /></span>}
              </span>
            );
          })}
          <span className="ml-1.5 font-mono text-[11px] font-semibold" style={{ color: t.c }}>{n}/{total}</span>
        </span>
      </div>
    </Lane>
  );
}

/* ============================================================== chair challenge
 * brain: chairReview → Optimus anaingilia kati kama mwenyekiti (≤2 kwa agenda) */
export function ChairCard({ it }: { it: ChairItem }) {
  const o = ag("optimus");
  const t = ag(it.target);
  const s = SIGNAL[it.reason];
  const typing = it.shown < it.text.length;
  return (
    <article className="relative flex animate-[rise_0.45s_both] gap-3 sm:gap-4">
      <div className="flex flex-col items-center">
        <AgentAvatar agent={o} size={36} status={typing ? "speaking" : undefined} />
        <span className="mt-2 w-px flex-1 bg-gradient-to-b from-[var(--color-line-strong)] to-transparent" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold">{o.name}</span>
          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: o.accent, background: `rgb(${o.rgb} / 0.1)` }}><Gavel size={10.5} /> Mwenyekiti</span>
          <span className="inline-flex items-center gap-1.5 text-[12px] text-[var(--color-muted)]">→ <AgentAvatar agent={t} size={16} ring={false} /><span className="font-medium text-[var(--color-fg-2)]">{t.name}</span></span>
          <Tag tone={s.tone} className="uppercase">{s.label}</Tag>
        </header>
        <p className={cn("text-[14px] leading-6 text-[var(--color-fg)]", typing && it.shown > 0 && "caret")}>
          {it.shown === 0 ? <span className="shimmer-text text-[13px] font-medium">Optimus anapima mwenendo wa mjadala…</span> : <Inline text={it.text.slice(0, it.shown)} accent={o.accent} />}
        </p>
      </div>
    </article>
  );
}
