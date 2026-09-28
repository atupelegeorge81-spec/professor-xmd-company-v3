"use client";
import { useState, type ReactNode } from "react";
import { Brain, BrainCircuit, Check, ChevronDown, Database, HardDriveUpload, Search, ShieldAlert, Timer, Globe } from "lucide-react";
import type { SearchTrace } from "@/lib/stage/types";
import { cn, domainOf } from "@/lib/utils";
import { Favicon } from "../parts";
import { Spinner, TONE, type Tone } from "./kit";
import { uniqueByUrl } from "@/lib/searchHygiene";

/* ThinkingBlock — muonekano ule ule wa v2 ya awali (Brain + shimmer "Thinking…" /
 * "Searching for evidence…", dot timeline, "Searched" + query pill, orodha ya sources,
 * "Thought for Ns · N sources"). Nyongeza pekee: badges za search pipeline ndani ya
 * mstari wa "Searched" (cache · memory · relevance · SearXNG retries · save). */

export interface ThinkLike {
  thinking: string[];
  thinkShown: number;
  phase: "thinking" | "searching" | "answering" | "retrying" | "done";
  seconds: number;
  search?: SearchTrace;
}

export function ThinkTrace({ turn, accent, standalone }: { turn: ThinkLike; accent: string; standalone?: boolean }) {
  const live = turn.phase === "thinking" || turn.phase === "searching";
  const [manual, setManual] = useState<boolean | null>(null);
  const open = manual ?? live;
  const steps = turn.thinking.slice(0, turn.thinkShown);
  const tr = turn.search;
  const query = tr ? tr.query.slice(0, tr.queryShown) : "";
  const sources = tr?.sources ?? [];
  const showSearch = !!tr && (turn.phase !== "thinking" || tr.done || sources.length > 0);
  const searching = turn.phase === "searching";

  return (
    <div className="mb-3">
      <button onClick={() => setManual(!open)} className="group flex items-center gap-2 rounded-lg py-1 text-[12.5px]">
        <Brain size={14} style={{ color: accent }} className={live ? "animate-pulse" : ""} />
        {live ? (
          <span className="shimmer-text font-medium">{searching ? "Searching for evidence…" : "Thinking…"}</span>
        ) : standalone ? (
          <span className="font-medium text-[var(--color-muted)] group-hover:text-[var(--color-fg-2)]">Searched · {sources.length} {sources.length === 1 ? "source" : "sources"}</span>
        ) : (
          <span className="font-medium text-[var(--color-muted)] group-hover:text-[var(--color-fg-2)]">{turn.seconds < 0 ? "Thought" : `Thought for ${turn.seconds}s`}{sources.length ? ` · ${sources.length} ${sources.length === 1 ? "source" : "sources"}` : ""}</span>
        )}
        <ChevronDown size={13} className={cn("text-[var(--color-faint)] transition", open && "rotate-180")} />
      </button>
      <div className={cn("grid transition-all duration-300", open ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
        <div className="overflow-hidden">
          <ol className="relative ml-[6px] mt-1.5 space-y-2.5 border-l border-[var(--color-line-strong)] pb-1 pl-4">
            {steps.map((t, i) => (
              <li key={i} className="relative text-[12.5px] leading-5 text-[var(--color-muted)] animate-[rise_0.35s_both]">
                <span className="absolute -left-[21px] top-[7px] h-[7px] w-[7px] rounded-full border border-[var(--color-ink-1)]" style={{ background: i === steps.length - 1 && live && !searching ? accent : "var(--color-faint)" }} />
                {t}
              </li>
            ))}
            {tr && showSearch && (
              <li className="relative animate-[rise_0.35s_both]">
                <span className="absolute -left-[21px] top-[7px] h-[7px] w-[7px] rounded-full" style={{ background: searching ? accent : "var(--color-ok)" }} />
                <div className="flex items-center gap-2 text-[12.5px] text-[var(--color-fg-2)]">
                  {searching ? <Search size={13} className="animate-pulse" /> : <Check size={13} className="text-[var(--color-ok)]" />}
                  <span className="text-[var(--color-muted)]">Searched</span>
                  <span className="truncate rounded-md bg-white/[0.05] px-1.5 py-0.5 font-mono text-[11px]">{query}</span>
                </div>
                <SearchBadges tr={tr} />
                {sources.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {uniqueByUrl(sources).map((s, i) => (
                      <div key={`${s.url}#${i}`} className="flex items-center gap-2 text-[11.5px] text-[var(--color-muted)] animate-[rise_0.35s_both]">
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

/* ------------------------------------------------------------------ badges */
function Badge({ tone, icon, live, children, title }: { tone: Tone; icon: ReactNode; live?: boolean; children: ReactNode; title?: string }) {
  const t = TONE[tone];
  return (
    <span
      title={title}
      className="inline-flex h-[22px] items-center gap-1.5 rounded-full pl-1.5 pr-2 text-[10.5px] font-medium animate-[rise_0.3s_both]"
      style={{ color: t.c, background: `rgb(${t.rgb} / 0.09)`, boxShadow: `inset 0 0 0 1px rgb(${t.rgb} / 0.22)` }}
    >
      {live ? <Spinner size={10} color={t.c} /> : icon}
      <span className={cn(live && "shimmer-text")}>{children}</span>
    </span>
  );
}

function SearchBadges({ tr }: { tr: SearchTrace }) {
  const out: ReactNode[] = [];
  const kind = tr.variant === "gate" ? "Evidence gate" : tr.variant === "research" ? "Research" : "Objection";

  if (tr.memory === "run") out.push(<Badge key="m" tone="violet" icon={null} live>Session memory</Badge>);
  if (tr.memory === "done") out.push(<Badge key="m" tone="violet" icon={<BrainCircuit size={11} />}>Memory hit · hakuna search mpya</Badge>);

  if (tr.cache === "run") out.push(<Badge key="c" tone="sky" icon={null} live>Semantic cache</Badge>);
  if (tr.cache === "done") out.push(<Badge key="c" tone="ok" icon={<Database size={11} />} title={tr.matched}>Cache hit · {tr.similarity}%</Badge>);
  if (tr.cache === "fail") out.push(<Badge key="c" tone="warn" icon={<Database size={11} />}>Cache miss · {tr.similarity}% &lt; {tr.threshold ?? 88}%</Badge>);

  if (tr.relevance === "run") out.push(<Badge key="r" tone="sky" icon={null} live>Relevance check</Badge>);
  if (tr.relevance === "fail") out.push(<Badge key="r" tone="warn" icon={<ShieldAlert size={11} />}>Stale → fresh verify</Badge>);

  if (tr.engine === "run" && tr.failures > 0) out.push(<Badge key="f" tone="warn" icon={<Timer size={11} />}>HTTP 502 × {tr.failures}</Badge>);
  if (tr.engine === "run") out.push(<Badge key="e" tone="sky" icon={null} live>SearXNG · attempt {tr.attempt}/{tr.maxAttempts}</Badge>);
  if (tr.engine === "fail")
    out.push(
      <Badge key="e" tone="warn" icon={<Timer size={11} />}>
        HTTP 502 · attempt {tr.attempt}/{tr.maxAttempts}{tr.waitLeft ? ` · retry ${tr.waitLeft}s` : ""}
      </Badge>,
    );
  if (tr.engine === "done")
    out.push(
      <Badge key="e" tone="ok" icon={<Globe size={11} />}>
        SearXNG · {tr.sources.length || "…"} results{tr.failures ? ` · ${tr.failures} retries` : ""}
      </Badge>,
    );

  if (tr.save === "run") out.push(<Badge key="s" tone="sky" icon={null} live>Saving vector</Badge>);
  if (tr.save === "done") out.push(<Badge key="s" tone="ok" icon={<HardDriveUpload size={11} />}>Saved · Appwrite</Badge>);

  if (!out.length) return null;
  return (
    <div className="mt-2 space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="mr-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-[var(--color-faint)]">{kind}</span>
        {out}
      </div>
      {tr.cache === "done" && tr.matched && (
        <p className="truncate pl-0.5 font-mono text-[10.5px] text-[var(--color-faint)]">≈ “{tr.matched}”</p>
      )}
    </div>
  );
}
