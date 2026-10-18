// TASK 16 — MilestoneStartPack: kile tu Computer inachohitaji (si chat history).
import { describe, expect, it } from "vitest";
import { buildStartPack, ledgerShort, parseRepoSummary, PREV_REPORTS_MAX_LINES, renderStartPack, REPO_SUMMARY_CMD, summarizePrevBuilds, planGateCommands } from "../startpack";

const M2 = { id: "M2", title: "Second line", agendas: { from: 2, to: 2 }, phase: "quality_deploy", reviewMode: "code", roster: ["optimus"], rationale: "" } as any;
const LEDGER = [
  { agenda_index: 1, agenda_item: "README", status: "LOCKED", decision_summary: "Create README.md with title" },
  { agenda_index: 2, agenda_item: "Append", status: "LOCKED", decision_summary: "Append the line 'Line two'" },
];

describe("startpack", () => {
  it("ledgerShort: agenda za milestone hii PEKEE", () => {
    expect(ledgerShort(M2, LEDGER)).toEqual(["A2 [LOCKED] Append: Append the line 'Line two'"]);
  });

  it("summarizePrevBuilds: ≤ 60 mistari, hakuna code fences; tupu → first milestone", () => {
    expect(summarizePrevBuilds([])).toMatch(/first milestone/);
    const long = Array.from({ length: 200 }, (_, i) => `line ${i}`).join("\n") + "\n```\ncode\n```";
    const s = summarizePrevBuilds([{ id: "M1", finalState: "COMPLETED_UNVERIFIED", report: long }]);
    expect(s.split("\n").length).toBeLessThanOrEqual(PREV_REPORTS_MAX_LINES);
    expect(s.split("\n")[0]).toBe("### M1: COMPLETED_UNVERIFIED");
    expect(s).not.toContain("```");
  });

  it("parseRepoSummary + REPO_SUMMARY_CMD (depth 3 + git log -n 15)", () => {
    expect(REPO_SUMMARY_CMD).toContain("-maxdepth 3");
    expect(REPO_SUMMARY_CMD).toContain("git log --oneline -n 15");
    expect(parseRepoSummary("@@TREE\n./README.md\n@@GIT\nabc123 XMD M1: x\n")).toEqual({ tree: "./README.md", gitLog: "abc123 XMD M1: x" });
    expect(parseRepoSummary("")).toEqual({ tree: "(empty workspace)", gitLog: "(no git history yet)" });
  });

  it("renderStartPack: sehemu (a)–(f), OCB juu, plan ya milestone, bila chat ya awali", () => {
    const pack = buildStartPack({ m: M2, planMarkdown: "# MILESTONE PLAN — M2\nappend", ledger: LEDGER, prevBuilds: [{ id: "M1", finalState: "COMPLETED_UNVERIFIED", report: "README.md created" }], defects: [], ocb: "=== OPERATION CONTEXT ===\nYOU ARE HERE: BUILD" });
    const md = renderStartPack(pack, { tree: "./README.md", gitLog: "abc XMD M1" }, "IMPORTANT: NEW sandbox");
    expect(md.startsWith("=== OPERATION CONTEXT ===")).toBe(true);
    for (const h of ["## (b) Ledger decisions", "## (c) Repo summary", "## (d) Previous Build Reports", "## (e) Inherited defects", "## (a) Milestone M2 plan"]) expect(md).toContain(h);
    expect(md).toContain("A2 [LOCKED] Append");
    expect(md).not.toContain("A1 [LOCKED]");
    expect(md).toContain("### M1: COMPLETED_UNVERIFIED");
    expect(md).toContain("IMPORTANT: NEW sandbox");
    expect(md).toContain("# MILESTONE PLAN — M2");
  });
});

describe("TASK-18 · planGateCommands (amri za lango kutoka plan §4)", () => {
  it("Build/Test Command (backticks/bold) → amri; Test 'none' → requiresTests false", () => {
    expect(planGateCommands("## 4. Tech\nStyling + Dependencies: x\n**Build Command:** `npm run build`\nTest Command: `npm test`\n")).toEqual({ buildCommand: "npm run build", testCommand: "npm test", requiresTests: true });
    expect(planGateCommands("Build Command: test -s README.md\nTest Command: none\n")).toEqual({ buildCommand: "test -s README.md", testCommand: "", requiresTests: false });
    expect(planGateCommands("hakuna mistari")).toEqual({ buildCommand: "", testCommand: "", requiresTests: false });
  });
});
