// TASK 21 — unit tests: schema mpya za checks, grep rule, shell quoting, kanuni ya dhahabu, sign-off,
// na runChecks: check batili / exception → ERROR (kamwe PASS). Majaribio halisi: docs/tests/task-21.md.
import { describe, expect, it } from "vitest";
import { applyReviewerVerdict, canSignOff, grepCompare, grepRule, runCheck, runChecks, shq } from "../checks";
import { validateCheck } from "../schemas";
import type { EvidenceCheckResult } from "../types";

const R = (result: EvidenceCheckResult["result"], id = "c1"): EvidenceCheckResult => ({ id, type: "dom_exists", result, detail: "x" });

describe("validateCheck — shapes za maelezo21 (Task 21) + za zamani bado halali", () => {
  const ok = (c: unknown) => validateCheck(c).ok;
  it("grep: count+op na paths[]; expect ya zamani bado inakubalika", () => {
    expect(ok({ id: "a", type: "grep", pattern: "x", paths: ["src"], count: 0, op: "eq" })).toBe(true);
    expect(ok({ id: "a", type: "grep", pattern: "x", path: "a.js", expect: "absent" })).toBe(true);
    expect(ok({ id: "a", type: "grep", pattern: "x", path: "a.js", count: 1, op: "ge" })).toBe(false);
    expect(ok({ id: "a", type: "grep", pattern: "x", path: "a.js" })).toBe(false);
  });
  it("computed_style: expected AU forbidden; http: status alias + bodyContains; touch: px alias", () => {
    expect(ok({ id: "a", type: "computed_style", route: "/", selector: "h1", property: "color", forbidden: "red" })).toBe(true);
    expect(ok({ id: "a", type: "computed_style", route: "/", selector: "h1", property: "color" })).toBe(false);
    expect(ok({ id: "a", type: "http", url: "https://x", status: 200, bodyContains: "ok" })).toBe(true);
    expect(ok({ id: "a", type: "http", url: "https://x", expectStatus: 200 })).toBe(true);
    expect(ok({ id: "a", type: "http", url: "https://x", status: 99 })).toBe(false);
    expect(ok({ id: "a", type: "touch_target_min", route: "/", selector: "a", px: 44 })).toBe(true);
    expect(ok({ id: "a", type: "touch_target_min", route: "/", selector: "a", minPx: 44 })).toBe(true);
  });
  it("overflow/console: route AU routes[] + viewports[]; screenshot_taken state hiari", () => {
    expect(ok({ id: "a", type: "no_horizontal_overflow", routes: ["/", "/a"], viewports: ["375x667"] })).toBe(true);
    expect(ok({ id: "a", type: "console_clean", route: "/" })).toBe(true);
    expect(ok({ id: "a", type: "console_clean" })).toBe(false);
    expect(ok({ id: "a", type: "no_horizontal_overflow", routes: [] })).toBe(false);
    expect(ok({ id: "a", type: "screenshot_taken", route: "/", viewport: "375x667", state: "menu-open" })).toBe(true);
  });
});

describe("grep rule + quoting", () => {
  it("expect → op/count; count+op zinashinda", () => {
    expect(grepRule({ expect: "present" })).toEqual({ op: "gt", count: 0 });
    expect(grepRule({ expect: "absent" })).toEqual({ op: "eq", count: 0 });
    expect(grepRule({ count: 3, op: "lt" })).toEqual({ op: "lt", count: 3 });
    expect([grepCompare(2, "eq", 2), grepCompare(2, "lt", 2), grepCompare(3, "gt", 2)]).toEqual([true, false, true]);
  });
  it("shq inalinda single quotes", () => {
    expect(shq("it's")).toBe(`'it'\\''s'`);
  });
});

describe("kanuni ya dhahabu + sign-off", () => {
  it("reviewer hawezi kugeuza FAIL/ERROR kuwa PASS (anaweza kutoa maoni tu)", () => {
    const f = applyReviewerVerdict(R("FAIL"), { result: "PASS", by: "designer" });
    expect(f.result).toBe("FAIL");
    expect(f.overrideRejected).toBe(true);
    const e = applyReviewerVerdict(R("ERROR"), { result: "pass" });
    expect(e.result).toBe("ERROR");
    expect(e.overrideRejected).toBe(true);
    const p = applyReviewerVerdict(R("PASS"), { result: "FAIL", note: "spacing off" });
    expect(p.result).toBe("PASS"); // matokeo ya check ni ya code; maoni ya reviewer yanakuwa defect (task 23+)
    expect(p.overrideRejected).toBeUndefined();
    expect(applyReviewerVerdict(R("FAIL"), null).result).toBe("FAIL");
  });
  it("sign-off: FAIL au ERROR yoyote inazuia", () => {
    expect(canSignOff([R("PASS"), R("PASS", "c2")]).ok).toBe(true);
    expect(canSignOff([R("PASS"), R("ERROR", "c2")]).blocking.map((b) => b.id)).toEqual(["c2"]);
    expect(canSignOff([R("FAIL")]).ok).toBe(false);
  });
});

describe("runChecks: hali zisizo za kawaida → ERROR (kamwe PASS)", () => {
  const sbxThrows = { files: { write: async () => { throw new Error("sandbox gone"); }, read: async () => "" }, commands: { run: async () => ({ stdout: "" }) } };
  it("check batili ya schema → ERROR yenye sababu", async () => {
    const r = await runCheck({ id: "x", type: "dom_exists", route: "/" }, { sbx: sbxThrows, ws: "/w" });
    expect(r.result).toBe("ERROR");
    expect(r.detail).toContain("invalid check");
    expect((await runCheck({ id: "y", type: "teleport" }, { sbx: sbxThrows, ws: "/w" })).result).toBe("ERROR");
  });
  it("sandbox ikitupa exception → ERROR; browser bila script/startCommand → ERROR", async () => {
    const { results } = await runChecks([
      { id: "a", type: "file_exists", path: "x" },
      { id: "b", type: "dom_exists", route: "/", selector: "h1" },
    ], { sbx: sbxThrows, ws: "/w" });
    expect(results.map((r) => r.result)).toEqual(["ERROR", "ERROR"]);
    expect(results[0].detail).toContain("sandbox gone");
    expect(results[1].detail).toContain("xmd-evidence.mjs");
  });
  it("screenshot_taken bila evidence pack → ERROR", async () => {
    expect((await runCheck({ id: "s", type: "screenshot_taken", route: "/" }, { sbx: sbxThrows, ws: "/w" })).result).toBe("ERROR");
  });
});
