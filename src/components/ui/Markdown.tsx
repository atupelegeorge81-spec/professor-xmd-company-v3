import { Fragment, type ReactNode } from "react";
import { MermaidDiagram } from "./MermaidDiagram";

const FENCE = /^\s{0,3}(`{3,}|~{3,})\s*([\w#+.\-]*)/;

/**
 * Tiny, dependency-free markdown renderer for agent replies & reports: headings, bold,
 * italics, inline code, citations [n], bullet/numbered lists, tables, quotes,
 * code fences (```lang … ```) na michoro ya ```mermaid.
 */
function inline(text: string, key = ""): ReactNode[] {
  const out: ReactNode[] = [];
  const re = /(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[\d+\])/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let i = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const t = m[0];
    const k = `${key}-${i++}`;
    if (t.startsWith("**")) out.push(<strong key={k}>{t.slice(2, -2)}</strong>);
    else if (t.startsWith("`")) out.push(<code key={k}>{t.slice(1, -1)}</code>);
    else if (t.startsWith("[")) out.push(<sup key={k} className="cite">{t.slice(1, -1)}</sup>);
    else out.push(<em key={k}>{t.slice(1, -1)}</em>);
    last = m.index + t.length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

export function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function Markdown({ text, accent }: { text: string; accent?: string }) {
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let i = 0;
  let k = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }
    // Streaming: heading/quote iliyokatika ("#", "##", ">") — ruka mpaka maandishi yafike (zamani: infinite loop → tab crash)
    if (/^(#{1,6}|>)\s*$/.test(line)) { i++; continue; }
    // ```lang … ``` — zamani zilichukuliwa kama aya (mistari iliungana, mermaid haikuchorwa)
    const fm = line.match(FENCE);
    if (fm) {
      const mark = fm[1];
      const lang = (fm[2] || "").toLowerCase();
      const body: string[] = [];
      i++;
      let closed = false;
      while (i < lines.length) {
        const t = lines[i].trim();
        if (t.startsWith(mark[0].repeat(mark.length)) && /^(`{3,}|~{3,})$/.test(t)) { closed = true; i++; break; }
        body.push(lines[i]);
        i++;
      }
      const code = body.join("\n");
      blocks.push(
        lang === "mermaid" ? <MermaidDiagram key={k++} code={code} closed={closed} />
          : <pre key={k++} className="md-pre" data-lang={lang || undefined}><code>{code}</code></pre>,
      );
      continue;
    }
    if (/^#{4,6} /.test(line)) { blocks.push(<h3 key={k++}>{inline(line.replace(/^#+ /, ""))}</h3>); i++; continue; }
    if (line.startsWith("# ")) { blocks.push(<h1 key={k++}>{inline(line.slice(2))}</h1>); i++; continue; }
    if (line.startsWith("## ")) { const t = line.slice(3); blocks.push(<h2 key={k++} id={slug(t)}>{inline(t)}</h2>); i++; continue; }
    if (line.startsWith("### ")) { blocks.push(<h3 key={k++}>{inline(line.slice(4))}</h3>); i++; continue; }
    if (line.startsWith("> ")) { blocks.push(<blockquote key={k++}>{inline(line.slice(2))}</blockquote>); i++; continue; }
    if (line.startsWith("|")) {
      const tableLines: string[] = [];

      while (i < lines.length && lines[i].startsWith("|")) {
        tableLines.push(lines[i]);
        i++;
      }

      /*
       * Markdown tables can arrive incrementally while the Board Room
       * is streaming an agent response.
       *
       * Example of an incomplete table:
       *
       * | Agent | Status |
       * | --- |
       *
       * or even:
       *
       * | Agent | Status
       *
       * The old parser assumed that `rows[0]` always existed and then
       * called `head.map(...)`, which crashes when the parser receives
       * only a separator/incomplete row.
       */

      const parseCells = (row: string): string[] => {
        const trimmed = row.trim();

        if (!trimmed.startsWith("|")) {
          return [];
        }

        const parts = trimmed.split("|");

        // Remove the empty item caused by the leading "|".
        parts.shift();

        // Remove the empty item caused by a trailing "|".
        if (parts.length && parts[parts.length - 1].trim() === "") {
          parts.pop();
        }

        return parts.map((c) => c.trim());
      };

      const isSeparatorRow = (cells: string[]) =>
        cells.length > 0 &&
        cells.every((c) => /^:?-{3,}:?$/.test(c));

      const parsedRows = tableLines
        .map(parseCells)
        .filter((cells) => cells.length > 0);

      /*
       * Find the real Markdown separator row.
       *
       * A valid table needs:
       *   1. Header row
       *   2. Separator row
       *
       * Do not assume the first parsed row is a header.
       */
      const separatorIndex = parsedRows.findIndex(isSeparatorRow);

      /*
       * If there is no valid separator yet, the table is probably still
       * streaming. Render it as normal text instead of constructing a
       * malformed table.
       */
      if (separatorIndex < 1) {
        const fallbackText = tableLines.join("\n");

        blocks.push(
          <p key={k++}>
            {inline(fallbackText)}
          </p>,
        );

        continue;
      }

      const head = parsedRows[separatorIndex - 1];

      /*
       * Defensive guard.
       *
       * Even if the parser receives malformed Markdown, NEVER allow
       * `head.map(...)` to execute with undefined.
       */
      if (!head || head.length === 0) {
        const fallbackText = tableLines.join("\n");

        blocks.push(
          <p key={k++}>
            {inline(fallbackText)}
          </p>,
        );

        continue;
      }

      const body = parsedRows
        .slice(separatorIndex + 1)
        .filter((row) => row.length > 0);

      blocks.push(
        <div key={k++} className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {head.map((c, j) => (
                  <th key={j}>{inline(c)}</th>
                ))}
              </tr>
            </thead>

            <tbody>
              {body.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, j) => (
                    <td key={j}>
                      {c === "LOCKED" ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(52_211_153/0.12)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-ok)]">
                          ● LOCKED
                        </span>
                      ) : /^Inajadiliwa$/.test(c) ? (
                        <span className="inline-flex items-center gap-1 rounded-md bg-[rgb(251_191_36/0.12)] px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-[var(--color-warn)]">
                          ◌ {c}
                        </span>
                      ) : (
                        inline(c, `${ri}${j}`)
                      )}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>,
      );

      continue;
    }
    if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i])) { items.push(lines[i].slice(2)); i++; }
      blocks.push(<ul key={k++}>{items.map((t, j) => <li key={j}>{inline(t, `${j}`)}</li>)}</ul>);
      continue;
    }
    if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i])) { items.push(lines[i].replace(/^\d+\. /, "")); i++; }
      blocks.push(<ol key={k++}>{items.map((t, j) => <li key={j}>{inline(t, `${j}`)}</li>)}</ol>);
      continue;
    }
    const para: string[] = [];
    while (i < lines.length && lines[i].trim() && !/^(#|>|\||- |\d+\. )/.test(lines[i]) && !FENCE.test(lines[i])) { para.push(lines[i]); i++; }
    // Kinga: mstari usiotambulika (mf. "#Kichwa", ">maneno") — usikwame, uchukue kama aya
    if (!para.length) { para.push(lines[i]); i++; }
    blocks.push(<p key={k++}>{para.map((p, j) => <Fragment key={j}>{j > 0 && " "}{inline(p, `${j}`)}</Fragment>)}</p>);
  }
  return (
    <div className="prose-xmd" style={accent ? ({ ["--bullet" as string]: accent } as React.CSSProperties) : undefined}>
      {blocks}
    </div>
  );
}
