"use client";

import React, { useEffect, useRef, useState } from "react";
import { CodeToTokenTransformStream } from "@shikijs/stream";
import { createHighlighter } from "shiki";

const SHIKI_THEME = "vitesse-dark";

type StreamToken = {
  content: string;
  color?: string;
  fontStyle?: number;
};

type Session = {
  id: number;
  lang: string;
  code: string;
  controller: ReadableStreamDefaultController<string>;
  reader: ReadableStreamDefaultReader<StreamToken | { recall: number }>;
  tokens: StreamToken[];
};

const highlighterPromise = createHighlighter({
  langs: [],
  themes: [SHIKI_THEME],
});

const LANGUAGE_ALIASES: Record<string, string> = {
  js: "javascript",
  jsx: "jsx",
  ts: "typescript",
  tsx: "tsx",
  py: "python",
  sh: "shellscript",
  shell: "shellscript",
  bash: "shellscript",
  yml: "yaml",
  md: "markdown",
  c: "c",
  h: "c",
  cc: "cpp",
  "c++": "cpp",
  cpp: "cpp",
  cs: "csharp",
  "c#": "csharp",
  rb: "ruby",
  rs: "rust",
  kt: "kotlin",
  html: "html",
  xml: "xml",
  vue: "vue",
  svelte: "svelte",
  docker: "dockerfile",
  dockerfile: "dockerfile",
  plaintext: "text",
  txt: "text",
  text: "text",
  plain: "text",
};

function normalizeLanguage(language: string): string {
  const value = String(language || "")
    .trim()
    .toLowerCase();

  if (!value) return "text";
  return LANGUAGE_ALIASES[value] || value;
}

async function prepareLanguage(
  highlighter: Awaited<ReturnType<typeof createHighlighter>>,
  requested: string,
): Promise<string> {
  const lang = normalizeLanguage(requested);

  if (lang === "text") return "text";

  try {
    await highlighter.loadLanguage(lang as any);
    return lang;
  } catch {
    return "text";
  }
}

function tokensToLines(tokens: StreamToken[]): StreamToken[][] {
  const lines: StreamToken[][] = [[]];

  for (const token of tokens) {
    const parts = String(token.content ?? "").split("\n");

    parts.forEach((part, index) => {
      if (index > 0) lines.push([]);

      if (part.length > 0) {
        lines[lines.length - 1].push({
          content: part,
          color: token.color,
          fontStyle: token.fontStyle,
        });
      }
    });
  }

  return lines;
}

function tokenStyle(token: StreamToken): React.CSSProperties {
  const style: React.CSSProperties = {};

  if (token.color) {
    style.color = token.color;
  }

  const fontStyle = Number(token.fontStyle || 0);

  // TextMate/Shiki font-style bit flags:
  // 1 = italic, 2 = bold, 4 = underline, 8 = strikethrough
  if (fontStyle & 1) style.fontStyle = "italic";
  if (fontStyle & 2) style.fontWeight = 700;

  const decorations: string[] = [];
  if (fontStyle & 4) decorations.push("underline");
  if (fontStyle & 8) decorations.push("line-through");

  if (decorations.length > 0) {
    style.textDecoration = decorations.join(" ");
  }

  return style;
}

export function ShikiCodeLines({
  code,
  language,
}: {
  code: string;
  language: string;
}) {
  const [renderedLines, setRenderedLines] = useState<StreamToken[][] | null>(
    null,
  );

  const sessionRef = useRef<Session | null>(null);
  const sessionIdRef = useRef(0);
  const latestCodeRef = useRef(code);
  const latestLanguageRef = useRef(language);
  const syncQueueRef = useRef(Promise.resolve());
  const mountedRef = useRef(true);

  latestCodeRef.current = code;
  latestLanguageRef.current = language;

  useEffect(() => {
    mountedRef.current = true;

    return () => {
      mountedRef.current = false;

      const session = sessionRef.current;
      sessionRef.current = null;

      if (session) {
        try {
          session.controller.close();
        } catch {}

        void session.reader.cancel().catch(() => {});
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    const schedule = () => {
      syncQueueRef.current = syncQueueRef.current
        .then(async () => {
          if (cancelled || !mountedRef.current) return;

          const highlighter = await highlighterPromise;

          if (cancelled || !mountedRef.current) return;

          const requestedLanguage = normalizeLanguage(
            latestLanguageRef.current,
          );

          let session = sessionRef.current;

          if (!session || session.lang !== requestedLanguage) {
            if (session) {
              try {
                session.controller.close();
              } catch {}

              void session.reader.cancel().catch(() => {});
            }

            const lang = await prepareLanguage(
              highlighter,
              requestedLanguage,
            );

            if (cancelled || !mountedRef.current) return;

            let controllerRef:
              | ReadableStreamDefaultController<string>
              | null = null;

            const input = new ReadableStream<string>({
              start(controller) {
                controllerRef = controller;
              },
            });

            const tokenStream = input.pipeThrough(
              new CodeToTokenTransformStream({
                highlighter,
                lang,
                theme: SHIKI_THEME,
                allowRecalls: true,
              }),
            );

            const reader = tokenStream.getReader();

            const id = ++sessionIdRef.current;

            session = {
              id,
              lang,
              code: "",
              controller: controllerRef!,
              reader,
              tokens: [],
            };

            sessionRef.current = session;

            void (async () => {
              try {
                while (true) {
                  const result = await reader.read();

                  if (result.done) break;

                  const value = result.value as any;
                  const active = sessionRef.current;

                  if (!active || active.id !== id || !mountedRef.current) {
                    continue;
                  }

                  if (value && typeof value === "object" && "recall" in value) {
                    const recall = Math.max(
                      0,
                      Number(value.recall || 0),
                    );

                    if (recall > 0) {
                      active.tokens.splice(
                        Math.max(0, active.tokens.length - recall),
                        recall,
                      );
                    }
                  } else if (value && typeof value === "object") {
                    active.tokens.push(value as StreamToken);
                  }

                  if (mountedRef.current && sessionRef.current?.id === id) {
                    setRenderedLines(tokensToLines(active.tokens));
                  }
                }
              } catch {
                // The parent renderer keeps the raw code fallback alive.
              }
            })();
          }

          if (!session) return;

          const nextCode = latestCodeRef.current;

          if (nextCode.startsWith(session.code)) {
            const delta = nextCode.slice(session.code.length);

            if (delta.length > 0) {
              try {
                session.controller.enqueue(delta);
                session.code = nextCode;
              } catch {
                // Stream was already closed; next update can create a new one.
              }
            }
          } else {
            // Non-append-only update: reset the session safely.
            try {
              session.controller.close();
            } catch {}

            void session.reader.cancel().catch(() => {});
            sessionRef.current = null;
            setRenderedLines(null);
          }
        })
        .catch(() => {
          // Keep UI alive on transient highlighting failures.
        });
    };

    const timer = window.setTimeout(schedule, 18);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [code, language]);

  if (!renderedLines) {
    const rawLines = code.split("\n");

    return (
      <code className="sb-shiki">
        {rawLines.map((line, index) => (
          <span key={index} className="sb-line">
            <span className="sb-ln">{index + 1}</span>
            <span className="sb-code">{line || " "}</span>
          </span>
        ))}
      </code>
    );
  }

  return (
    <code className="sb-shiki">
      {renderedLines.map((line, index) => (
        <span key={index} className="sb-line">
          <span className="sb-ln">{index + 1}</span>
          <span className="sb-code">
            {line.length === 0 ? (
              " "
            ) : (
              line.map((token, tokenIndex) => (
                <span
                  key={`${index}-${tokenIndex}`}
                  style={tokenStyle(token)}
                >
                  {token.content}
                </span>
              ))
            )}
          </span>
        </span>
      ))}
    </code>
  );
}
