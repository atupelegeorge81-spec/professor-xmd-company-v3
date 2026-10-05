"use client";
/* ============================================================ R31 · CU KIT
 * Uhamisho wa primitives za agent-anim (xmd3): ShimmerText, Spinner, StatusIcon,
 * DurationTicker, CollapsibleSection, ToolRow — muundo na tabia KAMA ZILIVO;
 * icons lucide (tunazo) na transitions CSS badala ya motion/react (hatuna).
 * Rangi: cu-anim.css variables → COMPANY theme. */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
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

/** `https://a.b/x` → `a.b` (xmd3 lib/format.ts) */
export function hostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/* ── ProgressBar (xmd3 primitives/ProgressBar.tsx — ileile; CSS badala ya motion) ── */
export function ProgressBar({ value, className, height = 3, label = "Progress" }: { value?: number; className?: string; height?: number; label?: string }) {
  const indeterminate = value === undefined;
  return (
    <div
      role="progressbar"
      aria-label={label}
      aria-valuenow={indeterminate ? undefined : Math.round(value * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      className={cn("relative w-full overflow-hidden rounded-full bg-[var(--px-surface-2)]", className)}
      style={{ height }}
    >
      {indeterminate ? (
        <span className="absolute inset-y-0 left-0 w-1/2 rounded-full bg-[var(--px-accent)]" style={{ animation: "px-indeterminate 1.3s ease-in-out infinite" }} />
      ) : (
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-[var(--px-accent)] transition-[width] duration-500"
          style={{ width: `${Math.min(100, Math.max(0, value * 100))}%` }}
        />
      )}
    </div>
  );
}

/* ── diff (xmd3 lib/diff.ts — ileile, hakuna dependency) ────────────────── */
export type DiffLine = {
  type: "add" | "remove" | "context";
  content: string;
  oldNumber?: number | undefined;
  newNumber?: number | undefined;
};

export type DiffStats = { additions: number; deletions: number };

export function computeLineDiff(before: string, after: string): DiffLine[] {
  const a = before.length ? before.split("\n") : [];
  const b = after.length ? after.split("\n") : [];

  const table: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array<number>(b.length + 1).fill(0),
  );

  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      const row = table[i]!;
      const next = table[i + 1]!;
      row[j] = a[i] === b[j] ? next[j + 1]! + 1 : Math.max(next[j]!, row[j + 1]!);
    }
  }

  const lines: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let oldNumber = 1;
  let newNumber = 1;

  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      lines.push({ type: "context", content: a[i]!, oldNumber: oldNumber++, newNumber: newNumber++ });
      i += 1;
      j += 1;
    } else if (table[i + 1]![j]! >= table[i]![j + 1]!) {
      lines.push({ type: "remove", content: a[i]!, oldNumber: oldNumber++ });
      i += 1;
    } else {
      lines.push({ type: "add", content: b[j]!, newNumber: newNumber++ });
      j += 1;
    }
  }
  while (i < a.length) lines.push({ type: "remove", content: a[i++]!, oldNumber: oldNumber++ });
  while (j < b.length) lines.push({ type: "add", content: b[j++]!, newNumber: newNumber++ });

  return lines;
}

export function diffStats(lines: DiffLine[]): DiffStats {
  return lines.reduce<DiffStats>(
    (acc, line) => {
      if (line.type === "add") acc.additions += 1;
      if (line.type === "remove") acc.deletions += 1;
      return acc;
    },
    { additions: 0, deletions: 0 },
  );
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

/* ── useSettledStatus (xmd3 lib/hooks.ts — VERBATIM, 05-10 G4:
 * wasPendingRef inakumbuka frame ya "running" ilipoanza; exit inapunguzwi usione
 * glitch ya <450ms; haichechei kuanza, inagandaza tu exit. Tofauti na ya zamani:
 * hali isiyowahi kuwa "running" (replay) inaonyeshwa MARA MOJA.) ─────────────── */
export function useSettledStatus(status: ToolStatus, running: ToolStatus = "running"): ToolStatus {
  const isPending = (s: ToolStatus) => s === running;
  const minVisibleMs = 450;
  const [display, setDisplay] = useState(status);
  const wasPendingRef = useRef(isPending(status));
  const shownAtRef = useRef(Date.now());
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    const pendingNow = isPending(status);
    const wasPending = wasPendingRef.current;

    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (pendingNow) {
      if (!wasPending) shownAtRef.current = Date.now();
      wasPendingRef.current = true;
      setDisplay(status);
      return;
    }

    wasPendingRef.current = false;

    if (!wasPending) {
      setDisplay(status);
      return;
    }

    const elapsed = Date.now() - shownAtRef.current;
    const remaining = Math.max(0, minVisibleMs - elapsed);

    if (remaining === 0) {
      setDisplay(status);
    } else {
      timerRef.current = window.setTimeout(() => setDisplay(status), remaining);
    }

    return () => {
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, minVisibleMs]);

  return display;
}

/* ── highlight.ts (xmd3 lib/highlight.ts — VERBATIM, 05-10 G4) ─────────────
 * Dependency-free token highlighter: strings, comments, numbers, keywords. */
export type Token = { value: string; kind: TokenKind };
export type TokenKind = "plain" | "keyword" | "string" | "comment" | "number" | "function";

const KEYWORDS = new Set([
  "const","let","var","function","return","if","else","for","while","import","from","export",
  "default","async","await","class","extends","new","try","catch","finally","throw","typeof",
  "interface","type","enum","public","private","readonly","as","of","in","null","undefined",
  "true","false","def","elif","print","lambda","self","None","True","False","and","or","not",
  "echo","cd","ls","npm","bun","git","sudo","pip","python","node",
]);

const PATTERN =
  /(\/\/[^\n]*|#[^\n]*|\/\*[\s\S]*?\*\/)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)/g;

export function tokenize(code: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const match of code.matchAll(PATTERN)) {
    const index = match.index ?? 0;
    if (index > last) tokens.push({ value: code.slice(last, index), kind: "plain" });
    const [value, comment, str, num, word] = match;
    if (comment) tokens.push({ value, kind: "comment" });
    else if (str) tokens.push({ value, kind: "string" });
    else if (num) tokens.push({ value, kind: "number" });
    else if (word) tokens.push({ value, kind: KEYWORDS.has(word) ? "keyword" : "plain" });
    last = index + value.length;
  }
  if (last < code.length) tokens.push({ value: code.slice(last), kind: "plain" });
  return tokens;
}

export const TOKEN_CLASS: Record<TokenKind, string> = {
  plain: "text-[var(--px-fg-muted)]",
  keyword: "text-[#c792ea]",
  string: "text-[#c3e88d]",
  comment: "text-[#5c6370] italic",
  number: "text-[#f78c6c]",
  function: "text-[#82aaff]",
};

/* ── CodeStreamBlock (xmd3 components/CodeStreamBlock.tsx — ported 05-10 G4) ─ */
export function CodeStreamBlock({
  code, language = "ts", filename, streaming = false, charsPerSecond = 140, className, icon,
}: {
  code: string; language?: string; filename?: string; streaming?: boolean; charsPerSecond?: number; className?: string; icon?: ReactNode;
}) {
  const shown = useTypewriter(code, streaming, charsPerSecond);
  const text = streaming ? shown : code;
  const tokens = useMemo(() => tokenize(text), [text]);

  return (
    <div className={cn("overflow-hidden rounded-[var(--px-radius)] border border-[var(--px-border)]", className)}>
      <div className="flex items-center gap-2 bg-[var(--px-surface)] px-2.5 py-1.5 text-[11.5px] text-[var(--px-fg-muted)]">
        {icon}
        <span className="font-mono">{filename ?? language}</span>
        {streaming && (
          <span className="ml-auto text-[11px]">
            <ShimmerText>Writing</ShimmerText>
          </span>
        )}
      </div>
      <pre className="max-h-64 overflow-auto bg-[rgb(4_6_10/0.9)] px-3 py-2 font-mono text-[11.5px] leading-[1.55] [scrollbar-width:thin]">
        <code>
          {tokens.map((token, index) => (
            <span key={index} className={TOKEN_CLASS[token.kind]}>
              {token.value}
            </span>
          ))}
          {streaming && <span className="px-caret" />}
        </code>
      </pre>
    </div>
  );
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
  /** xmd3: ticker inaonekana RUNNING tu (mf. ThinkingCard — "Thought for 12.4s" ina muda wake) */
  showDuration?: boolean;
};

export function ToolRow({
  status, icon, activeLabel, label, detail, trailing, children,
  durationMs, startedAt, className, defaultExpanded = false, autoCollapseOnComplete = false, showDuration = true,
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
          {showDuration && <DurationTicker running={running} startedAt={startedAt} durationMs={durationMs} />}
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
