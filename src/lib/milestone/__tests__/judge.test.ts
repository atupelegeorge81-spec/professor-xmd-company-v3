// TASK-30: vision rule (picha + lane bila vision → digest ya maandishi, visionDegraded) · rekodi ya lanesUsed · schema · pause ya system
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { degradeMessages, digestKey, hasImages, judgeComplete, laneUseOf, makeImageDigest, VISION_DEGRADED_NOTE } from "../judge";
import { appendLaneUse, newMilestoneState, transition } from "../state";
import { validateMilestoneState } from "../schemas";
import type { CompleteResult, LaneCall } from "@/lib/broker";
import type { EvidencePack, LaneUse, MilestoneState } from "../types";

beforeAll(() => {
  process.env.XTROUTER_API_KEY_OPTIMUS_1 = process.env.XTROUTER_API_KEY_OPTIMUS_1 || "test-xkiro-key-0001";
  process.env.GEMINI_API_KEY_1 = process.env.GEMINI_API_KEY_1 || "test-gemini-key-AAA1";
});
afterEach(() => vi.unstubAllEnvs());

const lanes = async () => (await import("@/lib/broker/lanes")).allLanes();
const IMG = [{ role: "user", content: [
  { type: "text", text: "Judge the page." },
  { type: "text", text: "Image S-001 — route / · viewport 375x667 · state default:" },
  { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
  { type: "text", text: "Image S-002 — route / · viewport 1280x800 · state default:" },
  { type: "image_url", image_url: { url: "data:image/png;base64,BBBB" } },
] }];
const call = (laneId: string, over: Partial<LaneCall> = {}): LaneCall => ({
  callId: "L1-x", lane: laneId, model: "m", provider: "xkiro", laneClass: "xkiro", keyId: "***0001", visionCapable: false,
  usedFallback: true, judge: true, judgeTier: 1, tokensIn: 100, tokensOut: 20, reasoningTokens: 0, ms: 50, hops: 1, flags: {}, ...over,
});

describe("vision rule: degradeMessages / hasImages", () => {
  it("kila picha → digest yake (kwa id ya lebo) · hakuna image_url inayobaki · tangazo la VISION DEGRADED juu", () => {
    expect(hasImages(IMG)).toBe(true);
    const out = degradeMessages(IMG, { "S-001": "Mobile: header overlaps the hero title." });
    expect(hasImages(out)).toBe(false);
    const parts = out[0].content as { type: string; text: string }[];
    expect(parts[0].text).toBe(VISION_DEGRADED_NOTE);
    expect(parts.map((p) => p.text).join("\n")).toContain("[picture S-001 NOT attached — TEXT DIGEST (Gemini Flash vision, made earlier):] Mobile: header overlaps the hero title.");
    expect(parts.map((p) => p.text).join("\n")).toContain("[picture S-002 NOT attached and no digest exists for it — use the DOM metrics only.]"); // HAIONDOLEWI kimya
    expect(degradeMessages([{ role: "user", content: "text only" }], null)).toEqual([{ role: "user", content: "text only" }]);
  });
});

describe("judgeComplete", () => {
  it("T4 (code): lane bila vision → ujumbe wa digest, visionDegraded=true kwenye jibu NA rekodi ya lane", async () => {
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "xkiro");
    const xk = (await lanes()).find((l) => l.provider === "xkiro")!;
    let seen: unknown[] = [];
    const recs: LaneUse[] = [];
    const r = await judgeComplete(
      { agentId: "designer", purpose: "review-analyse:M1:R0:designer", maxOut: 100, messages: IMG as never },
      { digest: { "S-001": "d1", "S-002": "d2" }, onLane: (x) => recs.push(x), complete: async (spec) => {
        expect(spec.judge).toBe(true);
        seen = spec.messagesFor!(xk) as unknown[];
        return { text: "{}", reasoning: "", lane: xk, usage: null, call: call(xk.id) } as CompleteResult;
      } },
    );
    expect(r.visionDegraded).toBe(true);
    expect(hasImages(seen as never)).toBe(false);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ visionDegraded: true, judge: true, usedFallback: true, keyId: "***0001", purpose: "review-analyse:M1:R0:designer", tokensIn: 100, tokensOut: 20 });
  });

  it("lane yenye vision (Flash) → picha halisi, si degraded; wito bila picha haupewi messagesFor", async () => {
    const fl = (await lanes()).find((l) => l.tier === "flash")!;
    let seen: unknown;
    const r = await judgeComplete({ agentId: "frontend", purpose: "p", maxOut: 100, messages: IMG as never }, { complete: async (spec) => {
      seen = spec.messagesFor!(fl);
      return { text: "{}", reasoning: "", lane: fl, usage: null, call: call(fl.id, { visionCapable: true, usedFallback: false }) } as CompleteResult;
    } });
    expect(r.visionDegraded).toBe(false);
    expect(seen).toBe(IMG);
    await judgeComplete({ agentId: "frontend", purpose: "p", maxOut: 100, messages: [{ role: "user", content: "x" }] }, { complete: async (spec) => {
      expect(spec.messagesFor).toBeUndefined();
      return { text: "{}", reasoning: "", lane: fl, usage: null, call: call(fl.id) } as CompleteResult;
    } });
  });
});

describe("makeImageDigest", () => {
  const pack = { milestoneId: "M1", round: 0, screenshots: [{ id: "S-001", route: "/", viewport: "375x667", state: "default", url: "x" }, { id: "S-002", route: "/", viewport: "1280x800", state: "default", url: "y" }] } as unknown as EvidencePack;
  it("wito MMOJA wa Gemini (allow gemini · heavy) → JSON ya id → maelezo · digestKey", async () => {
    const fl = (await lanes()).find((l) => l.tier === "flash")!;
    const recs: LaneUse[] = [];
    const d = await makeImageDigest(pack, { loadImage: async () => ({ mime: "image/png", base64: "AAAA" }), onLane: (x) => recs.push(x), now: () => "T", complete: async (spec) => {
      expect(spec.allow).toEqual(["gemini"]);
      expect(spec.cls).toBe("heavy");
      expect(hasImages(spec.messages as never)).toBe(true);
      return { text: 'ok {"S-001":"Header overlaps title.","S-002":"Wide layout, fine."}', reasoning: "", lane: fl, usage: null, call: call(fl.id, { visionCapable: true }) } as CompleteResult;
    } });
    expect(d).toMatchObject({ milestoneId: "M1", round: 0, byId: { "S-001": "Header overlaps title.", "S-002": "Wide layout, fine." }, at: "T" });
    expect(recs[0].purpose).toBe("image-digest:M1:R0");
    expect(digestKey("M1", 2)).toBe("digest:M1:R2");
  });
  it("lane bila vision / JSON mbovu / hakuna picha → null (hakuna digest ya uongo)", async () => {
    vi.stubEnv("XMD_TEST_HOOKS", "1");
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "gemini-flash");
    const fl = (await lanes()).find((l) => l.tier === "flash")!;
    const c = async () => ({ text: '{"S-001":"x"}', reasoning: "", lane: fl, usage: null, call: call(fl.id) }) as CompleteResult;
    expect(await makeImageDigest(pack, { loadImage: async () => ({ mime: "image/png", base64: "A" }), complete: c })).toBeNull();
    vi.stubEnv("XMD_TEST_LANES_NOVISION", "");
    expect(await makeImageDigest(pack, { loadImage: async () => ({ mime: "image/png", base64: "A" }), complete: async () => ({ ...(await c()), text: "not json" }) })).toBeNull();
    expect(await makeImageDigest(pack, { loadImage: async () => null, complete: c })).toBeNull();
  });
});

describe("lanesUsed (state + schema)", () => {
  const rec = laneUseOf(call("xkiro-1:qwen"), "review-verify:M1:R1:designer", true);
  it("appendLaneUse: stepId tupu → hatua inayoendeshwa · keyId iliyofichwa haibadiliki · schema inakubali sehemu mpya", () => {
    const st = { ...newMilestoneState("M1"), currentStepId: "M1.R1.verify" } as MilestoneState;
    const a = appendLaneUse(st, rec);
    expect(a.lanesUsed.at(-1)).toMatchObject({ stepId: "M1.R1.verify", keyId: "***0001", visionDegraded: true, usedFallback: true, tokensIn: 100, tokensOut: 20 });
    expect(validateMilestoneState(a).ok).toBe(true);
  });
  it("schema inakataa keyId isiyofichwa (siri) na aina mbovu", () => {
    const st = newMilestoneState("M1");
    const bad = { ...st, lanesUsed: [{ ...rec, stepId: "M1.R0.review", keyId: "AIzaSyFULLKEYVALUE1234" }] };
    expect(validateMilestoneState(bad).ok).toBe(false);
    const bad2 = { ...st, lanesUsed: [{ ...rec, stepId: "M1.R0.review", visionDegraded: "yes" }] };
    expect(validateMilestoneState(bad2 as never).ok).toBe(false);
  });
  it("PAUSED_QUOTA (system, resumeAt) → RESUME inarudi hatua ileile na kuondoa sehemu za pause", () => {
    const ok = (r: { state: MilestoneState } | { error: string }) => { if ("error" in r) throw new Error(r.error); return r.state; };
    let st = newMilestoneState("M1");
    for (const to of ["PLANNING", "BUILDING", "EVIDENCE", "REVIEW_R0", "FIXING", "VERIFYING"] as const) st = ok(transition(st, { type: "GOTO", to }));
    st = { ...ok(transition(st, { type: "GOTO", to: "PAUSED_QUOTA" })), resumeAt: "2026-10-20T00:00:00.000Z", pauseOrigin: "system", pauseReason: "vision: x" };
    expect(validateMilestoneState(st).ok).toBe(true);
    const r = ok(transition(st, { type: "RESUME" }));
    expect(r.status).toBe("VERIFYING");
    expect(r.resumeAt).toBeUndefined();
    expect(r.pauseOrigin).toBeUndefined();
    expect(r.pauseReason).toBeUndefined();
  });
});
