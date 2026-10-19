// TASK 26 (maelezo26) — Raundi za uthibitisho (VERIFYING): baada ya kila raundi ya marekebisho evidence inakusanywa upya,
// kisha reviewers WAWILI TU (Ultron = designer, Vextron = frontend) wanathibitisha — si Board nzima.
//  · Kila reviewer PEKE YAKE: kwa kila CO → PASS|FAIL|PARTIAL + evidence ids, pamoja na regressions[] na newDefects[].
//    Wote wanapewa RoundHeader + OCB (stage REVIEW_VERIFY).
//  · decide(...) (SAFI): CO = PASS TU ikiwa reviewers WOTE WAWILI wanasema PASS NA acceptance checks zake zote PASS.
//    Check FAIL/ERROR → FAIL (reviewers hawawezi kuipindua). Reviewer akiona tatizo ingawa check imepita → defect MPYA
//    + check MPYA (zinarekodiwa). Reviewers wakitofautiana → zamu MOJA fupi ya sync kati yao; bado wanatofautiana → FAIL.
//  · decideNext(state) (SAFI): SIGN_OFF | CONTINUE | CAP_REACHED | BLOCKED.
//  · roundOutcome(...) (SAFI): raundi ilipunguza defects wazi → BEST (git tag); iliongeza au ilileta regression → REVERT.
// Behind XMD_MILESTONES (inaitwa na loop.ts tu).
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { AGENTS } from "@/lib/agents";
import { brokerComplete, type CompleteResult } from "@/lib/broker";
import { buildOCB } from "./ocb";
import { classifyEvidence, domLines, extractJson, formatRoundHeader, REVIEW_STALL_FIRST_MS, REVIEWERS, type DefectFinding, type DomJson, type ReviewContext, type ReviewDeps, type ReviewerId, type ReviewImage } from "./review";
import { DEFECT_SEVERITIES, type ChangeOrder, type Defect, type DefectSeverity, type EvidenceCheckResult, type EvidencePack, type RoundHeaderData } from "./types";

type Msg = { role: string; content?: unknown };

export const VERIFY_VERDICTS = ["PASS", "FAIL", "PARTIAL"] as const;
export type VerifyVerdict = (typeof VERIFY_VERDICTS)[number];
export const NEXT_ACTIONS = ["SIGN_OFF", "CONTINUE", "CAP_REACHED", "BLOCKED"] as const;
export type NextAction = (typeof NEXT_ACTIONS)[number];

export interface ReviewerCoVerdict { orderId: string; verdict: VerifyVerdict; evidence: string[]; note: string }
export interface VerifyFindings {
  reviewer: ReviewerId;
  cos: ReviewerCoVerdict[];
  /** kitu kilichokuwa kinafanya kazi kabla ya raundi hii na sasa kimevunjika */
  regressions: DefectFinding[];
  /** matatizo mapya (si ya COs za raundi hii) */
  newDefects: DefectFinding[];
  /** reviewer anaomba mjadala wa timu nzima (vinginevyo hakuna — maelezo26 #2) */
  requestDiscussion?: { reason: string } | null;
  notes: string;
}
export type CheckTally = { pass: number; fail: number; error: number };

/* ================================ decide (SAFI) ================================ */

export interface DecideInput {
  orderIds: string[];
  /** acceptance checks kwa kila CO (summarizeChecks ya task 25) */
  checks: Record<string, CheckTally | undefined>;
  designer: VerifyFindings | null;
  frontend: VerifyFindings | null;
  /** majibu ya zamu ya sync (CO zilizotofautiana TU) */
  sync?: Partial<Record<ReviewerId, Record<string, VerifyVerdict>>>;
}
export interface DecidedCo {
  orderId: string;
  verdict: "PASS" | "FAIL";
  reason: string;
  designer: VerifyVerdict | null;
  frontend: VerifyVerdict | null;
  checks: CheckTally;
  /** verdicts za mwanzo zilitofautiana (PASS dhidi ya isiyo PASS) */
  disagreement: boolean;
  /** baada ya sync bado wanatofautiana */
  unresolved: boolean;
  /** reviewers wote PASS lakini check FAIL/ERROR ilipindua */
  checkOverride: boolean;
}
export interface Concern { orderId: string; reviewer: ReviewerId; verdict: VerifyVerdict; note: string; evidence: string[] }
export interface Decision {
  cos: DecidedCo[];
  /** reviewer aliona tatizo ingawa checks zote za CO zilipita → defect MPYA + check MPYA */
  concerns: Concern[];
  newDefects: (DefectFinding & { by: ReviewerId[] })[];
  regressions: (DefectFinding & { by: ReviewerId[] })[];
  disagreements: string[];
  allPass: boolean;
}

const verdictOf = (f: VerifyFindings | null, id: string): ReviewerCoVerdict | null => f?.cos.find((c) => c.orderId === id) ?? null;
const zero = (): CheckTally => ({ pass: 0, fail: 0, error: 0 });

/** CO ambazo verdicts za mwanzo zinatofautiana (PASS dhidi ya FAIL/PARTIAL) → zamu ya sync. FAIL vs PARTIAL si tofauti. */
export function disagreements(orderIds: string[], designer: VerifyFindings | null, frontend: VerifyFindings | null): string[] {
  if (!designer || !frontend) return [];
  return orderIds.filter((id) => {
    const a = verdictOf(designer, id)?.verdict, b = verdictOf(frontend, id)?.verdict;
    return !!a && !!b && (a === "PASS") !== (b === "PASS");
  });
}

const STOP = new Set(["a", "an", "the", "on", "at", "in", "of", "to", "is", "and", "or", "for", "with", "not", "no", "are", "be", "its"]);
const words = (t: string) => new Set(String(t).toLowerCase().split(/[^a-z0-9#.]+/).filter((w) => w && !STOP.has(w)));
/** Ufanano wa vichwa (Jaccard ya maneno) — reviewers wawili huandika tatizo lilelile kwa maneno tofauti (T4 halisi). */
export function titleSimilarity(a: string, b: string): number {
  const A = words(a), B = words(b);
  const inter = [...A].filter((w) => B.has(w)).length;
  return A.size + B.size ? inter / (A.size + B.size - inter) : 0;
}
export const SAME_FINDING_SIMILARITY = 0.5;
/** Unganisha findings za wawili: title+area sawa, AU (reviewer mwingine) vichwa vinafanana ≥ 0.5 → moja yenye `by` mbili. */
function mergeFindings(list: { r: ReviewerId; d: DefectFinding }[]): (DefectFinding & { by: ReviewerId[] })[] {
  const out: (DefectFinding & { by: ReviewerId[] })[] = [];
  const key = (d: DefectFinding) => `${d.title.trim().toLowerCase()}|${d.area.trim().toLowerCase()}`;
  for (const { r, d } of list) {
    const k = key(d);
    const hit = out.find((x) => key(x) === k) || out.find((x) => !x.by.includes(r) && titleSimilarity(x.title, d.title) >= SAME_FINDING_SIMILARITY);
    if (hit) {
      if (!hit.by.includes(r)) hit.by.push(r);
      hit.evidence = [...new Set([...hit.evidence, ...d.evidence])];
      if (DEFECT_SEVERITIES.indexOf(d.severity) < DEFECT_SEVERITIES.indexOf(hit.severity)) hit.severity = d.severity;
    } else out.push({ ...d, evidence: [...d.evidence], by: [r] });
  }
  return out;
}

/** maelezo26 #2 — uamuzi wa raundi kwa kila CO. Hakuna LLM hapa. */
export function decide(i: DecideInput): Decision {
  const disputed = disagreements(i.orderIds, i.designer, i.frontend);
  const concerns: Concern[] = [];
  const cos = i.orderIds.map((id): DecidedCo => {
    const ck = i.checks[id] || zero();
    const d0 = verdictOf(i.designer, id), f0 = verdictOf(i.frontend, id);
    const d = i.sync?.designer?.[id] ?? d0?.verdict ?? null;
    const f = i.sync?.frontend?.[id] ?? f0?.verdict ?? null;
    const disagreement = disputed.includes(id);
    const unresolved = disagreement && (d === "PASS") !== (f === "PASS");
    const checksRan = ck.pass + ck.fail + ck.error > 0;
    const checksOk = checksRan && ck.fail === 0 && ck.error === 0;
    const bothPass = d === "PASS" && f === "PASS";
    let reason: string;
    if (!d || !f) reason = `no verdict from ${!d && !f ? "both reviewers" : !d ? "designer" : "frontend"}`;
    else if (!checksRan) reason = "acceptance checks did not run";
    else if (!checksOk) reason = `acceptance checks ${ck.fail} FAIL / ${ck.error} ERROR${bothPass ? " — overrides both reviewers' PASS" : ""}`;
    else if (unresolved) reason = `reviewers disagree after sync (designer ${d}, frontend ${f})`;
    else if (!bothPass) reason = `reviewer verdicts designer ${d}, frontend ${f}`;
    else reason = `both reviewers PASS · checks ${ck.pass} PASS${disagreement ? " (agreed after sync)" : ""}`;
    // reviewer anaona tatizo ingawa checks zote zilipita → defect MPYA + check MPYA
    if (checksOk) for (const [r, v, raw] of [["designer", d, d0], ["frontend", f, f0]] as const) {
      if (v && v !== "PASS") concerns.push({ orderId: id, reviewer: r, verdict: v, note: raw?.note || "", evidence: raw?.evidence || [] });
    }
    return {
      orderId: id, verdict: bothPass && checksOk ? "PASS" : "FAIL", reason, designer: d, frontend: f, checks: ck,
      disagreement, unresolved, checkOverride: bothPass && checksRan && !checksOk,
    };
  });
  const both = REVIEWERS.map((r) => [r, r === "designer" ? i.designer : i.frontend] as const);
  const newDefects = mergeFindings(both.flatMap(([r, f]) => (f?.newDefects || []).map((d) => ({ r, d }))));
  const regressions = mergeFindings(both.flatMap(([r, f]) => (f?.regressions || []).map((d) => ({ r, d }))));
  return { cos, concerns, newDefects, regressions, disagreements: disputed, allPass: cos.length > 0 && cos.every((c) => c.verdict === "PASS") };
}

/* ============================== decideNext (SAFI) ============================== */

export interface NextState {
  round: number;
  maxRounds: number;
  /** verdicts za COs za raundi hii (decide) */
  cos: Pick<DecidedCo, "orderId" | "verdict">[];
  /** reviewers wote wawili walirudisha JSON halali */
  reviewersValid: boolean;
  /** checks zote za raundi (acceptance + global) */
  checks: CheckTally;
  /** defects wazi za milestone BAADA ya raundi (pamoja na mpya) */
  openDefects: { id: string; severity: DefectSeverity }[];
  /** minor zilizoorodheshwa ambazo zinaruhusiwa kubaki (task 28) */
  listedMinor: string[];
  /** receipts zinalingana na git diff (bila flags za task 25) */
  receiptsMatch: boolean;
  /** sababu ya kusimama (mf. consolidation batili) */
  blocked?: string;
}
export interface NextDecision { next: NextAction; reason: string; leftoverMinor: string[] }

const SEV_MEDIUM_UP: DefectSeverity[] = ["blocker", "major", "medium"];

/** maelezo26 #3. SIGN_OFF TU ikiwa: reviewers wote PASS kila kitu · checks zote PASS · hakuna defect wazi ≥ medium ·
 *  receipts = diffs · minor zilizobaki zimeorodheshwa. round == max na bado kuna kasoro → CAP_REACHED. */
export function decideNext(s: NextState): NextDecision {
  const majors = s.openDefects.filter((d) => SEV_MEDIUM_UP.includes(d.severity));
  const minors = s.openDefects.filter((d) => d.severity === "minor");
  const unlisted = minors.filter((d) => !s.listedMinor.includes(d.id));
  const leftoverMinor = minors.filter((d) => s.listedMinor.includes(d.id)).map((d) => d.id);
  if (s.blocked) return { next: "BLOCKED", reason: s.blocked, leftoverMinor };
  if (!s.reviewersValid) return { next: "BLOCKED", reason: "a reviewer returned no valid verification — the round cannot be judged", leftoverMinor };
  const why: string[] = [];
  const failed = s.cos.filter((c) => c.verdict !== "PASS").map((c) => c.orderId);
  if (!s.cos.length) why.push("no change orders were verified");
  if (failed.length) why.push(`COs not PASS: ${failed.join(", ")}`);
  if (s.checks.fail || s.checks.error) why.push(`checks ${s.checks.fail} FAIL / ${s.checks.error} ERROR`);
  if (majors.length) why.push(`open defects ≥ medium: ${majors.map((d) => `${d.id} (${d.severity})`).join(", ")}`);
  if (unlisted.length) why.push(`unlisted minor defects: ${unlisted.map((d) => d.id).join(", ")}`);
  if (!s.receiptsMatch) why.push("receipts do not match the diffs");
  if (!why.length) return { next: "SIGN_OFF", reason: `all ${s.cos.length} CO(s) PASS · checks ${s.checks.pass} PASS · no open defect ≥ medium · receipts match${leftoverMinor.length ? ` · listed minor left: ${leftoverMinor.join(", ")}` : ""}`, leftoverMinor };
  if (s.round >= s.maxRounds) return { next: "CAP_REACHED", reason: `round ${s.round}/${s.maxRounds} — ${why.join(" · ")}`, leftoverMinor };
  return { next: "CONTINUE", reason: why.join(" · "), leftoverMinor };
}

/* ======================== round outcome → git (SAFI) ======================== */

export type RoundOutcome = "BEST" | "REVERT" | "SAME";
/** maelezo26 #6: defects wazi zilipungua → BEST (tag); ziliongezeka AU kuna regression → REVERT; vinginevyo SAME. */
export function roundOutcome(o: { openBefore: number; openAfter: number; regressions: number }): { outcome: RoundOutcome; reason: string } {
  if (o.regressions > 0) return { outcome: "REVERT", reason: `${o.regressions} regression(s)` };
  if (o.openAfter > o.openBefore) return { outcome: "REVERT", reason: `open defects ${o.openBefore} → ${o.openAfter}` };
  if (o.openAfter < o.openBefore) return { outcome: "BEST", reason: `open defects ${o.openBefore} → ${o.openAfter}` };
  return { outcome: "SAME", reason: `open defects unchanged (${o.openAfter})` };
}
export const revertNote = (round: number, why: string) => `round ${round} reverted: made things worse (${why})`;

/* ===================== defect ledger baada ya verify (SAFI) ===================== */

export const OPEN_STATUSES = ["OPEN", "IN_FIX", "REOPENED"] as const;
export const isOpenDefect = (d: Pick<Defect, "status">) => (OPEN_STATUSES as readonly string[]).includes(d.status);

/** sababu ya defect mpya inayotokana na concern (tatizo lilelile la CO, check haikulipima) — haihesabiwi kama "made things worse" */
export const CHECK_MISSED_IT = "CHECK_MISSED_IT";
export interface VerifyDefectsResult { defects: Defect[]; added: Defect[]; fixed: string[]; reopened: string[]; duplicates: { title: string; of: string }[] }
/**
 * CO zote za defect PASS → VERIFIED_FIXED; vinginevyo REOPENED. Defects MPYA: newDefects + regressions + concerns
 * (concern = reviewer aliona tatizo ingawa check ilipita → defect mpya inayohitaji check mpya). `reverted` = raundi
 * imerudishwa nyuma (git revert) → defects za raundi zinarudi REOPENED na mpya hazihesabiwi (code yao imeondolewa).
 */
export function applyVerifyToDefects(defects: Defect[], o: {
  milestoneId: string; round: number; changeOrders: ChangeOrder[]; decision: Decision; reverted?: string;
}): VerifyDefectsResult {
  const byCo = new Map(o.decision.cos.map((c) => [c.orderId, c]));
  const fixed: string[] = [], reopened: string[] = [];
  const next = defects.map((d) => {
    const cos = o.changeOrders.filter((co) => co.defectIds.includes(d.id));
    if (!cos.length || d.milestoneId !== o.milestoneId) return d;
    const res = cos.map((co) => byCo.get(co.id));
    const pass = !o.reverted && res.every((c) => c?.verdict === "PASS");
    (pass ? fixed : reopened).push(d.id);
    const line = cos.map((co) => { const c = byCo.get(co.id); return `${co.id} ${c ? `${c.verdict} (designer ${c.designer ?? "-"}, frontend ${c.frontend ?? "-"}, checks ${c.checks.pass}P/${c.checks.fail}F/${c.checks.error}E)` : "NO_VERDICT"}`; }).join("; ");
    return {
      ...d, status: pass ? "VERIFIED_FIXED" as const : "REOPENED" as const,
      history: [...(d.history || []), { round: o.round, result: `verify: ${line}${o.reverted ? ` · ${o.reverted}` : ""}`, cause: pass ? "VERIFIED_FIXED" : o.reverted ? "REVERTED" : res.find((c) => c && c.verdict !== "PASS")?.reason || "no verdict" }],
    };
  });
  if (o.reverted) return { defects: next, added: [], fixed, reopened, duplicates: [] };
  let n = defects.reduce((m, d) => Math.max(m, Number(String(d.id).slice(2)) || 0), 0);
  const mk = (f: Pick<DefectFinding, "title" | "area" | "severity" | "evidence" | "expected" | "actual">, by: ReviewerId[], cause: string): Defect => ({
    id: `D-${String(++n).padStart(3, "0")}`, milestoneId: o.milestoneId, foundInRound: o.round, reportedBy: by, area: f.area, severity: f.severity,
    title: f.title, evidence: f.evidence, expected: f.expected, actual: f.actual, status: "OPEN", attempts: 0,
    history: [{ round: o.round, result: `found in verify R${o.round}`, cause }],
  });
  // finding inayofanana na defect ILIYO WAZI tayari (reviewer aliripoti upya kasoro inayojulikana) → haiongezwi
  const known = next.filter((d) => d.milestoneId === o.milestoneId && isOpenDefect(d));
  const duplicates: { title: string; of: string }[] = [];
  const fresh = <T extends DefectFinding>(f: T) => {
    const hit = known.find((d) => titleSimilarity(d.title, f.title) >= SAME_FINDING_SIMILARITY);
    if (hit) duplicates.push({ title: f.title, of: hit.id });
    return !hit;
  };
  const added: Defect[] = [
    ...o.decision.regressions.filter(fresh).map((r) => mk(r, r.by, "REGRESSION")),
    ...o.decision.newDefects.filter(fresh).map((r) => mk(r, r.by, "NEW_DEFECT")),
    // concern MOJA kwa kila CO (reviewers wawili wanaunganishwa)
    ...[...new Set(o.decision.concerns.map((c) => c.orderId))].map((orderId) => {
      const cs = o.decision.concerns.filter((c) => c.orderId === orderId);
      const co = o.changeOrders.find((x) => x.id === orderId);
      return mk({
        title: `${orderId}: ${cs.map((c) => c.reviewer).join(" + ")} see${cs.length > 1 ? "" : "s"} a problem although its checks passed`, area: co?.location.selector || co?.location.route || "ui",
        severity: cs.some((c) => c.verdict === "FAIL") ? "medium" : "minor", evidence: [...new Set(cs.flatMap((c) => c.evidence))].length ? [...new Set(cs.flatMap((c) => c.evidence))] : [`check:${orderId}`],
        expected: `${co?.desired || "the change order's desired state"} — and a NEW check that measures what the reviewer saw`,
        actual: cs.map((c) => `${c.reviewer} ${c.verdict}: ${c.note}`).join(" | "),
      }, cs.map((c) => c.reviewer), CHECK_MISSED_IT);
    }),
  ];
  return { defects: [...next, ...added], added, fixed, reopened, duplicates };
}

/** CO.attempt kwa raundi ijayo: 1 + attempts kubwa za defects zake (defect mpya → 1). */
export function nextAttempt(co: Pick<ChangeOrder, "defectIds">, defects: Defect[]): number {
  return 1 + co.defectIds.reduce((m, id) => Math.max(m, defects.find((d) => d.id === id)?.attempts || 0), 0);
}

/* ========================= prompts + validation (LLM) ========================= */

export interface VerifyContext {
  /** OCB bila stage/self (code inaweka REVIEW_VERIFY + reviewer) */
  ocb: ReviewContext["ocb"];
  roundHeader: RoundHeaderData;
  ledger: ReviewContext["ledger"];
  pack: EvidencePack;
  changeOrders: ChangeOrder[];
  /** muhtasari wa receipts kwa kila CO (task 25) */
  receipts: { orderId: string; verdict: string; receipt: string; receiptStatus: string; touched: string[]; diff: { files: number; added: number; deleted: number } }[];
  /** matokeo ya acceptance + global checks (task 25 `checks:Mk:Rn`) */
  checkResults: EvidenceCheckResult[];
  defects: Defect[];
  /** maelezo ya raundi iliyorudishwa nyuma (ikiwa ipo) n.k. */
  notes?: string[];
}

const ROLE: Record<ReviewerId, string> = {
  designer: "Judge layout, spacing, type scale, colour use vs the ledger's design rules, visual hierarchy and brand feel.",
  frontend: "Judge implementation vs the change order, responsiveness at 375/768/1280, overflow, states, accessibility and console errors.",
};

const VERIFY_SPEC = `OUTPUT: ONE JSON object, nothing else (a \`\`\`json fence is tolerated):
{
  "reviewer": "<designer | frontend>",
  "cos": [ { "orderId": "CO-001", "verdict": "PASS|FAIL|PARTIAL", "evidence": ["S-002", "S-002 dom: <selector> <property>=<value>", "check:CO-001/c1"], "note": "why (cite numbers)" } ],   // EVERY change order of this round, once
  "regressions": [ { "title", "area", "severity": "blocker|major|medium|minor", "kind": "broken", "evidence": [...], "expected", "actual" } ],   // things that worked before this round and are broken now
  "newDefects":  [ { "title", "area", "severity", "kind": "violation|broken", "decisionRef?": "A2", "evidence": [...], "expected", "actual" } ],   // problems NOT already listed in the DEFECT LEDGER below (never re-report a listed defect)
  "requestDiscussion": null,   // or { "reason": "..." } ONLY if the whole team must discuss something before the next round
  "notes": "overall verdict"
}
RULES: PASS = the change order's "desired" state is visibly and measurably there. PARTIAL = some of it. FAIL = not there or wrong.
A check marked FAIL/ERROR means the CO fails whatever you say — say what you see anyway. If a check PASSED but you still see a problem, say FAIL/PARTIAL and explain: the harness will open a NEW defect and a NEW check.
EVIDENCE: every verdict, regression and new defect needs ≥1 item pointing INTO THE EVIDENCE PACK: a screenshot id ("S-003"), a DOM metric written exactly as "S-003 dom: <selector> <property>=<value>", "check:<id>" of a listed check, "regression:<route>@<viewport>" of a listed regression, or "console". Never invent ids.`;

function verifySystem(r: ReviewerId): string {
  const a = AGENTS.find((x) => x.id === r)!;
  return [
    `You are ${a.name}, the ${a.role} of PROFESSOR XMD COMPANY. You are one of the TWO reviewers who VERIFY a fix round of XMD Computer. You verify ALONE — you will not see the other reviewer's verdicts.`,
    `YOUR LENS: ${ROLE[r]}`,
    VERIFY_SPEC,
  ].join("\n\n");
}

const cap = (s: unknown, n: number) => { const t = String(s ?? ""); return t.length > n ? `${t.slice(0, n)} […cut ${t.length - n} chars]` : t; };

export interface VerifyDeps {
  complete?: (o: { reviewer: ReviewerId; messages: Msg[]; purpose: string }) => Promise<Pick<CompleteResult, "text" | "usage"> & { lane?: { id: string; model: string } }>;
  loadImage?: ReviewDeps["loadImage"];
  loadDom?: ReviewDeps["loadDom"];
  images?: boolean;
  maxImages?: number;
  log?: ReviewDeps["log"];
  /** prompt capture (T3) */
  capture?: (agent: string, phase: string, text: string) => void;
}

/** pack ya uthibitisho = evidence mpya + checks za raundi (ids "CO-001/c1", "global/build") */
export function verifyPack(ctx: VerifyContext): EvidencePack {
  const seen = new Set((ctx.pack.checks || []).map((c) => c.id));
  return { ...ctx.pack, checks: [...(ctx.pack.checks || []), ...ctx.checkResults.filter((c) => !seen.has(c.id))] };
}

export async function buildVerifyPrompt(reviewer: ReviewerId, ctx: VerifyContext, deps: VerifyDeps = {}): Promise<{ messages: Msg[]; text: string; hash: string; imageParts: number }> {
  const pack = verifyPack(ctx);
  const ocb = buildOCB({ ...ctx.ocb, stage: "REVIEW_VERIFY", self: reviewer });
  const loadDom = deps.loadDom || (async (d) => (/^https?:\/\//.test(d.url || "") ? ((await fetch(String(d.url))).json() as Promise<DomJson>) : null));
  const doms = await Promise.all((pack.screenshots || []).map(async (s) => {
    const dm = (pack.domMetrics || []).find((d) => d.screenshotId === s.id);
    return dm ? loadDom(dm).catch(() => null) : null;
  }));
  const cos = ctx.changeOrders.map((c) => {
    const rc = ctx.receipts.find((x) => x.orderId === c.id);
    const ck = ctx.checkResults.filter((x) => x.id.startsWith(`${c.id}/`));
    return `### ${c.id} (attempt ${c.attempt}, priority ${c.priority}) — defects ${c.defectIds.join(", ") || "-"}${c.decisionIds?.length ? ` · decisions ${c.decisionIds.join(", ")}` : ""}
location: ${c.location.route || ""} ${c.location.selector || ""} ${(c.location.files || []).join(", ")}
current (before the fix): ${cap(c.current, 400)}
desired: ${cap(c.desired, 600)}
receipt: ${rc ? `${rc.verdict} · receipt ${rc.receipt} (${rc.receiptStatus}) · files ${rc.touched.join(", ") || "none"} (+${rc.diff.added}/-${rc.diff.deleted})` : "none"}
acceptance checks (decided by code): ${ck.map((x) => `check:${x.id} ${x.result} — ${cap(x.detail, 160)}`).join(" | ") || "none ran"}`;
  }).join("\n\n");
  const global = ctx.checkResults.filter((x) => !ctx.changeOrders.some((c) => x.id.startsWith(`${c.id}/`))).map((x) => `- check:${x.id} [${x.type}] ${x.result} — ${cap(x.detail, 200)}`).join("\n") || "- (none)";
  const regression = (pack.regression || []).map((r) => `- regression:${r.route}@${r.viewport} [${r.kind}] changed ${r.changedPct}% vs baseline ${r.baselineMilestone}`).join("\n") || "- (none)";
  const ledger = ctx.ledger.map((e) => `- A${e.agenda_index} ${e.agenda_item}: ${cap(String(e.decision_summary || "").replace(/\s+/g, " "), 240)}`).join("\n") || "- (none)";
  const defects = ctx.defects.filter((d) => d.milestoneId === ctx.roundHeader.milestoneId).map((d) => `- ${d.id} [${d.status}, ${d.severity}, attempts ${d.attempts}] ${d.title}`).join("\n") || "- (none)";
  const want = deps.images !== false;
  const imgs: { id: string; img: ReviewImage }[] = [];
  if (want) {
    const load = deps.loadImage || (async (s) => {
      if (!/^https?:\/\//.test(s.url || "")) return null;
      const r = await fetch(s.url);
      return r.ok ? { mime: r.headers.get("content-type")?.split(";")[0] || "image/png", base64: Buffer.from(await r.arrayBuffer()).toString("base64") } : null;
    });
    for (const s of (pack.screenshots || []).slice(0, deps.maxImages ?? 12)) {
      const img = await load(s).catch(() => null);
      if (img) imgs.push({ id: s.id, img });
    }
  }
  const user = [
    `${ocb}\n${formatRoundHeader(ctx.roundHeader)}`,
    ...(ctx.notes?.length ? [`## NOTES FROM THE HARNESS\n${ctx.notes.map((n) => `- ${n}`).join("\n")}`] : []),
    `## LEDGER (locked decisions)\n${ledger}`,
    `## CHANGE ORDERS OF ROUND ${ctx.roundHeader.round} (verify EVERY one)\n${cos}`,
    `## GLOBAL CHECKS (decided by code)\n${global}`,
    `## FRESH EVIDENCE PACK (${pack.milestoneId} R${pack.round})
SCREENSHOTS:
${(pack.screenshots || []).map((s) => `- ${s.id}: route ${s.route} · viewport ${s.viewport} · state ${s.state}`).join("\n") || "- (none)"}
DOM METRICS:
${doms.map((d, k) => domLines(pack.screenshots[k].id, d, 30)).join("\n\n") || "(none)"}
REGRESSION vs approved baselines:
${regression}
CONSOLE ERRORS: ${(pack.consoleErrors || []).length ? pack.consoleErrors.slice(0, 12).map((c) => cap(c, 160)).join(" | ") : "none"}
GIT DIFF SUMMARY:
${cap(pack.gitDiffSummary || "(none)", 3000)}
PICTURES: ${imgs.length ? `${imgs.length} attached after this text: ${imgs.map((i) => i.id).join(", ")}` : "none attached — use the DOM metrics"}`,
    `## DEFECT LEDGER OF THIS MILESTONE\n${defects}`,
    `## YOUR TASK\nVerify round ${ctx.roundHeader.round} of ${ctx.roundHeader.milestoneId} as ${reviewer}: one verdict per change order (${ctx.changeOrders.map((c) => c.id).join(", ")}), then regressions and new defects. JSON only.`,
  ].join("\n\n");
  const system = verifySystem(reviewer);
  const content: any[] = [{ type: "text", text: user }];
  for (const { id, img } of imgs) {
    const s = pack.screenshots.find((x) => x.id === id)!;
    content.push({ type: "text", text: `Image ${id} — route ${s.route} · viewport ${s.viewport} · state ${s.state}:` });
    content.push({ type: "image_url", image_url: { url: `data:${img.mime};base64,${img.base64}` } });
  }
  const text = `${system}\n\n${user}`;
  const h = createHash("sha256").update(text);
  for (const { img } of imgs) h.update(img.base64.slice(0, 2000));
  return { messages: [{ role: "system", content: system }, { role: "user", content }], text, hash: h.digest("hex"), imageParts: imgs.length };
}

const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v: unknown) => typeof v === "string" && v.trim().length > 0;

function validateFinding(d: unknown, p: string, pack: EvidencePack, e: string[], regression: boolean): DefectFinding | null {
  if (!isObj(d)) { e.push(`${p}: must be an object`); return null; }
  for (const k of ["title", "area", "expected", "actual"]) if (!nonEmpty(d[k])) e.push(`${p}.${k}: must be a non-empty string`);
  if (!(DEFECT_SEVERITIES as readonly string[]).includes(d.severity)) e.push(`${p}.severity: must be one of ${DEFECT_SEVERITIES.join("|")}`);
  const kind = regression ? "broken" : d.kind;
  if (kind !== "violation" && kind !== "broken") e.push(`${p}.kind: must be "violation" or "broken"`);
  checkEvidence(d.evidence, p, pack, e);
  return { title: String(d.title || ""), area: String(d.area || ""), severity: d.severity, kind, ...(d.decisionRef ? { decisionRef: String(d.decisionRef) } : {}), evidence: (Array.isArray(d.evidence) ? d.evidence : []).map(String), expected: String(d.expected || ""), actual: String(d.actual || "") };
}
function checkEvidence(arr: unknown, p: string, pack: EvidencePack, e: string[]) {
  if (!Array.isArray(arr) || !arr.length) { e.push(`${p}.evidence: must be a non-empty array`); return; }
  let packRefs = 0;
  arr.forEach((x, k) => {
    const c = classifyEvidence(String(x), pack);
    if ("error" in c) e.push(`${p}.evidence[${k}]: ${c.error}`); else if (c.kind === "pack") packRefs++;
  });
  if (!packRefs) e.push(`${p}.evidence: needs ≥1 item pointing into the evidence pack`);
}

export function validateVerify(raw: unknown, reviewer: ReviewerId, orderIds: string[], pack: EvidencePack): { ok: true; value: VerifyFindings } | { ok: false; errors: string[] } {
  const e: string[] = [];
  if (!isObj(raw)) return { ok: false, errors: ["root: must be a JSON object"] };
  const who = String(raw.reviewer || "").toLowerCase();
  const a = AGENTS.find((x) => x.id === reviewer)!;
  if (who && who !== reviewer && who !== a.name.toLowerCase()) e.push(`reviewer: must be "${reviewer}"`);
  const cos: ReviewerCoVerdict[] = [];
  if (!Array.isArray(raw.cos)) e.push("cos: must be an array with one entry per change order");
  else {
    raw.cos.forEach((c: unknown, k: number) => {
      const p = `cos[${k}]`;
      if (!isObj(c)) { e.push(`${p}: must be an object`); return; }
      if (!orderIds.includes(String(c.orderId))) { e.push(`${p}.orderId: ${JSON.stringify(c.orderId)} is not a change order of this round (${orderIds.join(", ")})`); return; }
      if (cos.some((x) => x.orderId === c.orderId)) { e.push(`${p}.orderId: ${c.orderId} listed twice`); return; }
      if (!(VERIFY_VERDICTS as readonly string[]).includes(c.verdict)) e.push(`${p}.verdict: must be PASS|FAIL|PARTIAL`);
      checkEvidence(c.evidence, p, pack, e);
      cos.push({ orderId: String(c.orderId), verdict: c.verdict, evidence: (Array.isArray(c.evidence) ? c.evidence : []).map(String), note: String(c.note || "") });
    });
    const missing = orderIds.filter((id) => !cos.some((c) => c.orderId === id));
    if (missing.length) e.push(`cos: missing verdicts for ${missing.join(", ")}`);
  }
  const list = (k: "regressions" | "newDefects") => {
    if (raw[k] === undefined || raw[k] === null) return [];
    if (!Array.isArray(raw[k])) { e.push(`${k}: must be an array (may be empty)`); return []; }
    return (raw[k] as unknown[]).map((d, j) => validateFinding(d, `${k}[${j}]`, pack, e, k === "regressions")).filter((x): x is DefectFinding => !!x);
  };
  const regressions = list("regressions"), newDefects = list("newDefects");
  const rd = raw.requestDiscussion;
  if (rd !== undefined && rd !== null && !(isObj(rd) && nonEmpty(rd.reason))) e.push(`requestDiscussion: must be null or {"reason": "..."}`);
  if (e.length) return { ok: false, errors: e };
  return { ok: true, value: { reviewer, cos, regressions, newDefects, requestDiscussion: isObj(rd) ? { reason: String(rd.reason) } : null, notes: String(raw.notes || "") } };
}

export const VERIFY_MAX_RETRIES = 2;
const defaultComplete: NonNullable<VerifyDeps["complete"]> = async ({ reviewer, messages, purpose }) =>
  brokerComplete({ agentId: reviewer, purpose, messages: messages as never, maxOut: 16_000, cls: "heavy", allow: ["gemini"], effort: "high", temperature: 0.3, priority: "background", waitMs: 120_000, stallFirstMs: REVIEW_STALL_FIRST_MS });

export interface VerifyRun { findings: VerifyFindings | null; attempts: number; errors: string[]; promptHash: string; promptChars: number; imageParts: number; model: string; ms: number; raw: string }

/** reviewer MMOJA, peke yake (maelezo26 #1). */
export async function verifyOne(reviewer: ReviewerId, ctx: VerifyContext, deps: VerifyDeps = {}): Promise<VerifyRun> {
  const t0 = Date.now();
  const built = await buildVerifyPrompt(reviewer, ctx, deps);
  const purpose = `review-verify:${ctx.roundHeader.milestoneId}:R${ctx.roundHeader.round}:${reviewer}`;
  deps.capture?.(reviewer, `verify:${ctx.roundHeader.milestoneId}:R${ctx.roundHeader.round}`, built.text);
  const pack = verifyPack(ctx);
  const orderIds = ctx.changeOrders.map((c) => c.id);
  const complete = deps.complete || defaultComplete;
  let messages = built.messages, raw = "", errors: string[] = ["not run"], findings: VerifyFindings | null = null, attempts = 0, model = "";
  for (let k = 0; k <= VERIFY_MAX_RETRIES; k++) {
    attempts++;
    try {
      const r = await complete({ reviewer, messages, purpose });
      raw = r.text; model = r.lane?.model || model;
    } catch (err: any) { errors = [`LLM call failed: ${String(err?.message || err).slice(0, 300)}`]; break; }
    let parsed: unknown;
    try { parsed = extractJson(raw); } catch (err: any) { parsed = undefined; errors = [`invalid JSON: ${String(err?.message || err).slice(0, 200)}`]; }
    if (parsed !== undefined) {
      const v = validateVerify(parsed, reviewer, orderIds, pack);
      if (v.ok) { findings = v.value; errors = []; break; }
      errors = v.errors;
    }
    deps.log?.("warning", `🔍 verify ${reviewer} attempt ${attempts}: ${errors.slice(0, 3).join("; ").slice(0, 300)}`);
    messages = [...built.messages, { role: "assistant", content: cap(raw, 40_000) }, { role: "user", content: `Your JSON is not valid. Fix EVERY error and reply with the complete corrected JSON object only:\n${errors.slice(0, 40).map((x) => `- ${x}`).join("\n")}` }];
  }
  deps.log?.(findings ? "success" : "error", `🔍 ${reviewer} verify R${ctx.roundHeader.round}: ${findings ? findings.cos.map((c) => `${c.orderId} ${c.verdict}`).join(" · ") + ` · regressions ${findings.regressions.length} · new ${findings.newDefects.length}` : `INVALID after ${attempts}`} · ${Math.round((Date.now() - t0) / 1000)}s`);
  return { findings, attempts, errors, promptHash: built.hash, promptChars: built.text.length, imageParts: built.imageParts, model, ms: Date.now() - t0, raw: cap(raw, 20_000) };
}

/** Wote wawili SAMBAMBA, kila mmoja peke yake. */
export async function verifyBoth(ctx: VerifyContext, deps: VerifyDeps = {}): Promise<Record<ReviewerId, VerifyRun>> {
  const [designer, frontend] = await Promise.all(REVIEWERS.map((r) => verifyOne(r, ctx, deps)));
  return { designer, frontend };
}

/* ============================ sync turn (MOJA, fupi) ============================ */

export interface SyncItem { orderId: string; mine: ReviewerCoVerdict; other: ReviewerCoVerdict }
export function buildSyncPrompt(reviewer: ReviewerId, header: RoundHeaderData, ocbText: string, items: SyncItem[]): Msg[] {
  const a = AGENTS.find((x) => x.id === reviewer)!;
  const other = AGENTS.find((x) => x.id === (reviewer === "designer" ? "frontend" : "designer"))!;
  const system = `You are ${a.name} (${reviewer}). You and ${other.name} verified the same fix round and DISAGREE on the change orders below. This is ONE short sync turn: read ${other.name}'s verdict and evidence, then give your FINAL verdict. Disagreement after this turn counts as FAIL. Reply with ONE JSON object only: {"cos":[{"orderId":"CO-001","verdict":"PASS|FAIL|PARTIAL","note":"≤40 words"}]}`;
  const user = `${ocbText}\n${formatRoundHeader(header)}\n\n${items.map((i) => `### ${i.orderId}\nYOUR verdict: ${i.mine.verdict} — ${cap(i.mine.note, 400)} · evidence ${i.mine.evidence.join(", ")}\n${other.name.toUpperCase()}'S verdict: ${i.other.verdict} — ${cap(i.other.note, 400)} · evidence ${i.other.evidence.join(", ")}`).join("\n\n")}`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}
export function parseSync(raw: string, orderIds: string[]): Record<string, VerifyVerdict> | null {
  try {
    const j = extractJson(raw) as { cos?: { orderId?: string; verdict?: string }[] };
    const out: Record<string, VerifyVerdict> = {};
    for (const c of j?.cos || []) if (orderIds.includes(String(c.orderId)) && (VERIFY_VERDICTS as readonly string[]).includes(String(c.verdict))) out[String(c.orderId)] = c.verdict as VerifyVerdict;
    return Object.keys(out).length ? out : null;
  } catch { return null; }
}
export async function syncTurn(header: RoundHeaderData, ocbOf: (r: ReviewerId) => string, a: VerifyFindings, b: VerifyFindings, disputed: string[], deps: VerifyDeps = {}):
  Promise<{ sync: Partial<Record<ReviewerId, Record<string, VerifyVerdict>>>; transcript: { reviewer: ReviewerId; text: string }[] }> {
  const complete = deps.complete || defaultComplete;
  const pair: [ReviewerId, VerifyFindings, VerifyFindings][] = [["designer", a, b], ["frontend", b, a]];
  const res = await Promise.all(pair.map(async ([r, mine, other]) => {
    const items = disputed.map((id) => ({ orderId: id, mine: mine.cos.find((c) => c.orderId === id)!, other: other.cos.find((c) => c.orderId === id)! }));
    const messages = buildSyncPrompt(r, header, ocbOf(r), items);
    deps.capture?.(r, `verify-sync:${header.milestoneId}:R${header.round}`, messages.map((m) => String(m.content)).join("\n\n"));
    try {
      const out = await complete({ reviewer: r, messages, purpose: `review-verify-sync:${header.milestoneId}:R${header.round}:${r}` });
      return { r, text: out.text, verdicts: parseSync(out.text, disputed) };
    } catch (err: any) { return { r, text: `LLM call failed: ${String(err?.message || err).slice(0, 200)}`, verdicts: null }; }
  }));
  const sync: Partial<Record<ReviewerId, Record<string, VerifyVerdict>>> = {};
  for (const x of res) if (x.verdicts) sync[x.r] = x.verdicts;
  return { sync, transcript: res.map((x) => ({ reviewer: x.r, text: cap(x.text, 4000) })) };
}

export const verifyKey = (milestoneId: string, round: number) => `verify:${milestoneId}:R${round}`;
export const cosRoundKey = (milestoneId: string, round: number) => `cos:${milestoneId}:R${round}`;
export const bestKey = (milestoneId: string) => `best:${milestoneId}`;

// ── Test hooks (XMD_TEST_HOOKS=1 PEKEE) ──────────────────────────────────────
/** XMD_TEST_VERIFY_INPUT: site ndogo `xmdtest-site` + plan + ledger → R0 evidence/review HALISI → fix → verify (loop nzima).
 *  `changeOrders` (hiari, T4) = anza FIXING R1 moja kwa moja na COs/defects hizi. Inert bila flags zote mbili. */
export interface TestVerifyInput {
  milestoneId?: string;
  planMarkdown: string;
  files: Record<string, string>;
  ledger?: { agenda_index: number; agenda_item: string; status: string; decision_summary?: string; decision_detail?: string }[];
  buildReport?: string;
  extraParticipants?: string[];
  changeOrders?: ChangeOrder[];
  defects?: Defect[];
  /** (na changeOrders) anza FIXING ya raundi hii (kingo halali; raundi za nyuma = stub) — T3 */
  startRound?: number;
}
export function testVerifyInput(env: Record<string, string | undefined> = process.env, read: (p: string) => string = (p) => readFileSync(p, "utf8")): TestVerifyInput | null {
  if (env.XMD_TEST_HOOKS !== "1" || !env.XMD_TEST_VERIFY_INPUT) return null;
  try {
    const j = JSON.parse(read(env.XMD_TEST_VERIFY_INPUT)) as TestVerifyInput;
    return j && j.files && typeof j.planMarkdown === "string" ? j : null;
  } catch { return null; }
}
/** XMD_TEST_STOP_AFTER_ROUND=<n>: kitanzi kinasimama baada ya uthibitisho wa raundi n (majaribio mafupi). */
export function testStopAfterRound(env: Record<string, string | undefined> = process.env): number | undefined {
  if (env.XMD_TEST_HOOKS !== "1") return undefined;
  const n = Number(env.XMD_TEST_STOP_AFTER_ROUND);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}
