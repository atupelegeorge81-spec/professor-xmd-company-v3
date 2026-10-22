// TASK-33 (MISSION ONE) — mini-report ya review inayokua: coverage (ids), renderMemo (3 kamili / za zamani zimefupishwa),
// historia ya defects, findings za R0 za reviewer mwenyewe, uthibitisho (CONFIRM/AMEND), sehemu mpya za prompts (verify + Computer).
import { describe, expect, it } from "vitest";
import {
  addMemoEntry, checkR0Coverage, defectHistoryLines, memoHead, memoKey, missingIds, optimusNote, ownR0Findings, parseConfirm, r0Facts, r0RequiredIds, renderMemo,
  type MemoComplete, type MemoEntry, type MemoRecord, type MemoStore, type R0MemoInput,
} from "../reviewMemory";
import { buildVerifyPrompt, type VerifyContext } from "../verify";
import { renderFixPack } from "../fixRound";
import type { ChangeOrder, Defect, MilestoneMap } from "../types";

const D = (id: string, x: Partial<Defect> = {}): Defect => ({ id, milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "nav", severity: "major", title: `title ${id}`, evidence: ["S-001"], expected: "e", actual: "a", status: "OPEN", attempts: 0, history: [], ...x });
const CO = (id: string, defectIds: string[], x: Partial<ChangeOrder> = {}): ChangeOrder => ({ id, defectIds, attempt: 1, priority: 1, location: { files: ["src/a.css"], route: "/", selector: "nav" }, current: "c", desired: `desired of ${id}`, visionNote: "v", mode: "standard", acceptance: [], ...x });
const memStore = (): MemoStore & { map: Map<string, any> } => {
  const map = new Map<string, any>();
  return { map, get: async (k) => (map.has(k) ? structuredClone(map.get(k)) : null), update: async (k, f) => { const v = f(map.has(k) ? structuredClone(map.get(k)) : null); map.set(k, v); return v; } };
};
const R0: R0MemoInput = {
  milestoneId: "M1", reviewId: "R-M1-0", consensus: false, closeReason: "owner-turn cap",
  defects: [D("D-001"), D("D-002")], invalidDefects: [{ id: "D-002", reason: "both reviewers: screenshot shows it is fine" }],
  accepted: [{ id: "P-01", title: "Sticky header", detail: "sticky", by: "frontend" }], rejected: [{ id: "P-02", reason: "" }], changeRequests: [],
  changeOrders: [CO("CO-001", ["D-001"]), CO("CO-002", [], { decisionIds: ["R-M1-0/P-01"] })],
};

describe("TASK-33: coverage ya vitambulisho", () => {
  it("missingIds: mpaka wa neno (P-01 ≠ P-012, D-001 ≠ D-0011), bila kujali herufi kubwa", () => {
    expect(missingIds("P-012 and D-0011 only", ["P-01", "D-001"])).toEqual(["P-01", "D-001"]);
    expect(missingIds("fixed (p-01), d-001.", ["P-01", "D-001"])).toEqual([]);
    expect(missingIds("CO-003: ok", ["CO-003", "CO-003"])).toEqual([]);
  });
  it("(b) R0: kila defect + pendekezo lililokubaliwa + CO; pointi iliyoachwa → ok:false", () => {
    expect(r0RequiredIds(R0)).toEqual(["D-001", "D-002", "P-01", "CO-001", "CO-002"]);
    expect(checkR0Coverage("D-001 D-002 P-01 CO-001 CO-002", R0)).toEqual({ ok: true, missing: [] });
    expect(checkR0Coverage("D-001 D-002 CO-001 CO-002 (the sticky header was agreed)", R0)).toEqual({ ok: false, missing: ["P-01"] });
  });
  it("r0Facts: batili + sababu, no consensus, COs na malengo yao", () => {
    const f = r0Facts(R0);
    expect(f).toContain("NO consensus");
    expect(f).toContain("D-002 [major] title D-002 — by designer · INVALID (both reviewers: screenshot shows it is fine)");
    expect(f).toContain("- P-02 — no consensus");
    expect(f).toContain("- CO-002 → R-M1-0/P-01 · desired: desired of CO-002");
  });
});

describe("TASK-33: Optimus note + addMemoEntry", () => {
  it("note inakosa id → jaribio la pili linaambiwa kilichoachwa; bado kikiachwa → missing kinarekodiwa", async () => {
    const seen: string[] = [];
    const complete: MemoComplete = async (_a, purpose, msgs) => { seen.push(`${purpose}|${/OMITTED: ([^\n]*)/.exec(msgs[1].content)?.[1] || ""}`); return "only CO-001"; };
    const r = await optimusNote({ kind: "verify", milestoneId: "M1", round: 2, head: "h", facts: "f", ids: ["CO-001", "CO-002"], complete });
    expect(r).toMatchObject({ by: "optimus", missing: ["CO-002"], attempts: 2 });
    expect(seen).toEqual(["memo:verify:M1:R2:a1|", "memo:verify:M1:R2:a2|CO-002 — mention every one of them this time."]);
  });
  it("LLM ikitupa kosa → sehemu ya code peke yake (loop haisimami)", async () => {
    const r = await optimusNote({ kind: "fix", milestoneId: "M1", round: 1, head: "h", facts: "f", ids: [], complete: async () => { throw new Error("429"); } });
    expect(r).toEqual({ note: "", missing: [], by: "code", attempts: 1 });
  });
  it("addMemoEntry ni idempotent (resume haiandiki upya wala haiiti LLM)", async () => {
    const s = memStore();
    let n = 0;
    const complete: MemoComplete = async () => { n++; return "CO-001 passed because the check passed"; };
    const a = await addMemoEntry(s, { milestoneId: "M1", round: 1, kind: "verify", facts: "x", ids: ["CO-001"], complete, at: "2026-10-22T20:48:00Z" });
    const b = await addMemoEntry(s, { milestoneId: "M1", round: 1, kind: "verify", facts: "y", ids: ["CO-001"], complete });
    expect(a.created).toBe(true);
    expect(b.created).toBe(false);
    expect(n).toBe(1);
    expect((s.map.get(memoKey("M1")) as MemoRecord).entries).toHaveLength(1);
    expect(a.entry.head).toBe("M1 · R1 · verify · 20:48 UTC");
    expect(memoHead("M3", 2, "redecide", "bad")).toBe("M3 · R2 · redecide");
  });
});

describe("TASK-33: renderMemo · historia · findings za R0", () => {
  const E = (k: number): MemoEntry => ({ id: `fix:R${k}`, kind: "fix", milestoneId: "M1", round: k, at: "", head: `M1 · R${k} · fix`, facts: `facts ${k} ${"x".repeat(700)}`, note: k === 1 ? "" : `note ${k}`, ids: [`CO-00${k}`], missing: [], by: "code" });
  it("ingizo 3 za mwisho KAMILI, za zamani zimefupishwa (≤500 chars + ids)", () => {
    const t = renderMemo({ version: 1, milestoneId: "M1", entries: [1, 2, 3, 4, 5].map(E) });
    expect(t.match(/\(compressed\)/g)).toHaveLength(2);
    expect(t).toContain("### M1 · R1 · fix (compressed)\nfacts 1");
    expect(t).toContain("ids: CO-001");
    expect(t).toContain("### M1 · R5 · fix\nfacts 5");
    expect(t).toContain("Optimus: note 5");
    const r1 = t.slice(t.indexOf("### M1 · R1 · fix (compressed)"), t.indexOf("### M1 · R2"));
    expect(r1.length).toBeLessThan(600); // iliyofupishwa haina urefu kamili (facts ni 700+)
    expect(renderMemo(null)).toBe("");
  });
  it("defectHistoryLines: majaribio, sababu, diagnosis + COs zilizopita; defects zisizojaribiwa haziorodheshwi", () => {
    const d1 = D("D-013", { status: "REOPENED", attempts: 2, history: [
      { round: 1, result: "verify: CO-004 FAIL", cause: "contrast still 3.1:1" },
      { round: 2, result: "ESCALATED", cause: "attempt 2", mode: "concrete", diagnosis: { cause: "ATTEMPTED_WRONG", reason: "wrong selector" } },
    ] });
    const lines = defectHistoryLines([d1, D("D-020"), D("D-099", { milestoneId: "M2", attempts: 3 })], "M1", [CO("CO-004", ["D-013"]), CO("CO-007", ["D-013"], { attempt: 2, mode: "concrete" })]);
    expect(lines).toEqual([
      "- D-013 [REOPENED, major, attempts 2] title D-013",
      "  · R1: verify: CO-004 FAIL — contrast still 3.1:1",
      "  · R2: ESCALATED (concrete) — attempt 2 · diagnosis ATTEMPTED_WRONG: wrong selector",
      "  · CO-004 (attempt 1, standard): desired of CO-004",
      "  · CO-007 (attempt 2, concrete): desired of CO-007",
    ]);
  });
  it("ownR0Findings: defects/proposals/notes za reviewer HUYU tu (kamili: expected/actual/evidence)", () => {
    const table = { defects: [D("D-001", { expected: "4.5:1", actual: "2.1:1" }), D("D-002", { reportedBy: ["frontend"] })], proposals: [{ id: "P-01", by: "frontend", title: "Sticky", detail: "d", rationale: "r", evidence: [] }], notes: { designer: "my notes" }, decisionRefs: { "D-001": "A2" } };
    const t = ownR0Findings(table, "designer", "designer");
    expect(t).toContain("- D-001 [major, nav] violates A2 title D-001\n  expected: 4.5:1\n  actual: 2.1:1\n  evidence: S-001");
    expect(t).not.toContain("D-002");
    expect(t).toContain("PROPOSALS YOU MADE:\n- (none)");
    expect(t).toContain("YOUR R0 NOTES: my notes");
    expect(ownR0Findings(null, "designer", "designer")).toBe("");
  });
  it("parseConfirm: CONFIRM / AMEND / jibu lisilo sahihi", () => {
    expect(parseConfirm("CONFIRM")).toEqual({ verdict: "CONFIRM", note: "" });
    expect(parseConfirm("**AMEND:** D-001 target is 4.5:1")).toEqual({ verdict: "AMEND", note: "D-001 target is 4.5:1" });
    expect(parseConfirm("Looks good to me")).toBeNull();
  });
});

describe("TASK-33: sehemu mpya za prompts", () => {
  const MAP = { version: 1, sessionId: "xmdtest-t33", totalAgendas: 1, generatedBy: "t", usedFallback: false, milestones: [{ id: "M1", title: "T", agendas: { from: 1, to: 1 }, phase: "foundation", reviewMode: "visual", roster: ["optimus"], rationale: "" }] } as unknown as MilestoneMap;
  const ctx = (x: Partial<VerifyContext> = {}): VerifyContext => ({
    ocb: { project: { name: "xmdtest", summary: "x" }, map: MAP, milestoneId: "M1", round: { current: 2, max: 10 }, counts: { lockedDecisions: 1, milestonesDone: [], openDefects: 1, waivers: 0 } },
    roundHeader: { milestoneId: "M1", round: 2, maxRounds: 10, closedDefects: 0, open: [{ id: "D-001", attempt: 2 }], waivers: 0, roundsLeft: 8 },
    ledger: [], pack: { milestoneId: "M1", round: 2, screenshots: [], domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [], consoleErrors: [], errors: [] } as any,
    changeOrders: [CO("CO-002", ["D-001"])], receipts: [], checkResults: [], defects: [D("D-001")], ...x,
  });
  it("buildVerifyPrompt: mini-report + findings ZAKE + historia + mini-reports za agenda; reviewer mwingine haoni findings zisizo zake", async () => {
    const c = ctx({ memo: "### M1 · R0 · review\nAgreed: D-001", ownR0: { designer: "DEFECTS YOU REPORTED:\n- D-001 designer-own" }, defectHistory: ["- D-001 [REOPENED, major, attempts 1] t", "  · R1: verify: CO-001 FAIL — x"], agendaMiniReports: [{ agendaIndex: 1, title: "Palette", detail: "Ink #111 on paper #F2F0EB" }] });
    const d = (await buildVerifyPrompt("designer", c, { images: false })).text;
    const f = (await buildVerifyPrompt("frontend", c, { images: false })).text;
    for (const s of ["## REVIEW MINI-REPORT", "Agreed: D-001", "## YOUR OWN R0 FINDINGS", "designer-own", "## DEFECT HISTORY", "· R1: verify: CO-001 FAIL", "## AGENDA MINI-REPORTS OF THIS MILESTONE (Optimus)", "### A1 Palette\nInk #111"]) expect(d).toContain(s);
    expect(f).not.toContain("designer-own");
    expect(f).not.toContain("## YOUR OWN R0 FINDINGS");
    expect(d).toContain("NEVER just because another fix round is needed"); // mlango wa requestDiscussion unabaki, ila si kwa sababu dhaifu
  });
  it("buildVerifyPrompt bila kumbukumbu (sessions za zamani) → hakuna sehemu mpya", async () => {
    const t = (await buildVerifyPrompt("designer", ctx(), { images: false })).text;
    for (const s of ["REVIEW MINI-REPORT", "YOUR OWN R0 FINDINGS", "## DEFECT HISTORY", "AGENDA MINI-REPORTS"]) expect(t).not.toContain(s);
  });
  it("renderFixPack: historia ya defects kwa Computer (kabla ya REPO SUMMARY); bila historia → haipo", () => {
    const base = { roundHeader: ctx().roundHeader, ocb: "OCB", changeOrders: [CO("CO-002", ["D-001"])], repo: { tree: "", gitLog: "" }, prevChanges: [], milestoneId: "M1", round: 2 };
    const p = renderFixPack({ ...base, history: ["- D-001 [REOPENED, major, attempts 1] t", "  · R1: verify: CO-001 FAIL — x"] });
    expect(p).toContain("## DEFECT HISTORY — what earlier rounds tried for these defects and why it failed (do NOT repeat a failed approach)\n- D-001");
    expect(p.indexOf("## DEFECT HISTORY")).toBeLessThan(p.indexOf("## REPO SUMMARY"));
    expect(renderFixPack(base)).not.toContain("DEFECT HISTORY");
  });
});
