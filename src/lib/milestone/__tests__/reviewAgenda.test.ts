// TASK 24 (maelezo24) — REVIEW ya timu (R-Mk-n, si agenda yenye namba), kanuni za uamuzi (code), Optimus consolidate → COs,
// hatua ya review ndani ya runMilestoneBuild. Mjadala halisi (Board) + Optimus halisi viko kwenye docs/tests/task-24.md.
import type { ReviewContext } from "../review";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const db = new Map<string, { version: number; data: any }>();
vi.mock("../store", async () => {
  const real = await vi.importActual<typeof import("../store")>("../store");
  class Conflict extends Error {}
  const getRecord = async (sid: string, key: string) => {
    const r = db.get(`${sid}|${key}`);
    return r ? { key, version: r.version, data: structuredClone(r.data) } : null;
  };
  const putRecord = async (sid: string, key: string, data: any, expected: number) => {
    const cur = db.get(`${sid}|${key}`);
    if ((cur?.version ?? 0) !== expected) throw new Conflict("conflict");
    db.set(`${sid}|${key}`, { version: expected + 1, data: structuredClone(data) });
    return { key, version: expected + 1, data };
  };
  const updateRecord = async (sid: string, key: string, mutate: (c: any, v: number) => any) => {
    for (;;) {
      const cur = await getRecord(sid, key);
      try { return await putRecord(sid, key, mutate(cur?.data ?? null, cur?.version ?? 0), cur?.version ?? 0); }
      catch (e) { if (!(e instanceof Conflict)) throw e; }
    }
  };
  return { ...real, getRecord, putRecord, updateRecord };
});

import {
  applyReviewRules, consolidate, cosKey, CRS_KEY, DECISIONS_KEY, DEFECTS_KEY, findingsKey, isNoChanges, isReviewAgenda, makeReviewAgendaItem,
  NORMAL_WORD_RULE, numberFindings, parseReviewDecision, reviewAgendaId, reviewKey, reviewParticipants, reviewPromptBlock, runReviewRound,
  testReviewInput, turnWordRule, validateConsolidation, type ConsolidateInput, type DiscussionOutcome, type ReviewRoundDeps,
} from "../reviewAgenda";
import { validateChangeOrder } from "../schemas";
import { maybeCloseMilestones, type LoopHooks, type LoopRunner } from "../loop";
import { stateKey } from "../store";
import type { EvidencePack, MilestoneMap } from "../types";
import type { Findings } from "../review";

const F = (reviewer: "designer" | "frontend", defects: [string, string][], proposals: string[]): Findings => ({
  reviewer, screenshots: [{ id: "S-001", description: "home 375" }],
  defects: defects.map(([title, severity]) => ({ title, area: "header", severity: severity as any, kind: "violation", evidence: ["S-001 dom: nav a height=36"], expected: "≥44px", actual: "36px" })),
  proposals: proposals.map((t) => ({ title: t, detail: `${t} detail`, rationale: "why", evidence: ["S-001"] })),
  notes: `${reviewer} notes`,
});
const pack = (checks: EvidencePack["checks"] = [{ id: "c1", type: "dom_exists", result: "PASS", detail: "ok" }]): EvidencePack => ({
  milestoneId: "M1", round: 0,
  screenshots: [{ id: "S-001", route: "/", viewport: "375x667", state: "default", path: "a.png", url: "https://s/1.png" }],
  domMetrics: [], checks, commands: [], gitDiffSummary: "", consoleErrors: [], errors: [], regression: [],
});
const P3 = ["designer", "frontend", "pm"];
const tableOf = () => numberFindings({ designer: F("designer", [["Touch targets 36px", "major"], ["Low contrast nav", "medium"]], ["Serif headings", "Bottom nav"]), frontend: F("frontend", [["Overflow at 375", "minor"]], ["Skeleton loaders"]) }, { milestoneId: "M1", round: 0 });
const DEC = (body: string) => `ACCEPTED PROPOSALS: ${body}`;
const goodCheck = { id: "k1", type: "touch_target_min", route: "/", selector: "nav a", minPx: 44 };
const co = (over: Record<string, unknown> = {}) => ({
  id: "X", defectIds: ["D-001"], attempt: 1, priority: 1, location: { route: "/", selector: "nav a" },
  current: "36px", desired: "44px", visionNote: "phone first", acceptance: [goodCheck], mode: "standard", ...over,
});

describe("TASK 24 — REVIEW si agenda yenye namba (CEO #1)", () => {
  it("id R-M1-0, index 0, owners = Ultron + Vextron + Optimus; wengine TU wakiongezwa", () => {
    expect(reviewAgendaId("M1", 0)).toBe("R-M1-0");
    expect(reviewParticipants()).toEqual(P3);
    expect(reviewParticipants(["backend", "nobody", "pm"])).toEqual([...P3, "backend"]);
    const it0 = makeReviewAgendaItem({ reviewId: "R-M1-0", milestoneId: "M1", milestoneTitle: "Shell", round: 0, reviewMode: "visual", table: tableOf(), ledgerLines: [], checkLines: [], evidenceRefs: [], participants: P3 });
    expect([it0.index, it0.owners, isReviewAgenda(it0), isReviewAgenda({ index: 1, item: "x", owners: [] })]).toEqual([0, P3, true, false]);
  });
  it("TASK 29: technical → kichwa + EVIDENCE REFERENCES si za UI/screenshots (T4 Koyeb ilionyesha query ya UI/UX)", () => {
    const base = { reviewId: "R-M1-0", milestoneId: "M1", milestoneTitle: "Notes API", round: 0, table: tableOf(), ledgerLines: [], checkLines: [], evidenceRefs: [], participants: P3 };
    const tech = makeReviewAgendaItem({ ...base, reviewMode: "technical" });
    const vis = makeReviewAgendaItem({ ...base, reviewMode: "visual" });
    expect(tech.item).toMatch(/backend \/ security \/ API defects/);
    expect(tech.item).not.toMatch(/UI\/UX/);
    expect(vis.item).toMatch(/website UI\/UX defects/);
    expect(reviewPromptBlock(tech, "pm")).toMatch(/EVIDENCE REFERENCES \(technical evidence: check:<id>/);
    expect(reviewPromptBlock(vis, "pm")).toMatch(/EVIDENCE REFERENCES \(screenshots \/ DOM metrics/);
  });
  it("urefu wa ujumbe: REVIEW 600–900 maneno; agenda za kawaida zinabaki 'under 180 words' (CEO #4)", () => {
    const it0 = makeReviewAgendaItem({ reviewId: "R-M1-0", milestoneId: "M1", milestoneTitle: "Shell", round: 0, reviewMode: "visual", table: tableOf(), ledgerLines: [], checkLines: [], evidenceRefs: [], participants: P3 });
    expect(turnWordRule(it0)).toMatch(/600-900 words/);
    expect(turnWordRule({ index: 2, item: "Visual", owners: ["designer"] } as any)).toBe(NORMAL_WORD_RULE);
    expect(NORMAL_WORD_RULE).toBe("Keep this exchange under 180 words.");
  });
  it("prompt block: defects/proposals zenye ids, ledger, kanuni, format ya uamuzi, na kutajana kwa majina", () => {
    const it0 = makeReviewAgendaItem({ reviewId: "R-M1-0", milestoneId: "M1", milestoneTitle: "Shell", round: 0, reviewMode: "visual", table: tableOf(), ledgerLines: ["- A2 [LOCKED] Typography: Inter only"], checkLines: ["- check:c1 [dom_exists] PASS — ok"], evidenceRefs: ["- S-001: / @375x667 default"], participants: P3 });
    const b = reviewPromptBlock(it0, "designer");
    for (const k of ["R-M1-0", "D-001 [major]", "D-003 [minor]", "P-01 (Ultron) Serif headings", "P-03 (Vextron)", "A2 [LOCKED] Typography: Inter only", "REJECTED by default", "CHANGE REQUESTS:", "You discuss with: Vextron, Optimus", "NOT a numbered agenda"]) expect(b).toContain(k);
  });
});

describe("TASK 24 — kanuni za uamuzi (code; CEO #2)", () => {
  it("numberFindings: D-ids kuanzia nextDefectNo, P-ids kwa mpangilio wa reviewers", () => {
    const t = numberFindings({ designer: F("designer", [["a", "major"]], ["p"]), frontend: F("frontend", [["b", "weird"]], []) }, { milestoneId: "M2", round: 0, nextDefectNo: 7 });
    expect(t.defects.map((d) => [d.id, d.reportedBy[0], d.severity, d.status])).toEqual([["D-007", "designer", "major", "OPEN"], ["D-008", "frontend", "medium", "OPEN"]]);
    expect(t.proposals.map((p) => p.id)).toEqual(["P-01"]);
  });
  it("parseReviewDecision: bold markdown, sababu, none, CR → A-ref", () => {
    const p = parseReviewDecision("**ACCEPTED PROPOSALS:** P-2, P-03\n**REJECTED PROPOSALS:** P-01 (too costly); P-04 — duplicate\nINVALID DEFECTS: D-3 (pixel noise, both agree)\nCHANGE REQUESTS: P-05 conflicts with A2 (serif vs Inter)\nNEW PROPOSALS: none\nRATIONALE: ok");
    expect(p.accepted).toEqual(["P-02", "P-03"]);
    expect(p.rejected).toEqual([{ id: "P-01", reason: "too costly" }, { id: "P-04", reason: "duplicate" }]);
    expect(p.invalid).toEqual([{ id: "D-003", reason: "pixel noise, both agree" }]);
    expect(p.changeRequests[0]).toMatchObject({ id: "P-05", conflictsWith: "A2" });
    expect(p.newProposals).toEqual([]);
  });
  it("uamuzi halisi wa Board (R-M1-0 run A): '[Condition added by …]' baada ya NEW PROPOSALS: none HAIZAI proposals mpya", () => {
    const d = "ACCEPTED PROPOSALS: P-01, P-02\nREJECTED PROPOSALS: none\nINVALID DEFECTS: none\nCHANGE REQUESTS: none\nNEW PROPOSALS: none\n\n[Condition added by Ultron]: I fully endorse.\n\n### Audit\n\n1. **Accessibility (`D-002`)**:\n   - Contrast\n\n[Condition added by Optimus]: As chair…";
    const p = parseReviewDecision(d);
    expect([p.accepted, p.newProposals, p.found.length]).toEqual([["P-01", "P-02"], [], 5]);
    const p2 = parseReviewDecision("ACCEPTED PROPOSALS: none\nNEW PROPOSALS: Sticky CTA — keep order visible\n- Skeletons — load states\n[Condition added by Vextron]: also X — Y");
    expect(p2.newProposals.map((x) => x.title)).toEqual(["Sticky CTA", "Skeletons"]);
    expect(parseReviewDecision("NEW PROPOSALS: P-05 — Strict Grid Implementation: Enforce 4-column layout at 1280px (A3)").newProposals).toEqual([{ title: "Strict Grid Implementation", detail: "Enforce 4-column layout at 1280px (A3)" }]);
  });
  it("run B2 halisi: id ndani ya mabano ni SABABU, si kipengele (D-004 dup ya D-002 haibatilishi D-002; P-03 '(identical to P-04)' haikubali P-04)", () => {
    const d = "**ACCEPTED PROPOSALS:** \n- **P-03** (Sticky bar; identical to P-04).\n- **P-05** (Grid — per A3).\n\n**REJECTED PROPOSALS:** \n- **P-02** (Autoplay video — payload).\n\n**INVALID DEFECTS:** \n- **D-004** (Duplicate of D-002; merged into D-002).\n\n**CHANGE REQUESTS:** \n- **P-01** conflicts with A1 (serif vs Inter).\n\n**NEW PROPOSALS:** none";
    const p = parseReviewDecision(d);
    expect(p.accepted).toEqual(["P-03", "P-05"]);
    expect(p.invalid).toEqual([{ id: "D-004", reason: "Duplicate of D-002; merged into D-002" }]);
    expect(p.rejected.map((x) => x.id)).toEqual(["P-02"]);
    expect(p.changeRequests).toEqual([{ id: "P-01", conflictsWith: "A1", reason: "conflicts with A1 (serif vs Inter" }]);
    expect(parseReviewDecision("ACCEPTED PROPOSALS: P-01, P-02 and P-04\nINVALID DEFECTS: D-001, D-003 (pixel noise); D-005 — duplicate").invalid.map((x) => x.id)).toEqual(["D-001", "D-003", "D-005"]);
    expect(parseReviewDecision("ACCEPTED PROPOSALS: P-01, P-02 and P-04").accepted).toEqual(["P-01", "P-02", "P-04"]);
  });
  it("bila consensus → proposals ZOTE REJECTED, defects ZOTE zinabaki (hakuna R37 forced closure)", () => {
    const r = applyReviewRules(tableOf(), { consensus: false, decision: DEC("P-01, P-02, P-03"), participants: P3 });
    expect([r.consensus, r.acceptedProposals.length, r.rejectedProposals.length, r.openDefects.length]).toEqual([false, 0, 3, 3]);
    expect(r.rejectedProposals[0].reason).toMatch(/no consensus/);
  });
  it("consensus: accepted TU zilizotajwa; zingine rejected; invalid inahitaji sababu; CR inashinda accept", () => {
    const r = applyReviewRules(tableOf(), { consensus: true, participants: P3, decision: "ACCEPTED PROPOSALS: P-02, P-01\nREJECTED PROPOSALS: P-03 (later)\nINVALID DEFECTS: D-002 (contrast is 4.8 measured); D-003\nCHANGE REQUESTS: P-01 conflicts with A2 (serif vs locked Inter)\nNEW PROPOSALS: Sticky CTA — keep the order button visible on mobile\nRATIONALE: x" });
    expect(r.acceptedProposals.map((p) => p.id)).toEqual(["P-02", "P-T1"]);
    expect(r.changeRequests).toEqual([{ proposalId: "P-01", conflictsWith: "A2", reason: expect.stringMatching(/serif/) }]);
    expect(r.rejectedProposals.map((p) => [p.id, p.reason])).toEqual([["P-03", "later"]]);
    expect(r.invalidDefects.map((d) => d.id)).toEqual(["D-002"]);
    expect(r.openDefects.map((d) => d.id)).toEqual(["D-001", "D-003"]); // D-003 bila sababu → inabaki
    expect(r.warnings.join(" ")).toMatch(/D-003 listed as invalid without a reason/);
  });
  it("run B halisi: proposal iliyokataliwa kwa kupingana na A1 → CR (CEO), si REJECTED kimya; sababu nyingine → REJECTED", () => {
    const r = applyReviewRules(tableOf(), { consensus: true, participants: P3, decision: "ACCEPTED PROPOSALS: P-02\nREJECTED PROPOSALS: P-01 (contradicts locked decision A1 requiring Inter/system sans-serif ONLY); P-03 (performance risk for mobile users per Vextron)\nINVALID DEFECTS: none\nCHANGE REQUESTS: none\nNEW PROPOSALS: none" });
    expect(r.changeRequests).toEqual([{ proposalId: "P-01", conflictsWith: "A1", reason: expect.stringMatching(/Inter/) }]);
    expect(r.rejectedProposals.map((x) => x.id)).toEqual(["P-03"]);
    expect(r.acceptedProposals.map((x) => x.id)).toEqual(["P-02"]);
    expect(r.warnings.join(" ")).toMatch(/P-01 was rejected for contradicting A1/);
  });
  it("proposal ya reviewer mmoja tu: haipo kwenye ACCEPTED ya consensus → REJECTED", () => {
    const r = applyReviewRules(tableOf(), { consensus: true, participants: P3, decision: "ACCEPTED PROPOSALS: none\nREJECTED PROPOSALS: P-01 (only Ultron supports it); P-02; P-03\nINVALID DEFECTS: none\nCHANGE REQUESTS: none\nNEW PROPOSALS: none" });
    expect([r.acceptedProposals.length, r.rejectedProposals.length, r.openDefects.length]).toEqual([0, 3, 3]);
  });
  it("isNoChanges: minor tu + checks PASS + hakuna uamuzi → kweli; medium/FAIL/uamuzi → si kweli", () => {
    const t = tableOf();
    const minor = t.defects.filter((d) => d.severity === "minor");
    expect(isNoChanges(minor, pack().checks, 0)).toBe(true);
    expect(isNoChanges(t.defects, pack().checks, 0)).toBe(false);
    expect(isNoChanges(minor, [{ id: "c", type: "grep", result: "FAIL", detail: "" }], 0)).toBe(false);
    expect(isNoChanges(minor, pack().checks, 1)).toBe(false);
  });
});

const cin = (over: Partial<ConsolidateInput> = {}): ConsolidateInput => ({
  reviewId: "R-M1-0", milestoneId: "M1", round: 0, reviewMode: "visual", defects: tableOf().defects.slice(0, 2),
  decisions: [{ id: "R-M1-0/P-02", reviewId: "R-M1-0", milestoneId: "M1", round: 0, proposalId: "P-02", title: "Bottom nav", detail: "add", proposedBy: "designer", agreedBy: P3, at: "" }],
  ledgerLines: [], discussion: "", routes: ["/"], domHints: [], nextCoNo: 4, ...over,
});

describe("TASK 24 — ChangeOrder schema + consolidate (Optimus)", () => {
  it("validateChangeOrder: defectIds tupu ni kosa ISIPOKUWA decisionIds ina kitu", () => {
    expect(validateChangeOrder(co({ defectIds: [] }), "visual").ok).toBe(false);
    expect(validateChangeOrder(co({ defectIds: [], decisionIds: ["R-M1-0/P-02"] }), "visual").ok).toBe(true);
    expect(validateChangeOrder(co({ decisionIds: [""] }), "visual").ok).toBe(false);
  });
  it("kila defect + kila uamuzi lazima uwe na CO; ids zinapangwa upya na code (CO-004…), attempt 1", () => {
    const bad = validateConsolidation({ changeOrders: [co()] }, cin());
    expect(bad.ok).toBe(false);
    expect((bad as any).errors.join("\n")).toMatch(/defect D-002 has no Change Order[\s\S]*decision R-M1-0\/P-02 has no Change Order/);
    const ok = validateConsolidation({ changeOrders: [co({ defectIds: ["D-001", "D-002"] }), co({ defectIds: [], decisionIds: ["R-M1-0/P-02"], attempt: 9 })], ledgerConflicts: [] }, cin());
    expect(ok.ok).toBe(true);
    expect((ok as any).changeOrders.map((c: any) => [c.id, c.attempt])).toEqual([["CO-004", 1], ["CO-005", 1]]);
  });
  it("uamuzi unaopingana na ledger → ledgerConflicts (CR), si CO; route/viewport mbovu ni kosa", () => {
    const ok = validateConsolidation({ changeOrders: [co({ defectIds: ["D-001", "D-002"] })], ledgerConflicts: [{ decisionId: "R-M1-0/P-02", conflictsWith: "A2", reason: "x" }] }, cin());
    expect(ok.ok).toBe(true);
    const bad = validateConsolidation({ changeOrders: [co({ defectIds: ["D-001", "D-002"], decisionIds: ["R-M1-0/P-02"], acceptance: [{ ...goodCheck, route: "home", viewport: "mobile" }] })], ledgerConflicts: [{ decisionId: "R-M1-0/P-02", conflictsWith: "A2", reason: "x" }] }, cin());
    expect((bad as any).errors.join("\n")).toMatch(/must become a change request[\s\S]*must start with "\/"[\s\S]*must look like 375x667/);
  });
  it("consolidate inarudia na makosa (max 3) — jaribio la 2 sahihi", async () => {
    const seen: string[] = [];
    const outs = ["not json", JSON.stringify({ changeOrders: [co({ defectIds: ["D-001", "D-002"] }), co({ defectIds: [], decisionIds: ["R-M1-0/P-02"] })], ledgerConflicts: [] })];
    const r = await consolidate(cin(), { complete: async (m, a) => { seen.push(m[m.length - 1].content.slice(0, 40)); return outs[a - 1]; } });
    expect([r.valid, r.attempts, r.changeOrders.length]).toEqual([true, 2, 2]);
    expect(seen[1]).toMatch(/^Your output is not valid/);
  });
  it("TASK-32: wito wa LLM ukishindwa (429) → inasubiri retryDelayMs kisha jaribio la 2 sahihi", async () => {
    const good = JSON.stringify({ changeOrders: [co({ defectIds: ["D-001", "D-002"] }), co({ defectIds: [], decisionIds: ["R-M1-0/P-02"] })], ledgerConflicts: [] });
    const t0 = Date.now();
    const r = await consolidate(cin(), { retryDelayMs: 60, complete: async (_m, a) => { if (a === 1) throw new Error("429 quota"); return good; } });
    expect([r.valid, r.attempts]).toEqual([true, 2]);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(55);
  });
  it("consolidate: batili mara 3 → valid:false, makosa yanarudishwa", async () => {
    let n = 0;
    const r = await consolidate(cin(), { complete: async () => { n++; return JSON.stringify({ changeOrders: [co()] }); } });
    expect([r.valid, r.attempts, n]).toEqual([false, 3, 3]);
    expect(r.errors.join(" ")).toMatch(/D-002 has no Change Order/);
  });
});

function memStore() {
  const m = new Map<string, any>();
  return { m, store: { get: async (k: string) => (m.has(k) ? structuredClone(m.get(k)) : null), update: async (k: string, f: (c: any) => any) => { const v = f(m.has(k) ? structuredClone(m.get(k)) : null); m.set(k, v); return v; } } };
}
const outcome = (decision: string, consensus = true): DiscussionOutcome => ({ consensus, decision, closeReason: consensus ? "consensus" : "no consensus", transcript: [{ name: "Ultron", text: "Vextron's D-003 is right" }], searches: [{ by: "Ultron", query: "touch target 2026", sources: 3 }], turns: 6 });
const rdeps = (over: Partial<ReviewRoundDeps> & { s: ReturnType<typeof memStore>["store"] }): ReviewRoundDeps & { events: any[]; calls: Record<string, number> } => {
  const events: any[] = []; const calls = { analyse: 0, discuss: 0, consolidate: 0 };
  return {
    events, calls,
    analyse: async () => { calls.analyse++; return { designer: F("designer", [["Touch targets 36px", "major"]], ["Serif headings", "Bottom nav"]), frontend: F("frontend", [["Overflow", "minor"]], []), meta: {} }; },
    discuss: async () => { calls.discuss++; return outcome("ACCEPTED PROPOSALS: P-02\nREJECTED PROPOSALS: none\nINVALID DEFECTS: none\nCHANGE REQUESTS: P-01 conflicts with A2 (serif vs Inter)\nNEW PROPOSALS: none"); },
    consolidate: async (i) => { calls.consolidate++; return { changeOrders: [{ ...co({ defectIds: i.defects.map((d) => d.id), decisionIds: i.decisions.map((d) => d.id) }), id: "CO-001" } as any], ledgerConflicts: [], valid: true, attempts: 1, errors: [], raw: "" }; },
    store: over.s, bcast: (e) => events.push(e), blog: () => {}, addChip: () => {}, now: () => "T", ...over,
  };
};
const rin = { milestoneId: "M1", milestoneTitle: "Shell", round: 0, reviewMode: "visual" as const, pack: pack(), ledgerLines: ["- A2 [LOCKED] Typography: Inter"], domHints: [], participants: P3 };

describe("TASK 24 — runReviewRound (store + events)", () => {
  it("CHANGES: defects/decisions/CRs/COs zinahifadhiwa; events 3; CR haipati CO", async () => {
    const { m, store } = memStore();
    const d = rdeps({ s: store });
    const r = await runReviewRound(rin, d);
    expect(r.status).toBe("CHANGES");
    expect(m.get(DEFECTS_KEY).defects.map((x: any) => x.id)).toEqual(["D-001", "D-002"]);
    expect(m.get(DECISIONS_KEY).decisions.map((x: any) => x.id)).toEqual(["R-M1-0/P-02"]);
    expect(m.get(CRS_KEY).changeRequests.map((x: any) => [x.id, x.proposalId, x.conflictsWith])).toEqual([["CR-M1-0-01", "P-01", "A2"]]);
    expect(m.get(cosKey("M1")).changeOrders[0]).toMatchObject({ defectIds: ["D-001", "D-002"], decisionIds: ["R-M1-0/P-02"] });
    expect(d.events.map((e) => e.type)).toEqual(["reviewFindings", "reviewDecision", "changeOrders"]);
    expect(d.events[1]).toMatchObject({ reviewId: "R-M1-0", consensus: true, accepted: ["R-M1-0/P-02"], searches: 1 });
    expect(m.get(findingsKey("M1", 0))).toBeTruthy(); expect(m.get(reviewKey("M1", 0)).discussion.turns).toBe(6);
  });
  it("resume: findings + mjadala vilivyohifadhiwa havirudiwi", async () => {
    const { store } = memStore();
    await runReviewRound(rin, rdeps({ s: store }));
    const d2 = rdeps({ s: store });
    await runReviewRound(rin, d2);
    expect([d2.calls.analyse, d2.calls.discuss]).toEqual([0, 0]);
  });
  it("NO_CHANGES: minor tu + checks PASS + hakuna uamuzi → minor inabaki OPEN (TASK-28: backlog ya sign-off), hakuna CO", async () => {
    const { m, store } = memStore();
    const d = rdeps({ s: store, analyse: async () => ({ designer: F("designer", [["tiny spacing", "minor"]], []), frontend: F("frontend", [], []), meta: {} }), discuss: async () => outcome("ACCEPTED PROPOSALS: none\nREJECTED PROPOSALS: none\nINVALID DEFECTS: none\nCHANGE REQUESTS: none") });
    const r = await runReviewRound(rin, d);
    expect([r.status, d.calls.consolidate, r.changeOrders.length]).toEqual(["NO_CHANGES", 0, 0]);
    expect(m.get(DEFECTS_KEY).defects.map((x: any) => x.status)).toEqual(["OPEN"]);
    expect(d.events.map((e) => e.type)).toEqual(["reviewFindings", "reviewDecision"]);
  });
  it("FAILED: consolidate batili → hakuna COs zilizohifadhiwa", async () => {
    const { m, store } = memStore();
    const r = await runReviewRound(rin, rdeps({ s: store, consolidate: async () => ({ changeOrders: [], ledgerConflicts: [], valid: false, attempts: 3, errors: ["defect D-001 has no Change Order"], raw: "" }) }));
    expect(r.status).toBe("FAILED");
    expect(m.has(cosKey("M1"))).toBe(false);
  });
  it("bila consensus: proposals zote REJECTED, defects zote kwenye ledger", async () => {
    const { m, store } = memStore();
    const r = await runReviewRound(rin, rdeps({ s: store, discuss: async () => outcome("", false) }));
    expect(r.decisions).toEqual([]); expect(r.rules.rejectedProposals.length).toBe(2);
    expect(m.get(DEFECTS_KEY).defects.length).toBe(2);
  });
});

// ── loop: hatua ya review ndani ya runMilestoneBuild ─────────────────────────
const SID = "xmdtest-t24-0001";
const MAP: MilestoneMap = { version: 1, sessionId: SID, totalAgendas: 1, generatedBy: "t", usedFallback: false, milestones: [{ id: "M1", title: "Shell", agendas: { from: 1, to: 1 }, phase: "foundation", reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "" }] } as any;
const PLAN = { milestoneId: "M1", status: "active" as const, executable: true, reasons: [], markdown: "# PLAN", steps: 1, checks: 1, routes: 1, problems: [], warnings: [], guardHits: [], repairs: { structure: 0, guard: 0 } };
function loopSetup(withEvidence: boolean, discuss: () => Promise<DiscussionOutcome>, cons?: NonNullable<LoopHooks["review"]>["consolidate"]) {
  const events: any[] = []; let discussed = 0;
  const runner: LoopRunner = { id: SID, sessionId: SID, msMap: MAP, msChips: [] };
  const hooks: LoopHooks = {
    bcast: (e) => events.push(e), addChip: () => {}, blog: () => {}, persist: async () => {}, resolvedAgendas: async () => new Set([1]),
    plan: async () => PLAN,
    build: async () => ({ ok: true, finalState: "COMPLETED_UNVERIFIED", reason: "", ...(withEvidence ? { evidence: { pack: pack(), exit: 0, invalid: [], uploaded: 1, ms: 1 } } : {}) }),
    review: {
      context: async () => ({ analyseCtx: {} as any, ledgerLines: [], extraParticipants: [] }),
      discuss: async (item) => { discussed++; expect(isReviewAgenda(item)).toBe(true); return discuss(); },
      consolidate: cons || (async (i) => ({ changeOrders: [{ ...co({ defectIds: i.defects.map((d) => d.id) }), id: "CO-001" } as any], ledgerConflicts: [], valid: true, attempts: 1, errors: [], raw: "" })),
    },
  };
  db.set(`${SID}|${findingsKey("M1", 0)}`, { version: 1, data: { version: 1, designer: F("designer", [["Touch 36px", "major"]], []), frontend: F("frontend", [], []), meta: {}, at: "" } });
  return { runner, hooks, events, discussed: () => discussed, st: () => db.get(`${SID}|${stateKey("M1")}`)!.data };
}
const ctx30 = (): Omit<ReviewContext, "pack"> => ({
  ocb: { project: { name: "xmdtest KIVULI", summary: "dark streetwear store" }, map: { version: 1, sessionId: "s", totalAgendas: 2, generatedBy: "t", usedFallback: false, milestones: [{ id: "M1", title: "Storefront", agendas: { from: 1, to: 2 }, phase: "foundation", reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "" }] }, milestoneId: "M1", round: null, counts: { lockedDecisions: 2, milestonesDone: [], openDefects: 0, waivers: 0 } },
  roundHeader: { milestoneId: "M1", round: 0, maxRounds: 10, closedDefects: 0, open: [], waivers: 0, roundsLeft: 10 },
  miniReports: [{ agendaIndex: 1, title: "Brand", detail: "MINI-REPORT-FULL-TEXT accent only on CTAs" }],
  ledger: [{ agenda_index: 1, agenda_item: "Brand", status: "LOCKED", decision_summary: "LEDGER-RULE no monospace" }],
  planMarkdown: "PLAN-BODY header with SW/EN toggle", buildReport: "BUILD-REPORT-BODY", defects: [],
  baselines: [{ milestoneId: "M0", route: "/", viewport: "375x667", state: "default" }],
});
const AGREE_NONE = "ACCEPTED PROPOSALS: none\nREJECTED PROPOSALS: none\nINVALID DEFECTS: none\nCHANGE REQUESTS: none";

describe("TASK 24 — runMilestoneBuild → review step", () => {
  beforeEach(() => { db.clear(); vi.stubEnv("XMD_MILESTONES", "1"); });
  afterEach(() => vi.unstubAllEnvs());
  it("evidence + defect major → REVIEW_R0 → FIXING (round 1); COs kwenye store; agenda map haiguswi", async () => {
    const t = loopSetup(true, async () => outcome(AGREE_NONE));
    await maybeCloseMilestones(t.runner, t.hooks);
    expect([t.st().status, t.st().round, t.discussed()]).toEqual(["FIXING", 1, 1]);
    expect(t.st().steps.map((s: any) => [s.stepId, s.status])).toEqual([["M1.R0.plan", "DONE"], ["M1.R0.build", "DONE"], ["M1.R0.review", "DONE"]]);
    expect(db.get(`${SID}|${cosKey("M1")}`)!.data.changeOrders.map((c: any) => c.defectIds)).toEqual([["D-001"]]);
    expect(t.events.filter((e) => ["reviewFindings", "reviewDecision", "changeOrders"].includes(e.type)).length).toBe(3);
    await maybeCloseMilestones(t.runner, t.hooks); // FIXING inasubiri tasks 25+ — hairudiwi
    expect(t.discussed()).toBe(1);
  });
  it("consolidate batili → review FAILED, M1 BLOCKED", async () => {
    const t = loopSetup(true, async () => outcome(AGREE_NONE), async () => ({ changeOrders: [], ledgerConflicts: [], valid: false, attempts: 3, errors: ["x"], raw: "" }));
    await maybeCloseMilestones(t.runner, t.hooks);
    expect(t.st().status).toBe("BLOCKED");
    expect(t.st().steps.find((s: any) => s.stepId === "M1.R0.review").status).toBe("FAILED");
  });
  it("bila evidence (screenshots 0) → review stub, SIGNED_OFF kama zamani, mjadala HAUFANYIKI", async () => {
    const t = loopSetup(false, async () => outcome(AGREE_NONE));
    await maybeCloseMilestones(t.runner, t.hooks);
    expect([t.st().status, t.discussed()]).toEqual(["SIGNED_OFF", 0]);
    expect(t.st().steps.find((s: any) => s.stepId === "M1.R0.review").stub).toBe(true);
  });
  it("TASK-30 T4 (code): R0 NO_CHANGES lakini findings ni visionDegraded → sign-off INAKATALIWA → PAUSED_QUOTA → vision ikirudi: R0 upya (picha halisi) → SIGNED_OFF", async () => {
    const t = loopSetup(true, async () => outcome("ACCEPTED PROPOSALS: none\nREJECTED PROPOSALS: none\nINVALID DEFECTS: D-001 (measured 48px in DOM, both agree)\nCHANGE REQUESTS: none"));
    const fk = `${SID}|${findingsKey("M1", 0)}`;
    db.set(fk, { version: 1, data: { ...db.get(fk)!.data, meta: { designer: { visionDegraded: true, lane: "xkiro-1:qwen" }, frontend: {} } } });
    const calls: string[] = [];
    t.hooks.review!.context = async () => ({ analyseCtx: ctx30(), ledgerLines: [], extraParticipants: [] });
    t.hooks.review!.analyseDeps = { images: false, loadDom: async () => null, complete: async (o) => { calls.push(o.purpose); return { text: JSON.stringify(F(o.reviewer, o.reviewer === "designer" ? [["Touch 36px", "major"]] : [], [])), usage: null }; } };
    const polls: boolean[] = [];
    t.hooks.visionWait = { pollMs: 1, ready: () => { polls.push(true); return { ready: true, lane: "gemini-2:gemini-3.7-flash" }; } };
    await maybeCloseMilestones(t.runner, t.hooks);
    expect(t.st().status).toBe("SIGNED_OFF");
    expect(polls).toEqual([true]);
    expect(calls.length).toBeGreaterThanOrEqual(2); // reviewers wote walichambua UPYA (findings za zamani superseded)
    expect(db.get(fk)!.data.superseded).toBeUndefined();
    expect(db.get(`${SID}|visionPause:M1`)!.data.events[0]).toMatchObject({ stepId: "M1.R0.review", resumedOn: "gemini-2:gemini-3.7-flash" });
    expect(t.events.find((e) => e.type === "milestonePaused")).toMatchObject({ origin: "system" });
  });
  it("NO_CHANGES → SIGNED_OFF", async () => {
    const t = loopSetup(true, async () => outcome("ACCEPTED PROPOSALS: none\nREJECTED PROPOSALS: none\nINVALID DEFECTS: D-001 (measured 48px in DOM, both agree)\nCHANGE REQUESTS: none"));
    await maybeCloseMilestones(t.runner, t.hooks);
    expect(t.st().status).toBe("SIGNED_OFF");
  });
});

describe("TASK 24 — test hook XMD_TEST_REVIEW_INPUT", () => {
  it("inert bila XMD_TEST_HOOKS=1; inasoma JSON ikiwa ON", () => {
    const j = JSON.stringify({ pack: pack(), findings: { designer: null, frontend: null } });
    expect(testReviewInput({ XMD_TEST_REVIEW_INPUT: "/x" }, () => j)).toBeNull();
    expect(testReviewInput({ XMD_TEST_HOOKS: "1", XMD_TEST_REVIEW_INPUT: "/x" }, () => j)?.pack.milestoneId).toBe("M1");
    expect(testReviewInput({ XMD_TEST_HOOKS: "1", XMD_TEST_REVIEW_INPUT: "/x" }, () => "{bad")).toBeNull();
  });
});
