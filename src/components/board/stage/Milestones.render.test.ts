// TASK-34: render ya server (renderToStaticMarkup) ya components mpya za milestone — bila kuwasha app (sheria S1).
import { describe, expect, it, vi } from "vitest";
import { createElement as h } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("../../shell/AppState", () => ({ useApp: () => ({ reports: [] }) }));
vi.mock("next/link", () => ({ default: ({ href, children, ...p }: any) => h("a", { href, ...p }, children) }));

import { MsCosCard, MsMapCard, MsMark, MsReportCard, msStatus } from "./Milestones";
import { StageRail } from "./StageRail";
import { PlanWriter } from "./Plan";

const rows = [
  { id: "M1", title: "App shell", from: 1, to: 2, roster: ["vextron", "ultron"] as any, reviewMode: "visual", status: "SIGNED_OFF", round: 2 },
  { id: "M2", title: "Checkout", from: 3, to: 3, roster: ["megatron"] as any, reviewMode: "functional", status: "FIXING", round: 1 },
  { id: "M3", title: "Deploy", from: 4, to: 4, roster: [] as any, reviewMode: "light", status: "DISCUSSING", round: 0 },
];

describe("TASK-34 · render ya components za milestone", () => {
  it("MsMark: enter (ya pekee, id ya anchor) · computer · review · talk", () => {
    const enter = renderToStaticMarkup(h(MsMark, { it: { kind: "msMark", id: "1", mark: "enter", ms: "M2", title: "Checkout", from: 3, to: 3, index: 2, total: 3, agents: ["megatron"] } as any }));
    expect(enter).toContain('id="ms-M2"');
    expect(enter).toContain("M2 · MILESTONE 2/3");
    expect(enter).toContain("Checkout");
    expect(enter).toContain("#fdba74");
    const cu0 = renderToStaticMarkup(h(MsMark, { it: { kind: "msMark", id: "2", mark: "computer", ms: "M1", round: 0 } as any }));
    expect(cu0).toContain("M1 · BUILD");
    const cu2 = renderToStaticMarkup(h(MsMark, { it: { kind: "msMark", id: "3", mark: "computer", ms: "M1", round: 2 } as any }));
    expect(cu2).toContain("marekebisho raundi 2");
    const rv = renderToStaticMarkup(h(MsMark, { it: { kind: "msMark", id: "4", mark: "review", ms: "M1", round: 0, agents: ["ultron", "vextron"] } as any }));
    expect(rv).toContain("ukaguzi huru R0");
    const tk = renderToStaticMarkup(h(MsMark, { it: { kind: "msMark", id: "5", mark: "talk", ms: "M1", round: 0, reviewId: "R-M1-0", title: "Header", agents: ["optimus", "ultron", "vextron"] } as any }));
    expect(tk).toContain("R-M1-0");
    expect(tk).toContain("Mjadala wa watatu");
  });

  it("MsMapCard: orodha + hali live + maendeleo (zimefungwa 1/3); inayoendelea imeangaziwa", () => {
    const html = renderToStaticMarkup(h(MsMapCard, { it: { kind: "msMap", id: "m", milestones: rows, active: "M2" } as any }));
    expect(html).toContain("Milestones · 3");
    expect(html).toContain("1/3 zimefungwa");
    expect(html).toContain("imesainiwa");
    expect(html).toContain("marekebisho R1");
    expect(html).toContain("inasubiri");
    expect(html).toContain("A1–A2");
    expect(msStatus({ status: "DISCUSSING", round: 0 }, true).label).toBe("ajenda zinajadiliwa");
    expect(msStatus({ status: "CAP_REACHED", round: 10 }).done).toBe(true);
  });

  it("MsCosCard: maneno ya Optimus (lengo, sasa, mahali, acceptance) ndani ya card", () => {
    const html = renderToStaticMarkup(h(MsCosCard, { it: { kind: "msCos", id: "c", ms: "M1", round: 1, cos: [{ id: "CO-001", defectIds: ["D-001"], priority: 1, attempt: 2, mode: "concrete", files: ["src/app/page.tsx"], route: "/", current: "hakuna logo", desired: "logo juu kushoto", acceptance: ["logo inaonekana"] }] } as any }));
    for (const t of ["Marekebisho ya Optimus · M1 R1", "CO-001", "P1", "jaribio 2", "logo juu kushoto", "hakuna logo", "src/app/page.tsx", "logo inaonekana"]) expect(html).toContain(t);
  });

  it("MsReportCard: live → LIVE; mwisho → hali + link ya Reports (si kupakua)", () => {
    const live = renderToStaticMarkup(h(MsReportCard, { it: { kind: "msReport", id: "r", title: "Ripoti ya mwisho kwa CEO", doc: "", shown: 0, startedAt: 0, live: true, saved: "wait" } as any }));
    expect(live).toContain("LIVE");
    const done = renderToStaticMarkup(h(MsReportCard, { it: { kind: "msReport", id: "r", title: "Ripoti ya mwisho kwa CEO", doc: "# Ripoti\n\nM1 imesainiwa", shown: 22, startedAt: 0, live: false, line: "M1 ✅", complete: true, saved: "saved", reportId: "abc" } as any }));
    expect(done).toContain("milestones zote zimesainiwa");
    expect(done).toContain("/reports?open=abc");
    expect(done).not.toMatch(/Pakua|download/i);
  });

  it("StageRail: badge za M1/M2/M3 kabla ya ajenda zao; inayoendelea imeangaziwa", () => {
    const agenda = [1, 2, 3, 4].map((i) => ({ index: i, title: `A${i}`, owners: [], requiresCode: false }));
    const stage: any = { scope: "agenda", phase: "discussion", ledger: {}, agenda: agenda[2], milestones: rows, msActive: "M2" };
    const html = renderToStaticMarkup(h(StageRail, { stage, agenda, live: true }));
    const order = [...html.matchAll(/data-ms="(M\d)"|>A(\d)</g)].map((m) => m[1] || `A${m[2]}`);
    expect(order).toEqual(["M1", "A1", "A2", "M2", "A3", "M3", "A4"]);
    expect(html).toMatch(/data-ms="M2" data-active="true"/);
    expect(html).toContain('href="#ms-M1"');
  });

  it("PlanWriter: HAKUNA card ya 'Pakua'; milestone inaonekana kwenye kichwa", () => {
    const base: any = { kind: "plan", id: "p", title: "M1 · App shell", doc: "# Plan", shown: 6, part: 2, steps: [], sections: [{ n: 1, title: "Goal", state: "done", chars: 6 }], planId: "pl", startedAt: 0, saved: "saved", live: false, settled: true, milestone: "M1" };
    const html = renderToStaticMarkup(h(PlanWriter, { it: base, sessionId: "abc123" }));
    expect(html).toContain("Mpango Kazi · M1 umekamilika");
    expect(html).not.toMatch(/Pakua|download=1|\/api\/plans/);
    const legacy = renderToStaticMarkup(h(PlanWriter, { it: { ...base, milestone: undefined, title: "Plan" }, sessionId: "abc123" }));
    expect(legacy).toContain("Mpango Kazi umekamilika");
    expect(legacy).not.toMatch(/Pakua|download=1/);
  });
});
