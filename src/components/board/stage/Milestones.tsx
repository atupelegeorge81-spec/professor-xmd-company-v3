"use client";
/* TASK-34 (MISSION TWO) — milestone mode kwenye chat.
 * - MsMark: badges za kugawanya mazungumzo — milestone (ya PEKEE: machungwa→waridi + bendera),
 *   XMD Computer (kila inapoingia), reviewers (R0 + kila uthibitisho), mjadala wa watatu.
 *   Badge ya agenda (AgendaStartMark) haijabadilika.
 * - MsMapCard: familia ya card ya Agenda — orodha ya milestones + hali live.
 * - MsCosCard: maneno ya marekebisho ya Optimus (Change Orders) ndani ya card yake (familia ya Mpango Kazi).
 * - MsReportCard: ripoti ya mwisho kwa CEO kwenye card yake. */
import Link from "next/link";
import { useLayoutEffect, useRef, useState } from "react";
import { ArrowRight, ChevronDown, FileText, Flag, MessagesSquare, Monitor, ScanEye, Wrench } from "lucide-react";
import type { MsCosItem, MsMapItem, MsMarkItem, MsReportItem, MsRow } from "@/lib/stage/types";
import { cn, compact } from "@/lib/utils";
import { AvatarStack } from "../../ui/AgentAvatar";
import { ReportBody } from "../../reports/ReportBody";
import { useApp } from "../../shell/AppState";
import { Card, Lane, Spinner, TONE, Tag, ag, type Tone } from "./kit";

const MS_GRAD = "linear-gradient(135deg, #fdba74, #f472b6)";

/* ---------------------------------------------------------------- hali ya milestone */
export function msStatus(r: Pick<MsRow, "status" | "round">, active?: boolean): { label: string; tone: Tone; live: boolean; done: boolean } {
  switch (r.status) {
    case "PLANNING": return { label: "mpango kazi unaandikwa", tone: "violet", live: true, done: false };
    case "BUILDING": return { label: "XMD Computer inajenga", tone: "violet", live: true, done: false };
    case "EVIDENCE": return { label: "evidence inakusanywa", tone: "sky", live: true, done: false };
    case "REVIEW_R0": return { label: "ukaguzi huru R0", tone: "sky", live: true, done: false };
    case "FIXING": return { label: `marekebisho R${r.round}`, tone: "warn", live: true, done: false };
    case "VERIFYING": return { label: `uthibitisho R${r.round}`, tone: "sky", live: true, done: false };
    case "SIGNED_OFF": return { label: "imesainiwa", tone: "ok", live: false, done: true };
    case "SIGNED_OFF_WITH_WAIVERS": return { label: "imesainiwa · waivers", tone: "ok", live: false, done: true };
    case "CAP_REACHED": return { label: "kikomo cha raundi", tone: "warn", live: false, done: true };
    case "BLOCKED": return { label: "imezuiwa", tone: "bad", live: false, done: true };
    case "PAUSED_QUOTA": return { label: "inasubiri quota", tone: "warn", live: false, done: false };
    case "PAUSED_INFRA": return { label: "imesimama · infra", tone: "warn", live: false, done: false };
    default: return active ? { label: "ajenda zinajadiliwa", tone: "ms", live: true, done: false } : { label: "inasubiri", tone: "muted", live: false, done: false };
  }
}

/* ---------------------------------------------------------------- badges za kugawanya */
const Rule = ({ side, color }: { side: "l" | "r"; color: string }) => (
  <span className="h-px flex-1" style={{ background: `linear-gradient(${side === "l" ? "90deg" : "270deg"}, transparent, ${color})` }} />
);

const MARK: Record<Exclude<MsMarkItem["mark"], "enter">, { tone: Tone; icon: typeof Monitor }> = {
  computer: { tone: "violet", icon: Monitor },
  review: { tone: "sky", icon: ScanEye },
  talk: { tone: "pink", icon: MessagesSquare },
};

function markText(it: MsMarkItem): { tag: string; text: string } {
  const r = it.round ?? 0;
  if (it.mark === "computer") return { tag: `${it.ms} · ${r ? `R${r}` : "BUILD"}`, text: r ? `XMD Computer · marekebisho raundi ${r}` : "XMD Computer · inajenga milestone" };
  if (it.mark === "review") return { tag: `${it.ms} · R${r}`, text: r ? `Reviewers · uthibitisho raundi ${r}` : "Reviewers · ukaguzi huru R0 (kila mmoja peke yake)" };
  const n = it.agents?.length || 0;
  return { tag: it.reviewId || `${it.ms} · R${r}`, text: `${n === 3 ? "Mjadala wa watatu" : "Mjadala wa timu"}${it.title ? ` · ${it.title}` : ""}` };
}

export function MsMark({ it }: { it: MsMarkItem }) {
  if (it.mark === "enter") return <MsEnterMark it={it} />;
  const m = MARK[it.mark];
  const t = TONE[m.tone];
  const Icon = m.icon;
  const { tag, text } = markText(it);
  return (
    <div className="scroll-mt-16 animate-[rise_0.5s_both] pt-3" data-ms-mark={it.mark}>
      <div className="flex items-center gap-3 py-2">
        <Rule side="l" color={`rgb(${t.rgb} / 0.4)`} />
        <span className="flex max-w-[86%] items-center gap-2 rounded-full border bg-[var(--color-ink-2)] py-1 pl-1 pr-2 text-[11.5px]" style={{ borderColor: `rgb(${t.rgb} / 0.32)` }}>
          <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 font-mono text-[10.5px] font-semibold" style={{ color: t.c, background: `rgb(${t.rgb} / 0.14)` }}>
            <Icon size={11} /> {tag}
          </span>
          <span className="truncate text-[var(--color-fg-2)]">{text}</span>
          {!!it.agents?.length && <span className="hidden shrink-0 sm:flex"><AvatarStack agents={it.agents.map((o) => ag(o))} size={18} /></span>}
        </span>
        <Rule side="r" color={`rgb(${t.rgb} / 0.4)`} />
      </div>
    </div>
  );
}

/** milestone inaanza — badge ya pekee (rangi + bendera + ukubwa) ili isichanganywe na agenda */
function MsEnterMark({ it }: { it: MsMarkItem }) {
  return (
    <div id={`ms-${it.ms}`} className="scroll-mt-16 animate-[rise_0.5s_both] pt-5" data-ms-mark="enter">
      <div className="flex items-center gap-3 py-2">
        <Rule side="l" color="rgb(251 146 60 / 0.6)" />
        <span
          className="flex max-w-[88%] items-center gap-2.5 rounded-2xl py-1.5 pl-1.5 pr-3"
          style={{ background: "linear-gradient(135deg, rgb(251 146 60 / 0.16), rgb(244 114 182 / 0.1))", boxShadow: "inset 0 0 0 1px rgb(251 146 60 / 0.45), 0 10px 30px -16px rgb(251 146 60 / 0.8)" }}
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl text-[#1c1008]" style={{ background: MS_GRAD }}><Flag size={14} strokeWidth={2.5} /></span>
          <span className="min-w-0">
            <span className="block font-mono text-[10.5px] font-bold tracking-[0.14em] text-[#fdba74]">
              {it.ms} · MILESTONE{it.index && it.total ? ` ${it.index}/${it.total}` : ""}
            </span>
            <span className="block truncate text-[13px] font-semibold text-[var(--color-fg)]">{it.title || it.ms}</span>
          </span>
          {it.from !== undefined && <span className="hidden shrink-0 font-mono text-[10.5px] text-[#fdba74]/80 sm:inline">A{it.from}{it.to !== it.from ? `–A${it.to}` : ""}</span>}
          {!!it.agents?.length && <span className="hidden shrink-0 sm:flex"><AvatarStack agents={it.agents.map((o) => ag(o))} size={18} /></span>}
        </span>
        <Rule side="r" color="rgb(244 114 182 / 0.5)" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- card ya milestones (familia ya Agenda) */
export function MsMapCard({ it }: { it: MsMapItem }) {
  const rows = it.milestones;
  const done = rows.filter((r) => msStatus(r).done).length;
  return (
    <Lane>
      <Card tone="ms" icon={<Flag size={15} />} eyebrow={`Milestones · ${rows.length}`} right={<Tag tone={done === rows.length && rows.length ? "ok" : "ms"}>{done}/{rows.length} zimefungwa</Tag>}>
        {/* mstari wa maendeleo — kipande kimoja kwa kila milestone */}
        <div className="mt-2 flex gap-1" aria-label="maendeleo ya milestones">
          {rows.map((r) => {
            const s = msStatus(r, it.active === r.id);
            return <span key={r.id} title={`${r.id} · ${s.label}`} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-500", s.live && "animate-pulse")} style={{ background: s.tone === "muted" ? "rgb(255 255 255 / 0.08)" : TONE[s.tone].c }} />;
          })}
        </div>
        <ol className="mt-2.5 space-y-1.5">
          {rows.map((r) => {
            const on = it.active === r.id;
            const s = msStatus(r, on);
            const t = TONE[s.tone];
            return (
              <li key={r.id} className={cn("flex items-center gap-2.5 rounded-xl border px-2.5 py-2 animate-[rise_0.35s_both] transition-colors", on ? "bg-[rgb(251_146_60/0.06)]" : "bg-white/[0.02]")} style={{ borderColor: on ? "rgb(251 146 60 / 0.35)" : "var(--color-line)" }}>
                <span className="grid h-6 min-w-[28px] shrink-0 place-items-center rounded-lg px-1 font-mono text-[11px] font-bold" style={on ? { background: MS_GRAD, color: "#1c1008" } : { background: "rgb(251 146 60 / 0.12)", color: "#fdba74" }}>{r.id}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium text-[var(--color-fg)]">{r.title}</span>
                  <span className="block truncate font-mono text-[10.5px] text-[var(--color-faint)]">A{r.from}{r.to !== r.from ? `–A${r.to}` : ""} · {r.reviewMode}{r.round ? ` · R${r.round}` : ""}</span>
                </span>
                <span className="flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: t.c, background: `rgb(${t.rgb} / 0.12)` }}>
                  {s.live && <Spinner size={9} color={t.c} />} {s.label}
                </span>
                {!!r.roster.length && <span className="hidden shrink-0 sm:flex"><AvatarStack agents={r.roster.map((o) => ag(o))} size={18} /></span>}
              </li>
            );
          })}
        </ol>
        {it.fallback && <p className="mt-2 text-[11px] text-[var(--color-muted)]">Ramani ya akiba (fallback) — Optimus hakuweza kuunda ramani.</p>}
      </Card>
    </Lane>
  );
}

/* ---------------------------------------------------------------- marekebisho ya Optimus (familia ya Mpango Kazi) */
export function MsCosCard({ it }: { it: MsCosItem }) {
  const [open, setOpen] = useState(false);
  const long = it.cos.length > 2;
  return (
    <Lane>
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: "rgb(251 191 36 / 0.24)", background: "linear-gradient(160deg, rgb(251 191 36 / 0.07), rgb(251 191 36 / 0.01) 45%)" }}>
        <div className="flex items-start gap-3 px-4 pt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-10px_rgb(139_92_246/0.8)]"><Wrench size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-warn)]">Marekebisho ya Optimus · {it.ms} R{it.round}</p>
            <p className="mt-0.5 text-[14px] font-semibold text-[var(--color-fg)]">Change Orders {it.cos.length} → XMD Computer</p>
          </div>
        </div>
        <div className="relative mx-3 mt-3">
          <ol className="space-y-2 overflow-hidden" style={{ maxHeight: long && !open ? 300 : undefined }}>
            {it.cos.map((c) => (
              <li key={c.id} className="rounded-xl border border-[var(--color-line)] bg-[rgb(8_10_14/0.6)] px-3 py-2.5 text-[12.5px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="font-mono text-[11px] font-bold text-[var(--color-fg)]">{c.id}</span>
                  <Tag tone={c.priority <= 1 ? "bad" : c.priority === 2 ? "warn" : "muted"}>P{c.priority}</Tag>
                  {c.attempt > 1 && <Tag tone="warn">jaribio {c.attempt}</Tag>}
                  <Tag tone="muted">{c.mode}</Tag>
                  {c.defectIds.map((d) => <span key={d} className="font-mono text-[10.5px] text-[var(--color-faint)]">{d}</span>)}
                </div>
                <p className="mt-1.5 text-[var(--color-fg-2)]"><b className="font-semibold text-[var(--color-fg)]">Lengo:</b> {c.desired}</p>
                {c.current && <p className="mt-1 text-[var(--color-muted)]"><b className="font-semibold">Sasa:</b> {c.current}</p>}
                {(c.files.length > 0 || c.route || c.selector) && (
                  <p className="mt-1 break-all font-mono text-[10.5px] text-[#7dd3fc]">{[...c.files, c.route, c.selector].filter(Boolean).join(" · ")}</p>
                )}
                {c.acceptance.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-[11.5px] text-[var(--color-muted)]">
                    {c.acceptance.map((a, i) => <li key={i} className="flex gap-1.5"><span className="text-[var(--color-ok)]">✓</span><span className="min-w-0">{a}</span></li>)}
                  </ul>
                )}
              </li>
            ))}
          </ol>
          {long && !open && (
            <div className="pointer-events-none absolute inset-x-px bottom-0 flex h-20 items-end justify-center rounded-b-xl bg-gradient-to-t from-[rgb(8_10_14)] to-transparent pb-2">
              <button onClick={() => setOpen(true)} className="pointer-events-auto flex h-7 items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-ink-2)] px-3 text-[11.5px] text-[var(--color-fg-2)]">
                Soma yote <ChevronDown size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="px-4 py-2.5 text-[11px] text-[var(--color-muted)]">XMD Computer inapokea Change Orders hizi (pamoja na historia ya kila defect) kwenye context mpya.</div>
      </div>
    </Lane>
  );
}

/* ---------------------------------------------------------------- ripoti ya mwisho kwa CEO */
export function MsReportCard({ it }: { it: MsReportItem }) {
  const { reports } = useApp();
  const streaming = it.live ?? it.shown < it.doc.length;
  const saved = it.saved === "saved";
  const reportId = it.reportId || reports?.find((r) => r.title === it.title)?.id || "";
  const [expanded, setExpanded] = useState(false);
  const page = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const text = it.doc.slice(0, it.shown);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  useLayoutEffect(() => {
    const el = page.current;
    if (el && stick.current && streaming) el.scrollTop = el.scrollHeight;
  }, [it.shown, streaming]);
  const tone = TONE[streaming ? "violet" : it.complete === false ? "warn" : "ok"];
  return (
    <Lane>
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.08), rgb(${tone.rgb} / 0.01) 45%)` }}>
        <div className="flex items-start gap-3 px-4 pt-4">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-prism text-white shadow-[0_8px_24px_-10px_rgb(139_92_246/0.8)]"><FileText size={16} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em]" style={{ color: tone.c }}>{streaming ? "Optimus anaandika ripoti ya CEO" : "Ripoti ya mwisho kwa CEO"}</p>
              {streaming && (
                <span className="inline-flex h-[18px] items-center gap-1 rounded-full bg-[rgb(248_113_113/0.12)] px-1.5 text-[9.5px] font-bold tracking-[0.12em] text-[#fca5a5]">
                  <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#f87171]" /> LIVE
                </span>
              )}
              {!streaming && it.complete !== undefined && <Tag tone={it.complete ? "ok" : "warn"}>{it.complete ? "milestones zote zimesainiwa" : "haijakamilika"}</Tag>}
            </div>
            <p className="mt-0.5 truncate text-[14px] font-semibold text-[var(--color-fg)]">{it.title}</p>
            {it.line && !streaming && <p className="mt-0.5 text-[11.5px] text-[var(--color-muted)]">{it.line}</p>}
          </div>
        </div>
        <div className="relative mx-3 mt-3">
          <div
            ref={page}
            onScroll={(e) => { const el = e.currentTarget; stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40; }}
            className="overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[rgb(8_10_14/0.6)] px-4 py-3 text-[13px] [scrollbar-width:thin]"
            style={{ maxHeight: !streaming && !expanded ? 260 : 420 }}
          >
            {text ? (
              <div className={cn("st-doc", streaming && "st-doc-live")}><ReportBody text={text} live={streaming} /></div>
            ) : (
              <div className="space-y-2 py-1"><div className="st-skel h-3 w-2/3 rounded" /><div className="st-skel h-3 w-5/6 rounded" /><div className="st-skel h-3 w-1/2 rounded" /></div>
            )}
          </div>
          {!streaming && !expanded && text.length > 900 && (
            <div className="pointer-events-none absolute inset-x-px bottom-px flex h-20 items-end justify-center rounded-b-xl bg-gradient-to-t from-[rgb(8_10_14)] to-transparent pb-2">
              <button onClick={() => setExpanded(true)} className="pointer-events-auto flex h-7 items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-ink-2)] px-3 text-[11.5px] text-[var(--color-fg-2)]">
                Soma yote <ChevronDown size={12} />
              </button>
            </div>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{words}</b> maneno</span>
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{compact(text.length)}</b> herufi</span>
          <span className="ml-auto">
            {streaming ? <span className="shimmer-text font-medium">inaandikwa live</span>
              : saved || reportId ? (
                <Link href={reportId ? `/reports?open=${reportId}` : "/reports"} className="inline-flex items-center gap-1 text-[var(--color-ok)] underline-offset-2 hover:underline">Imehifadhiwa · fungua Reports <ArrowRight size={11} /></Link>
              ) : <span className="text-[var(--color-faint)]">inahifadhiwa…</span>}
          </span>
        </div>
      </div>
    </Lane>
  );
}
