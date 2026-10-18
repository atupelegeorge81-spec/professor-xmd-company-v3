// TASK 19 — unit tests: evidence spec (plan parsing) + validateEvidencePack. Hakuna I/O.
import { describe, expect, it } from "vitest";
import { evidenceDir, evidenceKey, evidenceRunConfig, needsScreenshots, parseEvidenceState, planEvidenceSpec } from "../evidence";
import { EVIDENCE_PORT, PLAN_VIEWPORTS } from "../plan";
import { validateEvidencePack } from "../schemas";
import type { EvidencePack } from "../types";

const PLAN = `# MILESTONE PLAN — M1
Build Command: \`npm run build\`
Test Command: npm test
Start Command: \`python3 -m http.server 4173 --bind 127.0.0.1\`

## 7. QA Checklist
- [ ] pages render
**Screenshots:**
- route: / · states: default, menu-open[click #menu-toggle], card-hover[hover .card] · viewports: 375x667, 1280x800
- route: /about/ · states: default · viewports: 375 x 667, 768x1024, 1280x800
- route: / · states: dropped-tab[click [data-tab="archive"]] · viewports: 1280x800
- route: /r× · states: broken[dblclick .x] · viewports: 375x667
`;

describe("planEvidenceSpec (Task 19)", () => {
  it("inasoma routes × viewports × states + Start Command, na duplicate route inajiunga", () => {
    const s = planEvidenceSpec(PLAN);
    expect(s.startCommand).toBe("python3 -m http.server 4173 --bind 127.0.0.1");
    expect(s.port).toBe(EVIDENCE_PORT);
    expect(s.routes.map((r) => r.route)).toEqual(["/", "/about/", "/r×"]);
    const home = s.routes[0];
    expect(home.viewports).toEqual(["375x667", "1280x800"]);
    // state "default" huepukwa na kwenye lines zote; duplicate line / inaongeza state yake
    expect(home.states.map((x) => x.name)).toEqual(["menu-open", "card-hover", "dropped-tab"]);
    expect(home.states[0].actions).toEqual([{ do: "click", selector: "#menu-toggle" }]);
    expect(home.states[2].actions[0].selector).toBe('[data-tab="archive"]');
    expect(s.routes[1].viewports).toEqual(["375x667", "768x1024", "1280x800"]); // spaces zimeondolewa
    expect(s.routes[1].states).toEqual([]);
  });

  it("unknown action → problem (si kushambuliwa); state line bila koma ndani ya [] hugawanyika", () => {
    const s = planEvidenceSpec(PLAN);
    expect(s.problems).toHaveLength(1);
    expect(s.problems[0]).toContain('unknown action "dblclick .x"');
    expect(s.routes[2].states).toEqual([{ name: "broken", actions: [] }]);
  });

  it("koma ndani ya [] hubaki ndani ya selector moja (si separator ya actions); koma nje hugawanya states", () => {
    const s = planEvidenceSpec("- route: / · states: a[click button, .card], b[click c] · viewports: 375x667");
    expect(s.routes[0].states.map((x) => x.name)).toEqual(["a", "b"]);
    expect(s.routes[0].states[0].actions).toEqual([{ do: "click", selector: "button, .card" }]);
    expect(s.problems).toEqual([]);
  });

  it("viewports segment ya garbage → default PLAN_VIEWPORTS; line bila sehemu yote tatu haisomwi; plan tupu → hakuna routes", () => {
    const s = planEvidenceSpec("- route: /only · states: default · viewports: -\n- route: /bad · states: default");
    expect(s.routes.map((r) => r.route)).toEqual(["/only"]);
    expect(s.routes[0].viewports).toEqual([...PLAN_VIEWPORTS]);
    const empty = planEvidenceSpec("");
    expect(empty.routes).toEqual([]);
    expect(empty.startCommand).toBe("");
  });

  it("parseEvidenceState: actions zinazounganishwa kwa \">\", action za wakati wote", () => {
    expect(parseEvidenceState("open[click #a > hover .b]")).toEqual({ name: "open", actions: [{ do: "click", selector: "#a" }, { do: "hover", selector: ".b" }] });
    const problems: string[] = [];
    expect(parseEvidenceState("name-bad[boom #x]", problems)).toEqual({ name: "name-bad", actions: [] });
    expect(problems[0]).toContain("boom #x");
  });
});

function pack(url: string): EvidencePack {
  return {
    milestoneId: "M1", round: 0,
    screenshots: [
      { id: "S-001", route: "/", viewport: "375x667", state: "default", path: ".xmd/e.png", url },
      { id: "S-002", route: "/about/", viewport: "768x1024", state: "menu-open", path: ".xmd/f.png", url },
    ],
    domMetrics: [], checks: [], commands: [], gitDiffSummary: "x", regression: [], consoleErrors: [], errors: [],
  };
}

const errsOf = (r: { ok: boolean; errors?: string[] }) => (r.ok ? [] : (r as { errors: string[] }).errors);

describe("validateEvidencePack (Task 19)", () => {
  it("pack halali inapita; requireUrls inakataa path za ndani", () => {
    const good = validateEvidencePack(pack("https://x/y.png"), { requireUrls: true });
    expect(good.ok).toBe(true);
    const local = validateEvidencePack(pack(".xmd/evidence/M1/R0/S-001.png"));
    expect(local.ok).toBe(true); // bila requireUrls, path za ndani zinakubalika
    const req = validateEvidencePack(pack(".xmd/evidence/M1/R0/S-001.png"), { requireUrls: true });
    expect(req.ok).toBe(false);
    expect(errsOf(req).join(" ")).toContain("uploaded http(s)");
  });

  it("data: URL imezuiwa kila wakati (hakuna base64 kwenye context)", () => {
    const r = validateEvidencePack(pack("data:image/png;base64,AAAA"), { requireUrls: true });
    expect(r.ok).toBe(false);
    expect(errsOf(r).join(" ")).toContain("base64 data URLs are not allowed");
  });

  it("id mbaya/duplicate, viewport mbaya, error kind mbaya", () => {
    const p = pack("https://x/y.png");
    p.screenshots[0].id = "shot1";
    p.screenshots[1].id = "shot1";
    p.screenshots[1].viewport = "375-667";
    p.errors = [{ kind: "weird", detail: "x" } as never];
    const r = validateEvidencePack(p);
    expect(r.ok).toBe(false);
    const all = errsOf(r).join("\n");
    expect(all).toContain("must look like \"S-001\""); expect(all).toContain("375-667"); expect(all).toContain("kind");
    expect(all).not.toContain("duplicate S-001"); // id zenye format mbaya hazijiandikishe kwenye seen
  });

  it("duplicates S-### hukataliwa", () => {
    const p = pack("https://x/y.png");
    p.screenshots[1] = { ...p.screenshots[0] };
    const r = validateEvidencePack(p);
    expect(r.ok).toBe(false);
    expect(errsOf(r).join(" ")).toContain("duplicate S-001");
  });
});

describe("helpers (Task 19)", () => {
  it("needsScreenshots: visual/mixed tu", () => {
    expect(needsScreenshots("visual")).toBe(true);
    expect(needsScreenshots("mixed")).toBe(true);
    expect(needsScreenshots("technical")).toBe(false);
    expect(needsScreenshots(undefined)).toBe(false);
  });
  it("evidenceKey/evidenceDir/evidenceRunConfig", () => {
    expect(evidenceKey("M2", 3)).toBe("evidence:M2:R3");
    expect(evidenceDir("M2", 3)).toBe(".xmd/evidence/M2/R3");
    const spec = planEvidenceSpec(PLAN);
    const c = evidenceRunConfig(spec, "M2", 3, { base: "https://b.app" });
    expect({ id: c.milestoneId, round: c.round, cwd: c.cwd, outDir: c.outDir, base: c.base, routes: c.routes.length }).toEqual({
      id: "M2", round: 3, cwd: "/home/user/ws", outDir: ".xmd/evidence/M2/R3", base: "https://b.app", routes: 3,
    });
    expect(c.startTimeoutMs).toBe(120_000);
    expect("problems" in c).toBe(false);
  });
});
