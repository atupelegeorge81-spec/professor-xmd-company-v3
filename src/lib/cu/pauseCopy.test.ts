// pauseCopy.test.ts — R44-E: card ya pause inasema KWELO (dakika vs siku vs sandbox vs stall).
import { describe, expect, it } from "vitest";
import { quotaPauseCopy } from "./pauseCopy";

const NOW = 1_790_000_000_000;

describe("quotaPauseCopy", () => {
  it("residual ≤ dakika 5 → TOKENS ZA DAKIKA (TPM/RPM) + sekunde", () => {
    const c = quotaPauseCopy(NOW + 61_000, NOW);
    expect(c.title).toMatch(/dakika/i);
    expect(c.sub).toContain("61");
    expect(c.title).not.toMatch(/siku/);
  });
  it("residual kubwa → quota ya SIKU + saa", () => {
    const c = quotaPauseCopy(NOW + 8 * 3600_000, NOW);
    expect(c.title).toMatch(/siku/);
    expect(c.sub).toContain("YENYEWE");
  });
  it("reason ya sandbox → SANDBOX MPYA (R44-B)", () => {
    const c = quotaPauseCopy(NOW + 120_000, NOW, "Sandbox ya E2B haipo tena (imekufa/imepumzika kwa timeout)");
    expect(c.title).toMatch(/Sandbox mpya/i);
    expect(c.sub).toContain("kiovu");
  });
  it("reason ya stall → utaratibu (si quota)", () => {
    const c = quotaPauseCopy(NOW + 600_000, NOW, "hakuna tukio la bridge kwa 15 dk (LLM imekwama)");
    expect(c.title).toMatch(/utaratibu/i);
    expect(c.title).not.toMatch(/quota|Tokens/);
  });
  it("resumeAt hakuna → default ya siku (si crash)", () => {
    const c = quotaPauseCopy(undefined, NOW);
    expect(c.title).toMatch(/siku/);
    expect(c.t).toBe("baadaye");
  });
});
