"use client";
/* ============================================================ R31 · CU CARDS
 * Cards za matukio ya XMD Computer — uhamisho kutoka xmd3 (maabra ya CEO):
 * muundo, tabia, LABELS (Kingereza kama zilivokuwa) na shimmer KAMA ZILIVO.
 * Rangi tu: company theme (cu-anim.css). */

import { useEffect, useState } from "react";
import {
  Brain, Camera, ExternalLink, FilePlus2, FileSearch, GitBranch, Globe, Lock, Pencil, PenLine, Rocket, Search, Terminal, TriangleAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  computeLineDiff, diffStats, formatBytes, formatDuration, hostname, isRunning, ProgressBar, ShimmerText, shortPath, ToolRow, useSettledStatus, useTypewriter, CodeStreamBlock, type ToolStatus,
} from "./kit";
import type {
  CuErrorItem, CuHookItem, CuExecItem, CuLinkItem, CuShotItem, CuTextItem, CuThinkItem,
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

/* ── matokeo ya grep/glob kutoka output → results za SearchCard ──────────── */
function resultsFromOutput(output?: string, max = 5) {
  if (!output) return [];
  return output.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, max)
    .map((l, i) => ({ id: String(i), title: l.slice(0, 90), location: l.split(":")[0]?.slice(0, 60) || "" }));
}

/* ── exec: bash/git/github/vercel/server/check → TerminalCard (xmd3 — ileile) ── */
export function CuTerminalCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  return (
    <ToolRow
      status={status}
      icon={<Terminal size={13} />}
      activeLabel="Running command"
      label="Ran command"
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

/* ── exec: write_file → FileWriteCard (xmd3 — ileile + ProgressBar 'Writing file') ── */
export function CuFileWriteCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  const additions = it.preview ? it.preview.split("\n").length : undefined;
  return (
    <ToolRow
      status={status}
      icon={<FilePlus2 size={13} />}
      activeLabel="Creating file"
      label="Created file"
      detail={<code className="font-mono text-[12px]">{shortPath(it.path || it.command, 3)}</code>}
      trailing={
        <span className="flex items-center gap-1.5">
          {additions !== undefined && !running && (
            <span className="rounded-full bg-[var(--px-success-soft)] px-1.5 py-0.5 text-[10.5px] font-medium tabular-nums text-[var(--px-success)]">+{additions}</span>
          )}
          {it.chars !== undefined && !running && (
            <span className="text-[10.5px] tabular-nums text-[var(--px-fg-subtle)]">{formatBytes(it.chars)}</span>
          )}
        </span>
      }
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      <div className="flex flex-col gap-2 px-1">
        <ProgressBar label="Writing file" />
        {(running ? it.draft : it.preview || it.draft) ? (
          <CodeStreamBlock
            code={String((running ? it.draft : it.preview || it.draft) || "").slice(0, 2000)}
            filename={shortPath(it.path || it.command, 3)}
            streaming={running}
            icon={<FilePlus2 size={12} />}
          />
        ) : null}
      </div>
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
      activeLabel="Reading file"
      label="Read file"
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

/* ── exec: edit_file → DiffCard (xmd3 — ileile: +/- stats + unified diff, rows zinastagger) ── */
export function CuDiffCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  const before = it.oldStr || "";
  const after = it.newStr ?? it.preview ?? "";
  const diff = computeLineDiff(before, after);
  const stats = diffStats(diff);
  return (
    <ToolRow
      status={status}
      icon={<Pencil size={13} />}
      activeLabel="Editing file"
      label="Edited file"
      detail={<code className="font-mono text-[12px]">{shortPath(it.path || it.command, 3)}</code>}
      trailing={
        !running ? (
          <span className="flex items-center gap-1 text-[10.5px] font-medium tabular-nums">
            <span className="text-[var(--px-success)]">+{stats.additions}</span>
            <span className="text-[var(--px-danger)]">-{stats.deletions}</span>
          </span>
        ) : null
      }
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      <div className="max-h-64 overflow-auto rounded-[var(--px-radius)] border border-[var(--px-border)] bg-[var(--px-bg)] font-mono text-[11.5px] leading-[1.6] [scrollbar-width:thin]">
        {diff.map((line, index) => (
          <div
            key={`${index}-${line.content}`}
            className={cn(
              "px-diff-line flex gap-2 whitespace-pre-wrap px-2",
              line.type === "add" && "bg-[var(--px-diff-add-bg)] text-[var(--px-diff-add-fg)]",
              line.type === "remove" && "bg-[var(--px-diff-del-bg)] text-[var(--px-diff-del-fg)]",
              line.type === "context" && "text-[var(--px-fg-muted)]",
            )}
            style={{ animationDelay: `${Math.min(index * 0.015, 0.4)}s` }}
          >
            <span className="w-8 shrink-0 select-none text-right tabular-nums text-[var(--px-fg-subtle)]">
              {line.newNumber ?? line.oldNumber ?? ""}
            </span>
            <span className="w-2 shrink-0 select-none">
              {line.type === "add" ? "+" : line.type === "remove" ? "-" : " "}
            </span>
            <span className="min-w-0 flex-1">{line.content || "\u00a0"}</span>
          </div>
        ))}
      </div>
    </ToolRow>
  );
}

/* ── exec: glob/grep/search → SearchCard (xmd3 — ileile: KIND_META + badge ya results) ── */
export type CuSearchKind = "web" | "code" | "files";
const SEARCH_META: Record<CuSearchKind, { icon: typeof Search; active: string; done: string }> = {
  web: { icon: Globe, active: "Searching the web", done: "Searched the web" },
  code: { icon: Search, active: "Searching codebase", done: "Searched codebase" },
  files: { icon: FileSearch, active: "Searching files", done: "Searched files" },
};

export function CuSearchCard({ it, kind = "files" }: { it: CuExecItem; kind?: CuSearchKind }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  const meta = SEARCH_META[kind];
  const Icon = meta.icon;
  const query = it.command.replace(/^(Glob|Grep)\s*/i, "").slice(0, 60) || it.draft || it.tool;
  const results = running ? [] : resultsFromOutput(it.output);
  return (
    <ToolRow
      status={status}
      icon={<Icon size={13} />}
      activeLabel={meta.active}
      label={meta.done}
      detail={<span className="italic">“{query}”</span>}
      trailing={
        !running ? (
          <span className="rounded-full bg-[var(--px-surface-2)] px-1.5 py-0.5 text-[10.5px] tabular-nums text-[var(--px-fg-muted)]">
            {results.length} results
          </span>
        ) : null
      }
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      {results.length > 0 && (
        <ul className="flex flex-col gap-1">
          {results.map((r, index) => (
            <li
              key={r.id}
              className={cn(
                "px-result-in rounded-[var(--px-radius)] border border-[var(--px-border)] bg-[var(--px-bg)] px-2.5 py-1.5",
                "transition-colors hover:border-[var(--px-border-strong)] hover:bg-[var(--px-surface)]",
              )}
              style={{ animationDelay: `${index * 0.05}s` }}
            >
              <p className="truncate text-[12.5px] font-medium">{r.title}</p>
              <p className="truncate text-[11.5px] text-[var(--px-fg-subtle)]">{r.location}</p>
            </li>
          ))}
        </ul>
      )}
    </ToolRow>
  );
}

/* ── exec: browser_navigate → WebBrowseCard (xmd3 — ileile: chrome + URL bar + Loading bar) ── */
export function CuWebBrowseCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  const url = it.command || it.draft || "";
  return (
    <ToolRow
      status={status}
      icon={<Globe size={13} />}
      activeLabel="Opening browser"
      label="Visited page"
      detail={hostname(url)}
      durationMs={it.ms}
      startedAt={it.startedAt}
      defaultExpanded={running}
    >
      <div className="overflow-hidden rounded-[var(--px-radius)] border border-[var(--px-border)] bg-[var(--px-bg)]">
        <div className="flex items-center gap-2 border-b border-[var(--px-border)] bg-[var(--px-surface)] px-2.5 py-1.5">
          <span className="flex gap-1">
            <span className="size-2 rounded-full bg-[var(--px-border-strong)]" />
            <span className="size-2 rounded-full bg-[var(--px-border-strong)]" />
            <span className="size-2 rounded-full bg-[var(--px-border-strong)]" />
          </span>
          <span className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-[var(--px-bg)] px-2 py-0.5">
            <Lock size={10} className="shrink-0 text-[var(--px-fg-subtle)]" />
            <span className="truncate font-mono text-[11px] text-[var(--px-fg-muted)]">{url}</span>
          </span>
        </div>
        {running ? (
          <div className="p-3">
            <ProgressBar label="Loading page" />
            <div className="mt-3 flex flex-col gap-2">
              <span className="px-skeleton-bg block h-3 w-2/3 rounded-full" />
              <span className="px-skeleton-bg block h-24 w-full rounded-[var(--px-radius)]" />
            </div>
          </div>
        ) : (
          it.output && (
            <pre className="max-h-32 overflow-auto whitespace-pre-wrap px-3 py-2 font-mono text-[11px] leading-[1.5] text-[var(--px-fg-muted)] [scrollbar-width:thin]">
              {it.output.slice(0, 800)}
            </pre>
          )
        )}
      </div>
    </ToolRow>
  );
}

/* ── exec: generic → GenericToolCard (xmd3 — ileile: Running X → Ran X) ──── */
export function CuGenericToolCard({ it }: { it: CuExecItem }) {
  const status = useSettledStatus(it.state === "run" ? "running" : it.state === "fail" ? "error" : "success");
  const running = isRunning(status);
  const name = it.tool || "tool";
  return (
    <ToolRow
      status={status}
      icon={<PenLine size={13} />}
      activeLabel={`Running ${name}`}
      label={`Ran ${name}`}
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
  if (t.includes("edit")) return <CuDiffCard it={it} />;
  if (t.includes("read")) return <CuFileReadCard it={it} />;
  if (t.includes("list") || k === "list") return <CuSearchCard it={it} kind="files" />;
  if (t.includes("grep") || k === "grep") return <CuSearchCard it={it} kind="code" />;
  if (t.includes("search") || k === "search") return <CuSearchCard it={it} kind="web" />;
  if (t.includes("browser") || k.includes("browse")) return <CuWebBrowseCard it={it} />;
  if (t.includes("bash") || t.includes("git") || t.includes("github") || t.includes("vercel") || t.includes("deploy") || t.includes("server") || t.includes("check") || k.includes("bash") || k.includes("git") || k.includes("deploy")) return <CuTerminalCard it={it} />;
  return <CuGenericToolCard it={it} />;
}

/* ── think → ThinkingCard (xmd3 — ileile: 'Thinking' shimmer → 'Thought for Xs') ── */
export function CuThinkingView({ it }: { it: CuThinkItem }) {
  const status: ToolStatus = it.partial ? "running" : "success";
  const [revealing, setRevealing] = useState(Boolean(it.text));
  useEffect(() => {
    if (!it.text || it.partial) { if (!it.text) setRevealing(false); return; }
    setRevealing(true);
    // R36: text inaonekana INSTANT — hii ni settle fupi ya shimmer tu (si pacing ya maandishi)
    const timer = window.setTimeout(() => setRevealing(false), 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [it.text]);
  const shown = useTypewriter(it.text ?? "", revealing, 70);
  const effective: ToolStatus = revealing ? "running" : status;
  const running = effective === "running";
  return (
    <ToolRow
      status={effective}
      icon={<Brain size={13} />}
      activeLabel="Thinking"
      label={it.ms ? `Thought for ${formatDuration(it.ms)}` : "Thought"}
      durationMs={it.ms}
      className="cu-think"
      showDuration={running}
      autoCollapseOnComplete
    >
      {it.text && (
        <p className="whitespace-pre-wrap border-l border-[var(--px-border)] pl-3 text-[12.5px] leading-relaxed text-[var(--px-fg-muted)]">
          {revealing ? shown : it.text}
          {revealing && <span className="px-caret" />}
        </p>
      )}
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
        <button onClick={() => setZoom(false)} className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-lg text-white/90 transition-colors hover:bg-white/20" aria-label="Close">✕</button>
        <img src={src} alt={it.label} onClick={(e) => e.stopPropagation()} className="max-h-full max-w-full rounded-lg object-contain" style={{ boxShadow: "0 25px 50px -12px rgba(0,0,0,0.5)" }} />
        <div className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 text-xs text-white/80">Bonyeza nje au Esc kufunga</div>
      </div>
    )}
    <ToolRow
      status={status}
      icon={<Camera size={13} />}
      activeLabel="Taking screenshot"
      label="Captured screenshot"
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

/* R35 · nidhamu ya bridge hooks — mstari mfupi (advice/continue/brake/shot_deny/fail) */
export function CuHookView({ it }: { it: CuHookItem }) {
  const icon = it.hookKind === "brake" ? "🛑" : it.hookKind === "continue" ? "🔁" : it.hookKind === "shot_deny" ? "📷" : it.hookKind === "fail" ? "⚠️" : "ℹ️";
  return (
    <div className="cu-anim flex w-full items-start gap-2 rounded-[var(--px-radius-lg)] border border-[var(--px-line)] bg-[var(--px-surface-2)] px-3 py-2">
      <span className="shrink-0 text-[12px] leading-5">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[11.5px] leading-relaxed text-[var(--px-fg-muted)]">
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-[var(--px-fg-3)]">nidhamu/{it.hookKind}{it.streak ? ` ×${it.streak}` : ""}</span>
          {" — "}{it.text.slice(0, 400)}
        </p>
      </div>
    </div>
  );
}

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
