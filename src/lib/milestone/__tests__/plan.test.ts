// TASK 15 — plan ya milestone: validator (Styling + Dependencies, Checks, routes/viewports, proof), generator, lango.
import { describe, expect, it } from "vitest";
import { generateMilestonePlan, ledgerDecisionsSection, parseChecksJson, stepChecksBlock, validateMilestonePlan, type MilestonePlanDeps } from "../plan";
import type { Milestone } from "../types";

const M1: Milestone = { id: "M1", title: "Page", agendas: { from: 1, to: 2 }, phase: "foundation", reviewMode: "mixed", roster: ["optimus", "ultron"], rationale: "" } as any;

const PART1 = `## 1. Objective & Deliverable
Build the price page.
## 2. Official Data
x
## 3. Constraints
x
## 4. Tech Stack & Design Tokens
Styling + Dependencies: plain CSS in styles.css ; packages: none
Build Command: \`node --check app.js\`
Test Command: none
- Font: Inter`;

const step = (n: number, files: string, checks: string | null) => `### Step ${n} — Step ${n} title
- **Goal:** g
- **Source:** Agenda 1 mini-report (authoritative)
- **Files:** ${files}
- **Instructions:** 1. do it
- **Verification:** ok
- **Depends on:** none${checks === null ? "" : `
- **Checks:**
\`\`\`checks
${checks}
\`\`\``}`;

const PART2 = (steps: string) => `## 5. File Structure
- index.html
## 6. Work Steps
${steps}
## 7. QA Checklist
- [ ] contrast
**Screenshots:**
- route: / · states: default, error · viewports: 375x667, 768x1024, 1280x800
**Proof:**
- \`node --check server.js\`
## 8. Agent Rules
- never invent`;

const GOOD_STEPS = [
  step(1, "index.html, styles.css", `[{"id":"M1-S1-a","type":"file_exists","path":"index.html"},{"id":"M1-S1-b","type":"dom_exists","route":"/","selector":"table"}]`),
  step(2, "server.js", `[{"id":"M1-S2-a","type":"command","cmd":"node --check server.js","expectExit":0}]`),
  step(3, "none", null),
].join("\n");

const doc = (p1: string, p2: string) => `${p1}\n${p2}`;

describe("validateMilestonePlan", () => {
  it("plan kamili inapita (structural 2, checks 3, routes 1, proof 1)", () => {
    const v = validateMilestonePlan(doc(PART1, PART2(GOOD_STEPS)), M1);
    expect(v.errors).toEqual([]);
    expect(v.stats).toEqual({ steps: 3, structural: 2, checks: 3, routes: 1, proofChecks: 1 });
  });

  it("T2: Checks zote zikiondolewa → kukataliwa kwa ujumbe sahihi kwa kila hatua ya muundo", () => {
    const noChecks = GOOD_STEPS.replace(/\n- \*\*Checks:\*\*\n```checks\n[^`]*```/g, "");
    expect(noChecks).not.toContain("```checks");
    const v = validateMilestonePlan(doc(PART1, PART2(noChecks)), M1);
    expect(v.ok).toBe(false);
    expect(v.errors).toContain('M1 plan Step 1 ("Step 1 title"): no machine-readable Acceptance Checks — this step touches files (index.html, styles.css) so it needs a ```checks JSON array with ≥1 valid Check');
    expect(v.errors.some((e) => e.startsWith('M1 plan Step 2 ("Step 2 title"): no machine-readable Acceptance Checks'))).toBe(true);
    expect(v.errors.some((e) => e.includes("Step 3"))).toBe(false); // si hatua ya muundo
    expect(v.errors.some((e) => e.includes('needs ≥1 "command" or "http" Check'))).toBe(true);
  });

  it("Styling + Dependencies: haipo / tupu → kukataliwa", () => {
    const v1 = validateMilestonePlan(doc(PART1.replace(/Styling \+ Dependencies:.*\n/, ""), PART2(GOOD_STEPS)), M1);
    expect(v1.errors[0]).toMatch(/§4: missing the "Styling \+ Dependencies:" line/);
    const v2 = validateMilestonePlan(doc(PART1.replace(/Styling \+ Dependencies:.*\n/, "Styling + Dependencies: not discussed\n"), PART2(GOOD_STEPS)), M1);
    expect(v2.errors[0]).toMatch(/empty or vague/);
  });

  it("check batili (validateCheck) + JSON mbovu + id rudufu", () => {
    const bad = [
      step(1, "a.html", `[{"id":"x","type":"file_exists"}]`),
      step(2, "b.html", `[{"id":"y","type":"file_exists","path":"b.html"},`),
      step(3, "c.html", `[{"id":"z","type":"command","cmd":"true"},{"id":"z","type":"file_exists","path":"c.html"}]`),
    ].join("\n");
    const v = validateMilestonePlan(doc(PART1, PART2(bad)), M1);
    expect(v.errors.some((e) => /Step 1 check\[0\]\.path/.test(e))).toBe(true);
    expect(v.errors.some((e) => /Step 2 .*not valid JSON/.test(e))).toBe(true);
    expect(v.errors.some((e) => /duplicate id "z"/.test(e))).toBe(true);
  });

  it("visual bila screenshot matrix → kukataliwa; technical haihitaji routes", () => {
    const p2 = PART2(GOOD_STEPS).replace(/- route:.*\n/, "");
    expect(validateMilestonePlan(doc(PART1, p2), { ...M1, reviewMode: "visual" }).errors.some((e) => /missing the screenshot matrix/.test(e))).toBe(true);
    expect(validateMilestonePlan(doc(PART1, p2), { ...M1, reviewMode: "technical" }).ok).toBe(true);
  });

  it("stepChecksBlock inasoma ```checks au ```json baada ya Checks:", () => {
    expect(stepChecksBlock("- **Checks:**\n```json\n[1]\n```")).toBe("[1]");
    expect(stepChecksBlock("no checks here\n```checks\n[]\n```")).toBeNull();
  });
});

function deps(texts: string[], over: Partial<MilestonePlanDeps> = {}): MilestonePlanDeps & { calls: string[] } {
  const calls: string[] = [];
  let i = 0;
  return {
    calls,
    project: "xmdtest", title: "T", sessionId: "xmdtest-s", date: "2026-10-18", facts: null, factsBlock: "", dataFilesBlock: "",
    ledger: [
      { agenda_index: 1, agenda_item: "Page", status: "LOCKED", decision_summary: "Prices already include VAT (18%) — never add VAT." },
      { agenda_index: 3, agenda_item: "Other", status: "LOCKED", decision_summary: "not in M1" },
    ],
    miniOf: async () => "mini", system: "SYS", guard: () => [],
    write: async ({ label, user }: { label: string; user: string }) => { calls.push(`${label}::${user.slice(-40)}`); return texts[i++] ?? ""; },
    ...over,
  } as any;
}

describe("generateMilestonePlan", () => {
  it("plan nzuri → active, executable, §9 ya Ledger (agenda za milestone tu), header ya milestone", async () => {
    const d = deps([PART1, PART2(GOOD_STEPS)]);
    const r = await generateMilestonePlan(M1, d);
    expect(r.status).toBe("active");
    expect(r.executable).toBe(true);
    expect(r.markdown.startsWith("# MILESTONE PLAN — T — M1: Page")).toBe(true);
    expect(r.markdown).toContain("## 9. Ledger Decisions (verbatim)\n\n- **A1 [LOCKED] Page:** Prices already include VAT (18%) — never add VAT.");
    expect(r.markdown).not.toContain("not in M1");
    expect(d.calls).toHaveLength(2);
    expect(r.warnings.some((w) => /< ndogo ya 8/.test(w))).toBe(true); // onyo tu (Task 4)
  });

  it("muundo mbovu → jaribio 1 la kurekebisha; likishindwa → structure_failed, haitekelezeki", async () => {
    const noChecks = PART2(GOOD_STEPS.replace(/\n- \*\*Checks:\*\*\n```checks\n[^`]*```/g, ""));
    const d = deps([PART1, noChecks, noChecks]);
    const r = await generateMilestonePlan(M1, d);
    expect(d.calls).toHaveLength(3);
    expect(d.calls[2]).toMatch(/rekebisha muundo/);
    expect(r.status).toBe("structure_failed");
    expect(r.executable).toBe(false);
    expect(r.reasons[0]).toMatch(/structure_failed/);
  });

  it("muundo mbovu → urekebishaji unafaulu → active", async () => {
    const noChecks = PART2(GOOD_STEPS.replace(/\n- \*\*Checks:\*\*\n```checks\n[^`]*```/g, ""));
    const r = await generateMilestonePlan(M1, deps([PART1, noChecks, PART2(GOOD_STEPS)]));
    expect(r.status).toBe("active");
    expect(r.repairs).toEqual({ structure: 1, guard: 0 });
  });

  it("Data Guard: tofauti inayobaki baada ya urekebishaji → guard_failed (Computer haianzi)", async () => {
    const r = await generateMilestonePlan(M1, deps([PART1, PART2(GOOD_STEPS), "## 4. Tech Stack & Design Tokens\nBuild Command: `test -s index.html`\nStyling + Dependencies: plain CSS ; packages: none"], {
      facts: { version: 1 } as any,
      guard: (md) => (md.includes("TSh 999,999") ? [{ kind: "price", found: "TSh 999,999", expected: "TSh 5,000" } as any] : []),
      sabotage: (md) => `${md}\n\`\`\`js\nconst X = "TSh 999,999";\n\`\`\``,
    }));
    expect(r.status).toBe("guard_failed");
    expect(r.executable).toBe(false);
    expect(r.guardHits[0].found).toBe("TSh 999,999");
    expect(r.repairs.guard).toBe(1);
  });
});

describe("ledgerDecisionsSection", () => {
  it("neno kwa neno", () => {
    expect(ledgerDecisionsSection([{ agenda_index: 2, agenda_item: "Bei", status: "LOCKED", decision_summary: " Bei TSh 5,000 inajumuisha VAT. " }])).toBe("- **A2 [LOCKED] Bei:** Bei TSh 5,000 inajumuisha VAT.");
  });
});

describe("TASK-18 · validator inadai Build Command", () => {
  it("bila 'Build Command:' → kosa la §4", () => {
    const v = validateMilestonePlan(doc(PART1.replace(/Build Command:.*\n/, ""), PART2(GOOD_STEPS)), M1);
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => e.includes('missing the "Build Command:" line'))).toBe(true);
  });
});

describe("TASK-32: parseChecksJson — mabano ya ziada mwishoni (E2E run 3, M1 Step 3)", () => {
  const real = '[{"id":"M1-S3-a","type":"file_exists","path":"src/lib/design-tokens.ts"},{"id":"M1-S3-b","type":"file_contains","path":"src/lib/design-tokens.ts","text":"export const colors"}]}';
  it("`[...]}` inasomwa kama array", () => {
    const j = parseChecksJson(real) as { id: string }[];
    expect(j.map((c) => c.id)).toEqual(["M1-S3-a", "M1-S3-b"]);
  });
  it("mabano ndani ya strings hayachanganyi; JSON sahihi haibadiliki", () => {
    expect(parseChecksJson('[{"text":"a ] } \\" ["}]')).toEqual([{ text: 'a ] } " [' }]);
    expect(parseChecksJson('[{"id":"x"}] ]\n')).toEqual([{ id: "x" }]);
  });
  it("maandishi mengine baada ya array, au array isiyofungwa → bado ni kosa", () => {
    expect(() => parseChecksJson('[{"id":"x"}] and more')).toThrow();
    expect(() => parseChecksJson('[{"id":"x"},')).toThrow();
    expect(() => parseChecksJson('{"id":"x"}}')).toThrow();
  });
});
