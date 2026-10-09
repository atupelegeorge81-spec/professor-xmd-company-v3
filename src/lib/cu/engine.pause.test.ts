// src/lib/cu/engine.pause.test.ts — R38-RC1/RC5: pause ya server (manual/watchdog) + stall + gate ya events.
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import type { Runner } from "@/lib/boardRunner";
import type { SessionItem } from "@/lib/reports";
import type { BoardEvent } from "@/lib/types";
import type { CuHooks } from "./engine";

// Appwrite haipatikani kwenye test — snapshot path inahitaji storage iliyofanyiwa mock
vi.mock("@/lib/server/appwrite", () => ({
  appwriteConfigured: true,
  storage: { createFile: vi.fn(async () => ({ $id: "file-mock-1" })) },
  databases: {}, DB: {}, SCREENSHOTS_BUCKET: "bucket-test",
}));

import { ensureCuState, handleCuEvent, pauseComputerFromServer, checkCuStall, type CuRunState } from "./engine";

function fakeRunner(items: SessionItem[] = []): Runner {
  return {
    id: "r-pause", project: "Duka la Kariakoo", status: "running", items, buffer: [], subs: new Set(),
    startedAt: Date.now(), mode: "plan", computerPlanned: true,
    finale: { planId: "plan1", reportId: "rep1", memory: true },
  } as unknown as Runner;
}

function fakeHooks(runner: Runner) {
  const calls = { chips: [] as string[], blogs: [] as string[], broadcasts: [] as BoardEvent[], persists: [] as string[] };
  const hooks: CuHooks = {
    persist: async (st: string) => { calls.persists.push(st); },
    bcast: (e) => calls.broadcasts.push(e),
    blog: (_t, m) => { calls.blogs.push(m); },
    addChip: (t) => { calls.chips.push(t); },
    recordUsage: () => {},
    usage: {},
    byProvider: {},
    title: "Duka la Kariakoo",
  };
  return { hooks, calls };
}

/** Sandbox bandia: tar inafanikiwa, bytes zinarejesha, kill inarekodiwa. */
function fakeSandbox() {
  const killed: string[] = [];
  return {
    killed,
    sandboxId: "sbx-fake-1",
    commands: {
      run: vi.fn(async (cmd: string) => ({ stdout: cmd.includes("stat -c%s") ? "20480" : "" })),
    },
    files: { read: vi.fn(async () => new Uint8Array([1, 2, 3, 4])) },
    kill: vi.fn(async () => { killed.push("kill"); }),
    setTimeout: vi.fn(async () => {}),
  };
}

function armedCu(runner: Runner, sbx: any): CuRunState {
  const cu = ensureCuState(runner);
  cu.sandbox = sbx;
  cu.sandboxId = "sbx-fake-1";
  cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
  return cu;
}

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); });

describe("R38-RC5 · pauseComputerFromServer — pause ya manual/watchdog", () => {
  it("sandbox hai: snapshot inapakiwa bucket, bridge inauawa, session \"paused\", awamu inarudishwa", async () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const sbx = fakeSandbox();
    const cu = armedCu(runner, sbx);

    const p = pauseComputerFromServer(runner, hooks, "Detach — mwandamizi", 0);
    await vi.runAllTimersAsync();
    await expect(p).resolves.toBe(true);

    // snapshot: tar (stat 20480) + read bytes + upload mock
    expect(cu.snapshot).toEqual({ fileId: "file-mock-1", bucketId: "bucket-test" });
    expect(sbx.files.read).toHaveBeenCalledWith("/tmp/cu-ws-pause.tar.gz", expect.anything());
    // bridge+brain zimeuawa (pkill); sandbox kill imepangwa (15s, timer ya fake)
    expect(sbx.commands.run).toHaveBeenCalledWith(expect.stringContaining("pkill -9 -f '[c]u_bridge.py'"), expect.anything());
    expect(sbx.killed).toContain("kill");
    // hali ya pause
    expect(cu.pausedOnce).toBe(true);
    expect(cu.pausedNow).toBe(true);
    expect(cu.pausing).toBe(false);
    expect(cu.resumeAt).toBe(0);
    expect(cu.sandbox).toBeUndefined(); // cache imeclear — resume ita-connect
    // item + chip + persist "paused" + bcast phase_done
    const item = runner.items.find((it: any) => it.cu === "pause") as any;
    expect(item).toBeTruthy();
    expect(item.resumeAt).toBe(0);
    expect(item.reason).toContain("Detach");
    expect(calls.chips.join(" ")).toContain("imepumzishwa");
    expect(calls.persists).toContain("paused");
    expect(calls.broadcasts.some((e: any) => e.type === "cu" && e.cu?.type === "phase_done" && e.cu?.status === "paused")).toBe(true);
    // awamu imerudishwa (run() inaendelea → pausedOnce && !done → inaisha kimya)
    let resolved = false;
    cu.phaseDone?.then(() => { resolved = true; });
    await vi.runAllTimersAsync();
    expect(resolved).toBe(true);
  });

  it("resumeAt>0 (watchdog): auto-resume inapangwa — si pause ya mwandamizi pekee", async () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    const sbx = fakeSandbox();
    const cu = armedCu(runner, sbx);
    const at = Date.now() + 10 * 60_000;
    await pauseComputerFromServer(runner, hooks, "hakuna tukio la bridge kwa 15 dk", at);
    // R40: sandbox ya watchdog-pause INABAKI hai (heartbeat polepole) — hakuna kill ya E2B
    expect(cu.slowHeartbeat).toBeTruthy();
    expect(sbx.killed).toEqual([]);
    expect(sbx.setTimeout).toHaveBeenCalled(); // heartbeat ya kwanza imeshapiga
    // timers ni bounded (si runAllTimers — heartbeat wa dakika 5 unaishi kwa makusudi hadi resume)
    await vi.advanceTimersByTimeAsync(11 * 60_000);
    expect(cu.resumeAt).toBe(at);
    expect((runner.items.find((it: any) => it.cu === "pause") as any).resumeAt).toBe(at);
    if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; }
  });

  it("bila sandbox: pause inaendelea (kazi ya Openwrite tu) — si kufa", async () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const cu = armedCu(runner, null);
    cu.sandbox = undefined;

    await pauseComputerFromServer(runner, hooks, "Detach — mwandamizi", 0);
    expect(cu.pausedOnce).toBe(true);
    expect(cu.snapshot).toBeUndefined();
    expect(calls.persists).toContain("paused");
    expect(calls.blogs.some((b) => b.includes("Snapshot"))).toBe(false); // hakuna kelele — hakuna kilichoangamia
  });

  it("cu imekamilika (done) → pause inakataa; pause iliyokwisha (pausedNow) inakataa", async () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    const cu = armedCu(runner, fakeSandbox());
    cu.done = true;
    await expect(pauseComputerFromServer(runner, hooks, "x", 0)).resolves.toBe(false);
    cu.done = false;
    await pauseComputerFromServer(runner, hooks, "x", 0);
    await vi.runAllTimersAsync();
    await expect(pauseComputerFromServer(runner, hooks, "tena", 0)).resolves.toBe(false);
    expect(runner.items.filter((it: any) => it.cu === "pause")).toHaveLength(1); // hakuna double-pause
  });

  it("resume (pausedNow=false, pausedOnce=historia) → pause ya PILI inaruhusiwa — si kufa kimya", async () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const cu = armedCu(runner, fakeSandbox());
    cu.pausedOnce = true;  // historia (quota ya jana / pause ya kwanza)
    cu.pausedNow = false;  // startComputerPhase iliifuta
    await pauseComputerFromServer(runner, hooks, "Detach ya pili", 0);
    await vi.runAllTimersAsync();
    expect(cu.pausedNow).toBe(true);
    expect(calls.persists).toContain("paused");
  });
});

describe("R38-RC1 · checkCuStall — watchdog ya stream iliyokwama", () => {
  it("events za hivi karibuni → ok", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const cu = armedCu(runner, null);
    cu.lastEventAt = Date.now() - 10_000;
    expect(checkCuStall(runner, hooks)).toBe("ok");
    expect(calls.blogs).toHaveLength(0);
  });

  it("dakika 5+ bila tukio → onyo LIMoja (si kila tick)", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const cu = armedCu(runner, null);
    cu.lastEventAt = Date.now() - 6 * 60_000;
    expect(checkCuStall(runner, hooks)).toBe("warned");
    expect(calls.blogs[0]).toContain("hakuna tukio");
    expect(checkCuStall(runner, hooks)).toBe("ok"); // stallWarned — hakuna onyo la pili
    expect(calls.blogs).toHaveLength(1);
  });

  it("dakika 15+ bila tukio → pause inaanzishwa (retry 10dk)", () => {
    const runner = fakeRunner();
    const { hooks, calls } = fakeHooks(runner);
    const cu = armedCu(runner, null);
    cu.lastEventAt = Date.now() - 16 * 60_000;
    expect(checkCuStall(runner, hooks)).toBe("paused");
    expect(cu.pausedOnce).toBe(true);   // pause imeanza (sync)
    expect(cu.resumeAt).toBeGreaterThan(Date.now()); // auto-resume imeratibiwa
    expect(calls.blogs.some((b) => b.includes("imekwama"))).toBe(true);
  });
});

describe("R38-RC5 · handleCuEvent — gate ya pausedNow", () => {
  it("pausedNow: think/text zinalaaniwa (bridge inayokufa haizidi kugeuza hali); run_end INARUHUSIWA", async () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x", model: "m" });
    const cu = runner.cu!;
    cu.pausedNow = true; // pause imetokea
    handleCuEvent(runner, hooks, { i: 2, type: "think_delta", step: 1, text: "kelele za bridge inayokufa" });
    expect(runner.items.some((it: any) => it.cu === "think")).toBe(false);
    // run_end ya ukweli (kazi imekamilika halisi) inapita — finishComputer inafanya kazi
    handleCuEvent(runner, hooks, { i: 3, type: "finish", report: "Ripoti halisi ya kazi imekamilika." });
    await handleCuEvent(runner, hooks, { i: 4, type: "run_end", status: "done", steps: 2, ms: 1000 });
    expect(cu.done).toBe(true);
    expect(runner.items.some((it: any) => it.cu === "run_end")).toBe(true);
  });

  it("lastEventAt inasasishwa na kila tukio (watchdog inapumzika)", () => {
    const runner = fakeRunner();
    const { hooks } = fakeHooks(runner);
    const cu = runner.cu || ensureCuState(runner);
    const before = cu.lastEventAt || 0;
    handleCuEvent(runner, hooks, { i: 1, type: "run_start", task: "x", model: "m" });
    expect((cu.lastEventAt || 0)).toBeGreaterThanOrEqual(before);
  });
});
