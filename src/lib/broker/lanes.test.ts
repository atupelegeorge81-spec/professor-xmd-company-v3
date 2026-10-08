// src/lib/broker/lanes.test.ts — R38: (akaunti × model) iliyokufa 404 haizalishwi.
// Ushahidi (live probe 08-10): gemini-2.5-flash → gemini-1 ✅ 200 OK · gemini-2 ❌ 404
// "no longer available to new users". Lane ya gemini-2 inaondolewa PEKELE (gemini-1 inabaki nayo).
import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  // usageKeys inajenga cache kutoka env — keys lazima ziwepo kabla allLanes() haipo
  process.env.GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1 || "test-gemini-key-1";
  process.env.GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2 || "test-gemini-key-2";
});

describe("R38 — GEMINI_MODEL_SKIP (gemini-2:gemini-2.5-flash = 404)", () => {
  it("broker ya Board: lane gemini-2:gemini-2.5-flash haizalishwi; gemini-1 inabaki nayo", async () => {
    const { allLanes } = await import("@/lib/broker/lanes");
    const ids = allLanes().map((l) => l.id);
    expect(ids).not.toContain("gemini-2:gemini-2.5-flash"); // iliyo kufa (404)
    expect(ids).toContain("gemini-1:gemini-2.5-flash"); // inafanya kazi (200 OK)
    expect(ids).toContain("gemini-1:gemini-3.8-flash"); // models nyingine hazikuguswa
    expect(ids).toContain("gemini-2:gemini-3.8-flash");
    expect(ids).toContain("gemini-2:gemini-3.5-flash-lite"); // lite hazikuguswa
  });

  it("config ya CU (sandbox): brain.py inapata modelSkip ileile", async () => {
    const { buildCuConfig } = await import("@/lib/cu/engine");
    const cfg = buildCuConfig() as { gemini?: { modelSkip?: Record<string, string[]> } };
    expect(cfg.gemini?.modelSkip).toEqual({ "gemini-2": ["gemini-2.5-flash"] });
  });

  it("env: GEMINI_MODEL_SKIP imefungwa kwa akaunti sahihi", async () => {
    const { GEMINI_MODEL_SKIP } = await import("@/lib/env");
    expect(GEMINI_MODEL_SKIP["gemini-2"]).toEqual(["gemini-2.5-flash"]);
    expect(GEMINI_MODEL_SKIP["gemini-1"]).toBeUndefined();
  });
});
