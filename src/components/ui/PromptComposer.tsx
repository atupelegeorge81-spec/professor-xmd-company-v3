"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Globe, Square } from "lucide-react";
import { cn } from "@/lib/utils";
import { useApp } from "../shell/AppState";

export function PromptComposer({
  onSubmit,
  placeholder = "Eleza project yako hapa…",
  cta = "Convene board",
  running,
  onStop,
  stopLabel = "Stop",
  stopTitle,
  initial = "",
  size = "lg",
  className,
  autoFocus,
}: {
  onSubmit: (text: string) => void;
  placeholder?: string;
  cta?: string;
  running?: boolean;
  onStop?: () => void;
  /** lebo ya kitufe cha kusimama (default "Stop") */
  stopLabel?: string;
  stopTitle?: string;
  initial?: string;
  size?: "lg" | "md";
  className?: string;
  autoFocus?: boolean;
}) {
  const [text, setText] = useState(initial);
  const { config } = useApp();
  const searx = config ? config.searxng : null;
  const ref = useRef<HTMLTextAreaElement>(null);
  // R15: keyboard ya simu (touch) — Enter = mstari mpya; ujumbe unatumwa kwa kitufe tu. Kompyuta: Enter = tuma, Shift+Enter = mstari mpya.
  const [touch, setTouch] = useState(false);
  useEffect(() => {
    const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    setTouch(!fine && (window.matchMedia("(pointer: coarse)").matches || navigator.maxTouchPoints > 0));
  }, []);
  const submit = () => {
    const t = text.trim();
    if (!t || running) return;
    onSubmit(t);
    setText("");
    if (ref.current) ref.current.style.height = "";
  };
  return (
    <div className={cn("prism-border rounded-[22px] bg-[rgb(12_14_19/0.85)] p-2 shadow-[0_20px_60px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-shadow focus-within:shadow-[0_0_0_4px_rgb(139_92_246/0.12),0_20px_60px_-20px_rgb(0_0_0/0.9)]", className)}>
      <textarea
        ref={ref}
        value={text}
        autoFocus={autoFocus}
        onChange={(e) => setText(e.target.value)}
        onInput={(e) => {
          const el = e.currentTarget;
          el.style.height = "auto";
          el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
        }}
        enterKeyHint={touch ? "enter" : "send"}
        onKeyDown={(e) => {
          if (touch || e.nativeEvent.isComposing) return;
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
        rows={size === "lg" ? 2 : 1}
        placeholder={placeholder}
        className={cn(
          "block w-full resize-none bg-transparent px-3 pt-2 text-[var(--color-fg)] outline-none placeholder:text-[var(--color-faint)]",
          size === "lg" ? "min-h-[56px] text-[15px] leading-6" : "min-h-[36px] text-[14px] leading-6",
        )}
      />
      <div className="flex items-center gap-1.5 px-1 pt-1">
        <span
          title={searx === null ? "Inakagua SearXNG…" : searx === "custom" ? "SearXNG yako (SEARXNG_URL) — agents hutafuta ushahidi mtandaoni" : "SearXNG ya default — weka SEARXNG_URL kwa instance yako"}
          className="flex h-7 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--color-line)] px-2 text-[11.5px] text-[var(--color-muted)]"
        >
          <Globe size={12} /> <span className="hidden min-[420px]:inline">Web evidence</span>
          <span className={cn("h-1.5 w-1.5 rounded-full", searx === null ? "bg-[var(--color-faint)]" : searx === "custom" ? "bg-[var(--color-ok)]" : "bg-[var(--color-warn)]")} />
        </span>
        <span className="ml-auto" /><span className="hidden text-[11px] text-[var(--color-faint)] sm:block">
          <span className="kbd">↵</span> to send
        </span>
        {running ? (
          <button onClick={onStop} title={stopTitle} className="btn-white flex h-9 items-center gap-1.5 rounded-xl px-3 text-[12.5px] font-semibold">
            <Square size={11} fill="currentColor" /> {stopLabel}
          </button>
        ) : (
          <button onClick={submit} disabled={!text.trim()} className="btn-prism flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl px-3.5 text-[12.5px] font-semibold">
            {size === "lg" && <span>{cta}</span>}
            <ArrowUp size={15} strokeWidth={2.4} />
          </button>
        )}
      </div>
    </div>
  );
}
