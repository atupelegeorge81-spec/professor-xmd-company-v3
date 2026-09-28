// src/lib/board/codeBlocks.ts — R26 (Awamu 3/5): kusoma code blocks KIDETERMINISTIC.
//
// Tatizo la R24: code writer alianza upya ndani ya "continuation" → deliverable ya A3 ilikuwa na toleo lililokatika
// + toleo kamili + toleo jingine lisilofungwa, vyote vimeunganishwa. Script ya mwisho (LLM) ilipoteza A7/A9.
// Hapa: kila block inatambuliwa (lugha, njia ya faili, kama imekamilika) → toleo KAMILI moja kwa kila faili.
// PURE — hakuna I/O.

export interface CodeBlock {
  lang: string;
  body: string;
  /** fence ilifungwa (```) — block isiyofungwa = ilikatika */
  complete: boolean;
  /** njia ya faili (src/…/x.astro) ikiwa imetambulika */
  path: string | null;
  /** maandishi ya nje kabla ya block hii */
  pre: string;
}

const EXT = "astro|tsx?|jsx?|mjs|cjs|json|css|scss|html?|ya?ml|md|toml|xml|txt|svelte|vue|py|sh|env|webmanifest";
const PATH_RE = new RegExp(`(?:^|[\\s\`'"(:])((?:\\.?[\\w@-]+/)*[\\w.@-]+\\.(?:${EXT}))(?=$|[\\s\`'"),:])`, "i");
const PATH_ONLY = new RegExp(`^((?:\\.?[\\w@-]+/)*[\\w.@-]+\\.(?:${EXT}))$`, "i");

/** njia kutoka kwenye mstari wa comment: "// src/x.astro", "<!-- src/x.astro -->", "# .github/ci.yml", "// 2. tests/a.spec.ts" */
export function pathFromComment(line: string): string | null {
  const m = String(line || "").trim().match(/^(?:\/\/+|\/\*+|<!--|#|--|;)\s*(?:\d+[.)]\s*)?(?:file(?:name)?\s*[:=]\s*)?([^\s*>]+?)\s*(?:\*\/|-->)?\s*$/i);
  if (!m) return null;
  const p = m[1].replace(/^[`'"]|[`'":]$/g, "");
  return PATH_ONLY.test(p) && /[/.]/.test(p) && !/^https?:/i.test(p) ? p.replace(/^\.\//, "") : null;
}

function pathFromPre(pre: string): string | null {
  const tail = String(pre || "").trim().split("\n").slice(-3).join("\n");
  const ticks = [...tail.matchAll(/`([^`\n]+)`/g)].map((m) => m[1].trim()).filter((p) => PATH_ONLY.test(p) && p.includes("/"));
  if (ticks.length) return ticks[ticks.length - 1].replace(/^\.\//, "");
  return null;
}

function detectPath(body: string, pre: string): string | null {
  const lines = body.split("\n").slice(0, 8);
  for (const l of lines) {
    const p = pathFromComment(l);
    if (p) return p;
  }
  return pathFromPre(pre);
}

/** Maandishi → blocks. Fence mpya YENYE lugha ikifunguliwa ndani ya block = block ya awali ilikatika (imeachwa). */
export function parseBlocks(text: string): CodeBlock[] {
  const out: CodeBlock[] = [];
  const lines = String(text || "").replace(/\r/g, "").split("\n");
  let cur: { lang: string; body: string[]; pre: string } | null = null;
  let pre: string[] = [];
  const push = (complete: boolean) => {
    if (!cur) return;
    const body = cur.body.join("\n");
    if (body.trim()) out.push({ lang: cur.lang, body, complete, path: detectPath(body, cur.pre), pre: cur.pre });
    cur = null;
  };
  for (const line of lines) {
    const f = line.match(/^\s*```+\s*([\w+#.-]*)\s*$/);
    if (!f) { if (cur) (cur as { body: string[] }).body.push(line); else pre.push(line); continue; }
    if (!cur) { cur = { lang: f[1].toLowerCase(), body: [], pre: pre.join("\n") }; pre = []; continue; }
    if (f[1]) { const inherit: string = (cur as { pre: string }).pre; push(false); cur = { lang: f[1].toLowerCase(), body: [], pre: inherit }; continue; } // fence ya lugha ndani ya block → mwanzo mpya (maelezo yale yale)
    push(true);
  }
  push(false);
  return out;
}

/** Block moja yenye faili nyingi ("// 1. playwright.config.ts" … "// 2. tests/x.spec.ts") → vipande kwa kila faili. */
export function splitMultiFile(b: CodeBlock): CodeBlock[] {
  const lines = b.body.split("\n");
  const marks: { at: number; path: string }[] = [];
  lines.forEach((l, i) => {
    const p = pathFromComment(l);
    if (p && (/^\s*(\/\/|#)\s*\d+[.)]/.test(l) || /^\s*(\/\/|#)\s*[=\-]{4,}/.test(lines[i - 1] || ""))) marks.push({ at: i, path: p });
  });
  if (marks.length < 2) return [b];
  const res: CodeBlock[] = [];
  for (let k = 0; k < marks.length; k++) {
    let start = marks[k].at;
    // mstari wa "// =====" juu ya kichwa unaenda na faili lake
    if (start > 0 && /^\s*(\/\/|#)\s*[=\-]{4,}\s*$/.test(lines[start - 1])) start--;
    let end = k + 1 < marks.length ? marks[k + 1].at : lines.length;
    if (end < lines.length && end > 0 && /^\s*(\/\/|#)\s*[=\-]{4,}\s*$/.test(lines[end - 1])) end--;
    const body = lines.slice(start, end).join("\n").replace(/^\s*(\/\/|#)\s*[=\-]{4,}\s*\n/, "").replace(/\n\s*(\/\/|#)\s*[=\-]{4,}\s*$/, "").trim();
    const lang = /\.ya?ml$/i.test(marks[k].path) ? "yaml" : /\.m?js$/i.test(marks[k].path) ? "javascript" : /\.json$/i.test(marks[k].path) ? "json" : b.lang;
    res.push({ lang, body, complete: k + 1 < marks.length ? true : b.complete, path: marks[k].path, pre: k === 0 ? b.pre : "" });
  }
  return res;
}

const sig = (b: CodeBlock) => b.body.replace(/\s+/g, " ").trim().slice(0, 160);

/**
 * Toleo bora kwa kila faili ndani ya deliverable MOJA: block kamili inashinda iliyokatika; kati ya kamili → ndefu zaidi.
 * Blocks zisizo na njia zinaunganishwa kwa "sahihi" ya mwanzo (majaribio ya kuanza upya yana mwanzo ule ule).
 */
export function bestBlocks(text: string): CodeBlock[] {
  const blocks = parseBlocks(text).flatMap(splitMultiFile);
  const groups: { path: string | null; sigs: Set<string>; items: CodeBlock[] }[] = [];
  for (const b of blocks) {
    const s = sig(b);
    // kikundi kimoja = njia ile ile AU mwanzo ule ule (herufi 160) — jaribio la kuanza upya
    // jaribio lililokatika mapema lina "sahihi" fupi → linalingana kama kiambishi cha toleo kamili
    const sameStart = (x: Set<string>) => s.length >= 40 && [...x].some((t) => t.length >= 40 && (t.startsWith(s) || s.startsWith(t)));
    let g = groups.find((x) => (b.path && x.path === b.path) || sameStart(x.sigs));
    if (g && b.path && g.path && g.path !== b.path) g = undefined;
    if (!g) { g = { path: b.path, sigs: new Set(), items: [] }; groups.push(g); }
    g.items.push(b);
    g.sigs.add(s);
    if (!g.path && b.path) g.path = b.path;
  }
  return groups.map((g) => {
    const pool = g.items.some((b) => b.complete) ? g.items.filter((b) => b.complete) : g.items;
    const best = pool.reduce((a, b) => (b.body.length > a.body.length ? b : a));
    return { ...best, path: best.path || g.path };
  });
}

/** Deliverable → maandishi safi: sentensi ya kwanza ya maelezo + toleo moja kamili la kila faili (R26 D2). */
export function normalizeDeliverable(text: string): { text: string; changed: boolean; incomplete: string[] } {
  const src = String(text || "");
  const all = parseBlocks(src);
  if (!all.length) return { text: src, changed: false, incomplete: [] };
  const best = bestBlocks(src);
  const intro = (all[0].pre || "").trim().split("\n").filter((l) => l.trim()).slice(0, 2).join("\n");
  const body = best.map((b) => `${b.path && !b.body.split("\n").slice(0, 8).some((l) => pathFromComment(l) === b.path) ? `\`${b.path}\`\n` : ""}\`\`\`${b.lang}\n${b.body.replace(/\s+$/, "")}\n\`\`\``).join("\n\n");
  const out = `${intro ? `${intro}\n\n` : ""}${body}`;
  const incomplete = best.filter((b) => !b.complete).map((b) => b.path || b.lang || "code");
  const changed = all.length !== best.length || all.some((b) => !b.complete);
  return { text: changed ? out : src, changed, incomplete };
}

/** Maandishi yanayohesabiwa kama code tu (kwa Data Guard). Bila fence → maandishi yote. */
export function codeText(text: string): string {
  const b = parseBlocks(text);
  return b.length ? b.map((x) => x.body).join("\n") : String(text || "");
}

export const extOf = (lang: string) =>
  ({ astro: "astro", typescript: "ts", ts: "ts", javascript: "js", js: "js", json: "json", css: "css", html: "html", yaml: "yml", yml: "yml", tsx: "tsx", jsx: "jsx", bash: "sh", sh: "sh", md: "md", markdown: "md" } as Record<string, string>)[lang] || "txt";
