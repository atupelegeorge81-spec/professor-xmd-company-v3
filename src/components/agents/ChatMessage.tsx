"use client";
import "./chat.css";
import { useMemo, useState } from "react";
import { Check, Copy, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { getAgent } from "@/lib/team";
import { cn } from "@/lib/utils";
import { splitFences, fileFor } from "@/lib/chat/fences";
import { AgentAvatar } from "../ui/AgentAvatar";
import { Markdown } from "../ui/Markdown";
import { ScriptBox } from "../board/stage/ScriptBox";
import { MermaidDiagram } from "../ui/MermaidDiagram";
import { SourceChips, ThinkingBlock, type LiveTurn } from "../board/parts";
import { BoardActionCard } from "./BoardActionCard";

/* Ujumbe wa agent kwenye chumba binafsi (agent chat):
 *  · ThinkingBlock ile ile ya v2 (Thinking/Searching haijabadilika)
 *  · jibu = maandishi ya kawaida (si kadi) + code blocks ndani ya ScriptBox (live wakati wa kuandika)
 *  · vitendo: Copy · 👍 · 👎 · Regenerate (mshale wa mduara — kama ChatGPT/Claude "Retry") */

export type Feedback = "up" | "down" | null;
export interface ChatTurn extends LiveTurn { feedback?: Feedback; model?: string; /** R15: kitendo kinachosubiri uthibitisho wa Mkuu */ action?: { kind: "start_board"; task: string } }

export function ChatMessage({
  turn, canRegenerate, regenerating, onRegenerate, onFeedback,
}: {
  turn: ChatTurn;
  canRegenerate?: boolean;
  regenerating?: boolean;
  onRegenerate?: () => void;
  onFeedback?: (f: Feedback) => void;
}) {
  const agent = getAgent(turn.agent)!;
  const [copied, setCopied] = useState(false);
  const speaking = turn.phase !== "done";
  const answering = turn.phase === "answering";
  const segments = useMemo(() => splitFences(turn.content), [turn.content]);
  const lastIdx = segments.length - 1;

  // namba kwa faili za lugha ile ile (index.html, index-2.html …)
  const names = useMemo(() => {
    const seen: Record<string, number> = {};
    return segments.map((s) => (s.type === "code" ? fileFor(s.lang, (seen[s.lang] = (seen[s.lang] ?? -1) + 1)) : ""));
  }, [segments]);

  const copy = () => {
    navigator.clipboard?.writeText(turn.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1300); }).catch(() => {});
  };

  const btn = "grid h-7 w-7 place-items-center rounded-md text-[var(--color-faint)] transition hover:bg-white/5 hover:text-[var(--color-fg)] disabled:pointer-events-none disabled:opacity-40";

  return (
    <article className="group relative flex gap-3 animate-[rise_0.45s_both] sm:gap-4">
      <div className="flex flex-col items-center">
        <AgentAvatar agent={agent} size={36} status={speaking ? "speaking" : undefined} />
        <span className="mt-2 w-px flex-1 bg-gradient-to-b from-[var(--color-line-strong)] to-transparent" />
      </div>
      <div className="min-w-0 flex-1 pb-2">
        <header className="mb-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[14px] font-semibold">{agent.name}</span>
          <span className="rounded-md px-1.5 py-0.5 text-[10.5px] font-medium" style={{ color: agent.accent, background: `rgb(${agent.rgb} / 0.1)` }}>{agent.role}</span>
          {speaking && (
            <span className="flex items-center gap-1.5 text-[11px]" style={{ color: agent.accent }}>
              <span className="typing-dots flex gap-0.5"><span /><span /><span /></span>
            </span>
          )}
        </header>

        {turn.thinking.length > 0 && <ThinkingBlock turn={turn} accent={agent.accent} />}

        {(answering || turn.phase === "done") && (
          <>
            <div className="chat-answer space-y-3">
              {segments.map((s, i) =>
                s.type === "text" ? (
                  <div key={`t${i}`} className={cn(answering && i === lastIdx && "chat-live")}>
                    <Markdown text={s.text} accent={agent.accent} />
                  </div>
                ) : s.lang === "mermaid" ? (
                  <div key={`c${s.index}`} className="chat-code"><MermaidDiagram code={s.code} closed={s.closed} /></div>
                ) : (
                  <div key={`c${s.index}`} className="chat-code">
                    <ScriptBox
                      title={names[i]}
                      lang={s.lang}
                      code={s.code}
                      accent={agent.accent}
                      writing={answering && !s.closed}
                    />
                  </div>
                ),
              )}
            </div>
            {turn.phase === "done" && turn.sources.length > 0 && (
              <div className="mt-3"><SourceChips sources={turn.sources} /></div>
            )}
            {turn.phase === "done" && turn.action?.kind === "start_board" && <BoardActionCard task={turn.action.task} accent={agent.accent} />}
            {turn.phase === "done" && (
              <div className={cn("chat-actions mt-2 flex items-center gap-0.5 transition", !canRegenerate && !turn.feedback && "sm:opacity-0 sm:group-hover:opacity-100")}>
                <button type="button" onClick={copy} className={btn} aria-label="Copy" title="Copy">
                  {copied ? <Check size={13} className="text-[var(--color-ok)]" /> : <Copy size={13} />}
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback?.(turn.feedback === "up" ? null : "up")}
                  className={cn(btn, turn.feedback === "up" && "!text-[var(--color-ok)]")}
                  aria-pressed={turn.feedback === "up"}
                  aria-label="Good response"
                  title="Good response"
                >
                  <ThumbsUp size={13} fill={turn.feedback === "up" ? "currentColor" : "none"} />
                </button>
                <button
                  type="button"
                  onClick={() => onFeedback?.(turn.feedback === "down" ? null : "down")}
                  className={cn(btn, turn.feedback === "down" && "!text-[var(--color-bad)]")}
                  aria-pressed={turn.feedback === "down"}
                  aria-label="Bad response"
                  title="Bad response"
                >
                  <ThumbsDown size={13} fill={turn.feedback === "down" ? "currentColor" : "none"} />
                </button>
                {canRegenerate && (
                  <button type="button" onClick={onRegenerate} disabled={regenerating} className={btn} aria-label="Regenerate" title="Regenerate">
                    <RefreshCw size={13} className={cn(regenerating && "animate-spin")} />
                  </button>
                )}
                {turn.seconds > 0 && <span className="ml-1.5 font-mono text-[10.5px] text-[var(--color-faint)]">{turn.seconds}s</span>}
              </div>
            )}
          </>
        )}
      </div>
    </article>
  );
}
