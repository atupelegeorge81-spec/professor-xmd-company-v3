// src/lib/milestone/testHooks.ts — TASK 14: hooks za majaribio PEKEE (maelezo0: inert bila XMD_TEST_HOOKS=1).
// XMD_TEST_CAPTURE_PROMPTS=<file.jsonl> → system prompt halisi ya kila zamu ya mjadala inaandikwa (kwa T3/T4).

import { appendFileSync } from "node:fs";

export function captureTarget(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.XMD_TEST_HOOKS !== "1") return null;
  const f = String(env.XMD_TEST_CAPTURE_PROMPTS || "").trim();
  return f || null;
}

export function maybeCapturePrompt(
  rec: { sessionId: string; agent: string; agenda: number; phase: string; system: string },
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const f = captureTarget(env);
  if (!f) return false;
  try {
    appendFileSync(f, JSON.stringify({ at: new Date().toISOString(), ...rec }) + "\n");
    return true;
  } catch {
    return false;
  }
}

/** XMD_TEST_MAX_AGENDAS=<n> (n ≥ 1) → agenda zinakatwa hadi n (majaribio mafupi). null bila XMD_TEST_HOOKS=1. */
export function testMaxAgendas(env: NodeJS.ProcessEnv = process.env): number | null {
  if (env.XMD_TEST_HOOKS !== "1") return null;
  const n = Number(env.XMD_TEST_MAX_AGENDAS);
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** TASK 16 (T4): XMD_TEST_CU_SILENT=1 → bridge ya kimya (`sleep`) badala ya oh_bridge — liveness ya CU_LIVENESS_MS ipimwe. */
export function cuSilentBridge(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XMD_TEST_HOOKS === "1" && env.XMD_TEST_CU_SILENT === "1";
}

/** TASK 18 (T1–T4): kwa milestone Mk — `XMD_TEST_BUILD_CMD_<Mk>` inabadilisha buildCommand ya lango;
 *  `XMD_TEST_GOAL_OFF_<Mk>=1` inazima judge kwa awamu hiyo; `XMD_TEST_CU_NOTE_<Mk>` ni agizo la ziada mwishoni mwa StartPack (mf. "usiandike Build Report"). Inert bila XMD_TEST_HOOKS=1. */
export function testGateOverride(milestoneId: string, env: NodeJS.ProcessEnv = process.env): { buildCommand?: string; note?: string; goalOff?: boolean } {
  if (env.XMD_TEST_HOOKS !== "1" || !milestoneId) return {};
  const out: { buildCommand?: string; note?: string; goalOff?: boolean } = {};
  // `XMD_TEST_GOAL_OFF_<Mk>=1` → bridge inaendeshwa bila judge (XMD_GOAL_OFF=1, njia ya dev ya oh_bridge) ili
  // lango la kumaliza liwe kizuizi PEKEE — T1/T3 zinapima hook yenyewe, si judge (real run 2: judge alikamata kwanza).
  if (env[`XMD_TEST_GOAL_OFF_${milestoneId}`] === "1") out.goalOff = true;
  const bc = env[`XMD_TEST_BUILD_CMD_${milestoneId}`];
  const note = env[`XMD_TEST_CU_NOTE_${milestoneId}`];
  if (bc) out.buildCommand = bc;
  if (note) out.note = note;
  return out;
}
