"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActionBarPrimitive,
  MessagePrimitive,
  useAuiState,
} from "@assistant-ui/react";
import type { Agent } from "@/lib/agents";
import { Markdown } from "./Markdown";
import { Avatar } from "./Avatar";

interface Props {
  agent: Agent;
}

interface XmdSource {
  url: string;
  title?: string;
  [key: string]: unknown;
}

interface XmdMetadata {
  xmdPhase?: string;
  xmdHasThinking?: boolean;
  xmdThinking?: string;
  xmdQuery?: string;
  xmdSearchError?: string;
  xmdSources?: XmdSource[];
  xmdError?: string;
}

// Muda (ms) kwa kila herufi ya "typewriter" -- kwa Thought Process
// (reasoning) NA kwa jibu la AI (answer). Ndogo zaidi = kasi zaidi.
const TYPEWRITER_CHAR_MS = 3;

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function getSnippet(source: XmdSource) {
  const value =
    source.description ??
    source.snippet ??
    source.content ??
    source.text;

  return typeof value === "string" ? value : "";
}

function BrainCircuitIcon({
  active,
  accent,
}: {
  active: boolean;
  accent: string;
}) {
  return (
    <span
      aria-hidden="true"
      className="relative inline-flex h-5 w-5 shrink-0 items-center justify-center"
      style={{
        color: accent,
        filter: active
          ? `drop-shadow(0 0 6px ${accent})`
          : "drop-shadow(0 0 0 transparent)",
        transition: "filter 240ms ease, opacity 240ms ease",
        opacity: active ? 1 : 0.85,
      }}
    >
      {/* Lucide official brain-circuit — exact paths */}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={`h-[18px] w-[18px] ${active ? "animate-pulse" : ""}`}
      >
        <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z" />
        <path d="M9 13a4.5 4.5 0 0 0 3-4" />
        <path d="M6.003 5.125A3 3 0 0 0 6.401 6.5" />
        <path d="M3.477 10.896a4 4 0 0 1 .585-.396" />
        <path d="M6 18a4 4 0 0 1-1.967-.516" />
        <path d="M12 13h4" />
        <path d="M12 18h6a2 2 0 0 1 2 2v1" />
        <path d="M12 8h8" />
        <path d="M16 8V5a2 2 0 0 1 2-2" />
        <circle cx="16" cy="13" r=".5" fill="currentColor" stroke="none" />
        <circle cx="18" cy="3" r=".5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="21" r=".5" fill="currentColor" stroke="none" />
        <circle cx="20" cy="8" r=".5" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}

function ThoughtProcess({
  agent,
  phase,
  hasThinking,
  thinking,
  live,
  onSettle,
}: {
  agent: Agent;
  phase: string;
  hasThinking: boolean;
  thinking: string;
  live: boolean;
  onSettle?: () => void;
}) {
  const [open, setOpen] = useState(live);
  const [displayedThinking, setDisplayedThinking] = useState(() =>
    live ? "" : thinking,
  );

  const thinkingRef = useRef<HTMLDivElement | null>(null);
  const thinkingTargetRef = useRef(thinking);
  const thinkingLiveRef = useRef(live);
  const displayedThinkingRef = useRef(displayedThinking);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previousScrollHeightRef = useRef(0);
  const wasNearBottomRef = useRef(true);

  thinkingTargetRef.current = thinking;
  thinkingLiveRef.current = live;
  displayedThinkingRef.current = displayedThinking;

  useEffect(() => {
    if (live) {
      setOpen(true);
      return;
    }

    // Backend finished. Keep the Thought Process visible until
    // the display buffer has caught up with everything received.
    if (!thinking || displayedThinking.length >= thinking.length) {
      setOpen(false);
      onSettle?.();
    }
  }, [live, thinking, displayedThinking, onSettle]);

  // Letter-by-letter display.
  // The timer persists while the real thinking stream keeps updating.
  useEffect(() => {
    if (!thinking) {
      setDisplayedThinking("");
      previousScrollHeightRef.current = 0;
      wasNearBottomRef.current = true;

      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }

      return;
    }

    // Keep one persistent renderer alive. New backend chunks update
    // the target buffer without restarting the visible stream.
    if (typingTimerRef.current) return;

    // Tayari imeonyeshwa kikamilifu (mfano: ujumbe wa zamani
    // uliofunguliwa upya baada ya kubadilisha agent tab) — usirudie
    // animation kwa content ya zamani.
    if (displayedThinkingRef.current.length >= thinking.length) return;

    const tick = () => {
      const target = thinkingTargetRef.current;

      if (!target) {
        typingTimerRef.current = null;
        return;
      }

      let currentLength = 0;

      setDisplayedThinking((previous) => {
        currentLength = previous.length;

        // Only reset if the upstream stream was genuinely replaced.
        if (!target.startsWith(previous)) {
          const next = target.slice(0, 1);
          currentLength = next.length;
          return next;
        }

        if (previous.length >= target.length) {
          return previous;
        }

        const next = target.slice(0, previous.length + 1);
        currentLength = next.length;
        return next;
      });

      // Schedule the next character independently of React's
      // state-updater callback. The backend may add more data at any time.
      typingTimerRef.current = setTimeout(() => {
        const latestTarget = thinkingTargetRef.current;

        if (!latestTarget) {
          typingTimerRef.current = null;
          return;
        }

        tick();
      }, TYPEWRITER_CHAR_MS);
    };

    tick();
  }, [thinking]);

  useEffect(() => {
    return () => {
      if (typingTimerRef.current) {
        clearTimeout(typingTimerRef.current);
        typingTimerRef.current = null;
      }
    };
  }, []);

  // Internal Thought Process scroll only.
  // Follows newly rendered characters without smooth-scroll animation.
  useEffect(() => {
    const scroll = thinkingRef.current;
    if (!scroll || !open) return;

    const currentHeight = scroll.scrollHeight;
    const previousHeight = previousScrollHeightRef.current;

    if (previousHeight === 0) {
      previousScrollHeightRef.current = currentHeight;

      if (currentHeight > scroll.clientHeight) {
        scroll.scrollTop = currentHeight - scroll.clientHeight;
      }

      return;
    }

    const heightDelta = currentHeight - previousHeight;

    if (heightDelta > 0 && wasNearBottomRef.current) {
      scroll.scrollTop += heightDelta;
    }

    previousScrollHeightRef.current = currentHeight;

    const distanceFromBottom =
      scroll.scrollHeight - scroll.scrollTop - scroll.clientHeight;

    wasNearBottomRef.current = distanceFromBottom <= 32;
  }, [displayedThinking, open, live]);

  if (!hasThinking || !thinking) return null;

  return (
    <section className="mt-1 w-full [overflow-anchor:none]">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2 text-left"
      >
        <BrainCircuitIcon
          active={live && open}
          accent={agent.accent}
        />

        <span
          className="relative overflow-hidden text-[13.5px] font-medium tracking-normal"
          style={{ color: agent.accent }}
        >
          <span className={live ? "xmd-thinking-sweep" : ""}>
            Thinking...
          </span>
        </span>

        <span
          aria-hidden="true"
          className="ml-1 inline-flex h-4 w-4 shrink-0 items-center justify-center"
          style={{ color: agent.accent }}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="transition-transform duration-200 ease-out"
            style={{ transform: open ? "rotate(0deg)" : "rotate(180deg)" }}
          >
            <path d="m6 15 6-6 6 6" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="mt-2 flex h-40 max-w-full items-stretch">
          <span
            aria-hidden="true"
            className="mr-3 ml-[10px] w-[2.5px] shrink-0 self-stretch rounded-full"
            style={{
              background: agent.accent,
              boxShadow: live
                ? `0 0 10px ${agent.accent}`
                : "none",
              opacity: live ? 0.9 : 0.65,
            }}
          />

          <div
            ref={thinkingRef}
            className="min-w-0 flex-1 h-full overflow-y-auto overscroll-contain pr-2 text-[13px] leading-6 text-muted-foreground scroll-thin [overflow-anchor:none]"
            aria-live="off"
          >
            <pre
              className={`m-0 whitespace-pre-wrap break-words font-sans ${
                live &&
                displayedThinking.length >= thinking.length &&
                displayedThinking.length > 0
                  ? "xmd-thinking-hold"
                  : ""
              }`}
            >
              {displayedThinking}
            </pre>
          </div>
        </div>
      )}

      <style jsx>{`
        .xmd-thinking-hold {
        animation: xmdThinkingHold 1.4s ease-in-out infinite;
      }

      @keyframes xmdThinkingHold {
        0%,
        100% {
          opacity: 0.82;
          text-shadow: 0 0 0 transparent;
        }
        50% {
          opacity: 1;
          text-shadow: 0 0 7px ${agent.accent};
        }
      }

      .xmd-thinking-sweep {
          position: relative;
          display: inline-block;
          color: ${agent.accent};
          background: linear-gradient(
            90deg,
            ${agent.accent} 0%,
            ${agent.accent} 35%,
            rgba(255,255,255,0.95) 50%,
            ${agent.accent} 65%,
            ${agent.accent} 100%
          );
          background-size: 220% 100%;
          -webkit-background-clip: text;
          background-clip: text;
          -webkit-text-fill-color: transparent;
          animation: xmd-thinking-sweep 1.9s linear infinite;
        }

        @keyframes xmd-thinking-sweep {
          from {
            background-position: 180% 0;
          }

          to {
            background-position: -20% 0;
          }
        }
      `}</style>
    </section>
  );
}

function SourceDrawer({
  sources,
  onClose,
}: {
  sources: XmdSource[];
  onClose: () => void;
}) {
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const dragStartY = useState({ value: 0 })[0];
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const primary = sources[0];
  const more = sources.slice(1);

  const finishSheetDrag = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragging) return;

    const delta = Math.max(0, event.clientY - dragStartY.value);

    setDragging(false);

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    if (delta > 110) {
      onClose();
      setDragY(0);
      return;
    }

    setDragY(0);
  };

  const onHandlePointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    dragStartY.value = event.clientY;
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onHandlePointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (!dragging) return;

    const delta = Math.max(0, event.clientY - dragStartY.value);
    setDragY(delta);
  };

  const onContentPointerDown = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const scroll = scrollRef.current;
    if (!scroll || scroll.scrollTop > 0) return;

    dragStartY.value = event.clientY;
  };

  const onContentPointerMove = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    const scroll = scrollRef.current;
    if (!scroll) return;

    const delta = event.clientY - dragStartY.value;

    if (!dragging && scroll.scrollTop <= 0 && delta > 8) {
      setDragging(true);
      event.currentTarget.setPointerCapture(event.pointerId);
    }

    if (dragging || (scroll.scrollTop <= 0 && delta > 8)) {
      event.preventDefault();
      setDragY(Math.max(0, delta));
    }
  };

  const onContentPointerUp = (
    event: React.PointerEvent<HTMLDivElement>,
  ) => {
    if (dragging) {
      finishSheetDrag(event);
    }
  };

  return (
    <div className="fixed inset-0 z-[100]">
      <button
        type="button"
        aria-label="Close sources"
        className="absolute inset-0 bg-background/55 backdrop-blur-md"
        onClick={onClose}
      />

      <div className="absolute inset-x-0 bottom-0 flex max-h-[82dvh] justify-center">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Sources"
          className="relative w-full max-w-2xl overflow-hidden rounded-t-[28px] border border-white/10 bg-background/95 shadow-[0_-20px_70px_-25px_rgba(0,0,0,.85)] backdrop-blur-2xl"
          style={{
            transform: `translateY(${dragY}px)`,
            transition: dragging ? "none" : "transform 180ms ease-out",
          }}
        >
          <div
            className="mx-auto mt-2 h-1 w-10 cursor-grab touch-none rounded-full bg-white/20 active:cursor-grabbing"
            onPointerDown={onHandlePointerDown}
            onPointerMove={onHandlePointerMove}
            onPointerUp={finishSheetDrag}
            onPointerCancel={finishSheetDrag}
          />

          <div
            ref={scrollRef}
            className="max-h-[82dvh] overflow-y-auto overscroll-contain px-5 pb-7 pt-4"
            onPointerDown={onContentPointerDown}
            onPointerMove={onContentPointerMove}
            onPointerUp={onContentPointerUp}
            onPointerCancel={onContentPointerUp}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-display text-[16px] font-bold text-foreground">
                Sources
              </h3>

              <button
                type="button"
                aria-label="Close sources"
                onClick={onClose}
                className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  className="h-4 w-4"
                  aria-hidden="true"
                >
                  <path
                    d="m7 7 10 10M17 7 7 17"
                    stroke="currentColor"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                  />
                </svg>
              </button>
            </div>

            {primary && (
              <a
                href={primary.url}
                target="_blank"
                rel="noreferrer"
                className="mt-4 block rounded-2xl border border-white/10 bg-white/[0.035] p-3.5 transition hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-2">
                  <SourceFavicon url={primary.url} />
                  <span className="truncate text-[11px] font-medium text-muted-foreground">
                    {getDomain(primary.url)}
                  </span>
                </div>

                <div className="mt-2 font-semibold text-foreground">
                  {primary.title || getDomain(primary.url)}
                </div>

                {getSnippet(primary) && (
                  <div className="mt-1.5 line-clamp-3 text-xs leading-5 text-muted-foreground">
                    {getSnippet(primary)}
                  </div>
                )}

                <div className="mt-3 text-[11px] font-medium text-primary">
                  Open source ↗
                </div>
              </a>
            )}

            {more.length > 0 && (
              <div className="mt-5 border-t border-white/10 pt-4">
                <div className="mb-3 font-display text-[13px] font-semibold text-foreground">
                  More
                </div>

                <div className="grid gap-2">
                  {more.map((source, index) => (
                    <a
                      key={`${source.url}-${index}`}
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-2xl border border-white/10 bg-white/[0.025] p-3 transition hover:bg-white/[0.055]"
                    >
                      <div className="flex items-center gap-2">
                        <SourceFavicon url={source.url} />
                        <span className="truncate text-[11px] font-medium text-muted-foreground">
                          {getDomain(source.url)}
                        </span>
                      </div>

                      <div className="mt-1.5 font-semibold text-foreground">
                        {source.title || getDomain(source.url)}
                      </div>

                      {getSnippet(source) && (
                        <div className="mt-1 line-clamp-2 text-xs leading-5 text-muted-foreground">
                          {getSnippet(source)}
                        </div>
                      )}
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function SourceFavicon({ url }: { url: string }) {
  const domain = getDomain(url);

  return (
    <span className="grid h-5 w-5 shrink-0 place-items-center overflow-hidden rounded-md border border-white/10 bg-white/5">
      <img
        src={`https://${domain}/favicon.ico`}
        alt=""
        className="h-4 w-4 object-contain"
        loading="lazy"
        onError={(event) => {
          event.currentTarget.style.display = "none";
        }}
      />
    </span>
  );
}

function SourcePill({
  source,
  onOpen,
}: {
  source: XmdSource;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="mx-1 inline-flex max-w-[180px] translate-y-[1px] items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2 py-1 align-middle text-[10px] text-muted-foreground backdrop-blur-sm transition hover:border-white/20 hover:bg-white/10 hover:text-foreground"
      title={source.title || source.url}
    >
      <SourceFavicon url={source.url} />
      <span className="truncate">
        {getDomain(source.url)}
      </span>
    </button>
  );
}

function SourcesIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M6 4.5A1.5 1.5 0 0 1 7.5 3H17l3 3v13.5A1.5 1.5 0 0 1 18.5 21h-11A1.5 1.5 0 0 1 6 19.5v-15Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9 9h6M9 12.5h6M9 16h4"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <rect
        x="8"
        y="8"
        width="11"
        height="11"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path
        d="M5 16V6a2 2 0 0 1 2-2h10"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ReloadIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      className="h-4 w-4"
      aria-hidden="true"
    >
      <path
        d="M20 11a8 8 0 0 0-14.7-4L4 9"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 4v5h5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M4 13a8 8 0 0 0 14.7 4L20 15"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M20 20v-5h-5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function cleanVisibleQuery(query: string) {
  const cleaned = query
    .replace(/<query>\s*or\s*SEARCH:\s*(?:none|no|n\/?a\.?|no search)\s*<\/query>/gi, "")
    .replace(/<query>\s*or\s*SEARCH:\s*(?:none|no|n\/?a\.?|no search)/gi, "")
    .replace(/\bor\s+SEARCH:\s*(?:none|no|n\/?a\.?|no search)\b/gi, "")
    .replace(/\bSEARCH:\s*(?:none|no|n\/?a\.?|no search)\b/gi, "")
    .trim();

  return cleaned;
}

function useAnswerTypewriter(target: string, enabled: boolean) {
  const [displayed, setDisplayed] = useState(() => (enabled ? target : ""));

  const targetRef = useRef(target);
  const enabledRef = useRef(enabled);
  const displayedRef = useRef(displayed);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  targetRef.current = target;
  enabledRef.current = enabled;
  displayedRef.current = displayed;

  useEffect(() => {
    if (!enabled) {
      // Bado imefungwa (thinking bado haijamalizika) -- usianze kuandika
      // bado, hata kama backend tayari imetuma jibu lote nyuma ya pazia.
      // Itaanza pale tu "enabled" itakapobadilika kuwa true.
      return;
    }

    if (!target) {
      setDisplayed("");
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      return;
    }

    if (timerRef.current) return;

    if (
      displayedRef.current.length >= target.length &&
      target.startsWith(displayedRef.current)
    ) {
      return;
    }

    const tick = () => {
      const currentTarget = targetRef.current;

      if (!currentTarget || !enabledRef.current) {
        timerRef.current = null;
        return;
      }

      setDisplayed((previous) => {
        if (!currentTarget.startsWith(previous)) {
          return currentTarget.slice(0, 1);
        }

        if (previous.length >= currentTarget.length) {
          return previous;
        }

        return currentTarget.slice(0, previous.length + 1);
      });

      timerRef.current = setTimeout(tick, TYPEWRITER_CHAR_MS);
    };

    tick();
  }, [target, enabled]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  return enabled ? displayed : "";
}

function NullSource() {
  return null;
}

function AssistantMessageContent({
  sources,
  onOpenSources,
  unlocked,
}: {
  sources: XmdSource[];
  onOpenSources: () => void;
  unlocked: boolean;
}) {
  const sourcesRef = useRef(sources);
  const onOpenSourcesRef = useRef(onOpenSources);
  const unlockedRef = useRef(unlocked);

  sourcesRef.current = sources;
  onOpenSourcesRef.current = onOpenSources;
  unlockedRef.current = unlocked;

  const TextComponent = useMemo(
    () =>
      function Text({ text }: { text: string }) {
        const displayedText = useAnswerTypewriter(text, unlockedRef.current);
        const currentSources = sourcesRef.current;

        return (
          <div className="break-words text-[14px] leading-6 text-foreground">
            <Markdown text={displayedText} />

            {currentSources.length > 0 && (
              <span className="mt-1 inline-flex flex-wrap items-center">
                {currentSources.slice(0, 2).map((source, index) => (
                  <SourcePill
                    key={`${source.url}-${index}`}
                    source={source}
                    onOpen={() => onOpenSourcesRef.current()}
                  />
                ))}

                {currentSources.length > 2 && (
                  <button
                    type="button"
                    onClick={() => onOpenSourcesRef.current()}
                    className="inline-flex items-center rounded-full border border-white/10 bg-white/5 px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-white/10 hover:text-foreground"
                  >
                    +{currentSources.length - 2}
                  </button>
                )}
              </span>
            )}
          </div>
        );
      },
    [],
  );

  return (
    <MessagePrimitive.Parts
      components={{
        Text: TextComponent,
        Source: NullSource,
      }}
    />
  );
}

export function AssistantAgentMessage({ agent }: Props) {
  const [sourcesOpen, setSourcesOpen] = useState(false);

  const metadata = useAuiState(
    (state) =>
      state.message.metadata.custom as XmdMetadata | undefined,
  );

  const phase = metadata?.xmdPhase ?? "done";
  const live = phase !== "done" && phase !== "error";

  // Ujumbe ukifunguliwa (mount) wakati tayari umekamilika (mfano: wa
  // zamani, baada ya kubadilisha agent tab), chukulia thinking yake
  // kama tayari "settled" -- usirudie gate/animation kwa historia.
  const [thinkingSettled, setThinkingSettled] = useState(() => !live);

  const sources = metadata?.xmdSources ?? [];
  const thinkingText = metadata?.xmdThinking ?? "";
  const hasThinkingText = Boolean(metadata?.xmdHasThinking) && thinkingText.length > 0;
  const thinkingLive = hasThinkingText && !thinkingSettled;
  const answerGated = hasThinkingText && !thinkingSettled;

  useEffect(() => {
    if (phase === "thinking") {
      setThinkingSettled(false);
    }
  }, [phase]);

  const handleThinkingSettle = useCallback(() => {
    setThinkingSettled(true);
  }, []);

  const handleOpenSources = useCallback(() => {
    setSourcesOpen(true);
  }, []);

  return (
    <>
      <MessagePrimitive.Root
        data-agent={agent.id}
        className="w-full"
      >
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Avatar
              agent={agent}
              size={38}
              live={live}
            />

            <span className="font-display text-[14px] font-semibold text-foreground">
              {agent.name}
            </span>

            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
              {agent.role}
            </span>
</div>

          <ThoughtProcess
            agent={agent}
            phase={phase}
            hasThinking={Boolean(metadata?.xmdHasThinking)}
            thinking={metadata?.xmdThinking ?? ""}
            live={thinkingLive}
            onSettle={handleThinkingSettle}
          />

          {metadata?.xmdQuery &&
            cleanVisibleQuery(metadata.xmdQuery) && (
              <div className="inline-flex items-center gap-2 rounded-lg border border-primary/25 bg-primary/10 px-2.5 py-1 text-[11px] text-primary">
                <span className="relative flex h-1.5 w-1.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-70" />
                  <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-primary" />
                </span>
                {cleanVisibleQuery(metadata.xmdQuery)}
              </div>
            )}

          {metadata?.xmdSearchError && (
            <div className="rounded-lg border border-warning/30 bg-warning/10 px-2.5 py-1 text-[11px] text-warning">
              ⚠️ {metadata.xmdSearchError}
            </div>
          )}

          <div
            className={`xmd-assistant-document-message ${
              answerGated ? "hidden" : ""
            }`}
          >
            <AssistantMessageContent
              sources={sources}
              onOpenSources={handleOpenSources}
              unlocked={!answerGated}
            />
          </div>

          {metadata?.xmdError && (
            <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[12px] text-destructive-foreground">
              ❌ {metadata.xmdError}
            </div>
          )}

          <ActionBarPrimitive.Root
            hideWhenRunning
            autohide="never"
            className="flex items-center gap-1 pt-0.5"
          >
            <ActionBarPrimitive.Copy
              aria-label="Copy response"
              title="Copy response"
              copiedDuration={1800}
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <CopyIcon />
            </ActionBarPrimitive.Copy>

            <ActionBarPrimitive.Reload
              aria-label="Regenerate response"
              title="Regenerate response"
              className="grid h-8 w-8 place-items-center rounded-lg text-muted-foreground transition hover:bg-secondary hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
            >
              <ReloadIcon />
            </ActionBarPrimitive.Reload>
          </ActionBarPrimitive.Root>
        </div>
      </MessagePrimitive.Root>

      {sourcesOpen && sources.length > 0 && (
        <SourceDrawer
          sources={sources}
          onClose={() => setSourcesOpen(false)}
        />
      )}
    </>
  );
}
