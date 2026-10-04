"use client";
import { useState } from "react";
import {
  CheckCircle2, ChevronDown, CircleDashed, ExternalLink, FileCode2, FolderTree,
  GitBranch, Globe, ImageIcon, Loader2, Monitor, Rocket, Terminal, X, XCircle,
} from "lucide-react";
import type { CuExecRow, CuReportItem, CuRunItem, CuShot } from "@/lib/stage/types";
import { cn, compact } from "@/lib/utils";
import { ReportBody } from "../../reports/ReportBody";
import { Lane, Spinner, TONE, Tag } from "./kit";

/* ============================================================== R31 · XMD COMPUTER
 * engine: startComputerPhase (baada ya report+plan+memory) — agent MMOJA bila jina,
 * hakuna kitufe (auto). Kadi hii: hali hai + execs + shots + Files badge + linki.
 * Ripoti yenyewe ni DOCUMENT (CuReportCard hapa chini) — si card ya stream. */

const TOOL_ICON: Record<string, typeof Terminal> = {
  bash: Terminal, write: FileCode2, edit: FileCode2, read: FileCode2,
  browse: Globe, browser: Globe, git: GitBranch, github: GitBranch,
  deploy: Rocket, search: Globe, other: Terminal,
};

function ExecRow({ row }: { row: CuExecRow }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[row.kindX] || TOOL_ICON[row.tool?.toLowerCase?.() || ""] || Terminal;
  const fail = row.state === "fail" || (row.exit !== undefined && row.exit !== 0);
  const done = row.state !== "run";
  return (
    <div className={cn("rounded-lg border border-[var(--color-line)] bg-[rgb(8_10_14/0.45)] transition-colors", fail && "border-[rgb(248_113_113/0.25)]")}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2 px-2.5 py-1.5 text-left">
        <span className={cn("grid h-5 w-5 shrink-0 place-items-center rounded-md", fail ? "bg-[rgb(248_113_113/0.12)] text-[#f87171]" : done ? "bg-[rgb(52_211_153/0.1)] text-[#34d399]" : "bg-[rgb(167_139_250/0.12)] text-[#a78bfa]")}>
          {row.state === "run" ? <Loader2 size={11} className="anim-spin" /> : fail ? <XCircle size={11} /> : <CheckCircle2 size={11} />}
        </span>
        <Icon size={11} className="shrink-0 text-[var(--color-faint)]" />
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--color-fg-2)]" title={row.command}>
          {row.command || row.tool}
        </span>
        <span className="flex shrink-0 items-center gap-1.5 font-mono text-[9.5px] text-[var(--color-faint)]">
          {row.path && <span className="hidden max-w-[120px] truncate text-[var(--color-faint)] sm:inline">{row.path}</span>}
          {row.lines ? <span>{row.lines}L</span> : null}
          {row.ms ? <span>{(row.ms / 1000).toFixed(1)}s</span> : null}
          {row.summary && !open && <span className="hidden max-w-[160px] truncate text-[var(--color-muted)] md:inline">{row.summary}</span>}
        </span>
      </button>
      {open && (row.output || row.summary) && (
        <div className="border-t border-[var(--color-line)] px-2.5 py-2">
          {row.summary && <p className="mb-1 text-[10.5px] text-[var(--color-muted)]">{row.summary}</p>}
          {row.output && (
            <pre className="max-h-44 overflow-auto whitespace-pre-wrap break-all font-mono text-[10.5px] leading-relaxed text-[var(--color-muted)] [scrollbar-width:thin]">{row.output}</pre>
          )}
        </div>
      )}
    </div>
  );
}

function shotUrl(s: CuShot): string {
  return `/api/boardroom/cu-file?bucket=${encodeURIComponent(s.bucketId || "")}&file=${encodeURIComponent(s.fileId || "")}`;
}

function ShotStrip({ shots }: { shots: CuShot[] }) {
  if (!shots.length) return null;
  return (
    <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:thin]">
      {shots.map((s) => (
        <a key={s.id} href={s.ok ? shotUrl(s) : undefined} target="_blank" rel="noreferrer"
           className={cn("group relative block h-[72px] w-[118px] shrink-0 overflow-hidden rounded-lg border border-[var(--color-line)] bg-[rgb(8_10_14/0.6)]", !s.ok && "opacity-60")}>
          {s.ok ? (
            <img src={shotUrl(s)} alt={s.label} loading="lazy" className="h-full w-full object-cover object-top transition group-hover:scale-[1.03]" />
          ) : (
            <span className="grid h-full w-full place-items-center text-[var(--color-faint)]"><ImageIcon size={14} /></span>
          )}
          <span className="absolute inset-x-0 bottom-0 truncate bg-[rgb(8_10_14/0.8)] px-1.5 py-0.5 text-[9px] font-medium text-[var(--color-fg-2)]">{s.label}</span>
        </a>
      ))}
    </div>
  );
}

/** Files tree — viewer tu (si editor) · simu: sheet ya fullscreen (back ya kadi). */
function FilesSheet({ files, count, onClose }: { files: string[]; count: number; onClose: () => void }) {
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

export function CuRunCard({ it }: { it: CuRunItem }) {
  const [filesOpen, setFilesOpen] = useState(false);
  const running = !it.finished && it.status === "run";
  const tone = running ? TONE.violet : it.status === "error" ? TONE.bad : TONE.ok;
  const mm = it.ms ? Math.round(it.ms / 1000) : null;
  return (
    <Lane className="space-y-3">
      <div className="overflow-hidden rounded-2xl border transition-colors duration-500" style={{ borderColor: `rgb(${tone.rgb} / 0.24)`, background: `linear-gradient(160deg, rgb(${tone.rgb} / 0.07), rgb(${tone.rgb} / 0.01) 45%)` }}>
        {/* header */}
        <div className="flex items-center gap-3 px-4 pb-2.5 pt-3.5">
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
              {compact(it.tokens)} tk · {it.requests} calls{mm ? ` · ${mm}s` : ""}
            </span>
          </div>
        </div>

        {/* mstari hai */}
        {running && (
          <div className="mx-4 mb-2.5 flex items-center gap-2 rounded-lg border border-[rgb(167_139_250/0.18)] bg-[rgb(167_139_250/0.05)] px-3 py-1.5">
            <CircleDashed size={12} className="shrink-0 animate-spin text-[#a78bfa]" style={{ animationDuration: "3s" }} />
            <span className="shimmer-text truncate text-[11.5px] font-medium">{it.live || "Inafanya kazi…"}</span>
            <span className="ml-auto shrink-0 font-mono text-[10px] text-[var(--color-faint)]">step {it.step}</span>
          </div>
        )}
        {!running && it.live && (
          <p className="mx-4 mb-2.5 truncate text-[11px] text-[var(--color-faint)]">{it.live}</p>
        )}

        {/* execs */}
        {it.execs.length > 0 && (
          <div className="space-y-1 px-4 pb-2.5">
            <p className="mb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">Utekelezaji ({it.execs.length})</p>
            <div className="max-h-[320px] space-y-1 overflow-y-auto pr-0.5 [scrollbar-width:thin]">
              {it.execs.map((r) => <ExecRow key={r.id} row={r} />)}
            </div>
          </div>
        )}

        {/* shots */}
        {it.shots.length > 0 && (
          <div className="px-4 pb-2.5">
            <p className="mb-1.5 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-[var(--color-faint)]">Screenshots ({it.shots.length})</p>
            <ShotStrip shots={it.shots} />
          </div>
        )}

        {/* footer: Files badge + linki */}
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
