// src/lib/milestone/loop.ts — TASK 14 (maelezo14): kitanzi cha milestones — CODE inaamua lini milestone imefungwa.
// Agenda zote za milestone zikiwa kwenye Ledger (finalBoardResolution) → DISCUSSING → PLANNING (CAS) → runMilestoneBuild.
// runMilestoneBuild ni STUB kwa sasa (tasks 15+ zinabadilisha mwili wake). Inatumika TU XMD_MILESTONES=1.

import { milestonesEnabled } from "./flag";
import { HOLD_STATUSES, newMilestoneState, planSteps, setStep, stepIdOf, transition, TERMINAL_STATUSES } from "./state";
import type { MilestonePlanResult } from "./plan";
import { getRecord, msChip, MS_PREFIX, stateKey, updateRecord, type Versioned } from "./store";
import type { Milestone, MilestoneMap, MilestoneState, MilestoneStatus } from "./types";

export interface LoopRunner {
  id: string;
  sessionId?: string | null;
  msMap?: MilestoneMap | null;
  msChips?: any[];
}

export interface LoopHooks {
  bcast: (e: any) => void;
  addChip: (text: string) => void;
  blog: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
  persist: () => Promise<void>;
  /** agenda zilizofungwa kwenye Ledger (chanzo cha ukweli) */
  resolvedAgendas: () => Promise<Set<number>>;
  /** TASK-15: Optimus anaandika plan ya milestone (bila hook → stub ya task 14) */
  plan?: (m: Milestone) => Promise<MilestonePlanResult>;
  /** TASK-16: XMD Computer anajenga milestone MOJA kutoka plan yake (bila hook → stub) */
  build?: (m: Milestone, planMarkdown: string) => Promise<BuildOutcome>;
}

/** TASK-16: matokeo ya awamu ya Computer (engine.MilestoneBuildOutcome — bila ku-import engine hapa). */
export interface BuildOutcome {
  ok: boolean;
  /** CuFinalState (task 3) au "PAUSED" (Board ilipumzishwa katikati — hatua inarudiwa ikiresume) */
  finalState: string;
  reason: string;
  report?: string;
  sandboxId?: string;
  freshSandbox?: boolean;
  restored?: number;
  gitLog?: string;
  ms?: number;
}

export const buildKey = (milestoneId: string) => `build:${milestoneId}`;

/** Mfuatano wa forward edges hadi SIGNED_OFF (njia ya stub — hakuna mzunguko wa marekebisho bado). */
const STUB_PATH: MilestoneStatus[] = ["PLANNING", "BUILDING", "EVIDENCE", "REVIEW_R0", "SIGNED_OFF"];

class NoChange extends Error {}

/** Andika rekodi kupitia store (CAS) + iweke kwenye runner.msChips (persist ya Board huchuja hidden chips). */
export async function msUpdate<T>(runner: LoopRunner, key: string, mutate: (cur: T | null) => T): Promise<Versioned<T>> {
  const rec = await updateRecord<T>(runner.sessionId as string, key, (cur) => mutate(cur));
  mirrorChip(runner, key, rec);
  return rec;
}

export function mirrorChip(runner: LoopRunner, key: string, rec: Versioned<unknown>): void {
  const chip = msChip(key, rec.version, rec.data);
  runner.msChips = [...(runner.msChips || []).filter((x: any) => x?.id !== chip.id), chip];
}

const must = (r: { state: MilestoneState } | { error: string }): MilestoneState => {
  if ("error" in r) throw new Error(`[milestone/loop] ${r.error}`);
  return r.state;
};

export function agendasOf(m: Milestone): number[] {
  return Array.from({ length: m.agendas.to - m.agendas.from + 1 }, (_, i) => m.agendas.from + i);
}

/** Milestone zinazoendeshwa sasa ndani ya process hii — kinga ya wito sambamba (mf. trigger mbili za haraka). */
const G = globalThis as unknown as { __xmdMsRunning?: Set<string> };
const running = (G.__xmdMsRunning ||= new Set<string>());

/**
 * Inaitwa baada ya kila agenda kufungwa (na mara moja wakati wa resume). Idempotent: state + stepId vinazuia
 * milestone kuendeshwa mara mbili; `milestoneClosed` inatolewa TU na aliyeshinda CAS ya DISCUSSING → PLANNING.
 * Inarudisha ids za milestones zilizokamilishwa katika wito huu.
 */
export async function maybeCloseMilestones(runner: LoopRunner, hooks: LoopHooks): Promise<string[]> {
  if (!milestonesEnabled() || !runner.msMap || !runner.sessionId) return [];
  const resolved = await hooks.resolvedAgendas();
  const done: string[] = [];
  for (const m of runner.msMap.milestones) {
    if (!agendasOf(m).every((i) => resolved.has(i))) continue;
    const cur = (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data ?? null;
    const status = cur?.status ?? "DISCUSSING";
    if (TERMINAL_STATUSES.includes(status)) continue;
    if (HOLD_STATUSES.includes(status)) continue; // TASK-15: BLOCKED (plan haitekelezeki) / PAUSED — hairudiwi yenyewe
    const lockKey = `${runner.sessionId}:${m.id}`;
    if (running.has(lockKey)) continue;
    running.add(lockKey);
    try {
      let won = false;
      if (status === "DISCUSSING") {
        try {
          await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
            const base = s ?? newMilestoneState(m.id);
            if (base.status !== "DISCUSSING") throw new NoChange(); // mwingine ameshabadilisha → si sisi
            return must(transition(base, { type: "GOTO", to: "PLANNING" }));
          });
          won = true;
        } catch (e) {
          if (!(e instanceof NoChange)) throw e;
        }
      }
      if (won) {
        hooks.bcast({ type: "milestoneClosed", id: m.id });
        hooks.addChip(`🏁 Milestone ${m.id} closed — ${m.title} (agendas ${m.agendas.from}–${m.agendas.to})`);
        hooks.blog("success", `🏁 Milestone ${m.id} imefungwa (agenda ${m.agendas.from}–${m.agendas.to} zote ziko kwenye Ledger) → PLANNING.`);
      } else {
        hooks.blog("info", `♻️ Milestone ${m.id} iko ${status} — inaendelea pale ilipoachwa (resume).`);
      }
      await runMilestoneBuild(runner, m, hooks);
      done.push(m.id);
    } finally {
      running.delete(lockKey);
    }
  }
  return done;
}

/**
 * STUB (task 14): hatua `plan` na `build` zinawekwa DONE (stub:true), kisha state → SIGNED_OFF kwa forward edges.
 * Kila hatua inaruka ikiwa tayari DONE (resume haiendeshi kitu mara mbili).
 */
export async function runMilestoneBuild(runner: LoopRunner, m: Milestone, hooks: LoopHooks): Promise<MilestoneState> {
  const steps = ["plan", "build"].map((s) => stepIdOf(m.id, 0, s));
  let rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(planSteps(s ?? newMilestoneState(m.id), steps)));
  for (const id of steps) {
    if ((rec.data.steps || []).find((x) => x.stepId === id)?.status === "DONE") continue;
    if (id.endsWith(".plan") && hooks.plan) {
      // TASK-15: plan halisi ya milestone (build inabaki stub hadi task 16)
      const r = await runPlanStep(runner, m, hooks, id);
      if (!r.ok) return r.state;
      rec = { ...rec, data: r.state };
      continue;
    }
    if (id.endsWith(".build") && hooks.build) {
      // TASK-16: XMD Computer halisi (awamu moja kwa milestone hii)
      const r = await runBuildStep(runner, m, hooks, id);
      if (!r.ok) return r.state;
      rec = { ...rec, data: r.state };
      continue;
    }
    rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
      const st = must(setStep(s as MilestoneState, id, "DONE"));
      return { ...st, steps: (st.steps || []).map((x) => (x.stepId === id ? { ...x, stub: true } : x)) };
    });
    hooks.blog("info", `🧩 ${id} DONE (stub — kazi halisi inakuja tasks 15+).`);
  }
  rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    let st = s as MilestoneState;
    for (let i = STUB_PATH.indexOf(st.status) + 1; i > 0 && i < STUB_PATH.length; i++) st = must(transition(st, { type: "GOTO", to: STUB_PATH[i] }));
    return st;
  });
  hooks.blog("success", `✅ Milestone ${m.id} → ${rec.data.status}${hooks.build ? " (evidence/review bado stub — tasks 17+)" : " (stub)"}.`);
  await hooks.persist();
  return rec.data;
}

export const planKey = (milestoneId: string) => `plan:${milestoneId}`;

/** TASK-15: hatua ya plan — RUNNING → Optimus anaandika → store `plan:Mk` + event `milestonePlan` → DONE au FAILED + BLOCKED. */
async function runPlanStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState }> {
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "RUNNING")));
  await hooks.persist();
  const res = await (hooks.plan as NonNullable<LoopHooks["plan"]>)(m);
  await msUpdate(runner, planKey(m.id), () => ({ ...res, version: 1, generatedAt: new Date().toISOString() }));
  hooks.bcast({ type: "milestonePlan", id: m.id, status: res.status, executable: res.executable, steps: res.steps, checks: res.checks, routes: res.routes, reasons: res.reasons, warnings: res.warnings, markdown: res.markdown });
  if (!res.executable) {
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to: "BLOCKED" })));
    hooks.addChip(`⛔ Plan ya Milestone ${m.id} haitekelezeki (${res.status}) — XMD Computer HAIANZI. ${res.reasons.slice(0, 2).join(" · ").slice(0, 220)}`);
    hooks.blog("error", `⛔ Plan ya ${m.id}: ${res.status} — ${res.reasons.join(" · ").slice(0, 400)} → ${m.id} BLOCKED (Computer haianzi).`);
    await hooks.persist();
    return { ok: false, state: rec.data };
  }
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  hooks.addChip(`🗺️ Plan ya Milestone ${m.id} iko tayari — hatua ${res.steps} · checks ${res.checks}${res.routes ? ` · routes ${res.routes}` : ""}${res.warnings.length ? ` · onyo ${res.warnings.length}` : ""}`);
  hooks.blog("success", `🗺️ Plan ya ${m.id}: active · hatua ${res.steps} · checks ${res.checks} · routes ${res.routes} · marekebisho muundo ${res.repairs.structure}/data ${res.repairs.guard}.`);
  await hooks.persist();
  return { ok: true, state: rec.data };
}

/** TASK-16: hatua ya build — PLANNING → BUILDING, Computer (StartPack, bridge mpya) → store `build:Mk` + event `milestoneBuild`.
 *  STUCK/BLOCKED/ERROR → FAILED + BLOCKED · PAUSED_QUOTA → FAILED + PAUSED_QUOTA · PAUSED (Board pause) → hatua inabaki RUNNING (resume inairudia). */
async function runBuildStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState }> {
  const plan = runner.sessionId ? (await getRecord<{ markdown?: string; executable?: boolean }>(runner.sessionId, planKey(m.id)))?.data : null;
  const fail = async (to: MilestoneStatus, why: string) => {
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to })));
    hooks.addChip(`⛔ Build ya Milestone ${m.id}: ${why.slice(0, 240)}`);
    hooks.blog("error", `⛔ Build ya ${m.id}: ${why.slice(0, 400)} → ${m.id} ${to}.`);
    await hooks.persist();
    return { ok: false, state: rec.data };
  };
  if (!plan?.markdown || plan.executable === false) return fail("BLOCKED", `plan:${m.id} haipo au haitekelezeki — Computer haianzi`);
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    let st = must(setStep(s as MilestoneState, id, "RUNNING"));
    if (st.status === "PLANNING") st = must(transition(st, { type: "GOTO", to: "BUILDING" }));
    return st;
  });
  await hooks.persist();
  const out = await (hooks.build as NonNullable<LoopHooks["build"]>)(m, plan.markdown);
  await msUpdate(runner, buildKey(m.id), () => ({
    version: 1, id: m.id, title: m.title, ok: out.ok, finalState: out.finalState, reason: out.reason,
    report: String(out.report || "").slice(0, 12_000), sandboxId: out.sandboxId, freshSandbox: out.freshSandbox,
    restored: out.restored, gitLog: out.gitLog, ms: out.ms, at: new Date().toISOString(),
  }));
  hooks.bcast({ type: "milestoneBuild", id: m.id, ok: out.ok, finalState: out.finalState, reason: out.reason, restored: out.restored ?? 0, freshSandbox: !!out.freshSandbox });
  if (out.finalState === "PAUSED") {
    hooks.blog("warning", `⏸️ Build ya ${m.id} imesimama (Board pause) — itarudiwa Board ikiresume.`);
    const cur = runner.sessionId ? (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data : null;
    return { ok: false, state: (cur ?? newMilestoneState(m.id)) as MilestoneState };
  }
  if (!out.ok) return fail(out.finalState === "PAUSED_QUOTA" ? "PAUSED_QUOTA" : "BLOCKED", `${out.finalState}${out.reason ? ` — ${out.reason}` : ""} (XMD Computer)`);
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  hooks.addChip(`🧱 Build ya Milestone ${m.id}: ${out.finalState}${out.restored ? ` · faili ${out.restored} zimerejeshwa` : ""}`);
  hooks.blog("success", `🧱 Build ya ${m.id}: ${out.finalState} — hatua DONE.`);
  await hooks.persist();
  return { ok: true, state: rec.data };
}

/** Hali ya milestones kutoka chips za runner (kwa OCB counts) — bila kugusa DB. */
export function milestonesDoneFromChips(chips: any[] | undefined): string[] {
  const out: string[] = [];
  for (const c of chips || []) {
    const t = String(c?.text || "");
    if (!t.startsWith(MS_PREFIX)) continue;
    try {
      const r = JSON.parse(t.slice(MS_PREFIX.length));
      if (String(r?.key || "").startsWith("state:") && TERMINAL_STATUSES.includes(r?.data?.status)) out.push(r.data.id);
    } catch { /* */ }
  }
  return out.sort();
}
