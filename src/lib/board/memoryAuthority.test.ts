// src/lib/board/memoryAuthority.test.ts — R37 (A1/A2): regression ya A3 ya session 6ac7576d + wizi halisi unabaki anakatwa.
// Data halisi: msg #17 ya Agenda 3 (designer) — TRADE-OFF yenye "requires" + "enterprise" iliua proposal kwa
// false positive ("enterprise" = neno la kwanza la title ya kikao cha SASA, si alama ya mradi wa zamani).
import { describe, expect, it } from "vitest";
import {
  pastAuthorityHits, pastAuthorityNote, authorityTriggerSentence, stripPastAuthority,
  rememberPastProject, pastProjectNames, contextWords,
} from "./memoryAuthority";

const CUR_TITLE = "Enterprise Business Intelligence Platform Specification";
const CUR_BRIEF = "Build a complete multi-dashboard business intelligence web platform. This is a BIG project.";
const CUR_AGENDA = "Layout shell";
const SESSION_CTX = `${CUR_TITLE} ${CUR_BRIEF} ${CUR_AGENDA}`;

// Msg #17 halisi (designer, A3) — sehemu muhimu
const A3_MSG = `PROPOSED DECISION: The Meridian layout shell uses a strict CSS Grid parent with \`subgrid\` children to eliminate unnecessary wrapper divs.
RATIONALE: A single grid system keeps spacing tokens mechanical and auditable.
The single-accent rule (locked in Agenda 1) demands that active states rely on low-opacity mechanical shifts rather than introducing new colors or heavy shadows.
TRADE-OFF: CSS \`subgrid\` requires modern browser support (Chrome 117+, Safari 16+), which is acceptable for an enterprise BI tool but drops legacy support entirely.
EVIDENCE: CSS Grid Layout Module Level 2 (https://www.w3.org/TR/css-grid-2/).`;

function seed() {
  // kumbukumbu za miradi ya zamani (zilizoletwa na memory recall) — pamoja na ile iliyosababisha bug
  rememberPastProject("Enterprise BI Platform Blueprint");
  rememberPastProject("Saluni Nuru");
  rememberPastProject("Mama Lishe Bora");
  return pastProjectNames(CUR_TITLE, CUR_BRIEF);
}

describe("R37 (A1) — neno la kikao cha SASA si alama ya mradi wa zamani", () => {
  it("A3 msg #17 halisi: HAKUNA hit zaidi (project halali inaisha hai)", () => {
    const names = seed();
    expect(pastAuthorityHits(A3_MSG, names, SESSION_CTX)).toEqual([]);
  });

  it("bila context ya sasa (code ya zamani) msg #17 ilikuwa inauawa — hit 'enterprise' (dokumentesheni ya bug)", () => {
    const names = seed();
    const hits = pastAuthorityHits(A3_MSG, names, "");
    expect(hits).toContain("past project: enterprise");
  });

  it("heads tu zinazukwa — jina kamili la mradi wa zamani linabaki halali (full-name matching haifungwi)", () => {
    const names = seed();
    // rejea halisi ya jina kamili la mradi wa zamani bado inakamatwa
    const ref = "The earlier Enterprise BI Platform Blueprint required subgrid support, as decided before.";
    const hits = pastAuthorityHits(ref, names, SESSION_CTX);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.join(" ")).toContain("enterprise bi platform blueprint");
  });
});

describe("R37 regression — wizi HALISI unabaki anakatwa", () => {
  it("Saluni Nuru: 'previous Saluni Nuru project … locked' inakatwa hata na context ya sasa", () => {
    const names = seed();
    const theft = "PROPOSED DECISION: Use champagne gold #D4AF37 as locked in the previous Saluni Nuru project, verified before.";
    expect(pastAuthorityHits(theft, names, SESSION_CTX).length).toBeGreaterThan(0);
  });

  it("Mama Lishe Bora: 'proven on Mama Lishe Bora' (jina kamili) inakatwa", () => {
    const names = seed();
    const theft = "PROPOSED DECISION: Meets the <50KB gzipped budget (proven on Mama Lishe Bora).";
    const hits = pastAuthorityHits(theft, names, SESSION_CTX);
    expect(hits.join(" ")).toContain("mama lishe bora");
  });

  it("rejea halali 'locked in Agenda 1' (kikao hiki) inaendelea kupita", () => {
    const names = seed();
    const ok = "The single-accent rule (locked in Agenda 1) demands low-opacity shifts.";
    expect(pastAuthorityHits(ok, names, SESSION_CTX)).toEqual([]);
  });

  it("stripPastAuthority inaendelea kuondoa hoja za wizi kwenye review (na context ya sasa)", () => {
    const names = seed();
    const review = "REJECT: 1. The palette copies the previous Saluni Nuru project choices. 2. Font pairing is weak for dashboards.";
    const sp = stripPastAuthority(review, names, SESSION_CTX);
    expect(sp.removed.length).toBeGreaterThan(0);
    expect(sp.text).toContain("Font pairing");
  });
});

describe("R37 (A2) — quote ya sentensi iliyotrigga", () => {
  it("authorityTriggerSentence inarudisha sentensi halisi ya TRADE-OFF (kwa code ya zamani bila ctx)", () => {
    const names = seed();
    const trig = authorityTriggerSentence(A3_MSG, names, "");
    expect(trig).not.toBeNull();
    expect(trig!.sentence).toContain("subgrid");
    expect(trig!.sentence).toContain("enterprise");
  });

  it("pastAuthorityNote inaingiza quote ya sentensi (uwasi — agent aone kosa lake kwa ufusa)", () => {
    const names = seed();
    const trig = authorityTriggerSentence(A3_MSG, names, "");
    const note = pastAuthorityNote(trig!.hits, "Ultron", trig!.sentence);
    expect(note).toContain("The exact sentence that triggered this check was");
    expect(note).toContain("subgrid");
  });
});

describe("contextWords", () => {
  it("maneno ya title/brief/agenda (≥3 herufi) ni context — 'enterprise' inajumuishwa", () => {
    const ctx = contextWords(SESSION_CTX);
    expect(ctx.has("enterprise")).toBe(true);
    expect(ctx.has("layout")).toBe(true);
  });
});
