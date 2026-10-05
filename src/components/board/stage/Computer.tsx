"use client";
/* ============================================================== R31 · XMD COMPUTER
 * UI ya CU ni TIMELINE (kama xmd3 — agizo la CEO 05-10): kila tukio lina card
 * yake kwenye mkondo — maneno ya agent KAWAIDA (hakuna avatar/bubble, markdown
 * + mermaid), exec/shot/GitHub/Live cards (xmd3 kama zilivo, shimmer zao).
 * CuRunCard hapa ni card ya HALI tu — maandalizi ya e2b (task, status, tokens,
 * Files badge). Ripoti ni DOCUMENT (CuReportCard — idhini 04-10). */

import { useState } from "react";
import { CheckCircle2, FolderTree, Loader2, Monitor, X, XCircle } from "lucide-react";
import type { CuReportItem, CuRunItem } from "@/lib/stage/types";
import { cn, compact } from "@/lib/utils";
import { ReportBody } from "../../reports/ReportBody";
import { Lane, Spinner, TONE, Tag } from "./kit";
import { ChevronDown, FileCode2, GitBranch, Rocket, ExternalLink } from "lucide-react";

/* ── Files tree — viewer tu (si editor) · simu: sheet ya fullscreen (back ya kadi). ── */
export function FilesSheet({ files, count, onClose }: { files: string[]; count: number; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[rgb(4_6_10/0.72)] p-0 backdrop-blur-sm sm:items-center sm:p-6" onClick={onClose}>
      <div className="flex max-h-[82vh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-2xl border border-[var(--color-line-strong)] bg-[var(--color-ink-1)] sm:rounded-2xl animate-[rise_0.3s_both]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-4 py-3">
          <FolderTree size={15} className="text-[#a78bfa]" />
          <p className="flex-1 text-[13.5px] font-semibold">Files za sandbox ({count})</p>
          <button onClick={onClose} className="grid h-7 w-7 place-items-center rounded-lg text-[var(--color-muted)] hover:bg-white/5 hover:text-[var(--color-fg)]"><X size={14} /></button>
        </div>
        <div className="flex-1 overflow-auto px-4 py-3 [scrollbar-width:thin]">
          {files.length ? files.map((f) => (
            <p key={f} className="truncate py-[3px] font-mono text-[11px] text-[var(--color-fg-2)]" title={f}>
              <span className="mr-1.5 text-[var(--color-faint)]">{f.split("/").length > 1 ? "└" : "•"}</span>{f}
            </p>
          )) : <p className="py-6 text-center text-[12px] text-[var(--color-muted)]">Hakuna files (bado au hazikutumwa).</p>}
        </div>
      </div>
    </div>
  );
}

/* ── Divider ya awamu ya CU — badge + mistari miwili (mtindo uleule wa agenda-start; uamuzi #2). ── */
export function CuDividerMark() {
  return (
    <div className="animate-[rise_0.5s_both] pt-3">
      <div className="flex items-center gap-3 py-2">
        <span className="h-px flex-1 bg-gradient-to-r from-transparent to-[var(--color-line-strong)]" />
        <span className="flex items-center gap-2 rounded-full border border-[var(--color-line)] bg-[var(--color-ink-2)] py-1 pl-1 pr-2.5 text-[11.5px]">
          <span className="grid size-5 place-items-center rounded-full bg-[rgb(167_139_250/0.16)] text-[#a78bfa]"><Monitor size={11} /></span>
          <span className="font-mono text-[10.5px] font-semibold tracking-[0.14em] text-[var(--color-fg)]">XMD COMPUTER</span>
        </span>
        <span className="h-px flex-1 bg-gradient-to-l from-transparent to-[var(--color-line-strong)]" />
      </div>
    </div>
  );
}

/* ── Card ya HALI — maandalizi ya e2b (divider imetangulia kwenye mkondo).
 * Si tank: execs/shots/maneno yote yako kwenye mkondo kama items zao. */
export function CuRunCard({ it }: { it: CuRunItem }) {
  const [filesOpen, setFilesOpen] = useState(false);
  const running = !it.finished && it.status === "run";
  const tone = running ? TONE.violet : it.status === "error" ? TONE.bad : TONE.ok;
  const mm = it.ms ? Math.round(it.ms / 1000) : null;
  return (
    <Lane>
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.07), rgb(${tone.rgb} / 0.01) 45%)` }}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 py-3">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(167_139_250/0.14)] text-[#a78bfa]"><Monitor size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="flex items-center gap-2 text-[14.5px] font-semibold tracking-[-0.01em]">
              XMD Computer
              {running ? <Spinner size={10} color="#a78bfa" /> : it.status === "error" ? <XCircle size={13} className="text-[#f87171]" /> : <CheckCircle2 size={13} className="text-[#34d399]" />}
            </p>
            <p className="truncate text-[11.5px] text-[var(--color-muted)]" title={it.task}>{it.task}</p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-1">
            {running ? <Tag tone="violet">Inatekeleza…</Tag> : it.status === "error" ? <Tag tone="bad">Imesimama</Tag> : <Tag tone="ok">Imekamilika</Tag>}
            <span className="flex items-center gap-1 font-mono text-[9.5px] text-[var(--color-faint)]">
              {compact(it.tokens)} tk · {it.requests} calls{running ? ` · hatua ${it.step}` : ""}{!running && mm ? ` · ${mm}s` : ""}
            </span>
          </div>
        </div>
        {/* footer: Files badge + linki (za mwisho — kwa mkondo pia kuna cards zao) */}
        <div className="flex flex-wrap items-center gap-2 border-t border-[var(--color-line)] px-4 py-2.5">
          <button onClick={() => setFilesOpen(true)} className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
            <FolderTree size={12} className="text-[#a78bfa]" /> Files <span className="font-mono text-[10px] text-[var(--color-faint)]">{it.filesCount}</span>
          </button>
          {it.github && (
            <a href={it.github} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
              <GitBranch size={12} className="text-[#34d399]" /> GitHub <ExternalLink size={10} className="text-[var(--color-faint)]" />
            </a>
          )}
          {it.deploy && (
            <a href={it.deploy} target="_blank" rel="noreferrer" className="flex h-7 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.03] px-2.5 text-[11px] font-medium text-[var(--color-fg-2)] hover:bg-white/[0.06] hover:text-[var(--color-fg)]">
              <Rocket size={12} className="text-[#7dd3fc]" /> Live <ExternalLink size={10} className="text-[var(--color-faint)]" />
            </a>
          )}
          {it.screenshots > 0 && (
            <span className="ml-auto font-mono text-[9.5px] text-[var(--color-faint)]">{it.screenshots} screenshots</span>
          )}
        </div>
      </div>
      {filesOpen && <FilesSheet files={it.files} count={it.filesCount} onClose={() => setFilesOpen(false)} />}
    </Lane>
  );
}

/* ============================================================== CU REPORT — DOCUMENT
 * Idhini (04-10): ripoti ya computer-use inarender KAWAIDA TU kama document
 * (kama XMD ilivyoandika) — ReportBody: headings/table/mermaid/code zote.
 * SI card ya stream ya maneno madogo — ni hati kamili. */
export function CuReportCard({ it }: { it: CuReportItem }) {
  const [expanded, setExpanded] = useState(false);
  const words = it.doc.trim() ? it.doc.trim().split(/\s+/).length : 0;
  const partial = it.partial;
  return (
    <Lane className="space-y-3">
      <div className="overflow-hidden rounded-2xl border" style={{ borderColor: `rgb(${partial ? TONE.warn.rgb : TONE.ok.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${partial ? TONE.warn.rgb : TONE.ok.rgb} / 0.06), rgb(8 10 14 / 0.2) 45%)` }}>
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-3.5">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[rgb(52_211_153/0.12)] text-[#34d399]"><FileCode2 size={16} /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[14.5px] font-semibold tracking-[-0.01em]">{it.title}</p>
            <p className="text-[11.5px] text-[var(--color-muted)]">Hati kamili ya utekelezaji — kama document (table/diagram/code zinarender)</p>
          </div>
          {partial ? <Tag tone="warn">Sehemu</Tag> : <Tag tone="ok">Kamili</Tag>}
        </div>

        {/* ukurasa — document */}
        <div className="relative mx-3 mt-1">
          <div className="overflow-y-auto rounded-xl border border-[var(--color-line)] bg-[rgb(8_10_14/0.6)] px-4 py-3 text-[13px] [scrollbar-width:thin]"
               style={{ maxHeight: expanded ? 640 : 380 }}>
            <div className="st-doc">
              <ReportBody text={it.doc || " "} />
            </div>
          </div>
          {!expanded && (
            <div className="pointer-events-none absolute inset-x-px bottom-px flex h-16 items-end justify-center rounded-b-xl bg-gradient-to-t from-[rgb(8_10_14)] to-transparent pb-1.5">
              <button onClick={() => setExpanded(true)} className="pointer-events-auto flex h-7 items-center gap-1 rounded-full border border-[var(--color-line-strong)] bg-[var(--color-ink-2)] px-3 text-[11.5px] text-[var(--color-fg-2)] hover:text-[var(--color-fg)]">
                Soma yote <ChevronDown size={12} />
              </button>
            </div>
          )}
        </div>

        {/* takwimu + linki */}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-[11px] text-[var(--color-muted)]">
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{words}</b> maneno</span>
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{compact(it.doc.length)}</b> herufi</span>
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{it.screenshots}</b> picha</span>
          <span><b className="font-mono font-semibold text-[var(--color-fg-2)]">{compact(it.tokens)}</b> tokens</span>
          <span className="ml-auto flex items-center gap-2">
            {it.github && <a href={it.github} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"><GitBranch size={11} /> GitHub</a>}
            {it.deploy && <a href={it.deploy} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[var(--color-fg-2)] hover:text-[var(--color-fg)]"><Rocket size={11} /> Live</a>}
          </span>
        </div>
      </div>
    </Lane>
  );
}
