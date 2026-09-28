"use client";
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowRight, ArrowRightLeft, ChevronDown, FileText, Info, Play, RotateCcw, Sparkles, Wrench, XCircle } from "lucide-react";
import type { NoticeItem, ReportItem, SummaryItem } from "@/lib/stage/types";
import { cn, compact } from "@/lib/utils";
import { AgentAvatar } from "../../ui/AgentAvatar";
import { ReportBody } from "../../reports/ReportBody";
import { useApp } from "../../shell/AppState";
import { Lane, Spinner, TONE, Tag, ag } from "./kit";

/* ============================================================== report writer — "hati hai"
 * engine: HATUA 7 — "📑 Kipande 1/2 (1-5)", "2/2 (6-10)" · repair "🛠️ …missing" · saveReport
 * Ripoti inastreamiwa neno kwa neno kwenye ukurasa unaofuata mstari wa mwisho (live).
 * Mstari wa sehemu 10 unaonyesha kila sehemu: inasubiri · inaandikwa · imekamilika · imekosekana · inarekebishwa. */
const SEG: Record<ReportItem["sections"][number]["state"], string> = {
  wait: "rgb(255 255 255 / 0.08)",
  writing: "#a78bfa",
  done: "#34d399",
  missing: "#f87171",
  repairing: "#fbbf24",
  repaired: "#fbbf24",
};

export function ReportWriter({ it }: { it: ReportItem }) {
  const { reports } = useApp();
  const saved = it.saved === "saved";
  const failed = it.saved === "failed";
  // settled = mjadala umeisha (finalize) bila uthibitisho wa kuhifadhi — shimmer isiendelee milele
  const writing = !saved && !failed && !it.settled && it.saved === "wait";
  const saving = it.saved === "saving" && !it.settled;
  const streaming = !it.settled && (it.live ?? it.shown < it.doc.length);
  // replay/refresh: tukio la "report" (lenye id) halihifadhiwi — tafuta ripoti kwa kichwa chake
  const reportId = it.reportId || reports?.find((r) => r.title === it.title)?.id || "";
  const [expanded, setExpanded] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const stick = useRef(true);

  const text = it.doc.slice(0, it.shown);
  const cut = it.repairFrom ?? Infinity;
  const main = text.slice(0, Math.min(text.length, cut));
  const fix = text.length > cut ? text.slice(cut) : "";
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const secs = Math.max(1, (Date.now() - it.startedAt) / 1000);
  const done = it.sections.filter((s) => s.state === "done" || s.state === "repaired").length;
  const current = it.sections.find((s) => s.state === "writing" || s.state === "repairing");
  const missing = it.sections.filter((s) => s.state === "missing");

  // ukurasa unafuata mstari wa mwisho — isipokuwa mtumiaji amepanda juu kusoma
  useLayoutEffect(() => {
    const el = page.current;
    if (el && stick.current && writing) el.scrollTop = el.scrollHeight;
  }, [it.shown, writing]);

  const tone = saved ? TONE.ok : failed ? TONE.bad : it.part === 3 ? TONE.warn : TONE.violet;
  const finished = !writing && !saving; // hakuna kazi inayoendelea tena

  return (
    <Lane className="space-y-3">
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.08), rgb(${tone.rgb} / 0.01) 45%)` }}>
        {/* header */}
        <div className="flex items-start gap-3 px-4 pt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-10px_rgb(139_92_246/0.8)]"><FileText size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: tone.c }}>{saved ? "Ripoti imekamilika" : failed ? "Ripoti haikuhifadhiwa" : saving ? "Inahifadhi ripoti" : finished ? "Ripoti imeandikwa" : "Optimus anaandika ripoti"}</p>
              {writing && (
                <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[rgb(248_113_113/0.12)] px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-[#fca5a5]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f87171]" /> LIVE
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--color-fg)]">{it.title}</p>
          </div>
        </div>

        {/* mstari wa sehemu 10 */}
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
              <>
                <Spinner size={10} color={SEG[current.state]} />
                <span className="shimmer-text truncate font-medium">{current.state === "repairing" ? "Inarekebisha" : "Sasa"}: {current.n}. {current.title}</span>
              </>
            ) : missing.length ? (
              <span className="truncate text-[var(--color-bad)]">Imekosekana: {missing.map((m) => `${m.n}. ${m.title}`).join(", ")}{writing ? " — inarekebishwa…" : ""}</span>
            ) : done === it.sections.length ? (
              <span className="text-[var(--color-muted)]">Sehemu zote {it.sections.length} zimekamilika</span>
            ) : writing ? (
              <span className="shimmer-text font-medium">Anaandaa kipande kinachofuata…</span>
            ) : (
              <span className="text-[var(--color-muted)]">Sehemu {done}/{it.sections.length} zimeandikwa</span>
            )}
            <span className="ml-auto flex shrink-0 items-center gap-1.5">
              {writing && (
                <Tag tone={it.part === 3 ? "warn" : "violet"}>
                  {it.part === 3 ? <><Wrench size={10} /> Marekebisho</> : `Kipande ${it.part}/2`}
                </Tag>
              )}
              <span className="font-mono text-[10.5px] text-[var(--color-faint)]">{done}/10</span>
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
            <div className={cn("st-doc", streaming && !fix && "st-doc-live")}>
              <ReportBody text={main || " "} live={streaming && !fix} />
            </div>
            {fix && (
              <div className="mt-3 border-l-2 border-[var(--color-warn)] pl-3 animate-[fade_0.4s_both]">
                <p className="mb-1 flex items-center gap-1.5 text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[var(--color-warn)]"><Wrench size={11} /> Marekebisho · sehemu iliyokosekana</p>
                <div className={cn("st-doc", streaming && "st-doc-live")}>
                  <ReportBody text={fix} live={streaming} />
                </div>
              </div>
            )}
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
            {saving ? <span className="shimmer-text font-medium">Inahifadhi kwenye Reports…</span>
              : failed ? <span className="text-[var(--color-bad)]">Imeshindwa kuhifadhiwa</span>
              : saved ? <span className="text-[var(--color-ok)]">Imehifadhiwa</span>
              : finished ? <Link href="/reports" className="text-[var(--color-muted)] underline-offset-2 hover:underline">Angalia Reports</Link>
              : <span className="text-[var(--color-faint)]">inaandikwa live</span>}
          </span>
        </div>
      </div>

      {saved && (
        <div className="prism-border relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,rgb(61_123_255/0.08),rgb(217_70_239/0.06))] p-4 animate-[rise_0.5s_both]">
          <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-8px_rgb(139_92_246/0.8)]"><FileText size={18} /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#c4b5fd]">Report filed · Swahili</p>
              <p className="truncate text-[14px] font-semibold">{it.title}</p>
            </div>
            <Link href={reportId ? `/reports?open=${reportId}` : "/reports"} className="btn-white flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold">
              Open <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </Lane>
  );
}

/* ============================================================== notices
 * engine: chips za retry / rotation / warn / error / halt (Resume) */
const NOTICE = {
  retry: { icon: RotateCcw, c: TONE.warn.c },
  rotate: { icon: ArrowRightLeft, c: TONE.sky.c },
  warn: { icon: AlertTriangle, c: TONE.warn.c },
  error: { icon: XCircle, c: TONE.bad.c },
  halt: { icon: XCircle, c: TONE.bad.c },
  info: { icon: Info, c: TONE.muted.c },
} as const;

export function NoticeLine({ it, onResume }: { it: NoticeItem; onResume?: () => void }) {
  const n = NOTICE[it.tone];
  if (it.tone === "halt")
    return (
      <Lane>
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[rgb(248_113_113/0.3)] bg-[rgb(248_113_113/0.07)] px-3.5 py-2.5">
          <n.icon size={15} style={{ color: n.c }} />
          <div className="min-w-0 flex-1">
            <p className="text-[12.5px] font-semibold text-[var(--color-fg)]">{it.text}</p>
            {it.detail && <p className="text-[11.5px] text-[var(--color-muted)]">{it.detail}</p>}
          </div>
          <button onClick={onResume} className="btn-white flex h-8 items-center gap-1.5 rounded-lg px-3 text-[12px] font-medium"><Play size={12} /> Resume</button>
        </div>
      </Lane>
    );
  return (
    <Lane>
      <div className="flex items-center gap-2 py-0.5 text-[11.5px]">
        <n.icon size={12} style={{ color: n.c }} className="shrink-0" />
        {it.agent && <AgentAvatar agent={ag(it.agent)} size={14} ring={false} />}
        <span className="min-w-0 flex-1 truncate text-[var(--color-muted)]">{it.text}</span>
        {it.detail && <span className="shrink-0 truncate rounded bg-white/[0.04] px-1.5 py-0.5 font-mono text-[10.5px] text-[var(--color-fg-2)]">{it.detail}</span>}
      </div>
    </Lane>
  );
}

/* ============================================================== summary
 * engine: bcast({type:"summary"}) + done — "🤝 Mjadala umekamilika" */
export function SummaryCard({ it }: { it: SummaryItem }) {
  const max = Math.max(1, ...it.usage.map((u) => u.tokens));
  const total = it.usage.reduce((n, u) => n + u.tokens, 0);
  const secTotal = Math.max(0, Math.round(it.seconds));
  const mm = secTotal >= 3600
    ? `${Math.floor(secTotal / 3600)}:${String(Math.floor((secTotal % 3600) / 60)).padStart(2, "0")}:${String(secTotal % 60).padStart(2, "0")}`
    : `${Math.floor(secTotal / 60)}:${String(secTotal % 60).padStart(2, "0")}`;
  const stats = [
    { k: "LOCKED", v: it.locked, c: TONE.ok.c },
    { k: "SUPERSEDED", v: it.superseded, c: TONE.violet.c },
    { k: "OPEN", v: it.open, c: TONE.warn.c },
    { k: "Sources", v: it.sources, c: TONE.sky.c },
    { k: "Requests", v: it.requests, c: "#d8b4fe" },
  ];
  return (
    <Lane>
      <div className="prism-border overflow-hidden rounded-2xl bg-[var(--color-ink-1)]">
        <div className="flex items-center gap-3 px-4 pb-3 pt-4">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-prism text-white"><Sparkles size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[15px] font-semibold tracking-[-0.01em]">Mjadala umekamilika</p>
            <p className="text-[11.5px] text-[var(--color-muted)]">Muda {mm} · tokens {compact(total)} · ripoti iko kwenye Reports</p>
          </div>
        </div>
        <div className="grid grid-cols-5 border-y border-[var(--color-line)]">
          {stats.map((s, i) => (
            <div key={s.k} className={cn("px-1 py-2.5 text-center sm:px-2", i > 0 && "border-l border-[var(--color-line)]")}>
              <p className="font-mono text-[18px] font-semibold leading-6" style={{ color: s.c }}>{s.v}</p>
              <p className="truncate text-[8px] font-semibold uppercase tracking-normal text-[var(--color-faint)] sm:text-[9.5px] sm:tracking-[0.1em]">{s.k}</p>
            </div>
          ))}
        </div>
        <div className="space-y-1.5 px-4 py-3">
          {it.usage.map((u) => {
            const a = ag(u.agent);
            return (
              <div key={u.agent} className="flex items-center gap-2.5 text-[11.5px]">
                <AgentAvatar agent={a} size={18} ring={false} />
                <span className="w-[70px] shrink-0 text-[var(--color-fg-2)]">{a.name}</span>
                <span className="h-[6px] flex-1 overflow-hidden rounded-full bg-white/[0.05]">
                  <span className="block h-full rounded-full transition-[width] duration-700" style={{ width: `${(u.tokens / max) * 100}%`, background: a.accent }} />
                </span>
                <span className="w-[76px] shrink-0 text-right font-mono text-[10.5px] text-[var(--color-muted)]">{compact(u.tokens)} · {u.requests}×</span>
              </div>
            );
          })}
        </div>
        <div className="flex border-t border-[var(--color-line)]">
          <Link href="/reports" className="flex flex-1 items-center justify-center gap-1.5 py-2.5 text-[12px] font-medium text-[var(--color-fg)] hover:bg-white/[0.03]"><FileText size={13} /> Fungua ripoti</Link>
          <Link href="/sessions" className="flex flex-1 items-center justify-center gap-1.5 border-l border-[var(--color-line)] py-2.5 text-[12px] text-[var(--color-muted)] hover:bg-white/[0.03] hover:text-[var(--color-fg)]">Sessions <ArrowRight size={12} /></Link>
        </div>
      </div>
    </Lane>
  );
}
