"use client";
import { useState } from "react";
import { Brain, ChevronDown, Check, Search } from "lucide-react";
import { getAgent, type AgentId } from "@/lib/team";
import type { Source } from "@/lib/ui-types";
import { cn, domainOf } from "@/lib/utils";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Markdown } from "../ui/Markdown";
import { uniqueByUrl } from "@/lib/searchHygiene";

export type Phase = "thinking" | "searching" | "answering" | "done";

export interface LiveTurn {
  kind: "turn";
  id: string;
  agent: AgentId;
  thinking: string[];
  thinkShown: number;
  search?: string;
  sources: Source[];
  content: string;
  phase: Phase;
  seconds: number;
}

/* ------------------------------ Source chips ------------------------------ */
export function Favicon({ url, size = 16 }: { url: string; size?: number }) {
  const d = domainOf(url);
  const hue = [...d].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return (
    <span className="grid shrink-0 place-items-center rounded-[5px] font-mono font-bold uppercase text-white" style={{ width: size, height: size, fontSize: size * 0.55, background: `oklch(0.55 0.14 ${hue})` }}>
      {d[0]}
    </span>
  );
}

export function SourceChips({ sources: raw }: { sources: Source[] }) {
  const [open, setOpen] = useState(false);
  const sources = uniqueByUrl(raw);
  const shown = open ? sources : sources.slice(0, 3);
  return (
    <div className="flex flex-wrap gap-1.5">
      {shown.map((s, i) => (
        <a key={`${s.url}#${i}`} href={s.url} target="_blank" rel="noreferrer" title={s.title} className="group flex h-7 max-w-[220px] items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-white/[0.025] pl-1.5 pr-2 text-[11.5px] text-[var(--color-fg-2)] transition hover:border-white/15 hover:bg-white/[0.05] animate-[rise_0.4s_both]" style={{ animationDelay: `${i * 60}ms` }}>
          <Favicon url={s.url} />
          <span className="truncate">{domainOf(s.url)}</span>
          <span className="font-mono text-[10px] text-[var(--color-faint)]">{i + 1}</span>
        </a>
      ))}
      {sources.length > 3 && !open && (
        <button onClick={() => setOpen(true)} className="flex h-7 items-center gap-1 rounded-lg border border-dashed border-[var(--color-line-strong)] px-2 text-[11.5px] text-[var(--color-muted)] hover:text-[var(--color-fg)]">
          +{sources.length - 3} more
        </button>
      )}
    </div>
  );
}

/* ------------------------------ Thinking block ------------------------------ */
export function ThinkingBlock({ turn, accent }: { turn: LiveTurn; accent: string }) {
  const live = turn.phase === "thinking" || turn.phase === "searching";
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const steps = turn.thinking.slice(0, turn.thinkShown);

  return (
    <div className="mb-3">
      <button onClick={() => setManual(!open)} className="group flex items-center gap-2 rounded-lg py-1 text-[12.5px]">
        <Brain size={14} style={{ color: accent }} className={live ? "animate-pulse" : ""} />
        {live ? (
          <span className="shimmer-text font-medium">{turn.phase === "searching" ? "Searching for evidence…" : "Thinking…"}</span>
        ) : (
          <span className="font-medium text-[var(--color-muted)] group-hover:text-[var(--color-fg-2)]">Thought for {turn.seconds}s{turn.sources.length ? ` · ${turn.sources.length} sources` : ""}</span>
        )}
        <ChevronDown size={13} className={cn("text-[var(--color-faint)] transition", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-300", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <ol className="relative ml-[6px] mt-1.5 space-y-2.5 border-l border-[var(--color-line-strong)] pb-1 pl-4">
            {steps.map((t, i) => (
              <li key={i} className="relative text-[12.5px] leading-5 text-[var(--color-muted)] animate-[rise_0.35s_both]">
                <span className="absolute -left-[21px] top-[7px] h-[7px] w-[7px] rounded-full border border-[var(--color-ink-1)]" style={{ background: i === steps.length - 1 && live ? accent : "var(--color-faint)" }} />
                {t}
              </li>
            ))}
            {turn.search && (turn.phase !== "thinking" || turn.sources.length > 0) && (
              <li className="relative animate-[rise_0.35s_both]">
                <span className="absolute -left-[21px] top-[7px] h-[7px] w-[7px] rounded-full" style={{ background: turn.phase === "searching" ? accent : "var(--color-ok)" }} />
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-fg-2)]">
                  {turn.phase === "searching" ? <Search size={13} className="animate-pulse" /> : <Check size={13} className="text-[var(--color-ok)]" />}
                  <span className="text-[var(--color-muted)]">Searched</span>
                  <span className="truncate rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px]">{turn.search}</span>
                </div>
                {turn.sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uniqueByUrl(turn.sources).map((s, i) => (
                      <div key={`${s.url}#${i}`} className="flex items-center gap-2 text-[11.5px] text-[var(--color-muted)]">
                        <Favicon url={s.url} size={14} />
                        <span className="truncate">{s.title}</span>
                        <span className="shrink-0 text-[var(--color-faint)]">{domainOf(s.url)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </li>
            )}
          </ol>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------ User prompt ------------------------------ */
export function UserPrompt({ text }: { text: string }) {
  return (
    <div className="flex justify-end animate-[rise_0.4s_both]">
      <div className="max-w-[85%]">
        <p className="mb-1 text-right text-[11px] text-[var(--color-faint)]">Mkuu · CEO</p>
        <div className="rounded-2xl rounded-tr-md border border-white/10 bg-white/[0.06] px-4 py-3 text-[14px] leading-6 text-[var(--color-fg)]">{text}</div>
      </div>
    </div>
  );
}

