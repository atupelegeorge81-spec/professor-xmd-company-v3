// TASK 14 — kitanzi cha milestones: trigger (Ledger = ukweli), CAS DISCUSSING→PLANNING, stub, idempotency, resume.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Store ya memory yenye CAS halisi (version) — sawa na mkataba wa store.ts
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
      await new Promise((r) => setTimeout(r, 1)); // kuruhusu mbio (race) kati ya wito sambamba
      try { return await putRecord(sid, key, mutate(cur?.data ?? null, cur?.version ?? 0), cur?.version ?? 0); }
      catch (e) { if (!(e instanceof Conflict)) throw e; }
    }
  };
  return { ...real, getRecord, putRecord, updateRecord };
});

import { maybeCloseMilestones, milestonesDoneFromChips, type LoopHooks, type LoopRunner } from "../loop";
import { stateKey } from "../store";
import { captureTarget, maybeCapturePrompt, testMaxAgendas } from "../testHooks";
import type { MilestoneMap } from "../types";
import { validateMilestoneState } from "../schemas";

const SID = "xmdtest-loop-0001";
const MAP: MilestoneMap = {
  version: 1, sessionId: SID, totalAgendas: 3, generatedBy: "test", usedFallback: false,
  milestones: [
    { id: "M1", title: "Foundation", agendas: { from: 1, to: 2 }, phase: "foundation", reviewMode: "light", roster: ["optimus", "ultron"], rationale: "" },
    { id: "M2", title: "Ship", agendas: { from: 3, to: 3 }, phase: "quality_deploy", reviewMode: "full", roster: ["optimus", "cybertron"], rationale: "" },
  ],
} as any;

function setup(resolved: number[]) {
  const events: any[] = [];
  const chips: string[] = [];
  const res = new Set(resolved);
  const runner: LoopRunner = { id: SID, sessionId: SID, msMap: MAP, msChips: [] };
  const hooks: LoopHooks = {
    bcast: (e) => events.push(e), addChip: (t) => chips.push(t), blog: () => {},
    persist: async () => {}, resolvedAgendas: async () => res,
  };
  return { runner, hooks, events, chips, res };
}
const closedIds = (events: any[]) => events.filter((e) => e.type === "milestoneClosed").map((e) => e.id);

beforeEach(() => { db.clear(); vi.stubEnv("XMD_MILESTONES", "1"); });
afterEach(() => vi.unstubAllEnvs());

describe("maybeCloseMilestones", () => {
  it("flag OFF → haifanyi chochote", async () => {
    vi.stubEnv("XMD_MILESTONES", "");
    const t = setup([1, 2, 3]);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual([]);
    expect(t.events).toEqual([]); expect(db.size).toBe(0);
  });

  it("M1 inafungwa tu agenda 1–2 zote zikiwa kwenye Ledger; kila milestone mara moja tu", async () => {
    const t = setup([1]);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual([]);
    t.res.add(2);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual(["M1"]);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual([]); // idempotent
    t.res.add(3);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual(["M2"]);
    expect(closedIds(t.events)).toEqual(["M1", "M2"]);
    expect(t.chips.filter((c) => c.includes("Milestone M1 closed"))).toHaveLength(1);
    const m1 = db.get(`${SID}|${stateKey("M1")}`)!.data;
    expect(m1.status).toBe("SIGNED_OFF");
    expect(m1.steps.map((s: any) => [s.stepId, s.status, s.stub])).toEqual([["M1.R0.plan", "DONE", true], ["M1.R0.build", "DONE", true]]);
    expect(milestonesDoneFromChips(t.runner.msChips)).toEqual(["M1", "M2"]);
    expect(validateMilestoneState(m1).ok).toBe(true);
    expect(validateMilestoneState(db.get(`${SID}|${stateKey("M2")}`)!.data).ok).toBe(true);
  });

  it("resume: state PLANNING + plan DONE → build tu inaendeshwa, milestoneClosed HAIRUDIWI", async () => {
    db.set(`${SID}|${stateKey("M1")}`, { version: 3, data: {
      id: "M1", status: "PLANNING", round: 0, maxRounds: 10, currentStepId: "M1.R0.plan", startedAt: "2026-10-18T00:00:00.000Z", updatedAt: "2026-10-18T00:00:00.000Z", lanesUsed: [],
      steps: [{ stepId: "M1.R0.plan", status: "DONE", attempts: 1, updatedAt: "2026-10-18T00:00:00.000Z", stub: true }, { stepId: "M1.R0.build", status: "PENDING", attempts: 0, updatedAt: "2026-10-18T00:00:00.000Z" }],
    } });
    const t = setup([1, 2]);
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual(["M1"]);
    expect(closedIds(t.events)).toEqual([]);
    const m1 = db.get(`${SID}|${stateKey("M1")}`)!.data;
    expect(m1.status).toBe("SIGNED_OFF");
    expect(m1.steps.find((s: any) => s.stepId === "M1.R0.plan").attempts).toBe(1); // haikurudiwa
  });

  it("SIGNED_OFF haiguswi tena", async () => {
    const t = setup([1, 2]);
    await maybeCloseMilestones(t.runner, t.hooks);
    const v = db.get(`${SID}|${stateKey("M1")}`)!.version;
    await maybeCloseMilestones(t.runner, t.hooks);
    expect(db.get(`${SID}|${stateKey("M1")}`)!.version).toBe(v);
  });

  it("wito sambamba (runners wawili) → milestoneClosed mara moja tu (CAS)", async () => {
    const a = setup([1, 2]);
    const b = setup([1, 2]);
    await Promise.all([maybeCloseMilestones(a.runner, a.hooks), maybeCloseMilestones(b.runner, b.hooks)]);
    expect([...closedIds(a.events), ...closedIds(b.events)]).toEqual(["M1"]);
    expect(db.get(`${SID}|${stateKey("M1")}`)!.data.status).toBe("SIGNED_OFF");
  });

  it("bila ramani au sessionId → hakuna kitu", async () => {
    const t = setup([1, 2]);
    expect(await maybeCloseMilestones({ ...t.runner, msMap: null }, t.hooks)).toEqual([]);
    expect(await maybeCloseMilestones({ ...t.runner, sessionId: null }, t.hooks)).toEqual([]);
  });
});

describe("TASK-15: hatua ya plan kupitia hooks.plan", () => {
  const res = (executable: boolean) => ({
    milestoneId: "M1", status: executable ? "active" : "guard_failed", executable, reasons: executable ? [] : ["status guard_failed — Data Guard bado inaona tofauti za DATA RASMI"],
    markdown: "# MILESTONE PLAN — x", steps: 3, checks: 4, routes: 1, problems: [], warnings: [], guardHits: [], repairs: { structure: 0, guard: 0 },
  }) as any;

  it("plan active → plan DONE (si stub), build stub, SIGNED_OFF, event milestonePlan, store plan:M1", async () => {
    const t = setup([1, 2]);
    let calls = 0;
    t.hooks.plan = async () => { calls++; return res(true); };
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual(["M1"]);
    const st = db.get(`${SID}|${stateKey("M1")}`)!.data;
    expect(st.status).toBe("SIGNED_OFF");
    expect(st.steps.map((s: any) => [s.stepId, s.status, !!s.stub])).toEqual([["M1.R0.plan", "DONE", false], ["M1.R0.build", "DONE", true]]);
    expect(t.events.filter((e) => e.type === "milestonePlan").map((e) => [e.id, e.status, e.executable])).toEqual([["M1", "active", true]]);
    expect(db.get(`${SID}|plan:M1`)!.data.steps).toBe(3);
    expect(t.chips.some((c) => c.startsWith("🗺️ Plan ya Milestone M1 iko tayari"))).toBe(true);
    expect(calls).toBe(1);
  });

  it("plan haitekelezeki → plan FAILED, M1 BLOCKED (resumeTo PLANNING), build HAIENDESHWI, wito unaofuata hauirudii", async () => {
    const t = setup([1, 2]);
    let calls = 0;
    t.hooks.plan = async () => { calls++; return res(false); };
    expect(await maybeCloseMilestones(t.runner, t.hooks)).toEqual(["M1"]);
    const st = db.get(`${SID}|${stateKey("M1")}`)!.data;
    expect([st.status, st.resumeTo]).toEqual(["BLOCKED", "PLANNING"]);
    expect(st.steps.map((s: any) => [s.stepId, s.status])).toEqual([["M1.R0.plan", "FAILED"], ["M1.R0.build", "PENDING"]]);
    expect(t.chips.some((c) => c.includes("XMD Computer HAIANZI"))).toBe(true);
    expect(validateMilestoneState(st).ok).toBe(true);
    await maybeCloseMilestones(t.runner, t.hooks);
    expect(calls).toBe(1);
  });
});

describe("testHooks", () => {
  it("inert bila XMD_TEST_HOOKS=1", () => {
    expect(captureTarget({ XMD_TEST_CAPTURE_PROMPTS: "/tmp/x.jsonl" } as any)).toBeNull();
    expect(maybeCapturePrompt({ sessionId: "s", agent: "pm", agenda: 1, phase: "discussion", system: "x" }, {} as any)).toBe(false);
    expect(captureTarget({ XMD_TEST_HOOKS: "1", XMD_TEST_CAPTURE_PROMPTS: "/tmp/x.jsonl" } as any)).toBe("/tmp/x.jsonl");
    expect(testMaxAgendas({ XMD_TEST_MAX_AGENDAS: "3" } as any)).toBeNull();
    expect(testMaxAgendas({ XMD_TEST_HOOKS: "1", XMD_TEST_MAX_AGENDAS: "3" } as any)).toBe(3);
    expect(testMaxAgendas({ XMD_TEST_HOOKS: "1", XMD_TEST_MAX_AGENDAS: "0" } as any)).toBeNull();
  });
});

describe("TASK-16: hatua ya build kupitia hooks.build (XMD Computer kwa kila milestone)", () => {
  const plan = { milestoneId: "M1", status: "active", executable: true, reasons: [], markdown: "# MILESTONE PLAN — M1", steps: 1, checks: 1, routes: 0, problems: [], warnings: [], guardHits: [], repairs: { structure: 0, guard: 0 } } as any;
  const run = async (outcome: any) => {
    const t = setup([1, 2]);
    const seen: string[] = [];
    let calls = 0;
    t.hooks.plan = async () => plan;
    t.hooks.build = async (m, md) => { calls++; seen.push(`${m.id}:${md}`); return outcome; };
    await maybeCloseMilestones(t.runner, t.hooks);
    return { ...t, seen, calls: () => calls, st: db.get(`${SID}|${stateKey("M1")}`)!.data };
  };

  it("COMPLETED_UNVERIFIED → build DONE (si stub), plan inapokelewa, store build:M1, event milestoneBuild, SIGNED_OFF", async () => {
    const t = await run({ ok: true, finalState: "COMPLETED_UNVERIFIED", reason: "", report: "ripoti", restored: 0, freshSandbox: true });
    expect(t.seen).toEqual(["M1:# MILESTONE PLAN — M1"]);
    expect(t.st.status).toBe("SIGNED_OFF");
    expect(t.st.steps.map((s: any) => [s.stepId, s.status, !!s.stub])).toEqual([["M1.R0.plan", "DONE", false], ["M1.R0.build", "DONE", false]]);
    expect(db.get(`${SID}|build:M1`)!.data).toMatchObject({ id: "M1", ok: true, finalState: "COMPLETED_UNVERIFIED", report: "ripoti" });
    expect(t.events.filter((e) => e.type === "milestoneBuild").map((e) => [e.id, e.ok, e.finalState])).toEqual([["M1", true, "COMPLETED_UNVERIFIED"]]);
    expect(validateMilestoneState(t.st).ok).toBe(true);
  });

  for (const fs of ["STUCK", "BLOCKED", "ERROR"]) {
    it(`${fs} → build FAILED, M1 BLOCKED (resumeTo BUILDING), sababu wazi, hairudiwi yenyewe`, async () => {
      const t = await run({ ok: false, finalState: fs, reason: "liveness: no bridge event for 60s" });
      expect([t.st.status, t.st.resumeTo]).toEqual(["BLOCKED", "BUILDING"]);
      expect(t.st.steps.map((s: any) => [s.stepId, s.status])).toEqual([["M1.R0.plan", "DONE"], ["M1.R0.build", "FAILED"]]);
      expect(t.chips.some((c) => c.startsWith(`⛔ Build ya Milestone M1: ${fs} — liveness`))).toBe(true);
      await maybeCloseMilestones(t.runner, t.hooks);
      expect(t.calls()).toBe(1);
    });
  }

  it("PAUSED_QUOTA → M1 PAUSED_QUOTA (HOLD)", async () => {
    const t = await run({ ok: false, finalState: "PAUSED_QUOTA", reason: "quota" });
    expect([t.st.status, t.st.resumeTo]).toEqual(["PAUSED_QUOTA", "BUILDING"]);
  });

  it("PAUSED (Board pause) → hatua inabaki RUNNING, M1 BUILDING; wito unaofuata unairudia build", async () => {
    const t = await run({ ok: false, finalState: "PAUSED", reason: "pause" });
    expect(t.st.status).toBe("BUILDING");
    expect(t.st.steps.find((s: any) => s.stepId === "M1.R0.build").status).toBe("RUNNING");
    t.hooks.build = async () => ({ ok: true, finalState: "COMPLETED_UNVERIFIED", reason: "" });
    await maybeCloseMilestones(t.runner, t.hooks);
    const st = db.get(`${SID}|${stateKey("M1")}`)!.data;
    expect(st.status).toBe("SIGNED_OFF");
    expect(st.steps.find((s: any) => s.stepId === "M1.R0.build")).toMatchObject({ status: "DONE", attempts: 2 });
  });
});
