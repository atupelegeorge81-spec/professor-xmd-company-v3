// TASK-16: awamu ya XMD Computer kwa kila milestone — run_end inamaliza AWAMU (si session), liveness, concurrency guard.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import type { CuHooks } from "./engine";

vi.mock("@/lib/server/appwrite", () => ({
  appwriteConfigured: true, storage: { createFile: async () => ({ $id: "f" }) }, databases: { listDocuments: async () => ({ documents: [] }) },
  DB: "db", SCREENSHOTS_BUCKET: "bucket-test",
}));
vi.mock("@/lib/boardRunner", () => ({ resumeRun: async () => null, streamRunner: () => ({}) }));

import { __t16Snapshot, checkCuStall, CU_LIVENESS_MS, ensureCuState, handleCuEvent, startComputerPhase } from "./engine";

const fakeRunner = () => ({
  id: "r-16", sessionId: "xmdtest-16", project: "xmdtest-task16", status: "running", items: [] as any[], buffer: [], subs: new Set(),
  startedAt: Date.now(), mode: "plan", computerPlanned: true, finale: {},
}) as unknown as Runner;
const hooksOf = (persisted: string[], events: any[] = []) => ({
  persist: async (st: string) => { persisted.push(st); },
  bcast: (e: any) => events.push(e), blog: () => {}, addChip: () => {}, recordUsage: () => {}, usage: {}, byProvider: {}, title: "t",
}) as unknown as CuHooks;
const msPhase = (runner: Runner, id = "M1") => {
  const cu = ensureCuState(runner) as any;
  cu.msMode = true; cu.msPhase = { id, startedAt: Date.now() }; cu.done = false;
  let resolved = false;
  cu.phaseDone = new Promise<void>((r) => { cu.phaseResolve = () => { resolved = true; r(); }; });
  return { cu, resolved: () => resolved };
};

beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("TASK-16 · run_end ya awamu ya milestone", () => {
  it("finish + run_end done + gate passed → COMPLETED_VERIFIED (TASK-18); persist \"running\" (Board inaendelea); session/finale haziguswi", async () => {
    const runner = fakeRunner();
    const p = msPhase(runner);
    const persisted: string[] = []; const events: any[] = [];
    const h = hooksOf(persisted, events);
    await handleCuEvent(runner, h, { type: "finish", i: 3, report: "Ripoti ya M1", status: "done" } as any);
    await handleCuEvent(runner, h, { type: "run_end", i: 4, status: "done", steps: 5, ms: 1000, gate: { passed: true, blocks: 1, failed: [] } } as any);
    expect([p.cu.finalState, p.cu.done, p.resolved()]).toEqual(["COMPLETED_VERIFIED", true, true]);
    expect(persisted).not.toContain("completed");
    expect(persisted.at(-1)).toBe("running");
    expect((runner as any).finale.computer).toBeUndefined();
    expect(runner.items.filter((it: any) => it.cu === "run_end").map((it: any) => [it.milestone, it.finalState])).toEqual([["M1", "COMPLETED_VERIFIED"]]);
    expect(events.some((e) => e.cu?.type === "phase_done" && e.cu.milestone === "M1" && e.cu.ok === true)).toBe(true);
  });

  it("TASK-18: run_end done BILA gate → PARTIAL (si COMPLETED_UNVERIFIED); status partial + gate failed → PARTIAL na orodha", async () => {
    const r1 = fakeRunner(); const p1 = msPhase(r1);
    await handleCuEvent(r1, hooksOf([]), { type: "finish", i: 3, report: "R", status: "done" } as any);
    await handleCuEvent(r1, hooksOf([]), { type: "run_end", i: 4, status: "done", steps: 1, ms: 1 } as any);
    expect([p1.cu.finalState, p1.cu.finalReason]).toEqual(["PARTIAL", "PARTIAL: completion gate did not pass (no gate result)"]);
    const r2 = fakeRunner(); const p2 = msPhase(r2);
    await handleCuEvent(r2, hooksOf([]), { type: "run_end", i: 4, status: "partial", steps: 1, ms: 1, gate: { passed: false, partial: true, blocks: 3, failed: ["build: `exit 3` exited 3 — "] } } as any);
    expect(p2.cu.finalState).toBe("PARTIAL");
    expect(p2.cu.finalReason).toContain("PARTIAL: gate failed: build: `exit 3` exited 3");
  });

  it("run_end stuck (liveness) → STUCK, reason ina sababu", async () => {
    const runner = fakeRunner();
    const p = msPhase(runner);
    await handleCuEvent(runner, hooksOf([]), { type: "run_end", i: 2, status: "stuck", fatal: "liveness: no bridge event for 60s" } as any);
    expect(p.cu.finalState).toBe("STUCK");
    expect(String(p.cu.finalReason)).toContain("liveness");
  });

  it("run_end nje ya awamu (msMode bila msPhase) → inapuuzwa (hakuna item, hakuna \"completed\")", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner) as any;
    cu.msMode = true; cu.done = true;
    const persisted: string[] = [];
    await handleCuEvent(runner, hooksOf(persisted), { type: "run_end", i: 9, status: "done" } as any);
    expect(runner.items.filter((it: any) => it.cu === "run_end")).toHaveLength(0);
    expect(persisted).not.toContain("completed");
  });

  it("tukio linalochelewa baada ya awamu → persist \"running\" (si completed/finale_incomplete)", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner) as any;
    cu.msMode = true; cu.done = true; cu.finalState = "COMPLETED_UNVERIFIED";
    const persisted: string[] = [];
    await handleCuEvent(runner, hooksOf(persisted), { type: "github", i: 11, url: "https://github.com/x/y" } as any);
    expect(persisted.at(-1)).toBe("running");
  });

  it("checkCuStall haipumzishi njia ya milestone (liveness yake ndiyo sheria)", () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner) as any;
    cu.msMode = true; cu.lastEventAt = Date.now() - 60 * 60_000; cu.startedAt = cu.lastEventAt;
    expect(checkCuStall(runner, hooksOf([]))).toBe("ok");
  });

  it("CU_LIVENESS_MS default = dakika 15", () => {
    expect(CU_LIVENESS_MS).toBe(15 * 60 * 1000);
  });

  it("concurrency guard: awamu ikiendelea, ya pili inarudi ERROR bila kugusa sandbox", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner) as any;
    cu.msBusy = true;
    const r = await startComputerPhase(runner, hooksOf([]), { milestoneId: "M2", planMarkdown: "# p", startPack: { milestoneId: "M2", title: "x", planMarkdown: "# p", ledger: [], previousReports: "", defects: [], ocb: "" } });
    expect([r.ok, r.finalState]).toEqual([false, "ERROR"]);
    expect(r.reason).toContain("concurrency guard");
    expect(cu.msBusy).toBe(true); // mmiliki wa awamu ya kwanza bado anaishikilia
  });
});

describe("TASK-16 · snapshot ya mwisho wa awamu (tar + git) → restore kwenye sandbox mpya", () => {
  const sbxOf = (stdout: string, cmds: string[]) => ({
    commands: { run: async (c: string) => { cmds.push(c); return { stdout }; } },
    files: { read: async () => new Uint8Array([1, 2, 3]) },
  });
  const logs = (): [CuHooks, string[]] => { const l: string[] = []; return [{ blog: (_t: string, m: string) => l.push(m) } as unknown as CuHooks, l]; };

  it("msSnapshot: tar ina .git (haijatengwa), inatenga node_modules/.xmd/oh → cu.snapshot", async () => {
    const cmds: string[] = []; const cu = ensureCuState(fakeRunner()) as any; const [h, l] = logs();
    const n = await __t16Snapshot.msSnapshot(sbxOf("15342", cmds), cu, h, "M1");
    expect(n).toBe(3);
    expect(cu.snapshot).toEqual({ fileId: "f", bucketId: expect.any(String) });
    expect(cmds[0]).toContain("--exclude ./.xmd/oh");
    expect(cmds[0]).toContain("--exclude node_modules");
    expect(cmds[0]).not.toContain(".git");
    expect(l.join(" ")).toContain("snapshot ya workspace (pamoja na git)");
  });
  it("msSnapshot: tar tupu → 0, snapshot haiwekwi, onyo", async () => {
    const cu = ensureCuState(fakeRunner()) as any; const [h, l] = logs();
    expect(await __t16Snapshot.msSnapshot(sbxOf("0", []), cu, h, "M1")).toBe(0);
    expect(cu.snapshot).toBeUndefined();
    expect(l.join(" ")).toContain("haikuhifadhiwa");
  });
  it("msRestoreSnapshot: bila snapshot → -1 (kiovu kinatumika); hakuna command", async () => {
    const cmds: string[] = []; const cu = ensureCuState(fakeRunner()) as any;
    expect(await __t16Snapshot.msRestoreSnapshot(sbxOf("", cmds), cu)).toBe(-1);
    expect(cmds).toHaveLength(0);
  });
  it("msRestoreSnapshot: XMD_TAR_OK → idadi ya faili; bila OK → -1", async () => {
    const cu = ensureCuState(fakeRunner()) as any; cu.snapshot = { fileId: "abc", bucketId: "b" };
    const cmds: string[] = [];
    expect(await __t16Snapshot.msRestoreSnapshot(sbxOf("XMD_TAR_OK\n6\n", cmds), cu)).toBe(6);
    expect(cmds[0]).toContain("tar xzf");
    expect(await __t16Snapshot.msRestoreSnapshot(sbxOf("curl: (22) 404\n", []), cu)).toBe(-1);
  });
});

describe("TASK-17 · msReadBuildReport (ripoti + git diff ya awamu)", () => {
  const sbx = (stdout: string, cmds: string[]) => ({ commands: { run: async (c: string) => { cmds.push(c); return { stdout }; } } });
  const h = { blog: () => {} } as unknown as CuHooks;
  it("ripoti ipo + HEAD ya mwanzo → `git diff --name-only <sha> HEAD`", async () => {
    const cmds: string[] = [];
    const r = await __t16Snapshot.msReadBuildReport(sbx("XMD_REPORT_FOUND\n# M2 Build Report\n## 1 Summary\nx\n\n@@XMD_DIFF@@\nREADME.md\n.xmd/reports/M2-build-report.md\n", cmds), h, "M2", "80306f7aa");
    expect(r).toMatchObject({ found: true, path: ".xmd/reports/M2-build-report.md", markdown: "# M2 Build Report\n## 1 Summary\nx", changed: ["README.md", ".xmd/reports/M2-build-report.md"] });
    expect(cmds[0]).toContain("git diff --name-only 80306f7aa HEAD");
  });
  it("repo mpya (bila HEAD ya mwanzo) → ls-tree ya HEAD (commits zote za awamu); ripoti haipo → found:false", async () => {
    const cmds: string[] = [];
    const r = await __t16Snapshot.msReadBuildReport(sbx("\n@@XMD_DIFF@@\nREADME.md\n", cmds), h, "M1", "");
    expect(r).toMatchObject({ found: false, markdown: "", changed: ["README.md"] });
    expect(cmds[0]).toContain("git ls-tree -r --name-only HEAD");
  });
});
