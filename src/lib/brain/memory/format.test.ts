import { describe, expect, it } from "vitest";
import { mergeLines, parseLines, MEMORY_MAX_LINES, renderLine } from "./format";
import type { MemLine } from "./format";

const mk = (n: number, imp = 3, date = "2026-10-04", project = "P"): MemLine => ({ date, imp, project, text: `somu la ${n} — fundisho la jumla lisilo na values za mradi` });

describe("memory format · mergeLines (R30.1/E3c)", () => {
  it("kikomo cha mistari 30: mpya/muhimu zinabaki, za ziada zinaondoka kwa mpango", () => {
    const old = Array.from({ length: 40 }, (_, i) => mk(i, 2, "2026-09-01"));
    const add = Array.from({ length: 10 }, (_, i) => mk(100 + i, 5, "2026-10-04"));
    const out = mergeLines(old, add);
    const lines = parseLines(out);
    expect(lines.length).toBeLessThanOrEqual(MEMORY_MAX_LINES);
    expect(lines.length).toBe(MEMORY_MAX_LINES);
    // mpya (imp 5, leo) zote baki; za zamani zimekatwa
    expect(lines.filter((l) => l.date === "2026-10-04").length).toBe(10);
    expect(lines.filter((l) => l.date === "2026-09-01").length).toBe(20);
  });

  it("dedupe bado inafanya kazi (mstari mmoja hautahifadhiwa mara mbili)", () => {
    const a = mk(1);
    const out = mergeLines([a], [{ ...a }]);
    expect(parseLines(out)).toHaveLength(1);
  });

  it("chini ya kikomo — hakuna kilichopotea", () => {
    const out = mergeLines([mk(1), mk(2)], [mk(3)]);
    expect(parseLines(out)).toHaveLength(3);
  });

  it("renderLine inatengeneza muundo rasmi wa mstari", () => {
    expect(renderLine({ date: "2026-10-04", imp: 4, project: "X", text: "funzo" })).toBe("- [2026-10-04][imp:4][X] funzo");
  });
});
