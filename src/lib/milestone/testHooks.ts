// src/lib/milestone/testHooks.ts — TASK 14: hooks za majaribio PEKEE (maelezo0: inert bila XMD_TEST_HOOKS=1).
// XMD_TEST_CAPTURE_PROMPTS=<file.jsonl> → system prompt halisi ya kila zamu ya mjadala inaandikwa (kwa T3/T4).

import { appendFileSync, existsSync, writeFileSync } from "node:fs";

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
export function testGateOverride(milestoneId: string, env: NodeJS.ProcessEnv = process.env): { buildCommand?: string; note?: string; goalOff?: boolean; receiptsPath?: string } {
  if (env.XMD_TEST_HOOKS !== "1" || !milestoneId) return {};
  const out: { buildCommand?: string; note?: string; goalOff?: boolean; receiptsPath?: string } = {};
  // `XMD_TEST_GOAL_OFF_<Mk>=1` → bridge inaendeshwa bila judge (XMD_GOAL_OFF=1, njia ya dev ya oh_bridge) ili
  // lango la kumaliza liwe kizuizi PEKEE — T1/T3 zinapima hook yenyewe, si judge (real run 2: judge alikamata kwanza).
  if (env[`XMD_TEST_GOAL_OFF_${milestoneId}`] === "1") out.goalOff = true;
  const bc = env[`XMD_TEST_BUILD_CMD_${milestoneId}`];
  const note = env[`XMD_TEST_CU_NOTE_${milestoneId}`];
  if (bc) out.buildCommand = bc;
  if (note) out.note = note;
  // TASK 25 (T5): `XMD_TEST_FIX_RECEIPTS_PATH_<Mk>` → lango (e) linatafuta receipts kwenye njia isiyowezekana (mf. /proc/…)
  // — "kumaliza bila receipts" kwa uhakika (kama T18 T4 `test -f /proc/…`); agent bado anaambiwa `.xmd/receipts/R<n>.json`.
  const rp = env[`XMD_TEST_FIX_RECEIPTS_PATH_${milestoneId}`];
  if (rp) out.receiptsPath = rp;
  return out;
}

/** TASK 25 (T2): `XMD_TEST_FIX_NOOP_<Mk>=1` → baada ya attempt 1 ya raundi ya marekebisho, kazi ya Computer inafutwa
 *  (`git reset --hard <HEAD ya mwanzo>`) — "Computer haikubadilisha kitu"; harness lazima iseme NOT_ATTEMPTED na irudie mara moja.
 *  Attempt 2 (rerun) haiguswi. Inert bila XMD_TEST_HOOKS=1. */
export function testFixNoop(milestoneId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XMD_TEST_HOOKS === "1" && !!milestoneId && ["1", "all"].includes(String(env[`XMD_TEST_FIX_NOOP_${milestoneId}`]));
}
/** TASK 27 (T3): `XMD_TEST_FIX_NOOP_<Mk>=all` → kazi inafutwa kwenye KILA jaribio (rerun pia) — diff haigusi lengo kabisa. */
export function testFixNoopAll(milestoneId: string, env: NodeJS.ProcessEnv = process.env): boolean {
  return env.XMD_TEST_HOOKS === "1" && !!milestoneId && env[`XMD_TEST_FIX_NOOP_${milestoneId}`] === "all";
}

/** TASK 28 (T2): `XMD_TEST_MAX_ROUNDS=<n>` (1..10) → kikomo cha raundi kinashushwa kwa milestone mpya (njia ya CAP ipimwe haraka). null bila XMD_TEST_HOOKS=1. */
export function testMaxRounds(env: Record<string, string | undefined> = process.env): number | null {
  if (env.XMD_TEST_HOOKS !== "1") return null;
  const n = Number(env.XMD_TEST_MAX_ROUNDS);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : null;
}

/** TASK 28 (T5): `XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_<Mk>=1` → process inajiua (SIGKILL) MARA MOJA baada ya commit + tag ya sign-off,
 *  KABLA rekodi haijahifadhiwa — kill -9 halisi. Mara moja tu kwa session (alama /tmp), resume haijiui tena. Inert bila XMD_TEST_HOOKS=1. */
export function testCrashAfterSignoffGit(milestoneId: string, sessionId: string, env: Record<string, string | undefined> = process.env): boolean {
  if (env.XMD_TEST_HOOKS !== "1" || env[`XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_${milestoneId}`] !== "1") return false;
  const mark = `/tmp/xmd-crash-signoff-${String(sessionId).replace(/[^\w-]/g, "_")}-${milestoneId}`;
  try {
    if (existsSync(mark)) return false;
    writeFileSync(mark, new Date().toISOString());
    return true;
  } catch { return false; }
}
