// TASK 27 — escalation ladder: ngazi kwa attempt, uthibitisho wa diagnosis (+ NO-OP detector), concrete, patch, split,
// redecide (WAIVE inahitaji wote 3), COs zinazogongana, history ya defect, maagizo ya Computer.
import { describe, expect, it } from "vitest";
import {
  applyEscalationToDefects, diffMissedTarget, enforceDetector, escalateChangeOrders, escalationChip, findCoConflicts, isOneSentence, mergeConflictFallback, modeForAttempt,
  requirementDrift, restoreRequirement, validateConcrete, validateDiagnosis, validatePatch, validateRedecide, validateSplit, REDECIDE_MAX_TURNS, type PrevAttemptFact, type RedecideVote,
} from "../escalation";
import { escalationLines, reproducedMap } from "../fixRound";
import type { ChangeOrder, Defect } from "../types";

const CO = (id: string, defectIds: string[], extra: Partial<ChangeOrder> = {}): ChangeOrder => ({
  id, defectIds, attempt: 1, priority: 1, location: { files: ["src/styles.css"], route: "/", selector: "h1" }, current: "c", desired: "d", visionNote: "v", mode: "standard",
  acceptance: [{ id: "h1-color", type: "computed_style", route: "/", selector: "h1", property: "color", expected: "#F2F0EB" }], ...extra,
});
const D = (id: string, extra: Partial<Defect> = {}): Defect => ({ id, milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "type", severity: "major", title: `title ${id}`, evidence: ["S-001"], expected: "x", actual: "y", status: "REOPENED", attempts: 1, history: [], ...extra });
const fact = (o: Partial<PrevAttemptFact> = {}): PrevAttemptFact => ({ round: 1, orderId: "CO-001", verdict: "APPLIED", receiptStatus: "DONE", targets: ["src/styles.css"], touched: ["src/styles.css"], checks: { pass: 0, fail: 1, error: 0 }, reviewerNotes: [], ...o });
const concrete = { defectIds: ["D-001"], priority: 1, location: { files: ["src/styles.css"], route: "/", selector: ".nav a" }, current: "text-transform: uppercase", desired: "text-transform: none", visionNote: "v",
  acceptance: [{ id: "tt", type: "computed_style", route: "/", selector: ".nav a", property: "text-transform", expected: "none" }] };

describe("ngazi za ladder", () => {
  it("attempt → mode (1 standard · 2 concrete · 3 pair_patch · 4 split · ≥5 redecide) + chip", () => {
    expect([1, 2, 3, 4, 5, 6, 9].map(modeForAttempt)).toEqual(["standard", "concrete", "pair_patch", "split", "redecide", "redecide", "redecide"]);
    expect(escalationChip("D-004", 3, "pair_patch")).toBe("D-004 escalated to attempt 3 (pair patch)");
  });
});

describe("T3: diagnosis — JSON inathibitishwa, NOT_ATTEMPTED dhidi ya NO-OP detector", () => {
  it("sentensi moja", () => {
    expect(isOneSentence("The selector was wrong.")).toBe(true);
    expect(isOneSentence("It failed, e.g. on mobile.")).toBe(true);
    expect(isOneSentence("First. Second sentence.")).toBe(false);
    expect(isOneSentence("")).toBe(false);
    expect(isOneSentence("a\nb")).toBe(false);
  });
  it("cause halali + sababu ya sentensi moja → sawa; cause isiyojulikana / sentensi mbili → makosa", () => {
    expect(validateDiagnosis({ cause: "ATTEMPTED_WRONG", reason: "The rule was added to the wrong selector." }, [fact()]).ok).toBe(true);
    const bad = validateDiagnosis({ cause: "LAZY", reason: "One. Two." }, [fact()]);
    expect(bad.ok).toBe(false);
    expect(!bad.ok && bad.errors.join(" ")).toMatch(/cause: must be one of.*reason: exactly ONE sentence/);
  });
  it("detector: diff haikugusa lengo → NOT_ATTEMPTED ni lazima (na ikigusa, NOT_ATTEMPTED si kweli)", () => {
    const missed = [fact({ verdict: "NOT_ATTEMPTED", touched: [] })];
    const noTarget = [fact({ verdict: "APPLIED", touched: [] })];
    expect(diffMissedTarget(missed)).toBe(true);
    expect(diffMissedTarget(noTarget)).toBe(true);
    expect(diffMissedTarget([fact()])).toBe(false);
    expect(diffMissedTarget([fact({ verdict: "BLOCKED", touched: [] })])).toBe(false); // kukataa kwa uwazi ≠ NO-OP
    const r = validateDiagnosis({ cause: "TECH_BLOCKER", reason: "The build failed." }, missed);
    expect(!r.ok && r.errors[0]).toMatch(/NO-OP detector.*must be NOT_ATTEMPTED/);
    expect(validateDiagnosis({ cause: "NOT_ATTEMPTED", reason: "The diff never touched the stylesheet." }, missed).ok).toBe(true);
    const lie = validateDiagnosis({ cause: "NOT_ATTEMPTED", reason: "Nothing was done." }, [fact()]);
    expect(!lie.ok && lie.errors[0]).toMatch(/DID touch the target/);
    expect(enforceDetector({ cause: "ATTEMPTED_WRONG", reason: "x." }, missed)).toEqual({ cause: "NOT_ATTEMPTED", reason: "x.", overriddenBy: "noop-detector" });
    expect(enforceDetector({ cause: "ATTEMPTED_WRONG", reason: "x." }, [fact()]).cause).toBe("ATTEMPTED_WRONG");
  });
});

describe("concrete / patch / split", () => {
  const base = CO("CO-004", ["D-001"], { attempt: 2 });
  it("concrete: faili, selector, before/after (property: value), check kali, defectIds zilezile", () => {
    const ok = validateConcrete(concrete, base, "visual");
    expect(ok.ok && ok.value).toMatchObject({ id: "CO-004", attempt: 2, mode: "concrete" });
    const bad = validateConcrete({ ...concrete, location: { files: [], route: "/" }, current: "uppercase", desired: "fix it", defectIds: ["D-001", "D-002"], acceptance: [{ id: "b", type: "command", cmd: "npm run build" }] }, base, "visual");
    expect(!bad.ok && bad.errors.join("\n")).toMatch(/location.files[\s\S]*selector[\s\S]*BEFORE[\s\S]*AFTER[\s\S]*SHARPER[\s\S]*defectIds/);
  });
  it("patch: unified diff halali · bila hunk → kosa · njia kamili → kosa · faili kamili inakubalika", () => {
    const d = validatePatch({ patch: "```diff\n--- a/src/styles.css\n+++ b/src/styles.css\n@@ -1,1 +1,1 @@\n-a{}\n+a{color:red}\n```" });
    expect(d.ok && d.value).toMatchObject({ kind: "diff", files: ["src/styles.css"] });
    expect(d.ok && d.value.text.startsWith("--- a/")).toBe(true);
    expect(validatePatch({ patch: "--- a/x\n+++ b/x\n-a\n+b\n" }).ok).toBe(false);
    expect(validatePatch({ patch: "--- a/x\n+++ /etc/passwd\n@@ -1 +1 @@\n-a\n+b\n" }).ok).toBe(false);
    const f = validatePatch({ file: "src/styles.css", content: ".grid{display:grid}" });
    expect(f.ok && f.value.text).toBe("*** COMPLETE FILE: src/styles.css ***\n.grid{display:grid}");
    expect(validatePatch({}).ok).toBe(false);
  });
  it("split: faili MOJA + property MOJA kila CO, ids mpya, defect haipotei", () => {
    const one = (file: string, prop: string) => ({ ...concrete, location: { files: [file], route: "/", selector: ".grid" }, acceptance: [{ id: `c-${prop}`, type: "computed_style", route: "/", selector: ".grid", property: prop, expected: "1px" }] });
    const ok = validateSplit({ changeOrders: [one("src/a.css", "gap"), one("src/b.css", "width")] }, CO("CO-004", ["D-001"], { attempt: 4 }), "visual", 9);
    expect(ok.ok && ok.value.map((c) => [c.id, c.mode, c.attempt])).toEqual([["CO-009", "split", 4], ["CO-010", "split", 4]]);
    const two = { ...one("src/a.css", "gap"), location: { files: ["src/a.css", "src/b.css"], route: "/", selector: ".grid" }, acceptance: [...one("x", "gap").acceptance, { id: "w", type: "computed_style", route: "/", selector: ".grid", property: "width", expected: "1px" }] };
    const bad = validateSplit({ changeOrders: [two] }, CO("CO-004", ["D-001", "D-002"], { attempt: 4 }), "visual", 9);
    expect(!bad.ok && bad.errors.join("\n")).toMatch(/exactly ONE file[\s\S]*ONE property[\s\S]*D-002 lost/);
  });
});

describe("redecide (≥5): KEEP | MODIFY | WAIVE", () => {
  const base = CO("CO-007", ["D-001"], { attempt: 5 });
  const V = (d: RedecideVote["vote"], f: RedecideVote["vote"]): RedecideVote[] => [{ reviewer: "designer", vote: d, reason: "r" }, { reviewer: "frontend", vote: f, reason: "r" }];
  it("WAIVE inahitaji reviewers WOTE + Optimus na sababu; si kimya", () => {
    const no = validateRedecide({ outcome: "WAIVE", reason: "harmless" }, V("WAIVE", "KEEP"), base, "visual");
    expect(!no.ok && no.errors[0]).toMatch(/needs BOTH reviewers' WAIVE votes \(designer: WAIVE, frontend: KEEP\)/);
    expect(validateRedecide({ outcome: "WAIVE", reason: " " }, V("WAIVE", "WAIVE"), base, "visual").ok).toBe(false);
    const ok = validateRedecide({ outcome: "WAIVE", reason: "Locked A1 forbids it." }, V("WAIVE", "WAIVE"), base, "visual");
    expect(ok.ok && ok.value).toMatchObject({ outcome: "WAIVE", approvedBy: ["designer", "frontend", "pm"] });
  });
  it("KEEP inahitaji guidance mpya + CO; MODIFY inahitaji requirement + CO", () => {
    expect(validateRedecide({ outcome: "KEEP", reason: "r", changeOrder: concrete }, V("KEEP", "KEEP"), base, "visual").ok).toBe(false);
    expect(validateRedecide({ outcome: "MODIFY", reason: "r", changeOrder: concrete }, V("MODIFY", "KEEP"), base, "visual").ok).toBe(false);
    const m = validateRedecide({ outcome: "MODIFY", reason: "r", requirement: "Nav keeps sentence case (A1).", changeOrder: concrete }, V("MODIFY", "KEEP"), base, "visual");
    expect(m.ok && m.value).toMatchObject({ outcome: "MODIFY", requirement: "Nav keeps sentence case (A1).", changeOrder: { id: "CO-007", mode: "redecide", attempt: 5 } });
  });
});

describe("COs zinazogongana (selector + property ileile)", () => {
  const a = CO("CO-001", ["D-001"]), b = CO("CO-002", ["D-002"], { priority: 2, acceptance: [{ id: "x", type: "computed_style", route: "/", selector: "H1 ", property: "Color", expected: "#000" }] });
  it("inagunduliwa; isiyogongana haiguswi; fallback inaunganisha bila kupoteza defect", () => {
    expect(findCoConflicts([a, b])).toEqual([{ a: "CO-001", b: "CO-002", selector: "h1", property: "color", values: ["#f2f0eb", "#000"] }]);
    expect(findCoConflicts([a, CO("CO-003", ["D-003"])])).toEqual([]);
    expect(findCoConflicts([a, CO("CO-004", ["D-4"], { acceptance: [{ id: "f", type: "computed_style", route: "/", selector: "h1", property: "color", forbidden: "#F2F0EB" }] })])).toHaveLength(1);
    expect(mergeConflictFallback([a, b], findCoConflicts([a, b])).map((c) => [c.id, c.defectIds])).toEqual([["CO-001", ["D-001", "D-002"]]]);
  });
});

describe("escalateChangeOrders (LLM stub)", () => {
  it("kila ngazi + Optimus anasuluhisha mgongano kabla ya kutuma; redecide ≤4 zamu", async () => {
    const calls: string[] = [];
    const complete = async (agent: string, purpose: string) => {
      calls.push(`${agent} ${purpose.replace(/^escalate:M1:R4:/, "")}`);
      if (/:concrete:/.test(purpose)) return JSON.stringify({ diagnosis: { cause: "NOT_ATTEMPTED", reason: "The diff never touched the stylesheet." }, changeOrder: concrete });
      if (/:patch:/.test(purpose)) return JSON.stringify({ patch: "--- a/src/styles.css\n+++ b/src/styles.css\n@@ -1 +1 @@\n-x\n+y\n" });
      if (/:vote-/.test(purpose)) return JSON.stringify({ vote: "WAIVE", reason: "blocked by A1" });
      if (/:decide:/.test(purpose)) return JSON.stringify({ outcome: "WAIVE", reason: "Locked decision A1 forbids it." });
      if (/conflicts/.test(purpose)) return JSON.stringify({ changeOrders: [{ ...concrete, defectIds: ["D-001", "D-005"] }] });
      if (/:split:/.test(purpose)) return JSON.stringify({ changeOrders: [{ ...concrete, defectIds: ["D-003"], location: { files: ["src/a.css"], route: "/", selector: ".grid" }, current: "gap: 0", desired: "gap: 16px", acceptance: [{ id: "g", type: "computed_style", route: "/", selector: ".grid", property: "gap", expected: "16px" }] }] });
      return "{}";
    };
    const read: string[][] = [];
    const defects = [D("D-001", { attempts: 1 }), D("D-002", { attempts: 2 }), D("D-003", { attempts: 3 }), D("D-004", { attempts: 4 }), D("D-005", { attempts: 0 })];
    const cos = [
      CO("CO-010", ["D-001"], { attempt: 2 }), CO("CO-011", ["D-002"], { attempt: 3 }), CO("CO-012", ["D-003"], { attempt: 4 }), CO("CO-013", ["D-004"], { attempt: 5 }),
      CO("CO-014", ["D-005"], { attempt: 1, priority: 2, acceptance: [{ id: "tt2", type: "computed_style", route: "/", selector: ".nav a", property: "text-transform", expected: "uppercase" }] }),
    ];
    const r = await escalateChangeOrders({ milestoneId: "M1", round: 4, reviewMode: "visual", defects, ledgerLines: ["- A1 [LOCKED] sentence case only"], roundHeader: "ROUND 3/10 (M1)" },
      cos, { "D-001": [fact({ verdict: "NOT_ATTEMPTED", touched: [] })] }, 20, { complete, readFiles: async (p) => { read.push(p); return { "src/styles.css": "x\n" }; } });
    expect(r.events.map((e) => [e.coId, e.mode, e.valid])).toEqual([["CO-010", "concrete", true], ["CO-011", "pair_patch", true], ["CO-012", "split", true], ["CO-013", "redecide", true]]);
    expect(r.events[0].diagnosis).toEqual({ cause: "NOT_ATTEMPTED", reason: "The diff never touched the stylesheet." });
    expect(read).toEqual([["src/styles.css"]]);
    expect(r.events[2]).toMatchObject({ resultIds: ["CO-020"], laneSwitch: expect.stringMatching(/skipped/) });
    expect(r.events[3].redecide).toMatchObject({ outcome: "WAIVE", turns: 3, approvedBy: ["designer", "frontend", "pm"] });
    expect(r.events[3].redecide!.turns).toBeLessThanOrEqual(REDECIDE_MAX_TURNS);
    expect(r.waivers.map((w) => w.defectId)).toEqual(["D-004"]);
    // CO-010 (concrete, .nav a → none) vs CO-014 (.nav a → uppercase) → Optimus: CO moja
    expect(r.conflicts).toMatchObject({ resolvedBy: "optimus", found: [{ a: "CO-010", b: "CO-014", property: "text-transform" }] });
    expect(r.changeOrders.map((c) => c.id).sort()).toEqual(["CO-010", "CO-011", "CO-020"]);
    expect(r.changeOrders.find((c) => c.id === "CO-010")!.defectIds).toEqual(["D-001", "D-005"]);
    expect(r.changeOrders.find((c) => c.id === "CO-011")!.patch).toMatch(/^--- a\/src\/styles.css/);
    expect(calls.filter((c) => c.startsWith("pm") && /decide|conflicts/.test(c))).toHaveLength(2);
  });
  it("output batili mara zote → CO ya awali inabaki (fallback inarekodiwa); diagnosis ya detector", async () => {
    const r = await escalateChangeOrders({ milestoneId: "M1", round: 3, reviewMode: "visual", defects: [D("D-001")], ledgerLines: [], roundHeader: "H" },
      [CO("CO-002", ["D-001"], { attempt: 2 })], { "D-001": [fact({ verdict: "NOT_ATTEMPTED", touched: [] })] }, 3, { complete: async () => "not json" });
    expect(r.events[0]).toMatchObject({ valid: false, tries: 3, diagnosis: { cause: "NOT_ATTEMPTED" } });
    expect(r.changeOrders[0]).toMatchObject({ id: "CO-002", mode: "concrete", diagnosis: { cause: "NOT_ATTEMPTED" } });
  });
});

describe("kinga ya hitaji (real run T1): hitaji haliwezi kubadilika kimya kimya kabla ya redecide MODIFY", () => {
  const up = { id: "up", type: "computed_style" as const, route: "/", selector: ".site-nav a", property: "text-transform", expected: "uppercase" };
  const navUp = (extra: Partial<ChangeOrder> = {}) => CO("CO-002", ["D-001"], { attempt: 2, location: { files: ["src/styles.css"], route: "/", selector: ".site-nav a" }, acceptance: [up], ...extra });
  const flipped = { ...concrete, location: { ...concrete.location, selector: ".site-nav a" }, acceptance: [{ ...up, id: "none", expected: "none" }] };
  it("drift: thamani tofauti → kosa; selector iliyoboreshwa na property+thamani ileile → sawa", () => {
    expect(requirementDrift([{ acceptance: flipped.acceptance as ChangeOrder["acceptance"] }], [up])[0]).toMatch(/requirement changed: .*text-transform: uppercase.*redecide MODIFY/);
    expect(requirementDrift([{ acceptance: [{ ...up, selector: "header .site-nav a" }] }], [up])).toEqual([]);
  });
  it("validateConcrete / validateSplit / KEEP zinakataa kubadilisha hitaji; MODIFY inaruhusiwa", () => {
    const c = validateConcrete(flipped, navUp(), "visual", [up]);
    expect(c.ok).toBe(false);
    expect(validateConcrete({ ...flipped, desired: "text-transform: uppercase", acceptance: [up] }, navUp(), "visual", [up]).ok).toBe(true);
    expect(validateSplit({ changeOrders: [flipped] }, navUp({ attempt: 4 }), "visual", 9, [up]).ok).toBe(false);
    const votes: RedecideVote[] = [{ reviewer: "designer", vote: "MODIFY", reason: "r" }, { reviewer: "frontend", vote: "MODIFY", reason: "r" }];
    expect(validateRedecide({ outcome: "KEEP", reason: "r", guidance: "g", changeOrder: flipped }, votes, navUp({ attempt: 5 }), "visual", [up]).ok).toBe(false);
    expect(validateRedecide({ outcome: "MODIFY", reason: "r", requirement: "sentence case nav", changeOrder: flipped }, votes, navUp({ attempt: 5 }), "visual", [up]).ok).toBe(true);
  });
  it("consolidation iliyogeuza hitaji → code inarejesha kabla ya ngazi; LLM ikishindwa mara 3 → CO iliyorejeshwa inatumwa", async () => {
    const prompts: string[] = [];
    const r = await escalateChangeOrders({ milestoneId: "M1", round: 3, reviewMode: "visual", defects: [D("D-001")], ledgerLines: [], roundHeader: "H", requirements: { "D-001": [up] } },
      [navUp({ acceptance: flipped.acceptance as ChangeOrder["acceptance"], desired: "keep text-transform: none" })], { "D-001": [fact()] }, 3,
      { complete: async (_a, _p, m) => { prompts.push(m.map((x) => x.content).join("\n")); return JSON.stringify({ diagnosis: { cause: "CONFLICT_WITH_DECISION", reason: "A1 forbids it." }, changeOrder: flipped }); } });
    expect(prompts[0]).toMatch(/REQUIREMENT \(fixed[^\n]*\n- \.site-nav a \{ text-transform: uppercase \}/);
    expect(r.events[0]).toMatchObject({ valid: false, tries: 3, requirementRestored: 1 });
    expect(r.events[0].errors.join(" ")).toMatch(/requirement changed/);
    const co = r.changeOrders[0];
    expect(co.acceptance.filter((x) => x.type === "computed_style").map((x) => (x as typeof up).expected)).toEqual(["uppercase"]);
    expect(co.desired).toMatch(/^REQUIREMENT \(unchanged until a redecide MODIFY\)/);
    expect(applyEscalationToDefects([D("D-001")], r, 3)[0].history!.at(-1)!.cause).toMatch(/requirement restored \(1 check\(s\)\)/);
    expect(restoreRequirement(navUp(), [up])).toEqual(navUp()); // hakuna drift → haiguswi
  });
});

describe("Defect.history + maagizo ya Computer", () => {
  it("history ina mode/diagnosis/outcome; WAIVE → WAIVED; MODIFY → expected mpya", () => {
    const out = applyEscalationToDefects([D("D-001"), D("D-002"), D("D-003")], {
      events: [
        { coId: "CO-1", resultIds: ["CO-1"], defectIds: ["D-001"], attempt: 2, mode: "concrete", valid: true, tries: 1, errors: [], diagnosis: { cause: "ATTEMPTED_WRONG", reason: "Wrong selector." } },
        { coId: "CO-2", resultIds: [], defectIds: ["D-002"], attempt: 5, mode: "redecide", valid: true, tries: 1, errors: [], redecide: { outcome: "WAIVE", reason: "A1", votes: [], turns: 3, approvedBy: ["designer", "frontend", "pm"] } },
      ],
      waivers: [{ defectId: "D-002", title: "t", severity: "minor", round: 4, reason: "A1", approvedBy: ["designer", "frontend", "pm"], votes: [], at: "" }],
      amendments: [{ id: "AM-M1-R4-D-003", defectId: "D-003", round: 4, requirement: "new req", reason: "r", at: "" }],
    }, 5);
    expect(out[0].history[0]).toMatchObject({ round: 5, mode: "concrete", diagnosis: { cause: "ATTEMPTED_WRONG" }, result: "ESCALATED attempt 2 (concrete) → CO-1" });
    expect(out[1]).toMatchObject({ status: "WAIVED", history: [{ outcome: "WAIVE", result: "ESCALATED attempt 5 (redecide) → WAIVE → no order" }] });
    expect(out[2]).toMatchObject({ expected: "new req", history: [] });
  });
  it("pack ya Computer: concrete / pair patch (harness applied | verbatim) / split (REPRODUCE) / redecide; receipts za split zinapimwa", () => {
    const lines = escalationLines([
      CO("CO-1", ["D-1"], { mode: "concrete", attempt: 2, diagnosis: { cause: "NOT_ATTEMPTED", note: "n" } }), CO("CO-2", ["D-2"], { mode: "pair_patch", attempt: 3, patch: "--- a" }),
      CO("CO-3", ["D-3"], { mode: "split", attempt: 4 }), CO("CO-4", ["D-4"], { mode: "redecide", attempt: 5 }), CO("CO-5", ["D-5"]),
    ], { "CO-2": "the HARNESS ALREADY APPLIED this patch" }).join("\n");
    expect(lines).toMatch(/CO-1 \(CONCRETE[^\n]*NOT_ATTEMPTED/);
    expect(lines).toMatch(/CO-2 \(PAIR PATCH[^\n]*HARNESS ALREADY APPLIED/);
    expect(lines).toMatch(/CO-3 \(SPLIT[^\n]*REPRODUCED: <measurement>/);
    expect(lines).toMatch(/CO-4 \(RE-DECIDED/);
    expect(lines).not.toMatch(/CO-5/);
    expect(escalationLines([CO("CO-5", ["D-5"])])).toEqual([]);
    expect(reproducedMap([CO("CO-3", ["D-3"], { mode: "split" }), CO("CO-6", ["D-6"], { mode: "split" })], { ok: true, errors: [], receipts: [{ orderId: "CO-3", status: "DONE", filesChanged: [], commandsRun: [], notes: "REPRODUCED: width 412px" } as any] })).toEqual({ "CO-3": true, "CO-6": false });
  });
});
