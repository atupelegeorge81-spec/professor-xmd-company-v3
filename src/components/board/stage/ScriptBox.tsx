"use client";
import "./scriptbox.css";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Check, ChevronsDownUp, ChevronsUpDown, Copy, FileCode2, Scissors } from "lucide-react";
import type { Hunk } from "@/lib/stage/types";
import { cn } from "@/lib/utils";
import { Spinner } from "./kit";

/* ============================================================================
 * ScriptBox — kutoka professor-xmd-company (Markdown.tsx ScriptBox · "01 Prism Glass"),
 * imeboreshwa kidogo:
 *  · live writing: mistari mipya inafade in, caret, auto-scroll, progress shimmer chini
 *  · continuation ("sehemu 2/3") inaonekana kwenye header + mstari wa "inaendelea…"
 *  · surgical patch (script_diff) ndani ya box: diff inaonekana kwa muda, kisha inajikunja
 *    kuwa kitufe; mistari iliyobadilika inabaki na alama ya kijani
 *  · expand / collapse, copy
 * ========================================================================= */

export interface ScriptPatch { add: number; del: number; hunks: Hunk[]; changed: number[]; label?: string }

export function ScriptBox({
  title, lang, code, shown, accent, writing, resume, patching, attempt, maxAttempts, version, patch, who, footer,
}: {
  title: string; lang: string; code: string; shown?: number; accent: string;
  writing?: boolean; resume?: boolean; patching?: boolean;
  attempt?: number; maxAttempts?: number; version?: number;
  patch?: ScriptPatch; who?: ReactNode; footer?: ReactNode;
}) {
  const visible = code.slice(0, shown ?? code.length);
  const lines = visible.split("\n");
  const live = !!(writing || resume || patching);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showDiff, setShowDiff] = useState(!!patching);
  const body = useRef<HTMLPreElement>(null);

  // diff inaonekana wakati wa patch + sekunde 2.4 baada yake (kama company), kisha inajikunja
  useEffect(() => {
    if (patching) { setShowDiff(true); return; }
    if (!showDiff) return;
    const t = setTimeout(() => setShowDiff(false), 2400);
    return () => clearTimeout(t);
  }, [patching]);

  // auto-scroll wakati wa kuandika
  useLayoutEffect(() => {
    if (writing && body.current) body.current.scrollTop = body.current.scrollHeight;
  }, [visible.length, writing]);

  const copy = async () => {
    try { await navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 1600); } catch {}
  };

  const changed = new Set(patch?.changed ?? []);
  const long = lines.length > 16;
  const cont = (attempt ?? 1) > 1;

  return (
    <article className="xsb animate-[rise_0.45s_both]" data-live={live ? "1" : "0"} style={{ ["--acc" as string]: accent }}>
      <header className="xsb-head">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg" style={{ color: accent, background: `color-mix(in srgb, ${accent} 16%, transparent)` }}>
          <FileCode2 size={13} />
        </span>
        <h3 className="xsb-title">{title}</h3>
        {version && version > 1 && <span className="xsb-chip" style={{ color: "#a7f3d0", borderColor: "rgba(52,211,153,.3)" }}>v{version}</span>}
        <span className="xsb-chip !hidden sm:!inline-flex">{lang === "typescript" ? "TS" : lang.toUpperCase()}</span>
        {cont && live && <span className="xsb-chip" style={{ color: accent, borderColor: `color-mix(in srgb, ${accent} 40%, transparent)` }}>sehemu {attempt}/{maxAttempts}</span>}
        <span className="flex-1" />
        {who && <span className="hidden items-center gap-1.5 text-[11px] text-[var(--sb-muted)] sm:flex">{who}</span>}
        {live ? (
          <span className="shimmer-text shrink-0 whitespace-nowrap text-[11px] font-medium">{patching ? "patching…" : resume ? "inaendelea…" : "inaandika…"}</span>
        ) : patch ? (
          <button type="button" className="xsb-btn !normal-case !tracking-normal" onClick={() => setShowDiff((v) => !v)} title="Onyesha / ficha surgical patch">
            <span className="xsb-stats text-[#34d399]">+{patch.add}</span>
            <span className="xsb-stats text-[#f87171]">−{patch.del}</span>
          </button>
        ) : (
          <span className="xsb-stats text-[var(--sb-muted)] !font-medium">{lines.length} lines</span>
        )}
        <button type="button" className="xsb-btn" onClick={copy} aria-label="Copy code">
          {copied ? <Check size={14} /> : <Copy size={14} />}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>
      </header>

      <pre ref={body} className="xsb-body" style={{ maxHeight: expanded ? "none" : 340 }}>
        {patch && (
          <div className={cn("grid transition-all duration-500", showDiff ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
            <div className="overflow-hidden">
              <div className="xsb-diff">
                <div className="xsb-diff-head">
                  <Scissors size={11} /> Surgical patch
                  {patch.label && <span className="normal-case tracking-normal text-[var(--sb-muted)]">· {patch.label}</span>}
                  {patching && <Spinner size={10} color="#9bb0c4" className="ml-auto" />}
                </div>
                <code className="block py-1">
                  {patch.hunks.flatMap((h, hi) => {
                    const at = patch.changed[patch.hunks.slice(0, hi).reduce((n, x) => n + x.new.length, 0)] ?? h.line;
                    return [
                      ...h.old.map((l, i) => (
                        <div key={`${hi}d${i}`} className="xsb-line xsb-del"><span className="xsb-ln">{at + i}</span><span className="xsb-code"><span className="xsb-mark">− </span>{l.trim() ? l : " "}</span></div>
                      )),
                      ...h.new.map((l, i) => (
                        <div key={`${hi}a${i}`} className="xsb-line xsb-add"><span className="xsb-ln">{at + i}</span><span className="xsb-code"><span className="xsb-mark">+ </span>{l.trim() ? l : " "}</span></div>
                      )),
                    ];
                  })}
                </code>
              </div>
            </div>
          </div>
        )}

        <code className={cn("block transition-opacity duration-500", patching && "opacity-50")}>
          {lines.map((l, i) => (
            <div key={i} className={cn("xsb-line", live && "is-new", !patching && changed.has(i + 1) && "is-changed")}>
              <span className="xsb-ln">{i + 1}</span>
              <span className={cn("xsb-code", writing && i === lines.length - 1 && "xsb-caret")}><Tokens line={l} /></span>
            </div>
          ))}
          {resume && (
            <div className="xsb-line mt-1">
              <span className="xsb-ln" />
              <span className="flex items-center gap-2 text-[11.5px]">
                <Spinner size={10} color={accent} />
                <span className="shimmer-text font-medium">inaendelea pale ilipoishia · sehemu {attempt}/{maxAttempts}</span>
              </span>
            </div>
          )}
        </code>
      </pre>

      {(long && !live) || footer ? (
        <div className="flex items-center gap-2 border-t border-white/[0.06] px-3 py-1.5 text-[11px] text-[var(--sb-muted)]">
          {footer}
          {long && !live && (
            <button type="button" className="xsb-btn ml-auto !min-h-[26px]" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronsDownUp size={13} /> : <ChevronsUpDown size={13} />}
              {expanded ? "Punguza" : `Onyesha yote · ${lines.length}`}
            </button>
          )}
        </div>
      ) : null}

      {live && <div className="xsb-progress"><span /></div>}
    </article>
  );
}

/* ------------------------------------------------------------------ tokenizer (bila dependency) */
const KW = new Set([
  "import", "export", "from", "const", "let", "var", "async", "await", "return", "if", "else", "throw", "new", "function",
  "type", "interface", "extends", "implements", "class", "for", "of", "in", "while", "try", "catch", "true", "false", "null",
  "undefined", "as", "typeof", "default", "describe", "it", "expect",
]);
const TYPES = new Set(["string", "number", "boolean", "void", "unknown", "any", "never", "Promise", "Record"]);
const RX = /(\/\/.*$)|("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|`(?:[^`\\]|\\.)*`?)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_$][\w$]*)|([{}()[\];,.:<>=+\-*/!?&|%]+)/g;

function Tokens({ line }: { line: string }) {
  if (!line) return <>{" "}</>;
  const out: ReactNode[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  RX.lastIndex = 0;
  while ((m = RX.exec(line))) {
    if (m.index > last) out.push(line.slice(last, m.index));
    const [tok, cmt, str, num, id, p] = m;
    let cls = "";
    if (cmt) cls = "tk-cmt";
    else if (str) cls = "tk-str";
    else if (num) cls = "tk-num";
    else if (id) {
      if (KW.has(id)) cls = "tk-kw";
      else if (TYPES.has(id) || /^[A-Z]/.test(id)) cls = "tk-type";
      else if (line[m.index + id.length] === "(") cls = "tk-fn";
    } else if (p) cls = "tk-p";
    out.push(cls ? <span key={m.index} className={cls}>{tok}</span> : tok);
    last = m.index + tok.length;
    if (tok.length === 0) RX.lastIndex++;
  }
  if (last < line.length) out.push(line.slice(last));
  return <>{out}</>;
}
