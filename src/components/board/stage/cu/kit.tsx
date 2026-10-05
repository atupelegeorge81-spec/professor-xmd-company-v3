"use client";
/* ============================================================ R31 · CU KIT
 * Uhamisho wa primitives za agent-anim (xmd3): ShimmerText, Spinner, StatusIcon,
 * DurationTicker, CollapsibleSection, ToolRow — muundo na tabia KAMA ZILIVO;
 * icons lucide (tunazo) na transitions CSS badala ya motion/react (hatuna).
 * Rangi: cu-anim.css variables → COMPANY theme. */

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronRight, Minus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import "./cu-anim.css";

/* ── types (xmd3 types.ts — ileile) ──────────────────────────────────────── */
export type ToolStatus = "pending" | "running" | "success" | "error" | "cancelled" | "timeout";
export const isRunning = (s: ToolStatus) => s === "running" || s === "pending";

/* ── ShimmerText (xmd3 primitives/ShimmerText.tsx — ileile) ──────────────── */
export function ShimmerText({ children, className, active = true }: { children: ReactNode; className?: string; active?: boolean }) {
  if (!active) return <span className={cn("text-[var(--px-fg)]", className)}>{children}</span>;
  return <span className={cn("px-shimmer-text", className)}>{children}</span>;
}

/* ── Spinner (xmd3 primitives/Spinner.tsx — arc ya 270°, ileile) ─────────── */
export function Spinner({ size = 12, thickness = 1.5, className }: { size?: number; thickness?: number; className?: string }) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={cn("inline-block shrink-0 align-middle", className)}
      style={{
        width: size,
        height: size,
        borderRadius: "50%",
        border: `${thickness}px solid color-mix(in oklab, currentColor 22%, transparent)`,
        borderTopColor: "currentColor",
        animation: "px-spin var(--px-spin-duration) linear infinite",
      }}
    />
  );
}

/* ── StatusIcon (xmd3 primitives/StatusIcon.tsx — crossfade, kwa CSS) ────── */
export function StatusIcon({ status, size = 12 }: { status: ToolStatus; size?: number }) {
  if (isRunning(status)) return <span className="inline-flex text-[var(--px-accent)]"><Spinner size={size} /></span>;
  const cls =
    status === "success" ? "text-[var(--px-success)]" :
    status === "error" ? "text-[var(--px-danger)]" :
    status === "cancelled" ? "text-[var(--px-warning)]" : "text-[var(--px-timeout)]";
  const Icon = status === "success" ? Check : status === "cancelled" ? Minus : X;
  return <span key={status} className={cn("px-pop inline-flex", cls)}><Icon size={size} strokeWidth={2.5} /></span>;
}

/* ── format helpers (xmd3 lib/format.ts — ileile) ────────────────────────── */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.max(0, Math.round(ms))}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(s < 10 ? 1 : 0)}s`;
  return `${Math.floor(s / 60)}m ${Math.round(s % 60)}s`;
}
export function formatBytes(bytes: number): string {
  const units = ["B", "KB", "MB", "GB"];
  let v = bytes, u = 0;
  while (v >= 1024 && u < units.length - 1) { v /= 1024; u += 1; }
  return `${v.toFixed(v < 10 && u > 0 ? 1 : 0)} ${units[u]}`;
}
export function shortPath(path: string, segments = 2): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= segments) return path;
  return `…/${parts.slice(-segments).join("/")}`;
}

/* ── useElapsed + DurationTicker (xmd3 — ileile) ─────────────────────────── */
export function useElapsed(running: boolean, startedAt?: number, intervalMs = 100): number {
  const start = useRef<number>(startedAt ?? Date.now());
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    if (!running) return;
    start.current = startedAt ?? Date.now();
    setElapsed(Date.now() - start.current);
    const id = window.setInterval(() => setElapsed(Date.now() - start.current), intervalMs);
    return () => window.clearInterval(id);
  }, [running, startedAt, intervalMs]);
  return elapsed;
}

export function DurationTicker({ running, startedAt, durationMs, className }: { running: boolean; startedAt?: number; durationMs?: number; className?: string }) {
  const elapsed = useElapsed(running, startedAt);
  const ms = running ? elapsed : durationMs ?? 0;
  if (!ms) return null;
  return <span className={cn("text-[10.5px] tabular-nums text-[var(--px-fg-subtle)]", className)}>{formatDuration(ms)}</span>;
}

/* ── useSettledStatus (xmd3 lib/hooks.ts — anti-flicker, ileile) ─────────── */
export function useSettledStatus(status: ToolStatus, running: ToolStatus = "running"): ToolStatus {
  const [settled, setSettled] = useState(status);
  const since = useRef(Date.now());
  useEffect(() => {
    if (status === running) {
      since.current = Date.now();
      setSettled(status);
      return;
    }
    // lalamiko la "SHIDA 1": hali inayopita kwa <450ms inasoma kama glitch —
    // running frame inabaki angalau 450ms kabla ya settled (Jakob Nielsen).
    const wait = Math.max(0, 450 - (Date.now() - since.current));
    const id = window.setTimeout(() => setSettled(status), wait);
    return () => window.clearTimeout(id);
  }, [status, running]);
  return settled;
}

/* ── useTypewriter (xmd3 lib/hooks.ts — ileile) ──────────────────────────── */
export function useTypewriter(text: string, active: boolean, charsPerSecond = 70): string {
  const [shown, setShown] = useState(active ? "" : text);
  useEffect(() => {
    if (!active) {
      setShown(text);
      return;
    }
    setShown("");
    let index = 0;
    const step = Math.max(16, 1000 / charsPerSecond);
    const id = window.setInterval(() => {
      index += 1;
      setShown(text.slice(0, index));
      if (index >= text.length) window.clearInterval(id);
    }, step);
    return () => window.clearInterval(id);
  }, [text, active, charsPerSecond]);
  return shown;
}

/* ── CollapsibleSection (xmd3 — kwa CSS grid, muundo ileile) ─────────────── */
export function CollapsibleSection({ open, children, className }: { open: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={cn("px-collapse", className)} data-open={open}>
      <div className="px-collapse-inner">{children}</div>
    </div>
  );
}

/* ── ToolRow (xmd3 primitives/ToolRow.tsx — ileile; kiini cha kila card) ──── */
export type ToolRowProps = {
  status: ToolStatus;
  icon?: ReactNode;
  activeLabel: string;
  label: string;
  detail?: ReactNode;
  trailing?: ReactNode;
  children?: ReactNode;
  durationMs?: number;
  startedAt?: number;
  className?: string;
  defaultExpanded?: boolean;
  autoCollapseOnComplete?: boolean;
};

export function ToolRow({
  status, icon, activeLabel, label, detail, trailing, children,
  durationMs, startedAt, className, defaultExpanded = false, autoCollapseOnComplete = false,
}: ToolRowProps) {
  const running = isRunning(status);
  const [userExpanded, setUserExpanded] = useState<boolean | null>(defaultExpanded ? true : null);
  const auto = autoCollapseOnComplete ? running : false;
  const expanded = userExpanded ?? auto;
  const expandable = Boolean(children);
  const toggle = () => {
    if (!expandable) return;
    setUserExpanded(!(userExpanded ?? auto));
  };

  return (
    <div
      className={cn(
        "group w-full rounded-[var(--px-radius)] border border-transparent px-2 py-1.5 transition-colors duration-200",
        "hover:border-[var(--px-border)] hover:bg-[var(--px-surface)]",
        expanded && "border-[var(--px-border)] bg-[var(--px-surface)]",
        className,
      )}
      data-status={status}
    >
      <button
        type="button"
        onClick={toggle}
        disabled={!expandable}
        aria-expanded={expandable ? expanded : undefined}
        className={cn("flex w-full items-center gap-2 text-left text-[13px] leading-5", expandable ? "cursor-pointer" : "cursor-default")}
      >
        <span className="flex size-3.5 shrink-0 items-center justify-center text-[var(--px-fg-muted)]">
          {icon ?? <StatusIcon status={status} />}
        </span>
        <span className="shrink-0 font-medium">
          <ShimmerText active={running}>{running ? activeLabel : label}</ShimmerText>
        </span>
        {detail && <span className="min-w-0 flex-1 truncate font-normal text-[var(--px-fg-muted)]">{detail}</span>}
        <span className={cn("ml-auto flex shrink-0 items-center gap-2 pl-2", detail ? "ml-0" : undefined)}>
          {trailing}
          <DurationTicker running={running} startedAt={startedAt} durationMs={durationMs} />
          {expandable && (
            <ChevronRight size={13} className="px-chevron text-[var(--px-fg-subtle)] transition-colors group-hover:text-[var(--px-fg-muted)]" data-open={expanded} />
          )}
        </span>
      </button>
      {expandable && (
        <CollapsibleSection open={expanded}>
          <div className="pt-2">{children}</div>
        </CollapsibleSection>
      )}
    </div>
  );
}
