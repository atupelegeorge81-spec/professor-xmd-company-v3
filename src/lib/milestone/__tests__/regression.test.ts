// TASK 22 (maelezo22) — baselines + regression: majina, threshold ya env, uainishaji (regression / expected_change), schema, makosa.
// Pixel diff halisi (pixelmatch ndani ya sandbox ya E2B) iko kwenye docs/tests/task-22.md.
import { describe, expect, it } from "vitest";
// @ts-expect-error — script ya sandbox (JS tupu, bila types)
import * as script from "../../../../cu/xmd-regression.mjs";
import {
  baselineFileName, baselineKey, changedRoutes, checkRegression, classifyRegression, DEFAULT_REGRESSION_THRESHOLD_PCT,
  normRoute, regressionThresholdPct, saveBaselines, type RegressionDiffRow,
} from "../regression";
import { validateEvidencePack } from "../schemas";
import type { EvidencePack } from "../types";

const row = (route: string, viewport: string, changedPct: number, extra: Partial<RegressionDiffRow> = {}): RegressionDiffRow => ({
  key: baselineKey(route, viewport), route, viewport, state: "default", baselineMilestone: "M1", baselinePath: "b.png", baselineUrl: "https://s/b.png",
  currentId: "S-001", currentPath: "c.png", currentUrl: "https://s/c.png", changedPct, changedPixels: 1, totalPixels: 100, diffPath: "d.diff.png", ...extra,
});
const pack = (): EvidencePack => ({
  milestoneId: "M2", round: 1, screenshots: [{ id: "S-001", route: "/", viewport: "375x667", state: "default", path: ".xmd/evidence/M2/R1/S-001.png", url: "https://s/1.png" }],
  domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [], consoleErrors: [], errors: [],
});

describe("TASK 22 — majina ya baselines", () => {
  it("<route>-<viewport>-<state>.png; / → root; trailing slash/query hazijalishi", () => {
    expect(baselineFileName("/", "375x667", "default")).toBe("root-375x667-default.png");
    expect(baselineFileName("/pricing/", "1280x800", "menu-open")).toBe("pricing-1280x800-menu_open.png");
    expect(baselineFileName("/docs/a.html?x=1", "768x1024")).toBe("docs_a.html-768x1024-default.png");
    expect(normRoute("/pricing/")).toBe("/pricing");
    expect(normRoute("about#x")).toBe("/about");
    expect(baselineKey("/pricing/", "375x667", "")).toBe("/pricing|375x667|default");
  });
  it("script ya sandbox inatumia majina yale yale (harness ↔ sandbox)", () => {
    for (const [r, v, s] of [["/", "375x667", "default"], ["/pricing/", "1280x800", "menu-open"], ["/a/b.html?q", "768x1024", undefined]] as const) {
      expect(script.baselineFileName(r, v, s)).toBe(baselineFileName(r, v, s));
      expect(script.baselineKey(r, v, s)).toBe(baselineKey(r, v, s));
    }
  });
});

describe("TASK 22 — REGRESSION_THRESHOLD_PCT", () => {
  it("default 2; env inabadilisha; thamani mbaya → 2", () => {
    expect(regressionThresholdPct({})).toBe(DEFAULT_REGRESSION_THRESHOLD_PCT);
    expect(regressionThresholdPct({ REGRESSION_THRESHOLD_PCT: "5" })).toBe(5);
    expect(regressionThresholdPct({ REGRESSION_THRESHOLD_PCT: "0.5" })).toBe(0.5);
    for (const bad of ["abc", "-1", "101", ""]) expect(regressionThresholdPct({ REGRESSION_THRESHOLD_PCT: bad })).toBe(2);
  });
});

describe("TASK 22 — classifyRegression", () => {
  const rows = [row("/", "375x667", 12.9), row("/", "1280x800", 1.5), row("/pricing", "375x667", 19), row("/about", "375x667", 0), row("/x", "375x667", 100, { diffPath: "", note: "dimensions differ" })];
  const cos = [{ id: "CO-001", location: { route: "/pricing/" } }, { id: "CO-002", location: { files: ["a.ts"] } }];
  it("> threshold tu; route ya Change Order → expected_change (si regression)", () => {
    const e = classifyRegression(rows, { thresholdPct: 2, changeOrders: cos });
    expect(e.map((x) => `${x.kind}:${x.route}@${x.viewport}`)).toEqual(["regression:/x@375x667", "regression:/@375x667", "expected_change:/pricing@375x667"]);
    expect(e.find((x) => x.route === "/pricing")?.changeOrderIds).toEqual(["CO-001"]);
    expect(e.find((x) => x.route === "/x")?.note).toMatch(/dimensions/);
    expect(e.every((x) => x.thresholdPct === 2)).toBe(true);
  });
  it("sawa na threshold hakuorodheshwi (lazima ZAIDI); threshold kubwa → orodha tupu", () => {
    expect(classifyRegression([row("/", "375x667", 2)], { thresholdPct: 2 })).toEqual([]);
    expect(classifyRegression(rows, { thresholdPct: 100 })).toEqual([]);
  });
  it("changedRoutes: COs bila route zinarukwa; routes zinasawazishwa", () => {
    expect([...changedRoutes(cos)]).toEqual([["/pricing", ["CO-001"]]]);
  });
});

describe("TASK 22 — EvidencePack.regression schema", () => {
  it("RegressionEntry sahihi inakubaliwa; kind/route/changedPct mbaya → makosa", () => {
    const p = pack();
    p.regression = classifyRegression([row("/", "375x667", 12.9)], { thresholdPct: 2 }).map((e) => ({ ...e, diffUrl: "https://s/d.png" }));
    expect(validateEvidencePack(p, { requireUrls: true }).ok).toBe(true);
    const bad: any = pack();
    bad.regression = [{ kind: "maybe", route: "x", viewport: "big", state: "default", changedPct: 140, thresholdPct: 2, baselineMilestone: "M1", baselineUrl: "", currentUrl: "", diffUrl: "data:image/png;base64,AA", diffPath: "" }, "old string"];
    const v = validateEvidencePack(bad);
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const all = v.errors.join("\n");
      for (const k of ["kind", "route", "viewport", "changedPct", "diffUrl", "regression[1]"]) expect(all).toContain(k);
    }
  });
});

describe("TASK 22 — makosa hayaangushi raundi", () => {
  const deadSbx = { files: { write: async () => undefined, read: async () => { throw new Error("nope"); } }, commands: { run: async () => ({ stdout: "__XMD_RC=2\nboom" }) } };
  it("checkRegression: script imeshindwa → pack.errors (harness), regression tupu", async () => {
    const p = pack();
    const r = await checkRegression(deadSbx, { milestoneId: "M2", round: 1, pack: p, script: "//", thresholdPct: 2 }, async () => "https://s/x");
    expect(r.entries).toEqual([]);
    expect(r.errors[0]).toMatch(/regression\.json was not written \(exit 2\)/);
    expect(p.errors.some((e) => e.kind === "harness" && e.detail.startsWith("regression:"))).toBe(true);
  });
  it("saveBaselines: hakuna screenshots → kosa wazi, hakuna upload", async () => {
    let calls = 0;
    const r = await saveBaselines(deadSbx, { milestoneId: "M1", round: 0, pack: { screenshots: [] }, script: "//" }, async () => { calls++; return ""; });
    expect(r.manifest).toBeNull();
    expect(r.errors[0]).toMatch(/no approved screenshots/);
    expect(calls).toBe(0);
  });
});
