"use client";
// BoardActionCard — R15: agent (chat) amepokea ombi la Board. Board HAIANZI mpaka Mkuu abonyeze "Anzisha".
// Board ikiwa inaendelea tayari (moja tu kwa wakati) → kitufe kinafungua Board Room badala ya kuanzisha nyingine.
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUpRight, Presentation, X } from "lucide-react";
import { useApp } from "../shell/AppState";

export function BoardActionCard({ task, accent }: { task: string; accent: string }) {
  const router = useRouter();
  const { boardLive } = useApp();
  const [state, setState] = useState<"ask" | "started" | "cancelled">("ask");

  if (state === "cancelled") {
    return <p className="mt-3 text-[11.5px] text-[var(--color-faint)] animate-[fade_0.3s_both]">Board haikuanzishwa.</p>;
  }
  if (state === "started") {
    return <p className="mt-3 text-[11.5px] text-[var(--color-muted)] animate-[fade_0.3s_both]">Board Room inafunguliwa…</p>;
  }
  return (
    <div className="surface mt-3 max-w-[520px] rounded-2xl border border-[var(--color-line)] bg-white/[0.025] p-3.5 animate-[rise_0.35s_both]">
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl" style={{ color: accent, background: "rgb(255 255 255 / 0.05)" }}>
          <Presentation size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-semibold leading-5 text-[var(--color-fg)]">{boardLive ? "Board inaendelea sasa hivi" : "Anzisha Board Room?"}</p>
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-5 text-[var(--color-muted)]">
            {boardLive ? "Board moja tu inaweza kuendeshwa kwa wakati mmoja. Fungua Board Room kuona inayoendelea." : task}
          </p>
        </div>
      </div>
      <div className="mt-3 flex gap-2">
        <button onClick={() => setState("cancelled")} className="btn-ghost flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-medium">
          <X size={13} /> Cancel
        </button>
        <button
          onClick={() => { setState("started"); router.push(boardLive ? "/board" : `/board?prompt=${encodeURIComponent(task)}`); }}
          className="btn-prism flex h-9 flex-1 items-center justify-center gap-1.5 rounded-xl text-[12.5px] font-semibold"
        >
          {boardLive ? "Fungua Board" : "Anzisha"} <ArrowUpRight size={14} />
        </button>
      </div>
    </div>
  );
}
