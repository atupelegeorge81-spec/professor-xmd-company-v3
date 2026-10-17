// src/lib/milestone/state.ts — TASK 10: state machine ya MilestoneState + step ledger + lane log. PURE (hakuna I/O).
//
// Graph (maelezo10):
//   DISCUSSING → PLANNING → BUILDING → EVIDENCE → REVIEW_R0 → (FIXING ⇄ VERIFYING)* → SIGNED_OFF | SIGNED_OFF_WITH_WAIVERS | CAP_REACHED
//   hali yoyote hai → PAUSED_QUOTA | PAUSED_INFRA | BLOCKED; RESUME → resumeTo (hali iliyotoka).
// Maamuzi ya CEO (2026-10-17): REVIEW_R0 → FIXING inaweka round = 1 (R0 = review tu, fixes = rounds 1..10);
// baada ya hapo round inaongezeka TU kwenye VERIFYING → FIXING; round > maxRounds ni haramu.
// CAP_REACHED: kutoka VERIFYING tu, na round === maxRounds.
// Mpito haramu unarudisha {error} — KAMWE haukubaliwi kimya.

import { MAX_ROUNDS, type LaneUse, type MilestoneState, type MilestoneStatus, type StepEntry, type StepStatus } from "./types";

export type MilestoneEvent = { type: "GOTO"; to: MilestoneStatus } | { type: "RESUME" };
export type TransitionResult = { state: MilestoneState } | { error: string };

export const HOLD_STATUSES: readonly MilestoneStatus[] = ["PAUSED_QUOTA", "PAUSED_INFRA", "BLOCKED"];
export const TERMINAL_STATUSES: readonly MilestoneStatus[] = ["SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS", "CAP_REACHED"];

/** Kingo za kawaida (bila pause/resume). */
export const FORWARD_EDGES: Readonly<Partial<Record<MilestoneStatus, readonly MilestoneStatus[]>>> = {
  DISCUSSING: ["PLANNING"],
  PLANNING: ["BUILDING"],
  BUILDING: ["EVIDENCE"],
  EVIDENCE: ["REVIEW_R0"],
  REVIEW_R0: ["FIXING", "SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS"],
  FIXING: ["VERIFYING"],
  VERIFYING: ["FIXING", "SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS", "CAP_REACHED"],
};

const isHold = (s: MilestoneStatus) => HOLD_STATUSES.includes(s);
const nowIso = () => new Date().toISOString();

export function newMilestoneState(id: string, now = nowIso()): MilestoneState {
  return { id, status: "DISCUSSING", round: 0, maxRounds: MAX_ROUNDS, currentStepId: "", startedAt: now, updatedAt: now, lanesUsed: [], steps: [] };
}

export function transition(state: MilestoneState, event: MilestoneEvent, now = nowIso()): TransitionResult {
  const from = state.status;
  const maxRounds = state.maxRounds || MAX_ROUNDS;

  if (event.type === "RESUME") {
    if (!isHold(from)) return { error: `illegal RESUME from ${from}: only PAUSED_QUOTA|PAUSED_INFRA|BLOCKED can resume` };
    if (!state.resumeTo || isHold(state.resumeTo)) return { error: `cannot RESUME ${state.id}: resumeTo missing or invalid (${String(state.resumeTo)})` };
    const { resumeTo, ...rest } = state;
    return { state: { ...rest, status: resumeTo, updatedAt: now } };
  }

  const to = event.to;
  if (to === from) return { error: `illegal transition ${from} -> ${to}: no-op` };

  // pause/blocked: kutoka hali yoyote isiyo ya mwisho; resumeTo inabaki hali hai ya awali (pause → pause haipotezi asili)
  if (isHold(to)) {
    if (TERMINAL_STATUSES.includes(from)) return { error: `illegal transition ${from} -> ${to}: ${from} is terminal` };
    const resumeTo = isHold(from) ? state.resumeTo : from;
    if (!resumeTo) return { error: `illegal transition ${from} -> ${to}: resumeTo missing` };
    return { state: { ...state, status: to, resumeTo, updatedAt: now } };
  }
  if (isHold(from)) return { error: `illegal transition ${from} -> ${to}: use RESUME (back to ${String(state.resumeTo)})` };

  if (!(FORWARD_EDGES[from] || []).includes(to)) return { error: `illegal transition ${from} -> ${to}` };

  let round = state.round;
  if (from === "REVIEW_R0" && to === "FIXING") round = 1;
  else if (from === "VERIFYING" && to === "FIXING") {
    round = state.round + 1;
    if (round > maxRounds) return { error: `illegal transition VERIFYING -> FIXING: round ${round} > maxRounds ${maxRounds}` };
  }
  if (to === "CAP_REACHED" && state.round !== maxRounds) return { error: `illegal transition VERIFYING -> CAP_REACHED: round ${state.round} < maxRounds ${maxRounds}` };

  return { state: { ...state, status: to, round, updatedAt: now } };
}

// ── Step ledger ──────────────────────────────────────────────────────────────
const STEP_ID = /^M\d+\.R\d+\.[a-z][a-z0-9_]*$/;
export const stepIdOf = (milestoneId: string, round: number, step: string) => `${milestoneId}.R${round}.${step}`;

/** Resume point: hatua ya kwanza isiyo DONE (RUNNING iliyokutwa baada ya crash inarudiwa). null = zote DONE / hakuna. */
export function nextStep(state: MilestoneState): string | null {
  return (state.steps || []).find((s) => s.status !== "DONE")?.stepId ?? null;
}

/** Ongeza hatua (PENDING) kwa mpangilio; zilizopo haziguswi. */
export function planSteps(state: MilestoneState, stepIds: string[], now = nowIso()): TransitionResult {
  const steps = [...(state.steps || [])];
  for (const id of stepIds) {
    if (!STEP_ID.test(id) || !id.startsWith(`${state.id}.`)) return { error: `bad stepId ${JSON.stringify(id)} for ${state.id}` };
    if (!steps.some((s) => s.stepId === id)) steps.push({ stepId: id, status: "PENDING", attempts: 0, updatedAt: now });
  }
  return { state: { ...state, steps, updatedAt: now } };
}

/** Badilisha hali ya hatua. DONE haibadiliki tena (haiendeshwi mara ya pili). RUNNING → currentStepId + attempts++. */
export function setStep(state: MilestoneState, stepId: string, status: StepStatus, now = nowIso()): TransitionResult {
  if (!STEP_ID.test(stepId) || !stepId.startsWith(`${state.id}.`)) return { error: `bad stepId ${JSON.stringify(stepId)} for ${state.id}` };
  const steps = [...(state.steps || [])];
  const i = steps.findIndex((s) => s.stepId === stepId);
  const prev: StepEntry | undefined = i >= 0 ? steps[i] : undefined;
  if (prev?.status === "DONE") return { error: `step ${stepId} is DONE — it is never executed again` };
  const next: StepEntry = { stepId, status, attempts: (prev?.attempts || 0) + (status === "RUNNING" ? 1 : 0), updatedAt: now };
  if (i >= 0) steps[i] = next; else steps.push(next);
  return { state: { ...state, steps, currentStepId: status === "RUNNING" ? stepId : state.currentStepId, updatedAt: now } };
}

// ── Lane log (append-only) ───────────────────────────────────────────────────
/** Ficha key: lebo fupi (≤8, mf. "uno#2") zinabaki; ndefu → herufi 4 za mwanzo + "***". */
export function maskKeyId(k: string): string {
  const s = String(k || "");
  if (s.endsWith("***")) return s;
  return s.length <= 8 ? s : `${s.slice(0, 4)}***`;
}

export function appendLaneUse(state: MilestoneState, entry: LaneUse, now = nowIso()): MilestoneState {
  return { ...state, lanesUsed: [...(state.lanesUsed || []), { ...entry, keyId: maskKeyId(entry.keyId) }], updatedAt: now };
}
