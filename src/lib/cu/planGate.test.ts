// TASK-4 (maelezo4) — T1 (pure table) + T2 (pipeline halisi: factSheet.ts + workPlan.ts + dataGuard.ts).
import { describe, expect, it } from "vitest";
import {
  blockingPlanProblems, classifyPlanProblem, isPlanExecutable, maybeSabotagePlan,
  planStatusOf, planWarningsOf, PLANGUARD_SABOTAGE_MARK,
} from "./planGate";
import { assemblePlanDocument } from "../board/workPlan";
import { extractFactSheet } from "../board/factSheet";
import { guardText } from "../board/dataGuard";

const steps = (n: number) => Array.from({ length: n }, (_, i) => `### Step ${i + 1} — Do thing ${i + 1}\nRun \`ls\` and save evidence.`).join("\n\n");
const part1 = (nSteps = 9) => `## 1. Objective & Deliverable
Build the xmdtest barber page.

## 4. Tech Stack & Design Tokens
HTML + CSS.

## 5. File Structure
- index.html

## 6. Work Steps
${steps(nSteps)}`;
const part2 = `## 7. QA Checklist
- [ ] Page loads

## 8. Agent Rules
- Never invent prices.`;

const BRIEF = `xmdtest-planguard — ukurasa mdogo wa kinyozi.
DATA RASMI:
- Jina: xmdtest Kinyozi
| Huduma | Bei |
|---|---|
| Kunyoa | TSh 5,000 |
| Kuosha | TSh 3,000 |
MASHARTI:
- Usibuni bei mpya.`;

const asmOf = (parts: string[], facts = extractFactSheet(BRIEF)) =>
  assemblePlanDocument({ partTexts: parts, title: "xmdtest", sessionId: "xmdtest-s", date: "2026-10-17", facts });

describe("TASK-4 T1 — isPlanExecutable (table)", () => {
  const okMd = asmOf([part1(), part2]).markdown;
  const cases: { name: string; input: Parameters<typeof isPlanExecutable>[0]; ok: boolean; reason?: RegExp }[] = [
    { name: "plan nzima, active", input: { status: "active", md: okMd }, ok: true },
    { name: "guard_failed inazuia daima (hata md nzima, bila problems)", input: { status: "guard_failed", md: okMd, problems: [] }, ok: false, reason: /guard_failed/ },
    { name: "structure_failed status", input: { status: "structure_failed", md: okMd }, ok: false, reason: /structure_failed/ },
    { name: "tatizo la muundo (sehemu haipo) kwenye problems", input: { status: "active", md: okMd, problems: ["sehemu 7 (QA Checklist) haipo"] }, ok: false, reason: /sehemu 7/ },
    { name: "sehemu haipo kwenye md (plan iliyohifadhiwa)", input: { status: "active", md: okMd.replace(/## 7\. QA Checklist[\s\S]*?(?=## 8\.)/, "") }, ok: false, reason: /sehemu 7 \(QA Checklist\) haipo/ },
    { name: "§6 bila hatua (0) inazuia", input: { status: "active", md: okMd.replace(/### Step \d+ — /g, "- ") }, ok: false, reason: /haina '### Step/ },
    { name: "tatizo lisilojulikana linazuia (fail-safe)", input: { status: "active", md: okMd, problems: ["kitu kipya kabisa kimeharibika"] }, ok: false, reason: /kitu kipya/ },
    { name: "hatua > max inazuia (si kwenye whitelist)", input: { status: "active", md: okMd, problems: ["hatua 75 > kubwa ya 60"] }, ok: false, reason: /75 > kubwa/ },
    { name: "§3 fallback = onyo tu", input: { status: "active", md: okMd, problems: ['§3 imetumia fallback ya Ledger (brief haina "MASHARTI:") — mistari 4'] }, ok: true },
    { name: "hatua 3 < 8 = onyo tu", input: { status: "active", md: okMd, problems: ["hatua 3 < ndogo ya 8"] }, ok: true },
    { name: "plan tupu", input: { status: "active", md: "" }, ok: false, reason: /mtupu/ },
  ];
  for (const c of cases) {
    it(c.name, () => {
      const r = isPlanExecutable(c.input);
      expect(r.ok).toBe(c.ok);
      if (c.reason) expect(r.reasons.join(" | ")).toMatch(c.reason);
      if (c.ok) expect(r.reasons).toEqual([]);
    });
  }

  it("warnings zinarudishwa (zilizohifadhiwa + za problems), hazizuii", () => {
    const r = isPlanExecutable({ status: "active", md: okMd, warnings: ["hatua 3 < ndogo ya 8"], problems: ['§3 imetumia fallback ya Ledger (brief haina "MASHARTI:") — mistari 2'] });
    expect(r.ok).toBe(true);
    expect(r.warnings).toHaveLength(2);
  });

  it("classify: whitelist kali (ujumbe kamili) — tofauti ndogo = block", () => {
    expect(classifyPlanProblem("hatua 3 < ndogo ya 8").severity).toBe("warning");
    expect(classifyPlanProblem("hatua 0 < ndogo ya 8")).toMatchObject({ severity: "block", code: "NO_STEPS" });
    expect(classifyPlanProblem("hatua 3 < ndogo ya 8 (na zaidi)").severity).toBe("block");
    expect(classifyPlanProblem('§3 imetumia fallback ya Ledger (brief haina "MASHARTI:") — mistari 12').code).toBe("S3_LEDGER_FALLBACK");
    expect(classifyPlanProblem("sehemu ya 6 (Work Steps) haipo").code).toBe("SECTION_MISSING");
    expect(classifyPlanProblem("sehemu ya 6 haina '### Step N — Title' hata moja").code).toBe("NO_STEPS");
    expect(classifyPlanProblem("x").code).toBe("UNKNOWN");
  });

  it("planStatusOf: guard_failed kwanza; warnings peke yake = active", () => {
    expect(planStatusOf(2, [])).toBe("guard_failed");
    expect(planStatusOf(1, ["hatua 3 < ndogo ya 8"])).toBe("guard_failed");
    expect(planStatusOf(0, ["sehemu 8 (Agent Rules) haipo"])).toBe("structure_failed");
    expect(planStatusOf(0, ["hatua 3 < ndogo ya 8"])).toBe("active");
    expect(planWarningsOf(["hatua 3 < ndogo ya 8", "sehemu 8 (Agent Rules) haipo"])).toEqual(["hatua 3 < ndogo ya 8"]);
    expect(blockingPlanProblems(["hatua 3 < ndogo ya 8", "sehemu 8 (Agent Rules) haipo"])).toEqual(["sehemu 8 (Agent Rules) haipo"]);
  });

  it("test hook ni inert bila XMD_TEST_HOOKS=1 + alama", () => {
    expect(maybeSabotagePlan("md", `${PLANGUARD_SABOTAGE_MARK} brief`, {})).toBe("md");
    expect(maybeSabotagePlan("md", "brief halisi", { XMD_TEST_HOOKS: "1" })).toBe("md");
    expect(maybeSabotagePlan("md", `${PLANGUARD_SABOTAGE_MARK} brief`, { XMD_TEST_HOOKS: "1" })).toContain("999,999");
  });
});

describe("TASK-4 T2 — pipeline halisi (factSheet + workPlan + Data Guard)", () => {
  const facts = extractFactSheet(BRIEF);

  it("Fact Sheet halisi imesomwa (bei 2)", () => {
    expect(facts?.services.map((s) => s.amount)).toEqual([5000, 3000]);
  });

  it("plan yenye bei inayopingana na Fact Sheet → guard_failed → haitekelezwi", () => {
    const bad = part1().replace("Run `ls` and save evidence.", "Create data file:\n```js\nconst SERVICES = [{ name: \"Kunyoa\", price: \"TSh 7,500\" }];\n```");
    const asm = asmOf([bad, part2], facts);
    const hits = guardText(asm.markdown, facts, {});
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.map((h) => h.kind)).toContain("bei");
    const status = planStatusOf(hits.length, asm.problems);
    expect(status).toBe("guard_failed");
    const gate = isPlanExecutable({ status, md: asm.markdown, problems: asm.problems });
    expect(gate.ok).toBe(false);
    expect(gate.reasons[0]).toMatch(/guard_failed/);
  });

  it("plan safi yenye bei rasmi → active → inatekelezwa", () => {
    const good = part1().replace("Run `ls` and save evidence.", "```js\nconst SERVICES = [{ name: \"Kunyoa\", price: \"TSh 5,000\" }];\n```");
    const asm = asmOf([good, part2], facts);
    expect(guardText(asm.markdown, facts, {})).toEqual([]);
    expect(planStatusOf(0, asm.problems)).toBe("active");
    expect(isPlanExecutable({ status: "active", md: asm.markdown, problems: asm.problems }).ok).toBe(true);
  });

  it("assemblePlanDocument halisi bila sehemu 7/8 → structure_failed → haitekelezwi", () => {
    const asm = asmOf([part1()], facts);
    expect(asm.problems.join(" | ")).toMatch(/sehemu 7 .*haipo/);
    const status = planStatusOf(0, asm.problems);
    expect(status).toBe("structure_failed");
    expect(isPlanExecutable({ status, md: asm.markdown, problems: asm.problems }).ok).toBe(false);
  });

  it("assemblePlanDocument halisi: hatua 3 + bila MASHARTI → warnings tu, inatekelezwa", () => {
    const asm = asmOf([part1(3), part2], extractFactSheet(BRIEF.replace(/MASHARTI:[\s\S]*$/, "")));
    const status = planStatusOf(0, asm.problems);
    expect(status).toBe("active");
    const gate = isPlanExecutable({ status, md: asm.markdown, problems: asm.problems });
    expect(gate.ok).toBe(true);
    expect(gate.warnings.join(" | ")).toMatch(/hatua 3 < ndogo ya 8/);
  });

  it("sabotage ya T3 (hook) kweli inaangusha guard halisi", () => {
    const asm = asmOf([part1(), part2], facts);
    const md = maybeSabotagePlan(asm.markdown, `${PLANGUARD_SABOTAGE_MARK} x`, { XMD_TEST_HOOKS: "1" });
    expect(guardText(md, facts, {}).length).toBeGreaterThan(0);
  });
});
