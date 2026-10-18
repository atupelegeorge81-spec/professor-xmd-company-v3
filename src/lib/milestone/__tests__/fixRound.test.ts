// TASK 25 — raundi ya marekebisho: pack ya Computer, uthibitishaji wa receipts (code, dhidi ya git diff), NO-OP + rerun mara moja,
// checks za raundi, historia ya defects, na runFixRound kupitia maybeCloseMilestones (store ya memory yenye CAS).
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
  applyRoundToDefects, fixKey, noOpMessage, noOpReminder, parseNumstat, parseReceipts, prevChangesLines, receiptsPath, renderFixPack, roundChecks,
  testFixInput, verifyReceipts, PREV_CHANGES_MAX_LINES, type FixPhaseInput,
} from "../fixRound";
import { maybeCloseMilestones, type BuildOutcome, type LoopHooks, type LoopRunner } from "../loop";
import { newMilestoneState, planSteps, setStep, stepIdOf, transition } from "../state";
import { stateKey } from "../store";
import { testFixNoop } from "../testHooks";
import { buildOCBForComputer } from "../ocb";
import type { ChangeOrder, Defect, MilestoneMap, MilestoneState } from "../types";

const co = (id: string, files: string[], extra: Partial<ChangeOrder> = {}): ChangeOrder => ({
  id, defectIds: ["D-001"], attempt: 1, priority: 1, location: { files, route: "/", selector: "h1" },
  current: "h1 is #111111", desired: "h1 color #F2F0EB", visionNote: "warm off-white heading", mode: "standard",
  acceptance: [{ id: "h1-color", type: "computed_style", route: "/", selector: "h1", property: "color", expected: "#F2F0EB" }], ...extra,
});
const rcpt = (orderId: string, paths: string[], status = "DONE", extra: Record<string, unknown> = {}) => ({ orderId, status, filesChanged: paths.map((p) => ({ path: p, summary: "changed" })), commandsRun: ["npm run build"], ...extra });
const P = (arr: unknown[]) => parseReceipts(JSON.stringify(arr));

describe("receipts: muundo + uthibitishaji dhidi ya git diff", () => {
  it("njia ya receipts na ujumbe wa NO-OP ni wa kudumu (neno kwa neno)", () => {
    expect(receiptsPath(2)).toBe(".xmd/receipts/R2.json");
    expect(noOpMessage("CO-012", ["src/styles.css"])).toBe("Order CO-012 was NOT applied: git diff does not touch src/styles.css. Apply it now and return the receipt.");
  });
  it("parseReceipts: haipo / si JSON / si array / Receipt batili → makosa wazi", () => {
    expect(parseReceipts(null).ok).toBe(false);
    expect(parseReceipts("{oops").errors[0]).toMatch(/not valid JSON/);
    expect(parseReceipts("{}").errors[0]).toMatch(/JSON array/);
    const r = P([{ orderId: "CO-001", status: "BLOCKED", filesChanged: [] }]);
    expect(r.ok).toBe(false);
    expect(r.errors.join()).toMatch(/blockedReason/);
  });
  it("T1 njia ya furaha: faili lengwa imeguswa + receipt inailinda → APPLIED, receipt VALID, bila flags; diff stats", () => {
    const v = verifyReceipts([co("CO-001", ["src/styles.css"])], P([rcpt("CO-001", ["src/styles.css"])]), ["src/styles.css", ".xmd/receipts/R1.json"], parseNumstat("1\t1\tsrc/styles.css\n12\t0\t.xmd/receipts/R1.json"));
    expect(v.cos[0]).toMatchObject({ verdict: "APPLIED", receipt: "VALID", receiptStatus: "DONE", touched: ["src/styles.css"], diff: { files: 1, added: 1, deleted: 1 } });
    expect(v.flags).toEqual([]);
    expect(v.unlisted).toEqual([]); // faili za .xmd/ ni za harness
  });
  it("T2 NO-OP: diff haigusi faili lengwa (na receipt si BLOCKED/CANNOT) → NOT_ATTEMPTED; receipt inayodai faili isiyobadilika → REJECTED", () => {
    const v = verifyReceipts([co("CO-001", ["src/styles.css"])], P([rcpt("CO-001", ["src/styles.css"])]), []);
    expect(v.cos[0]).toMatchObject({ verdict: "NOT_ATTEMPTED", receipt: "REJECTED", phantom: ["src/styles.css"] });
    expect(v.notAttempted).toEqual(["CO-001"]);
    expect(v.flags).toEqual(expect.arrayContaining(["NOT_ATTEMPTED", "RECEIPT_REJECTED"]));
    expect(noOpReminder(v)).toBe(noOpMessage("CO-001", ["src/styles.css"]));
  });
  it("T3 UNLISTED_CHANGE: faili imebadilika lakini haiko kwenye receipt yoyote", () => {
    const v = verifyReceipts([co("CO-001", ["src/styles.css"])], P([rcpt("CO-001", ["src/styles.css"])]), ["src/styles.css", "README.md"]);
    expect(v.cos[0].verdict).toBe("APPLIED");
    expect(v.unlisted).toEqual(["README.md"]);
    expect(v.flags).toContain("UNLISTED_CHANGE");
  });
  it("T4 BLOCKED: receipt BLOCKED + sababu, faili hazikuguswa → BLOCKED (si NOT_ATTEMPTED → hakuna rerun)", () => {
    const v = verifyReceipts([co("CO-002", ["src/styles.css"])], P([rcpt("CO-002", [], "BLOCKED", { blockedReason: "contradicts ledger A1 (Inter only)" })]), []);
    expect(v.cos[0]).toMatchObject({ verdict: "BLOCKED", receipt: "VALID", blockedReason: "contradicts ledger A1 (Inter only)" });
    expect(v.notAttempted).toEqual([]);
    expect(noOpReminder(v)).toBe("");
  });
  it("receipt haipo kwa CO → MISSING; paths zinasawazishwa (./, /home/user/ws/)", () => {
    const v = verifyReceipts([co("CO-001", ["./src/styles.css"]), co("CO-002", ["src/app.js"])], P([rcpt("CO-001", ["/home/user/ws/src/styles.css"])]), ["src/styles.css"]);
    expect(v.cos[0]).toMatchObject({ verdict: "APPLIED", receipt: "VALID" });
    expect(v.cos[1]).toMatchObject({ verdict: "NOT_ATTEMPTED", receipt: "MISSING" });
    expect(v.flags).toContain("RECEIPT_MISSING");
  });
  it("CO bila location.files → faili za receipt ndizo lengo", () => {
    const v = verifyReceipts([co("CO-001", [])], P([rcpt("CO-001", ["index.html"])]), ["index.html"]);
    expect(v.cos[0]).toMatchObject({ verdict: "APPLIED", targets: ["index.html"] });
  });
});

describe("pack ya Computer (RoundHeader · OCB · COs · repo · raundi zilizopita ≤40 — hakuna kingine)", () => {
  const ocb = buildOCBForComputer({ project: { name: "xmdtest-fix", summary: "tiny" }, map: null, stage: "FIX", self: "computer", round: { current: 1, max: 10 }, counts: { lockedDecisions: 1, milestonesDone: [], openDefects: 1, waivers: 0 } }, { ledger: ["A1 Typography: Inter only, no serif"] });
  it("OCB ya FIX: FINISH = receipts (si Build Report) + LOCKED LEDGER", () => {
    expect(ocb).toMatch(/YOU ARE HERE: FIX/);
    expect(ocb).toMatch(/FINISH: no finish without a valid receipt per order/);
    expect(ocb).not.toMatch(/without the Build Report/);
    expect(ocb).toMatch(/LOCKED LEDGER .*A1 Typography: Inter only/);
  });
  it("mpangilio wa sehemu + COs kamili (JSON) + mkataba wa receipts; raundi zilizopita zinakatwa ≤40", () => {
    const prev = prevChangesLines(Array.from({ length: 3 }, (_, r) => ({ round: r + 1, cos: Array.from({ length: 20 }, (_, i) => ({ orderId: `CO-${i}`, attempt: 1, verdict: "APPLIED" as const, receiptStatus: "DONE" as const, receipt: "VALID" as const, targets: ["a"], touched: ["a"], phantom: [], diff: { files: 1, added: 1, deleted: 0 } })) })));
    expect(prev.length).toBe(PREV_CHANGES_MAX_LINES);
    const pack = renderFixPack({ roundHeader: { milestoneId: "M1", round: 1, maxRounds: 10, closedDefects: 0, open: [{ id: "D-001", attempt: 1 }], waivers: 0, roundsLeft: 9 }, ocb, changeOrders: [co("CO-001", ["src/styles.css"])], repo: { tree: "./src/styles.css", gitLog: "abc seed" }, prevChanges: prev, milestoneId: "M1", round: 1 });
    const order = ["ROUND 1/10 (M1)", "=== OPERATION CONTEXT", "## CHANGE ORDERS (1)", "## REPO SUMMARY", "## WHAT PREVIOUS ROUNDS CHANGED", "## RECEIPTS + FINISH"].map((h) => pack.indexOf(h));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    expect(pack).toContain('"desired": "h1 color #F2F0EB"');
    expect(pack).toContain('git commit -m "M1 R1: CO-001"');
    expect(pack).not.toMatch(/Build Report|## LEDGER|Mpango Kazi/);
  });
});

describe("checks za raundi + historia ya defects", () => {
  const plan = "Build Command: `npm run build`\nTest Command: none\nStart Command: `npx serve -l 4173 .`\n- route: / · states: default · viewports: 375x667, 1280x800\n- route: /about · states: default · viewports: 375x667";
  it("acceptance za COs (id = CO/check) + global: build, console_clean, no_horizontal_overflow kwenye routes muhimu; tests hazipo → hazidaiwi", () => {
    const rc = roundChecks([co("CO-001", ["src/styles.css"])], plan);
    expect(rc.checks.map((c) => c.id)).toEqual(["CO-001/h1-color", "global/build", "global/console_clean", "global/no_horizontal_overflow"]);
    expect(rc.routes).toEqual(["/", "/about"]);
    expect(rc.owner["CO-001/h1-color"]).toBe("CO-001");
    expect(rc.startCommand).toBe("npx serve -l 4173 .");
  });
  it("historia ya defect: kila raundi inaongezwa (round, result, cause) + attempts++ + OPEN → IN_FIX ikiguswa", () => {
    const d: Defect = { id: "D-001", milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "type", severity: "major", title: "h1", evidence: ["S-001"], expected: "x", actual: "y", status: "OPEN", attempts: 0, history: [] };
    const v = verifyReceipts([co("CO-001", ["src/styles.css"])], P([rcpt("CO-001", ["src/styles.css"])]), ["src/styles.css"]);
    const [out] = applyRoundToDefects([d], [co("CO-001", ["src/styles.css"])], v, 1, { "CO-001": { pass: 1, fail: 0, error: 0 } });
    expect(out).toMatchObject({ status: "IN_FIX", attempts: 1, history: [{ round: 1, result: "CO-001: APPLIED · checks 1P/0F/0E", cause: "receipt DONE" }] });
  });
  it("test hooks: inert bila XMD_TEST_HOOKS=1", () => {
    expect(testFixNoop("M1", { XMD_TEST_FIX_NOOP_M1: "1" } as any)).toBe(false);
    expect(testFixNoop("M1", { XMD_TEST_HOOKS: "1", XMD_TEST_FIX_NOOP_M1: "1" } as any)).toBe(true);
    expect(testFixInput({ XMD_TEST_FIX_INPUT: "/x.json" }, () => "{}")).toBeNull();
    expect(testFixInput({ XMD_TEST_HOOKS: "1", XMD_TEST_FIX_INPUT: "/x.json" }, () => JSON.stringify({ planMarkdown: "", files: {}, changeOrders: [] }))).not.toBeNull();
  });
});

// ── runFixRound kupitia njia halisi (maybeCloseMilestones → runMilestoneBuild → FIXING → runFixRound) ──
const SID = "xmdtest-fix-0001";
const MAP: MilestoneMap = { version: 1, sessionId: SID, totalAgendas: 1, generatedBy: "test", usedFallback: false,
  milestones: [{ id: "M1", title: "Fix", agendas: { from: 1, to: 1 }, phase: "foundation", reviewMode: "visual", roster: ["optimus"], rationale: "" }] } as any;
const PLAN = "Build Command: `true`\nTest Command: none\nStart Command: `python3 -m http.server 4173`\n- route: / · states: default · viewports: 375x667";

async function seed(cos: ChangeOrder[]) {
  const put = (k: string, data: any) => db.set(`${SID}|${k}`, { version: 1, data });
  put("plan:M1", { markdown: PLAN, executable: true });
  put("cos:M1", { version: 1, changeOrders: cos });
  put("defects", { version: 1, defects: [{ id: "D-001", milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "type", severity: "major", title: "h1", evidence: ["S-001"], expected: "x", actual: "y", status: "OPEN", attempts: 0, history: [] }] });
  const ok = <T,>(r: { state: T } | { error: string }): T => { if ("error" in r) throw new Error(r.error); return r.state; };
  let st: MilestoneState = ok(planSteps(newMilestoneState("M1"), ["plan", "build", "review"].map((x) => stepIdOf("M1", 0, x))));
  for (const x of ["plan", "build", "review"]) st = ok(setStep(st, stepIdOf("M1", 0, x), "DONE"));
  for (const to of ["PLANNING", "BUILDING", "EVIDENCE", "REVIEW_R0", "FIXING"] as const) st = ok(transition(st, { type: "GOTO", to }));
  put(stateKey("M1"), st);
}
type Attempt = (fix: FixPhaseInput) => BuildOutcome;
function harness(attempts: Attempt[]) {
  const events: any[] = [];
  const calls: FixPhaseInput[] = [];
  const packs: string[] = [];
  const runner: LoopRunner = { id: SID, sessionId: SID, msMap: MAP, msChips: [] };
  const hooks: LoopHooks = {
    bcast: (e) => events.push(e), addChip: () => {}, blog: () => {}, persist: async () => {}, resolvedAgendas: async () => new Set([1]),
    fix: {
      ocb: async () => "=== OPERATION CONTEXT (read this first) ===\nYOU ARE HERE: FIX\n=== END ===",
      run: async (_m, _plan, fix) => { calls.push(fix); packs.push(fix.render({ tree: "./src/styles.css", gitLog: "abc seed" })); return attempts[calls.length - 1](fix); },
      checks: async (_m, rc) => ({ results: rc.checks.map((c) => ({ id: c.id, type: c.type, result: c.id.startsWith("CO-") ? "PASS" as const : "FAIL" as const, detail: "x" })), ms: 5 }),
    },
  };
  return { runner, hooks, events, calls, packs };
}
const raw = (receipts: unknown[] | null, changed: string[], extra: Partial<NonNullable<BuildOutcome["fix"]>> = {}) => ({
  headBefore: "a".repeat(40), diffBase: "a".repeat(40), head: "b".repeat(40), receiptsPath: ".xmd/receipts/R1.json",
  receiptsRaw: receipts ? JSON.stringify(receipts) : null, changed, numstat: changed.map((p) => `1\t1\t${p}`).join("\n"), ...extra,
});
const okOut = (fix: ReturnType<typeof raw>): BuildOutcome => ({ ok: true, finalState: "COMPLETED_VERIFIED", reason: "", fix });

beforeEach(() => { db.clear(); vi.stubEnv("XMD_MILESTONES", "1"); });
afterEach(() => vi.unstubAllEnvs());

describe("runFixRound (loop)", () => {
  it("T1: FIXING → Computer (attempt 1) → APPLIED → checks → fix:M1:R1 + historia → VERIFYING; maybeCloseMilestones inaingia FIXING", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([() => okOut(raw([rcpt("CO-001", ["src/styles.css"])], ["src/styles.css", ".xmd/receipts/R1.json"]))]);
    expect(await maybeCloseMilestones(h.runner, h.hooks)).toEqual(["M1"]);
    expect(h.calls.map((c) => c.attempt)).toEqual([1]);
    expect(h.packs[0]).toMatch(/^ROUND 1\/10 \(M1\)/);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st.status).toBe("VERIFYING");
    expect(st.steps.find((x: any) => x.stepId === "M1.R1.fix").status).toBe("DONE");
    const fx = db.get(`${SID}|${fixKey("M1", 1)}`)!.data;
    expect(fx.perCo[0]).toMatchObject({ orderId: "CO-001", attempt: 1, verdict: "APPLIED", receiptStatus: "DONE", diff: { files: 1, added: 1, deleted: 1 }, checks: { pass: 1, fail: 0, error: 0 } });
    expect(fx.global).toEqual({ pass: 0, fail: 3, error: 0 }); // build + console_clean + overflow (mock: FAIL)
    expect(db.get(`${SID}|defects`)!.data.defects[0]).toMatchObject({ status: "IN_FIX", attempts: 1 });
    expect(h.events.filter((e) => e.type === "fixRound").map((e) => e.phase)).toEqual(["start", "done"]);
    // wito wa pili: VERIFYING → hakuna kinachorudiwa
    expect(await maybeCloseMilestones(h.runner, h.hooks)).toEqual([]);
  });
  it("T2: NO-OP → ujumbe wa kudumu → rerun MARA MOJA (diffBase ya raundi) → APPLIED; rerun haizidi moja", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([
      () => okOut(raw([rcpt("CO-001", ["src/styles.css"])], [], { sabotaged: true })),
      () => okOut(raw([rcpt("CO-001", ["src/styles.css"])], ["src/styles.css"])),
    ]);
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.calls.map((c) => c.attempt)).toEqual([1, 2]);
    expect(h.calls[1].reminder).toBe("Order CO-001 was NOT applied: git diff does not touch src/styles.css. Apply it now and return the receipt.");
    expect(h.calls[1].diffBase).toBe("a".repeat(40));
    expect(h.events.find((e) => e.type === "fixReminder")).toMatchObject({ orderIds: ["CO-001"] });
    const fx = db.get(`${SID}|${fixKey("M1", 1)}`)!.data;
    expect(fx.attempts.map((a: any) => a.notAttempted)).toEqual([["CO-001"], []]);
    expect(fx.verification.rerun).toMatchObject({ before: ["CO-001"], after: [] });
  });
  it("T2b: NO-OP inaendelea baada ya rerun → inabaki NOT_ATTEMPTED (hakuna rerun ya tatu); historia: cause NOT_ATTEMPTED", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([() => okOut(raw([rcpt("CO-001", ["src/styles.css"])], [])), () => okOut(raw([rcpt("CO-001", ["src/styles.css"])], []))]);
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.calls.length).toBe(2);
    expect(db.get(`${SID}|${fixKey("M1", 1)}`)!.data.perCo[0].verdict).toBe("NOT_ATTEMPTED");
    expect(db.get(`${SID}|defects`)!.data.defects[0]).toMatchObject({ status: "OPEN", history: [{ round: 1, cause: "NOT_ATTEMPTED" }] });
  });
  it("T4: BLOCKED + sababu → inarekodiwa, HAIRUDIWI (attempt 1 tu)", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([() => okOut(raw([rcpt("CO-001", [], "BLOCKED", { blockedReason: "contradicts A1" })], []))]);
    await maybeCloseMilestones(h.runner, h.hooks);
    expect(h.calls.length).toBe(1);
    const fx = db.get(`${SID}|${fixKey("M1", 1)}`)!.data;
    expect(fx.perCo[0]).toMatchObject({ verdict: "BLOCKED", blockedReason: "contradicts A1" });
    expect(db.get(`${SID}|defects`)!.data.defects[0].history[0].cause).toBe("BLOCKED: contradicts A1");
  });
  it("T5: Computer PARTIAL (lango: receipts hazipo) → rekodi + step FAILED + M1 BLOCKED; checks haziendeshwi", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([() => ({ ok: false, finalState: "PARTIAL", reason: "PARTIAL: gate failed: receipts: file .xmd/receipts/R1.json does not exist", fix: raw(null, ["src/styles.css"]) })]);
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st).toMatchObject({ status: "BLOCKED", resumeTo: "FIXING" });
    const fx = db.get(`${SID}|${fixKey("M1", 1)}`)!.data;
    expect(fx).toMatchObject({ finalState: "PARTIAL", ok: false });
    expect(fx.perCo[0]).toMatchObject({ receipt: "MISSING" });
    expect(db.get(`${SID}|checks:M1:R1`)!.data.ran).toBe(false);
  });
  it("PAUSED → hatua inabaki RUNNING, M1 FIXING (resume inairudia)", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([() => ({ ok: false, finalState: "PAUSED", reason: "Board pause" })]);
    await maybeCloseMilestones(h.runner, h.hooks);
    const st = db.get(`${SID}|state:M1`)!.data;
    expect(st.status).toBe("FIXING");
    expect(st.steps.find((x: any) => x.stepId === "M1.R1.fix").status).toBe("RUNNING");
  });
  it("bila hooks.fix → FIXING inasubiri (tabia ya task 24 haibadiliki)", async () => {
    await seed([co("CO-001", ["src/styles.css"])]);
    const h = harness([]);
    delete (h.hooks as any).fix;
    expect(await maybeCloseMilestones(h.runner, h.hooks)).toEqual([]);
  });
});
