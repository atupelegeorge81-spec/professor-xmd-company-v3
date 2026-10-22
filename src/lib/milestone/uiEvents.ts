// TASK-34 (MISSION TWO) — matukio ya UI ya milestone mode (engine → Board Room).
//
// Engine inaandika chip ILIYOFICHWA moja kwa kila tukio: `__XMD_MSUI__:{json}` — inahifadhiwa kwenye items (replay/refresh)
// NA inatumwa live kama `system` (njia MOJA kwa live na replay). Adapter (lib/board/adapter.ts) inaigeuza kuwa badges
// (milestone · Computer · reviewers), card ya Milestones (progress), card ya marekebisho ya Optimus na card ya ripoti ya mwisho.
// Chip hizi HAZIONEKANI kama chips kwenye chat wala export.
import type { ChangeOrder, Milestone } from "./types";
import type { DefectFinding, Findings } from "./review";
import type { VerifyFindings } from "./verify";

export const MS_UI_PREFIX = "__XMD_MSUI__:";

export interface MsUiMilestone { id: string; title: string; from: number; to: number; roster: string[]; reviewMode: string; phase?: string }
export interface MsUiCo { id: string; defectIds: string[]; decisionIds?: string[]; priority: number; attempt: number; mode: string; files: string[]; route?: string; selector?: string; current: string; desired: string; acceptance: string[] }

export type MsUiEvent =
  /** ramani ya milestones (baada ya ajenda) */
  | { t: "map"; milestones: MsUiMilestone[]; fallback?: boolean }
  /** hali ya milestone (kila status/round inapobadilika — state:Mk) */
  | { t: "st"; id: string; s: string; r: number }
  /** XMD Computer inaingia: r=0 build ya kwanza · r≥1 raundi ya marekebisho (cos = maneno ya Optimus ya raundi hiyo) */
  | { t: "cu"; id: string; r: number; cos?: MsUiCo[] }
  /** reviewers wanaanza: r=0 ukaguzi huru (R0) · r≥1 uthibitisho */
  | { t: "rev"; id: string; r: number; who: string[] }
  /** ripoti ya mwisho kwa CEO: `final0` = Optimus anaanza kuandika · `final` = hati kamili (code + Optimus) */
  | { t: "final0" }
  | { t: "final"; md: string; line: string; complete: boolean };

export const msUiText = (e: MsUiEvent): string => MS_UI_PREFIX + JSON.stringify(e);
export function parseMsUi(text: string): MsUiEvent | null {
  if (!text.startsWith(MS_UI_PREFIX)) return null;
  try {
    const v = JSON.parse(text.slice(MS_UI_PREFIX.length));
    return v && typeof v.t === "string" ? (v as MsUiEvent) : null;
  } catch { return null; }
}

export const msUiMilestones = (ms: Milestone[]): MsUiMilestone[] =>
  ms.map((m) => ({ id: m.id, title: m.title, from: m.agendas.from, to: m.agendas.to, roster: m.roster || [], reviewMode: m.reviewMode, phase: m.phase }));

const clip = (s: unknown, n: number) => { const t = String(s ?? "").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
/** check ya acceptance (object) → mstari mmoja unaosomeka: `contrast_min · selector=nav a · min=4.5` */
const checkLine = (a: unknown): string => {
  if (typeof a === "string") return clip(a, 300);
  const { type, kind, ...rest } = (a || {}) as Record<string, unknown>;
  const head = String(type || kind || "check");
  const body = Object.entries(rest).filter(([, v]) => v !== undefined && v !== null && v !== "").map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(" · ");
  return clip(body ? `${head} · ${body}` : head, 300);
};
export const msUiCo = (c: ChangeOrder): MsUiCo => ({
  id: c.id, defectIds: c.defectIds || [], decisionIds: c.decisionIds?.length ? c.decisionIds : undefined, priority: c.priority, attempt: c.attempt, mode: c.mode,
  files: c.location?.files || [], route: c.location?.route || undefined, selector: c.location?.selector || undefined,
  current: clip(c.current, 1500), desired: clip(c.desired, 2500), acceptance: (c.acceptance || []).map(checkLine).slice(0, 12),
});

/* ------------------------------------------------------------------ messages za reviewers (kamili, kama zilivyo)
 * Majibu ya reviewers ni JSON (findings) — yanaonyeshwa kwenye chat kama ujumbe wa agent (avatar + maandishi), KILA sehemu, bila kukatwa. */
const defectLines = (d: DefectFinding, n: number) => [
  `${n}. **${d.title}** — ${d.severity} · ${d.area} · ${d.kind}${d.decisionRef ? ` · violates ${d.decisionRef}` : ""}`,
  `   - Expected: ${d.expected}`,
  `   - Actual: ${d.actual}`,
  ...(d.evidence?.length ? [`   - Evidence: ${d.evidence.join(", ")}`] : []),
];

export function renderR0Findings(f: Findings | null | undefined, label: string): string {
  if (!f) return `**${label} · ukaguzi huru (R0)** — hakuna findings zilizopatikana (reviewer alishindwa kujibu kwa muundo sahihi).`;
  const L: string[] = [`**${label} · ukaguzi huru (R0)** — defects ${f.defects.length} · mapendekezo ${f.proposals.length}`, ""];
  if (f.screenshots?.length) { L.push("**Ninachoona kwenye screenshots**"); for (const s of f.screenshots) L.push(`- \`${s.id}\` ${s.description}`); L.push(""); }
  L.push("**Defects**");
  if (f.defects.length) f.defects.forEach((d, i) => L.push(...defectLines(d, i + 1))); else L.push("- hakuna");
  L.push("", "**Mapendekezo**");
  if (f.proposals.length) f.proposals.forEach((p, i) => { L.push(`${i + 1}. **${p.title}** — ${p.detail}`); if (p.rationale) L.push(`   - Sababu: ${p.rationale}`); if (p.evidence?.length) L.push(`   - Evidence: ${p.evidence.join(", ")}`); });
  else L.push("- hakuna");
  if (f.notes?.trim()) L.push("", "**Maelezo**", f.notes.trim());
  return L.join("\n");
}

export function renderVerifyFindings(f: VerifyFindings | null | undefined, label: string, round: number): string {
  if (!f) return `**${label} · uthibitisho R${round}** — hakuna jibu sahihi (verdict haikupatikana).`;
  const L: string[] = [`**${label} · uthibitisho R${round}** — ${f.cos.map((c) => `${c.orderId} ${c.verdict}`).join(" · ") || "hakuna CO"}`, ""];
  for (const c of f.cos) {
    L.push(`- **${c.orderId} — ${c.verdict}**: ${c.note || "(hakuna maelezo)"}`);
    if (c.evidence?.length) L.push(`  - Evidence: ${c.evidence.join(", ")}`);
  }
  if (f.regressions?.length) { L.push("", "**Regressions**"); f.regressions.forEach((d, i) => L.push(...defectLines(d, i + 1))); }
  if (f.newDefects?.length) { L.push("", "**Defects mpya**"); f.newDefects.forEach((d, i) => L.push(...defectLines(d, i + 1))); }
  if (f.requestDiscussion?.reason) L.push("", `**Naomba mjadala wa timu:** ${f.requestDiscussion.reason}`);
  if (f.notes?.trim()) L.push("", "**Maelezo**", f.notes.trim());
  return L.join("\n");
}
