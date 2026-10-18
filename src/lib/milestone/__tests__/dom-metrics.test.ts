// TASK 20 — unit tests: Key Selectors za plan, config ya script (kikomo 150), domMetricsPath, validateEvidencePack.domMetrics.
// Hakuna I/O (majaribio halisi ya browser: docs/tests/task-20.md + tests/fixtures/t20-assert.mjs).
import { describe, expect, it } from "vitest";
import { DOM_MAX_ELEMENTS, domMetricsPath, evidenceRunConfig, planEvidenceSpec } from "../evidence";
import { validateEvidencePack } from "../schemas";
import { EVIDENCE_ERROR_KINDS, type EvidencePack } from "../types";

const PLAN = `# MILESTONE PLAN — M1
Start Command: \`python3 -m http.server 4173 --bind 127.0.0.1\`
**Key Selectors:** \`.product-card\`, #cart-button, [data-role="a,b"]
**Screenshots:**
- route: / · states: default · viewports: 375x667
`;

const errsOf = (r: { ok: boolean; errors?: string[] }) => (r.ok ? [] : (r as { errors: string[] }).errors);

function pack(domUrl: string | undefined, screenshotId = "S-001"): EvidencePack {
  return {
    milestoneId: "M1", round: 0,
    screenshots: [{ id: "S-001", route: "/", viewport: "375x667", state: "default", path: ".xmd/S-001.png", url: "https://x/S-001.png" }],
    domMetrics: [{
      screenshotId, path: ".xmd/S-001.dom.json", ...(domUrl === undefined ? {} : { url: domUrl }),
      summary: { elements: 8, totalCandidates: 8, truncated: false, hasHorizontalOverflow: true, overflowPx: 3, tooSmall: 1, lowContrast: 1, imagesWithoutAlt: 1, headingOrderProblems: 2 },
    }],
    checks: [], commands: [], gitDiffSummary: "", regression: [], consoleErrors: [], errors: [],
  };
}

describe("Key Selectors + config (Task 20)", () => {
  it("planEvidenceSpec inasoma Key Selectors (backticks/bold zinaondolewa, koma ndani ya [] zinabaki)", () => {
    expect(planEvidenceSpec(PLAN).keySelectors).toEqual([".product-card", "#cart-button", '[data-role="a,b"]']);
  });
  it("hakuna mstari / 'none' → []", () => {
    expect(planEvidenceSpec("Start Command: x\n- route: / · states: default · viewports: 375x667").keySelectors).toEqual([]);
    expect(planEvidenceSpec("Key Selectors: none").keySelectors).toEqual([]);
  });
  it("evidenceRunConfig inapeleka keySelectors + kikomo 150 kwa script", () => {
    const c = evidenceRunConfig(planEvidenceSpec(PLAN), "M1", 0);
    expect(c.keySelectors).toEqual([".product-card", "#cart-button", '[data-role="a,b"]']);
    expect(c.domMaxElements).toBe(150);
    expect(DOM_MAX_ELEMENTS).toBe(150);
  });
  it("domMetricsPath: S-001.png → S-001.dom.json", () => {
    expect(domMetricsPath(".xmd/evidence/M1/R0/S-001.png")).toBe(".xmd/evidence/M1/R0/S-001.dom.json");
  });
  it("error kind 'dom' ipo", () => {
    expect(EVIDENCE_ERROR_KINDS).toContain("dom");
  });
});

describe("validateEvidencePack.domMetrics (Task 20)", () => {
  it("entry halali inapita (na requireUrls ikiwa url ni http)", () => {
    expect(validateEvidencePack(pack("https://x/S-001.dom.json"), { requireUrls: true }).ok).toBe(true);
    expect(validateEvidencePack(pack(""), {}).ok).toBe(true);
  });
  it("requireUrls: url tupu inakataliwa; data: inakataliwa kila wakati", () => {
    expect(errsOf(validateEvidencePack(pack(""), { requireUrls: true })).join(" ")).toContain("domMetrics[0].url: must be an uploaded");
    expect(errsOf(validateEvidencePack(pack("data:application/json;base64,e30="))).join(" ")).toContain("base64 data URLs are not allowed");
  });
  it("screenshotId isiyokuwepo + path mbaya + summary mbaya", () => {
    const p = pack("https://x/a.dom.json", "S-009");
    p.domMetrics[0].path = ".xmd/S-009.json";
    (p.domMetrics[0] as { summary: unknown }).summary = { elements: "8" };
    const all = errsOf(validateEvidencePack(p)).join("\n");
    expect(all).toContain("screenshotId: must be the id of a screenshot");
    expect(all).toContain("must be a .dom.json file");
    expect(all).toContain("summary: must be an object with numeric elements");
  });
});
