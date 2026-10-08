// src/lib/board/openRecord.test.ts — R37 (D): closeRecord — rekodi ya ukweli ya kufunga (rough/fallback/defer).
import { describe, expect, it } from "vitest";
import { closeRecord, openRecord } from "./openRecord";

describe("closeRecord (R37 — Sehemu D)", () => {
  it("rough: inaonyesha aina, sababu, DISSENT na guards zilizoondoa mapendekezo (na quotes)", () => {
    const out = closeRecord({
      kind: "rough",
      reason: "final vote majority after amendment (rough consensus)",
      proposal: "Live dashboard with bounded connection pooling.",
      proposedBy: "Optimus",
      owners: ["Optimus", "Ultron", "Vextron", "Megatron"],
      agreed: ["Optimus", "Ultron", "Vextron"],
      dissent: [{ name: "Megatron", text: "pooling still unbounded under peak load" }],
      kills: [{ by: "Ultron", guard: "past-authority", hits: ["past project: enterprise"], quote: "TRADE-OFF: CSS subgrid requires modern browser support, acceptable for an enterprise BI tool.", turn: 2 }],
      assumptions: ["Data refresh cadence is weekly, not real-time."],
    });
    expect(out).toContain("LOCKED");
    expect(out).toContain("ROUGH CONSENSUS");
    expect(out).toContain("Megatron: pooling still unbounded");
    expect(out).toContain("past project: enterprise");
    expect(out).toContain("subgrid");
    expect(out).toContain("Data refresh cadence");
    expect(out).not.toContain("OBJECTED_OPEN");
  });

  it("fallback: toleo la chini + sababu + assumptions", () => {
    const out = closeRecord({
      kind: "fallback",
      reason: "final vote: 1/3 in favour — no majority",
      proposal: "Static export page first.",
      proposedBy: "Optimus",
      owners: ["Optimus", "Ultron", "Vextron"],
      agreed: ["Optimus"],
      dissent: [{ name: "Vextron", text: "too heavy" }],
      kills: [],
      assumptions: ["Weekly refresh until a data pipeline exists."],
    });
    expect(out).toContain("FALLBACK");
    expect(out).toContain("Static export page first");
    expect(out).toContain("Weekly refresh");
  });

  it("defer: kilitokosekana kimeandikwa wazi — hakuna swali kwenda kwa Mkuu", () => {
    const out = closeRecord({
      kind: "defer",
      reason: "chair deferred the item",
      proposal: "",
      owners: ["Optimus", "Ultron"],
      agreed: [],
      dissent: [],
      kills: [],
      assumptions: [],
    });
    expect(out).toContain("DEFER YA NDANI");
    expect(out).toContain("kazi inaendelea kwenye computer");
  });
});

describe("openRecord (R21 — njia ya dharura tu, haikufutwa)", () => {
  it("bado inaeleza ukweli wa OPEN (exception path)", () => {
    const out = openRecord({
      reason: "hakuna consensus ya kutosha",
      proposal: "Something was on the table.",
      owners: ["Optimus", "Ultron"],
      agreed: ["Ultron"],
    });
    expect(out).toContain("OPEN — haikufungwa");
    expect(out).toContain("Something was on the table.");
  });
});
