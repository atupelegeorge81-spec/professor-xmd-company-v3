// TASK 12 — kind mpya `milestoneMap` (XMD_MILESTONES=1) ni additive: adapter inaipuuza; chip ya milestone store haionyeshwi.
import { describe, expect, it } from "vitest";
import { createBoardAdapter, savedToEvents, type AdapterEvent } from "./adapter";

// event HALISI kutoka run ya T4 (session 3f7be81e, local dev XMD_MILESTONES=1)
const MILESTONE_MAP_EVENT = {"type":"milestoneMap","map":{"version":1,"sessionId":"3f7be81e-89e6-4cc7-8623-895652f1b942","totalAgendas":2,"generatedBy":"optimus@Gemini 4 · gemini-3.8-flash (tier flash)","usedFallback":false,"milestones":[{"id":"M1","title":"Repository Initialization & Core Files","agendas":{"from":1,"to":1},"phase":"foundation","reviewMode":"technical","roster":["optimus","cybertron"],"rationale":"Establish the repository baseline by creating hello.txt and README.md."},{"id":"M2","title":"Validation Script & Verification","agendas":{"from":2,"to":2},"phase":"quality_deploy","reviewMode":"technical","roster":["optimus","cybertron"],"rationale":"Implement and execute check.sh to verify file contents and satisfy project acceptance criteria."}]},"usedFallback":false,"attempts":1} as unknown as AdapterEvent;

const base: AdapterEvent[] = [
  { type: "mode", mode: "code" } as any,
  { type: "title_done", title: "System Test Milestone Map" } as any,
  { type: "system", text: "📋 Agenda (2 vipengele): a · b" } as any,
  { type: "log", entry: { id: "l1", timestamp: "21:00:00", type: "success", message: "🗺️ Milestone map: ok" } } as any,
];
const strip = (v: unknown) => JSON.parse(JSON.stringify(v, (k, x) => (k === "id" || k === "at" || k === "seconds" ? undefined : x)));
const run = (events: AdapterEvent[]) => { const ad = createBoardAdapter({ instant: true, now: () => 0 }); for (const e of events) ad.apply(e); return strip(ad.snapshot()); };

describe("milestoneMap event", () => {
  it("adapter inapuuza kind isiyojulikana — snapshot ni sawa na bila event hiyo", () => {
    expect((MILESTONE_MAP_EVENT as any).type).toBe("milestoneMap");
    const withEv = [...base.slice(0, 3), MILESTONE_MAP_EVENT, ...base.slice(3)];
    expect(run(withEv)).toEqual(run(base));
  });
  it("chip ya __PROFESSOR_XMD_MILESTONE__ kwenye items zilizohifadhiwa haigeuki kuwa event inayoonekana", () => {
    const items: any[] = [
      { kind: "title", id: "t", text: "x" },
      { kind: "chip", id: "c1", text: "📋 Agenda (2 vipengele): a · b" },
      { kind: "chip", id: "__professor_xmd_ms__map", text: "__PROFESSOR_XMD_MILESTONE__:" + JSON.stringify({ key: "map", version: 1, data: (MILESTONE_MAP_EVENT as any).map }) },
    ];
    const evs = savedToEvents(items, "brief");
    expect(JSON.stringify(evs)).not.toContain("__PROFESSOR_XMD_MILESTONE__");
    expect(evs.some((e: any) => e.type === "system" && String(e.text).startsWith("📋 Agenda"))).toBe(true);
  });
});
