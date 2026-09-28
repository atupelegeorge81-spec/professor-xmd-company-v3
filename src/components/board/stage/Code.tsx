"use client";
import { useState } from "react";
import { Check, ChevronDown, CircleDashed, FileCode2, Layers, PackageCheck, ShieldCheck, ShieldX, X } from "lucide-react";
import type { AssemblyItem, DeliverableItem, ReviewItem, ScriptItem } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { Card, Lane, Spinner, TONE, Tag, ag } from "./kit";
import { ScriptBox } from "./ScriptBox";

/* ============================================================== script (writer message)
 * engine: code-writing streamTurn (≤3 continuations) · script_diff (surgical patch) · dissolveMessage */
export function ScriptCard({ it }: { it: ScriptItem }) {
  const a = ag(it.agent);
  const [openOld, setOpenOld] = useState(false);

  if (it.replaced) {
    // toleo la zamani — limebaki kama mstari mfupi (company: dissolveMessage → "↕️ Script ilisasishwa")
    return (
      <Lane>
        <button onClick={() => setOpenOld((v) => !v)} className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--color-line)] bg-white/[0.02] px-3 py-2 text-left text-[12px] text-[var(--color-muted)] transition hover:bg-white/[0.04]">
          <FileCode2 size={13} style={{ color: a.accent }} className="shrink-0" />
          <span className="font-mono text-[11.5px] text-[var(--color-fg-2)] line-through decoration-[var(--color-faint)]">{it.file}</span>
          <Tag tone="muted" mono>v{it.version}</Tag>
          <span className="min-w-0 flex-1 truncate">Script ilisasishwa → v{it.version + 1}</span>
          <span className="font-mono text-[11px]"><span className="text-[var(--color-ok)]">+{it.replaced.add}</span> <span className="text-[var(--color-bad)]">−{it.replaced.del}</span></span>
          <ChevronDown size={13} className={cn("shrink-0 transition", openOld && "rotate-180")} />
        </button>
        {openOld && (
          <div className="mt-2 opacity-70">
            <ScriptBox title={it.file} lang={it.lang} code={it.code} accent={a.accent} version={it.version} />
          </div>
        )}
      </Lane>
    );
  }

  const writing = it.state === "writing";
  const patchLabel = it.patch ? (it.patch.reason === "review" ? "marekebisho ya review" : "jibu la pingamizi") : undefined;
  // Header (avatar + jina) juu; ScriptBox chini kwa upana wote wa safu — katikati ya viewport kwenye simu
  return (
    <article className="relative animate-[rise_0.45s_both]">
      <header className="mb-2.5 flex items-center gap-3 sm:gap-4">
        <AgentAvatar agent={a} size={36} status={it.state !== "done" ? "speaking" : undefined} />
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[14px] font-semibold">{a.name}</span>
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: a.accent, background: `rgb(${a.rgb} / 0.1)` }}>{a.role}</span>
          <span className="w-full text-[12px] text-[var(--color-muted)] sm:w-auto">
            {it.patch ? <>surgical patch · {patchLabel}</> : writing || it.state === "resume" ? <>anaandika <span className="font-mono text-[11.5px] text-[var(--color-fg-2)]">{it.file}</span></> : <>ameandika <span className="font-mono text-[11.5px] text-[var(--color-fg-2)]">{it.file}</span></>}
          </span>
        </div>
      </header>
      <div className="sm:ml-[52px]">
        <ScriptBox
          title={it.file}
          lang={it.lang}
          code={it.code}
          shown={it.shown}
          accent={a.accent}
          writing={writing}
          resume={it.state === "resume"}
          patching={it.state === "patching"}
          attempt={it.attempt}
          maxAttempts={it.maxAttempts}
          version={it.version}
          patch={it.patch && { ...it.patch, label: patchLabel }}
        />
      </div>
    </article>
  );
}

/* ============================================================== review
 * engine: reviewer APPROVE / REJECT: … (round ≤2) */
export function ReviewCard({ it }: { it: ReviewItem }) {
  const pending = it.verdict === "pending";
  const ok = it.verdict === "approve";
  return (
    <Lane>
      <Card
        tone={pending ? "sky" : ok ? "ok" : "bad"}
        icon={pending ? <Spinner size={14} color={TONE.sky.c} /> : ok ? <ShieldCheck size={15} /> : <ShieldX size={15} />}
        eyebrow={<>Code review · {ag(it.agent).name}</>}
        right={<Tag tone="muted" mono>round {it.round}/{it.maxRounds}</Tag>}
        title={pending ? <span className="shimmer-text">Anakagua script dhidi ya maamuzi ya agenda…</span> : ok ? "APPROVE — script zimekubaliwa" : "REJECT — inahitaji marekebisho"}
      >
        {!pending && it.notes.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {it.notes.map((n, i) => (
              <li key={i} className="flex gap-2 text-[12.5px] leading-5 text-[var(--color-fg-2)] animate-[rise_0.35s_both]" style={{ animationDelay: `${i * 80}ms` }}>
                <X size={13} className="mt-[3px] shrink-0 text-[var(--color-bad)]" /> {n}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </Lane>
  );
}

/* ============================================================== deliverable
 * engine: "Deliverable ya mwisho — item" */
export function DeliverableCard({ it }: { it: DeliverableItem }) {
  const a = ag(it.agent);
  return (
    <Lane>
      <div className="flex items-center gap-2.5 rounded-xl border border-[rgb(52_211_153/0.18)] bg-[rgb(52_211_153/0.05)] px-3 py-2 text-[12.5px]">
        <PackageCheck size={14} className="shrink-0 text-[var(--color-ok)]" />
        <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-ok)]">Deliverable</span>
        <span className="truncate font-mono text-[12px] text-[var(--color-fg)]">{it.file}</span>
        <span className="hidden truncate text-[var(--color-muted)] sm:inline">· {it.agenda}</span>
        <span className="ml-auto flex shrink-0 items-center gap-2 text-[11px] text-[var(--color-muted)]">
          {it.lines} lines <AgentAvatar agent={a} size={18} ring={false} />
        </span>
      </div>
    </Lane>
  );
}

/* ============================================================== assembly
 * engine: HATUA 6.5 assembleFinalScript (collectLockedPieces → stream ≤6) */
export function AssemblyCard({ it }: { it: AssemblyItem }) {
  const o = ag("optimus");
  const merging = it.merged < it.pieces.length;
  const writing = !merging && !it.done;
  return (
    <Lane className="space-y-3">
      <Card
        tone="violet"
        icon={merging ? <Spinner size={14} color={TONE.violet.c} /> : <Layers size={15} />}
        eyebrow="Script ya mwisho · Optimus"
        right={<Tag tone="violet" mono>{it.merged}/{it.pieces.length} vipande</Tag>}
        title={merging ? <span className="shimmer-text">Anakusanya vipande vilivyofungwa kwenye Ledger…</span> : it.done ? "Vipande vyote vimeunganishwa kuwa script moja" : "Anaunganisha kuwa script moja…"}
      >
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {it.pieces.map((p, i) => {
            const done = i < it.merged;
            const cur = i === it.merged && merging;
            return (
              <span key={i} className={cn("inline-flex h-7 items-center gap-1.5 rounded-lg border px-2 text-[11.5px] transition-opacity duration-300", done ? "border-[rgb(52_211_153/0.25)] bg-[rgb(52_211_153/0.06)] text-[var(--color-fg-2)]" : "border-[var(--color-line)] text-[var(--color-muted)]", !done && !cur && "opacity-60")}>
                {done ? <Check size={12} className="text-[var(--color-ok)]" /> : cur ? <Spinner size={10} color={TONE.violet.c} /> : <CircleDashed size={11} />}
                <AgentAvatar agent={ag(p.agent)} size={14} ring={false} />
                <span className="font-mono">{p.file}</span>
                <span className="text-[var(--color-faint)]">A{p.agenda}</span>
              </span>
            );
          })}
        </div>
      </Card>
      {!merging && (
        <ScriptBox
          title={it.file}
          lang={({ ts: "typescript", tsx: "tsx", js: "js", jsx: "jsx", html: "html", css: "css", py: "python", json: "json", sh: "bash", sql: "sql" } as Record<string, string>)[it.file.split(".").pop() || ""] || "text"}
          code={it.code}
          shown={it.shown}
          accent={o.accent}
          writing={writing}
          attempt={it.attempt}
          maxAttempts={it.maxAttempts}
          who={<><AgentAvatar agent={o} size={16} ring={false} /> Optimus</>}
        />
      )}
    </Lane>
  );
}
