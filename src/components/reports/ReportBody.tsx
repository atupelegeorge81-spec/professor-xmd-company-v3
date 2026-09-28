"use client";
// src/components/reports/ReportBody.tsx — mwili wa ripoti: maandishi (Markdown) + code ndani ya ScriptBox.
// Kama agent chat: ```lang … ``` inakuwa ScriptBox (copy, namba za mistari, rangi, kukunja/kufungua);
// ```mermaid inakuwa mchoro halisi (MermaidDiagram). `live` = ripoti bado inaandikwa (Board Room finale).
// Jina la faili: kutoka info ya fence (```tsx src/app/page.tsx), au mstari mfupi juu ya code
// (**index.html**, `styles.css`, ### api/route.ts); vinginevyo jina la kawaida la lugha (index.html, styles.css…).
import "./report.css";
import { useMemo } from "react";
import { Markdown } from "@/components/ui/Markdown";
import { ScriptBox } from "@/components/board/stage/ScriptBox";
import { MermaidDiagram } from "@/components/ui/MermaidDiagram";
import { splitFences, fileFor, type Segment } from "@/lib/chat/fences";
import { getAgent } from "@/lib/team";

const FILE_RE = /(?:^|[\s`*"'(])((?:[\w.-]+\/)*[\w.-]+\.[a-z0-9]{1,8})(?=$|[\s`*"'):,])/i;

/** Mstari wa mwisho wa maandishi yaliyotangulia — kama ni lebo fupi ya faili, uondolewe na utumike kama title. */
function labelFrom(text: string): { file: string; rest: string } | null {
  const lines = text.replace(/\s+$/, "").split("\n");
  const last = (lines[lines.length - 1] || "").trim();
  if (!last || last.length > 90) return null;
  const bare = last.replace(/^#{1,6}\s+/, "").replace(/^[-*]\s+/, "").replace(/[*_`:]/g, "").replace(/^(faili|file)\s*/i, "").trim();
  const m = bare.match(FILE_RE);
  if (!m || bare.length - m[1].length > 24) return null; // si lebo — ni sentensi yenye jina la faili ndani
  return { file: m[1], rest: lines.slice(0, -1).join("\n") };
}

type Block = { kind: "text"; text: string; key: string } | { kind: "code"; seg: Extract<Segment, { type: "code" }>; title: string; key: string };

export function ReportBody({ text, live = false }: { text: string; live?: boolean }) {
  const accent = getAgent("optimus")?.accent || "#8b5cf6";

  const blocks = useMemo<Block[]>(() => {
    const segs = splitFences(text);
    const out: Block[] = [];
    const seen: Record<string, number> = {};
    segs.forEach((s, i) => {
      if (s.type === "text") { out.push({ kind: "text", text: s.text, key: `t${i}` }); return; }
      if (s.lang === "mermaid") { out.push({ kind: "code", seg: s, title: "mermaid", key: `c${s.index}` }); return; }
      let title = "";
      const info = s.info.match(FILE_RE);
      if (info) title = info[1];
      const prev = out[out.length - 1];
      if (prev?.kind === "text") {
        const lab = labelFrom(prev.text);
        if (lab) {
          if (!title) title = lab.file;
          if (lab.file === title) { prev.text = lab.rest; if (!prev.text.trim()) out.pop(); }
        }
      }
      if (!title) title = fileFor(s.lang, (seen[s.lang] = (seen[s.lang] ?? -1) + 1));
      out.push({ kind: "code", seg: s, title, key: `c${s.index}` });
    });
    return out;
  }, [text]);

  return (
    <div className="report-body space-y-4">
      {blocks.map((b) =>
        b.kind === "text" ? (
          <Markdown key={b.key} text={b.text} />
        ) : b.seg.lang === "mermaid" ? (
          <MermaidDiagram key={b.key} code={b.seg.code} closed={b.seg.closed} />
        ) : (
          <div key={b.key} className="report-code">
            <ScriptBox title={b.title} lang={b.seg.lang} code={b.seg.code} accent={accent} writing={live && !b.seg.closed} />
          </div>
        ),
      )}
    </div>
  );
}
