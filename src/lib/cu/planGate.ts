// src/lib/cu/planGate.ts — TASK-4 (maelezo4): Mpango Kazi ambao guard/muundo wake umeshindwa
// HAUTEKELEZWI na XMD Computer.
//
// Status za plan (project_plans.status) zinazozuia:
//   guard_failed      — Data Guard bado inaona tofauti za DATA RASMI baada ya pass moja ya marekebisho
//                       (inazuia DAIMA, bila kujali asm.problems)
//   structure_failed  — `asm.problems` ina tatizo LINALOZUIA (tazama hapa chini)
//
// Uamuzi wa CEO (2026-10-17, chaguo A + fail-safe):
//   • ONYO (warning) ni WHITELIST ya ujumbe unaojulikana TU:
//       S3_LEDGER_FALLBACK  "§3 imetumia fallback ya Ledger (brief haina "MASHARTI:") — mistari N"
//       STEPS_BELOW_MIN     "hatua N < ndogo ya M"  (N ≥ 1)
//   • Kila ujumbe mwingine — ukiwemo usiojulikana — UNAZUIA (default = block).
//   • Hatua 0 / sehemu isiyokuwepo zinazuia.
//   • Warnings huhifadhiwa kwenye plan, huonekana kwenye chip ("⚠️ warnings") run inapoanza, na
//     huingia kwenye ripoti ya mwisho.

import { PLAN_SECTION_DEFS, extractPlanSections, parsePlanSteps } from "../board/workPlan";

export const PLAN_FAILING_STATUSES: ReadonlySet<string> = new Set(["guard_failed", "structure_failed"]);

export type PlanProblemCode =
  | "S3_LEDGER_FALLBACK" | "STEPS_BELOW_MIN"                      // warnings (whitelist)
  | "SECTION_MISSING" | "NO_STEPS" | "STEPS_ABOVE_MAX" | "UNKNOWN"; // blockers
export interface PlanProblem { code: PlanProblemCode; severity: "warning" | "block"; message: string }

/** Whitelist ya ONYO — ujumbe KAMILI (anchored) tu. */
const WARNING_RULES: { code: PlanProblemCode; re: RegExp; ok?: (m: RegExpMatchArray) => boolean }[] = [
  { code: "S3_LEDGER_FALLBACK", re: /^§3 imetumia fallback ya Ledger \(brief haina "MASHARTI:"\) — mistari \d+$/ },
  { code: "STEPS_BELOW_MIN", re: /^hatua (\d+) < ndogo ya \d+$/, ok: (m) => Number(m[1]) >= 1 },
];

/** Uainishaji wa ujumbe mmoja wa `asm.problems` (fail-safe: usiojulikana = block). */
export function classifyPlanProblem(message: string): PlanProblem {
  const msg = String(message || "").trim();
  for (const r of WARNING_RULES) {
    const m = msg.match(r.re);
    if (m && (!r.ok || r.ok(m))) return { code: r.code, severity: "warning", message: msg };
  }
  const code: PlanProblemCode =
    /^sehemu (?:ya )?\d+ .*haipo$/.test(msg) ? "SECTION_MISSING"
      : /haina '### Step/.test(msg) || /^hatua 0\b/.test(msg) ? "NO_STEPS"
        : /^hatua \d+ > kubwa ya \d+$/.test(msg) ? "STEPS_ABOVE_MAX"
          : "UNKNOWN";
  return { code, severity: "block", message: msg };
}

export const blockingPlanProblems = (problems: readonly string[] | null | undefined): string[] =>
  (problems || []).map(classifyPlanProblem).filter((p) => p.severity === "block").map((p) => p.message);

export const planWarningsOf = (problems: readonly string[] | null | undefined): string[] =>
  (problems || []).map(classifyPlanProblem).filter((p) => p.severity === "warning").map((p) => p.message);

/** Status ya kuhifadhi: guard_failed (daima, kwanza) > structure_failed > active. */
export function planStatusOf(guardHits: number, problems: readonly string[] | null | undefined): "active" | "guard_failed" | "structure_failed" {
  if (guardHits > 0) return "guard_failed";
  return blockingPlanProblems(problems).length ? "structure_failed" : "active";
}

export interface PlanGateInput {
  status?: string | null;
  md?: string | null;
  /** `asm.problems` ikiwa zinapatikana (wakati wa kuunganisha) */
  problems?: readonly string[] | null;
  /** warnings zilizohifadhiwa kwenye plan (project_plans.warnings) */
  warnings?: readonly string[] | null;
}

export interface PlanGateResult { ok: boolean; reasons: string[]; warnings: string[] }

/** Je, Mpango Kazi unaweza kutekelezwa na Computer? Pure — hakuna I/O. */
export function isPlanExecutable(plan: PlanGateInput): PlanGateResult {
  const reasons: string[] = [];
  const push = (r: string) => { if (!reasons.includes(r)) reasons.push(r); };
  const status = String(plan.status || "").trim();
  if (status === "guard_failed") push("status guard_failed — Data Guard bado inaona tofauti za DATA RASMI");
  else if (status === "structure_failed") push("status structure_failed — muundo wa Mpango Kazi haujakamilika");
  for (const p of blockingPlanProblems(plan.problems)) push(p);

  const md = String(plan.md || "");
  if (!md.trim()) {
    push("Mpango Kazi ni mtupu");
  } else {
    // ukaguzi wa muundo kutoka maandishi yaliyohifadhiwa (plans za zamani hazina asm.problems)
    const sections = extractPlanSections(md);
    for (const [n, , name] of PLAN_SECTION_DEFS) if (!sections[n]) push(`sehemu ${n} (${name}) haipo`);
    if (sections[6] && parsePlanSteps(sections[6]).length === 0) push("sehemu ya 6 haina '### Step N — Title' hata moja");
  }
  const warnings = [...new Set([...(plan.warnings || []), ...planWarningsOf(plan.problems)].map(String))];
  return { ok: reasons.length === 0, reasons, warnings };
}

/* ------------------------------------------------------------------ TEST HOOK (T3 pekee) */
/** TASK-6: alama ya majaribio `xmdtest-plansteps-max=<N>` — kikomo kidogo cha LANGO pekee (prompt ya Optimus haibadiliki).
 *  Inert kabisa bila XMD_TEST_HOOKS=1 + alama kwenye project. */
export function planStepsMaxFor(project: string | null | undefined, fallback: number, env: Record<string, string | undefined> = process.env): number {
  if (env.XMD_TEST_HOOKS !== "1") return fallback;
  const m = String(project || "").match(/xmdtest-plansteps-max=(\d+)/);
  return m && Number(m[1]) > 0 ? Number(m[1]) : fallback;
}

/** Alama ya brief ya majaribio — sabotage inafanya kazi TU ikiwa XMD_TEST_HOOKS=1 NA project ina alama hii. */
export const PLANGUARD_SABOTAGE_MARK = "xmdtest-planguard-sabotage";

/** Test-only (maelezo4 T3): ongeza bei isiyo rasmi kwenye code block ya plan ili Data Guard ishindwe.
 *  Inert kabisa bila XMD_TEST_HOOKS=1 + alama kwenye project (sessions halisi haziguswi). */
export function maybeSabotagePlan(md: string, project: string | null | undefined, env: Record<string, string | undefined> = process.env): string {
  if (env.XMD_TEST_HOOKS !== "1" || !String(project || "").includes(PLANGUARD_SABOTAGE_MARK)) return md;
  return `${md}\n\n\`\`\`js\n// ${PLANGUARD_SABOTAGE_MARK} (XMD_TEST_HOOKS): bei isiyo rasmi kwa makusudi\nconst SERVICES = [{ name: "Kunyoa", price: "TSh 999,999" }];\n\`\`\`\n`;
}
