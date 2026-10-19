// TASK 23 (maelezo23) — Reviewer analysis: context pack (mpangilio), image parts, uthibitisho wa JSON + evidence, kurudia (max 2),
// uhuru (hash + hakuna jibu la mwenzake ndani ya prompt). LLM halisi (Gemini Flash vision) iko kwenye docs/tests/task-23.md.
import { describe, expect, it } from "vitest";
import {
  analyse, buildReviewPrompt, classifyEvidence, domLines, extractJson, formatRoundHeader, leakedFragments, REVIEW_MAX_RETRIES,
  reviewRound0, validateFindings, type ReviewContext, type ReviewDeps,
} from "../review";
import type { EvidencePack } from "../types";

const pack = (): EvidencePack => ({
  milestoneId: "M1", round: 0,
  screenshots: [
    { id: "S-001", route: "/", viewport: "375x667", state: "default", path: "a.png", url: "https://s/1.png" },
    { id: "S-002", route: "/", viewport: "1280x800", state: "default", path: "b.png", url: "https://s/2.png" },
  ],
  domMetrics: [{ screenshotId: "S-001", path: "a.dom.json", url: "https://s/1.dom.json" }],
  checks: [{ id: "M1-S1-a", type: "dom_exists", result: "FAIL", detail: "button#lang-toggle matched 0" }],
  commands: [], gitDiffSummary: "index.html | 3 +", consoleErrors: [], errors: [],
  regression: [{ kind: "regression", route: "/", viewport: "375x667", state: "default", changedPct: 12.9, thresholdPct: 2, baselineMilestone: "M0", baselineUrl: "", currentUrl: "", diffUrl: "", diffPath: "" }],
});
const ctx = (): Omit<ReviewContext, "pack"> => ({
  ocb: { project: { name: "xmdtest KIVULI", summary: "dark streetwear store" }, map: { version: 1, sessionId: "s", totalAgendas: 2, generatedBy: "t", usedFallback: false, milestones: [{ id: "M1", title: "Storefront", agendas: { from: 1, to: 2 }, phase: "foundation", reviewMode: "visual", roster: ["optimus", "ultron", "vextron"], rationale: "" }] }, milestoneId: "M1", round: null, counts: { lockedDecisions: 2, milestonesDone: [], openDefects: 0, waivers: 0 } },
  roundHeader: { milestoneId: "M1", round: 0, maxRounds: 10, closedDefects: 0, open: [], waivers: 0, roundsLeft: 10 },
  miniReports: [{ agendaIndex: 1, title: "Brand", detail: "MINI-REPORT-FULL-TEXT accent only on CTAs" }],
  ledger: [{ agenda_index: 1, agenda_item: "Brand", status: "LOCKED", decision_summary: "LEDGER-RULE no monospace" }],
  planMarkdown: "PLAN-BODY header with SW/EN toggle", buildReport: "BUILD-REPORT-BODY", defects: [],
  baselines: [{ milestoneId: "M0", route: "/", viewport: "375x667", state: "default" }],
});
const dom = { page: { innerWidth: 375, innerHeight: 667, scrollWidth: 375, clientWidth: 375, scrollHeight: 900, overflowPx: 0, bodyBackground: "rgb(11, 11, 12)", fontsLoaded: [], imagesWithoutAlt: [], headingOrderProblems: [] },
  elements: [{ selector: "header", tag: "header", text: "KIVULI", box: { x: 0, y: 0, w: 375, h: 64 }, visible: true, fontFamily: "Inter, sans-serif", fontSize: "16px", fontWeight: "400", textTransform: "uppercase", color: "rgb(255, 255, 255)", backgroundColor: "rgb(225, 29, 72)", contrastRatio: 4.7 }] };
const deps = (over: Partial<ReviewDeps> = {}): ReviewDeps => ({
  loadImage: async (s) => ({ mime: "image/png", base64: Buffer.from(`png-${s.id}`).toString("base64") }),
  loadDom: async () => dom as any,
  ...over,
});
const good = (reviewer: string) => ({
  reviewer, screenshots: [{ id: "S-001", description: "header 375x64 on top" }, { id: "S-002", description: "desktop" }],
  defects: [{ title: "No language toggle", area: "header", severity: "major", kind: "violation", decisionRef: "A2", evidence: ["check:M1-S1-a", "S-001 dom: header height=64"], expected: "SW/EN toggle", actual: "missing" }],
  proposals: [{ title: "Real photos", detail: "use 6 distinct photos", rationale: "premium", evidence: ["S-002"] }],
  notes: "ok",
});

describe("TASK 23 — context pack", () => {
  it("mpangilio wa maelezo23 + OCB REVIEW_ANALYSE + RoundHeader; picha = image parts halisi", async () => {
    const b = await buildReviewPrompt("designer", { ...ctx(), pack: pack() }, deps());
    const order = ["=== OPERATION CONTEXT", "YOU ARE HERE: REVIEW_ANALYSE", "ROUND 0/10 (M1)", "MINI-REPORT-FULL-TEXT", "LEDGER-RULE", "PLAN-BODY", "BUILD-REPORT-BODY", "SCREENSHOTS:", "DOM METRICS", "check:M1-S1-a", "regression:/@375x667", "GIT DIFF SUMMARY", "## DEFECT LEDGER", "## BASELINES OF PREVIOUS MILESTONES", "## YOUR TASK"];
    const user = String((b.messages[1] as any).content[0].text); // system ina maelekezo ya output — mpangilio ni wa context ya user
    const pos = order.map((k) => user.indexOf(k));
    expect(pos.every((p) => p >= 0)).toBe(true);
    expect([...pos].sort((x, y) => x - y)).toEqual(pos);
    expect(b.imageParts).toBe(2);
    const content = (b.messages[1] as any).content;
    expect(content.filter((c: any) => c.type === "image_url").map((c: any) => c.image_url.url.slice(0, 22))).toEqual(["data:image/png;base64,", "data:image/png;base64,"]);
    expect(b.text).toContain("You are Ultron, the UI/UX Designer");
    expect(b.text).toContain("S-001 dom: header");
  });
  it("images:false → hakuna image part, na prompt inasema wazi", async () => {
    const b = await buildReviewPrompt("frontend", { ...ctx(), pack: pack() }, deps({ images: false }));
    expect(b.imageParts).toBe(0);
    expect(b.text).toContain("PICTURES: NOT attached");
    expect(b.text).toContain("You are Vextron, the Frontend Engineer");
  });
  it("domLines: selector + thamani zinaweza kunakiliwa neno kwa neno", () => {
    const l = domLines("S-001", dom as any);
    expect(l).toContain("S-001 dom: header · <header> \"KIVULI\" · x=0 y=0 width=375 height=64");
    expect(l).toContain("textTransform=uppercase");
    expect(domLines("S-009", null)).toBe("S-009: (no DOM metrics)");
  });
  it("RoundHeader", () => {
    expect(formatRoundHeader({ milestoneId: "M1", round: 3, maxRounds: 10, closedDefects: 7, open: [{ id: "D-004", attempt: 3 }], waivers: 0, roundsLeft: 7 }))
      .toBe("ROUND 3/10 (M1) — closed defects: 7 · open: 1 (D-004 attempt 3) · waivers: 0 · rounds left: 7");
  });
});

describe("TASK 23 — uthibitisho", () => {
  it("evidence: screenshot/check/regression za pack ✓; ids zisizopo ✗; ledger ni ya ziada tu", () => {
    const p = pack();
    expect(classifyEvidence("S-002", p)).toEqual({ kind: "pack" });
    expect(classifyEvidence("S-001 dom: header height=64", p)).toEqual({ kind: "pack" });
    expect(classifyEvidence("check:M1-S1-a", p)).toEqual({ kind: "pack" });
    expect(classifyEvidence("regression:/@375x667", p)).toEqual({ kind: "pack" });
    expect(classifyEvidence("ledger:A2", p)).toEqual({ kind: "extra" });
    expect(classifyEvidence("S-007", p)).toHaveProperty("error");
    expect(classifyEvidence("check:nope", p)).toHaveProperty("error");
    expect(classifyEvidence("console", p)).toHaveProperty("error"); // pack haina console errors
    expect(classifyEvidence("looks bad", p)).toHaveProperty("error");
  });
  it("Findings sahihi → ok; makosa yanaorodheshwa kwa usahihi", () => {
    expect(validateFindings(good("designer"), "designer", pack()).ok).toBe(true);
    expect(validateFindings({ ...good("Ultron") }, "designer", pack()).ok).toBe(true);
    const bad: any = good("frontend");
    bad.screenshots = [{ id: "S-001", description: "x" }];
    bad.defects[0].severity = "critical";
    bad.defects[0].evidence = ["ledger:A2"];
    bad.proposals[0].evidence = ["S-099"];
    const v = validateFindings(bad, "frontend", pack());
    expect(v.ok).toBe(false);
    if (!v.ok) {
      const all = v.errors.join("\n");
      expect(all).toContain("missing descriptions for S-002");
      expect(all).toContain("severity");
      expect(all).toContain("needs at least one item pointing into the evidence pack");
      expect(all).toContain("S-099 is not in the pack");
    }
  });
  it("extractJson: fence / maandishi ya pembeni", () => {
    expect(extractJson("```json\n{\"a\":1}\n```")).toEqual({ a: 1 });
    expect(extractJson("Here: {\"a\":2} done")).toEqual({ a: 2 });
    expect(() => extractJson("no json")).toThrow();
  });
});

describe("TASK 23 — kurudia + uhuru", () => {
  it("JSON batili → kurudia pamoja na orodha ya makosa (max 2), kisha halali", async () => {
    const seen: any[] = [];
    let n = 0;
    const r = await analyse("designer", pack(), ctx(), deps({
      complete: async ({ messages }) => { seen.push(messages); n++; return { text: n === 1 ? "not json" : n === 2 ? JSON.stringify({ ...good("designer"), defects: [{ ...good("designer").defects[0], evidence: ["S-777"] }] }) : JSON.stringify(good("designer")), usage: null, lane: { id: "gemini-1:gemini-3.8-flash", model: "gemini-3.8-flash", tier: "flash" } }; },
    }));
    expect(r.valid).toBe(true);
    expect(r.meta.attempts).toBe(3);
    expect(String((seen[1].at(-1) as any).content)).toContain("invalid JSON");
    expect(String((seen[2].at(-1) as any).content)).toContain("S-777 is not in the pack");
    expect(r.meta.tier).toBe("flash");
    expect(r.meta.imageParts).toBe(2);
  });
  it("bado batili baada ya retries 2 → valid=false, makosa yanabaki", async () => {
    const r = await analyse("frontend", pack(), ctx(), deps({ complete: async () => ({ text: "{}", usage: null }) }));
    expect(r.valid).toBe(false);
    expect(r.meta.attempts).toBe(REVIEW_MAX_RETRIES + 1);
    expect(r.meta.errors.length).toBeGreaterThan(0);
  });
  it("reviewRound0: sambamba, hash tofauti, hakuna jibu la mmoja ndani ya prompt ya mwingine", async () => {
    let running = 0, peak = 0;
    const r = await reviewRound0(pack(), ctx(), deps({
      complete: async ({ reviewer }) => { running++; peak = Math.max(peak, running); await new Promise((s) => setTimeout(s, 20)); running--; return { text: JSON.stringify({ ...good(reviewer), notes: `UNIQUE-${reviewer}-OUTPUT `.repeat(8) }), usage: null }; },
    }));
    expect(peak).toBe(2);
    expect(r.independence).toMatchObject({ hashesDiffer: true, designerLeakIntoFrontend: [], frontendLeakIntoDesigner: [], ok: true });
    expect(r.frontend.promptText).not.toContain("UNIQUE-designer-OUTPUT");
  });
  it("leakedFragments: inakamata jibu lililovuja, inaruka maandishi ya context ya pamoja", () => {
    const shared = "S-001 dom: header · <header> \"KIVULI\" · x=0 y=0 width=375 height=64 · fontSize=16px";
    const outA = `The header is fine. ${shared}. A brand new sentence that only reviewer A wrote about the hero section spacing.`;
    expect(leakedFragments(outA, `context ${shared}`, `own ${shared}`)).toEqual([]);
    expect(leakedFragments(outA, `context ${outA}`, `own ${shared}`).length).toBeGreaterThan(0);
  });
});

describe("TASK 29 — technical bila picha → textOnly (lane yoyote nzito)", () => {
  it("visual → textOnly false; technical → true", async () => {
    const seen: Record<string, boolean | undefined> = {};
    const d = deps({ complete: async ({ reviewer, textOnly }) => { seen[reviewer] = textOnly; return { text: JSON.stringify(good(reviewer)), usage: null }; } });
    await analyse("designer", pack(), ctx(), d);
    expect(seen.designer).toBe(false);
    const tp = { ...pack(), screenshots: [], domMetrics: [] } as any;
    await analyse("frontend", tp, { ...ctx(), reviewMode: "technical" } as any, d);
    expect(seen.frontend).toBe(true);
  });
});

describe("TASK 23 — LLM ikishindwa", () => {
  it("TASK 29: kosa la muda (429) kisha jibu → reviewer anapata findings (attempt 2)", async () => {
    let n = 0;
    const r = await analyse("designer", pack(), ctx(), deps({ retryWaitMs: 0, complete: async ({ reviewer }) => { if (++n === 1) throw new Error("429 quota"); return { text: JSON.stringify(good(reviewer)), usage: null }; } }));
    expect([r.valid, r.meta.attempts]).toEqual([true, 2]);
  });
  it("lanes zimekwisha → valid=false + kosa wazi, reviewRound0 haianguki", async () => {
    const r = await reviewRound0(pack(), ctx(), deps({ retryWaitMs: 0, complete: async ({ reviewer }) => { if (reviewer === "designer") throw new Error("503 high demand"); return { text: JSON.stringify(good(reviewer)), usage: null }; } }));
    expect(r.designer.valid).toBe(false);
    expect(r.designer.meta.errors[0]).toMatch(/LLM call failed: 503 high demand/);
    expect(r.designer.meta.attempts).toBe(REVIEW_MAX_RETRIES + 1); // TASK-29: inajaribiwa tena (kusubiri) kabla ya kukata tamaa
    expect(r.frontend.valid).toBe(true);
  });
});
