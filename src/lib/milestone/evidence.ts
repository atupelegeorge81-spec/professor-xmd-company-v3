// TASK 19 (maelezo19) — Evidence: spec ya screenshots kutoka plan ya milestone (routes × viewports × states + Start Command).
// Script ya sandbox: cu/xmd-evidence.mjs (harness inaipakia .xmd/tools/ na kuiendesha). Hapa ni data safi (bila I/O).
import { EVIDENCE_PORT, PLAN_VIEWPORTS } from "./plan";
import { cmdLine } from "./startpack";
import type { ReviewMode } from "./types";

export type EvidenceAction = { do: "click" | "hover"; selector: string };
export type EvidenceState = { name: string; actions: EvidenceAction[] };
export type EvidenceRoute = { route: string; viewports: string[]; states: EvidenceState[] };
export interface EvidenceSpec {
  startCommand: string;
  port: number;
  routes: EvidenceRoute[];
  /** makosa ya kusoma plan (mf. action isiyojulikana) — yanaingia kwenye manifest kama errors */
  problems: string[];
}
/** Config inayoandikwa `.xmd/tools/evidence-<Mk>-R<n>.json` (script inaisoma). */
export interface EvidenceRunConfig extends Omit<EvidenceSpec, "problems"> {
  milestoneId: string;
  round: number;
  cwd: string;
  outDir: string;
  startTimeoutMs: number;
  base?: string;
}

export const EVIDENCE_TOOLS_DIR = ".xmd/tools";
export const EVIDENCE_SCRIPT = `${EVIDENCE_TOOLS_DIR}/xmd-evidence.mjs`;
export const evidenceDir = (milestoneId: string, round: number) => `.xmd/evidence/${milestoneId}/R${round}`;
export const evidenceConfigPath = (milestoneId: string, round: number) => `${EVIDENCE_TOOLS_DIR}/evidence-${milestoneId}-R${round}.json`;
export const evidenceKey = (milestoneId: string, round: number) => `evidence:${milestoneId}:R${round}`;

/** visual/mixed tu wanahitaji screenshots (maelezo19 Goal). */
export const needsScreenshots = (mode: ReviewMode | string | undefined) => mode === "visual" || mode === "mixed";

const LINE_RE = /^\s*[-*]?\s*route\s*:\s*`?(\/[^\s`·|;,]*)`?\s*[·|;,]\s*states?\s*:\s*([^·|;]+?)\s*[·|;]\s*viewports?\s*:\s*(.+)$/gim;

/** Gawa kwa koma zilizo NJE ya mabano [] (selectors zinaweza kuwa na koma ndani ya action). */
function splitTop(s: string): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "[") depth++;
    if (ch === "]") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim()).filter(Boolean);
}

/** "menu-open[click #menu-toggle > hover .card]" → {name, actions}; makosa → problems. */
export function parseEvidenceState(raw: string, problems: string[] = []): EvidenceState | null {
  const m = /^([^[\]]+?)\s*(?:\[(.*)\])?$/.exec(raw.trim());
  if (!m) { problems.push(`bad state "${raw}"`); return null; }
  const name = m[1].trim().replace(/`/g, "");
  const actions: EvidenceAction[] = [];
  for (const part of (m[2] || "").split(">").map((x) => x.trim()).filter(Boolean)) {
    const a = /^(click|hover)\s+(.+)$/i.exec(part);
    if (!a) { problems.push(`state "${name}": unknown action "${part}" (use click <selector> or hover <selector>)`); continue; }
    actions.push({ do: a[1].toLowerCase() as EvidenceAction["do"], selector: a[2].trim().replace(/^`|`$/g, "") });
  }
  return { name, actions };
}

/** Soma "**Screenshots:**" (mistari ya route) + `Start Command:` kutoka plan ya milestone. */
export function planEvidenceSpec(planMarkdown: string): EvidenceSpec {
  const md = planMarkdown || "";
  const problems: string[] = [];
  const routes: EvidenceRoute[] = [];
  for (const r of md.matchAll(LINE_RE)) {
    const viewports = (r[3].match(/\d{3,4}\s*x\s*\d{3,4}/gi) || []).map((v) => v.replace(/\s+/g, "").toLowerCase());
    const states = splitTop(r[2]).map((s) => parseEvidenceState(s, problems)).filter((s): s is EvidenceState => !!s && s.name !== "default");
    const prev = routes.find((x) => x.route === r[1]);
    if (prev) { prev.states.push(...states); continue; }
    routes.push({ route: r[1], viewports: viewports.length ? viewports : [...PLAN_VIEWPORTS], states });
  }
  return { startCommand: cmdLine(md, "Start Command"), port: EVIDENCE_PORT, routes, problems };
}

/** Config ya script kwa raundi moja (local mode; `base` = deployed mode). */
export function evidenceRunConfig(spec: EvidenceSpec, milestoneId: string, round: number, opts: { cwd?: string; base?: string; startTimeoutMs?: number } = {}): EvidenceRunConfig {
  return {
    milestoneId, round, cwd: opts.cwd || "/home/user/ws", outDir: evidenceDir(milestoneId, round),
    startCommand: spec.startCommand, port: spec.port, routes: spec.routes, startTimeoutMs: opts.startTimeoutMs ?? 120_000,
    ...(opts.base ? { base: opts.base } : {}),
  };
}
