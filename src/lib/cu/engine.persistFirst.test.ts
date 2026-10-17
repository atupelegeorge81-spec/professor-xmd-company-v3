// TASK-6 (maelezo6): pause inaandika hali KWANZA, snapshot BAADAYE (yenye bajeti + kikomo).
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import type { CuHooks } from "./engine";

const createFile = vi.fn(async () => ({ $id: "file-mock-1" }));
vi.mock("@/lib/server/appwrite", () => ({
  appwriteConfigured: true,
  storage: { createFile: (...a: unknown[]) => (createFile as any)(...a) },
  databases: {}, DB: {}, SCREENSHOTS_BUCKET: "bucket-test",
}));

import { ensureCuState, pauseComputerFromServer, readCuChip, PRESSURE_SNAPSHOT_LIMITS, SNAPSHOT_MAX_BYTES } from "./engine";

const MB = 1024 * 1024;
const fakeRunner = () => ({
  id: "r-pf", sessionId: "sess-pf-1", project: "xmdtest-persist", status: "running", items: [], buffer: [], subs: new Set(),
  startedAt: Date.now(), mode: "plan", computerPlanned: true, finale: { planId: "p", reportId: "r", memory: true },
}) as unknown as Runner;

/** Kila tukio linarekodiwa kwa mpangilio (persist / tar / read / upload) — chip inanakiliwa wakati wa persist. */
function harness(o: { tarBytes?: number; tarDelayMs?: number; readDelayMs?: number } = {}) {
  const order: string[] = [];
  const persisted: { st: string; chip: any }[] = [];
  const runner = fakeRunner();
  const hooks: CuHooks = {
    persist: async (st: string) => { order.push(`persist:${st}`); persisted.push({ st, chip: readCuChip(runner.items as any) }); },
    bcast: () => {}, blog: (_t, m) => { order.push(`blog:${m.slice(0, 40)}`); }, addChip: () => {}, recordUsage: () => {}, usage: {}, byProvider: {}, title: "t",
  };
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const sbx = {
    sandboxId: "sbx-pf",
    commands: {
      run: vi.fn(async (cmd: string) => {
        if (cmd.includes("tar czf")) {
          order.push("tar");
          if (o.tarDelayMs) await new Promise((r) => setTimeout(r, o.tarDelayMs));
          return { stdout: String(o.tarBytes ?? 20480) };
        }
        order.push("pkill");
        return { stdout: "" };
      }),
    },
    files: { read: vi.fn(async () => { order.push("read"); if (o.readDelayMs) await new Promise((r) => setTimeout(r, o.readDelayMs)); return bytes; }) },
    kill: vi.fn(async () => { order.push("kill"); }),
    setTimeout: vi.fn(async () => {}), // heartbeat ya polepole (resumeAt>0)
  };
  const cu = ensureCuState(runner);
  cu.sandbox = sbx as any;
  cu.sandboxId = "sbx-pf";
  cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
  return { runner, hooks, sbx, cu, order, persisted, bytes };
}

beforeEach(() => { vi.useFakeTimers(); createFile.mockClear(); vi.spyOn(console, "log").mockImplementation(() => {}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

describe("TASK-6 · persist KWANZA, snapshot BAADAYE", () => {
  it("persist(\"paused\") ya kwanza inatokea KABLA ya tar; chip ina pausedOnce/resumeAt/pauseOrigin; persist tena baada ya snapshot (rejea ya snapshot)", async () => {
    const h = harness();
    const resumeAt = Date.now() + 60_000;
    const p = pauseComputerFromServer(h.runner, h.hooks, "📜 SIGTERM", resumeAt, "system", PRESSURE_SNAPSHOT_LIMITS);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe(true);
    const firstPersist = h.order.indexOf("persist:paused");
    expect(firstPersist).toBeGreaterThanOrEqual(0);
    expect(firstPersist).toBeLessThan(h.order.indexOf("tar"));
    expect(h.persisted[0].chip).toMatchObject({ pausedOnce: true, resumeAt, pauseOrigin: "system" });
    expect(h.persisted[0].chip.snapshot).toBeUndefined();
    // persist ya pili (baada ya upload) ina rejea ya snapshot
    expect(h.persisted.length).toBeGreaterThanOrEqual(2);
    expect(h.persisted[1].chip.snapshot).toEqual({ fileId: "file-mock-1", bucketId: expect.any(String) });
    expect(h.order.indexOf("persist:paused", firstPersist + 1)).toBeGreaterThan(h.order.indexOf("read"));
  });

  it("hakuna nakala ya pili ya bytes: Uint8Array ileile (buffer ileile) inapelekwa kwenye upload", async () => {
    const h = harness();
    const p = pauseComputerFromServer(h.runner, h.hooks, "x", Date.now() + 60_000, "system", PRESSURE_SNAPSHOT_LIMITS);
    await vi.advanceTimersByTimeAsync(60_000);
    await p;
    const input: any = (createFile.mock.calls[0] as any[])[2];
    expect(input.source.data.buffer).toBe(h.bytes.buffer);
  });

  it("workspace > 8MB (kikomo cha pressure) → snapshot skipped, sandbox HAIUAWI, pause inakamilika na resumeAt sahihi", async () => {
    const h = harness({ tarBytes: 30 * MB });
    const resumeAt = Date.now() + 60_000;
    const p = pauseComputerFromServer(h.runner, h.hooks, "📜 SIGTERM", resumeAt, "system", PRESSURE_SNAPSHOT_LIMITS);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe(true);
    expect(h.order).not.toContain("read");
    expect(createFile).not.toHaveBeenCalled();
    expect(h.order.some((x) => x.startsWith("blog:🎒 snapshot skipped (30.0MB > kikomo 8M"))).toBe(true);
    expect(h.order).not.toContain("kill");
    expect(h.cu.pausedNow).toBe(true);
    expect(h.persisted.at(-1)!.chip).toMatchObject({ pausedOnce: true, resumeAt, pauseOrigin: "system" });
  });

  it("bajeti 20s inaisha (tar polepole) → snapshot skipped, pause bado inakamilika", async () => {
    const h = harness({ tarDelayMs: 60_000 });
    let settledAt = 0;
    const t0 = Date.now();
    const p = pauseComputerFromServer(h.runner, h.hooks, "x", Date.now() + 60_000, "system", PRESSURE_SNAPSHOT_LIMITS).then((v) => { settledAt = Date.now(); return v; });
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe(true);
    expect(settledAt - t0).toBeLessThanOrEqual(20_000 + 4_000 + 1_000); // bajeti 20s + pkill ≤4s (si dakika kadhaa)
    expect(h.order.some((x) => x.startsWith("blog:🎒 snapshot skipped (budget 20000ms"))).toBe(true);
    expect(h.cu.pausedNow).toBe(true);
    // persist ya kwanza haikusubiri bajeti: tukio la kwanza (lisilo blog) ni persist
    expect(h.order.filter((x) => !x.startsWith("blog:"))[0]).toBe("persist:paused");
  });

  it("user Detach (bila limits): kikomo cha zamani 40MB — 30MB INAHIFADHIWA; snapshot mpya → sandbox inauawa baada ya 15s", async () => {
    expect(SNAPSHOT_MAX_BYTES).toBe(40 * MB);
    const h = harness({ tarBytes: 30 * MB });
    const p = pauseComputerFromServer(h.runner, h.hooks, "Detach", 0, "user");
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe(true);
    expect(h.order).toContain("read");
    expect(createFile).toHaveBeenCalledTimes(1);
    expect(h.order).toContain("kill");
    expect(h.order.indexOf("persist:paused")).toBeLessThan(h.order.indexOf("tar")); // persist kwanza hata kwa Detach
    expect(h.persisted.at(-1)!.chip).toMatchObject({ pauseOrigin: "user", resumeAt: 0 });
  });

  it("user Detach: snapshot ikirukwa, snapshot ya ZAMANI si sababu ya kuua sandbox", async () => {
    const h = harness({ tarBytes: 50 * MB });
    h.cu.snapshot = { fileId: "old-snap", bucketId: "b" };
    const p = pauseComputerFromServer(h.runner, h.hooks, "Detach", 0, "user");
    await vi.advanceTimersByTimeAsync(60_000);
    await p;
    expect(h.order).not.toContain("kill");
  });

  it("persist inayokwama haizuii pause (inasubiriwa ≤4s)", async () => {
    const h = harness();
    h.hooks.persist = () => new Promise<void>(() => {});
    const p = pauseComputerFromServer(h.runner, h.hooks, "x", Date.now() + 60_000, "system", PRESSURE_SNAPSHOT_LIMITS);
    await vi.advanceTimersByTimeAsync(60_000);
    await expect(p).resolves.toBe(true);
    expect(h.order).toContain("tar");
  });
});
