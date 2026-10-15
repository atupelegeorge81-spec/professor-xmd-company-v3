// src/lib/cu/finalState.test.ts — TASK-3 (maelezo3) T1: jedwali la mapping (pure, hakuna I/O).
import { describe, expect, it } from "vitest";
import { computeFinalOutcome, computeFinalState, type CuFinalState } from "./finalState";

type Row = { status: string; hasReport: boolean; paused?: boolean; error?: string; want: CuFinalState };
const TABLE: Row[] = [
  { status: "done", hasReport: true, want: "COMPLETED_UNVERIFIED" },
  { status: "ok", hasReport: true, want: "COMPLETED_UNVERIFIED" },
  { status: "success", hasReport: true, want: "COMPLETED_UNVERIFIED" },
  { status: "DONE", hasReport: true, want: "COMPLETED_UNVERIFIED" },
  { status: "done", hasReport: false, want: "PARTIAL" },
  { status: "ok", hasReport: false, want: "PARTIAL" },
  { status: "stuck", hasReport: true, want: "STUCK" },   // kosa la awali: hii ilihesabiwa success
  { status: "stuck", hasReport: false, want: "STUCK" },
  { status: "blocked", hasReport: true, want: "BLOCKED" },
  { status: "blocked", hasReport: false, want: "BLOCKED" },
  { status: "paused_quota", hasReport: false, want: "PAUSED_QUOTA" },
  { status: "done", hasReport: true, paused: true, want: "PAUSED_QUOTA" },
  { status: "error", hasReport: true, want: "ERROR" },
  { status: "error", hasReport: false, error: "bridge exit 1", want: "ERROR" },
  { status: "crash", hasReport: false, want: "ERROR" },
  { status: "fatal", hasReport: true, want: "ERROR" },
  { status: "weird_status", hasReport: true, want: "ERROR" }, // unknown → ERROR, kamwe "ok" kimya
  { status: "", hasReport: true, want: "ERROR" },
];

describe("TASK-3 · computeFinalState — jedwali la mapping", () => {
  for (const r of TABLE) {
    it(`${JSON.stringify(r.status)} report=${r.hasReport}${r.paused ? " paused" : ""} → ${r.want}`, () => {
      expect(computeFinalState({ status: r.status, hasReport: r.hasReport, paused: !!r.paused, error: r.error })).toBe(r.want);
    });
  }
});

describe("TASK-3 · computeFinalOutcome — ok + reason", () => {
  it("ok ni kweli TU kwa COMPLETED_UNVERIFIED", () => {
    for (const r of TABLE) {
      const o = computeFinalOutcome({ status: r.status, hasReport: r.hasReport, paused: !!r.paused, error: r.error });
      expect(o.state).toBe(r.want);
      expect(o.ok).toBe(r.want === "COMPLETED_UNVERIFIED");
    }
  });
  it("COMPLETED_UNVERIFIED inasema 'NOT yet verified' — si 'verified'", () => {
    const o = computeFinalOutcome({ status: "done", hasReport: true, paused: false });
    expect(o.reason).toBe("completed, NOT yet verified");
  });
  it("unknown status: raw status inahifadhiwa kwenye reason", () => {
    const o = computeFinalOutcome({ status: "weird_status", hasReport: true, paused: false });
    expect(o.state).toBe("ERROR");
    expect(o.ok).toBe(false);
    expect(o.reason).toContain("weird_status");
  });
  it("stuck + error → reason inabeba sababu", () => {
    const o = computeFinalOutcome({ status: "stuck", hasReport: true, paused: false, error: "brake fired" });
    expect(o.reason).toBe("stuck · brake fired");
  });
});
