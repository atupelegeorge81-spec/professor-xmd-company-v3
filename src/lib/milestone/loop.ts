// src/lib/milestone/loop.ts — TASK 14 (maelezo14): kitanzi cha milestones — CODE inaamua lini milestone imefungwa.
// Agenda zote za milestone zikiwa kwenye Ledger (finalBoardResolution) → DISCUSSING → PLANNING (CAS) → runMilestoneBuild.
// runMilestoneBuild ni STUB kwa sasa (tasks 15+ zinabadilisha mwili wake). Inatumika TU XMD_MILESTONES=1.

import { milestonesEnabled } from "./flag";
import { newMilestoneState, planSteps, setStep, stepIdOf, transition, TERMINAL_STATUSES } from "./state";
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
}

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
  hooks.blog("success", `✅ Milestone ${m.id} → ${rec.data.status} (stub).`);
  await hooks.persist();
  return rec.data;
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
