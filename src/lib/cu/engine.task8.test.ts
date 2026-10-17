// TASK-8 (marekebisho ya CEO): status ya run iliyoresumiwa · pause inaua oh_bridge · ripoti ya orphan haipotei ·
// burst ya boot (graceMs) haiibi session ya instance mmiliki.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import type { CuHooks } from "./engine";

const listDocuments = vi.fn();
vi.mock("@/lib/server/appwrite", () => ({
  appwriteConfigured: true,
  storage: { createFile: async () => ({ $id: "file-mock-8" }) },
  databases: { listDocuments: (...a: unknown[]) => listDocuments(...a) },
  DB: "db", SCREENSHOTS_BUCKET: "bucket-test",
}));
const resumeRun = vi.fn(async () => null);
vi.mock("@/lib/boardRunner", () => ({ resumeRun: (...a: unknown[]) => (resumeRun as any)(...a), streamRunner: () => ({}) }));

import { ensureCuState, handleCuEvent, pauseComputerFromServer, cuChipItem, isRealReport } from "./engine";
import { checkPausedDue } from "./autoResume";

const fakeRunner = (items: any[] = []) => ({
  id: "r-8", sessionId: "sess-8", project: "xmdtest-task8", status: "running", items, buffer: [], subs: new Set(),
  startedAt: Date.now(), mode: "plan", computerPlanned: true, finale: { planId: "p", reportId: "r", memory: true },
}) as unknown as Runner;
const hooksOf = (persisted: string[], cmds: string[] = []) => ({
  persist: async (st: string) => { persisted.push(st); },
  bcast: () => {}, blog: () => {}, addChip: () => {}, recordUsage: () => {}, usage: {}, byProvider: {}, title: "t",
  __cmds: cmds,
}) as unknown as CuHooks;

beforeEach(() => { vi.spyOn(console, "log").mockImplementation(() => {}); vi.spyOn(console, "warn").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("TASK-8 · status ya run iliyoresumiwa", () => {
  it("pausedOnce (historia) + resume (pausedNow=false) → persist \"running\" (zamani: \"paused\" hadi mwisho)", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner);
    cu.pausedOnce = true; cu.pausedNow = false; cu.pausing = false;
    const persisted: string[] = [];
    await handleCuEvent(runner, hooksOf(persisted), { type: "github", i: 5, url: "https://github.com/x/y" } as any);
    expect(persisted.at(-1)).toBe("running");
  });
  it("pause ya SASA (pausing) → persist \"paused\"", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner);
    cu.pausedOnce = true; cu.pausing = true;
    const persisted: string[] = [];
    await handleCuEvent(runner, hooksOf(persisted), { type: "github", i: 6, url: "https://github.com/x/y" } as any);
    expect(persisted.at(-1)).toBe("paused");
  });
  it("finalState ikiwepo bado inashinda (TASK-6c haijavunjwa)", async () => {
    const runner = fakeRunner();
    const cu = ensureCuState(runner);
    cu.pausedOnce = true; cu.finalState = "COMPLETED_UNVERIFIED" as any; cu.done = true;
    const persisted: string[] = [];
    await handleCuEvent(runner, hooksOf(persisted), { type: "deploy", i: 7, url: "https://x.vercel.app" } as any);
    expect(persisted.at(-1)).toBe("completed");
  });
});

describe("TASK-8 · pause inaua bridge ya OpenHands pia", () => {
  it("amri ya pkill ya pause ina oh_bridge.py (pamoja na cu_bridge/cu_brain)", async () => {
    vi.useFakeTimers();
    const runner = fakeRunner();
    const cu = ensureCuState(runner);
    const cmds: string[] = [];
    cu.sandbox = {
      sandboxId: "sbx-8",
      commands: { run: vi.fn(async (c: string) => { cmds.push(c); return { stdout: c.includes("tar czf") ? String(30 * 1024 * 1024) : "" }; }) },
      files: { read: vi.fn(async () => new Uint8Array([1])) }, kill: vi.fn(async () => {}), setTimeout: vi.fn(async () => {}),
    } as any;
    cu.sandboxId = "sbx-8";
    cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
    const p = pauseComputerFromServer(runner, hooksOf([]), "xmdtest pkill", 60_000, "system", { budgetMs: 20_000, maxBytes: 8 * 1024 * 1024 });
    await vi.advanceTimersByTimeAsync(30_000);
    await p;
    const pk = cmds.find((c) => c.includes("pkill")) || "";
    expect(pk).toContain("[o]h_bridge");
    expect(pk).toContain("[c]u_bridge");
    expect(pk).toContain("[c]u_brain");
  });
});

describe("TASK-8 · ripoti iliyofika bila runner haipotei", () => {
  const REPORT = "# RIPOTI KAMILI\nKazi imekamilika.";
  it("finish ya orphan (yenye report) → ensureCuState inarejesha cu.report", () => {
    const runner = fakeRunner([
      cuChipItem({ v: 1, token: "t", maxI: 30, sandboxId: "s", pausedOnce: true } as any),
      { kind: "cu", id: "cu_finish_120", i: 120, cu: "finish", report: REPORT },
    ]);
    expect(ensureCuState(runner).report).toBe(REPORT);
  });
  it("item ya report → seen ina finish:i (replay haitarudia ripoti)", () => {
    const runner = fakeRunner([{ kind: "cu", id: "cu_report_9", i: 77, cu: "report", text: REPORT }]);
    const cu = ensureCuState(runner);
    expect(cu.seen.has("finish:77")).toBe(true);
    expect(cu.report).toBe(REPORT);
  });
  it("error text ya CLI SI ripoti", () => {
    expect(isRealReport("API Error: 429")).toBe(false);
    expect(isRealReport("(hakuna ripoti)")).toBe(false);
    expect(isRealReport("  ")).toBe(false);
    expect(isRealReport(REPORT)).toBe(true);
    const runner = fakeRunner([{ kind: "cu", id: "cu_finish_3", i: 3, cu: "finish", report: "API Error: boom" }]);
    expect(ensureCuState(runner).report).toBeFalsy();
  });
  it("run_end done baada ya urejesho → COMPLETED_UNVERIFIED (si PARTIAL)", async () => {
    const runner = fakeRunner([{ kind: "cu", id: "cu_finish_120", i: 120, cu: "finish", report: REPORT }]);
    const cu = ensureCuState(runner);
    cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
    await handleCuEvent(runner, hooksOf([]), { type: "run_end", i: 121, status: "done", steps: 1, ms: 1000 } as any);
    expect(cu.finalState).toBe("COMPLETED_UNVERIFIED");
  });
});

describe("TASK-8 · checkPausedDue graceMs (burst ya boot wakati wa rolling deploy)", () => {
  const docOf = (resumeAt: number) => ({
    $id: "sess-burst-1",
    items: [cuChipItem({ v: 1, token: "t", maxI: 3, sandboxId: "s", pausedOnce: true, resumeAt, pauseOrigin: "system" } as any)],
  });
  it("resumeAt imepita 10s: grace 30s → HAIGUSWI (mmiliki apate nafasi); grace 0 → inaendelezwa", async () => {
    const now = Date.now();
    listDocuments.mockResolvedValue({ documents: [docOf(now - 10_000)] });
    resumeRun.mockClear();
    expect(await checkPausedDue(true, 30_000)).toBe(0);
    expect(resumeRun).not.toHaveBeenCalled();
    await checkPausedDue(true, 0);
    expect(resumeRun).toHaveBeenCalledWith("sess-burst-1", "system");
  });
  it("resumeAt imepita 45s: grace 30s → inaendelezwa", async () => {
    listDocuments.mockResolvedValue({ documents: [docOf(Date.now() - 45_000)] });
    resumeRun.mockClear();
    await checkPausedDue(true, 30_000);
    expect(resumeRun).toHaveBeenCalledTimes(1);
  });
});
