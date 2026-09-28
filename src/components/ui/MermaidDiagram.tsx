"use client";
// src/components/ui/MermaidDiagram.tsx — michoro ya ```mermaid (ripoti, live report card, agent chat, Markdown).
//  · mermaid inapakiwa kwa dynamic import (chunk yake peke yake — haiongezi uzito wa ukurasa wa kwanza)
//  · streaming: fence ikiwa bado haijafungwa → "Inachora mchoro…" (haichori code nusu)
//  · HTML entities (&gt; &lt; &amp;) zinarudishwa kuwa alama halisi kabla ya kuchora
//  · syntax ikikataliwa: jaribio la 2 kwa labels zilizowekwa ndani ya "…" (kosa la kawaida la LLM:
//    mabano, <, >, : ndani ya [label]); ikishindwa kabisa → code + sababu (ukurasa hauvunjiki)
import "./mermaid.css";
import { useEffect, useId, useMemo, useState } from "react";
import { Check, Code2, Copy, Maximize2, Minimize2, Workflow } from "lucide-react";

type MermaidApi = typeof import("mermaid").default;
let api: Promise<MermaidApi> | null = null;
let queue: Promise<unknown> = Promise.resolve(); // mermaid ina hali ya global — michoro inachorwa moja moja

function loadMermaid(): Promise<MermaidApi> {
  if (!api) {
    api = import("mermaid").then((m) => {
      const mermaid = m.default;
      mermaid.initialize({
        startOnLoad: false,
        securityLevel: "strict",
        theme: "base",
        fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
        themeVariables: {
          darkMode: true,
          background: "transparent",
          fontSize: "14px",
          primaryColor: "#1a1f2e",
          primaryTextColor: "#e7eef8",
          primaryBorderColor: "#8b5cf6",
          secondaryColor: "#14202a",
          secondaryTextColor: "#e7eef8",
          secondaryBorderColor: "#34d399",
          tertiaryColor: "#161a24",
          tertiaryTextColor: "#e7eef8",
          tertiaryBorderColor: "#3d7bff",
          lineColor: "#8a97b0",
          textColor: "#e7eef8",
          mainBkg: "#1a1f2e",
          nodeBorder: "#8b5cf6",
          clusterBkg: "rgba(139,92,246,0.06)",
          clusterBorder: "rgba(139,92,246,0.35)",
          edgeLabelBackground: "#10131c",
          noteBkgColor: "#221c33",
          noteTextColor: "#e7eef8",
          noteBorderColor: "#a78bfa",
          actorBkg: "#1a1f2e",
          actorBorder: "#8b5cf6",
          actorTextColor: "#e7eef8",
          signalColor: "#c3cde0",
          signalTextColor: "#e7eef8",
        },
        flowchart: { curve: "basis", htmlLabels: true, useMaxWidth: true, padding: 12 },
        sequence: { useMaxWidth: true },
        gantt: { useMaxWidth: true },
      });
      return mermaid;
    });
  }
  return api;
}

/** &gt; → > n.k. (ripoti zilizopita kwenye HTML-escape) */
function decodeEntities(s: string) {
  return s
    .replace(/&gt;/g, ">").replace(/&lt;/g, "<").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&");
}

function normalize(src: string) {
  let s = decodeEntities(src).replace(/\r\n?/g, "\n").replace(/\t/g, "    ").trim();
  s = s.replace(/^mermaid\s*\n/i, ""); // ```\nmermaid\ngraph TD …
  return s;
}

const FLOW = /^\s*(graph|flowchart)\b/i;
/** Jaribio la 2: labels za flowchart ndani ya "…" — mabano / < > : ndani ya label hazivunji tena parser. */
function quoteLabels(src: string) {
  if (!FLOW.test(src)) return src;
  const q = (t: string) => `"${t.trim().replace(/"/g, "'")}"`;
  return src
    .split("\n")
    .map((line, i) => {
      if (i === 0 || /^\s*(%%|classDef|class\s|style\s|linkStyle|subgraph|end\s*$|click\s|direction\s)/.test(line)) return line;
      return line
        .replace(/(\b[\w-]+)\[(?!["[(/\\])([^[\]\n]+?)\](?!\])/g, (_, id, t) => `${id}[${q(t)}]`)
        .replace(/(\b[\w-]+)\{(?![{"])([^{}\n]+?)\}(?!\})/g, (_, id, t) => `${id}{${q(t)}}`)
        .replace(/(\b[\w-]+)\((?![("[])([^()\n]+?)\)(?!\))/g, (_, id, t) => `${id}(${q(t)})`)
        .replace(/\|(?!")([^|\n]+?)\|/g, (_, t) => `|${q(t)}|`);
    })
    .join("\n");
}

async function renderSvg(id: string, code: string): Promise<{ svg: string; fixed: boolean }> {
  const job = queue.then(async () => {
    const mermaid = await loadMermaid();
    try {
      await mermaid.parse(code);
      const { svg } = await mermaid.render(id, code);
      return { svg, fixed: false };
    } catch (first) {
      const alt = quoteLabels(code);
      if (alt === code) throw first;
      try {
        await mermaid.parse(alt);
      } catch {
        throw first;
      }
      const { svg } = await mermaid.render(`${id}f`, alt);
      return { svg, fixed: true };
    } finally {
      // mermaid ikishindwa inaacha <div id="d…"> ya muda kwenye body — isafishwe
      document.getElementById(`d${id}`)?.remove();
      document.getElementById(`d${id}f`)?.remove();
    }
  });
  queue = job.catch(() => undefined);
  return job;
}

const KIND: Record<string, string> = {
  graph: "Flowchart", flowchart: "Flowchart", sequencediagram: "Sequence", classdiagram: "Class", statediagram: "State",
  "statediagram-v2": "State", erdiagram: "ER", gantt: "Gantt", pie: "Pie", journey: "Journey", mindmap: "Mindmap",
  timeline: "Timeline", gitgraph: "Git graph", quadrantchart: "Quadrant", architecture: "Architecture", block: "Block",
};

export function MermaidDiagram({ code, closed = true }: { code: string; closed?: boolean }) {
  const rid = useId().replace(/[^a-zA-Z0-9]/g, "");
  const src = useMemo(() => normalize(code), [code]);
  const kind = KIND[(src.match(/^\s*([\w-]+)/)?.[1] || "").toLowerCase()] || "Mchoro";
  const [out, setOut] = useState<{ src: string; svg?: string; fixed?: boolean; error?: string } | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [wide, setWide] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!closed || !src) return;
    let alive = true;
    const t = setTimeout(() => {
      renderSvg(`m${rid}${Math.random().toString(36).slice(2, 7)}`, src)
        .then((r) => { if (alive) setOut({ src, svg: r.svg, fixed: r.fixed }); })
        .catch((e) => { if (alive) setOut({ src, error: String((e as Error)?.message || e).split("\n").slice(0, 3).join(" ").slice(0, 220) }); });
    }, 60);
    return () => { alive = false; clearTimeout(t); };
  }, [src, closed, rid]);

  const ready = out && out.src === src ? out : null;
  const drawing = !closed || (!ready && !!src);
  const copy = () => {
    navigator.clipboard?.writeText(src).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1300); }).catch(() => {});
  };

  return (
    <figure className="xmd-mmd" data-state={drawing ? "drawing" : ready?.error ? "error" : "ready"}>
      <header className="xmd-mmd-head">
        <span className="xmd-mmd-icon"><Workflow size={13} /></span>
        <span className="xmd-mmd-title">{kind}</span>
        <span className="xmd-mmd-chip">mermaid</span>
        {drawing ? (
          <span className="shimmer-text ml-auto text-[11px] font-medium">Inachora mchoro…</span>
        ) : (
          <span className="ml-auto flex items-center gap-1">
            {ready?.svg && (
              <button type="button" className="xmd-mmd-btn" onClick={() => setShowCode((v) => !v)} aria-label={showCode ? "Onyesha mchoro" : "Onyesha code"} title={showCode ? "Mchoro" : "Code"}>
                {showCode ? <Workflow size={13} /> : <Code2 size={13} />}
              </button>
            )}
            {ready?.svg && !showCode && (
              <button type="button" className="xmd-mmd-btn" onClick={() => setWide((v) => !v)} aria-label={wide ? "Punguza" : "Panua"} title={wide ? "Punguza" : "Panua"}>
                {wide ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              </button>
            )}
            <button type="button" className="xmd-mmd-btn" onClick={copy} aria-label="Copy code" title="Copy code">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </span>
        )}
      </header>

      {drawing ? (
        <div className="xmd-mmd-skel" aria-hidden>
          <span /><span /><span />
        </div>
      ) : ready?.error ? (
        <div className="xmd-mmd-err">
          <p>Syntax ya mchoro huu ina kosa, kwa hiyo inaonyeshwa kama code. <span className="opacity-70">({ready.error})</span></p>
          <pre><code>{src}</code></pre>
        </div>
      ) : showCode ? (
        <pre className="xmd-mmd-code"><code>{src}</code></pre>
      ) : (
        <div className={wide ? "xmd-mmd-svg xmd-mmd-wide" : "xmd-mmd-svg"} dangerouslySetInnerHTML={{ __html: ready?.svg || "" }} />
      )}
    </figure>
  );
}
