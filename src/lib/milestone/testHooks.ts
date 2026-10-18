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
