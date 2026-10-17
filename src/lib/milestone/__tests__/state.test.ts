// TASK 10 · T1 (pure): jedwali la transitions — kila kingo halali kinapita, 10 haramu zinashindwa, kikomo cha round.
import { describe, expect, it } from "vitest";
import { appendLaneUse, FORWARD_EDGES, HOLD_STATUSES, maskKeyId, newMilestoneState, nextStep, planSteps, setStep, TERMINAL_STATUSES, transition, type TransitionResult } from "../state";
import { MILESTONE_STATUSES, type MilestoneState, type MilestoneStatus } from "../types";
import { validateMilestoneState } from "../schemas";

const T0 = "2026-10-17T10:00:00.000Z";
const at = (status: MilestoneStatus, over: Partial<MilestoneState> = {}): MilestoneState => ({ ...newMilestoneState("M1", T0), status, ...over });
const ok = (r: TransitionResult) => { if ("error" in r) throw new Error(r.error); return r.state; };
const err = (r: TransitionResult) => ("error" in r ? r.error : `NO ERROR (status=${r.state.status})`);
/** round inayofaa kwa hali husika (VERIFYING→CAP inahitaji round = 10). */
const roundFor = (from: MilestoneStatus, to: MilestoneStatus) => (from === "VERIFYING" && to === "CAP_REACHED" ? 10 : from === "VERIFYING" || from === "FIXING" ? 3 : 0);

describe("T1 · kingo halali", () => {
  const forward = Object.entries(FORWARD_EDGES).flatMap(([f, tos]) => (tos || []).map((t) => [f, t] as [MilestoneStatus, MilestoneStatus]));
  it.each(forward)("%s -> %s", (from, to) => {
    const s = ok(transition(at(from, { round: roundFor(from, to) }), { type: "GOTO", to }, "2026-10-17T10:01:00.000Z"));
    expect(s.status).toBe(to);
    expect(s.updatedAt).toBe("2026-10-17T10:01:00.000Z");
    expect(validateMilestoneState(s).ok).toBe(true);
  });

  const live = MILESTONE_STATUSES.filter((s) => !TERMINAL_STATUSES.includes(s) && !HOLD_STATUSES.includes(s));
  const pauses = live.flatMap((f) => HOLD_STATUSES.map((h) => [f, h] as [MilestoneStatus, MilestoneStatus]));
  it.each(pauses)("%s -> %s -> RESUME inarudi pale pale", (from, hold) => {
    const p = ok(transition(at(from, { round: roundFor(from, "FIXING") }), { type: "GOTO", to: hold }));
    expect(p).toMatchObject({ status: hold, resumeTo: from });
    expect(validateMilestoneState(p).ok).toBe(true);
    const r = ok(transition(p, { type: "RESUME" }));
    expect(r.status).toBe(from);
    expect(r.resumeTo).toBeUndefined();
    expect(r.round).toBe(p.round);
  });

  it("pause → pause nyingine haipotezi asili (resumeTo)", () => {
    const p = ok(transition(at("BUILDING"), { type: "GOTO", to: "PAUSED_QUOTA" }));
    const b = ok(transition(p, { type: "GOTO", to: "BLOCKED" }));
    expect(b).toMatchObject({ status: "BLOCKED", resumeTo: "BUILDING" });
    expect(ok(transition(b, { type: "RESUME" })).status).toBe("BUILDING");
  });
});

describe("T1 · kingo haramu (10) — zote zinarudisha error, hakuna inayokubaliwa kimya", () => {
  const cases: [string, MilestoneState, Parameters<typeof transition>[1], RegExp][] = [
    ["DISCUSSING -> BUILDING (kuruka)", at("DISCUSSING"), { type: "GOTO", to: "BUILDING" }, /illegal transition DISCUSSING -> BUILDING/],
    ["PLANNING -> REVIEW_R0", at("PLANNING"), { type: "GOTO", to: "REVIEW_R0" }, /illegal transition PLANNING -> REVIEW_R0/],
    ["BUILDING -> SIGNED_OFF", at("BUILDING"), { type: "GOTO", to: "SIGNED_OFF" }, /illegal transition BUILDING -> SIGNED_OFF/],
    ["EVIDENCE -> FIXING", at("EVIDENCE"), { type: "GOTO", to: "FIXING" }, /illegal transition EVIDENCE -> FIXING/],
    ["REVIEW_R0 -> CAP_REACHED", at("REVIEW_R0"), { type: "GOTO", to: "CAP_REACHED" }, /illegal transition REVIEW_R0 -> CAP_REACHED/],
    ["FIXING -> SIGNED_OFF (bila verify)", at("FIXING", { round: 2 }), { type: "GOTO", to: "SIGNED_OFF" }, /illegal transition FIXING -> SIGNED_OFF/],
    ["SIGNED_OFF -> FIXING (ya mwisho)", at("SIGNED_OFF", { round: 2 }), { type: "GOTO", to: "FIXING" }, /illegal transition SIGNED_OFF -> FIXING/],
    ["CAP_REACHED -> PAUSED_QUOTA (ya mwisho)", at("CAP_REACHED", { round: 10 }), { type: "GOTO", to: "PAUSED_QUOTA" }, /CAP_REACHED is terminal/],
    ["PAUSED_QUOTA -> FIXING (lazima RESUME)", at("PAUSED_QUOTA", { resumeTo: "VERIFYING", round: 2 }), { type: "GOTO", to: "FIXING" }, /use RESUME/],
    ["RESUME kutoka BUILDING (si pause)", at("BUILDING"), { type: "RESUME" }, /illegal RESUME from BUILDING/],
  ];
  it.each(cases)("%s", (_n, s, ev, re) => expect(err(transition(s, ev))).toMatch(re));

  it("ziada: no-op na CAP mapema", () => {
    expect(err(transition(at("BUILDING"), { type: "GOTO", to: "BUILDING" }))).toMatch(/no-op/);
    expect(err(transition(at("VERIFYING", { round: 4 }), { type: "GOTO", to: "CAP_REACHED" }))).toBe("illegal transition VERIFYING -> CAP_REACHED: round 4 < maxRounds 10");
  });
});

describe("T1 · round", () => {
  it("REVIEW_R0 → FIXING = round 1; inaongezeka TU kwenye VERIFYING → FIXING; > 10 ni haramu", () => {
    let s = at("REVIEW_R0");
    s = ok(transition(s, { type: "GOTO", to: "FIXING" }));
    expect(s.round).toBe(1);
    for (let r = 1; r <= 10; r++) {
      s = ok(transition(s, { type: "GOTO", to: "VERIFYING" }));
      expect(s.round).toBe(r); // FIXING → VERIFYING haiongezi
      if (r < 10) { s = ok(transition(s, { type: "GOTO", to: "FIXING" })); expect(s.round).toBe(r + 1); }
    }
    expect(s).toMatchObject({ status: "VERIFYING", round: 10 });
    expect(err(transition(s, { type: "GOTO", to: "FIXING" }))).toBe("illegal transition VERIFYING -> FIXING: round 11 > maxRounds 10");
    expect(ok(transition(s, { type: "GOTO", to: "CAP_REACHED" })).status).toBe("CAP_REACHED");
    // pause/resume haibadilishi round
    const p = ok(transition(s, { type: "GOTO", to: "PAUSED_INFRA" }));
    expect(ok(transition(p, { type: "RESUME" })).round).toBe(10);
  });
});

describe("step ledger + lane log (pure)", () => {
  it("nextStep = ya kwanza isiyo DONE; DONE haiendeshwi tena; RUNNING inarudiwa", () => {
    let s = ok(planSteps(newMilestoneState("M1", T0), ["M1.R0.build", "M1.R0.evidence", "M1.R1.fix", "M1.R1.verify"]));
    expect(nextStep(s)).toBe("M1.R0.build");
    for (const id of ["M1.R0.build", "M1.R0.evidence", "M1.R1.fix"]) { s = ok(setStep(s, id, "RUNNING")); s = ok(setStep(s, id, "DONE")); }
    s = ok(setStep(s, "M1.R1.verify", "RUNNING"));
    expect(nextStep(s)).toBe("M1.R1.verify");
    expect(s.currentStepId).toBe("M1.R1.verify");
    expect(err(setStep(s, "M1.R1.fix", "RUNNING"))).toBe("step M1.R1.fix is DONE — it is never executed again");
    s = ok(setStep(s, "M1.R1.verify", "RUNNING")); // re-run baada ya crash
    expect(s.steps!.find((x) => x.stepId === "M1.R1.verify")!.attempts).toBe(2);
    s = ok(setStep(s, "M1.R1.verify", "DONE"));
    expect(nextStep(s)).toBeNull();
    expect(err(setStep(s, "M2.R1.fix", "RUNNING"))).toMatch(/bad stepId "M2.R1.fix" for M1/);
    expect(validateMilestoneState(s).ok).toBe(true);
  });
  it("lane log: append + keyId imefichwa", () => {
    const e = { callId: "c1", stepId: "M1.R0.build", lane: "uno", model: "qwen3", keyId: "sk-or-v1-abcdef1234567890", visionCapable: false, tokens: 120, ms: 900, fallback: false };
    const s = appendLaneUse(appendLaneUse(newMilestoneState("M1", T0), e), { ...e, callId: "c2", keyId: "uno#2", fallback: true });
    expect(s.lanesUsed.map((l) => l.keyId)).toEqual(["sk-o***", "uno#2"]);
    expect(maskKeyId("sk-o***")).toBe("sk-o***");
    expect(validateMilestoneState(s).ok).toBe(true);
  });
});
