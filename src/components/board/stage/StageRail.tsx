"use client";
import { Link2, Lock, CircleDashed, Sparkles } from "lucide-react";
import type { AgendaDef, AgendaPhase, FinalePhase, LiveStage } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { TONE } from "./kit";

/* Rail ya maendeleo (sticky) — inaonyesha agenda zote, awamu ya sasa na kazi ya background.
 * Awamu zinatoka kwenye matukio halisi ya engine (angalia lib/board/adapter.ts). */

const AGENDA_STEPS: { k: AgendaPhase; label: string }[] = [
  { k: "evidence", label: "Evidence" },
  { k: "discussion", label: "Mjadala" },
  { k: "code", label: "Code" },
  { k: "lock", label: "Ledger" },
  { k: "review", label: "Observers" },
  { k: "relock", label: "Re-lock" },
];
const FINALE_STEPS: { k: FinalePhase; label: string }[] = [
  { k: "validate", label: "Validator" },
  { k: "assemble", label: "Script" },
  { k: "report", label: "Ripoti" },
  { k: "done", label: "Imekamilika" },
];
// mpangilio halisi wa engine: lock → observers → (relock)
const ORDER: AgendaPhase[] = ["evidence", "discussion", "code", "lock", "review", "relock"];

export function StageRail({ stage, agenda, live }: { stage: LiveStage; agenda: AgendaDef[]; live: boolean }) {
  const inFinale = stage.scope === "finale" || stage.scope === "done";
  const steps = inFinale
    ? FINALE_STEPS
    : AGENDA_STEPS.filter((s) => (s.k === "code" ? stage.agenda?.requiresCode : s.k === "relock" ? stage.hadObjection : true))
        .sort((a, b) => ORDER.indexOf(a.k) - ORDER.indexOf(b.k));
  const cur = inFinale ? stage.finale : stage.phase;
  const curIdx = steps.findIndex((s) => s.k === cur);

  if (stage.scope === "opening") return null;

  return (
    <div className="glass sticky top-0 z-20 -mx-4 border-b border-[var(--color-line)] px-4 py-2 sm:-mx-6 sm:px-6">
      <div className="st-fog-x st-noscroll flex items-center gap-1.5 overflow-x-auto">
        {agenda.map((a) => {
          const l = stage.ledger[a.index];
          const active = !inFinale && stage.agenda?.index === a.index && !l;
          const tone = l?.status === "OPEN" ? TONE.warn : l ? TONE.ok : null;
          return (
            <a key={a.index} href={`#agenda-${a.index}`} title={`${a.title}${l ? ` · ${l.status}` : ""}`}
              className={cn("flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold transition-all", active ? "prism-border text-[var(--color-fg)]" : "border-[var(--color-line)] text-[var(--color-muted)]")}
              style={tone ? { color: tone.c, borderColor: `rgb(${tone.rgb} / 0.35)`, background: `rgb(${tone.rgb} / 0.08)` } : undefined}>
              {l?.status === "SUPERSEDED+LOCKED" ? <Link2 size={10} /> : l?.status === "OPEN" ? <CircleDashed size={10} /> : l ? <Lock size={10} /> : active ? <span className="h-1.5 w-1.5 rounded-full bg-prism animate-pulse" /> : null}
              A{a.index}
              {l && <span className="font-mono font-normal opacity-80">v{l.version}</span>}
            </a>
          );
        })}
        <span className={cn("flex h-6 shrink-0 items-center gap-1 rounded-full border px-2 text-[10.5px] font-semibold", inFinale ? "prism-border text-[var(--color-fg)]" : "border-[var(--color-line)] text-[var(--color-faint)]")}>
          <Sparkles size={10} /> Finale
        </span>
        <span className="mx-1 h-4 w-px shrink-0 bg-[var(--color-line)]" />
        {steps.map((s, i) => {
          const done = i < curIdx || stage.scope === "done";
          const on = i === curIdx && stage.scope !== "done";
          return (
            <span key={s.k} className="flex shrink-0 items-center gap-1.5">
              {i > 0 && <span className={cn("h-px w-3", done || on ? "bg-[var(--color-line-strong)]" : "bg-[var(--color-line)]")} />}
              <span className={cn("flex items-center gap-1 text-[11px]", on ? "font-semibold text-[var(--color-fg)]" : done ? "text-[var(--color-muted)]" : "text-[var(--color-faint)]")}>
                <span className={cn("h-1.5 w-1.5 rounded-full", on ? "bg-prism animate-pulse" : done ? "bg-[var(--color-ok)]" : "bg-[var(--color-line-strong)]")} />
                {s.label}
              </span>
            </span>
          );
        })}
      </div>
      {live && stage.background && (
        <p className="shimmer-text mt-1 truncate text-[11px] font-medium">{stage.background}</p>
      )}
    </div>
  );
}
