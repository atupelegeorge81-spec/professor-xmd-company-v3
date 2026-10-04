import { describe, expect, it } from "vitest";
import type { FactSheet } from "./factSheet";
import {
  PLAN_PARTS, PLAN_SAVED_CHIP, PLAN_SAVED_RE, PLAN_FAILED_RE, PLAN_REPAIR_RE,
  planPartChip, extractPlanSections, parsePlanSteps, countPlanSteps, planStepBody, capSampleCode,
  officialDataMarkdown, constraintsMarkdown, constraintFallbackLines, assemblePlanDocument,
} from "./workPlan";

const sheet: FactSheet = {
  version: 1,
  name: "Mama Lishe",
  address: "Mikocheni B, Dar es Salaam",
  hours: [{ days: "Monday-Saturday", time: "06:30-16:00", open: "06:30", close: "16:00" }],
  closed: ["Jumapili: IMEFUNGWA"],
  services: [
    { name: "Chai ya tangawizi", price: "500", amount: 500 },
    { name: "Chapati", price: "1000", amount: 1000 },
  ],
  currency: "TSh",
  phone: { value: "0712 345 678", placeholder: false, file: null },
  email: { value: "mamalishe@example.com", forbidden: false },
  rules: ["Punguzo la 10% kwa oda za juu ya TSh 10,000."],
  constraints: ["Rangi kuu ni teal #0f766e.", "Hakuna barua pepe kwenye ukurasa wa mawasiliano."],
  source: "parser",
};

const mk = (n: number, title: string, body = "") => `## ${n}. ${title}\n${body}`;

describe("workPlan · chips & regexes (R30)", () => {
  it("PLAN_PARTS: vipande 2 — §1–4 na §5–8", () => {
    expect(PLAN_PARTS).toHaveLength(2);
    expect(PLAN_PARTS[0]).toMatchObject({ part: 1, nums: [1, 2, 3, 4] });
    expect(PLAN_PARTS[1]).toMatchObject({ part: 2, nums: [5, 6, 7, 8] });
    expect(PLAN_PARTS.map((p) => p.label)).toEqual(["1/2 (1-4)", "2/2 (5-8)"]);
  });

  it("planPartChip → ina namba ya kipande inayosomeka na PLAN_PART_RE", () => {
    expect(planPartChip(1)).toContain("Kipande 1/2 (1-4)");
    expect(planPartChip(2)).toContain("Kipande 2/2 (5-8)");
    expect(planPartChip(1).match(/Kipande (\d)\/2/)?.[1]).toBe("1");
    expect(planPartChip(2).match(/Kipande (\d)\/2/)?.[1]).toBe("2");
  });

  it("PLAN_SAVED_RE inakubali chip ya kuokoka (na idadi ya hatua); haikubaliki kwa chips nyingine", () => {
    expect(PLAN_SAVED_RE.test(`${PLAN_SAVED_CHIP} (hatua 12) — computer-use agent inaupata kwa /api/plans?session=abc`)).toBe(true);
    expect(PLAN_SAVED_RE.test(PLAN_SAVED_CHIP)).toBe(true);
    expect(PLAN_SAVED_RE.test("📑 Optimus anaandika ripoti — Kipande 1/2")).toBe(false);
    expect(PLAN_SAVED_RE.test("❌ Mpango Kazi umeshindwa kuhifadhiwa Appwrite")).toBe(false);
  });

  it("PLAN_FAILED_RE / PLAN_REPAIR_RE zinalingana na chips za engine", () => {
    expect(PLAN_FAILED_RE.test("❌ Mpango Kazi umeshindwa kuhifadhiwa Appwrite — ripoti inaendelea")).toBe(true);
    expect(PLAN_REPAIR_RE.test("📋 Optimus anarekebisha Mpango Kazi: \"TSh 400\", \"alfajiri\"...")).toBe(true);
    expect(PLAN_FAILED_RE.test("✅ kila kitu kiko sawa")).toBe(false);
    expect(PLAN_REPAIR_RE.test("📑 Optimus anaandika ripoti")).toBe(false);
  });
});

describe("workPlan · extractPlanSections", () => {
  it("inasoma sehemu zote na kutoa body bila sehemu inayofuata", () => {
    const md = [mk(1, "Objective & Deliverable", "Build the menu."), mk(2, "Official Data", "- chai: 500"), mk(3, "Constraints", "- hakuna")].join("\n\n");
    const s = extractPlanSections(md);
    expect(Object.keys(s).sort()).toEqual(["1", "2", "3"]);
    expect(s[1]).toContain("Build the menu.");
    expect(s[2]).toContain("chai");
    expect(s[2]).not.toContain("## 3");
  });

  it("mistari ya '### Step N' inabaki NDANI ya body (si kichwa cha sehemu)", () => {
    const s = extractPlanSections("## 5. File Structure\n- app.tsx\n\n### Step 1 — Scaffold\nbody");
    expect(s[5]).toContain("app.tsx");
    expect(s[5]).toContain("Step 1");
  });

  it("sehemu isiyojulikana (namba bila def) haipokelewi", () => {
    const s = extractPlanSections("## 9. Unknown Section\n-nope");
    expect(s[9]).toBeUndefined();
  });

  it("sehemu inayorudiwa mara 2 → toleo ndefu zaidi linashinda", () => {
    const s = extractPlanSections(`${mk(1, "Objective & Deliverable", "short")}\n\n${mk(1, "Objective & Deliverable", "much longer objective text that wins")}`);
    expect(s[1]).toContain("much longer objective");
  });
});

describe("workPlan · steps", () => {
  const step = (n: number, t: string) => `### Step ${n} — ${t}\nGoal: g${n}\nSource: A${n}`;
  const md = `## 6. Work Steps\n${step(1, "Scaffold page")}\n${step(2, "Add menu data")}\n${step(3, "Style cards")}\n`;

  it("parsePlanSteps: namba + vichwa (kwa mpangilio wa kuonekana)", () => {
    const steps = parsePlanSteps(md);
    expect(steps.map((s) => s.n)).toEqual([1, 2, 3]);
    expect(steps[1].title).toBe("Add menu data");
  });

  it("countPlanSteps = idadi ya hatua", () => {
    expect(countPlanSteps(md)).toBe(3);
    expect(countPlanSteps("## 6. Work Steps\n(hakuna)")).toBe(0);
  });

  it("em-dash / en-dash / hyphen zote zinakubaliwa", () => {
    const steps = parsePlanSteps("### Step 1 — A\nx\n### Step 2 – B\ny\n### Step 3 - C\nz");
    expect(steps.map((s) => s.title)).toEqual(["A", "B", "C"]);
  });

  it("planStepBody: mwili wa hatua N hadi hatua inayofuata", () => {
    const body = planStepBody(md, 2);
    expect(body).toContain("g2");
    expect(body).toContain("Source: A2");
    expect(body).not.toContain("g3");
    expect(planStepBody(md, 99)).toBe("");
  });
});

describe("workPlan · capSampleCode (plan mode: snippet, si faili kamili)", () => {
  it("snippet fupi inabaki ile ile", () => {
    const code = "```tsx\nconst a = 1;\n```";
    const out = capSampleCode(code);
    expect(out.text).toBe(code);
    expect(out.capped).toBe(false);
  });

  it("snippet ndefu kuliko kikomo (40) inakatwa + onyo", () => {
    const long = "```tsx\n" + Array.from({ length: 60 }, (_, i) => `// line ${i}`).join("\n") + "\n```";
    const out = capSampleCode(long);
    expect(out.capped).toBe(true);
    expect(out.text).toContain("…");
    expect(out.text.split("\n").length).toBeLessThanOrEqual(45);
  });
});

describe("workPlan · official data / constraints (code-gen, si LLM)", () => {
  it("officialDataMarkdown inatengeneza orodha kamili kutoka Fact Sheet", () => {
    const md = officialDataMarkdown(sheet);
    expect(md).toContain("Mama Lishe");
    expect(md).toContain("Mikocheni B, Dar es Salaam");
    expect(md).toContain("Monday-Saturday");
    expect(md).toContain("06:30-16:00");
    expect(md).toContain("Chai ya tangawizi");
    expect(md).toContain("500");
    expect(md).toContain("0712 345 678");
    expect(md).toContain("Jumapili: IMEFUNGWA");
  });

  it("constraintsMarkdown ina masharti NENO KWA NENO", () => {
    const md = constraintsMarkdown(sheet);
    expect(md).toContain("#0f766e");
    expect(md).toContain("Hakuna barua pepe");
  });

  it("bila Fact Sheet → fallback ya '_No …_' (si crash, si tupu-tupu kwa siri)", () => {
    expect(officialDataMarkdown(null)).toContain("No official data");
    expect(constraintsMarkdown(null)).toContain("No constraints");
  });

  it("R30.1/E2: constraintsMarkdown inatumia fallback ya Ledger neno kwa neno (dedupe, kikomo 20)", () => {
    const raw = [
      "- Lazima kubaki ndani ya bajeti kali ya jumla isiyozidi <50KB.",
      "Lazima kubaki ndani ya bajeti kali ya jumla isiyozidi <50KB.", // duplicate (ya pili bila dash)
      "  - Zero email fields popote kwenye markup.  ",
      "",
      "x", // fupi mno — inarukwa
      ...Array.from({ length: 25 }, (_, i) => `- sheria ya ziada ${i}`),
    ];
    const lines = constraintFallbackLines(raw);
    expect(lines[0]).toBe("Lazima kubaki ndani ya bajeti kali ya jumla isiyozidi <50KB.");
    expect(lines).toHaveLength(20); // dedupe ilifanya kazi + kikomo
    const md = constraintsMarkdown({ ...sheet, constraints: [] }, raw);
    expect(md).toContain("<50KB");
    expect(md).toContain("Zero email fields");
    expect(md).not.toContain("sheria ya ziada 24"); // kikomo cha 20
  });

  it("R30.1/E2: MASHARTI za brief zikipatikana hazibadilishwi na fallback", () => {
    const md = constraintsMarkdown(sheet, ["fallback isiyotumika"]);
    expect(md).toContain("#0f766e");
    expect(md).not.toContain("fallback");
  });
});

describe("workPlan · assemblePlanDocument (deterministic)", () => {
  const part1 = [mk(1, "Objective & Deliverable", "One-pager for Mama Lishe."), mk(4, "Tech Stack & Design Tokens", "Next.js, teal #0f766e")].join("\n\n");
  const part2 = [
    mk(5, "File Structure", "src/app/page.tsx"),
    `## 6. Work Steps\n### Step 1 — Scaffold the page\nGoal: page shell\nSource: A1\n\n### Step 2 — Menu data\nGoal: data file\nSource: A2`,
    mk(7, "QA Checklist", "- [ ] contrast"),
    mk(8, "Agent Rules", "DATA RASMI is law."),
  ].join("\n\n");

  it("inaunganisha vipande 2; §2/§3 ni code-gen; hatua zinapangwa mfululizo", () => {
    const asm = assemblePlanDocument({ partTexts: [part1, part2], title: "Mama Lishe Plan", sessionId: "sess-123", date: "2026-10-04", facts: sheet });
    expect(asm.markdown).toContain("# AGENT WORK PLAN — Mama Lishe Plan");
    expect(asm.markdown).toContain("## 1. Objective & Deliverable");
    expect(asm.markdown).toContain("One-pager for Mama Lishe.");
    // §2 = code-gen kutoka Fact Sheet (haijachuwa LLM)
    expect(asm.markdown).toContain("Chai ya tangawizi");
    expect(asm.markdown).toContain("0712 345 678");
    // §3 = constraints code-gen
    expect(asm.markdown).toContain("#0f766e");
    // hatua
    const steps = parsePlanSteps(asm.markdown);
    expect(steps.map((s) => s.n)).toEqual([1, 2]);
    expect(steps[0].title).toBe("Scaffold the page");
    expect(asm.steps).toHaveLength(2);
  });

  it("hatua namba zisizo mfululizo (10, 2) zinapangwa upya kuwa (1, 2) bila kupoteza vichwa", () => {
    const weird = `## 6. Work Steps\n### Step 10 — First actually\nGoal: g\nSource: A1\n\n### Step 2 — Second\nGoal: g\nSource: A2`;
    const asm = assemblePlanDocument({ partTexts: [weird], title: "T", sessionId: "s", date: "d", facts: null });
    expect(asm.steps.map((x) => x.n)).toEqual([1, 2]);
    expect(asm.steps[0].title).toBe("First actually");
    expect(asm.steps[1].title).toBe("Second");
  });

  it("hatua chini ya PLAN_STEPS_MIN → inaingia problems (log, si block)", () => {
    const few = `## 6. Work Steps\n### Step 1 — Only one\nGoal: g\nSource: A1`;
    const asm = assemblePlanDocument({ partTexts: [few], title: "T", sessionId: "s", date: "d", facts: null });
    expect(asm.problems.some((p) => p.includes("hatua"))).toBe(true);
  });

  it("sehemu zinazokosekana zinaorodheshwa kati ya problems", () => {
    const asm = assemblePlanDocument({ partTexts: [mk(1, "Objective & Deliverable", "x")], title: "T", sessionId: "s", date: "d", facts: null });
    expect(asm.problems.some((p) => p.includes("haipo"))).toBe(true);
  });

  it("kichwa kina session + tarehe + mode PLAN", () => {
    const asm = assemblePlanDocument({ partTexts: [part1, part2], title: "Kichwa Cha Mpango", sessionId: "abc123", date: "2026-10-04", facts: sheet });
    expect(asm.markdown.slice(0, 300)).toContain("Kichwa Cha Mpango");
    expect(asm.markdown.slice(0, 300)).toContain("abc123");
    expect(asm.markdown.slice(0, 300)).toContain("2026-10-04");
    expect(asm.markdown.slice(0, 300)).toContain("PLAN");
  });

  it("§2 ya LLM inafUTILIWA na code-gen hata kama LLM aliandika yake (backend-is-truth)", () => {
    const fake = mk(2, "Official Data", "- chai: 999 (imebuniwa na LLM)");
    const asm = assemblePlanDocument({ partTexts: [fake], title: "T", sessionId: "s", date: "d", facts: sheet });
    expect(asm.markdown).not.toContain("999");
    expect(asm.markdown).toContain("500");
  });

  it("R30.1/E2: brief haina MASHARTI → §3 inatumia constraintFallback ya Ledger + inaorodheshwa problems", () => {
    const noCons: FactSheet = { ...sheet, constraints: [] };
    const asm = assemblePlanDocument({ partTexts: [mk(1, "Objective & Deliverable", "x")], title: "T", sessionId: "s", date: "d", facts: noCons, constraintFallback: ["- Bajeti <50KB gzipped.", "- Zero JS."] });
    expect(asm.markdown).toContain("## 3. Constraints");
    expect(asm.markdown).toContain("Bajeti <50KB gzipped.");
    expect(asm.markdown).toContain("Zero JS.");
    expect(asm.problems.some((p) => p.includes("fallback ya Ledger"))).toBe(true);
    expect(asm.markdown).not.toContain("_No constraints");
  });
});
