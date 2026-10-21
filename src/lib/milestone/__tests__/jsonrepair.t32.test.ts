import { describe, it, expect } from "vitest";
import { extractJson, repairJson } from "../review";

describe("TASK-32: extractJson inarekebisha makosa madogo ya LLM (E7 M1 R1)", () => {
  it("koma iliyokosekana kati ya properties / vipengele vya array → inapita", () => {
    const bad = `{\n  "changeOrders": [\n    { "id": "CO-1", "note": "a, b \\"q\\"" }\n    { "id": "CO-2", "n": 3 }\n  ],\n  "x": true\n  "y": null\n}`;
    expect(() => JSON.parse(bad)).toThrow();
    expect(extractJson(bad)).toEqual({ changeOrders: [{ id: "CO-1", note: 'a, b "q"' }, { id: "CO-2", n: 3 }], x: true, y: null });
  });
  it("trailing comma → inapita; maandishi ndani ya strings hayaguswi", () => {
    expect(extractJson('```json\n{ "a": ["x\\n  \\"y\\"",], "b": {"c": 1,}, }\n```')).toEqual({ a: ['x\n  "y"'], b: { c: 1 } });
  });
  it("JSON halali haibadilishwi; uchafu usiorekebishika bado unatupa kosa", () => {
    const ok = '{\n "a": 1,\n "b": [1, 2]\n}';
    expect(repairJson(ok)).toBe(ok);
    expect(() => extractJson('{ "a": 1 "b": }')).toThrow();
  });
});
