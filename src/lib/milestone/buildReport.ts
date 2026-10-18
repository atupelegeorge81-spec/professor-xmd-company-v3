// TASK 17: Build Report contract — XMD Computer anaandika `.xmd/reports/<Mk>-build-report.md` mwisho wa awamu.
// Harness inakagua MUUNDO tu (headings 8 kwa mpangilio, sehemu zisizo tupu, amri zenye exit code, paths halisi)
// na kulinganisha sehemu ya 2 na `git diff` — haimpi Computer alama (spec: "the harness measures").

/** Headings 8 (bila "## "), kwa mpangilio huu HASA. Lazima ziwe sawa na BUILD_REPORT_HEADINGS ya cu/bridge.py. */
export const BUILD_REPORT_HEADINGS = [
  "1 Summary",
  "2 Files created or changed",
  "3 Commands run and results",
  "4 Tests run",
  "5 Decisions and deviations from the plan",
  "6 Security notes",
  "7 Known problems / technical debt",
  "8 Risks for the next milestone",
] as const;

export const buildReportPath = (milestoneId: string) => `.xmd/reports/${milestoneId}-build-report.md`;

/** Ripoti kubwa kuliko hii huenda Supabase storage (rekodi ya milestone inabaki ndogo). */
export const BUILD_REPORT_INLINE_MAX = 16_000;

export interface BuildReportCommand { command: string; exitCode: number; line: string }

export interface ParsedBuildReport {
  ok: boolean;
  /** heading (bila "## ") → maudhui (trimmed) — zile zilizopatikana tu */
  sections: Record<string, string>;
  errors: string[];
  /** sehemu ya 2: paths zilizotajwa (relative kwa workspace) */
  paths: string[];
  /** sehemu ya 3: mistari yenye exit code */
  commands: BuildReportCommand[];
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim();
const WS_PREFIX = /^(?:\/home\/user\/ws\/|\.\/)/;
const EXIT_RE = /\bexit(?:[ _-]?code)?\s*(?:[:=]|is)?\s*`?(-?\d{1,3})\b/i;
const ITEM_RE = /^\s*(?:[-*+]|\d+[.)])\s+(.*)$/;
const PATH_RE = /^[\w@.\-/[\]()+]+$/;

/** Path ya sehemu ya 2 kutoka mstari mmoja wa orodha (backticks kwanza, la sivyo neno la kwanza). */
function pathOf(line: string): string | null {
  const m = ITEM_RE.exec(line);
  if (!m) return null;
  const tick = /`([^`]+)`/.exec(m[1]);
  let p = (tick ? tick[1] : m[1].split(/\s+/)[0]).trim().replace(/[,:;]+$/, "").replace(WS_PREFIX, "");
  if (!p || !PATH_RE.test(p)) return null;
  if (!p.includes("/") && !/\.[A-Za-z0-9]{1,10}$/.test(p) && !/^[A-Z][A-Za-z]*file$/.test(p)) return null; // README.md, src/x, Dockerfile
  return p;
}

export function normalizeReportPath(p: string): string {
  return p.trim().replace(WS_PREFIX, "").replace(/\/+$/, "");
}

/** Kagua muundo wa Build Report. ok = hakuna kosa. */
export function parseBuildReport(md: string): ParsedBuildReport {
  const errors: string[] = [];
  const lines = String(md || "").replace(/\r\n?/g, "\n").split("\n");
  const found: Array<{ heading: string; line: number }> = [];
  let inFence = false;
  lines.forEach((l, i) => {
    if (/^\s*```/.test(l)) inFence = !inFence;
    if (inFence) return;
    const m = /^##\s+(?!#)(.+?)\s*#*\s*$/.exec(l);
    if (m) found.push({ heading: norm(m[1]), line: i });
  });

  const sections: Record<string, string> = {};
  const expected = BUILD_REPORT_HEADINGS.map(norm);
  const positions: number[] = [];
  for (const h of expected) {
    const idx = found.findIndex((f) => f.heading === h);
    if (idx < 0) { errors.push(`missing heading "## ${h}"`); continue; }
    positions.push(idx);
    const end = idx + 1 < found.length ? found[idx + 1].line : lines.length;
    sections[h] = lines.slice(found[idx].line + 1, end).join("\n").trim();
  }
  // mpangilio: headings zilizopatikana lazima zifuate mpangilio wa spec
  const present = expected.filter((h) => h in sections);
  for (let k = 1; k < present.length; k++) {
    const a = found.findIndex((f) => f.heading === present[k - 1]);
    const b = found.findIndex((f) => f.heading === present[k]);
    if (b < a) errors.push(`heading out of order: "## ${present[k]}" appears before "## ${present[k - 1]}"`);
  }
  for (const h of present) if (!sections[h].replace(/[-*_`\s]/g, "")) errors.push(`empty section "## ${h}"`);

  const commands: BuildReportCommand[] = [];
  const s3 = sections[expected[2]];
  if (s3 !== undefined) {
    for (const line of s3.split("\n")) {
      const e = EXIT_RE.exec(line);
      if (!e) continue;
      const tick = /`([^`]+)`/.exec(line);
      commands.push({ command: (tick ? tick[1] : line.replace(ITEM_RE, "$1").split(/\s+[—–-]\s+/)[0]).trim(), exitCode: Number(e[1]), line: line.trim() });
    }
    if (sections[expected[2]] && !commands.length) errors.push(`section "## ${expected[2]}" has no command line with an exit code`);
  }

  const paths: string[] = [];
  const s2 = sections[expected[1]];
  if (s2 !== undefined) {
    for (const line of s2.split("\n")) {
      const p = pathOf(line);
      if (p && !paths.includes(p)) paths.push(p);
    }
    if (sections[expected[1]] && !paths.length) errors.push(`section "## ${expected[1]}" lists no file paths`);
  }

  return { ok: errors.length === 0, sections, errors, paths, commands };
}

export interface BuildReportCrossCheck {
  /** zimetajwa kwenye ripoti lakini HAZIPO kwenye git diff (zimebuniwa / hazikubadilika) */
  fake: string[];
  /** zimebadilika kwenye git lakini ripoti haikuzitaja (.xmd/ ya harness haihesabiwi) */
  unreported: string[];
}

/** Linganisha paths za sehemu ya 2 na `git diff --name-only` ya awamu hii. Directory iliyotajwa inakubali faili zilizo chini yake. */
export function crossCheckBuildReport(reportPaths: string[], changed: string[]): BuildReportCrossCheck {
  const ch = changed.map(normalizeReportPath).filter(Boolean);
  const rp = reportPaths.map(normalizeReportPath).filter(Boolean);
  const covers = (r: string, c: string) => c === r || c.startsWith(`${r}/`);
  return {
    fake: rp.filter((r) => !ch.some((c) => covers(r, c))),
    unreported: ch.filter((c) => !c.startsWith(".xmd/") && !rp.some((r) => covers(r, c))),
  };
}
