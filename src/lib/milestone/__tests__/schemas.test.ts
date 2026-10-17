// TASK 9 — validators za milestone (pure). Kila kesi batili inathibitisha UJUMBE maalum (path + sababu).
import { describe, expect, it } from "vitest";
import {
  validateChangeOrder,
  validateCheck,
  validateDefect,
  validateMilestoneMap,
  validateMilestoneState,
  validateReceipt,
} from "../schemas";
import type { Milestone, MilestoneMap } from "../types";

const AGENTS = ["optimus", "ultron", "vextron", "megatron", "cybertron"];

function ms(id: string, from: number, to: number, phase: Milestone["phase"], over: Partial<Milestone> = {}): Milestone {
  return { id, title: `xmdtest ${id}`, agendas: { from, to }, phase, reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "xmdtest rationale", ...over };
}
function map(total: number, milestones: Milestone[]): MilestoneMap {
  return { version: 1, sessionId: "xmdtest-s1", totalAgendas: total, generatedBy: "optimus@gemini-flash", usedFallback: false, milestones };
}
const errsOf = (r: { ok: boolean; errors?: string[] }) => (r.ok ? [] : (r as { errors: string[] }).errors);

describe("validateMilestoneMap — ramani halali", () => {
  it.each([
    [10, [ms("M1", 1, 3, "foundation"), ms("M2", 4, 7, "core"), ms("M3", 8, 10, "quality_deploy")]],
    [15, [ms("M1", 1, 4, "foundation"), ms("M2", 5, 9, "core"), ms("M3", 10, 12, "secondary", { reviewMode: "mixed" }), ms("M4", 13, 15, "quality_deploy", { reviewMode: "technical", roster: ["optimus", "cybertron", "megatron"] })]],
    [20, [ms("M1", 1, 5, "foundation"), ms("M2", 6, 10, "core"), ms("M3", 11, 14, "core"), ms("M4", 15, 17, "secondary"), ms("M5", 18, 20, "quality_deploy")]],
    [3, [ms("M1", 1, 3, "quality_deploy", { roster: ["optimus"] })]],
  ] as const)("N=%i inapita", (n, list) => {
    const r = validateMilestoneMap(map(n, [...list]), n, AGENTS, { hasUI: n !== 3 });
    expect(errsOf(r)).toEqual([]);
    expect(r.ok).toBe(true);
  });
});

describe("validateMilestoneMap — ramani batili (ujumbe maalum)", () => {
  const good = () => [ms("M1", 1, 3, "foundation"), ms("M2", 4, 7, "core"), ms("M3", 8, 10, "quality_deploy")];
  const bad = (list: Milestone[], opts = {}) => errsOf(validateMilestoneMap(map(10, list), 10, AGENTS, opts));

  it("(1) pengo kati ya ranges", () => {
    const l = good(); l[1] = ms("M2", 5, 7, "core");
    expect(bad(l)).toContain("map.milestones[1].agendas.from: gap — agendas 4..4 are not covered (expected from=4, got 5)");
  });
  it("(2) overlap", () => {
    const l = good(); l[1] = ms("M2", 3, 7, "core");
    expect(bad(l)).toContain("map.milestones[1].agendas.from: overlap — agenda 3 already covered by milestones[0] (expected from=4, got 3)");
  });
  it("(3) haianzi agenda 1", () => {
    const l = good(); l[0] = ms("M1", 2, 3, "foundation");
    const e = bad(l);
    expect(e).toContain("map.milestones[0].agendas.from: must start at agenda 1 (got 2)");
    expect(e.filter((x) => x.includes("gap"))).toEqual([]);
  });
  it("(4) ya mwisho si quality_deploy", () => {
    const l = good(); l[2] = ms("M3", 8, 10, "secondary");
    expect(bad(l)).toContain('map.milestones[2].phase: last milestone must be "quality_deploy" (got "secondary")');
  });
  it("(5) agent asiyejulikana kwenye roster", () => {
    const l = good(); l[1] = ms("M2", 4, 7, "core", { roster: ["optimus", "xmdtest-ghost"] });
    expect(bad(l)).toContain('map.milestones[1].roster[1]: unknown agent "xmdtest-ghost" (known: optimus, ultron, vextron, megatron, cybertron)');
  });
  it("(6) roster bila optimus", () => {
    const l = good(); l[0] = ms("M1", 1, 3, "foundation", { roster: ["ultron", "vextron"] });
    expect(bad(l)).toContain('map.milestones[0].roster: must contain "optimus"');
  });
  it("(7) reviewMode batili", () => {
    const l = good(); l[1] = ms("M2", 4, 7, "core", { reviewMode: "pretty" as never });
    expect(bad(l)).toContain('map.milestones[1].reviewMode: must be one of visual|technical|mixed (got "pretty")');
  });
  it("(8) ids si sequential", () => {
    const l = good(); l[2] = ms("M4", 8, 10, "quality_deploy");
    expect(bad(l)).toContain('map.milestones[2].id: must be "M3" (ids sequential M1..M3) (got "M4")');
  });
  it("(9) milestones tupu", () => {
    expect(bad([])).toEqual(["map.milestones: must be non-empty"]);
  });
  it("ziada: ya kwanza si foundation wakati hasUI", () => {
    const l = good(); l[0] = ms("M1", 1, 3, "core");
    expect(bad(l, { hasUI: true })).toContain('map.milestones[0].phase: first milestone must be "foundation" when hasUI is true (got "core")');
    expect(bad(l, { hasUI: false })).toEqual([]);
  });
  it("ziada: haifiki totalAgendas · from > to · rationale tupu", () => {
    const l = good(); l[2] = ms("M3", 8, 9, "quality_deploy", { rationale: " " });
    const e = bad(l);
    expect(e).toContain("map.milestones[2].agendas.to: last milestone must end at agenda 10 (got 9)");
    expect(e).toContain("map.milestones[2].rationale: must be a non-empty string");
    const l2 = good(); l2[1] = ms("M2", 7, 4, "core");
    expect(bad(l2)).toContain("map.milestones[1].agendas: from (7) must be <= to (4)");
  });
});

const CHECK = { id: "c1", type: "dom_exists", route: "/login", selector: "form#login" } as const;
function co(over: Record<string, unknown> = {}) {
  return { id: "CO-012", defectIds: ["D-004"], attempt: 1, priority: 1, location: { files: ["src/app/page.tsx"], route: "/", selector: ".hero" }, current: "hero haina CTA", desired: "hero ina CTA moja", visionNote: "CTA kubwa yenye rangi ya brand", acceptance: [CHECK], mode: "standard", ...over };
}

describe("validateChangeOrder", () => {
  it("CO halali inapita (pamoja na location yenye route tu)", () => {
    expect(validateChangeOrder(co(), "visual").ok).toBe(true);
    expect(errsOf(validateChangeOrder(co({ location: { route: "/x" } }), "visual"))).toEqual([]);
  });
  it("bila acceptance → fail", () => {
    expect(errsOf(validateChangeOrder(co({ acceptance: undefined }), "visual"))).toContain("changeOrder.acceptance: must be a non-empty array of Checks");
    expect(errsOf(validateChangeOrder(co({ acceptance: [] }), "visual"))).toContain("changeOrder.acceptance: must be a non-empty array of Checks");
  });
  it("acceptance ya maandishi huru → fail", () => {
    expect(errsOf(validateChangeOrder(co({ acceptance: ["button iwe kubwa zaidi"] }), "visual"))).toContain('changeOrder.acceptance[0]: must be a Check object (got "button iwe kubwa zaidi") — free-text acceptance is not allowed');
  });
  it("Check batili ndani ya acceptance → fail na path", () => {
    expect(errsOf(validateChangeOrder(co({ acceptance: [{ id: "c2", type: "contrast_min", route: "/", selector: "p" }] }), "visual"))).toContain("changeOrder.acceptance[0].min: must be a number > 0 (got undefined)");
  });
  it("visionNote tupu: inaruhusiwa technical tu", () => {
    expect(errsOf(validateChangeOrder(co({ visionNote: "" }), "visual"))).toContain('changeOrder.visionNote: may be empty only when reviewMode is "technical" (reviewMode=visual)');
    expect(validateChangeOrder(co({ visionNote: "" }), "technical").ok).toBe(true);
  });
  it("location bila files wala route · defectIds tupu", () => {
    const e = errsOf(validateChangeOrder(co({ location: { files: [], selector: ".x" }, defectIds: [] }), "visual"));
    expect(e).toContain("changeOrder.location: needs non-empty files[] or route");
    expect(e).toContain("changeOrder.defectIds: must be a non-empty array");
  });
});

describe("validateReceipt", () => {
  const rc = (over: Record<string, unknown> = {}) => ({ orderId: "CO-012", status: "DONE", filesChanged: [{ path: "src/app/page.tsx", summary: "CTA imeongezwa" }], commandsRun: ["npm run build"], ...over });
  it("halali inapita", () => expect(validateReceipt(rc()).ok).toBe(true));
  it("DONE bila files → fail", () => {
    expect(errsOf(validateReceipt(rc({ filesChanged: [] })))).toContain('receipt.filesChanged: must be non-empty when status is "DONE" (empty allowed only for BLOCKED|CANNOT)');
    expect(errsOf(validateReceipt(rc({ filesChanged: undefined })))).toContain("receipt.filesChanged: must be an array (got undefined)");
  });
  it("BLOCKED bila sababu → fail; na sababu → pass (bila files)", () => {
    expect(errsOf(validateReceipt(rc({ status: "BLOCKED", filesChanged: [] })))).toContain("receipt.blockedReason: required (non-empty) when status is BLOCKED");
    expect(validateReceipt(rc({ status: "CANNOT", filesChanged: undefined, blockedReason: "API haipo kwenye brief" })).ok).toBe(true);
  });
  it("status batili", () => expect(errsOf(validateReceipt(rc({ status: "OK" })))).toContain('receipt.status: must be one of DONE|PARTIAL|BLOCKED|CANNOT (got "OK")'));
});

describe("validateCheck · validateDefect · validateMilestoneState", () => {
  it("Checks: kila aina halali inapita; aina isiyojulikana inashindwa", () => {
    const all = [
      { id: "a", type: "command", cmd: "npm test" },
      { id: "b", type: "grep", pattern: "TODO", path: "src", expect: "absent" },
      CHECK,
      { id: "d", type: "computed_style", route: "/", selector: "h1", property: "font-size", expected: "32px" },
      { id: "e", type: "no_horizontal_overflow", route: "/", viewport: "mobile" },
      { id: "f", type: "console_clean", route: "/" },
      { id: "g", type: "contrast_min", route: "/", selector: "p", min: 4.5 },
      { id: "h", type: "touch_target_min", route: "/", selector: "button", minPx: 44 },
      { id: "i", type: "http", url: "/api/live", expectStatus: 200 },
      { id: "j", type: "file_exists", path: "README.md" },
      { id: "k", type: "file_contains", path: "README.md", text: "xmdtest" },
      { id: "l", type: "screenshot_taken", route: "/" },
    ];
    for (const c of all) expect(errsOf(validateCheck(c))).toEqual([]);
    expect(errsOf(validateCheck({ id: "z", type: "vibes" }))[0]).toMatch(/^check\.type: must be one of command\|grep/);
    expect(errsOf(validateCheck({ id: "y", type: "http", url: "/", expectStatus: 42 }))).toContain("check.expectStatus: must be an HTTP status 100-599 (got 42)");
  });
  it("Defect halali/batili", () => {
    const d = { id: "D-004", milestoneId: "M1", foundInRound: 0, reportedBy: ["ultron"], area: "hero", severity: "major", title: "CTA haipo", evidence: ["shot-1"], expected: "CTA", actual: "hakuna", status: "OPEN", attempts: 0, history: [] };
    expect(validateDefect(d).ok).toBe(true);
    const e = errsOf(validateDefect({ ...d, id: "4", severity: "huge", reportedBy: [] }));
    expect(e).toContain('defect.id: must look like "D-004" (got "4")');
    expect(e).toContain('defect.severity: must be one of blocker|major|medium|minor (got "huge")');
    expect(e).toContain("defect.reportedBy: must be a non-empty array");
  });
  it("MilestoneState halali/batili", () => {
    const s = { id: "M1", status: "VERIFYING", round: 3, maxRounds: 10, currentStepId: "M1.R3.verify", startedAt: "2026-10-17T10:00:00Z", updatedAt: "2026-10-17T10:05:00Z", lanesUsed: [] };
    expect(validateMilestoneState(s).ok).toBe(true);
    expect(validateMilestoneState({ ...s, currentStepId: "" }).ok).toBe(true);
    const e = errsOf(validateMilestoneState({ ...s, round: 11, status: "DONE", currentStepId: "M2.R1.fix" }));
    expect(e).toContain("state.round: must be <= maxRounds (10) (got 11)");
    expect(e).toContain('state.status: must be one of DISCUSSING|PLANNING|BUILDING|EVIDENCE|REVIEW_R0|FIXING|VERIFYING|SIGNED_OFF|SIGNED_OFF_WITH_WAIVERS|CAP_REACHED|BLOCKED|PAUSED_QUOTA|PAUSED_INFRA (got "DONE")');
    expect(e).toContain('state.currentStepId: must belong to M1 (got "M2.R1.fix")');
  });
});
