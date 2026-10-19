// TASK 28 — sheria safi za kufunga milestone: hali ya sign-off, INHERITED (cap), checks za defects zilizorithiwa,
// entry ya ledger, matatizo ya kufunga (medium+ wazi / minor bila backlog / waivers), ripoti ya mwisho, test hooks.
import { describe, expect, it } from "vitest";
import {
  allowedOpenAtSignoff, applyInheritedResults, baselineRound, closeoutProblems, finalReportLine, finalReportRow, inheritedChecks, inheritedFor, inheritedLine,
  inheritedSection, inheritOpenDefects, isInheritedCheck, milestoneLedgerEntry, milestoneTag, signoffStatus,
} from "../signoff";
import { applyTestProfile, testCrashAfterSignoffGit, testMaxRounds } from "../testHooks";
import type { ChangeOrder, Defect, Milestone } from "../types";

const D = (id: string, extra: Partial<Defect> = {}): Defect => ({ id, milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "type", severity: "major", title: `t ${id}`, evidence: ["S-001"], expected: "h1 uppercase", actual: "h1 lowercase", status: "OPEN", attempts: 2, history: [], ...extra });
const CO = (id: string, defectIds: string[], check = "h1-tt"): ChangeOrder => ({ id, defectIds, attempt: 1, priority: 1, location: { files: ["src/styles.css"], route: "/", selector: "h1" }, current: "c", desired: "d", visionNote: "v", mode: "standard",
  acceptance: [{ id: check, type: "computed_style", route: "/", selector: "h1", property: "text-transform", expected: "uppercase" }] });
const M: Milestone = { id: "M1", title: "Landing", agendaItems: [1], dependsOn: [], reviewMode: "visual" } as unknown as Milestone;
const entry = (status: Parameters<typeof milestoneLedgerEntry>[0]["status"], defects: Defect[], waivers: any[] = []) => milestoneLedgerEntry({ m: M, status, round: 3, reason: "r", defects, waivers, acceptedProposals: [], at: "2026-10-19T00:00:00Z" });

describe("sheria za sign-off", () => {
  it("SIGNOFF_MAX_OPEN_SEVERITY = minor: minor tu inaruhusiwa kubaki wazi", () => {
    expect(["blocker", "major", "medium", "minor"].map((s) => allowedOpenAtSignoff({ severity: s as Defect["severity"] }))).toEqual([false, false, false, true]);
  });
  it("signoffStatus: WAIVED → WITH_WAIVERS; minor wazi / defects za milestone nyingine hazibadilishi", () => {
    expect(signoffStatus([D("D-1", { status: "VERIFIED_FIXED" }), D("D-2", { status: "OPEN", severity: "minor" })], "M1")).toBe("SIGNED_OFF");
    expect(signoffStatus([D("D-1", { status: "WAIVED" })], "M1")).toBe("SIGNED_OFF_WITH_WAIVERS");
    expect(signoffStatus([D("D-1", { status: "WAIVED", milestoneId: "M2" })], "M1")).toBe("SIGNED_OFF");
    expect(milestoneTag("M3")).toBe("milestone-M3");
  });
  it("closeoutProblems: medium wazi → imekataliwa; minor wazi ndani ya backlog → sawa; status ≠ waivers → imekataliwa", () => {
    const minor = [D("D-1", { status: "VERIFIED_FIXED" }), D("D-2", { severity: "minor" })];
    const e = entry("SIGNED_OFF", minor);
    expect(e.backlog.map((b) => b.id)).toEqual(["D-2"]);
    expect(closeoutProblems(e, minor)).toEqual([]);
    expect(closeoutProblems({ ...e, backlog: [] }, minor)[0]).toMatch(/missing from the ledger backlog: D-2/);
    const med = [D("D-1", { status: "VERIFIED_FIXED" }), D("D-3", { severity: "medium" })];
    expect(closeoutProblems(entry("SIGNED_OFF", med), med)[0]).toMatch(/above minor: D-3 \(medium\)/);
    const w = [D("D-4", { status: "WAIVED" })];
    expect(closeoutProblems(entry("SIGNED_OFF", w), w)[0]).toMatch(/does not match waivers/);
    expect(closeoutProblems(entry("SIGNED_OFF_WITH_WAIVERS", w, [{ defectId: "D-4", reason: "harmless" }]), w)).toEqual([]);
    expect(closeoutProblems(entry("SIGNED_OFF_WITH_WAIVERS", w, [{ defectId: "D-4", reason: " " }]), w)).toEqual(["a waiver has no reason"]);
  });
});

describe("CAP_REACHED → INHERITED", () => {
  const ds = [D("D-1"), D("D-2", { status: "VERIFIED_FIXED" }), D("D-3", { status: "REOPENED", severity: "minor" }), D("D-9", { milestoneId: "M2" })];
  const cos = [CO("CO-001", ["D-1"], "old"), CO("CO-007", ["D-1"], "h1-tt"), CO("CO-002", ["D-3"], "footer")];
  const after = inheritOpenDefects(ds, "M1", 2, cos);
  it("defects wazi za Mk tu → INHERITED + inheritedFrom + checks za CO ya mwisho; idempotent", () => {
    expect(after.map((d) => d.status)).toEqual(["INHERITED", "VERIFIED_FIXED", "INHERITED", "OPEN"]);
    expect(after[0]).toMatchObject({ inheritedFrom: "M1", attempts: 2 });
    expect(after[0].inheritedChecks!.map((c) => c.id)).toEqual(["inherited/D-1/h1-tt"]);
    expect(after[0].history!.at(-1)!.result).toMatch(/INHERITED by the next milestone \(M1 CAP_REACHED at round 2\)/);
    expect(inheritOpenDefects(after, "M1", 2, cos)).toEqual(after);
  });
  it("ledger: inherited (si backlog), cap haipiti kama 'safi'; CAP bila kurithi → tatizo", () => {
    const e = entry("CAP_REACHED", after);
    expect(e.inherited.map((b) => b.id)).toEqual(["D-1", "D-3"]);
    expect(e.backlog).toEqual([]);
    expect(closeoutProblems(e, after)).toEqual([]);
    expect(closeoutProblems(entry("CAP_REACHED", ds), ds)[0]).toMatch(/still open \(not INHERITED\): D-1, D-3/);
    const row = finalReportRow(e);
    expect(row.clean).toBe(false);
    expect(finalReportLine(row)).toMatch(/M1 CAP_REACHED · round 3 · closed 1 .*INHERITED/);
    expect(finalReportRow(entry("SIGNED_OFF", [D("D-1", { status: "VERIFIED_FIXED" })])).clean).toBe(true);
  });
  it("milestone inayofuata: inheritedFor/line/section (StartPack + plan) — si kwa M1 yenyewe", () => {
    expect(inheritedFor(after, "M1")).toEqual([]);
    expect(inheritedFor(after, "M2").map((d) => d.id)).toEqual(["D-1", "D-3"]);
    const line = inheritedLine(after[0]);
    expect(line).toMatch(/^D-1 \[major\] t D-1 — expected: h1 uppercase · actual: h1 lowercase \(INHERITED from M1, 2 attempt\(s\)\)$/);
    expect(inheritedSection([line])).toMatch(/^## 10\. Inherited Defects[^\n]*\n\n- D-1 \[major\]/);
  });
  it("checks za inherited zinaendeshwa kila raundi ya M2: zote PASS → VERIFIED_FIXED; moja FAIL/haipo → inabaki INHERITED", () => {
    const ic = inheritedChecks(after, "M2");
    expect(ic.checks.map((c) => c.id)).toEqual(["inherited/D-1/h1-tt", "inherited/D-3/footer"]);
    expect(ic.owner["inherited/D-1/h1-tt"]).toBe("inherited:D-1");
    expect(isInheritedCheck({ id: "inherited/D-1/h1-tt" })).toBe(true);
    expect(isInheritedCheck({ id: "h1-tt" })).toBe(false);
    const res = (r1: "PASS" | "FAIL") => [{ id: "inherited/D-1/h1-tt", type: "computed_style", result: r1, detail: "" }] as any;
    const ok = applyInheritedResults(after, "M2", 1, res("PASS"));
    expect(ok.fixed).toEqual(["D-1"]);
    expect(ok.defects[0]).toMatchObject({ status: "VERIFIED_FIXED", inheritedFrom: "M1" });
    expect(ok.defects[2].status).toBe("INHERITED"); // check yake haikuendeshwa
    expect(applyInheritedResults(after, "M2", 1, res("FAIL")).fixed).toEqual([]);
    expect(applyInheritedResults(after, "M1", 1, res("PASS")).fixed).toEqual([]);
  });
});

describe("baselines = evidence inayolingana na HEAD", () => {
  it("raundi ya sign-off imerudishwa (REVERT) → raundi ya mwisho isiyorudishwa; stub/haipo → null; R0 → 0", () => {
    expect(baselineRound(2, { 1: "SAME", 2: "BEST" })).toBe(2);
    expect(baselineRound(3, { 1: "BEST", 2: "REVERT", 3: "REVERT" })).toBe(1);
    expect(baselineRound(4, { 4: "REVERT" })).toBeNull(); // T3 halisi: R1–R3 = stubs za harness
    expect(baselineRound(1, { 1: "REVERT" })).toBe(0);
    expect(baselineRound(0, {})).toBe(0);
  });
});

describe("test hooks za TASK-28", () => {
  it("XMD_TEST_MAX_ROUNDS: inafanya kazi TU na XMD_TEST_HOOKS=1, 1..10", () => {
    expect(testMaxRounds({ XMD_TEST_MAX_ROUNDS: "2" })).toBeNull();
    expect(testMaxRounds({ XMD_TEST_HOOKS: "1", XMD_TEST_MAX_ROUNDS: "2" })).toBe(2);
    expect(testMaxRounds({ XMD_TEST_HOOKS: "1", XMD_TEST_MAX_ROUNDS: "0" })).toBeNull();
    expect(testMaxRounds({ XMD_TEST_HOOKS: "1", XMD_TEST_MAX_ROUNDS: "11" })).toBeNull();
  });
  it("XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_<Mk>: kwa milestone hiyo tu, na TU na XMD_TEST_HOOKS=1 (mara-moja = alama ya store, loop)", () => {
    const env = { XMD_TEST_HOOKS: "1", XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_M1: "1" };
    expect(testCrashAfterSignoffGit("M1", env)).toBe(true);
    expect(testCrashAfterSignoffGit("M2", env)).toBe(false);
    expect(testCrashAfterSignoffGit("M1", { XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_M1: "1" })).toBe(false);
  });
  it("applyTestProfile: tag → env ya profile (XMD_MILESTONES/XMD_TEST_* tu); run isiyo na tag → zinaondolewa; inert bila hooks", () => {
    const files: Record<string, string> = { "/p/inputT4a.json": JSON.stringify({ files: {}, env: { XMD_MILESTONES: "1", XMD_TEST_MAX_ROUNDS: "1", XMD_TEST_MAP_FORCE: [{ to: 1 }], XMD_TEST_SECRET: "x", E2B_API_KEY: "x" } }) };
    const read = (p: string) => { if (!(p in files)) throw new Error("ENOENT"); return files[p]; };
    const env: Record<string, string | undefined> = { XMD_TEST_HOOKS: "1", XMD_TEST_PROFILE_DIR: "/p", XMD_TEST_SECRET: "s" };
    expect(applyTestProfile("xmdtest-site [xmdtest:inputT4a] page", env, read)).toEqual({ name: "inputT4a", keys: ["XMD_TEST_VERIFY_INPUT", "XMD_MILESTONES", "XMD_TEST_MAX_ROUNDS", "XMD_TEST_MAP_FORCE"] });
    expect(env).toMatchObject({ XMD_TEST_VERIFY_INPUT: "/p/inputT4a.json", XMD_MILESTONES: "1", XMD_TEST_MAX_ROUNDS: "1", XMD_TEST_MAP_FORCE: '[{"to":1}]', XMD_TEST_SECRET: "s" });
    expect(env.E2B_API_KEY).toBeUndefined();
    expect(applyTestProfile("Real CEO project, no tag", env, read)).toBeNull();
    expect(env.XMD_MILESTONES).toBeUndefined(); expect(env.XMD_TEST_VERIFY_INPUT).toBeUndefined(); expect(env.XMD_TEST_SECRET).toBe("s");
    expect(applyTestProfile("[xmdtest:nope]", env, read)).toMatchObject({ error: expect.stringMatching(/profile nope/) });
    expect(applyTestProfile("[xmdtest:inputT4a]", { XMD_TEST_PROFILE_DIR: "/p" }, read)).toBeNull();
  });
});
