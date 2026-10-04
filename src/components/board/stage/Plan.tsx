"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ClipboardList, Download, FileText } from "lucide-react";
import type { PlanItem } from "@/lib/stage/types";
import { cn, compact } from "@/lib/utils";
import { ReportBody } from "../../reports/ReportBody";

/* ============================================================== plan writer — "hati hai" (R30)
 * engine: HATUA 6.6 — "📋 Kipande 1/2 (1-4)", "2/2 (5-8)" · repair "📋 …anarekebisha" · saveProjectPlan.
 * Muonekano ULEULE wa ReportWriter (amri ya Mkuu): maneno yenye shimmer "Optimus anaandika Mpango Kazi
 * wa Agent…" — HAKUNA chip; card ndiyo inayoonyesha maendeleo (sehemu 8 + hatua za Step N zinazoandikwa live). */
const SEG: Record<PlanItem["sections"][number]["state"], string> = {
  wait: "rgb(255 255 255 / 0.08)",
  writing: "#2dd4bf",
  done: "#34d399",
  missing: "#f87171",
  repairing: "#fbbf24",
  repaired: "#fbbf24",
};

export function PlanWriter({ it, sessionId }: { it: PlanItem; sessionId?: string | null }) {
  const saved = it.saved === "saved";
  const failed = it.saved === "failed";
  const writing = !saved && !failed && !it.settled && it.saved === "wait";
  const saving = it.saved === "saving" && !it.settled;
  const streaming = !it.settled && (it.live ?? it.shown < it.doc.length);
  const [expanded, setExpanded] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const text = it.doc.slice(0, it.shown);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  // eslint-disable-next-line react-hooks/purity -- kiwango cha maneno/s (pattern ya ReportWriter; startedAt ni immutable)
  const secs = Math.max(1, (Date.now() - it.startedAt) / 1000);
  const done = it.sections.filter((s) => s.state === "done" || s.state === "repaired").length;
  const current = it.sections.find((s) => s.state === "writing" || s.state === "repairing");
  const currentStep = it.steps.length ? it.steps[it.steps.length - 1] : undefined;
  const planUrl = sessionId ? `/api/plans?session=${encodeURIComponent(sessionId)}&download=1` : null;

  useLayoutEffect(() => {
    const el = page.current;
    if (el && stick.current && writing) el.scrollTop = el.scrollHeight;
  }, [it.shown, writing]);

  const tone = saved ? { c: "#34d399", rgb: "52 211 153" } : failed ? { c: "#f87171", rgb: "248 113 113" } : it.part === 3 ? { c: "#fbbf24", rgb: "251 191 36" } : { c: "#2dd4bf", rgb: "45 212 191" };
  const finished = !writing && !saving;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.08), rgb(${tone.rgb} / 0.01) 45%)` }}>
        {/* header */}
        <div className="flex items-start gap-3 px-4 pt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-10px_rgb(45_212_191/0.8)]"><ClipboardList size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: tone.c }}>
                {saved ? "Mpango Kazi umekamilika" : failed ? "Mpango Kazi haukuhifadhiwa" : saving ? "Inahifadhi Mpango Kazi" : finished ? "Mpango Kazi umeandikwa" : "Optimus anaandika Mpango Kazi wa Agent"}
              </p>
              {writing && (
                <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[rgb(45_212_191/0.12)] px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-[#5eead4]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#2dd4bf]" /> LIVE
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--color-fg)]">{it.title}</p>
          </div>
        </div>

        {/* mstari wa sehemu 8 + hatua */}
        <div className="px-4 pt-3">
          <div className="flex gap-1">
            {it.sections.map((s) => (
              <span
                key={s.n}
                title={`${s.n}. ${s.title}`}
                className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", (s.state === "writing" || s.state === "repairing") && "animate-pulse")}
                style={{ background: SEG[s.state] }}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2 text-[11.5px]">
            {current && writing ? (
              current.n === 6 && currentStep ? (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ background: SEG[current.state] }} />
                  <span className="shimmer-text truncate font-medium">Sasa: Step {currentStep.n} — {currentStep.title}</span>
                </>
              ) : (
                <>
                  <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full" style={{ background: SEG[current.state] }} />
                  <span className="shimmer-text truncate font-medium">Sasa: {current.n}. {current.title}</span>
                </>
              )
            ) : done === it.sections.length ? (
              <span className="text-[var(--color-muted)]">Sehemu zote {it.sections.length} zimekamilika</span>
            ) : writing ? (
              <span className="shimmer-text font-medium">Anaandaa kipande kinachofuata…</span>
            ) : (
              <span className="text-[var(--color-muted)]">Sehemu {done}/{it.sections.length} zimeandikwa</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {writing && (
                <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-white/[0.05] px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-[var(--color-fg-2)]">
                  {it.part === 3 ? "MAREKEISHO" : `KIPANDE ${it.part}/2`}
                </span>
              )}
              <span className="font-mono text-[10.5px] text-[var(--color-faint)]">{done}/8{it.steps.length ? ` · hatua ${it.steps.length}` : ""}</span>
            </span>
          </div>
        </div>

        {/* ukurasa hai */}
        <div className="relative mx-3 mt-3">
          <div
            ref={page}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
            className="overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[rgb(8_10_14/0.6)] px-4 py-3 text-[13px] [scrollbar-width:thin]"
            style={{ maxHeight: finished && !expanded ? 240 : 400 }}
          >
            <div className={cn("st-doc", streaming && "st-doc-live")}>
              <ReportBody text={text || " "} live={streaming} />
            </div>
          </div>
          {finished && !expanded && (
            <div className="pointer-events-none absolute inset-x-px bottom-px flex h-20 items-end justify-center rounded-b-xl bg-gradient-to-t from-[rgb(8_10_14)] to-transparent pb-2">
              <button onClick={() => setExpanded(true)} className="pointer-events-auto flex h-7 items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-ink-2)] px-3 text-[11.5px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]">
                Soma yote <ChevronDown size={12} />
              </button>
            </div>
          )}
        </div>

        {/* takwimu */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{words}</b> maneno</span>
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{compact(text.length)}</b> herufi</span>
          {streaming && <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{Math.round(words / secs)}</b> maneno/s</span>}
          <span className="ml-auto">
            {saving ? <span className="shimmer-text font-medium">Inahifadhi kwa computer-use agent…</span>
              : failed ? <span className="text-[var(--color-bad)]">Imeshindwa kuhifadhiwa</span>
              : saved ? <span className="text-[var(--color-ok)]">Imehifadhiwa · hatua {it.steps.length || ""}</span>
              : finished ? (planUrl ? <a href={planUrl} className="text-[var(--color-fg-2)] underline-offset-2 hover:underline">Pakua Mpango Kazi</a> : <Link href="/sessions" className="text-[var(--color-muted)] underline-offset-2 hover:underline">Angalia Sessions</Link>)
              : <span className="text-[var(--color-faint)]">inaandikwa live</span>}
          </span>
        </div>
      </div>

      {saved && (
        <div className="prism-border relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgb(45_212_191/0.08),rgb(61_123_255/0.06))] p-4 animate-[rise_0.5s_both]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-8px_rgb(45_212_191/0.8)]"><FileText size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#5eead4]">Mpango Kazi wa Agent · English · hatua {it.steps.length}</p>
              <p className="truncate text-[14px] font-semibold">{it.title}</p>
              <p className="mt-0.5 text-[11px] text-[var(--color-muted)]">Unausomwa na computer-use agent kupitia <code className="rounded bg-white/[0.06] px-1 py-px font-mono text-[10.5px]">/api/plans?session={sessionId ? sessionId.slice(0, 8) : "…"}…</code></p>
            </div>
            {planUrl ? (
              <a href={planUrl} className="btn-white flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold">
                <Download size={14} /> Pakua
              </a>
            ) : (
              <Link href="/sessions" className="btn-white flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold">
                Sessions <ArrowRight size={14} />
              </Link>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
