// TASK 11 · T1: kila stage × kila role (Optimus, Designer, Frontend, Backend, Computer) → maandishi yanayotarajiwa (snapshots).
import { describe, expect, it } from "vitest";
import { estimateTokens } from "@/lib/broker/estimate";
import { buildOCB, buildOCBForComputer, OCB_MAX_TOKENS, OCB_STAGES, withOCB, type OcbInput, type OcbSelf, type OcbStage } from "../ocb";
import type { MilestoneMap } from "../types";

const MAP: MilestoneMap = {
  version: 1, sessionId: "xmdtest-ocb", totalAgendas: 10, generatedBy: "optimus@gemini-flash", usedFallback: false,
  milestones: [
    { id: "M1", title: "Foundation and design", agendas: { from: 1, to: 3 }, phase: "foundation", reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "tokens + layout first" },
    { id: "M2", title: "Booking flow", agendas: { from: 4, to: 7 }, phase: "core", reviewMode: "mixed", roster: ["optimus", "ultron", "vextron", "megatron"], rationale: "core value" },
    { id: "M3", title: "Quality and deploy", agendas: { from: 8, to: 10 }, phase: "quality_deploy", reviewMode: "technical", roster: ["optimus", "cybertron", "megatron"], rationale: "tests + deploy" },
  ],
};

/** Hali ya kila stage (milestone, agenda, round, hesabu) — kama pipeline halisi ingekuwa. */
function inputFor(stage: OcbStage, self: OcbSelf): OcbInput {
  const base = { project: { name: "xmdtest SafariBook", summary: "Booking site for Tanzanian safari operators: search tours, book, pay with M-Pesa." }, map: MAP, stage, self };
  switch (stage) {
    case "MAP": return { ...base, map: null, counts: { lockedDecisions: 0, milestonesDone: [], openDefects: 0, waivers: 0 } };
    case "DISCUSS": return { ...base, milestoneId: "M1", agenda: { index: 2, title: "Colour palette and typography" }, counts: { lockedDecisions: 1, milestonesDone: [], openDefects: 0, waivers: 0 } };
    case "PLAN": return { ...base, milestoneId: "M1", counts: { lockedDecisions: 3, milestonesDone: [], openDefects: 0, waivers: 0 } };
    case "BUILD": return { ...base, milestoneId: "M2", counts: { lockedDecisions: 7, milestonesDone: ["M1"], openDefects: 0, waivers: 0 } };
    case "REVIEW_ANALYSE": return { ...base, milestoneId: "M2", round: { current: 0, max: 10 }, counts: { lockedDecisions: 7, milestonesDone: ["M1"], openDefects: 0, waivers: 0 } };
    case "REVIEW_DISCUSS": return { ...base, milestoneId: "M2", round: { current: 0, max: 10 }, counts: { lockedDecisions: 7, milestonesDone: ["M1"], openDefects: 4, waivers: 0 } };
    case "REVIEW_VERIFY": return { ...base, milestoneId: "M2", round: { current: 3, max: 10 }, counts: { lockedDecisions: 7, milestonesDone: ["M1"], openDefects: 2, waivers: 1 } };
    case "FIX": return { ...base, milestoneId: "M2", round: { current: 3, max: 10 }, counts: { lockedDecisions: 7, milestonesDone: ["M1"], openDefects: 2, waivers: 1 } };
    case "FINAL_REPORT": return { ...base, counts: { lockedDecisions: 10, milestonesDone: ["M1", "M2", "M3"], openDefects: 0, waivers: 1 } };
  }
}

const ROLES: OcbSelf[] = ["pm", "designer", "frontend", "backend", "computer"];

describe("T1 · OCB kwa kila stage × role (snapshots)", () => {
  for (const stage of OCB_STAGES) for (const self of ROLES) {
    it(`${stage} · ${self}`, () => {
      const inp = inputFor(stage, self);
      const out = self === "computer" ? buildOCBForComputer(inp) : buildOCB(inp);
      expect(out.startsWith("=== OPERATION CONTEXT (read this first) ===")).toBe(true);
      expect(out.endsWith("=== END ===")).toBe(true);
      for (const k of ["PROJECT: xmdtest SafariBook.", "OUR TEAM: Optimus (lead: agenda, milestone map, plans, final report) · Ultron (UI/UX Designer) · Vextron (Frontend Engineer) · Megatron (Backend & DB Engineer) · Cybertron (QA & DevOps Engineer).", "XMD COMPUTER:", "PIPELINE: 1 agendas", "YOU ARE HERE: " + stage, "PARTICIPANTS IN THIS MILESTONE:", "NEXT: ", "YOUR OUTPUT IS READ BY: ", "STATE: ", "RULES: the ledger is authoritative"]) expect(out).toContain(k);
      if (inp.milestoneId) expect(out).toMatch(new RegExp(`Milestone ${inp.milestoneId}: .+ \\(agendas \\d+–\\d+\\), milestone \\d of 3`));
      if (inp.round?.current) expect(out).toContain(`round ${inp.round.current}/10`);
      if (self === "computer") for (const k of ["WILL be reviewed by a Designer — Ultron (UI/UX Designer) — and a Frontend Engineer — Vextron (Frontend Engineer)", "one Receipt per change order", stage === "FIX" ? "no finish without a valid receipt per order" : "cannot finish without the Build Report and passing checks", "a repeated order means the previous attempt was not enough", "do not grade yourself — the harness measures"]) expect(out).toContain(k);
      else expect(out).not.toContain("YOU ARE XMD COMPUTER");
      expect(estimateTokens(out)).toBeLessThanOrEqual(OCB_MAX_TOKENS);
      expect(out).toMatchSnapshot();
    });
  }
});

describe("mtumiaji wa jibu (consumer) — jedwali la code", () => {
  const readBy = (stage: OcbStage, self: OcbSelf) => /YOUR OUTPUT IS READ BY: ([^—]+) —/.exec(buildOCB(inputFor(stage, self)))![1].trim();
  it("PLAN ya Optimus → XMD Computer; DISCUSS → team + Optimus; FINAL_REPORT ya Optimus → CEO; VERIFY → harness + Optimus", () => {
    expect(readBy("PLAN", "pm")).toBe("XMD Computer");
    expect(readBy("DISCUSS", "designer")).toBe("the team and Optimus");
    expect(readBy("FINAL_REPORT", "pm")).toBe("the CEO");
    expect(readBy("REVIEW_VERIFY", "frontend")).toBe("the harness and Optimus");
    expect(readBy("REVIEW_DISCUSS", "pm")).toBe("XMD Computer");
  });
  it("VERIFY: hatua inayofuata inataja milestone ijayo; kwenye round 10 → INHERITED", () => {
    expect(buildOCB(inputFor("REVIEW_VERIFY", "designer"))).toContain("sign-off of M2, then next milestone M3: Quality and deploy; otherwise another fix round (4/10)");
    const cap = buildOCB({ ...inputFor("REVIEW_VERIFY", "designer"), round: { current: 10, max: 10 } });
    expect(cap).toContain("round cap reached: open defects become INHERITED");
  });
});

describe("length guard (≤ 1,200 tokens)", () => {
  it("STATE inafupishwa KWANZA (summary inabaki kamili)", () => {
    const many = Array.from({ length: 900 }, (_, i) => `M${i + 1}`);
    const out = buildOCB({ ...inputFor("BUILD", "designer"), counts: { lockedDecisions: 99, milestonesDone: many, openDefects: 3, waivers: 0 } });
    expect(estimateTokens(out)).toBeLessThanOrEqual(OCB_MAX_TOKENS);
    expect(out).toContain("STATE: locked decisions 99; milestones done 900 (M1…M900); open defects 3; waivers 0.");
    expect(out).toContain("CEO request in brief: Booking site for Tanzanian safari operators: search tours, book, pay with M-Pesa.");
  });
  it("bado ndefu → STATE fupi kabisa, kisha summary inafupishwa; PIPELINE na YOU ARE HERE hazitoki kamwe", () => {
    const many = Array.from({ length: 900 }, (_, i) => `M${i + 1}`);
    const out = buildOCBForComputer({
      ...inputFor("FIX", "computer"),
      project: { name: "xmdtest", summary: "xmdtest summary ".repeat(200) },
      consumer: { role: "the harness", use: "detail ".repeat(220).trim() },
      counts: { lockedDecisions: 7, milestonesDone: many, openDefects: 2, waivers: 1 },
    });
    expect(estimateTokens(out)).toBeLessThanOrEqual(OCB_MAX_TOKENS);
    expect(out).toContain("STATE: decisions 7 · done 900 · defects 2 · waivers 1.");
    expect(/CEO request in brief: (.*)…\n/.exec(out)![1].length).toBeLessThan(300);
    expect(out).toContain("PIPELINE: 1 agendas + milestone map -> 2 per milestone");
    expect(out).toContain("YOU ARE HERE: FIX");
    expect(out).toContain("SELF-GRADING: do not grade yourself");
  });
  it("summary na title za kawaida zimefungwa (600 / 120)", () => {
    const out = buildOCB({ ...inputFor("DISCUSS", "designer"), project: { name: "x", summary: "y".repeat(5000) }, agenda: { index: 2, title: "z".repeat(500) } });
    expect(/CEO request in brief: (y+)…/.exec(out)![1].length).toBe(599);
    expect(/agenda 2: (z+)…/.exec(out)![1].length).toBe(119);
  });
});

describe("withOCB", () => {
  it("inaweka OCB juu; ikiitwa tena inabadilisha, hairudii", () => {
    const a = buildOCB(inputFor("DISCUSS", "designer"));
    const b = buildOCB(inputFor("PLAN", "designer"));
    const p1 = withOCB("Answer the agenda.", a);
    expect(p1).toBe(`${a}\n\nAnswer the agenda.`);
    const p2 = withOCB(p1, b);
    expect(p2).toBe(`${b}\n\nAnswer the agenda.`);
    expect(p2.match(/=== OPERATION CONTEXT/g)!.length).toBe(1);
    expect(withOCB("x", "")).toBe("x");
  });
});
