// src/lib/broker/judge.test.ts — TASK-30: lane class `judge` (Flash keys 4 → XKiro → Flash-Lite), thinking, rekodi ya wito,
// test hooks (XMD_TEST_LANES_DOWN / XMD_TEST_LANES_NOVISION — inert bila XMD_TEST_HOOKS=1), lanes nyingine hazibadiliki.
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  // keys za test (hakuna request halisi — brokerRun().next() inatoa lease tu)
  for (const [k, v] of Object.entries({
    XTROUTER_API_KEY_OPTIMUS_1: "test-xkiro-key-0001", XTROUTER_API_KEY_OPTIMUS_2: "test-xkiro-key-0002",
    OPENROUTER_API_KEY_1: "test-openrouter-key-1", UNOROUTER_API_KEY_1: "test-unorouter-key-1", GROQ_API_KEY_OPTIMUS_1: "test-groq-key-1",
    GEMINI_API_KEY_1: "test-gemini-key-AAA1", GEMINI_API_KEY_2: "test-gemini-key-BBB2", GEMINI_API_KEY_3: "test-gemini-key-CCC3", GEMINI_API_KEY_4: "test-gemini-key-DDD4",
  })) process.env[k] = process.env[k] || v;
});
beforeAll(async () => {
  // ledger ya memory isiyo na matumizi ya tests nyingine (.xmd/usage-ledger.json ya sandbox inaweza kuonyesha Flash "imeisha")
  const { ledger } = await import("@/lib/server/usageLedger");
  const L = ledger() as unknown as Record<string, unknown> & { xkiro: Record<string, { exhaustedAt?: number; limit?: number; used?: number }> };
  for (const k of ["gem", "gem2", "gem3", "gem4"]) L[k] = undefined;
  for (const x of Object.values(L.xkiro)) { x.exhaustedAt = undefined; x.limit = undefined; x.used = undefined; }
});
afterEach(() => vi.unstubAllEnvs());

const judgeLease = async (agentId = "judge-test") => {
  const { brokerRun } = await import("@/lib/broker");
  return brokerRun({ agentId, purpose: "review-analyse:M1:R0:designer", maxOut: 2000, cls: "heavy", messages: [{ role: "user", content: "judge" }], judge: true, waitMs: 0 }).next();
};

describe("TASK-30 · mnyororo wa judge (policy)", () => {
  it("mpangilio ni Flash → XKiro → Flash-Lite; lanes nyingine zina uzito 0 kwa judge", async () => {
    const { JUDGE_CHAIN, judgeWeightOf, judgeTierOf, laneWeight } = await import("@/lib/broker/policy");
    const { allLanes } = await import("@/lib/broker/lanes");
    expect(JUDGE_CHAIN).toEqual(["gemini-flash", "xkiro", "gemini-flash-lite"]);
    const lanes = allLanes();
    const of = (p: string, tier?: string) => lanes.find((l) => l.provider === p && (!tier || l.tier === tier))!;
    expect(judgeWeightOf(of("gemini", "flash"))).toBeGreaterThan(judgeWeightOf(of("xkiro")));
    expect(judgeWeightOf(of("xkiro"))).toBeGreaterThan(judgeWeightOf(of("gemini", "lite")));
    for (const p of ["groq", "unorouter", "openrouter"]) {
      expect(laneWeight("heavy", of(p), false, false, true), p).toBe(0);
      expect(judgeTierOf(of(p))).toBe(-1);
    }
  });

  it("T5 (code): madarasa ya zamani hayabadiliki — WEIGHTS / GEMINI_WEIGHTS / fast / plan ni yale yale", async () => {
    const { WEIGHTS, GEMINI_WEIGHTS, fastWeightOf, planWeightOf, laneWeight, weightOf } = await import("@/lib/broker/policy");
    const { allLanes } = await import("@/lib/broker/lanes");
    expect(WEIGHTS).toEqual({
      heavy: { unorouter: 1, openrouter: 0.8, xkiro: 0.6, groq: 0 },
      normal: { xkiro: 1, unorouter: 0.85, openrouter: 0.6, groq: 0.5 },
      light: { groq: 1, xkiro: 0.8, unorouter: 0.3, openrouter: 0 },
      background: { groq: 1, unorouter: 0.75, xkiro: 0.6, openrouter: 0 },
    });
    expect(GEMINI_WEIGHTS).toEqual({ heavy: { flash: 1.2, lite: 0.35 }, normal: { flash: 0, lite: 0.55 }, light: { flash: 0, lite: 1.05 }, background: { flash: 0, lite: 1.05 } });
    for (const l of allLanes()) {
      for (const cls of ["heavy", "normal", "light", "background"] as const) expect(laneWeight(cls, l), `${cls} ${l.id}`).toBe(weightOf(cls, l));
      expect(laneWeight("normal", l, true)).toBe(fastWeightOf(l));
      expect(laneWeight("normal", l, false, true)).toBe(planWeightOf(l));
    }
  });

  it("vision: Flash, XKiro, Flash-Lite zimethibitishwa (FLOW-MAP F); Groq hapana; NOVISION ni test hook tu", async () => {
    const { visionCapable } = await import("@/lib/broker/policy");
    const { allLanes } = await import("@/lib/broker/lanes");
    const lanes = allLanes();
    const xk = lanes.find((l) => l.provider === "xkiro")!;
    expect(visionCapable(lanes.find((l) => l.tier === "flash")!)).toBe(true);
    expect(visionCapable(lanes.find((l) => l.tier === "lite")!)).toBe(true);
    expect(visionCapable(xk)).toBe(true);
    expect(visionCapable(lanes.find((l) => l.provider === "groq")!)).toBe(false);
    expect(visionCapable(xk, { XMD_TEST_LANES_NOVISION: "xkiro" })).toBe(true); // bila XMD_TEST_HOOKS=1 → inert
    expect(visionCapable(xk, { XMD_TEST_HOOKS: "1", XMD_TEST_LANES_NOVISION: "xkiro" })).toBe(false);
  });
});

describe("TASK-30 · broker (judge: true)", () => {
  it("T1 (code): wito 8 → Flash pekee, keys ZOTE 4 zinazunguka (tofauti ≤1), thinking ON (reasoning_effort)", async () => {
    const count: Record<string, number> = {};
    for (let i = 0; i < 8; i++) {
      const l = await judgeLease();
      expect(l.lane.provider).toBe("gemini");
      expect(l.lane.tier).toBe("flash");
      expect(l.extraBody.reasoning_effort).toBe("high");
      count[l.account] = (count[l.account] || 0) + 1;
      l.done({ total_tokens: 10 });
    }
    expect(Object.keys(count).sort()).toEqual(["gemini-1", "gemini-2", "gemini-3", "gemini-4"]);
    expect(Math.max(...Object.values(count)) - Math.min(...Object.values(count))).toBeLessThanOrEqual(1);
  });

  it("T2 (code): Flash down → XKiro · Flash+XKiro down → Flash-Lite · zote 3 down → BrokerExhausted; usedFallback=true", async () => {
    const { laneCallOf, isBrokerExhausted } = await import("@/lib/broker");
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash");
    const a = await judgeLease("judge-t2a");
    expect(a.lane.provider).toBe("xkiro");
    expect(a.extraBody.reasoning_effort).toBeUndefined(); // thinking config ni ya Gemini tu
    expect(laneCallOf(a, { prompt_tokens: 5, completion_tokens: 2 }, 1, true)).toMatchObject({ usedFallback: true, judgeTier: 1, laneClass: "xkiro", tokensIn: 5, tokensOut: 2 });
    a.done();
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,xkiro");
    const b = await judgeLease("judge-t2b");
    expect(b.lane.tier).toBe("lite");
    expect(b.extraBody.reasoning_effort).toBe("high");
    expect(laneCallOf(b, null, 1, true)).toMatchObject({ usedFallback: true, judgeTier: 2, laneClass: "gemini-flash-lite" });
    b.done();
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,xkiro,gemini-flash-lite");
    await expect(judgeLease("judge-t2c")).rejects.toSatisfy(isBrokerExhausted);
  });

  it("vision rule: judge mwenye picha → lane YENYE vision kwanza (Flash down + XKiro bila vision → Flash-Lite, si degrade)", async () => {
    const { brokerRun } = await import("@/lib/broker");
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash");
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "xkiro");
    const run = (vision: boolean) => brokerRun({ agentId: `judge-vis-${vision}`, purpose: "review-verify:M1:R1:designer", maxOut: 2000, cls: "heavy", messages: [{ role: "user", content: "x" }], judge: true, vision, waitMs: 0 }).next();
    const withImg = await run(true);
    expect(withImg.lane.tier).toBe("lite");
    withImg.done();
    const textOnly = await run(false);
    expect(textOnly.lane.provider).toBe("xkiro"); // bila picha: mpangilio wa kawaida wa mnyororo
    textOnly.done();
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,gemini-flash-lite");
    // TASK-32 (CEO 2026-10-21): XKiro si judge wa picha tena → hakuna Flash/Flash-Lite = BrokerExhausted (si degrade kwa XKiro)
    const { isBrokerExhausted } = await import("@/lib/broker");
    await expect(run(true)).rejects.toSatisfy(isBrokerExhausted);
    const txt = await run(false);
    expect(txt.lane.provider).toBe("xkiro"); // maandishi tu: XKiro bado yupo kwenye mnyororo
    txt.done();
  });

  it("TASK-32: judge wa picha HATUMII XKiro hata ikiwa na vision na nafasi (Flash down → Flash-Lite moja kwa moja)", async () => {
    const { brokerRun, judgeVisionReady } = await import("@/lib/broker");
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash");
    const r = await brokerRun({ agentId: "judge-t32-img", purpose: "review-verify:M1:R1:designer", maxOut: 2000, cls: "heavy", messages: [{ role: "user", content: "x" }], judge: true, vision: true, waitMs: 0 }).next();
    expect(r.lane.tier).toBe("lite");
    r.done();
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,gemini-flash-lite");
    expect(judgeVisionReady()).toEqual({ ready: false, lane: null }); // XKiro haihesabiwi kama judge wa picha
  });

  it("hook ni ya judge PEKEE na inert bila XMD_TEST_HOOKS=1; zamu ya kawaida ya Board (normal) bado ni XKiro", async () => {
    const { brokerRun } = await import("@/lib/broker");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash");
    const inert = await judgeLease("judge-inert");
    expect(inert.lane.tier).toBe("flash");
    inert.done();
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,xkiro");
    const turn = await brokerRun({ agentId: "board-t5", purpose: "board-turn", cls: "normal", maxOut: 2000, priority: "live", reasoning: true, messages: [{ role: "user", content: "hi" }], waitMs: 0 }).next();
    expect(turn.lane.provider).toBe("xkiro"); // WEIGHTS.normal: XKiro kwanza — hook ya judge haiigusi
    expect(turn.extraBody.reasoning_effort).toBeUndefined();
    turn.done();
  });

  it("rekodi ya wito: keyId = herufi 4 za mwisho tu (hakuna key nzima); judgeVisionReady inafuata hooks", async () => {
    const { laneCallOf, maskKeyTail, judgeVisionReady } = await import("@/lib/broker");
    const l = await judgeLease("judge-key");
    const c = laneCallOf(l, { prompt_tokens: 10, completion_tokens: 3, completion_tokens_details: { reasoning_tokens: 120 } } as never, 1, true);
    l.done();
    expect(c.keyId).toMatch(/^\*\*\*[A-Za-z0-9]{4}$/);
    expect(c.keyId).not.toContain("test-gemini");
    expect(c).toMatchObject({ judge: true, usedFallback: false, visionCapable: true, reasoningTokens: 120, flags: { reasoning_effort: "high" } });
    expect(maskKeyTail("abc")).toBe("***");
    // Gemini (OpenAI compat, stream): thoughts ziko ndani ya total_tokens tu → reasoningTokens = total − prompt − completion
    expect(laneCallOf(l, { prompt_tokens: 31, completion_tokens: 1, total_tokens: 240 } as never, 1, true).reasoningTokens).toBe(208);
    expect(judgeVisionReady().ready).toBe(true);
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_DOWN", "gemini-flash,gemini-flash-lite");
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "xkiro");
    expect(judgeVisionReady()).toEqual({ ready: false, lane: null });
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "");
    expect(judgeVisionReady()).toEqual({ ready: false, lane: null }); // TASK-32 (CEO): XKiro si judge wa picha hata ikiwa na vision
  });
});
