// R39 · FIX 3 — routing ya maswali + majibu ya mfumo (SYSTEM VERIFIED).
// (a) swali la moja kwa moja bila prefix ya CLARIFY lina-route (kosa la 6ac7d777:
//     "…can you confirm that #00D4AA…?" ya Ultron haikumpa Optimus zamu ya kujibu);
// (b) swali la contrast/WCAG — mfumo unajibu kwa hesabu; agent anatajwa kuitumia.
import { describe, expect, it } from "vitest";
import { parseClarify, parseDirectQuestion, clarifyNote, pickSpeaker } from "../brain/clarify";
import { contrastQuestionNote, contrastRatio } from "./contrastGuard";

const OWNERS = [
  { id: "pm", name: "Optimus" },
  { id: "designer", name: "Ultron" },
  { id: "qa", name: "Cybertron" },
];
const ultron = OWNERS[1];
const optimus = OWNERS[0];

describe("R39 · FIX 3 — parseDirectQuestion (swali bila CLARIFY prefix)", () => {
  it("swali la moja kwa moja linalomtaja mwenzake → lina-route kwake", () => {
    const q = parseDirectQuestion("Ultron: @Optimus, can you confirm that #00D4AA on #0A0F1A has been verified for WCAG AA?", ultron, OWNERS);
    expect(q).toBeTruthy();
    expect(q!.toId).toBe("pm");
    expect(q!.from).toBe("Ultron");
  });

  it("swali likimtaja jina bila @ → bado lina-route", () => {
    const q = parseDirectQuestion("One open point — Cybertron, did the auth flow test cover token refresh?", ultron, OWNERS);
    expect(q).toBeTruthy();
    expect(q!.toId).toBe("qa");
  });

  it("ujumbe wa uamuzi (AGREE na swali ndani) → HAU-route (unaflow wake)", () => {
    const t = "AGREE: with the proposal. @Optimus can you adjust the tokens later?";
    expect(parseDirectQuestion(t, ultron, OWNERS)).toBeNull();
  });

  it("swali bila kumtaja owner mwingine → si route (swali la jumla)", () => {
    expect(parseDirectQuestion("What about mobile breakpoints?", ultron, OWNERS)).toBeNull();
  });

  it("swali kwa mwenyewe (jina lake) → si route", () => {
    expect(parseDirectQuestion("Ultron, unafikiri nini? Ultron?", ultron, OWNERS)).toBeNull();
  });

  it("ujumbe bila swali kamwe → si route", () => {
    expect(parseDirectQuestion("Tunaendelea na tokens zilizopendekezwa.", ultron, OWNERS)).toBeNull();
  });

  it("pickSpeaker: swali la direct linaipa zamu lengwa kama CLARIFY rasmi", () => {
    const q = parseDirectQuestion("@Optimus, is the chart library licensed for commercial use?", ultron, OWNERS);
    expect(pickSpeaker(OWNERS, 2, q).id).toBe("pm");
  });
});

describe("R39 · FIX 3 — CLARIFY rasmi (regression)", () => {
  it("CLARIFY: @Optimus … → route kwake", () => {
    const q = parseClarify("CLARIFY: @Optimus which font stack exactly?", ultron, OWNERS);
    expect(q?.toId).toBe("pm");
  });
});

describe("R39 · FIX 3 — clarifyNote + evidence rules", () => {
  it("note ina rules za ushahidi (ASSUMPTION / si echo)", () => {
    const note = clarifyNote({ from: "Ultron", toId: "pm", toName: "Optimus", question: "Which chart library?" }, optimus);
    expect(note).toContain("QUESTION FOR YOU");
    expect(note).toContain("EVIDENCE");
    expect(note).toContain("ASSUMPTION");
  });

  it("note YA MWENYE swali la contrast → SYSTEM VERIFIED + namba za hesabu", () => {
    const note = clarifyNote(
      { from: "Ultron", toId: "pm", toName: "Optimus", question: "Can you confirm that #00D4AA on #0A0F1A has been verified for WCAG AA?" },
      optimus,
    );
    expect(note).toContain("[SYSTEM VERIFIED");
    expect(note).toContain("#00D4AA on #0A0F1A");
    expect(note).toContain("10.03:1"); // hesabu halisi ya python (WCAG 2.x) — sio 10.18 ya kinywa
  });
});

describe("R39 · FIX 3 — contrastQuestionNote (mfumo unajibu kwa code)", () => {
  it("hex mbili → mistari ya ratios na verdict; #00D4AA/#0A0F1A = 10.03:1 (AA+AAA)", () => {
    const note = contrastQuestionNote("Does #00D4AA on #0A0F1A pass WCAG AA for normal text?");
    expect(note).toContain("[SYSTEM VERIFIED");
    expect(note).toContain("#00D4AA on #0A0F1A = 10.03:1 (passes AA and AAA)");
    expect(note).toContain("#0A0F1A on #00D4AA"); // jozi zote mbili (fg/bg)
  });

  it("jozi inayokaribia kikomo (4.48:1 < 4.5) → verdict sahihi: AA large only", () => {
    const note = contrastQuestionNote("Is #777777 on #FFFFFF readable (WCAG contrast)?");
    expect(note).toMatch(/#777777 on #FFFFFF = 4\.48:1 \(AA large text only/);
  });

  it("hex moja tu → hakuna note (havamii)", () => {
    expect(contrastQuestionNote("Does #00D4AA pass WCAG AA?")).toBe("");
  });

  it("hakuna neno la contrast/WCAG → hakuna note", () => {
    expect(contrastQuestionNote("Do you prefer #00D4AA or #0A0F1A for the hero?")).toBe("");
  });

  it("hex za tarakimu 3 zinaungana", () => {
    expect(contrastQuestionNote("WCAG check: #fff on #000?")).toContain("#FFFFFF on #000000");
  });

  it("contrastRatio ni (kwa usahihi wa akili ya test) inverse-symmetric", () => {
    const a = contrastRatio("#00D4AA", "#0A0F1A");
    const b = contrastRatio("#0A0F1A", "#00D4AA");
    expect(Math.abs(a - b)).toBeLessThan(0.01);
  });
});
