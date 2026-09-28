"use client";
import { ArrowDown, BrainCircuit, Check, CircleDashed, EyeOff, FileSearch, GitBranch, KeyRound, Lock, LockOpen, Minus, ScrollText, ShieldAlert, ShieldCheck, Undo2, X } from "lucide-react";
import type { MemoryItem, ObserversItem, OverruledItem, SealItem, SupersedeItem, TaskItem, ValidatorItem } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { AgentAvatar, AvatarStack } from "../../ui/AgentAvatar";
import { Card, Inline, Lane, Quiet, Spinner, TONE, Tag, Who, ag, type Tone } from "./kit";

/* ============================================================== background task
 * engine: activityStart / activityEnd — si ujumbe wa chat, ni mstari wa shimmer tu */
const TASK_DONE: Record<TaskItem["task"], string> = {
  agenda: "Agenda imeundwa",
  mini: "Mini report imeandikwa kimya kimya",
  lock: "Ledger imeandikwa",
  relock: "Ledger imefungwa upya",
  query: "Query ya pingamizi imetengenezwa",
  validate: "Ledger imekaguliwa",
  reportCheck: "Ripoti imekaguliwa agenda kwa agenda",
};
const TASK_ICON = { agenda: ScrollText, mini: ScrollText, lock: Lock, relock: KeyRound, query: FileSearch, validate: ShieldCheck, reportCheck: FileSearch } as const;
const RESULT_TONE: Record<string, Tone> = { LOCKED: "ok", "RE-LOCKED": "ok", OPEN: "warn" };

export function TaskLine({ it }: { it: TaskItem }) {
  const Icon = TASK_ICON[it.task];
  const run = it.state === "run";
  return (
    <Quiet
      icon={run ? <Spinner size={13} color="#a78bfa" /> : <Icon size={13} className="text-[var(--color-faint)]" />}
      right={
        !run && (
          <>
            {it.task === "mini" && <EyeOff size={11} className="text-[var(--color-faint)]" aria-label="haionyeshwi" />}
            {it.result && <Tag tone={RESULT_TONE[it.result] ?? "muted"}>{it.result}</Tag>}
            {it.ms !== undefined && <span className="font-mono text-[10.5px] text-[var(--color-faint)]">{(it.ms / 1000).toFixed(1)}s</span>}
          </>
        )
      }
    >
      {run ? <span className="shimmer-text font-medium">{it.text}</span> : <span className="text-[var(--color-faint)]">{TASK_DONE[it.task]}</span>}
    </Quiet>
  );
}

/* ============================================================== memory (background)
 * brain: agendaCheckpoints · finalReflection · consolidation
 * SHERIA: maudhui ya memory HAYAONYESHWI — shimmer + avatars kwa zamu tu. */
const MEM_LABEL = {
  agenda: (n?: number) => `Memory checkpoint · agenda ${n}`,
  reflection: () => "Final reflection",
  consolidate: () => "Optimus anaunganisha memory",
};

export function MemoryStrip({ it }: { it: MemoryItem }) {
  const running = it.agents.find((a) => a.state === "run");
  const saved = it.agents.filter((a) => a.state === "saved").length;
  const none = it.agents.filter((a) => a.state === "none").length;
  return (
    <Lane>
      <div className={cn("flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors duration-500", it.done ? "border-[var(--color-line)] bg-white/[0.015]" : "border-[rgb(167_139_250/0.22)] bg-[rgb(167_139_250/0.05)]")}>
        <BrainCircuit size={14} className={cn("shrink-0", it.done ? "text-[var(--color-faint)]" : "animate-pulse text-[#a78bfa]")} />
        <div className="min-w-0 flex-1">
          <p className={cn("truncate text-[12px] font-medium", it.done ? "text-[var(--color-muted)]" : "shimmer-text")}>
            {MEM_LABEL[it.scope](it.agenda)}
            {running && !it.done && ` · ${ag(running.id).name}`}
          </p>
          {it.done && (
            <p className="text-[10.5px] text-[var(--color-faint)]">
              {saved} {it.scope === "consolidate" ? "zimeunganishwa" : "zimehifadhiwa"}{none > 0 && ` · ${none} NO_MEMORY`} · binafsi
            </p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {it.agents.map((g) => {
            const a = ag(g.id);
            return (
              <span key={g.id} className="relative" title={`${a.name}: ${g.state}`}>
                <span className={cn("block rounded-full transition-opacity duration-500", g.state === "wait" && "opacity-25 grayscale", g.state === "none" && "opacity-40 grayscale")}>
                  <AgentAvatar agent={a} size={20} ring={false} status={g.state === "run" ? "speaking" : undefined} />
                </span>
                {g.state === "saved" && <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-[#a78bfa] animate-[fade_0.3s_both]" />}
                {g.state === "none" && <span className="absolute -bottom-0.5 left-1/2 h-[2px] w-2.5 -translate-x-1/2 rounded bg-[var(--color-faint)]" />}
              </span>
            );
          })}
        </div>
      </div>
    </Lane>
  );
}

/* ============================================================== decision locked
 * engine: saveLedgerEntry → "🔒 LOCKED: item → decision" | "🟠 OPEN" · ledger id · supersedes
 * (lugha ya DecisionCard ya v2, imepanuliwa: ledger id, sababu, trade-off, masharti) */
export function SealCard({ it }: { it: SealItem }) {
  const open = it.status === "OPEN";
  return (
    <Lane>
      <Card
        tone={open ? "warn" : "ok"}
        dim={it.superseded}
        icon={open ? <LockOpen size={15} /> : <Lock size={15} />}
        eyebrow={open ? `Agenda open · A${it.agenda.index}` : `Decision locked · A${it.agenda.index}`}
        right={
          <>
            {it.superseded && <Tag tone="violet"><GitBranch size={10} /> superseded</Tag>}
            <Tag tone="muted" mono>#{it.ledgerId} · v{it.version}</Tag>
          </>
        }
        title={it.agenda.title}
        footer={
          <>
            <AvatarStack agents={it.owners.map((o) => ag(o))} size={20} />
            <span>{open ? "Consensus haikufikiwa — itaandikwa UNRESOLVED" : `Owner consensus ${it.owners.length}/${it.owners.length}`}</span>
            <span className="text-[var(--color-faint)]">· sources {it.sources}</span>
            {open ? <CircleDashed size={13} className="ml-auto text-[var(--color-warn)]" /> : <Check size={13} className="ml-auto text-[var(--color-ok)]" />}
          </>
        }
      >
        {(() => {
          // R18: "[Condition added by X]: …" → sharti lenyewe TU (bila lebo ya nani aliliongeza)
          const [main, ...conds] = String(it.decision || "").split(/\s*\[Condition added by [^\]]+\]\s*:?\s*/i);
          const strike = it.superseded && "line-through decoration-[var(--color-faint)]";
          return (
            <>
              {main.trim() && (
                <p className={cn("mt-1 text-[13px] leading-6 text-[var(--color-fg-2)]", strike)}>
                  <Inline text={main.trim()} />
                </p>
              )}
              {conds.map((c) => c.trim()).filter(Boolean).map((c, i) => (
                <p key={i} className={cn("mt-1.5 flex gap-1.5 text-[12.5px] leading-6 text-[var(--color-fg-2)]", strike)}>
                  <ShieldCheck size={12} className="mt-[6px] shrink-0" style={{ color: open ? TONE.warn.c : TONE.ok.c }} />
                  <span className="min-w-0"><Inline text={c} /></span>
                </p>
              ))}
            </>
          );
        })()}
        {(it.rationale || it.tradeoff) && (
          <dl className="mt-2 grid gap-x-3 gap-y-1 text-[12px] leading-5 sm:grid-cols-[76px_1fr]">
            {it.rationale && (<><dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-faint)] sm:pt-[2px]">Sababu</dt><dd className="text-[var(--color-muted)]"><Inline text={it.rationale} /></dd></>)}
            {it.tradeoff && (<><dt className="text-[10.5px] font-semibold uppercase tracking-[0.1em] text-[var(--color-faint)] sm:pt-[2px]">Trade-off</dt><dd className="text-[var(--color-muted)]"><Inline text={it.tradeoff} /></dd></>)}
          </dl>
        )}
        {it.constraints.length > 0 && (
          <div className="mt-2.5 flex flex-wrap gap-1.5">
            {it.constraints.map((c) => (
              <span key={c} className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2 py-1 text-[11.5px] text-[var(--color-fg-2)]">
                <ShieldCheck size={11} style={{ color: open ? TONE.warn.c : TONE.ok.c }} /> {c}
              </span>
            ))}
          </div>
        )}
      </Card>
    </Lane>
  );
}

/* ============================================================== observers
 * engine: observers loop (SILENT | OBJECTION + SEVERITY) — max 1 objection halali */
export function ObserversCard({ it }: { it: ObserversItem }) {
  const running = it.checks.some((c) => c.state === "check" || c.state === "wait");
  const obj = it.objection;
  return (
    <Lane>
      <Card
        tone={obj ? "bad" : running ? "sky" : "muted"}
        icon={obj ? <ShieldAlert size={15} /> : running ? <Spinner size={14} color={TONE.sky.c} /> : <ShieldCheck size={15} />}
        eyebrow={obj ? `Objection · A${it.agenda}` : `Observers · A${it.agenda}`}
        title={obj ? "Pingamizi halali limewasilishwa" : running ? <span className="shimmer-text">Observers wanapitia uamuzi…</span> : "Hakuna pingamizi — wote SILENT"}
      >
        <div className="mt-2 flex flex-wrap gap-1.5">
          {it.checks.map((c) => {
            const a = ag(c.agent);
            const st = {
              wait: { t: "anasubiri", tone: "muted" as Tone },
              check: { t: "anapitia…", tone: "sky" as Tone },
              silent: { t: "SILENT", tone: "muted" as Tone },
              objection: { t: "OBJECTION", tone: "bad" as Tone },
              skipped: { t: "skipped", tone: "muted" as Tone },
            }[c.state];
            const t = TONE[st.tone];
            return (
              <span key={c.agent} className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11.5px] transition-opacity duration-300", (c.state === "wait" || c.state === "skipped") && "opacity-50")} style={{ borderColor: `rgb(${t.rgb} / 0.2)`, background: `rgb(${t.rgb} / 0.05)` }}>
                <AgentAvatar agent={a} size={16} ring={false} />
                <span className="text-[var(--color-fg-2)]">{a.name}</span>
                {c.state === "check" ? <Spinner size={10} color={t.c} /> : null}
                <span className={cn("text-[10.5px] font-semibold tracking-wide", c.state === "check" && "shimmer-text")} style={c.state === "check" ? undefined : { color: t.c }}>{st.t}</span>
              </span>
            );
          })}
        </div>
        {obj && (
          <div className="mt-3 rounded-xl border border-[rgb(248_113_113/0.2)] bg-black/10 px-3 py-2.5 animate-[rise_0.35s_both]">
            <div className="mb-1 flex items-center gap-2 text-[11.5px]">
              <Who id={obj.agent} size={16} />
              <Tag tone="bad" className="ml-auto uppercase">severity {obj.severity}</Tag>
            </div>
            <p className="text-[13px] leading-6 text-[var(--color-fg)]"><Inline text={obj.concern} /></p>
          </div>
        )}
      </Card>
    </Lane>
  );
}

/* ============================================================== supersede
 * engine: UPDATED DECISION → re-lock + markSuperseded(entryId) + "🔁 SUPERSEDED → new" */
export function SupersedeCard({ it }: { it: SupersedeItem }) {
  return (
    <Lane>
      <Card
        tone="violet"
        icon={<GitBranch size={15} />}
        eyebrow={`Decision superseded · A${it.agenda}`}
        right={<Tag tone="ok"><Lock size={10} /> re-locked</Tag>}
        footer={
          <>
            <Who id={it.objector} size={16} className="text-[11.5px]" />
            <span>pingamizi limekubaliwa →</span>
            <Who id={it.responder} size={16} className="text-[11.5px]" />
            <span>amesasisha uamuzi</span>
          </>
        }
      >
        <div className="mt-2 space-y-1.5">
          <div className="flex items-start gap-2.5 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2">
            <Tag tone="muted" mono className="mt-[2px]">v{it.from.version} · #{it.from.ledgerId}</Tag>
            <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-[var(--color-faint)] line-through decoration-[var(--color-faint)]"><Inline text={it.from.text} /></p>
          </div>
          <div className="flex justify-center text-[var(--color-faint)]"><ArrowDown size={13} /></div>
          <div className="flex items-start gap-2.5 rounded-xl border border-[rgb(52_211_153/0.22)] bg-[rgb(52_211_153/0.05)] px-3 py-2">
            <Tag tone="ok" mono className="mt-[2px]">v{it.to.version} · #{it.to.ledgerId}</Tag>
            <p className="min-w-0 flex-1 text-[12.5px] leading-5 text-[var(--color-fg)]"><Inline text={it.to.text} /></p>
          </div>
        </div>
      </Card>
    </Lane>
  );
}

/* ============================================================== objection rejected
 * engine: "↩️ Objection imekataliwa: reason" */
export function OverruledCard({ it }: { it: OverruledItem }) {
  return (
    <Lane>
      <Card
        tone="sky"
        icon={<Undo2 size={15} />}
        eyebrow="Pingamizi limekataliwa"
        right={<Tag tone="ok"><Lock size={10} /> uamuzi unabaki</Tag>}
        footer={
          <>
            <Who id={it.objector} size={16} className="text-[11.5px]" />
            <span>alipinga ·</span>
            <Who id={it.responder} size={16} className="text-[11.5px]" />
            <span>alijibu</span>
          </>
        }
      >
        <p className="mt-1 border-l-2 border-[var(--color-line-strong)] pl-2.5 text-[12.5px] italic leading-5 text-[var(--color-muted)]"><Inline text={it.concern} /></p>
        <p className="mt-2 text-[13px] leading-6 text-[var(--color-fg)]"><Inline text={it.reason} /></p>
      </Card>
    </Lane>
  );
}

/* ============================================================== validator
 * engine: HATUA 6.4 Ledger validator · report validator [A1..AN] + stitch */
const ROW: Record<ValidatorItem["rows"][number]["state"], { t: string; tone: Tone }> = {
  wait: { t: "inasubiri", tone: "muted" },
  check: { t: "inakagua…", tone: "sky" },
  locked: { t: "LOCKED", tone: "ok" },
  open: { t: "UNRESOLVED", tone: "warn" },
  missing: { t: "MISSING", tone: "bad" },
  ok: { t: "ipo", tone: "ok" },
  stitched: { t: "imeunganishwa", tone: "violet" },
};

export function ValidatorCard({ it }: { it: ValidatorItem }) {
  const ok = it.rows.filter((r) => ["locked", "ok", "stitched", "open"].includes(r.state)).length;
  return (
    <Lane>
      <Card
        tone={it.done ? "ok" : "sky"}
        icon={it.done ? <ShieldCheck size={15} /> : <Spinner size={14} color={TONE.sky.c} />}
        eyebrow={it.scope === "ledger" ? "Ledger validator" : "Report validator"}
        right={<Tag tone={it.done ? "ok" : "sky"} mono>{ok}/{it.rows.length}</Tag>}
        title={it.done ? (it.scope === "ledger" ? "Agenda zote ziko kwenye Ledger" : "Ripoti ina agenda zote") : <span className="shimmer-text">Inakagua agenda moja moja…</span>}
      >
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          {it.rows.map((r) => {
            const s = ROW[r.state];
            const t = TONE[s.tone];
            return (
              <li key={r.index} className={cn("flex items-center gap-2 rounded-lg border border-[var(--color-line)] bg-white/[0.02] px-2 py-1.5 text-[12px] transition-opacity duration-300", r.state === "wait" && "opacity-50")}>
                <span className="font-mono text-[10.5px] font-semibold text-[var(--color-muted)]">A{r.index}</span>
                <span className="min-w-0 flex-1 truncate text-[var(--color-fg-2)]">{r.title}</span>
                {r.state === "check" ? <Spinner size={10} color={t.c} /> : r.state === "missing" ? <X size={11} style={{ color: t.c }} /> : r.state === "wait" ? <Minus size={11} className="text-[var(--color-faint)]" /> : null}
                <span className={cn("text-[10px] font-semibold tracking-wide", r.state === "check" && "shimmer-text")} style={r.state === "check" ? undefined : { color: t.c }}>{s.t}</span>
              </li>
            );
          })}
        </ul>
      </Card>
    </Lane>
  );
}
