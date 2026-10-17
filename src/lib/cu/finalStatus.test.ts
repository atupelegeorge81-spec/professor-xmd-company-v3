// TASK-6: status ya session haibaki "running" baada ya CU kumaliza (smoke 2 ya Task 5).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import type { CuHooks } from "./engine";

vi.mock("@/lib/server/appwrite", () => ({
  appwriteConfigured: true,
  storage: { createFile: vi.fn(async () => ({ $id: "file-mock-1" })) },
  databases: {}, DB: {}, SCREENSHOTS_BUCKET: "bucket-test",
}));

import { handleCuEvent } from "./engine";
import { serialQueue } from "../serialQueue";

const fakeRunner = () => ({
  id: "r-final", project: "xmdtest", status: "running", items: [], buffer: [], subs: new Set(),
  startedAt: Date.now(), mode: "plan", computerPlanned: true, finale: { planId: "p", reportId: "r", memory: true },
}) as unknown as Runner;

function fakeHooks() {
  const persists: string[] = [];
  const hooks: CuHooks = {
    persist: async (st: string) => { persists.push(st); },
    bcast: () => {}, blog: () => {}, addChip: () => {}, recordUsage: () => {}, usage: {}, byProvider: {}, title: "t",
  };
  return { hooks, persists };
}

describe("TASK-6 · schedulePersist baada ya CU kumaliza", () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it("tukio linalochelewa baada ya run_end (done) → persist ni \"completed\", si \"running\"", async () => {
    const runner = fakeRunner();
    const { hooks, persists } = fakeHooks();
    await handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x", model: "m" });
    await handleCuEvent(runner, hooks, { i: 2, type: "finish", report: "Ripoti halisi ya kazi imekamilika." });
    await handleCuEvent(runner, hooks, { i: 3, type: "run_end", status: "done", steps: 2, ms: 1000 });
    expect(runner.cu!.done).toBe(true);
    const at = persists.length;
    expect(persists[at - 1]).toBe("completed");
    await handleCuEvent(runner, hooks, { i: 4, type: "think_start" } as any);
    await handleCuEvent(runner, hooks, { i: 5, type: "think_end", step: 3, ms: 5 } as any); // throttled (2.5s)
    await vi.advanceTimersByTimeAsync(3_000);
    const late = persists.slice(at);
    expect(late.length).toBeGreaterThan(0);
    expect(late).not.toContain("running");
    expect(late.every((s) => s === "completed")).toBe(true);
  });

  it("run_end isiyo ok (stuck) → tukio linalochelewa linaandika \"finale_incomplete\"", async () => {
    const runner = fakeRunner();
    const { hooks, persists } = fakeHooks();
    await handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x", model: "m" });
    await handleCuEvent(runner, hooks, { i: 2, type: "run_end", status: "stuck", steps: 1, ms: 10 });
    const at = persists.length;
    await handleCuEvent(runner, hooks, { i: 3, type: "think_start" } as any);
    await handleCuEvent(runner, hooks, { i: 4, type: "think_end", step: 1, ms: 5 } as any);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(persists.slice(at)).toEqual(["finale_incomplete"]);
  });

  it("wakati CU bado inaendelea → \"running\" (tabia ya kawaida haibadiliki)", async () => {
    const runner = fakeRunner();
    const { hooks, persists } = fakeHooks();
    await handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x", model: "m" });
    expect(persists).toEqual(["running"]);
  });
});

describe("TASK-6 · serialQueue (persist ya session kwa foleni)", () => {
  it("write ya polepole iliyoanza kwanza haitui BAADA ya ya mwisho", async () => {
    const q = serialQueue(30_000);
    const landed: string[] = [];
    const write = (st: string, ms: number) => () => new Promise<void>((r) => setTimeout(() => { landed.push(st); r(); }, ms));
    const a = q(write("running", 60));   // polepole
    const b = q(write("completed", 5));  // haraka — bila foleni ingetua kwanza na "running" ingeshinda
    await Promise.all([a, b]);
    expect(landed).toEqual(["running", "completed"]);
  });

  it("kazi iliyoshindwa haizuii zinazofuata", async () => {
    const q = serialQueue(30_000);
    const p1 = q(async () => { throw new Error("x"); });
    await expect(p1).rejects.toThrow("x");
    expect(await q(async () => "ok")).toBe("ok");
  });

  it("kazi isiyorudi kamwe → inayofuata inaendelea baada ya kikomo", async () => {
    vi.useFakeTimers();
    try {
      const q = serialQueue(1_000);
      void q(() => new Promise<void>(() => {}));
      let done = false;
      const p = q(async () => { done = true; });
      await vi.advanceTimersByTimeAsync(1_100);
      await p;
      expect(done).toBe(true);
    } finally { vi.useRealTimers(); }
  });
});
