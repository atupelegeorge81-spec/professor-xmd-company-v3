// TASK-32 (E2E halisi run 5): RAM 78% ilipumzisha CU katikati ya build ya MILESTONE → ERROR → M4 BLOCKED.
// Njia ya milestone haina resume ya pause ya system → cooldown ya RAM inafanya GC tu; SIGTERM (force) bado inapumzisha.
import { beforeEach, describe, expect, it, vi } from "vitest";

const pauseComputerFromServer = vi.fn(async () => true);
const pauseRun = vi.fn();
let runner: any = null;
vi.mock("@/lib/cu/engine", () => ({ pauseComputerFromServer, PRESSURE_SNAPSHOT_LIMITS: {} }));
vi.mock("@/lib/boardRunner", () => ({ activeRunner: () => runner, pauseRun, findRunner: () => runner, unpauseRun: () => true }));

const mk = (msMode: boolean) => ({ id: "r1", status: "running", pauseOrigin: undefined, cuHooks: {}, cu: { done: false, pausedNow: false, pausing: false, msMode } });

describe("TASK-32 · watchdog ya RAM na build ya milestone", () => {
  beforeEach(() => { pauseComputerFromServer.mockClear(); pauseRun.mockClear(); });

  it("build ya milestone (msMode) + RAM juu → CU HAIPUMZISHWI (GC tu, log)", async () => {
    const { runRamCooldownForTest, watchdogState } = await import("../watchdog");
    runner = mk(true);
    await runRamCooldownForTest("🌡️ RAM imefika 78%", 60_000);
    expect(pauseComputerFromServer).not.toHaveBeenCalled();
    expect(pauseRun).not.toHaveBeenCalled();
    const last = watchdogState().events.at(-1)!;
    expect([last.kind, /msMode/.test(last.note)]).toEqual(["log", true]);
  });

  it("CU ya kawaida (si milestone) → bado inapumzishwa kama zamani", async () => {
    const { runRamCooldownForTest } = await import("../watchdog");
    runner = mk(false);
    await runRamCooldownForTest("🌡️ RAM imefika 78%", 60_000);
    expect(pauseComputerFromServer).toHaveBeenCalledTimes(1);
  });

  it("SIGTERM/force (runSystemPauseForTest) → hata milestone inapumzishwa (instance inakufa hata hivyo)", async () => {
    const { runSystemPauseForTest } = await import("../watchdog");
    runner = mk(true);
    await runSystemPauseForTest("SIGTERM", 60_000);
    expect(pauseComputerFromServer).toHaveBeenCalledTimes(1);
  });
});
