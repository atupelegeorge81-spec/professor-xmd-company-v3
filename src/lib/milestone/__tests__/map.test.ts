// TASK 12 — map.ts: retry ya validator, fallback ya code, test hook, na T2 (ramani 5 mbovu zinakataliwa kwa makosa sahihi).
import { describe, expect, it, vi } from "vitest";
import { validateMilestoneMap } from "../schemas";
import {
  MAP_AGENT_IDS, MAP_MAX_ATTEMPTS, MAP_SYSTEM_PROMPT, detectHasUI, fallbackMap, generateMilestoneMap, mapUserPrompt, maybeBreakMapOutput, parseMapText,
  type MapComplete,
} from "../map";

const agendas10 = Array.from({ length: 10 }, (_, i) => `xmdtest agenda ${i + 1}`);
const good = {
  milestones: [
    { id: "M1", title: "Foundation", agendas: { from: 1, to: 3 }, phase: "foundation", reviewMode: "visual", roster: ["Optimus", "ultron"], rationale: "tokens" },
    { id: "M2", title: "Core", agendas: { from: 4, to: 7 }, phase: "core", reviewMode: "mixed", roster: ["optimus", "vextron", "megatron"], rationale: "core" },
    { id: "M3", title: "Quality", agendas: { from: 8, to: 10 }, phase: "quality_deploy", reviewMode: "technical", roster: ["optimus", "cybertron"], rationale: "deploy" },
  ],
};
const seq = (...texts: string[]): MapComplete & { calls: any[][] } => {
  const calls: any[][] = [];
  const f = (async (m: any[]) => { calls.push(m.map((x) => ({ ...x }))); return { text: texts[Math.min(calls.length - 1, texts.length - 1)], lane: "fake (tier flash)" }; }) as any;
  f.calls = calls;
  return f;
};
const quiet = () => {};

describe("generateMilestoneMap", () => {
  it("jibu sahihi mara ya kwanza → attempts 1, retries 0, roster kwa herufi ndogo", async () => {
    const c = seq("```json\n" + JSON.stringify(good) + "\n```");
    const r = await generateMilestoneMap({ brief: "website", agendas: agendas10, hasUI: true, sessionId: "xmdtest-s", complete: c, log: quiet });
    expect(r.usedFallback).toBe(false);
    expect([r.attempts, r.retries]).toEqual([1, 0]);
    expect(r.map.milestones[0].roster).toEqual(["optimus", "ultron"]);
    expect(r.map.generatedBy).toBe("optimus@fake (tier flash)");
    expect(validateMilestoneMap(r.map, 10, MAP_AGENT_IDS, { hasUI: true }).ok).toBe(true);
    expect(c.calls[0][0]).toEqual({ role: "system", content: MAP_SYSTEM_PROMPT });
  });

  it("jibu baya → makosa yanarudishwa kwa model → jaribio la 2 linafaulu", async () => {
    const bad = { milestones: good.milestones.slice(0, 2) }; // inaishia agenda 7, phase ya mwisho si quality_deploy
    const c = seq(JSON.stringify(bad), JSON.stringify(good));
    const r = await generateMilestoneMap({ brief: "website", agendas: agendas10, hasUI: true, sessionId: "xmdtest-s", complete: c, log: quiet });
    expect([r.usedFallback, r.attempts, r.retries]).toEqual([false, 2, 1]);
    const feedback = c.calls[1][c.calls[1].length - 1].content as string;
    expect(feedback).toContain("Your map is invalid. Errors:");
    expect(feedback).toContain('map.milestones[1].phase: last milestone must be "quality_deploy"');
    expect(feedback).toContain("map.milestones[1].agendas.to: last milestone must end at agenda 10");
  });

  it("mara 3 mbovu → fallback ya code (valid, usedFallback=true, log line)", async () => {
    const log = vi.fn();
    const c = seq("sorry, no json", "[1,2]", JSON.stringify({ milestones: [] }));
    const r = await generateMilestoneMap({ brief: "website", agendas: agendas10, hasUI: true, sessionId: "xmdtest-s", complete: c, log });
    expect(c.calls.length).toBe(MAP_MAX_ATTEMPTS);
    expect(r.usedFallback).toBe(true);
    expect(r.map.usedFallback).toBe(true);
    expect(r.errors.length).toBe(3);
    expect(validateMilestoneMap(r.map, 10, MAP_AGENT_IDS, { hasUI: true }).ok).toBe(true);
    expect(log.mock.calls.map((x) => x[1]).join("\n")).toMatch(/fallback ya code imetumika \(usedFallback=true\)/);
  });

  it("LLM ikitupa kosa → inahesabiwa kama jaribio; abort inapitishwa juu", async () => {
    const boom = (async () => { throw new Error("no lane"); }) as MapComplete;
    const r = await generateMilestoneMap({ brief: "x", agendas: agendas10, hasUI: false, sessionId: "xmdtest-s", complete: boom, log: quiet });
    expect(r.usedFallback).toBe(true);
    expect(r.errors[0][0]).toContain("llm: no lane");
    const ac = new AbortController(); ac.abort();
    const aborting = (async () => { throw Object.assign(new Error("aborted"), { name: "AbortError" }); }) as MapComplete;
    await expect(generateMilestoneMap({ brief: "x", agendas: agendas10, hasUI: false, sessionId: "xmdtest-s", complete: aborting, signal: ac.signal, log: quiet })).rejects.toThrow("aborted");
  });

  it("test hook (T3): XMD_TEST_HOOKS=1 + XMD_TEST_MAP_INVALID=1 inaharibu jibu sahihi mara 3 → fallback", async () => {
    const env = { XMD_TEST_HOOKS: "1", XMD_TEST_MAP_INVALID: "1" };
    const r = await generateMilestoneMap({ brief: "website", agendas: agendas10, hasUI: true, sessionId: "xmdtest-s", complete: seq(JSON.stringify(good)), env, log: quiet });
    expect([r.usedFallback, r.attempts]).toEqual([true, 3]);
    expect(r.errors[0].join("\n")).toContain('unknown agent "ghost"');
  });

  it("test hook ni inert bila bendera zote mbili", () => {
    expect(maybeBreakMapOutput("abc", {})).toBe("abc");
    expect(maybeBreakMapOutput("abc", { XMD_TEST_MAP_INVALID: "1" })).toBe("abc");
    expect(maybeBreakMapOutput("abc", { XMD_TEST_HOOKS: "1" })).toBe("abc");
    expect(maybeBreakMapOutput("abc", { XMD_TEST_HOOKS: "1", XMD_TEST_MAP_INVALID: "1" })).not.toBe("abc");
  });
});

describe("fallbackMap", () => {
  it("ukubwa ceil(N/4), mpangilio, foundation → quality_deploy, mixed, roster yote — valid kwa N=2..40", () => {
    for (const hasUI of [true, false]) for (let N = 2; N <= 40; N++) {
      const a = Array.from({ length: N }, (_, i) => `a${i + 1}`);
      const m = fallbackMap(a, hasUI, "xmdtest-s");
      const v = validateMilestoneMap(m, N, MAP_AGENT_IDS, { hasUI });
      expect(v.ok, `N=${N} hasUI=${hasUI}: ${v.ok ? "" : v.errors.join("; ")}`).toBe(true);
      expect(m.milestones.every((x) => x.reviewMode === "mixed" && x.roster.length === 5)).toBe(true);
      expect(m.milestones[0].agendas.to).toBe(Math.min(N, Math.ceil(N / 4)));
      if (hasUI) expect(m.milestones[0].phase).toBe("foundation");
    }
  });
  it("N=10 → 3+3+3+1", () => {
    expect(fallbackMap(agendas10, true).milestones.map((m) => `${m.id}:${m.agendas.from}-${m.agendas.to}:${m.phase}`))
      .toEqual(["M1:1-3:foundation", "M2:4-6:core", "M3:7-9:core", "M4:10-10:quality_deploy"]);
  });
});

describe("T2 · validator inakataa ramani 5 mbovu kwa makosa sahihi", () => {
  const ms = () => JSON.parse(JSON.stringify(good.milestones)).map((m: any) => ({ ...m, roster: m.roster.map((r: string) => r.toLowerCase()) }));
  const wrap = (milestones: unknown[]) => ({ version: 1, sessionId: "xmdtest-s", totalAgendas: 10, generatedBy: "optimus@test", usedFallback: false, milestones });
  const cases: [string, (m: any[]) => void, string][] = [
    ["gap", (m) => { m[1].agendas.from = 5; }, "map.milestones[1].agendas.from: gap — agendas 4..4 are not covered (expected from=4, got 5)"],
    ["overlap", (m) => { m[1].agendas.from = 3; }, "map.milestones[1].agendas.from: overlap — agenda 3 already covered by milestones[0] (expected from=4, got 3)"],
    ["bad last phase", (m) => { m[2].phase = "secondary"; }, 'map.milestones[2].phase: last milestone must be "quality_deploy" (got "secondary")'],
    ["unknown agent", (m) => { m[1].roster.push("bumblebee"); }, 'map.milestones[1].roster[3]: unknown agent "bumblebee" (known: optimus, ultron, vextron, megatron, cybertron)'],
    ["missing optimus", (m) => { m[2].roster = ["cybertron"]; }, 'map.milestones[2].roster: must contain "optimus"'],
  ];
  for (const [name, breakIt, err] of cases) it(name, () => {
    const m = ms(); breakIt(m);
    const v = validateMilestoneMap(wrap(m), 10, MAP_AGENT_IDS, { hasUI: true });
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.errors).toContain(err);
  });
  it("udhibiti: ramani sahihi inakubaliwa", () => expect(validateMilestoneMap(wrap(ms()), 10, MAP_AGENT_IDS, { hasUI: true }).ok).toBe(true));
});

describe("helpers", () => {
  it("parseMapText: object, array, code fence, <think>, takataka", () => {
    expect(parseMapText(JSON.stringify(good))?.milestones).toHaveLength(3);
    expect(parseMapText(`<think>{x}</think> ${JSON.stringify(good.milestones)}`)?.milestones).toHaveLength(3);
    expect(parseMapText("hakuna json")).toBeNull();
  });
  it("prompt ina agents halisi na agenda zenye namba", () => {
    const p = mapUserPrompt("brief", agendas10, true);
    expect(p).toContain("- ultron: Ultron, UI/UX Designer");
    expect(p).toContain("- optimus: Optimus, Project Manager (lead; always in the roster)");
    expect(p).toContain("10. xmdtest agenda 10");
    expect(MAP_AGENT_IDS).toEqual(["optimus", "ultron", "vextron", "megatron", "cybertron"]);
  });
  it("detectHasUI: owners au brief", () => {
    expect(detectHasUI("API ya malipo", [{ owners: ["backend", "qa"] }])).toBe(false);
    expect(detectHasUI("API ya malipo", [{ owners: ["designer", "pm"] }])).toBe(true);
    expect(detectHasUI("Tengeneza tovuti ya duka", [])).toBe(true);
    expect(detectHasUI("Repo ndogo. Hakuna UI, hakuna backend.", [{ owners: ["designer", "pm"] }])).toBe(false);
    expect(detectHasUI("A CLI tool with no UI", [])).toBe(false);
  });
});
