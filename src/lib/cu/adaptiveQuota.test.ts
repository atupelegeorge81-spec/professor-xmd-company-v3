// src/lib/cu/adaptiveQuota.test.ts — Task 4 (Adaptive Brain): UI ya Usage inaonyesha Lite 4 za CU +
// snapshot ya quota ya sandbox (§6) haina keys na ina muundo wa buildCuConfig.
import { describe, expect, it, beforeAll } from "vitest";

beforeAll(() => {
  process.env.GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1 || "test-gemini-key-1";
  process.env.OPENROUTER_API_KEY_1 = process.env.OPENROUTER_API_KEY_1 || "test-or-key-1";
});

describe("Adaptive Brain — Lite za CU kwenye Usage + quota snapshot", () => {
  it("geminiView: safu za Lite preview/latest zipo na cap 20; 3.1/3.5 = 500", async () => {
    const { geminiView } = await import("@/lib/server/usageSnapshot");
    const v = geminiView("gemini-1");
    const lim = Object.fromEntries((v.models || []).map((m: any) => [m.model, m.rpdLimit]));
    expect(lim["gemini-3.1-flash-lite-preview"]).toBe(20);
    expect(lim["gemini-flash-lite-latest"]).toBe(20);
    expect(lim["gemini-3.5-flash-lite"]).toBe(500);
    expect(lim["gemini-3.1-flash-lite"]).toBe(500);
    expect(String(v.window)).toContain("Flash-Lite");
  });

  it("matumizi ya CU kwenye preview yanaonekana kwenye UI", async () => {
    const { noteGemResult } = await import("@/lib/server/usageLedger");
    const { geminiView } = await import("@/lib/server/usageSnapshot");
    noteGemResult("chat", "gemini-3.1-flash-lite-preview", true, 100, "gemini-1");
    const row = (geminiView("gemini-1").models || []).find((m: any) => m.model === "gemini-3.1-flash-lite-preview");
    expect(row?.rpdUsed).toBeGreaterThanOrEqual(1);
  });

  it("cuQuotaSnapshot: muundo wa quota (gemini chat + or) bila keys", async () => {
    const { cuQuotaSnapshot } = await import("@/lib/cu/engine");
    const s = cuQuotaSnapshot();
    expect(Object.keys(s)).toEqual(["gemini", "or", "at"]);
    const g1 = s.gemini["gemini-1"] as { chat?: Record<string, { requests?: number }> };
    expect(g1?.chat?.["gemini-3.1-flash-lite-preview"]?.requests).toBeGreaterThanOrEqual(1);
    expect(JSON.stringify(s)).not.toContain("test-gemini-key");
    expect(JSON.stringify(s)).not.toContain("test-or-key");
  });

  it("buildCuConfig: liteRpdByModel kutoka chanzo kimoja (cuLiteRpd)", async () => {
    const { buildCuConfig } = await import("@/lib/cu/engine");
    const cfg = buildCuConfig() as { gemini?: { liteRpdByModel?: Record<string, number>; liteModels?: string[] } };
    expect(cfg.gemini?.liteRpdByModel).toEqual({
      "gemini-3.5-flash-lite": 500, "gemini-3.1-flash-lite": 500,
      "gemini-3.1-flash-lite-preview": 20, "gemini-flash-lite-latest": 20,
    });
  });
});
