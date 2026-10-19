/**
 * TASK-27 — Escalation ladder: defect ileile ikishindikana tena na tena, mfumo unabadilisha mbinu.
 *
 *   attempt 1  standard    CO ya kawaida + Receipt + NO-OP detector (task 25)
 *   attempt 2  concrete    Optimus: diagnosis (JSON + sentensi moja, imethibitishwa) → CO kamili (faili, selector, property, thamani, before/after, check kali)
 *   attempt 3  pair_patch  Frontend Engineer anaandika patch kamili; harness `git apply --check` → `git apply`; isipoingia, Computer anaitumia kama ilivyo
 *   attempt 4  split       COs ndogo (faili/property moja kila moja); Computer lazima AREPRODUCE (kipimo) kwanza; lane switch (haipo kwenye cu/brain.py → inarekodiwa)
 *   attempt ≥5 redecide    reviewers 2 + Optimus (≤4 zamu): KEEP | MODIFY (requirement mpya → ledger) | WAIVE (wote 3 + sababu; kamwe si kimya)
 *
 * Kila kitu hapa ni SAFI isipokuwa `escalateChangeOrders` (inaita LLM kupitia deps zinazodungwa).
 */
import { extractJson } from "./review";
import { validateChangeOrder } from "./schemas";
import { CO_MODES, DIAGNOSIS_CAUSES, type ChangeOrder, type ChangeOrderMode, type Check, type Defect, type DiagnosisCause, type ReviewMode } from "./types";

export const REDECIDE_OUTCOMES = ["KEEP", "MODIFY", "WAIVE"] as const;
export type RedecideOutcome = (typeof REDECIDE_OUTCOMES)[number];
export const REDECIDE_MAX_TURNS = 4;
export const ESCALATION_MAX_TRIES = 3;
export const PATCH_FILE_MAX_CHARS = 14_000;
export const LANE_SWITCH_SKIPPED = "lane switch skipped — cu/brain.py has no per-CO Computer lane override (FLOW-MAP B.8); recorded, not switched";

export const MODE_LABEL: Record<ChangeOrderMode, string> = { standard: "standard", concrete: "concrete", pair_patch: "pair patch", split: "split", redecide: "redecide" };

/** Ngazi ya ladder kwa attempt (1-based). */
export function modeForAttempt(attempt: number): ChangeOrderMode {
  if (attempt <= 1) return "standard";
  if (attempt === 2) return "concrete";
  if (attempt === 3) return "pair_patch";
  if (attempt === 4) return "split";
  return "redecide";
}
export const escalationChip = (defectId: string, attempt: number, mode: ChangeOrderMode) => `${defectId} escalated to attempt ${attempt} (${MODE_LABEL[mode]})`;

/* ───────────────────────────── ukweli wa jaribio lililopita (NO-OP detector) ───────────────────────────── */

export interface PrevAttemptFact {
  round: number;
  orderId: string;
  verdict: "APPLIED" | "NOT_ATTEMPTED" | "BLOCKED" | "UNKNOWN";
  receiptStatus: string;
  targets: string[];
  touched: string[];
  blockedReason?: string;
  checks: { pass: number; fail: number; error: number };
  reviewerNotes: string[];
  reverted?: boolean;
}

/** Diff haikugusa lengo: detector alisema NOT_ATTEMPTED, au CO "ilitumika" bila kugusa faili lengwa yoyote. */
export function diffMissedTarget(facts: PrevAttemptFact[]): boolean {
  const last = lastRound(facts);
  if (!last.length) return false;
  return last.every((f) => f.verdict === "NOT_ATTEMPTED" || (f.verdict === "APPLIED" && f.targets.length > 0 && f.touched.length === 0));
}
export function diffTouchedTarget(facts: PrevAttemptFact[]): boolean {
  return lastRound(facts).some((f) => f.verdict === "APPLIED" && f.touched.length > 0);
}
function lastRound(facts: PrevAttemptFact[]): PrevAttemptFact[] {
  if (!facts.length) return [];
  const r = Math.max(...facts.map((f) => f.round));
  return facts.filter((f) => f.round === r);
}
export function factLines(facts: PrevAttemptFact[]): string[] {
  return facts.map((f) => `- R${f.round} ${f.orderId}: detector=${f.verdict} · receipt=${f.receiptStatus} · targets=[${f.targets.join(", ")}] · diff touched=[${f.touched.join(", ")}]${f.blockedReason ? ` · blocked: ${f.blockedReason.slice(0, 200)}` : ""} · checks ${f.checks.pass}P/${f.checks.fail}F/${f.checks.error}E${f.reverted ? " · ROUND REVERTED" : ""}${f.reviewerNotes.length ? ` · reviewers: ${f.reviewerNotes.join(" | ").slice(0, 400)}` : ""}`);
}

/* ───────────────────────────── validation (safi) ───────────────────────────── */

type V<T> = { ok: true; value: T } | { ok: false; errors: string[] };

/** sentensi MOJA: si tupu, ≤300 herufi, bila mstari mpya, bila mwisho-wa-sentensi katikati. */
export function isOneSentence(s: unknown): boolean {
  const t = String(s ?? "").trim();
  if (!t || t.length > 300 || /\n/.test(t)) return false;
  return !/[.!?]\s+[A-Z(“"']/.test(t.replace(/\b(e\.g|i\.e|vs|etc|approx)\.\s/gi, "$1 "));
}

export interface Diagnosis { cause: DiagnosisCause; reason: string; overriddenBy?: "noop-detector" }
/** maelezo27 T3: JSON inathibitishwa; diff isipogusa lengo (detector) → NOT_ATTEMPTED ni lazima; diff ikigusa lengo → NOT_ATTEMPTED si kweli. */
export function validateDiagnosis(raw: unknown, facts: PrevAttemptFact[]): V<Diagnosis> {
  const e: string[] = [];
  const o = (raw && typeof raw === "object" ? raw : {}) as { cause?: unknown; reason?: unknown };
  if (!(DIAGNOSIS_CAUSES as readonly string[]).includes(String(o.cause))) e.push(`diagnosis.cause: must be one of ${DIAGNOSIS_CAUSES.join("|")} (got ${JSON.stringify(o.cause)})`);
  if (!isOneSentence(o.reason)) e.push("diagnosis.reason: exactly ONE sentence (non-empty, ≤300 chars, no line breaks)");
  const missed = diffMissedTarget(facts);
  if (o.cause === "NOT_ATTEMPTED" && diffTouchedTarget(facts) && !missed) e.push("diagnosis.cause: NOT_ATTEMPTED is false — the harness diff DID touch the target file(s); pick the real cause (e.g. ATTEMPTED_WRONG)");
  if (missed && o.cause !== "NOT_ATTEMPTED" && o.cause !== undefined && (DIAGNOSIS_CAUSES as readonly string[]).includes(String(o.cause))) e.push(`diagnosis.cause: the harness NO-OP detector measured that the diff did NOT touch the target — cause must be NOT_ATTEMPTED (got ${o.cause})`);
  return e.length ? { ok: false, errors: e } : { ok: true, value: { cause: o.cause as DiagnosisCause, reason: String(o.reason).trim() } };
}
/** Kinga ya mwisho (baada ya majaribio yote): detector ndiye mwenye kauli ya mwisho. */
export function enforceDetector(d: Diagnosis, facts: PrevAttemptFact[]): Diagnosis {
  return diffMissedTarget(facts) && d.cause !== "NOT_ATTEMPTED" ? { ...d, cause: "NOT_ATTEMPTED", overriddenBy: "noop-detector" } : d;
}

const PROP_VALUE_RE = /[a-z-]{3,}\s*:\s*[^\s;]/i;
const SHARP_TYPES = new Set(["computed_style", "grep", "file_contains", "contrast_min", "touch_target_min", "dom_exists", "no_horizontal_overflow"]);
function sharpCheck(c: Check): boolean {
  if (!SHARP_TYPES.has(c.type)) return false;
  if (c.type === "computed_style") return !!(c.expected || c.forbidden) && !!c.selector && !!c.property;
  return true;
}
function sameIds(a: string[], b: string[]) { return a.length === b.length && a.every((x) => b.includes(x)); }

/** attempt 2: CO kamili. */
export function validateConcrete(raw: unknown, base: ChangeOrder, reviewMode: ReviewMode): V<ChangeOrder> {
  const v = validateChangeOrder({ ...(raw as object), id: base.id, attempt: base.attempt, mode: "concrete" }, reviewMode);
  if (!v.ok) return { ok: false, errors: v.errors.map((x) => `changeOrder: ${x}`) };
  const co = v.value, e: string[] = [];
  if (!(co.location.files || []).length) e.push("changeOrder.location.files: name the EXACT file(s) to edit");
  if (!String(co.location.selector || "").trim()) e.push("changeOrder.location.selector: the EXACT CSS selector / element");
  if (!PROP_VALUE_RE.test(co.current)) e.push("changeOrder.current: BEFORE state with the exact property and value (e.g. \"text-transform: uppercase\")");
  if (!PROP_VALUE_RE.test(co.desired)) e.push("changeOrder.desired: AFTER state with the exact property and value (e.g. \"text-transform: none\")");
  if (!co.acceptance.some(sharpCheck)) e.push("changeOrder.acceptance: add a SHARPER check that measures the exact value (computed_style with expected/forbidden, grep, file_contains, contrast_min, touch_target_min…)");
  if (!sameIds(co.defectIds, base.defectIds)) e.push(`changeOrder.defectIds: must stay exactly [${base.defectIds.join(", ")}]`);
  return e.length ? { ok: false, errors: e } : { ok: true, value: { ...co, priority: base.priority, decisionIds: base.decisionIds, mode: "concrete" } };
}

/** attempt 3: patch = unified diff AU faili kamili. */
export interface PairPatch { kind: "diff" | "file"; text: string; files: string[] }
export const COMPLETE_FILE_MARK = "*** COMPLETE FILE: ";
export function validatePatch(raw: unknown): V<PairPatch> {
  const o = (raw && typeof raw === "object" ? raw : {}) as { patch?: unknown; file?: unknown; content?: unknown };
  if (typeof o.patch === "string" && o.patch.trim()) {
    let p = o.patch.replace(/^```(?:diff|patch)?\s*\n/, "").replace(/\n```\s*$/, "");
    if (!p.endsWith("\n")) p += "\n";
    const e: string[] = [];
    const files = [...p.matchAll(/^\+\+\+ (?:b\/)?(\S+)/gm)].map((m) => m[1]).filter((f) => f !== "/dev/null");
    if (!/^--- /m.test(p) || !files.length) e.push("patch: unified diff needs '--- a/<path>' and '+++ b/<path>' lines");
    if (!/^@@ -\d+(,\d+)? \+\d+(,\d+)? @@/m.test(p)) e.push("patch: unified diff needs at least one '@@ -l,n +l,n @@' hunk header");
    if (files.some((f) => /^\/|\.\./.test(f))) e.push("patch: paths must be repo-relative (no leading / or ..)");
    return e.length ? { ok: false, errors: e } : { ok: true, value: { kind: "diff", text: p, files } };
  }
  if (typeof o.file === "string" && o.file.trim() && typeof o.content === "string" && o.content.trim()) {
    const f = o.file.trim().replace(/^\.\//, "");
    if (/^\/|\.\./.test(f)) return { ok: false, errors: ["file: must be repo-relative"] };
    return { ok: true, value: { kind: "file", text: `${COMPLETE_FILE_MARK}${f} ***\n${o.content}`, files: [f] } };
  }
  return { ok: false, errors: ["output must be {\"patch\":\"<unified diff>\"} or {\"file\":\"<path>\",\"content\":\"<complete file>\"}"] };
}

/** attempt 4: COs ndogo — faili MOJA na property MOJA kila moja. */
export function computedProps(co: Pick<ChangeOrder, "acceptance">): string[] {
  return [...new Set(co.acceptance.filter((c) => c.type === "computed_style").map((c) => String((c as { property: string }).property).trim().toLowerCase()))];
}
export function validateSplit(raw: unknown, base: ChangeOrder, reviewMode: ReviewMode, nextCoNo: number): V<ChangeOrder[]> {
  const list = (raw && typeof raw === "object" && Array.isArray((raw as { changeOrders?: unknown }).changeOrders)) ? (raw as { changeOrders: unknown[] }).changeOrders : null;
  if (!list || !list.length) return { ok: false, errors: ["output must be {\"changeOrders\":[…]} with ≥1 smaller order"] };
  const e: string[] = [], out: ChangeOrder[] = [];
  list.forEach((c, k) => {
    const id = `CO-${String(nextCoNo + k).padStart(3, "0")}`;
    const v = validateChangeOrder({ ...(c as object), id, attempt: base.attempt, mode: "split" }, reviewMode);
    if (!v.ok) { v.errors.forEach((x) => e.push(`changeOrders[${k}]: ${x}`)); return; }
    const co = v.value;
    if ((co.location.files || []).length !== 1) e.push(`changeOrders[${k}].location.files: exactly ONE file per split order`);
    if (computedProps(co).length > 1) e.push(`changeOrders[${k}].acceptance: ONE property per split order (got ${computedProps(co).join(", ")})`);
    if (!co.defectIds.length || co.defectIds.some((d) => !base.defectIds.includes(d))) e.push(`changeOrders[${k}].defectIds: subset of [${base.defectIds.join(", ")}]`);
    out.push({ ...co, priority: base.priority, mode: "split" });
  });
  const cov = new Set(out.flatMap((c) => c.defectIds));
  for (const d of base.defectIds) if (!cov.has(d)) e.push(`defect ${d} lost in the split — every defect needs ≥1 order`);
  return e.length ? { ok: false, errors: e } : { ok: true, value: out };
}

/** attempt ≥5: kura za reviewers + uamuzi wa Optimus. */
export interface RedecideVote { reviewer: "designer" | "frontend"; vote: RedecideOutcome; reason: string }
export function validateVote(raw: unknown, reviewer: RedecideVote["reviewer"]): V<RedecideVote> {
  const o = (raw && typeof raw === "object" ? raw : {}) as { vote?: unknown; reason?: unknown };
  const e: string[] = [];
  if (!(REDECIDE_OUTCOMES as readonly string[]).includes(String(o.vote))) e.push(`vote: KEEP|MODIFY|WAIVE (got ${JSON.stringify(o.vote)})`);
  if (!String(o.reason ?? "").trim()) e.push("reason: required");
  return e.length ? { ok: false, errors: e } : { ok: true, value: { reviewer, vote: o.vote as RedecideOutcome, reason: String(o.reason).trim().slice(0, 600) } };
}
export interface RedecideDecision { outcome: RedecideOutcome; reason: string; guidance?: string; requirement?: string; changeOrder?: ChangeOrder; approvedBy: string[] }
/** WAIVE: reviewers WOTE + Optimus; sababu ni lazima. KEEP/MODIFY: CO mpya (KEEP = guidance, MODIFY = requirement mpya). */
export function validateRedecide(raw: unknown, votes: RedecideVote[], base: ChangeOrder, reviewMode: ReviewMode): V<RedecideDecision> {
  const o = (raw && typeof raw === "object" ? raw : {}) as { outcome?: unknown; reason?: unknown; guidance?: unknown; requirement?: unknown; changeOrder?: unknown };
  const e: string[] = [];
  const outcome = String(o.outcome) as RedecideOutcome;
  if (!(REDECIDE_OUTCOMES as readonly string[]).includes(outcome)) e.push(`outcome: KEEP|MODIFY|WAIVE (got ${JSON.stringify(o.outcome)})`);
  if (!String(o.reason ?? "").trim()) e.push("reason: mandatory");
  let co: ChangeOrder | undefined;
  if (outcome === "WAIVE") {
    const no = votes.filter((v) => v.vote !== "WAIVE");
    if (votes.length < 2 || no.length) e.push(`outcome WAIVE needs BOTH reviewers' WAIVE votes (${votes.map((v) => `${v.reviewer}: ${v.vote}`).join(", ") || "no votes"}) — choose KEEP or MODIFY`);
  } else if (outcome === "KEEP" || outcome === "MODIFY") {
    if (outcome === "KEEP" && !String(o.guidance ?? "").trim()) e.push("guidance: KEEP needs NEW guidance for the next attempt");
    if (outcome === "MODIFY" && !String(o.requirement ?? "").trim()) e.push("requirement: MODIFY needs the new requirement (it becomes a ledger decision)");
    const v = validateChangeOrder({ ...(o.changeOrder as object), id: base.id, attempt: base.attempt, mode: "redecide" }, reviewMode);
    if (!v.ok) v.errors.forEach((x) => e.push(`changeOrder: ${x}`));
    else if (!sameIds(v.value.defectIds, base.defectIds)) e.push(`changeOrder.defectIds: must stay exactly [${base.defectIds.join(", ")}]`);
    else co = { ...v.value, priority: base.priority, mode: "redecide" };
  }
  if (e.length) return { ok: false, errors: e };
  return { ok: true, value: {
    outcome, reason: String(o.reason).trim().slice(0, 800),
    guidance: outcome === "KEEP" ? String(o.guidance).trim() : undefined, requirement: outcome === "MODIFY" ? String(o.requirement).trim() : undefined,
    changeOrder: co, approvedBy: outcome === "WAIVE" ? ["designer", "frontend", "pm"] : ["pm"],
  } };
}

/* ───────────────────────────── conflicting COs (safi) ───────────────────────────── */

export interface CoConflict { a: string; b: string; selector: string; property: string; values: [string, string] }
const normSel = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toLowerCase();
/** COs mbili zilizokubaliwa zinabadilisha selector+property ileile kwa thamani tofauti (au moja inakataza thamani ya nyingine). */
export function findCoConflicts(cos: ChangeOrder[]): CoConflict[] {
  const seen = new Map<string, { co: string; expected?: string; forbidden?: string }[]>();
  for (const co of cos) for (const c of co.acceptance) {
    if (c.type !== "computed_style") continue;
    const k = `${normSel(c.selector)}|${String(c.property).trim().toLowerCase()}`;
    const l = seen.get(k) || [];
    if (!l.some((x) => x.co === co.id)) l.push({ co: co.id, expected: c.expected?.trim().toLowerCase(), forbidden: c.forbidden?.trim().toLowerCase() });
    seen.set(k, l);
  }
  const out: CoConflict[] = [];
  for (const [k, l] of seen) for (let i = 0; i < l.length; i++) for (let j = i + 1; j < l.length; j++) {
    const x = l[i], y = l[j];
    const clash = (x.expected && y.expected && x.expected !== y.expected) || (x.expected && y.forbidden === x.expected) || (y.expected && x.forbidden === y.expected);
    if (clash) { const [selector, property] = k.split("|"); out.push({ a: x.co, b: y.co, selector, property, values: [x.expected || `≠${x.forbidden}`, y.expected || `≠${y.forbidden}`] }); }
  }
  return out;
}
/** Optimus akishindwa: CO yenye priority ya juu inabaki, nyingine inaunganishwa ndani yake (defects zake hazipotei). */
export function mergeConflictFallback(cos: ChangeOrder[], conflicts: CoConflict[]): ChangeOrder[] {
  let list = cos.slice();
  for (const c of conflicts) {
    const a = list.find((x) => x.id === c.a), b = list.find((x) => x.id === c.b);
    if (!a || !b) continue;
    const [keep, drop] = a.priority < b.priority || (a.priority === b.priority && a.id < b.id) ? [a, b] : [b, a];
    const merged = { ...keep, defectIds: [...new Set([...keep.defectIds, ...drop.defectIds])] };
    list = list.filter((x) => x.id !== drop.id).map((x) => (x.id === keep.id ? merged : x));
  }
  return list;
}

/* ───────────────────────────── prompts ───────────────────────────── */

export type Msg = { role: "system" | "user" | "assistant"; content: string };
const CO_SHAPE = `{"defectIds":["D-001"],"priority":1,"location":{"files":["src/x.css"],"route":"/","selector":".nav a"},"current":"…","desired":"…","visionNote":"…","acceptance":[{"id":"c1","type":"computed_style","route":"/","selector":".nav a","property":"text-transform","expected":"none"}]}`;

function head(i: EscalateCtx): string[] {
  return [i.roundHeader, "", "LOCKED LEDGER (binding):", ...(i.ledgerLines.length ? i.ledgerLines : ["(none)"]), ...(i.planGoal ? ["", `PLAN GOAL: ${i.planGoal}`] : []), ...(i.notes?.length ? ["", "HARNESS NOTES:", ...i.notes.map((n) => `- ${n}`)] : [])];
}
function defectBlock(co: ChangeOrder, defects: Defect[]): string[] {
  return defects.filter((d) => co.defectIds.includes(d.id)).map((d) => `- ${d.id} [${d.severity}] ${d.title} · expected: ${d.expected} · actual: ${d.actual} · attempts so far: ${d.attempts}\n  history: ${(d.history || []).slice(-6).map((h) => `R${h.round} ${h.result} (${String(h.cause).slice(0, 160)})`).join(" | ")}`);
}
export function concretePrompt(i: EscalateCtx, co: ChangeOrder, facts: PrevAttemptFact[]): Msg[] {
  return [
    { role: "system", content: `You are Optimus (PM). A defect FAILED again after a Change Order. First DIAGNOSE why, then REWRITE the order so concretely that it cannot be misread. Reply with ONE JSON object only.` },
    { role: "user", content: [...head(i), "",
      `ESCALATION: attempt ${co.attempt} → mode "concrete".`, "DEFECT(S):", ...defectBlock(co, i.defects), "",
      "PREVIOUS ATTEMPTS (measured by the harness — the NO-OP detector compares the git diff with the target files):", ...(facts.length ? factLines(facts) : ["(no harness record)"]), "",
      "CURRENT ORDER:", JSON.stringify(co), "",
      `diagnosis.cause ∈ ${DIAGNOSIS_CAUSES.join(" | ")}. If the detector says the diff did not touch the target, the cause IS NOT_ATTEMPTED. If the order contradicts a LOCKED ledger decision, the cause is CONFLICT_WITH_DECISION. reason = ONE sentence.`,
      `changeOrder: exact file(s) in location.files, exact selector, "current" = BEFORE with exact property: value, "desired" = AFTER with exact property: value, and a SHARPER acceptance check measuring that exact value. Keep defectIds unchanged.`,
      `Reply: {"diagnosis":{"cause":"…","reason":"one sentence"},"changeOrder":${CO_SHAPE}}`].join("\n") },
  ];
}
export function patchPrompt(i: EscalateCtx, co: ChangeOrder, files: Record<string, string>): Msg[] {
  const fileBlocks = Object.entries(files).map(([p, c]) => `=== FILE ${p} (current, exact) ===\n${c.slice(0, PATCH_FILE_MAX_CHARS)}${c.length > PATCH_FILE_MAX_CHARS ? "\n…(truncated)" : ""}`);
  return [
    { role: "system", content: "You are Vextron, the Frontend Engineer. The Computer failed to fix this defect twice. Write the EXACT fix yourself as a minimal unified diff against the files shown (or one complete file). Reply with ONE JSON object only." },
    { role: "user", content: [...head(i), "", `ESCALATION: attempt ${co.attempt} → mode "pair_patch".`, "DEFECT(S):", ...defectBlock(co, i.defects), "", "ORDER:", JSON.stringify(co), "",
      ...(fileBlocks.length ? fileBlocks : ["(target files could not be read — write a complete file)"]), "",
      "Rules: change ONLY what the order needs; respect every LOCKED decision; context lines must match the current file EXACTLY (the harness runs `git apply --check`); paths repo-relative.",
      `Reply: {"patch":"--- a/<path>\\n+++ b/<path>\\n@@ -l,n +l,n @@\\n …"}  OR  {"file":"<path>","content":"<complete new file>"}`].join("\n") },
  ];
}
export function splitPrompt(i: EscalateCtx, co: ChangeOrder, facts: PrevAttemptFact[]): Msg[] {
  return [
    { role: "system", content: "You are Optimus (PM). This defect failed three times. SPLIT the order into the smallest independent orders: ONE file and ONE property each. Reply with ONE JSON object only." },
    { role: "user", content: [...head(i), "", `ESCALATION: attempt ${co.attempt} → mode "split". The Computer must REPRODUCE (measure the current state) before fixing each one.`, "DEFECT(S):", ...defectBlock(co, i.defects), "",
      "PREVIOUS ATTEMPTS:", ...(facts.length ? factLines(facts) : ["(none)"]), "", "ORDER TO SPLIT:", JSON.stringify(co), "",
      `Each order: exactly one file in location.files, at most one computed_style property, defectIds ⊂ [${co.defectIds.join(", ")}], "current" = what to MEASURE first (e.g. "measure getComputedStyle(.x).width at 375px — expected currently > 375px").`,
      `Reply: {"changeOrders":[${CO_SHAPE}, …]}`].join("\n") },
  ];
}
export function votePrompt(i: EscalateCtx, co: ChangeOrder, facts: PrevAttemptFact[], reviewer: RedecideVote["reviewer"], prior: RedecideVote[]): Msg[] {
  const who = reviewer === "designer" ? "Ultron (Designer, reviewer)" : "Vextron (Frontend Engineer, reviewer)";
  return [
    { role: "system", content: `You are ${who}. A defect has failed ${co.attempt - 1} fix attempts (concrete order, exact patch and split were all tried). The team must RE-DECIDE. Reply with ONE JSON object only.` },
    { role: "user", content: [...head(i), "", "DEFECT(S):", ...defectBlock(co, i.defects), "", "ATTEMPTS:", ...factLines(facts), "", "LAST ORDER:", JSON.stringify(co), "",
      ...(prior.length ? ["EARLIER TURNS:", ...prior.map((v) => `- ${v.reviewer}: ${v.vote} — ${v.reason}`), ""] : []),
      "Vote KEEP (try again with new guidance — say what), MODIFY (the requirement itself must change — say how; it becomes a ledger decision) or WAIVE (accept the deviation; only if it is harmless/blocked by a locked decision and fixing it is not worth more rounds).",
      `Reply: {"vote":"KEEP|MODIFY|WAIVE","reason":"…"}`].join("\n") },
  ];
}
export function decidePrompt(i: EscalateCtx, co: ChangeOrder, facts: PrevAttemptFact[], votes: RedecideVote[]): Msg[] {
  return [
    { role: "system", content: "You are Optimus (PM). Close the re-decision for this defect. Reply with ONE JSON object only." },
    { role: "user", content: [...head(i), "", "DEFECT(S):", ...defectBlock(co, i.defects), "", "ATTEMPTS:", ...factLines(facts), "", "LAST ORDER:", JSON.stringify(co), "",
      "REVIEWER VOTES:", ...votes.map((v) => `- ${v.reviewer}: ${v.vote} — ${v.reason}`), "",
      "Rules: WAIVE is allowed ONLY if BOTH reviewers voted WAIVE; reason is mandatory and goes into the final report. KEEP → new guidance + a new changeOrder. MODIFY → the new requirement (recorded as a ledger decision) + a changeOrder implementing it. Keep defectIds unchanged.",
      `Reply: {"outcome":"KEEP|MODIFY|WAIVE","reason":"…","guidance":"(KEEP)","requirement":"(MODIFY)","changeOrder":${CO_SHAPE} (omit for WAIVE)}`].join("\n") },
  ];
}
export function conflictPrompt(i: EscalateCtx, cos: ChangeOrder[], conflicts: CoConflict[]): Msg[] {
  return [
    { role: "system", content: "You are Optimus (PM). Two accepted Change Orders would change the SAME selector/property in opposite ways. Resolve them BEFORE they go to the Computer. Reply with ONE JSON object only." },
    { role: "user", content: [...head(i), "", "CONFLICTS:", ...conflicts.map((c) => `- ${c.a} vs ${c.b}: ${c.selector} { ${c.property} } → ${c.values[0]} vs ${c.values[1]}`), "", "ORDERS:", ...cos.map((c) => JSON.stringify(c)), "",
      "Return the replacement orders for exactly these orders: the union of their defectIds must be preserved, and no two orders may set the same selector/property differently (follow the LOCKED ledger).",
      `Reply: {"changeOrders":[${CO_SHAPE}, …]}`].join("\n") },
  ];
}

/* ───────────────────────────── orchestration ───────────────────────────── */

export interface EscalateCtx {
  milestoneId: string;
  /** raundi INAYOFUATA (COs hizi zitatekelezwa humo) */
  round: number;
  reviewMode: ReviewMode;
  defects: Defect[];
  ledgerLines: string[];
  roundHeader: string;
  planGoal?: string;
  notes?: string[];
}
export interface EscalateDeps {
  complete: (agent: "pm" | "designer" | "frontend", purpose: string, messages: Msg[]) => Promise<string>;
  readFiles?: (paths: string[]) => Promise<Record<string, string>>;
  log?: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
}
export interface EscalationEvent {
  coId: string;
  resultIds: string[];
  defectIds: string[];
  attempt: number;
  mode: ChangeOrderMode;
  valid: boolean;
  tries: number;
  errors: string[];
  diagnosis?: Diagnosis;
  patch?: { kind: PairPatch["kind"]; files: string[]; chars: number };
  laneSwitch?: string;
  redecide?: { outcome: RedecideOutcome; reason: string; votes: RedecideVote[]; turns: number; guidance?: string; requirement?: string; approvedBy: string[] };
}
export interface Waiver { defectId: string; title: string; severity: string; round: number; reason: string; approvedBy: string[]; votes: RedecideVote[]; at: string }
export interface Amendment { id: string; defectId: string; round: number; requirement: string; reason: string; at: string }
export interface EscalateResult { changeOrders: ChangeOrder[]; events: EscalationEvent[]; waivers: Waiver[]; amendments: Amendment[]; conflicts: { found: CoConflict[]; resolvedBy: "none" | "optimus" | "fallback-merge"; errors: string[] }; nextCoNo: number }

async function tryJson<T>(deps: EscalateDeps, agent: "pm" | "designer" | "frontend", purpose: string, msgs: Msg[], validate: (raw: unknown) => V<T>): Promise<{ value: T | null; tries: number; errors: string[] }> {
  let m = msgs, errors: string[] = ["not run"];
  for (let t = 1; t <= ESCALATION_MAX_TRIES; t++) {
    let raw = "";
    try { raw = await deps.complete(agent, `${purpose}:a${t}`, m); } catch (e: any) { errors = [`LLM call failed: ${String(e?.message || e).slice(0, 200)}`]; continue; }
    let parsed: unknown;
    try { parsed = extractJson(raw); } catch (e: any) { errors = [`invalid JSON: ${String(e?.message || e).slice(0, 160)}`]; m = [...msgs, { role: "assistant", content: raw.slice(0, 20_000) }, { role: "user", content: `Not valid JSON. Reply with the JSON object only.` }]; continue; }
    const v = validate(parsed);
    if (v.ok) return { value: v.value, tries: t, errors: [] };
    errors = v.errors;
    deps.log?.("warning", `🪜 ${purpose} try ${t}: ${errors.slice(0, 3).join("; ").slice(0, 300)}`);
    m = [...msgs, { role: "assistant", content: raw.slice(0, 20_000) }, { role: "user", content: `Your output is not valid. Fix EVERY error and reply with the complete corrected JSON only:\n${errors.map((x) => `- ${x}`).join("\n")}` }];
  }
  return { value: null, tries: ESCALATION_MAX_TRIES, errors };
}

/**
 * COs zilizo-consolidate (attempt tayari imehesabiwa) → COs za mwisho kwa kila ngazi ya ladder.
 * `facts[defectId]` = majaribio yaliyopita kama yalivyopimwa na harness. Kosa la LLM halisimamishi raundi:
 * CO ya awali inabaki (event.valid=false, inarekodiwa) — isipokuwa redecide (fallback = KEEP bila mabadiliko).
 */
export async function escalateChangeOrders(ctx: EscalateCtx, cos: ChangeOrder[], facts: Record<string, PrevAttemptFact[]>, nextCoNo: number, deps: EscalateDeps): Promise<EscalateResult> {
  const out: ChangeOrder[] = [], events: EscalationEvent[] = [], waivers: Waiver[] = [], amendments: Amendment[] = [];
  let no = nextCoNo;
  const now = () => new Date().toISOString();
  for (const co0 of cos) {
    const mode = modeForAttempt(co0.attempt);
    const f = co0.defectIds.flatMap((d) => facts[d] || []).filter((x, k, a) => a.findIndex((y) => y.round === x.round && y.orderId === x.orderId) === k);
    const P = `escalate:${ctx.milestoneId}:R${ctx.round}:${co0.id}`;
    const ev: EscalationEvent = { coId: co0.id, resultIds: [co0.id], defectIds: co0.defectIds, attempt: co0.attempt, mode, valid: true, tries: 0, errors: [] };
    if (mode === "standard") { out.push({ ...co0, mode: "standard" }); continue; }
    if (mode === "concrete") {
      const r = await tryJson(deps, "pm", `${P}:concrete`, concretePrompt(ctx, co0, f), (raw) => {
        const o = (raw && typeof raw === "object" ? raw : {}) as { diagnosis?: unknown; changeOrder?: unknown };
        const d = validateDiagnosis(o.diagnosis, f), c = validateConcrete(o.changeOrder, co0, ctx.reviewMode);
        if (!d.ok || !c.ok) return { ok: false, errors: [...(d.ok ? [] : d.errors), ...(c.ok ? [] : c.errors)] };
        return { ok: true, value: { d: d.value, c: c.value } };
      });
      ev.tries = r.tries;
      if (r.value) { const d = enforceDetector(r.value.d, f); ev.diagnosis = d; out.push({ ...r.value.c, diagnosis: { cause: d.cause, note: d.reason } }); }
      else { ev.valid = false; ev.errors = r.errors; const d = enforceDetector({ cause: diffMissedTarget(f) ? "NOT_ATTEMPTED" : "ATTEMPTED_WRONG", reason: "diagnosis by the harness detector (Optimus output invalid)." }, f); ev.diagnosis = d; out.push({ ...co0, mode: "concrete", diagnosis: { cause: d.cause, note: d.reason } }); }
    } else if (mode === "pair_patch") {
      const files = (co0.location.files || []).slice(0, 3);
      let contents: Record<string, string> = {};
      try { contents = files.length && deps.readFiles ? await deps.readFiles(files) : {}; } catch { contents = {}; }
      const r = await tryJson(deps, "frontend", `${P}:patch`, patchPrompt(ctx, co0, contents), validatePatch);
      ev.tries = r.tries;
      if (r.value) { ev.patch = { kind: r.value.kind, files: r.value.files, chars: r.value.text.length }; out.push({ ...co0, mode: "pair_patch", patch: r.value.text }); }
      else { ev.valid = false; ev.errors = r.errors; out.push({ ...co0, mode: "pair_patch" }); }
    } else if (mode === "split") {
      ev.laneSwitch = LANE_SWITCH_SKIPPED;
      const r = await tryJson(deps, "pm", `${P}:split`, splitPrompt(ctx, co0, f), (raw) => validateSplit(raw, co0, ctx.reviewMode, no));
      ev.tries = r.tries;
      if (r.value) { no += r.value.length; ev.resultIds = r.value.map((c) => c.id); out.push(...r.value); }
      else { ev.valid = false; ev.errors = r.errors; out.push({ ...co0, mode: "split" }); }
    } else {
      const votes: RedecideVote[] = [];
      let turns = 0;
      for (const who of ["designer", "frontend"] as const) {
        const r = await tryJson(deps, who, `${P}:vote-${who}`, votePrompt(ctx, co0, f, who, votes), (raw) => validateVote(raw, who));
        turns++;
        if (r.value) votes.push(r.value); else ev.errors.push(...r.errors.map((x) => `${who}: ${x}`));
      }
      const r = await tryJson(deps, "pm", `${P}:decide`, decidePrompt(ctx, co0, f, votes), (raw) => validateRedecide(raw, votes, co0, ctx.reviewMode));
      turns++;
      ev.tries = r.tries;
      const dec: RedecideDecision = r.value || { outcome: "KEEP", reason: `fallback KEEP — Optimus decision invalid: ${r.errors.slice(0, 2).join("; ").slice(0, 300)}`, guidance: "retry the last order unchanged", changeOrder: { ...co0, mode: "redecide" }, approvedBy: [] };
      if (!r.value) { ev.valid = false; ev.errors.push(...r.errors); }
      ev.redecide = { outcome: dec.outcome, reason: dec.reason, votes, turns, guidance: dec.guidance, requirement: dec.requirement, approvedBy: dec.approvedBy };
      if (dec.outcome === "WAIVE") {
        for (const id of co0.defectIds) { const d = ctx.defects.find((x) => x.id === id); waivers.push({ defectId: id, title: d?.title || "", severity: d?.severity || "", round: ctx.round - 1, reason: dec.reason, approvedBy: dec.approvedBy, votes, at: now() }); }
        ev.resultIds = [];
      } else {
        if (dec.outcome === "MODIFY") for (const id of co0.defectIds) amendments.push({ id: `AM-${ctx.milestoneId}-R${ctx.round - 1}-${id}`, defectId: id, round: ctx.round - 1, requirement: dec.requirement || "", reason: dec.reason, at: now() });
        out.push(dec.changeOrder!);
      }
    }
    events.push(ev);
  }
  // conflicting COs → Optimus anasuluhisha kabla ya kutuma
  const found = findCoConflicts(out);
  let finalCos = out, resolvedBy: EscalateResult["conflicts"]["resolvedBy"] = "none", cErrors: string[] = [];
  if (found.length) {
    const ids = [...new Set(found.flatMap((c) => [c.a, c.b]))];
    const involved = out.filter((c) => ids.includes(c.id));
    const union = [...new Set(involved.flatMap((c) => c.defectIds))];
    const r = await tryJson(deps, "pm", `escalate:${ctx.milestoneId}:R${ctx.round}:conflicts`, conflictPrompt(ctx, involved, found), (raw) => {
      const list = (raw && typeof raw === "object" && Array.isArray((raw as { changeOrders?: unknown }).changeOrders)) ? (raw as { changeOrders: unknown[] }).changeOrders : null;
      if (!list?.length) return { ok: false, errors: ["changeOrders: non-empty array required"] };
      const e: string[] = [], res: ChangeOrder[] = [];
      list.forEach((c, k) => {
        const keep = involved[k] || involved[0];
        const v = validateChangeOrder({ ...(c as object), id: k < involved.length ? keep.id : `CO-${String(no + k - involved.length).padStart(3, "0")}`, attempt: Math.max(...involved.map((x) => x.attempt)), mode: (c as { mode?: string })?.mode && (CO_MODES as readonly string[]).includes(String((c as { mode?: string }).mode)) ? (c as { mode: string }).mode : keep.mode }, ctx.reviewMode);
        if (!v.ok) v.errors.forEach((x) => e.push(`changeOrders[${k}]: ${x}`)); else res.push({ ...v.value, patch: keep.patch, diagnosis: keep.diagnosis });
      });
      const cov = new Set(res.flatMap((c) => c.defectIds));
      for (const d of union) if (!cov.has(d)) e.push(`defect ${d} lost — keep the union of defectIds`);
      if (!e.length && findCoConflicts([...out.filter((c) => !ids.includes(c.id)), ...res]).length) e.push("orders still set the same selector/property differently");
      return e.length ? { ok: false, errors: e } : { ok: true, value: res };
    });
    if (r.value) { finalCos = [...out.filter((c) => !ids.includes(c.id)), ...r.value]; no += Math.max(0, r.value.length - involved.length); resolvedBy = "optimus"; }
    else { finalCos = mergeConflictFallback(out, found); resolvedBy = "fallback-merge"; cErrors = r.errors; }
    deps.log?.(resolvedBy === "optimus" ? "success" : "warning", `🪜 ${ctx.milestoneId} R${ctx.round}: ${found.length} conflicting CO pair(s) (${found.map((c) => `${c.a}/${c.b} ${c.property}`).join(", ")}) → ${resolvedBy}`);
  }
  return { changeOrders: finalCos.sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id)), events, waivers, amendments, conflicts: { found, resolvedBy, errors: cErrors }, nextCoNo: no };
}

/** Defect.history: diagnosis, mode na matokeo (maelezo27 — kila escalation). */
export function applyEscalationToDefects(defects: Defect[], r: Pick<EscalateResult, "events" | "waivers" | "amendments">, round: number): Defect[] {
  return defects.map((d) => {
    const evs = r.events.filter((e) => e.defectIds.includes(d.id));
    const w0 = r.waivers.some((x) => x.defectId === d.id), a0 = r.amendments.some((x) => x.defectId === d.id);
    if (!evs.length && !w0 && !a0) return d;
    const entries = evs.map((e) => ({
      round, result: `ESCALATED attempt ${e.attempt} (${MODE_LABEL[e.mode]})${e.redecide ? ` → ${e.redecide.outcome}` : ""} → ${e.resultIds.join(", ") || "no order"}${e.valid ? "" : " [escalation output invalid — fallback]"}`,
      cause: [e.diagnosis ? `diagnosis ${e.diagnosis.cause}: ${e.diagnosis.reason}${e.diagnosis.overriddenBy ? " (forced by NO-OP detector)" : ""}` : "", e.patch ? `patch ${e.patch.kind} ${e.patch.files.join(", ")}` : "", e.laneSwitch || "", e.redecide ? `${e.redecide.outcome}: ${e.redecide.reason}` : ""].filter(Boolean).join(" · "),
      mode: e.mode, ...(e.diagnosis ? { diagnosis: e.diagnosis } : {}), ...(e.redecide ? { outcome: e.redecide.outcome } : {}), ...(e.laneSwitch ? { laneSwitch: e.laneSwitch } : {}),
    }));
    const w = r.waivers.find((x) => x.defectId === d.id);
    const a = r.amendments.find((x) => x.defectId === d.id);
    return { ...d, ...(w ? { status: "WAIVED" as const } : {}), ...(a ? { expected: a.requirement } : {}), history: [...(d.history || []), ...entries] };
  });
}
export const amendmentLine = (a: Amendment) => `- ${a.id} [AMENDED by redecide R${a.round}, ${a.defectId}] ${a.requirement.replace(/\s+/g, " ").slice(0, 300)}`;
