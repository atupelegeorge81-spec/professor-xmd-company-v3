// TASK-6 (CEO): plan yenye hatua > kikomo → ya zamani inafutwa, Optimus anaandika upya Kipande 2 (≤ kikomo).
import { describe, expect, it } from "vitest";
import {
  assemblePlanDocument, replacePlanStepsPart, planStepsRewriteInstruction, PLAN_STEPS_REWRITES, PLAN_STEPS_MAX,
} from "./workPlan";
import { planStepsMaxFor, planStatusOf, blockingPlanProblems } from "../cu/planGate";

const steps = (n: number) =>
  Array.from({ length: n }, (_, i) => `### Step ${i + 1} — Do thing ${i + 1}\n- **Goal:** g\n- **Verify:** v`).join("\n\n");
const part1 = "## 1. Objective & Deliverable\nBuild it.\n\n## 4. Tech Stack & Design Tokens\nHTML.";
const part2 = (n: number, tag = "old") =>
  `## 5. File Structure\n${tag}-files\n\n## 6. Work Steps\n${steps(n)}\n\n## 7. QA Checklist\n- [ ] ${tag}-qa\n\n## 8. Agent Rules\n${tag}-rules`;
const asm = (texts: string[], maxSteps?: number) =>
  assemblePlanDocument({ partTexts: texts, title: "t", sessionId: "s", date: "d", maxSteps });

describe("TASK-6 — hatua > kikomo", () => {
  it("kikomo cha default bado ni 60; hatua 61 → STEPS_ABOVE_MAX inazuia (structure_failed)", () => {
    expect(PLAN_STEPS_MAX).toBe(60);
    const a = asm([part1, part2(61)]);
    expect(a.steps.length).toBe(61);
    expect(a.problems).toContain("hatua 61 > kubwa ya 60");
    expect(planStatusOf(0, a.problems)).toBe("structure_failed");
    expect(asm([part1, part2(60)]).problems.some((p) => p.includes("> kubwa"))).toBe(false);
  });

  it("maxSteps inaheshimiwa (kwa hook ya majaribio)", () => {
    expect(asm([part1, part2(9)], 5).problems).toContain("hatua 9 > kubwa ya 5");
  });

  it("replacePlanStepsPart: hatua NDEFU za zamani hazishindi (ya zamani inafutwa, mpya inawekwa)", () => {
    const texts = [part1, part2(70)];
    // bila kufuta: assemble huchagua sehemu ndefu → hatua 70 zingebaki
    expect(asm([...texts, part2(20, "new")]).steps.length).toBe(70);
    const replaced = replacePlanStepsPart(texts, part2(20, "new"));
    expect(replaced.length).toBe(2);
    expect(replaced[0]).toBe(part1);
    const a = asm(replaced);
    expect(a.steps.length).toBe(20);
    expect(a.problems.filter((p) => !p.startsWith("§3"))).toEqual([]);
    expect(a.markdown).toContain("new-files");
    expect(a.markdown).not.toContain("old-files");
  });

  it("replacePlanStepsPart: sehemu 5/7/8 za zamani zinabaki kama akiba TU zikikosekana kwenye mpya", () => {
    const onlySteps = `## 6. Work Steps\n${steps(12)}`;
    const a = asm(replacePlanStepsPart([part1, part2(80)], onlySteps));
    expect(a.steps.length).toBe(12);
    expect(a.markdown).toContain("old-files");
    expect(a.markdown).toContain("old-rules");
  });

  it("replacePlanStepsPart: maandishi ya marekebisho yenye sehemu 6 nayo yanaondolewa", () => {
    const fix = `## 6. Work Steps\n${steps(75)}`;
    expect(asm(replacePlanStepsPart([part1, part2(70), fix], part2(30, "new"))).steps.length).toBe(30);
  });

  it("agizo la kuandika upya linataja idadi iliyopatikana, kikomo na kwamba ya zamani imefutwa", () => {
    const t = planStepsRewriteInstruction(74, 60);
    expect(t).toContain("74 work steps");
    expect(t).toContain("AT MOST 60");
    expect(t).toContain("DISCARDED");
    expect(PLAN_STEPS_REWRITES).toBe(2);
  });

  it("majaribio yakiisha bado > kikomo → bado inazuia (fail-safe)", () => {
    const a = asm(replacePlanStepsPart([part1, part2(70)], part2(65, "new")));
    expect(blockingPlanProblems(a.problems)).toContain("hatua 65 > kubwa ya 60");
  });

  it("planStepsMaxFor: inert bila XMD_TEST_HOOKS=1 au bila alama", () => {
    const p = "xmdtest-plansteps-max=5 brief";
    expect(planStepsMaxFor(p, 60, {})).toBe(60);
    expect(planStepsMaxFor(p, 60, { XMD_TEST_HOOKS: "0" })).toBe(60);
    expect(planStepsMaxFor("brief halisi", 60, { XMD_TEST_HOOKS: "1" })).toBe(60);
    expect(planStepsMaxFor(p, 60, { XMD_TEST_HOOKS: "1" })).toBe(5);
  });
});
