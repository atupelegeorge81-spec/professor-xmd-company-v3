// src/lib/board/contrastGuard.ts — R27: madai ya contrast (WCAG) yanakaguliwa KWA HESABU, si kwa LLM.
// Tatizo halisi (R27, Agenda 1): Ultron alidai `#7A263A` on `#FFF9F4` "~4.2:1 (fails WCAG AA)" — halisi ni 9.28:1 — na
// akatumia dai hilo kukataa palette ya Optimus; sage yake `#7A8A7A` "4.8:1 ✓ AA" — halisi 3.50:1 (haipiti AA).
// Moduli hii (pure): inasoma madai "X on Y → N:1", mistari ya jedwali "| X | Y | N:1 |", comments za CSS
// "--ink: #241A18; /* 14.3:1 on --bg */", inatatua --var → hex, inahesabu uwiano halisi (WCAG 2.x) na kurudisha makosa.

export interface ContrastHit { fg: string; bg: string; fgHex: string; bgHex: string; claimed: number; actual: number }

const HEX = /#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/i;
const C = "`?(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b|--[A-Za-z0-9_-]+)`?";
const R = "~?≈?\\s*(\\d{1,2}(?:\\.\\d{1,2})?)\\s*:\\s*1\\b";

function expand(h: string): string {
  const x = h.replace("#", "").toLowerCase();
  return `#${x.length === 3 ? x.split("").map((c) => c + c).join("") : x}`;
}
function lum(hex: string): number {
  const h = expand(hex).slice(1);
  const f = (i: number) => {
    const c = parseInt(h.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(0) + 0.7152 * f(2) + 0.0722 * f(4);
}
/** Uwiano wa contrast wa WCAG 2.x (1–21). */
export function contrastRatio(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/** --var → hex kutoka maandishi ("--ink: #241A18", "`--ink` `#241A18`", "--ink (#241A18)"). */
export function colorVars(...texts: string[]): Map<string, string> {
  const m = new Map<string, string>();
  const re = /(--[A-Za-z0-9_-]+)`?\s*(?::|=|\(|`)?\s*`?(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3}))\b/g;
  for (const t of texts) for (const x of String(t || "").matchAll(re)) m.set(x[1].toLowerCase(), expand(x[2]));
  return m;
}

function resolve(ref: string, vars: Map<string, string>): string | null {
  if (HEX.test(ref) && ref.startsWith("#")) return expand(ref);
  return vars.get(ref.toLowerCase()) || null;
}

/** Je dai hili ni kosa la maana? Linabadilisha AA (3.0 / 4.5) au limekosea kwa >15%. */
function wrong(claimed: number, actual: number): boolean {
  const cls = (v: number) => (v >= 4.5 ? 2 : v >= 3 ? 1 : 0);
  if (cls(claimed) !== cls(actual)) return true;
  return Math.abs(claimed - actual) / actual > 0.15;
}

const NEED = /\b(?:need|needs|must|require[sd]?|requirement|minimum|min\.?|at least|target|threshold|should|aim)\b|≥|>=/i;

function positional(line: string, add: (fg: string, bg: string, claimed: string) => void) {
  type Tok = { ref: string; at: number; end: number };
  const toks: Tok[] = [];
  for (const x of line.matchAll(new RegExp(C, "g"))) toks.push({ ref: x[1], at: x.index ?? 0, end: (x.index ?? 0) + x[0].length });
  if (toks.length < 2) return;
  const targets = new Set<number>();
  const claims: { bgAt: number; bg: string; claim: string; at: number }[] = [];
  // "N:1 on Y"
  for (const x of line.matchAll(new RegExp(`${R}\\s+on\\s+${C}`, "g"))) {
    const at = x.index ?? 0;
    const bgAt = at + x[0].lastIndexOf(x[2]);
    claims.push({ bgAt, bg: x[2], claim: x[1], at });
  }
  // "on Y: N:1" / "on Y → N:1"
  for (const x of line.matchAll(new RegExp(`\\bon\\s+${C}\\s*(?::|→|->|=|—)\\s*${R}`, "g"))) {
    const at = x.index ?? 0;
    claims.push({ bgAt: at + x[0].indexOf(x[1]), bg: x[1], claim: x[2], at });
  }
  claims.sort((a, b) => a.at - b.at);
  for (const c of claims) {
    const bgTok = toks.find((t) => t.at === c.bgAt || (t.at <= c.bgAt && t.end > c.bgAt));
    if (bgTok) targets.add(bgTok.at);
    let fg: Tok | null = null;
    for (const t of toks) {
      if (t.at >= c.at) break;
      if (targets.has(t.at)) continue;
      fg = t;
    }
    if (!fg) continue;
    const between = line.slice(fg.end, c.at + 12);
    if (NEED.test(between)) continue; // "needs 4.5:1 on --bg" = sharti, si dai
    add(fg.ref, c.bg, c.claim);
  }
}

/** Rangi ya nyuma ya ukurasa: --bg/--background/--color-bg, au hex iliyoitwa "nyuma"/"background"/"bg". */
function pageBg(vars: Map<string, string>, all: string): string | null {
  for (const k of ["--bg", "--background", "--color-bg", "--bg-color", "--surface-bg"]) if (vars.get(k)) return k;
  const body = all.match(/(?:^|[\s,}])(?:body|html|:root)\s*\{[^}]*?background(?:-color)?\s*:\s*(#[0-9a-fA-F]{6})\b/i);
  if (body) return expand(body[1]);
  // R29: maandishi ya kawaida tu — si declaration ya CSS ndani ya rule ya kitufe (".btn-wa { background: #25D366 }")
  const prose = all.replace(/\{[^{}]*\}/g, " ");
  const a = prose.match(/`?(#[0-9a-fA-F]{6})\b`?\s*(?:\(|—|-|–|:)?\s*(?:rangi ya\s+)?(?:nyuma|background|bg)\b/i);
  if (a) return expand(a[1]);
  const b = prose.match(/\b(?:background|bg|rangi ya nyuma|nyuma)\b\s*(?::|=|—|-|–)?\s*`?(#[0-9a-fA-F]{6})\b/i);
  return b ? expand(b[1]) : null;
}

/** Madai yote ya contrast yenye makosa kwenye maandishi. `context` = maandishi mengine yenye --var (pendekezo, Ledger). */
export function contrastHits(text: string, ...context: string[]): ContrastHit[] {
  const vars = colorVars(...context, text);
  const out: ContrastHit[] = [];
  const seen = new Set<string>();
  const add = (fg: string, bg: string, claimedS: string) => {
    const fh = resolve(fg, vars), bh = resolve(bg, vars);
    const claimed = Number(claimedS);
    if (!fh || !bh || !claimed || fh === bh) return;
    const actual = Math.round(contrastRatio(fh, bh) * 100) / 100;
    const key = `${fh}|${bh}|${claimed}`;
    if (seen.has(key)) return;
    seen.add(key);
    if (wrong(claimed, actual)) out.push({ fg, bg, fgHex: fh, bgHex: bh, claimed, actual });
  };
  for (const line of String(text || "").split("\n")) {
    // jedwali: | fg | bg | N:1 |
    const row = line.match(new RegExp(`^\\s*\\|\\s*${C}\\s*\\|\\s*${C}\\s*\\|\\s*${R}`));
    if (row) { add(row[1], row[2], row[3]); continue; }
    // mstari wa declaration: "--ink: #241A18; /* … 14.3:1 on --bg, 15.3:1 on --surface */"
    // R28: pia bullet yenye backtick — "- `--accent: #FF6B00` (… on --ink: 4.5:1)"
    const decl = line.match(/^\s*(?:[-*•]\s+)?`?(--[A-Za-z0-9_-]+)`?\s*:/);
    let lastFg: string | null = decl ? decl[1] : null;
    // "X on Y → N:1" / "X on Y: N:1"
    for (const x of line.matchAll(new RegExp(`${C}\\s+on\\s+${C}\\s*(?:→|->|:|=|—|–|-|\\bis\\b|\\bat\\b)?\\s*${R}`, "g"))) {
      add(x[1], x[2], x[3]);
      lastFg = x[1];
    }
    // R28 (Gereji A1): sentensi — "The `--accent` (#FF6B00) at 5.2:1 on `--bg` and 4.5:1 on `--ink`" /
    // "… WCAG AA on --bg: 5.2:1, on --ink: 4.5:1" → fg = rangi ya karibu KABLA ya dai (isiyo target ya "on" iliyotangulia)
    positional(line, add);
    if (!lastFg) continue;
    // "N:1 on Y" (fg = declaration / dai la mwisho kwenye mstari)
    for (const x of line.matchAll(new RegExp(`${R}\\s+on\\s+${C}`, "g"))) {
      if (NEED.test(line.slice(Math.max(0, (x.index ?? 0) - 30), x.index ?? 0))) continue; // R28: sharti, si dai
      add(lastFg, x[2], x[1]);
    }
    // "| on Y: N:1" (fg ile ile)
    for (const x of line.matchAll(new RegExp(`(?:^|[|,;(])\\s*on\\s+${C}\\s*(?::|→|=)\\s*${R}`, "g"))) add(lastFg, x[1], x[2]);
  }
  // R29 (Bakery A1): dai lisilotaja rangi ya nyuma — "accent `#C46210` (cta) contrast 7.8:1" (halisi 3.89:1).
  // Rangi ya nyuma = ya ukurasa (--bg / rangi iliyoitwa "nyuma"/"background").
  const bg = pageBg(vars, [...context, text].join("\n"));
  if (bg) {
    for (const line of String(text || "").split("\n")) {
      for (const x of line.matchAll(new RegExp(`${C}([^#\\n|]{0,48}?)${R}(?!\\s*on\\s+[\`#-])`, "g"))) {
        const between = x[2];
        if (/--[A-Za-z0-9_-]+|\bon\b|\bvs\.?\b|\bdhidi\b/i.test(between) || NEED.test(between) || NOTTEXT.test(between)) continue;
        const before = line.slice(Math.max(0, (x.index ?? 0) - 24), x.index ?? 0);
        if (NEED.test(before) || /\b(?:on|against|dhidi ya|juu ya)\s*`?$/i.test(before)) continue; // "on --ink: 4.5:1" = hiyo ni rangi ya NYUMA
        add(x[1], bg, x[3]);
      }
    }
  }
  // R29 (Bakery A3): dai baada ya CSS rule — "`.btn-wa { background: #25D366; color: #FFFFFF; … }` (Contrast ~4.6:1 …)"
  // (halisi 1.98:1), au rejea kwa selector tu — "`.btn-wa` accepted. Contrast ~4.6:1" (rule iko kwenye pendekezo la mwenzake).
  const rules = cssPairs([...context, text].join("\n"), vars);
  const own = String(text || "");
  for (const r of cssPairs(own, vars, true)) {
    const tail = own.slice(r.end, r.end + 140);
    const m = tail.match(new RegExp(R));
    if (m && !NOTTEXT.test(tail.slice(0, m.index ?? 0)) && !NEED.test(tail.slice(0, (m.index ?? 0) + 4))) add(r.fg, r.bg, m[1]);
    if (r.comment) add(r.fg, r.bg, r.comment);
  }
  for (const line of own.split("\n")) {
    if (/\{[^}]*\}/.test(line) || HEX.test(line)) continue; // rule/hex kwenye mstari huu = imeshughulikiwa juu
    const sels = [...line.matchAll(/`([.#][A-Za-z][\w-]*)`/g)].map((x) => x[1]);
    const claims = [...line.matchAll(new RegExp(R, "g"))];
    if (sels.length !== 1 || claims.length !== 1) continue;
    const r = rules.filter((x) => x.sel === sels[0]).pop();
    const before = line.slice(0, claims[0].index ?? 0);
    if (r && !NEED.test(before.slice(-30)) && !NOTTEXT.test(before.slice(before.indexOf(sels[0])))) add(r.fg, r.bg, claims[0][1]);
  }
  return out.slice(0, 12);
}

const NOTTEXT = /\b(?:border|outline|focus|icon|non-text|ring|frame|fremu)\b/i;
/** CSS rules zenye background + color (hex au var(--x)). `withTail` → pamoja na mwisho wa rule na dai ndani ya comment. */
function cssPairs(all: string, vars: Map<string, string>, withTail = false): { sel: string; fg: string; bg: string; end: number; comment?: string }[] {
  const out: { sel: string; fg: string; bg: string; end: number; comment?: string }[] = [];
  const V = "(#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\\b|var\\(\\s*(--[A-Za-z0-9_-]+)\\s*\\))";
  for (const x of all.matchAll(/([.#][A-Za-z][\w-]*(?:[\s>+~:.#-]+[\w-]+)*)\s*\{([^{}]{0,900})\}/g)) {
    const body = x[2];
    const bg = body.match(new RegExp(`background(?:-color)?\\s*:\\s*${V}`));
    const fg = body.match(new RegExp(`(?:^|[;{\\s])color\\s*:\\s*${V}`));
    if (!bg || !fg) continue;
    const ref = (m: RegExpMatchArray) => m[2] || m[1];
    const cm = body.match(new RegExp(`(?:^|[;{\\s])color\\s*:[^;]*;?\\s*\\/\\*[^*]*?${R}`));
    out.push({ sel: x[1].trim().split(/\s+/)[0], fg: ref(fg), bg: ref(bg), end: (x.index ?? 0) + x[0].length, comment: withTail && cm ? cm[1] : undefined });
  }
  return out.filter((r) => resolve(r.fg, vars) && resolve(r.bg, vars));
}

/** Maelekezo kwa owners (Kiingereza — mjadala wa Board ni kwa Kiingereza). */
export function contrastNote(hits: ContrastHit[], by: string): string {
  const lines = hits.slice(0, 8).map((h) => `- ${h.fg}${h.fg.startsWith("#") ? "" : ` (${h.fgHex})`} on ${h.bg}${h.bg.startsWith("#") ? "" : ` (${h.bgHex})`}: claimed ${h.claimed}:1 → ACTUAL ${h.actual.toFixed(2)}:1 (${h.actual >= 4.5 ? "passes AA" : h.actual >= 3 ? "AA large text only" : "fails AA"})`);
  return `CONTRAST CHECK (computed by code with the WCAG 2.x formula — authoritative, overrides any number written by an agent). ${by} wrote wrong contrast ratios:\n${lines.join("\n")}\nUse only these computed values. Never state a contrast ratio you have not computed; if unsure, write the colour pair without a ratio.`;
}

export function contrastSummary(hits: ContrastHit[]): string {
  return hits.slice(0, 4).map((h) => `${h.fgHex}/${h.bgHex} ${h.claimed}→${h.actual.toFixed(2)}`).join(" · ");
}

/** R39: swali la contrast/WCAG (mf. "has #00D4AA on #0A0F1A been verified for WCAG AA?") —
 *  MFUMO unajibu kwa hesabu (contrastRatio, WCAG 2.x) kabla agent hajibu kwa kinywa.
 *  Kosa la 6ac7d777: Optimus alirudisha swali la Ultron kama "I confirm … verified" bila
 *  tool/number yoyote (echo) — hesabu halisi ilikuwa 10.03:1. Sasa namba inamfikia
 *  anayejibu DIRECT kwenye prompt, na anatajwa kuitumia. Hakuna hex 2+ au hakuna
 *  neno la contrast/WCAG → mstari mtupu (havamii). */
export function contrastQuestionNote(text: string): string {
  const t = String(text || "");
  if (!/\b(contrast|wcag|apca|readab|legib)\b/i.test(t)) return "";
  const hexes = [...new Set((t.match(/#(?:[0-9a-f]{6}|[0-9a-f]{3})\b/gi) || [])
    .map((h) => (h.length === 4 ? `#${h[1]}${h[1]}${h[2]}${h[2]}${h[3]}${h[3]}` : h).toUpperCase()))].slice(0, 4);
  if (hexes.length < 2) return "";
  const lines: string[] = [];
  for (const fg of hexes) for (const bg of hexes) {
    if (fg === bg) continue;
    const r = contrastRatio(fg, bg);
    const verdict = r >= 7 ? "passes AA and AAA" : r >= 4.5 ? "passes AA" : r >= 3 ? "AA large text only — fails AA for normal text" : "fails AA";
    lines.push(`- ${fg} on ${bg} = ${r.toFixed(2)}:1 (${verdict})`);
  }
  return `\n[SYSTEM VERIFIED — WCAG 2.x contrast, computed by code (authoritative; overrides any number an agent writes)]:\n${lines.join("\n")}\nCite these computed numbers exactly when answering; do not invent or estimate your own ratio.\n`;
}
