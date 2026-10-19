// TASK 26 — raundi za uthibitisho: decide/decideNext (jedwali ≥15), roundOutcome, ledger ya defects, uthibitisho wa JSON ya
// reviewers, prompt (RoundHeader + OCB REVIEW_VERIFY), na runVerifyRound kupitia maybeCloseMilestones (store ya memory yenye CAS):
// SIGN_OFF · CONTINUE → FIXING R2 (COs attempt 2) · REVERT (git revert + ujumbe kwa Optimus) · resume bila kurudia reviewers.
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
  applyVerifyToDefects, buildVerifyPrompt, decide, decideNext, disagreements, nextAttempt, roundOutcome, testStopAfterRound, testVerifyInput, titleSimilarity, validateVerify, verifyOne, planGoalOf, VERIFY_TRANSPORT_RETRIES, newlyOccluded,
  verifyKey, cosRoundKey, type DecideInput, type NextState, type VerifyContext, type VerifyFindings, type VerifyVerdict,
} from "../verify";
import { nextCoNumber } from "../reviewAgenda";
import { maybeCloseMilestones, type BuildOutcome, type LoopHooks, type LoopRunner } from "../loop";
import { newMilestoneState, planSteps, setStep, stepIdOf, transition } from "../state";
import { stateKey } from "../store";
import type { ConsolidateInput, ConsolidateResult } from "../reviewAgenda";
import type { ChangeOrder, Defect, EvidencePack, MilestoneMap, MilestoneState } from "../types";

const F = (reviewer: "designer" | "frontend", v: Record<string, VerifyVerdict>, extra: Partial<VerifyFindings> = {}): VerifyFindings => ({
  reviewer, cos: Object.entries(v).map(([orderId, verdict]) => ({ orderId, verdict, evidence: ["S-001"], note: `${reviewer} says ${verdict}` })),
  regressions: [], newDefects: [], requestDiscussion: null, notes: "", ...extra,
});
const ok1 = { pass: 1, fail: 0, error: 0 };
const nd = (title: string, severity: "blocker" | "major" | "medium" | "minor" = "medium") => ({ title, area: "header", severity, kind: "broken" as const, evidence: ["S-001"], expected: "x", actual: "y" });

// ── T1: jedwali la decide (CO moja isipokuwa imeelezwa) ──
const decideCases: [string, DecideInput, { verdict: "PASS" | "FAIL"; reason: RegExp; concerns?: number; override?: boolean; unresolved?: boolean }][] = [
  ["wote PASS + checks PASS → PASS", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "PASS" }) }, { verdict: "PASS", reason: /both reviewers PASS/ }],
  ["check FAIL inapindua PASS ya wote", { orderIds: ["CO-1"], checks: { "CO-1": { pass: 1, fail: 1, error: 0 } }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "PASS" }) }, { verdict: "FAIL", reason: /overrides both reviewers' PASS/, override: true }],
  ["check ERROR inapindua PASS ya wote", { orderIds: ["CO-1"], checks: { "CO-1": { pass: 0, fail: 0, error: 1 } }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "PASS" }) }, { verdict: "FAIL", reason: /1 ERROR/, override: true }],
  ["checks hazikuendeshwa → FAIL", { orderIds: ["CO-1"], checks: {}, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "PASS" }) }, { verdict: "FAIL", reason: /did not run/ }],
  ["wanatofautiana, bila sync → FAIL (+concern: check ilipita)", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "FAIL" }) }, { verdict: "FAIL", reason: /disagree after sync/, concerns: 1, unresolved: true }],
  ["wanatofautiana → sync: wote PASS → PASS", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "PARTIAL" }), sync: { designer: { "CO-1": "PASS" }, frontend: { "CO-1": "PASS" } } }, { verdict: "PASS", reason: /agreed after sync/ }],
  ["wanatofautiana → sync bado wanatofautiana → FAIL", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }), frontend: F("frontend", { "CO-1": "FAIL" }), sync: { designer: { "CO-1": "PASS" }, frontend: { "CO-1": "FAIL" } } }, { verdict: "FAIL", reason: /disagree after sync/, concerns: 1, unresolved: true }],
  ["wote FAIL lakini checks PASS → FAIL + concern 2 (defect mpya + check mpya)", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "FAIL" }), frontend: F("frontend", { "CO-1": "PARTIAL" }) }, { verdict: "FAIL", reason: /designer FAIL, frontend PARTIAL/, concerns: 2 }],
  ["FAIL vs PARTIAL si tofauti (hakuna sync)", { orderIds: ["CO-1"], checks: { "CO-1": { pass: 0, fail: 1, error: 0 } }, designer: F("designer", { "CO-1": "FAIL" }), frontend: F("frontend", { "CO-1": "PARTIAL" }) }, { verdict: "FAIL", reason: /1 FAIL/ }],
  ["reviewer mmoja hana jibu → FAIL", { orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }), frontend: null }, { verdict: "FAIL", reason: /no verdict from frontend/ }],
];

// ── T1: jedwali la decideNext ──
const S = (o: Partial<NextState> = {}): NextState => ({
  round: 2, maxRounds: 10, cos: [{ orderId: "CO-1", verdict: "PASS" }], reviewersValid: true, checks: { pass: 4, fail: 0, error: 0 },
  openDefects: [], listedMinor: [], receiptsMatch: true, ...o,
});
const nextCases: [string, NextState, string, RegExp?][] = [
  ["kila kitu PASS → SIGN_OFF", S(), "SIGN_OFF"],
  ["CO moja FAIL → CONTINUE", S({ cos: [{ orderId: "CO-1", verdict: "PASS" }, { orderId: "CO-2", verdict: "FAIL" }] }), "CONTINUE", /CO-2/],
  ["check ya global FAIL → CONTINUE", S({ checks: { pass: 3, fail: 1, error: 0 } }), "CONTINUE", /1 FAIL/],
  ["defect wazi medium → CONTINUE", S({ openDefects: [{ id: "D-7", severity: "medium" }] }), "CONTINUE", /D-7 \(medium\)/],
  ["minor ISIYOorodheshwa → CONTINUE", S({ openDefects: [{ id: "D-8", severity: "minor" }] }), "CONTINUE", /unlisted minor defects: D-8/],
  ["minor iliyoorodheshwa → SIGN_OFF (leftover)", S({ openDefects: [{ id: "D-8", severity: "minor" }], listedMinor: ["D-8"] }), "SIGN_OFF", /listed minor left: D-8/],
  ["receipts ≠ diffs → CONTINUE", S({ receiptsMatch: false }), "CONTINUE", /receipts do not match/],
  ["raundi 10 + kasoro → CAP_REACHED", S({ round: 10, openDefects: [{ id: "D-9", severity: "major" }] }), "CAP_REACHED", /round 10\/10/],
  ["raundi 10 bila kasoro → SIGN_OFF (si CAP)", S({ round: 10 }), "SIGN_OFF"],
  ["raundi 9 + kasoro → CONTINUE", S({ round: 9, cos: [{ orderId: "CO-1", verdict: "FAIL" }] }), "CONTINUE"],
  ["reviewer batili → BLOCKED", S({ reviewersValid: false }), "BLOCKED", /no valid verification/],
  ["consolidation batili → BLOCKED", S({ blocked: "consolidation invalid" }), "BLOCKED", /consolidation invalid/],
  ["hakuna COs → CONTINUE (si SIGN_OFF)", S({ cos: [] }), "CONTINUE", /no change orders/],
];

describe("T1: decide — kanuni za verdict (jedwali)", () => {
  it.each(decideCases)("%s", (_name, input, want) => {
    const d = decide(input);
    expect(d.cos[0].verdict).toBe(want.verdict);
    expect(d.cos[0].reason).toMatch(want.reason);
    expect(d.concerns.length).toBe(want.concerns ?? 0);
    expect(d.cos[0].checkOverride).toBe(!!want.override);
    expect(d.cos[0].unresolved).toBe(!!want.unresolved);
  });
  it("disagreements: PASS dhidi ya isiyo PASS tu; findings za wawili zinaunganishwa (title+area)", () => {
    const a = F("designer", { "CO-1": "PASS", "CO-2": "FAIL" }, { newDefects: [nd("Toggle missing", "major")] });
    const b = F("frontend", { "CO-1": "FAIL", "CO-2": "PARTIAL" }, { newDefects: [{ ...nd("toggle missing", "medium"), evidence: ["S-002"] }], regressions: [nd("Nav wraps")] });
    expect(disagreements(["CO-1", "CO-2"], a, b)).toEqual(["CO-1"]);
    const d = decide({ orderIds: ["CO-1", "CO-2"], checks: { "CO-1": ok1, "CO-2": ok1 }, designer: a, frontend: b });
    expect(d.newDefects).toHaveLength(1);
    expect(d.newDefects[0]).toMatchObject({ by: ["designer", "frontend"], severity: "major", evidence: ["S-001", "S-002"] });
    expect(d.regressions[0].by).toEqual(["frontend"]);
    expect(d.allPass).toBe(false);
  });
});

describe("verifyOne: wito ulioanguka (429) unarudiwa; plan goal iko kwenye prompt", () => {
  it("429 mara 1 → jaribio la pili linafaulu (transport retry haihesabiwi kama validation retry)", async () => {
    let n = 0;
    const ctx = ctxOf([CO("CO-1", ["D-004"])]);
    const r = await verifyOne("frontend", { ...ctx, planGoal: planGoalOf("# M1 plan\n\n## 1 Goal\nOne page with a product grid.\n\n## 4 Commands\nx") }, {
      images: false, loadDom: async () => null, retryDelayMs: 1,
      complete: async ({ messages }) => {
        n++;
        if (n === 1) throw new Error("429 quota exceeded");
        expect(JSON.stringify(messages)).toContain("## PLAN GOAL (what the product must contain)\\nOne page with a product grid.");
        return { text: JSON.stringify({ reviewer: "frontend", cos: [{ orderId: "CO-1", verdict: "PASS", evidence: ["S-001"], note: "ok" }], regressions: [], newDefects: [], requestDiscussion: null, notes: "" }), usage: null };
      },
    });
    expect(n).toBe(2);
    expect(r.findings?.cos[0].verdict).toBe("PASS");
    const dead = await verifyOne("frontend", ctx, { images: false, loadDom: async () => null, retryDelayMs: 1, complete: async () => { n++; throw new Error("429"); } });
    expect(dead.findings).toBeNull();
    expect(n).toBe(2 + 1 + VERIFY_TRANSPORT_RETRIES);
  });
});

describe("newlyOccluded: regression ya code (maandishi yamefunikwa na raundi hii)", () => {
  const meta = (vp: string, id = "S-003") => ({ route: "/", viewport: vp, state: "default", screenshotId: id });
  const dom = (els: Record<string, any>[]) => ({ page: {}, elements: els });
  it("h1 ilionekana R0 → imefunikwa R1 na header fixed = regression; iliyokuwa imefunikwa tayari / baseline bila `occluded` / selector mpya = si regression", () => {
    const before = [{ meta: meta("1280x800"), dom: dom([{ selector: "main > h1", occluded: false }, { selector: "p.lead", occluded: true }, { selector: ".cta" }]) }];
    const after = [{ meta: meta("1280x800"), dom: dom([
      { selector: "main > h1", text: "Quiet goods", occluded: true, occludedBy: "body > header" },
      { selector: "p.lead", occluded: true }, { selector: ".cta", occluded: true }, { selector: ".new", occluded: true }, { selector: "nav", occluded: false },
    ]) }, { meta: meta("375x667", "S-001"), dom: dom([{ selector: "main > h1", occluded: true }]) }];
    expect(newlyOccluded(before, after)).toEqual([{ route: "/", viewport: "1280x800", selector: "main > h1", text: "Quiet goods", by: "body > header", screenshotId: "S-003" }]);
    expect(newlyOccluded(before, [{ meta: meta("1280x800"), dom: null }])).toEqual([]);
  });
  it("roundOutcome: harness regression moja inatosha kurudisha nyuma hata defects zikipungua", () => {
    expect(roundOutcome({ openBefore: 3, openAfter: 2, regressions: 1 }).outcome).toBe("REVERT");
  });
});

describe("nextCoNumber: ids za CO hazirudiwi", () => {
  it("max(namba, idadi)+1", () => {
    expect(nextCoNumber([])).toBe(1);
    expect(nextCoNumber([{ id: "CO-001" }, { id: "CO-002" }])).toBe(3);
    expect(nextCoNumber([{ id: "CO-003" }])).toBe(4); // T3 halisi: seed ya raundi 3 ilikuwa na CO-003 pekee → kabla: CO-002, CO-003 (marudio)
    expect(nextCoNumber([{ id: "CO-009" }, { id: "x" }])).toBe(10);
  });
});

describe("dedupe ya findings kati ya reviewers (T4 halisi: overflow ileile, vichwa tofauti)", () => {
  it("vichwa vinavyofanana ≥0.5 vya reviewers TOFAUTI → defect moja; reviewer mmoja haunganishwi na nafsi yake", () => {
    expect(titleSimilarity("Horizontal page overflow on 375px mobile viewport", "Horizontal scrolling overflow at 375px viewport")).toBeGreaterThanOrEqual(0.5);
    const a = F("designer", { "CO-1": "FAIL" }, { newDefects: [{ ...nd("Horizontal page overflow on 375px mobile viewport", "major"), area: "layout" }] });
    const b = F("frontend", { "CO-1": "FAIL" }, { newDefects: [{ ...nd("Horizontal scrolling overflow at 375px viewport", "major"), area: "responsiveness" }, nd("Theme toggle missing")] });
    const d = decide({ orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: a, frontend: b });
    expect(d.newDefects.map((x) => [x.title, x.by])).toEqual([["Horizontal page overflow on 375px mobile viewport", ["designer", "frontend"]], ["Theme toggle missing", ["frontend"]]]);
    const self = decide({ orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "FAIL" }, { newDefects: [nd("Nav overflow at 375px"), nd("Grid overflow at 375px")] }), frontend: null });
    expect(self.newDefects).toHaveLength(2);
  });
});

describe("T1: decideNext — SIGN_OFF | CONTINUE | CAP_REACHED | BLOCKED (jedwali)", () => {
  it.each(nextCases)("%s", (_name, state, next, reason) => {
    const r = decideNext(state);
    expect(r.next).toBe(next);
    if (reason) expect(r.reason).toMatch(reason);
  });
  it(`jedwali lina kesi ${decideCases.length + nextCases.length} (≥15)`, () => expect(decideCases.length + nextCases.length).toBeGreaterThanOrEqual(15));
});

describe("roundOutcome (git best / revert)", () => {
  it.each([
    [{ openBefore: 3, openAfter: 1, regressions: 0 }, "BEST"],
    [{ openBefore: 1, openAfter: 3, regressions: 0 }, "REVERT"],
    [{ openBefore: 3, openAfter: 1, regressions: 1 }, "REVERT"],
    [{ openBefore: 2, openAfter: 2, regressions: 0 }, "SAME"],
  ] as const)("%o → %s", (o, want) => expect(roundOutcome(o).outcome).toBe(want));
});

const D = (id: string, extra: Partial<Defect> = {}): Defect => ({ id, milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "type", severity: "major", title: id, evidence: ["S-001"], expected: "x", actual: "y", status: "IN_FIX", attempts: 1, history: [], ...extra });
const CO = (id: string, defectIds: string[], extra: Partial<ChangeOrder> = {}): ChangeOrder => ({
  id, defectIds, attempt: 1, priority: 1, location: { files: ["src/styles.css"], route: "/", selector: "h1" }, current: "c", desired: "h1 color #F2F0EB", visionNote: "v", mode: "standard",
  acceptance: [{ id: "h1-color", type: "computed_style", route: "/", selector: "h1", property: "color", expected: "#F2F0EB" }], ...extra,
});

describe("applyVerifyToDefects + nextAttempt", () => {
  it("PASS → VERIFIED_FIXED · FAIL → REOPENED · mpya: regression + newDefect + concern (CHECK_MISSED_IT)", () => {
    const decision = decide({
      orderIds: ["CO-1", "CO-2"], checks: { "CO-1": ok1, "CO-2": ok1 },
      designer: F("designer", { "CO-1": "PASS", "CO-2": "FAIL" }, { newDefects: [nd("Footer overlaps")] }), frontend: F("frontend", { "CO-1": "PASS", "CO-2": "FAIL" }, { regressions: [nd("Nav wraps at 375")] }),
    });
    const r = applyVerifyToDefects([D("D-001"), D("D-002"), D("D-009", { milestoneId: "M0", status: "VERIFIED_FIXED" })], { milestoneId: "M1", round: 1, changeOrders: [CO("CO-1", ["D-001"]), CO("CO-2", ["D-002"])], decision });
    expect(r.fixed).toEqual(["D-001"]);
    expect(r.reopened).toEqual(["D-002"]);
    expect(r.added.map((d) => [d.id, d.history[0].cause])).toEqual([["D-010", "REGRESSION"], ["D-011", "NEW_DEFECT"], ["D-012", "CHECK_MISSED_IT"]]); // concern 1 kwa CO (wawili)
    expect(r.added[2]).toMatchObject({ reportedBy: ["designer", "frontend"], severity: "medium" });
    expect(r.defects.find((d) => d.id === "D-001")!.status).toBe("VERIFIED_FIXED");
    expect(r.defects.find((d) => d.id === "D-002")!.history[0].result).toMatch(/^verify: CO-2 FAIL/);
    expect(nextAttempt({ defectIds: ["D-002"] }, r.defects)).toBe(2);
    expect(nextAttempt({ defectIds: ["D-011"] }, r.defects)).toBe(1);
  });
  it("finding inayofanana na defect iliyo wazi tayari haiongezwi (duplicate inarekodiwa)", () => {
    const decision = decide({ orderIds: ["CO-1"], checks: { "CO-1": { pass: 0, fail: 1, error: 0 } }, designer: F("designer", { "CO-1": "FAIL" }, { newDefects: [nd("Promo strip overflows at 375px viewport", "major")] }), frontend: F("frontend", { "CO-1": "FAIL" }) });
    const r = applyVerifyToDefects([D("D-001"), D("D-003", { title: "Promo strip overflows at 375px (width: 640px)", status: "OPEN", attempts: 0 })], { milestoneId: "M1", round: 1, changeOrders: [CO("CO-1", ["D-001"])], decision });
    expect(r.added).toEqual([]);
    expect(r.duplicates).toEqual([{ title: "Promo strip overflows at 375px viewport", of: "D-003" }]);
  });
  it("raundi iliyorudishwa nyuma: defects zote za raundi → REOPENED, mpya hazihesabiwi", () => {
    const decision = decide({ orderIds: ["CO-1"], checks: { "CO-1": ok1 }, designer: F("designer", { "CO-1": "PASS" }, { newDefects: [nd("x")] }), frontend: F("frontend", { "CO-1": "PASS" }) });
    const r = applyVerifyToDefects([D("D-001")], { milestoneId: "M1", round: 2, changeOrders: [CO("CO-1", ["D-001"])], decision, reverted: "round 2 reverted: made things worse (x)" });
    expect(r.added).toEqual([]);
    expect(r.defects[0]).toMatchObject({ status: "REOPENED" });
    expect(r.defects[0].history[0]).toMatchObject({ cause: "REVERTED" });
  });
});

const PACK: EvidencePack = {
  milestoneId: "M1", round: 1, screenshots: [{ id: "S-001", route: "/", viewport: "375x667", state: "default", path: "a.png", url: "" } as any],
  domMetrics: [], checks: [], commands: [], gitDiffSummary: "src/styles.css | 2 +-", regression: [], consoleErrors: [], errors: [],
};
const MAP: MilestoneMap = { version: 1, sessionId: "xmdtest-verify-0001", totalAgendas: 1, generatedBy: "test", usedFallback: false,
  milestones: [{ id: "M1", title: "Verify", agendas: { from: 1, to: 1 }, phase: "foundation", reviewMode: "visual", roster: ["optimus"], rationale: "" }] } as any;
const HEADER = { milestoneId: "M1", round: 3, maxRounds: 10, closedDefects: 2, open: [{ id: "D-004", attempt: 3 }], waivers: 0, roundsLeft: 7 };
const ctxOf = (cos: ChangeOrder[]): VerifyContext => ({
  ocb: { project: { name: "xmdtest", summary: "x" }, map: MAP, milestoneId: "M1", round: { current: 3, max: 10 }, counts: { lockedDecisions: 2, milestonesDone: [], openDefects: 1, waivers: 0 } },
  roundHeader: HEADER, ledger: [{ agenda_index: 1, agenda_item: "Typography", status: "LOCKED", decision_summary: "sans only" }] as any, pack: PACK, changeOrders: cos,
  receipts: [{ orderId: "CO-1", verdict: "APPLIED", receipt: "VALID", receiptStatus: "DONE", touched: ["src/styles.css"], diff: { files: 1, added: 1, deleted: 1 } }],
  checkResults: [{ id: "CO-1/h1-color", type: "computed_style", result: "PASS", detail: "rgb(242, 240, 235)" }], defects: [D("D-004")],
});

describe("prompt ya uthibitisho + validateVerify", () => {
  it("RoundHeader + OCB (REVIEW_VERIFY) ziko juu; prompts za reviewers wawili ni tofauti (lens)", async () => {
    const a = await buildVerifyPrompt("designer", ctxOf([CO("CO-1", ["D-004"])]), { images: false });
    const b = await buildVerifyPrompt("frontend", ctxOf([CO("CO-1", ["D-004"])]), { images: false });
    expect(a.text).toContain("ROUND 3/10 (M1) — closed defects: 2 · open: 1 (D-004 attempt 3) · waivers: 0 · rounds left: 7");
    expect(a.text).toMatch(/YOU ARE HERE[^\n]*step 7: reviewers verify fixes/);
    expect(a.text).toContain("check:CO-1/h1-color PASS");
    expect(a.hash).not.toBe(b.hash);
  });
  it("JSON: CO zote mara moja · evidence ndani ya pack · check ya raundi inakubalika", () => {
    const pack = { ...PACK, checks: [{ id: "CO-1/h1-color", type: "computed_style", result: "PASS", detail: "" }] } as EvidencePack;
    const bad = validateVerify({ reviewer: "designer", cos: [{ orderId: "CO-9", verdict: "PASS", evidence: ["S-777"] }], regressions: [], newDefects: [] }, "designer", ["CO-1"], pack);
    expect(bad.ok).toBe(false);
    expect((bad as any).errors.join("\n")).toMatch(/"CO-9" is not a change order[\s\S]*missing verdicts for CO-1/);
    const good = validateVerify({ reviewer: "designer", cos: [{ orderId: "CO-1", verdict: "PASS", evidence: ["check:CO-1/h1-color", "S-001"], note: "ok" }], regressions: [], newDefects: [nd("x")], requestDiscussion: null }, "designer", ["CO-1"], pack);
    expect(good.ok).toBe(true);
  });
});

describe("test hooks (inert bila XMD_TEST_HOOKS=1)", () => {
  it("XMD_TEST_VERIFY_INPUT / XMD_TEST_STOP_AFTER_ROUND", () => {
    const file = JSON.stringify({ planMarkdown: "# p", files: { "index.html": "<h1>x</h1>" } });
    expect(testVerifyInput({ XMD_TEST_VERIFY_INPUT: "/x" }, () => file)).toBeNull();
    expect(testVerifyInput({ XMD_TEST_HOOKS: "1", XMD_TEST_VERIFY_INPUT: "/x" }, () => file)?.files["index.html"]).toBe("<h1>x</h1>");
    expect(testStopAfterRound({ XMD_TEST_STOP_AFTER_ROUND: "1" })).toBeUndefined();
    expect(testStopAfterRound({ XMD_TEST_HOOKS: "1", XMD_TEST_STOP_AFTER_ROUND: "1" })).toBe(1);
  });
});

// ── runVerifyRound kupitia njia halisi (maybeCloseMilestones → FIXING → fix → VERIFYING → verify → …) ──
const SID = "xmdtest-verify-0001";
const PLAN = "Build Command: `true`\nTest Command: none\nStart Command: `python3 -m http.server 4173`\n- route: / · states: default · viewports: 375x667";
async function seed(cos: ChangeOrder[], defects: Defect[]) {
  const put = (k: string, data: any) => db.set(`${SID}|${k}`, { version: 1, data });
  put("plan:M1", { markdown: PLAN, executable: true });
  put("cos:M1", { version: 1, changeOrders: cos });
  put("defects", { version: 1, defects });
  const ok = <T,>(r: { state: T } | { error: string }): T => { if ("error" in r) throw new Error(r.error); return r.state; };
  let st: MilestoneState = ok(planSteps(newMilestoneState("M1"), ["plan", "build", "review"].map((x) => stepIdOf("M1", 0, x))));
  for (const x of ["plan", "build", "review"]) st = ok(setStep(st, stepIdOf("M1", 0, x), "DONE"));
  for (const to of ["PLANNING", "BUILDING", "EVIDENCE", "REVIEW_R0", "FIXING"] as const) st = ok(transition(st, { type: "GOTO", to }));
  put(stateKey("M1"), st);
}
type Script = Record<number, Partial<Record<"designer" | "frontend", { cos: Record<string, VerifyVerdict>; newDefects?: unknown[] }>>>;
// TASK-27: LLM ya escalation (stub) — concrete / patch / split / kura / uamuzi
const escCO = (ids: string[]) => ({ defectIds: ids, priority: 1, location: { files: ["src/styles.css"], route: "/", selector: "h1" }, current: "h1 { color: #000 }", desired: "h1 { color: #F2F0EB }", visionNote: "v",
  acceptance: [{ id: "h1-color", type: "computed_style", route: "/", selector: "h1", property: "color", expected: "#F2F0EB" }] });
function escStub(final: "KEEP" | "MODIFY" | "WAIVE", calls: string[] = []) {
  return async (_agent: string, purpose: string) => {
    calls.push(purpose);
    if (/:concrete:/.test(purpose)) return JSON.stringify({ diagnosis: { cause: "ATTEMPTED_WRONG", reason: "The colour was changed on the wrong selector." }, changeOrder: escCO(["D-001"]) });
    if (/:patch:/.test(purpose)) return JSON.stringify({ patch: "--- a/src/styles.css\n+++ b/src/styles.css\n@@ -1,1 +1,1 @@\n-h1{color:#000}\n+h1{color:#F2F0EB}\n" });
    if (/:split:/.test(purpose)) return JSON.stringify({ changeOrders: [escCO(["D-001"])] });
    if (/:vote-/.test(purpose)) return JSON.stringify({ vote: final, reason: "locked decision A1 blocks it" });
    if (/:decide:/.test(purpose)) return JSON.stringify(final === "WAIVE" ? { outcome: "WAIVE", reason: "Locked decision A1 forbids the requested value; deviation is harmless." } : { outcome: final, reason: "r", guidance: "use the token", requirement: "h1 uses the ink token", changeOrder: escCO(["D-001"]) });
    return "{}";
  };
}
function harness(script: Script, opts: { consolidate?: (i: ConsolidateInput) => Promise<ConsolidateResult>; checkFail?: (id: string, round: number) => boolean; allFail?: boolean; esc?: ReturnType<typeof escStub>; patches?: any[]; extraChanged?: string[] } = {}) {
  const events: any[] = [];
  const llm: string[] = [];
  const git: any[] = [];
  const bl: number[] = [];
  const cons: ConsolidateInput[] = [];
  const runner: LoopRunner = { id: SID, sessionId: SID, msMap: MAP, msChips: [] };
  let round = 0;
  const hooks: LoopHooks = {
    bcast: (e) => events.push(e), addChip: () => {}, blog: () => {}, persist: async () => {}, resolvedAgendas: async () => new Set([1]),
    fix: {
      ocb: async () => "=== OPERATION CONTEXT (read this first) ===\nYOU ARE HERE: FIX\n=== END ===",
      run: async (_m, _p, fix): Promise<BuildOutcome> => {
        round = fix.round;
        const ids = fix.orderIds;
        return { ok: true, finalState: "COMPLETED_VERIFIED", reason: "", fix: {
          headBefore: String(fix.round).repeat(40).slice(0, 40), diffBase: "a".repeat(40), head: "b".repeat(40), receiptsPath: `.xmd/receipts/R${fix.round}.json`,
          receiptsRaw: JSON.stringify(ids.map((orderId) => ({ orderId, status: "DONE", filesChanged: [{ path: "src/styles.css", summary: "c" }], commandsRun: ["true"] }))),
          changed: ["src/styles.css", `.xmd/receipts/R${fix.round}.json`, ...(opts.extraChanged || [])], numstat: "1\t1\tsrc/styles.css",
        } };
      },
      applyPatch: async (_m, r, co) => { opts.patches?.push({ round: r, orderId: co.id, patch: co.patch }); return { orderId: co.id, applied: true, method: "git apply" as const, base: "e".repeat(40), sha: "f".repeat(40), detail: "git apply: src/styles.css" }; },
      checks: async (_m, rc) => ({ results: rc.checks.map((c) => ({ id: c.id, type: c.type, result: opts.checkFail?.(c.id, round) ? "FAIL" as const : "PASS" as const, detail: "x" })), ms: 1 }),
    },
    verify: {
      evidence: async (_m, r) => ({ pack: { ...PACK, round: r }, exit: 0, invalid: [], uploaded: 1, ms: 1 }),
      context: async () => ({ ocb: ctxOf([]).ocb, ledger: ctxOf([]).ledger, ledgerLines: ["- A1 [LOCKED] Typography: sans only"] }),
      escalateComplete: opts.esc || escStub("KEEP"),
      readFiles: async (_m, paths) => Object.fromEntries(paths.map((p) => [p, "h1{color:#000}\n"])),
      saveBaselines: async (_m, r) => { bl.push(r); return { uploaded: 2, entries: 2, errors: [] }; },
      git: async (_m, op) => { git.push(op); return { ok: true, sha: "c".repeat(40), detail: op.kind === "tag" ? `tag ${op.name}` : "reverted 1 commit(s)" }; },
      deps: {
        images: false,
        complete: async (o) => {
          const { reviewer, purpose } = o;
          llm.push(purpose);
          const r = Number(/:R(\d+):/.exec(purpose)?.[1]);
          if (purpose.startsWith("review-verify-sync")) return { text: JSON.stringify({ cos: Object.keys(script[r]?.[reviewer]?.cos || {}).map((orderId) => ({ orderId, verdict: "PASS", note: "agreed" })) }), usage: null };
          const ids = ((db.get(`${SID}|${r === 1 ? "cos:M1" : cosRoundKey("M1", r)}`)?.data?.changeOrders || []) as ChangeOrder[]).map((c) => c.id);
          const s = opts.allFail ? { cos: Object.fromEntries(ids.map((id) => [id, "FAIL" as VerifyVerdict])) } : script[r]?.[reviewer] || { cos: {} };
          return { text: JSON.stringify({ reviewer, cos: Object.entries(s.cos).map(([orderId, verdict]) => ({ orderId, verdict, evidence: ["S-001"], note: verdict })), regressions: [], newDefects: s.newDefects || [], requestDiscussion: null, notes: "" }), usage: null };
        },
      },
      consolidate: opts.consolidate || (async (i) => {
        cons.push(i);
        return { valid: true, attempts: 1, errors: [], raw: "", ledgerConflicts: [], changeOrders: i.defects.map((d, k) => CO(`CO-${String(i.nextCoNo + k).padStart(3, "0")}`, [d.id])) };
      }),
    },
  };
  return { runner, hooks, events, llm, git, cons, bl };
}

beforeEach(() => { db.clear(); vi.stubEnv("XMD_MILESTONES", "1"); });
afterEach(() => vi.unstubAllEnvs());

describe("runVerifyRound (loop)", () => {
  it("R1 FAIL → Optimus COs (attempt 2, RoundHeader ya R1 kutoka DB) → FIXING R2 → R2 PASS → BEST tag → SIGNED_OFF", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({ 1: { designer: { cos: { "CO-001": "FAIL" } }, frontend: { cos: { "CO-001": "FAIL" } } }, 2: { designer: { cos: { "CO-002": "PASS" } }, frontend: { cos: { "CO-002": "PASS" } } } }, { checkFail: (id, r) => r === 1 && id.startsWith("CO-") });
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st).toMatchObject({ status: "SIGNED_OFF", round: 2 });
    expect(st.steps.map((x: any) => x.stepId)).toEqual(expect.arrayContaining(["M1.R1.fix", "M1.R1.evidence", "M1.R1.verify", "M1.R1.decide", "M1.R2.fix", "M1.R2.decide"]));
    expect(h.cons).toHaveLength(1);
    expect(h.cons[0].roundHeader).toBe("ROUND 1/10 (M1) — closed defects: 0 · open: 1 (D-001 attempt 1) · waivers: 0 · rounds left: 9");
    // verify ya R2 inaeleza jaribio LINALOTHIBITISHWA (2), si linalofuata (3) — T3 halisi
    expect(db.get(`${SID}|${verifyKey("M1", 2)}`)!.data.header).toBe("ROUND 2/10 (M1) — closed defects: 0 · open: 1 (D-001 attempt 2) · waivers: 0 · rounds left: 8");
    expect(db.get(`${SID}|${verifyKey("M1", 1)}`)!.data.header).toBe("ROUND 1/10 (M1) — closed defects: 0 · open: 1 (D-001 attempt 1) · waivers: 0 · rounds left: 9");
    const r2 = db.get(`${SID}|${cosRoundKey("M1", 2)}`)!.data.changeOrders;
    expect(r2.map((c: ChangeOrder) => [c.id, c.attempt])).toEqual([["CO-002", 2]]);
    expect(db.get(`${SID}|defects`)!.data.defects[0]).toMatchObject({ id: "D-001", status: "VERIFIED_FIXED", attempts: 2 });
    expect(h.git).toEqual([{ kind: "tag", name: "xmd-best-M1" }, { kind: "signoff", tag: "milestone-M1", message: "xmd: sign-off M1 (SIGNED_OFF, round 2)" }]); // R1 SAME (1→1), R2 BEST (1→0) · TASK-28 sign-off
    expect(db.get(`${SID}|best:M1`)!.data).toMatchObject({ round: 2, tag: "xmd-best-M1" });
    expect(h.events.filter((e) => e.type === "verifyRound").map((e) => e.next)).toEqual(["CONTINUE", "SIGN_OFF"]);
  });
  it("check FAIL inapindua PASS ya reviewers wote (CO FAIL → CONTINUE)", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({ 1: { designer: { cos: { "CO-001": "PASS" } }, frontend: { cos: { "CO-001": "PASS" } } } }, { checkFail: (id, r) => r === 1 && id.startsWith("CO-001/") });
    h.hooks.verify!.stopAfterRound = 1;
    await maybeCloseMilestones(h.runner, h.hooks);
    const vr = db.get(`${SID}|${verifyKey("M1", 1)}`)!.data;
    expect(vr.decision.cos[0]).toMatchObject({ verdict: "FAIL", checkOverride: true });
    expect(db.get(`${SID}|state:M1`)!.data).toMatchObject({ status: "FIXING", round: 2 });
  });
  it("tofauti → sync MOJA → wote PASS → SIGNED_OFF", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({ 1: { designer: { cos: { "CO-001": "PASS" } }, frontend: { cos: { "CO-001": "FAIL" } } } });
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.llm.filter((p) => p.startsWith("review-verify-sync")).length).toBe(2); // zamu moja: kila reviewer jibu moja
    const vr = db.get(`${SID}|${verifyKey("M1", 1)}`)!.data;
    expect(vr.disputed).toEqual(["CO-001"]);
    expect(db.get(`${SID}|state:M1`)!.data.status).toBe("SIGNED_OFF");
  });
  it("T4 (code): raundi inaongeza defects → git revert + Optimus anaambiwa 'round 1 reverted: made things worse'", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({ 1: { designer: { cos: { "CO-001": "FAIL" }, newDefects: [nd("Page overflows at 375", "major")] }, frontend: { cos: { "CO-001": "FAIL" }, newDefects: [nd("Lead text unreadable", "medium")] } } }, { checkFail: (id) => id.startsWith("CO-") });
    h.hooks.verify!.stopAfterRound = 1;
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.git).toEqual([{ kind: "revert", from: "1".repeat(40), message: expect.stringMatching(/revert M1 R1 — made things worse \(open defects 1 → 3\)/), label: "M1-R1-revert" }]);
    const vr = db.get(`${SID}|${verifyKey("M1", 1)}`)!.data;
    expect(vr.outcome).toMatchObject({ outcome: "REVERT", openBefore: 1, openAfter: 3 });
    expect(h.cons[0].notes).toEqual(["round 1 reverted: made things worse (open defects 1 → 3)"]);
    const defects = db.get(`${SID}|defects`)!.data.defects;
    expect(defects).toHaveLength(1); // mpya hazihesabiwi (code yao imerudishwa nyuma)
    expect(defects[0]).toMatchObject({ status: "REOPENED" });
    expect(h.events.find((e) => e.type === "verifyRound")).toMatchObject({ outcome: "REVERT", git: { op: "revert", ok: true } });
  });
  it("T5 (code): crash ndani ya decide → resume: raundi ileile, reviewers HAWARUDIWI, rekodi moja ya uthibitisho", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    let crash = true;
    const h = harness({ 1: { designer: { cos: { "CO-001": "FAIL" } }, frontend: { cos: { "CO-001": "FAIL" } } } }, {
      checkFail: (id) => id.startsWith("CO-"),
      consolidate: async (i) => {
        if (crash) { crash = false; throw new Error("kill -9 (simulated)"); }
        return { valid: true, attempts: 1, errors: [], raw: "", ledgerConflicts: [], changeOrders: [CO(`CO-00${i.nextCoNo}`, ["D-001"])] };
      },
    });
    h.hooks.verify!.stopAfterRound = 1;
    await expect(maybeCloseMilestones(h.runner, h.hooks)).rejects.toThrow(/kill -9/);
    expect(db.get(`${SID}|state:M1`)!.data).toMatchObject({ status: "VERIFYING", round: 1, currentStepId: "M1.R1.decide" });
    const before = h.llm.length;
    const v1 = db.get(`${SID}|${verifyKey("M1", 1)}`)!.version;
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.llm.length).toBe(before); // hakuna wito mpya wa reviewers
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st).toMatchObject({ status: "FIXING", round: 2 });
    expect(st.steps.find((x: any) => x.stepId === "M1.R1.verify")).toMatchObject({ status: "DONE", attempts: 1 });
    expect(st.steps.find((x: any) => x.stepId === "M1.R1.decide")).toMatchObject({ status: "DONE", attempts: 2 });
    expect(db.get(`${SID}|${verifyKey("M1", 1)}`)!.version).toBeGreaterThan(v1);
    expect([...db.keys()].filter((k) => k.startsWith(`${SID}|verify:`))).toEqual([`${SID}|verify:M1:R1`]);
    expect(db.get(`${SID}|defects`)!.data.defects[0].history.filter((x: any) => /^verify:/.test(x.result))).toHaveLength(1);
  });
  it("TASK-27 ladder: defect inashindikana → attempt 1 standard · 2 concrete (diagnosis) · 3 pair patch (harness git apply) · 4 split · 5 redecide WAIVE → SIGNED_OFF_WITH_WAIVERS", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const calls: string[] = [], patches: any[] = [];
    const h = harness({}, { allFail: true, checkFail: (id) => id.startsWith("CO-"), esc: escStub("WAIVE", calls), patches });
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st).toMatchObject({ status: "SIGNED_OFF_WITH_WAIVERS", round: 4 });
    const modes = [1, 2, 3, 4].map((r) => (db.get(`${SID}|${r === 1 ? "cos:M1" : cosRoundKey("M1", r)}`)!.data.changeOrders as ChangeOrder[]).filter((c) => r > 1 || c.id === "CO-001").map((c) => `${c.attempt}:${c.mode}`));
    expect(modes).toEqual([["1:standard"], ["2:concrete"], ["3:pair_patch"], ["4:split"]]);
    expect(db.get(`${SID}|${cosRoundKey("M1", 2)}`)!.data.changeOrders[0].diagnosis).toEqual({ cause: "ATTEMPTED_WRONG", note: "The colour was changed on the wrong selector." });
    expect(patches).toEqual([{ round: 3, orderId: "CO-003", patch: expect.stringContaining("+h1{color:#F2F0EB}") }]);
    expect(db.get(`${SID}|fix:M1:R3`)!.data.attempts[0].diffBase).toBe("a".repeat(40)); // stub; diffBase ya harness imepitishwa kwa run
    expect(calls.map((c) => c.replace(/^escalate:M1:/, "").replace(/:a\d$/, ""))).toEqual(["R2:CO-002:concrete", "R3:CO-003:patch", "R4:CO-004:split", "R5:CO-006:vote-designer", "R5:CO-006:vote-frontend", "R5:CO-006:decide"]);
    const d = db.get(`${SID}|defects`)!.data.defects[0];
    expect(d.status).toBe("WAIVED");
    expect(d.history.filter((x: any) => /^ESCALATED/.test(x.result)).map((x: any) => x.mode)).toEqual(["concrete", "pair_patch", "split", "redecide"]);
    expect(d.history.find((x: any) => x.mode === "split").laneSwitch).toMatch(/lane switch skipped/);
    expect(st.waivers).toEqual([expect.objectContaining({ defectId: "D-001", approvedBy: ["designer", "frontend", "pm"], reason: expect.stringMatching(/A1/) })]);
    expect(db.get(`${SID}|waivers:M1`)!.data.waivers[0]).toMatchObject({ defectId: "D-001", votes: [{ vote: "WAIVE" }, { vote: "WAIVE" }] });
    expect(h.events.filter((e) => e.type === "escalation").map((e) => e.events[0].mode)).toEqual(["concrete", "pair_patch", "split", "redecide"]);
    expect(db.get(`${SID}|fix:M1:R4`)!.data.reproduced).toEqual({ "CO-005": false });
  });
  it("TASK-27 T5 (code): redecide KEEP kila mara → hakuna kitanzi kisicho na mwisho: CAP_REACHED raundi 10", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({}, { allFail: true, checkFail: (id) => id.startsWith("CO-"), esc: escStub("KEEP") });
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(db.get(`${SID}|state:M1`)!.data).toMatchObject({ status: "CAP_REACHED", round: 10 });
    expect([...db.keys()].filter((k) => /\|fix:M1:R\d+$/.test(k))).toHaveLength(10);
    expect((db.get(`${SID}|${cosRoundKey("M1", 10)}`)!.data.changeOrders as ChangeOrder[]).map((c) => [c.attempt, c.mode])).toEqual([[10, "redecide"]]);
    expect(db.get(`${SID}|defects`)!.data.defects[0]).toMatchObject({ status: "INHERITED", inheritedFrom: "M1", attempts: 10 }); // TASK-28: cap → INHERITED
  });
  it("TASK-27: redecide MODIFY → requirement mpya kwenye ledger (decisions + amendments) na defect.expected", async () => {
    await seed([CO("CO-001", ["D-001"], { attempt: 5 })], [D("D-001", { status: "OPEN", attempts: 4 })]);
    const h = harness({}, { allFail: true, checkFail: (id) => id.startsWith("CO-"), esc: escStub("MODIFY") });
    h.hooks.verify!.stopAfterRound = 1;
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(db.get(`${SID}|amendments:M1`)!.data.amendments).toEqual([expect.objectContaining({ id: "AM-M1-R1-D-001", requirement: "h1 uses the ink token" })]);
    expect(db.get(`${SID}|decisions`)!.data.decisions).toEqual([expect.objectContaining({ source: "redecide", decision: "MODIFY", defectId: "D-001" })]);
    expect(db.get(`${SID}|defects`)!.data.defects[0].expected).toBe("h1 uses the ink token");
  });
  it("TASK-27 (T2 halisi): kila kitu PASS lakini receipts ≠ diffs na hakuna defect/CO → BLOCKED yenye sababu (si SIGN_OFF ya uongo wala raundi tupu)", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const h = harness({ 1: { designer: { cos: { "CO-001": "PASS" } }, frontend: { cos: { "CO-001": "PASS" } } } }, { extraChanged: ["README.md", "server.log"] });
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st).toMatchObject({ status: "BLOCKED", round: 1 });
    expect(db.get(`${SID}|${verifyKey("M1", 1)}`)!.data.next.reason).toMatch(/^nothing for a fix round .* remaining blocker: receipts do not match the diffs/);
    expect(db.get(`${SID}|fix:M1:R1`)!.data.unlisted).toEqual(["README.md"]); // server.log haihesabiwi
  });
});

/* ======================== TASK-28: sign-off · cap · inherited · backlog ya minor ======================== */
describe("TASK-28 sign-off / cap (loop)", () => {
  const PASS2 = (ids: string[]) => ({ 1: { designer: { cos: Object.fromEntries(ids.map((i) => [i, "PASS" as VerifyVerdict])) }, frontend: { cos: Object.fromEntries(ids.map((i) => [i, "PASS" as VerifyVerdict])) } } });
  it("T1 (code): defects 2 → SIGNED_OFF · commit+tag milestone-M1 · baselines · ledger MS-M1 · finalReport safi · event moja", async () => {
    await seed([CO("CO-001", ["D-001"]), CO("CO-002", ["D-002"], { acceptance: [{ id: "h2-color", type: "computed_style", route: "/", selector: "h2", property: "color", expected: "#F2F0EB" }] })], [D("D-001"), D("D-002", { severity: "medium" })]);
    const h = harness(PASS2(["CO-001", "CO-002"]));
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(db.get(`${SID}|state:M1`)!.data).toMatchObject({ status: "SIGNED_OFF", round: 1 });
    expect(h.git.filter((g) => g.kind === "signoff")).toEqual([{ kind: "signoff", tag: "milestone-M1", message: "xmd: sign-off M1 (SIGNED_OFF, round 1)" }]);
    expect(h.bl).toEqual([1]);
    const e = db.get(`${SID}|decisions`)!.data.decisions.find((x: any) => x.id === "MS-M1");
    expect(e).toMatchObject({ source: "milestone", status: "SIGNED_OFF", round: 1, tag: "milestone-M1", waivers: [], backlog: [], inherited: [] });
    expect(e.closedDefects.map((x: any) => x.id)).toEqual(["D-001", "D-002"]);
    expect(e.baselines).toMatch(/2 baseline/);
    expect(db.get(`${SID}|signoff:M1`)!.data).toMatchObject({ ledger: { id: "MS-M1" }, git: { ok: true, tag: "milestone-M1" }, baselines: { uploaded: 2 }, report: {}, event: {} });
    expect(db.get(`${SID}|finalReport`)!.data.milestones).toMatchObject([{ milestoneId: "M1", status: "SIGNED_OFF", clean: true }]);
    expect(h.events.filter((x) => x.type === "milestoneSignedOff")).toHaveLength(1);
  });
  it("T2 (code): XMD_TEST_MAX_ROUNDS=2 + defect isiyorekebishika → CAP_REACHED · INHERITED (inheritedFrom M1 + checks) · ledger · haionyeshwi safi · hakuna tag", async () => {
    vi.stubEnv("XMD_TEST_HOOKS", "1"); vi.stubEnv("XMD_TEST_MAX_ROUNDS", "2");
    const { freshMilestoneState } = await import("../loop");
    expect(freshMilestoneState("M1").maxRounds).toBe(2);
    await seed([CO("CO-001", ["D-001"])], [D("D-001", { status: "OPEN", attempts: 0 })]);
    const st = db.get(`${SID}|state:M1`)!; st.data = { ...st.data, maxRounds: 2 };
    const h = harness({}, { allFail: true, checkFail: (id) => id.startsWith("CO-") });
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(db.get(`${SID}|state:M1`)!.data).toMatchObject({ status: "CAP_REACHED", round: 2 });
    const d = db.get(`${SID}|defects`)!.data.defects[0];
    expect(d).toMatchObject({ id: "D-001", status: "INHERITED", inheritedFrom: "M1" });
    expect(d.inheritedChecks.map((c: any) => c.id)).toEqual(["inherited/D-001/h1-color"]);
    expect(h.git.filter((g) => g.kind === "signoff")).toEqual([]);
    expect(h.bl).toEqual([]);
    expect(db.get(`${SID}|decisions`)!.data.decisions.find((x: any) => x.id === "MS-M1")).toMatchObject({ status: "CAP_REACHED", inherited: [{ id: "D-001" }] });
    expect(db.get(`${SID}|finalReport`)!.data.milestones[0]).toMatchObject({ status: "CAP_REACHED", clean: false, inherited: [{ id: "D-001" }] });
    expect(h.events.filter((x) => x.type === "milestoneCapReached")).toHaveLength(1);
  });
  it("T3 (code): WAIVE → SIGNED_OFF_WITH_WAIVERS + sababu kwenye ledger", async () => {
    await seed([CO("CO-001", ["D-001"], { attempt: 5 })], [D("D-001", { status: "OPEN", attempts: 4 })]);
    const h = harness({}, { allFail: true, checkFail: (id) => id.startsWith("CO-"), esc: escStub("WAIVE") });
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st.status).toBe("SIGNED_OFF_WITH_WAIVERS");
    const e = db.get(`${SID}|decisions`)!.data.decisions.find((x: any) => x.id === "MS-M1");
    expect(e.status).toBe("SIGNED_OFF_WITH_WAIVERS");
    expect(e.waivers).toMatchObject([{ defectId: "D-001", reason: expect.stringMatching(/Locked decision A1/) }]);
    expect(h.git.filter((g) => g.kind === "signoff")[0]).toMatchObject({ tag: "milestone-M1", message: expect.stringMatching(/SIGNED_OFF_WITH_WAIVERS/) });
    expect(db.get(`${SID}|finalReport`)!.data.milestones[0].clean).toBe(false);
  });
  it("T4 (code): minor moja wazi → SIGNED_OFF + backlog (ledger + finalReport); medium wazi → hakuna sign-off", async () => {
    await seed([CO("CO-001", ["D-001"])], [D("D-001"), D("D-009", { status: "OPEN", severity: "minor", title: "Footer spacing 2px off" })]);
    const h = harness(PASS2(["CO-001"]));
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(db.get(`${SID}|state:M1`)!.data.status).toBe("SIGNED_OFF");
    expect(db.get(`${SID}|decisions`)!.data.decisions.find((x: any) => x.id === "MS-M1").backlog).toMatchObject([{ id: "D-009", severity: "minor" }]);
    expect(db.get(`${SID}|finalReport`)!.data.milestones[0]).toMatchObject({ clean: false, backlog: [{ id: "D-009" }] });
    expect(db.get(`${SID}|defects`)!.data.defects.find((x: any) => x.id === "D-009").status).toBe("OPEN");
  });
  it("T5 (code): kill baada ya git (kabla ya rekodi) → resume: git inaitwa tena na tag ileile (engine: XMD_TAG_EXISTS), ledger/report/event mara moja; mara ya 3 hakuna kinachorudiwa", async () => {
    const { closeOutMilestone } = await import("../signoff");
    const { msUpdate } = await import("../loop");
    db.set(`${SID}|defects`, { version: 1, data: { version: 1, defects: [D("D-001", { status: "VERIFIED_FIXED" })] } });
    const git: string[] = [], ev: any[] = [], bl: number[] = [];
    let crash = true;
    const runner: LoopRunner = { id: SID, sessionId: SID, msMap: MAP, msChips: [] };
    const deps: import("../signoff").CloseoutDeps = { sid: SID, update: (k, f) => msUpdate(runner, k, f),
      git: async (t: string) => { git.push(t); return { ok: true, sha: "d".repeat(40), detail: git.length > 1 ? "tag exists · no remote" : "committed · tagged · no remote" }; },
      crashAfterGit: () => { if (crash) { crash = false; throw new Error("SIGKILL (simulated)"); } },
      saveBaselines: async (r: number) => { bl.push(r); return { uploaded: 1, entries: 1, errors: [] }; },
      bcast: (e: any) => ev.push(e), addChip: () => {}, blog: () => {} };
    await expect(closeOutMilestone(MAP.milestones[0], 1, "SIGNED_OFF", "ok", deps)).rejects.toThrow(/SIGKILL/);
    expect(db.get(`${SID}|signoff:M1`)!.data.git).toBeUndefined();
    expect(ev).toHaveLength(0);
    const r2 = await closeOutMilestone(MAP.milestones[0], 1, "SIGNED_OFF", "ok", deps);
    expect(r2.problems).toEqual([]);
    expect(git).toEqual(["milestone-M1", "milestone-M1"]);
    expect(r2.record.git).toMatchObject({ ok: true, tag: "milestone-M1", detail: "tag exists · no remote" });
    const r3 = await closeOutMilestone(MAP.milestones[0], 1, "SIGNED_OFF", "ok", deps);
    expect(git).toHaveLength(2); expect(bl).toEqual([1]); expect(r3.record.event).toBeTruthy();
    expect(db.get(`${SID}|decisions`)!.data.decisions.filter((x: any) => x.id === "MS-M1")).toHaveLength(1);
    expect(db.get(`${SID}|finalReport`)!.data.milestones).toHaveLength(1);
    expect(ev.filter((e) => e.type === "milestoneSignedOff")).toHaveLength(1);
  });
});
