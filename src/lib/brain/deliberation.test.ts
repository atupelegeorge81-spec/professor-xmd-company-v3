// src/lib/brain/deliberation.test.ts — R37 (B2): mashine ya Itifaki ya Kufunga.
// Hakuna hali ya OPEN tena: consensus → kura binding (amend mara moja) → rough/fallback → defer ya ndani.
import { describe, expect, it } from "vitest";
import { createDeliberation, isEchoAnswer, MAX_OWNER_TURNS, RESEARCH_CAP } from "./deliberation";

const OWNERS = [
  { id: "pm", name: "Optimus" },
  { id: "designer", name: "Ultron" },
  { id: "frontend", name: "Vextron" },
  { id: "backend", name: "Megatron" },
];

function d() {
  return createDeliberation({ owners: OWNERS, chairId: "pm" });
}

describe("R37 (C) — research cap", () => {
  it("default ni 12 kwa owner kwa agenda (zamani 6)", () => {
    expect(RESEARCH_CAP).toBe(12);
    expect(d().researchCap).toBe(12);
  });
});

describe("R37 — mnyororo wa kufunga (4 owners: chair + 3 voters)", () => {
  it("stall 3 → chair → pendekezo → kura unanimous → closed 'final vote unanimous'", () => {
    const x = d();
    // zamu 3 bila maendeleo (neno moja lilorudiwa)
    for (let i = 0; i < 4; i++) x.observe("designer", "blocked waiting for data blocked", {});
    expect(x.mode).toBe("chair");
    expect(x.forcedSpeaker()).toBe("pm");
    // mwenyekiti anapendekeza
    x.observe("pm", "PROPOSED DECISION: static first\nRATIONALE: safest\nTRADE-OFF: less interactive\nEVIDENCE: discussed", { proposal: "static first" });
    expect(x.mode).toBe("vote");
    // kura: wote AGREE
    x.observe("designer", "AGREE: solid", {});
    x.observe("frontend", "AGREE: fine", {});
    x.observe("backend", "AGREE: ok", {});
    expect(x.closed()).toBe(true);
    expect(x.closedReason).toBe("final vote unanimous");
    expect(x.finalVotes().unanimous).toBe(true);
  });

  it("kura: wingi + kosa la wachache → AMEND (mara moja) → kura ya pili wingi → rough consensus", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `stall turn no new info`, {});
    expect(x.mode).toBe("chair");
    x.observe("pm", "PROPOSED DECISION: live dashboard\nRATIONALE: r\nTRADE-OFF: t\nEVIDENCE: e", { proposal: "live dashboard" });
    expect(x.mode).toBe("vote");
    // kura ya 1: mbili AGREE, moja DISAGREE (kosa konkreti) → wingi → amend
    x.observe("designer", "AGREE: works", {});
    x.observe("frontend", "AGREE: ok", {});
    x.observe("backend", "DISAGREE: no connection pooling — will not survive load", {});
    expect(x.mode).toBe("amend");
    expect(x.forcedSpeaker()).toBe("pm");
    // mwenyekiti anarekebisha (UPDATED DECISION → observe na opts.proposal)
    x.observe("pm", "UPDATED DECISION: live dashboard with pooling\nRATIONALE: r2\nTRADE-OFF: t2\nEVIDENCE: e2", { proposal: "live dashboard with pooling" });
    expect(x.mode).toBe("vote");
    // kura ya 2: wingi (2/3) bado backend anakataa → rough consensus
    x.observe("designer", "AGREE: better", {});
    x.observe("frontend", "AGREE: good", {});
    x.observe("backend", "DISAGREE: pooling still unbounded", {});
    expect(x.closed()).toBe(true);
    expect(x.closedReason).toContain("rough consensus");
    const fv = x.finalVotes();
    expect(fv.majority).toBe(true);
    expect(fv.votes.filter((v) => v.vote === "disagree").map((v) => v.name)).toEqual(["Megatron"]);
  });

  it("kura: hakuna wingi → FALLBACK → pendekezo la mwenyekiti → closed 'fallback decision locked'", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `no progress at all`, {});
    x.observe("pm", "PROPOSED DECISION: complex live system", { proposal: "complex live system" });
    expect(x.mode).toBe("vote");
    x.observe("designer", "AGREE: ok", {});
    x.observe("frontend", "DISAGREE: too heavy", {});
    x.observe("backend", "DISAGREE: no data layer", {});
    expect(x.mode).toBe("fallback");
    expect(x.forcedSpeaker()).toBe("pm");
    expect(x.fallbackTaken).toBe(false);
    // fallback: toleo la chini
    x.observe("pm", "PROPOSED DECISION: static export page first\nASSUMPTION: data refresh weekly", { proposal: "static export page first" });
    expect(x.closed()).toBe(true);
    expect(x.fallbackTaken).toBe(true);
    expect(x.closedReason).toContain("fallback decision locked");
  });

  it("fallback imeshindwa mara mbili → closed 'chair could not produce a fallback' (defer ya ndani)", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `nothing new whatsoever`, {});
    x.observe("pm", "PROPOSED DECISION: x", { proposal: "x" });
    x.observe("designer", "DISAGREE: a", {});
    x.observe("frontend", "DISAGREE: b", {});
    x.observe("backend", "DISAGREE: c", {});
    expect(x.mode).toBe("fallback");
    // jaribio la 1 bila pendekezo
    x.observe("pm", "I cannot decide this without more information.", {});
    expect(x.mode).toBe("fallback"); // inarudi kwa jaribio la pili
    // jaribio la 2 binafsi bila pendekezo → closed
    x.observe("pm", "still cannot produce anything", {});
    expect(x.closed()).toBe(true);
    expect(x.closedReason).toContain("could not produce a fallback");
    expect(x.fallbackTaken).toBe(false);
  });

  it("mwenyekiti hakutoa pendekezo kwenye chair resolution → FALLBACK (si 'chair could not produce a proposal')", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `stall stall stall`, {});
    expect(x.mode).toBe("chair");
    x.observe("pm", "Let me think about this more.", {});
    expect(x.mode).toBe("fallback");
    expect(x.closed()).toBe(false);
  });

  it("DEFER ya owner kwenye open mode haifungi agenda — inaleta FALLBACK + deferredText inarekodiwa", () => {
    const x = d();
    x.observe("designer", "DEFER: we are missing the real pricing data from the client", {});
    expect(x.mode).toBe("fallback");
    expect(x.deferredText).toContain("pricing data");
    expect(x.closed()).toBe(false);
    // mwenyekiti anafunga kwa fallback
    x.observe("pm", "PROPOSED DECISION: placeholder pricing marked ASSUMPTION\nASSUMPTION: prices to verify", { proposal: "placeholder pricing marked ASSUMPTION" });
    expect(x.closed()).toBe(true);
    expect(x.fallbackTaken).toBe(true);
  });

  it("DEFER ya mwenyekiti (chair mode) inafunga kama 'chair deferred the item' (defer ya ndani)", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `stall stall stall`, {});
    x.observe("pm", "DEFER: nothing defensible can be built yet", {});
    expect(x.closed()).toBe(true);
    expect(x.closedReason).toBe("chair deferred the item");
  });
});

describe("R37 — kura inarekodiwa kikamilifu", () => {
  it("kura za AGREE na DISAGREE zenye majina na maudhui zinarekodiwa (binding)", () => {
    const x = d();
    for (let i = 0; i < 4; i++) x.observe("designer", `stall stall stall`, {});
    x.observe("pm", "PROPOSED DECISION: p1", { proposal: "p1" });
    x.observe("designer", "AGREE: matches the design tokens", {});
    x.observe("frontend", "DISAGREE: grid breaks on tablet", {});
    x.observe("backend", "AGREE: fine", {});
    const fv = x.finalVotes();
    expect(fv.votes.map((v) => v.vote)).toEqual(["agree", "disagree", "agree"]);
    expect(fv.majority).toBe(true);
    // kosa la frontend (defect) limehifadhiwa kwa mzunguko wa marekebisho
    expect(x.mode).toBe("amend");
    expect(x.forcedSpeaker()).toBe("pm");
  });

  it("single owner (mwenyekiti peke yake) → chair decided moja kwa moja", () => {
    const x = createDeliberation({ owners: [{ id: "pm", name: "Optimus" }], chairId: "pm" });
    x.observe("pm", "stall stall stall", {});
    x.observe("pm", "stall stall stall", {});
    x.observe("pm", "stall stall stall", {});
    x.observe("pm", "stall stall stall", {});
    expect(x.mode).toBe("chair");
    x.observe("pm", "PROPOSED DECISION: everything", { proposal: "everything" });
    expect(x.closed()).toBe(true);
    expect(x.closedReason).toBe("chair decided (single owner)");
  });
});

// ===== R39 · FIX 3 — kanuni ya majibu: echo si ushahidi + mizunguko 15 =====
describe("R39 · FIX 3 — isEchoAnswer (echo ya swali si jibu)", () => {
  const Q = "@Optimus, can you confirm that #00D4AA on #0A0F1A has been verified as WCAG AA compliant?";

  it("echo ya swali ('I confirm that … verified') → echo, si jibu", () => {
    // jibu la Optimus halisi la 6ac7d777 — hakuna namba/source mpya, maneno ya swali tu
    expect(isEchoAnswer(Q, "AGREE: I confirm that #00D4AA on #0A0F1A has been verified as WCAG AA compliant. It passes.")).toBe(true);
  });

  it("jibu lenye NAMBA mpya halali → si echo", () => {
    expect(isEchoAnswer(Q, "Computed with the WCAG formula: #00D4AA on #0A0F1A = 10.03:1, which passes AA (>= 4.5:1) and AAA (>= 7:1).")).toBe(false);
  });

  it("jibu lenye URL mpya halali → si echo", () => {
    expect(isEchoAnswer(Q, "Verified via https://webaim.org/resources/contrastchecker/ — the pair passes.")).toBe(false);
  });

  it("unganisho wa maneno tofauti kabisa → si echo (si kesi yetu, lakini usiue majibu halali)", () => {
    expect(isEchoAnswer(Q, "I measured the palette on an OLED panel at 200 nits; the teal reads clearly against near-black in bright office light.")).toBe(false);
  });

  it("'sijui' fupi → si echo (njia halali — inakuwa ASSUMPTION)", () => {
    expect(isEchoAnswer(Q, "I don't know. Record it as ASSUMPTION.")).toBe(false);
  });
});

describe("R39 — mizunguko ya agenda 12 → 15", () => {
  it("MAX_OWNER_TURNS default ni 15", () => {
    expect(MAX_OWNER_TURNS).toBe(15);
    expect(createDeliberation({ owners: OWNERS, chairId: "pm" }).maxTurns).toBe(15);
  });
});
