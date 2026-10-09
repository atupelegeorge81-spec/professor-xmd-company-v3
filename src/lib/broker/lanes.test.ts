// src/lib/broker/lanes.test.ts — R38: (akaunti × model) iliyokufa 404 haizalishwi.
// Ushahidi (live probe 08-10): gemini-2.5-flash → gemini-1 ✅ 200 OK · gemini-2 ❌ 404
// "no longer available to new users". Lane ya gemini-2 inaondolewa PEKELE (gemini-1 inabaki nayo).
import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  // usageKeys inajenga cache kutoka env — keys lazima ziwepo kabla allLanes() haipo
  process.env.GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1 || "test-gemini-key-1";
  process.env.GEMINI_API_KEY_2 = process.env.GEMINI_API_KEY_2 || "test-gemini-key-2";
  process.env.GEMINI_API_KEY_3 = process.env.GEMINI_API_KEY_3 || "test-gemini-key-3"; // R41
  process.env.GEMINI_API_KEY_4 = process.env.GEMINI_API_KEY_4 || "test-gemini-key-4"; // R41
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

  it("R41 · keys 4: lanes za gemini-3 na gemini-4 zinazalishwa (akaunti × model)", async () => {
    const { allLanes } = await import("@/lib/broker/lanes");
    const ids = allLanes().map((l) => l.id);
    expect(ids).toContain("gemini-3:gemini-3.8-flash");
    expect(ids).toContain("gemini-3:gemini-3.5-flash-lite");
    expect(ids).toContain("gemini-4:gemini-3.8-flash");
    expect(ids).toContain("gemini-4:gemini-3.5-flash-lite");
    expect(ids).not.toContain("gemini-3:gemini-2.5-flash".replace("gemini-3", "gemini-2")); // skip ya gemini-2 pekee
  });

  it("R41 · config ya CU: keys 4 zinaingia sandbox + quota ya kila akaunti", async () => {
    const { buildCuConfig } = await import("@/lib/cu/engine");
    const cfg = buildCuConfig() as { gemini?: { keys?: Record<string, string>; quota?: Record<string, unknown> } };
    expect(Object.keys(cfg.gemini?.keys || {})).toEqual(["gemini-1", "gemini-2", "gemini-3", "gemini-4"]);
    expect(cfg.gemini?.keys?.["gemini-3"]).toBe("test-gemini-key-3");
    expect(cfg.gemini?.keys?.["gemini-4"]).toBe("test-gemini-key-4");
    for (const ga of ["gemini-1", "gemini-2", "gemini-3", "gemini-4"]) {
      expect(cfg.gemini?.quota?.[ga]).toBeTruthy(); // snapshot slot (gem/gem2/gem3/gem4)
    }
  });

  it("R41 · usage snapshot: rings 12 (gemini 4) — Gemini 3 & 4 zina AccountView", async () => {
    const { GEM_ACCOUNTS, ACCOUNTS } = await import("@/lib/usage/accounts");
    expect(GEM_ACCOUNTS).toHaveLength(4);
    const gems = ACCOUNTS.filter((a) => a.provider === "gemini");
    expect(gems.map((a) => a.id)).toEqual(["gemini-1", "gemini-2", "gemini-3", "gemini-4"]);
    expect(ACCOUNTS).toHaveLength(12);
  });

  it("config ya CU (sandbox): brain.py inapata modelSkip ileile", async () => {
    const { buildCuConfig } = await import("@/lib/cu/engine");
    const cfg = buildCuConfig() as { gemini?: { modelSkip?: Record<string, string[]> } };
    expect(cfg.gemini?.modelSkip).toEqual({ "gemini-2": ["gemini-2.5-flash"], "gemini-3": [], "gemini-4": [] }); // R41
  });

  it("env: GEMINI_MODEL_SKIP imefungwa kwa akaunti sahihi", async () => {
    const { GEMINI_MODEL_SKIP } = await import("@/lib/env");
    expect(GEMINI_MODEL_SKIP["gemini-2"]).toEqual(["gemini-2.5-flash"]);
    expect(GEMINI_MODEL_SKIP["gemini-1"]).toBeUndefined();
  });
});
