// src/lib/cu/finalState.ts — TASK-3 (maelezo3): Computer final states.
// Heuristic safi (pure) ya hali ya MWISHO ya run ya XMD Computer.
//
// JEDWALI LA MAPPING (bridge status → CuFinalState):
// ┌───────────────────────────┬────────────┬──────────┬────────────────────────┐
// │ bridge status (input)     │ hasReport  │ paused   │ → CuFinalState         │
// ├───────────────────────────┼────────────┼──────────┼────────────────────────┤
// │ "done" / "ok" / "success" │ ndiyo      │ -        │ COMPLETED_UNVERIFIED   │
// │ "done" / "ok" / "success" │ hapana     │ -        │ PARTIAL                │
// │ "stuck"                   │ yoyote     │ -        │ STUCK (hata ikiwa      │
// │                           │            │          │   ripoti ipo)          │
// │ "blocked"                 │ yoyote     │ -        │ BLOCKED                │
// │ "paused_quota" (au paused)│ -          │ ndiyo/-  │ PAUSED_QUOTA           │
// │ "error" / "crash" / fatal │ -          │ -        │ ERROR                  │
// │ <status isiyojulikana>    │ -          │ -        │ ERROR, reason = raw    │
// └───────────────────────────┴────────────┴──────────┴────────────────────────┘
//
// TASK-18: awamu za MILESTONE (flag ON) — lango la kumaliza (cu/gate.py) linatuma `gate` kwenye run_end:
// ┌───────────────────────────┬──────────────────────────────┬────────────────────────┐
// │ status (milestone)        │ gate                         │ → CuFinalState         │
// ├───────────────────────────┼──────────────────────────────┼────────────────────────┤
// │ "done"                    │ passed:true                  │ COMPLETED_VERIFIED     │
// │ "done"                    │ haipo / passed:false         │ PARTIAL (gate missing) │
// │ "partial" (loop guard)    │ partial:true, failed:[...]   │ PARTIAL (gate failed)  │
// │ stuck/blocked/paused/err  │ yoyote                       │ kama jedwali la juu    │
// └───────────────────────────┴──────────────────────────────┴────────────────────────┘
// COMPLETED_UNVERIFIED haitolewi kwa milestone; legacy (flag OFF) haibadiliki — KAMWE "verified" bila gate.
// "stuck" + ripoti HAIKuhesabiwa success (hili ndilo tatizo la awali: ok = !!report).

export type CuFinalState =
  | "COMPLETED_VERIFIED"
  | "COMPLETED_UNVERIFIED"
  | "PARTIAL"
  | "STUCK"
  | "BLOCKED"
  | "PAUSED_QUOTA"
  | "ERROR";

export interface FinalStateInput {
  /** status ya bridge run_end (kutoka cu/bridge.py: done | stuck | blocked | paused_quota | error | …) */
  status: string;
  /** je, ripoti ya finish ilikuwepo (cu.report) */
  hasReport: boolean;
  /** run ika-pause kwa quota (kwa input kamili; finishComputer hapitii hapa — ukingo wa :1025) */
  paused: boolean;
  /** maelezo ya kosa (mf. ev.fatal) — ikiwepo inaingizwa kwenye reason */
  error?: string;
  /** TASK-18: awamu ya milestone (flag ON) — mapping ya lango inatumika */
  milestone?: boolean;
  /** TASK-18: matokeo ya lango kutoka run_end ya bridge */
  gate?: CuGateInfo;
}

/** TASK-18: `gate` ya run_end (cu/gate.py GateGuard.summary). */
export interface CuGateInfo {
  passed: boolean;
  partial?: boolean;
  evaluated?: boolean;
  blocks?: number;
  failed?: string[];
  notes?: string[];
  checks?: Record<string, unknown>;
}

export interface FinalStateOutcome {
  state: CuFinalState;
  /** ndio TU ikiwa state ni COMPLETED_VERIFIED (milestone) au COMPLETED_UNVERIFIED (legacy) */
  ok: boolean;
  /** maelezo mafupi (kwa chip/item/log) — hasa kwa unknown status: raw status haiishi kimya */
  reason?: string;
}

const DONE_SET = new Set(["done", "ok", "success"]);

/** Pure: input → CuFinalState (hakuna I/O, hakuna side-effects). */
export function computeFinalState(input: FinalStateInput): CuFinalState {
  const raw = String(input.status || "").trim().toLowerCase();
  if (input.paused || raw === "paused_quota") return "PAUSED_QUOTA";
  if (raw === "stuck") return "STUCK";
  if (raw === "blocked") return "BLOCKED";
  if (input.milestone) {
    if (raw === "partial") return "PARTIAL";
    if (DONE_SET.has(raw)) return input.gate?.passed === true ? "COMPLETED_VERIFIED" : "PARTIAL";
  }
  if (DONE_SET.has(raw)) return input.hasReport ? "COMPLETED_UNVERIFIED" : "PARTIAL";
  if (raw === "error" || raw === "crash" || raw === "fatal") return "ERROR";
  return "ERROR"; // unknown status → KAMWE "ok" kimya kimya (reason hubeba raw hapa chini)
}

/** Wrapper: state + ok + reason (inayosomwa na finishComputer/UI). */
export function computeFinalOutcome(input: FinalStateInput): FinalStateOutcome {
  const state = computeFinalState(input);
  const raw = String(input.status || "");
  let reason: string | undefined;
  switch (state) {
    case "COMPLETED_VERIFIED": reason = `completed, verified by the completion gate${input.gate?.blocks ? ` (blocks ${input.gate.blocks})` : ""}`; break;
    case "COMPLETED_UNVERIFIED": reason = "completed, NOT yet verified"; break;
    case "PARTIAL": reason = input.milestone
      ? (input.gate?.failed?.length ? `PARTIAL: gate failed: ${input.gate.failed.join("; ").slice(0, 600)}` : "PARTIAL: completion gate did not pass (no gate result)")
      : "imekamilika ila ripoti haipo (missing report)"; break;
    case "STUCK": reason = `stuck${input.error ? ` · ${input.error}` : ""}`; break;
    case "BLOCKED": reason = `blocked${input.error ? ` · ${input.error}` : ""}`; break;
    case "PAUSED_QUOTA": reason = "paused (quota)"; break;
    case "ERROR": {
      const known = ["error", "crash", "fatal", ""].includes(raw.trim().toLowerCase());
      reason = known
        ? (input.error || "error")
        : `status isiyojulikana: "${raw}"${input.error ? ` · ${input.error}` : ""}`;
      break;
    }
  }
  return { state, ok: state === "COMPLETED_VERIFIED" || state === "COMPLETED_UNVERIFIED", reason };
}
