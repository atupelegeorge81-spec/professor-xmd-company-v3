// TASK 13 — roster ya milestone: walio nje hawashiriki; flag OFF → wote.
import { describe, expect, it } from "vitest";
import { activeAgentsFor, milestoneOf, participantNames, rosterOwners } from "../roster";
import { forcedMapFromEnv } from "../map";
import type { MilestoneMap } from "../types";

const map: MilestoneMap = { version: 1, sessionId: "xmdtest-s", totalAgendas: 3, generatedBy: "t", usedFallback: false, milestones: [
  { id: "M1", title: "a", agendas: { from: 1, to: 2 }, phase: "foundation", reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "r" },
  { id: "M2", title: "b", agendas: { from: 3, to: 3 }, phase: "quality_deploy", reviewMode: "technical", roster: ["ultron", "megatron", "cybertron"], rationale: "r" },
] };
const ALL = ["pm", "designer", "frontend", "backend", "qa"];

describe("activeAgentsFor", () => {
  it("flag OFF au hakuna ramani → wote", () => {
    expect(activeAgentsFor({ msMap: map }, 1, false)).toEqual(ALL);
    expect(activeAgentsFor({ msMap: null }, 1, true)).toEqual(ALL);
    expect(activeAgentsFor({ msMap: map }, 9, true)).toEqual(ALL); // agenda nje ya ramani
  });
  it("flag ON → roster ya milestone (mpangilio wa AGENTS); Optimus anaongezwa daima", () => {
    expect(activeAgentsFor({ msMap: map }, 2, true)).toEqual(["pm", "designer", "frontend"]);
    expect(activeAgentsFor({ msMap: map }, 3, true)).toEqual(["pm", "designer", "backend", "qa"]);
    expect(milestoneOf(map, 3)?.id).toBe("M2");
    expect(participantNames(["pm", "designer", "frontend"])).toBe("Optimus, Ultron, Vextron");
  });
});

describe("rosterOwners", () => {
  it("roster kamili → owners bila kubadilika (sawa na zamani)", () => expect(rosterOwners(["backend", "qa"], ALL)).toEqual(["backend", "qa"]));
  it("owners nje ya roster wanaondolewa", () => expect(rosterOwners(["frontend", "backend", "qa"], ["pm", "designer", "frontend"])).toEqual(["frontend"]));
  it("owners wote nje → agents wa roster (si Optimus, ≤2); roster ya Optimus tu → Optimus", () => {
    expect(rosterOwners(["backend", "qa"], ["pm", "designer", "frontend"])).toEqual(["designer", "frontend"]);
    expect(rosterOwners(["backend"], ["pm"])).toEqual(["pm"]);
  });
});

describe("forcedMapFromEnv (test hook)", () => {
  const env = { XMD_TEST_HOOKS: "1", XMD_TEST_MAP_FORCE: JSON.stringify([{ to: 2, roster: ["optimus", "ultron", "vextron"] }, { to: "N", roster: ["optimus", "megatron"] }]) };
  it("inert bila XMD_TEST_HOOKS=1", () => expect(forcedMapFromEnv({ XMD_TEST_MAP_FORCE: env.XMD_TEST_MAP_FORCE }, 3, false, "s")).toBeNull());
  it("N=3 → M1 1–2, M2 3–3 (quality_deploy)", () => {
    const m = forcedMapFromEnv(env, 3, false, "s")!;
    expect(m.milestones.map((x) => `${x.id}:${x.agendas.from}-${x.agendas.to}:${x.phase}`)).toEqual(["M1:1-2:core", "M2:3-3:quality_deploy"]);
  });
  it("N=2 → milestone moja tu (M2 ingeanza baada ya N)", () => {
    const m = forcedMapFromEnv(env, 2, false, "s")!;
    expect(m.milestones.map((x) => `${x.id}:${x.agendas.from}-${x.agendas.to}:${x.phase}`)).toEqual(["M1:1-2:quality_deploy"]);
  });
  it("N=5 → agenda zilizobaki zinaingia milestone ya mwisho", () => {
    expect(forcedMapFromEnv(env, 5, true, "s")!.milestones.map((x) => `${x.agendas.from}-${x.agendas.to}:${x.phase}`)).toEqual(["1-2:foundation", "3-5:quality_deploy"]);
  });
});
