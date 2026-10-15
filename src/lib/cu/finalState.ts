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
// INTERIM: COMPLETED_VERIFIED haipo hadi task 18 (evidence gate) — run ya kawaida
// iliyomaliza ni COMPLETED_UNVERIFIED tu; KAMWE usiandike "verified".
// "stuck" + ripoti HAIKuhesabiwa success (hili ndilo tatizo la awali: ok = !!report).

export type CuFinalState =
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
}

export interface FinalStateOutcome {
  state: CuFinalState;
  /** ndio TU ikiwa state === "COMPLETED_UNVERIFIED" (interim: hii pekee inahesabika ok) */
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
    case "COMPLETED_UNVERIFIED": reason = "completed, NOT yet verified"; break;
    case "PARTIAL": reason = "imekamilika ila ripoti haipo (missing report)"; break;
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
  return { state, ok: state === "COMPLETED_UNVERIFIED", reason };
}
