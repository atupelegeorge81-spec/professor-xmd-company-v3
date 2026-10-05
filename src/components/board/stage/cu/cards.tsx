"use client";
/* ============================================================ R31 · CU CARDS
 * Cards za matukio ya XMD Computer — uhamisho kutoka xmd3 (maabra ya CEO):
 * muundo, tabia (running→done, shimmer, scan, flash, typewriter) KAMA ZILIVO.
 * Rangi tu: company theme (cu-anim.css). Labels: Kiswahili cha Professor-XMD. */

import { useEffect, useState } from "react";
import {
  Brain, Camera, ExternalLink, FilePlus2, FileSearch, GitBranch, Globe, PenLine, Rocket, Terminal, TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  formatBytes, isRunning, ShimmerText, shortPath, ToolRow, useSettledStatus, useTypewriter, type ToolStatus,
} from "./kit";
import type {
  CuErrorItem, CuExecItem, CuLinkItem, CuShotItem, CuTextItem, CuThinkItem,
} from "@/lib/stage/types";
import { ReportBody } from "../../../reports/ReportBody";

/* ── badge ya exit (xmd3 TerminalCard trailing — ileile) ─────────────────── */
function ExitBadge({ exit }: { exit: number }) {
  return (
    <span className={cn(
      "rounded-full px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums",
      exit === 0 ? "bg-[var(--px-success-soft)] text-[var(--px-success)]" : "bg-[var(--px-danger-soft)] text-[var(--px-danger)]",
    )}>
      exit {exit}
    </span>
  );
}

/* ── panel ya terminal (xmd3 TerminalCard — traffic lights + dark output) ── */
function TerminalPanel({ command, output, maxLines = 14 }: { command: string; output?: string; maxLines?: number }) {
  const lines = output ? output.replace(/\n{3,}/g, "\n\n").split("\n").slice(-maxLines) : [];
  return (
    <div className="overflow-hidden rounded-[var(--px-radius)] bg-[rgb(4_6_10/0.9)]">
      <div className="flex items-center gap-1.5 border-b border-white/5 px-3 py-1.5">
        <span className="size-2 rounded-full bg-[var(--px-danger)]/70" />
        <span className="size-2 rounded-full bg-[var(--px-warning)]/70" />
        <span className="size-2 rounded-full bg-[var(--px-success)]/70" />
        <span className="ml-2 truncate font-mono text-[11px] text-[var(--px-fg-subtle)]">bash</span>
      </div>
      <pre className="overflow-auto px-3 py-2 font-mono text-[11.5px] leading-[1.5] text-[var(--px-fg-muted)] [scrollbar-width:thin]" style={{ maxHeight: `${maxLines * 1.5}em` }}>
        <span className="text-[var(--px-success)]">$ </span>
        {command}
        {lines.length > 0 && `\n${lines.join("\n")}`}
      </pre>
    </div>
  );
}

/* ── exec: bash/git/github/vercel → TerminalCard (xmd3 — ileile) ─────────── */
export function CuTerminalCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  return (
    <ToolRow
      status={status}
      icon={<Terminal size={13} />}
      activeLabel="Inatekeleza command"
      label="Command imetekelezwa"
      detail={<code className="font-mono text-[12px]">{(it.command || it.draft || it.tool).slice(0, 80)}</code>}
      trailing={running ? null : it.exit !== undefined ? <ExitBadge exit={it.exit} /> : null}
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      <TerminalPanel command={it.command || it.draft || ""} output={it.output} />
    </ToolRow>
  );
}

/* ── exec: write_file → FileWriteCard (xmd3 — ileile) ────────────────────── */
export function CuFileWriteCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  return (
    <ToolRow
      status={status}
      icon={<FilePlus2 size={13} />}
      activeLabel="Inaandika faili"
      label="Faili imeandikwa"
      detail={<code className="font-mono text-[12px]">{shortPath(it.path || it.command, 3)}</code>}
      trailing={running ? null : it.chars ? <span className="text-[10.5px] tabular-nums text-[var(--px-fg-subtle)]">{formatBytes(it.chars)}</span> : null}
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      {running ? (
        <div className="flex flex-col gap-1.5 px-1">
          <div className="h-3 w-[88%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
          <div className="h-3 w-[70%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
          <div className="h-3 w-[94%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
        </div>
      ) : (
        (it.preview || it.output) && (
          <pre className="max-h-52 overflow-auto rounded-[var(--px-radius)] bg-[rgb(4_6_10/0.9)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-[var(--px-fg-muted)] [scrollbar-width:thin]">
            {String(it.preview || it.output || "").slice(0, 2000)}
          </pre>
        )
      )}
    </ToolRow>
  );
}

/* ── exec: read_file → FileReadCard (xmd3 — ileile) ──────────────────────── */
export function CuFileReadCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  return (
    <ToolRow
      status={status}
      icon={<FileSearch size={13} />}
      activeLabel="Inasoma faili"
      label="Faili imesomwa"
      detail={<code className="font-mono text-[12px]">{shortPath(it.path || it.command, 3)}</code>}
      trailing={running ? null : it.lines ? <span className="text-[10.5px] tabular-nums text-[var(--px-fg-subtle)]">{it.lines}L</span> : null}
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      {running ? (
        <div className="flex flex-col gap-1.5 px-1">
          <div className="h-3 w-[88%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
          <div className="h-3 w-[70%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
          <div className="h-3 w-[94%] rounded bg-[var(--px-surface-2)] px-skeleton-bg" />
        </div>
      ) : (
        (it.output || it.preview) && (
          <pre className="max-h-52 overflow-auto rounded-[var(--px-radius)] bg-[rgb(4_6_10/0.9)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] text-[var(--px-fg-muted)] [scrollbar-width:thin]">
            {String(it.output || it.preview || "").slice(0, 2000)}
          </pre>
        )
      )}
    </ToolRow>
  );
}

/* ── exec: edit/kuu (generic) → GenericToolCard (xmd3 — ileile) ──────────── */
export function CuGenericToolCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  return (
    <ToolRow
      status={status}
      icon={<PenLine size={13} />}
      activeLabel={`Inatumia ${it.tool || "zana"}`}
      label={`${it.tool || "Zana"} imetumika`}
      detail={<span className="font-mono text-[12px]">{(it.command || it.draft || it.path || "").slice(0, 70)}</span>}
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      {(it.output || it.preview) && (
        <pre className="max-h-40 overflow-auto whitespace-pre-wrap rounded-[var(--px-radius)] bg-[rgb(4_6_10/0.9)] px-3 py-2 font-mono text-[11px] leading-[1.5] text-[var(--px-fg-muted)] [scrollbar-width:thin]">
          {String(it.output || it.preview || "").slice(0, 2000)}
        </pre>
      )}
    </ToolRow>
  );
}

/** Dispatcher ya exec moja → card yake (kama TimelineView ya xmd3). */
export function CuExecView({ it }: { it: CuExecItem }) {
  const t = (it.tool || "").toLowerCase();
  const k = (it.kindX || "").toLowerCase();
  if (t.includes("write")) return <CuFileWriteCard it={it} />;
  if (t.includes("read")) return <CuFileReadCard it={it} />;
  if (t.includes("bash") || t.includes("git") || t.includes("github") || t.includes("vercel") || t.includes("deploy") || k.includes("bash") || k.includes("git") || k.includes("deploy")) return <CuTerminalCard it={it} />;
  return <CuGenericToolCard it={it} />;
}

/* ── think → ThinkingCard (xmd3 — ileile: shimmer "Inafikiri" → "Alifikiri (Xs)" collapsed) ── */
export function CuThinkingView({ it }: { it: CuThinkItem }) {
  const status: ToolStatus = it.partial ? "running" : "success";
  const [revealing, setRevealing] = useState(Boolean(it.text));
  useEffect(() => {
    if (!it.text || it.partial) { if (!it.text) setRevealing(false); return; }
    setRevealing(true);
    const revealMs = Math.min(5000, Math.max(280, (it.text.length / 70) * 1000 + 200));
    const timer = window.setTimeout(() => setRevealing(false), revealMs);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it.text]);
  const shown = useTypewriter(it.text ?? "", revealing, 70);
  const effective: ToolStatus = revealing ? "running" : status;
  return (
    <ToolRow
      status={effective}
      icon={<Brain size={13} />}
      activeLabel="Inafikiri"
      label={it.ms ? `Alifikiri (${(it.ms / 1000).toFixed(1)}s)` : "Aliwaza"}
      durationMs={it.ms}
      className="cu-think"
    >
      <div className="cu-think-body px-1 text-[12.5px] leading-relaxed text-[var(--px-fg-muted)]">
        {shown}
        {revealing && <span className="px-caret" />}
      </div>
    </ToolRow>
  );
}

/* ── text → maneno ya agent KAWAIDA kwenye mkondo (hakuna avatar, hakuna bubble) ── */
export function CuTextView({ it }: { it: CuTextItem }) {
  return (
    <div className="cu-anim w-full py-0.5">
      <div className="st-doc text-[13.5px] leading-relaxed">
        <ReportBody text={it.text || " "} />
        {it.partial && <span className="px-caret" />}
      </div>
    </div>
  );
}

/* ── shot → ScreenshotCard (xmd3 — ileile: scan line → flash + scale-in; click → modal) ──── */
export function CuShotView({ it }: { it: CuShotItem }) {
  const status: ToolStatus = it.ok ? "success" : "running";
  const [zoom, setZoom] = useState(false);
  const src = it.ok ? `/api/boardroom/cu-file?bucket=${encodeURIComponent(it.bucketId || "")}&file=${encodeURIComponent(it.fileId || "")}` : undefined;
  return (
    <>
    {zoom && src && (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(0,0,0,0.85)", backdropFilter: "blur(6px)" }} onClick={() => setZoom(false)}>
        <button onClick={() => setZoom(false)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white/90 transition-colors hover:bg-white/20" aria-label="Funga">✕</button>
        <img src={src} alt={it.label} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">Bonyeza nje au Esc kufunga</div>
      </div>
    )}
    <ToolRow
      status={status}
      icon={<Camera size={13} />}
      activeLabel="Inapiga screenshot"
      label="Screenshot imepigwa"
      detail={it.label}
      defaultExpanded
    >
      <div
        className="relative overflow-hidden rounded-[var(--px-radius)] border border-[var(--px-border)] bg-[var(--px-surface)]"
        onClick={src ? () => setZoom(true) : undefined}
        style={src ? { cursor: "zoom-in" } : undefined}
        title={src ? "Bonyeza kupanua" : undefined}
      >
        {it.ok && src ? (
          <div className="relative">
            <img src={src} alt={it.label} className="px-img-in block max-h-64 w-full object-cover object-top" loading="lazy" />
            <span className="pointer-events-none absolute inset-0 bg-white" style={{ animation: "px-flash 600ms ease-out 1 both" }} />
          </div>
        ) : (
          <div className="relative h-32">
            <span className="px-skeleton-bg absolute inset-0" />
            <span className="absolute inset-x-0 h-8 bg-gradient-to-b from-transparent via-[var(--px-accent-soft)] to-transparent" style={{ animation: "px-scan 1.5s linear infinite" }} />
          </div>
        )}
      </div>
    </ToolRow>
    </>
  );
}

/* ── github/deploy → card ya link ( lugha ya plan §0: "card ya GitHub", "card ya LINK YA LIVE") ── */
export function CuLinkView({ it }: { it: CuLinkItem }) {
  const isGh = it.link === "github";
  return (
    <a
      href={it.url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "cu-anim group flex w-full items-center gap-2.5 rounded-[var(--px-radius-lg)] border px-3 py-2.5 no-underline transition-colors",
        "border-[var(--px-border)] bg-[var(--px-surface)] hover:border-[var(--px-border-strong)] hover:bg-[var(--px-surface-2)]",
      )}
    >
      <span className={cn("grid size-7 shrink-0 place-items-center rounded-lg", isGh ? "bg-[var(--px-success-soft)] text-[var(--px-success)]" : "bg-[var(--px-accent-soft)] text-[var(--px-accent)]")}>
        {isGh ? <GitBranch size={14} /> : <Rocket size={14} />}
      </span>
      <span className="min-w-0 flex-1">
        <ShimmerText active={false} className="block text-[13px] font-semibold text-[var(--px-fg)]">
          {isGh ? "Repo ya GitHub imeundwa" : "Tovuti iko LIVE"}
        </ShimmerText>
        <span className="block truncate font-mono text-[11px] text-[var(--px-fg-muted)]">{it.url}</span>
      </span>
      <ExternalLink size={13} className="shrink-0 text-[var(--px-fg-subtle)] transition-colors group-hover:text-[var(--px-fg-muted)]" />
    </a>
  );
}

/* ── error → card ya kosa (xmd3 ErrorRetryCard bila retry — Endeleza ipo notice) ── */
export function CuErrorView({ it }: { it: CuErrorItem }) {
  return (
    <div className="cu-anim flex w-full items-start gap-2.5 rounded-[var(--px-radius-lg)] border border-[var(--px-danger-soft)] bg-[var(--px-danger-soft)] px-3 py-2.5">
      <TriangleAlert size={14} className="mt-0.5 shrink-0 text-[var(--px-danger)]" />
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-[var(--px-fg)]">XMD Computer imekamatwa na kosa</p>
        <p className="mt-0.5 break-words font-mono text-[11px] leading-relaxed text-[var(--px-fg-muted)]">{it.message}</p>
      </div>
    </div>
  );
}
