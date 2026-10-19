// src/lib/milestone/reviewAgenda.ts — TASK 24 (maelezo24): mjadala wa TIMU juu ya Findings za Round 0 + Change Orders za Optimus.
//
// • REVIEW si agenda yenye namba: ramani ya milestones inafunika agenda 1..N kamili. REVIEW ina id yake `R-<Mk>-<round>`
//   (mf. R-M1-0) na inaitwa kutoka runMilestoneBuild (loop.ts) BAADA ya evidence — si item tuli ya N+1 kwenye loop.
//   `index` ya item = REVIEW_NO_INDEX (0): si agenda ya ramani (ramani zinaanza 1); haiandikwi Ledger ya Board, mini-report,
//   doneIdx wala closeMilestones (boardRunner inarudi kabla ya sehemu hizo kwa REVIEW).
// • Mjadala unapita mashine ILEILE ya agenda (boardRunner `discussAgenda`): zamu, evidence gate + RESEARCH_REQUEST/READ_SOURCE
//   (search ya Board — lane ya Gemini haina tool ya search), CLARIFY, PROPOSED DECISION / AGREE / DISAGREE, mtoa pendekezo
//   hahesabiwi, owners WOTE lazima waseme AGREE.
// • Itifaki ya kufunga kwa nguvu (R37: rough/fallback/defer) HAITUMIKI kwa REVIEW: bila consensus ya Ultron + Vextron + Optimus,
//   proposals ZOTE zinakataliwa (default) na defects ZOTE zinabaki kwenye defect ledger.
// • Kanuni za uamuzi (maelezo24 #2) zinatekelezwa na CODE juu ya uamuzi uliokubaliwa (applyReviewRules), si na LLM.

import { readFileSync } from "node:fs";
import { AGENTS } from "../agents";
import type { AgendaItem } from "../agenda";
import { validateChangeOrder } from "./schemas";
import { extractJson, type Findings, type ReviewerId } from "./review";
import { DEFECT_SEVERITIES, type ChangeOrder, type Check, type Defect, type DefectSeverity, type EvidencePack, type ReviewMode } from "./types";

export const REVIEW_KIND = "REVIEW" as const;
/** REVIEW haichukui namba ya agenda (ramani = 1..N). 0 = "si agenda"; haiandikwi popote kama agenda_index. */
export const REVIEW_NO_INDEX = 0;
/** maelezo24 #1 + CEO: urefu wa ujumbe kwa REVIEW PEKEE (agenda za kawaida zinabaki "under 180 words"). */
export const REVIEW_WORDS = { min: 600, max: 900 } as const;
export const NORMAL_WORD_RULE = "Keep this exchange under 180 words.";
/** zamu ya owner: 2400 kwa agenda za kawaida (boardRunner); REVIEW: maneno 900 ≈ tokens 1200 + thinking. */
export const REVIEW_TURN_MAX_TOKENS = 9000;
/** mjadala wote unaoonyeshwa kwa kila zamu (agenda za kawaida 9000) — jumbe ndefu za REVIEW zisikatwe. */
export const REVIEW_TRANSCRIPT_CHARS = 60_000;
export const REVIEW_BASE_PARTICIPANTS = ["designer", "frontend", "pm"] as const;
export const CONSOLIDATE_MAX_TRIES = 3;
const BLOCKING: readonly DefectSeverity[] = ["blocker", "major", "medium"];

export const reviewAgendaId = (milestoneId: string, round: number) => `R-${milestoneId}-${round}`;
export const findingsKey = (milestoneId: string, round: number) => `findings:${milestoneId}:R${round}`;
export const reviewKey = (milestoneId: string, round: number) => `review:${milestoneId}:R${round}`;
export const cosKey = (milestoneId: string) => `cos:${milestoneId}`;
/** defect ledger ya session (ids D-xxx ni za kipekee kwa session nzima) */
export const DEFECTS_KEY = "defects";
/** maamuzi mapya kutoka REVIEW — "ledger" ya review (Ledger ya Board imefungwa kwa agenda_index 1..N) */
export const DECISIONS_KEY = "decisions";
export const CRS_KEY = "changeRequests";

const nameOf = (id: string) => AGENTS.find((a) => a.id === id)?.name || id;
const clip = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

// ── Aina ─────────────────────────────────────────────────────────────────────
export interface ReviewProposal { id: string; by: ReviewerId | "team"; title: string; detail: string; rationale: string; evidence: string[] }
export interface ReviewTable {
  reviewId: string;
  milestoneId: string;
  round: number;
  defects: Defect[];
  proposals: ReviewProposal[];
  /** D-xxx → "A2" (decisionRef ya reviewer kwa violations) */
  decisionRefs: Record<string, string>;
  notes: Partial<Record<ReviewerId, string>>;
}
export interface ReviewAgendaPayload {
  reviewId: string;
  milestoneId: string;
  milestoneTitle: string;
  round: number;
  reviewMode: ReviewMode;
  table: ReviewTable;
  /** mistari ya Ledger iliyofungwa: "A2 [LOCKED] Typography: …" */
  ledgerLines: string[];
  /** "check:<id> [type] PASS — detail" */
  checkLines: string[];
  /** "S-001 / @375x667 default" … */
  evidenceRefs: string[];
  participants: string[];
}
export type ReviewAgendaItem = AgendaItem & { kind: typeof REVIEW_KIND; reviewId: string; review: ReviewAgendaPayload };
export const isReviewAgenda = (it: unknown): it is ReviewAgendaItem => (it as { kind?: string })?.kind === REVIEW_KIND && !!(it as { review?: unknown }).review;

export interface DiscussionOutcome {
  consensus: boolean;
  /** uamuzi uliokubaliwa na owners WOTE ("" bila consensus) */
  decision: string;
  closeReason: string;
  transcript: { name: string; text: string; tag?: string }[];
  /** searches za Board zilizofanyika ndani ya REVIEW (evidence gate + RESEARCH_REQUEST) */
  searches: { by: string; query: string; sources: number }[];
  turns: number;
}

export interface ReviewDecision {
  id: string; // "R-M1-0/P-02"
  reviewId: string;
  milestoneId: string;
  round: number;
  proposalId: string;
  title: string;
  detail: string;
  proposedBy: string;
  agreedBy: string[];
  at: string;
}
export interface ChangeRequest {
  id: string; // "CR-M1-0-01"
  reviewId: string;
  proposalId: string;
  title: string;
  detail: string;
  conflictsWith: string; // "A2" au "CEO brief"
  reason: string;
  status: "OPEN";
  raisedBy: string[];
}
export interface ReviewRulesResult {
  consensus: boolean;
  acceptedProposals: ReviewProposal[];
  rejectedProposals: { id: string; reason: string }[];
  invalidDefects: { id: string; reason: string }[];
  changeRequests: { proposalId: string; conflictsWith: string; reason: string }[];
  openDefects: Defect[];
  warnings: string[];
}

// ── Findings → jedwali lenye ids ─────────────────────────────────────────────
export function numberFindings(f: Partial<Record<ReviewerId, Findings | null>>, o: { milestoneId: string; round: number; nextDefectNo?: number }): ReviewTable {
  let dn = Math.max(1, o.nextDefectNo ?? 1);
  let pn = 1;
  const t: ReviewTable = { reviewId: reviewAgendaId(o.milestoneId, o.round), milestoneId: o.milestoneId, round: o.round, defects: [], proposals: [], decisionRefs: {}, notes: {} };
  for (const r of ["designer", "frontend"] as ReviewerId[]) {
    const x = f[r];
    if (!x) continue;
    t.notes[r] = x.notes;
    for (const d of x.defects || []) {
      const id = `D-${String(dn++).padStart(3, "0")}`;
      t.defects.push({
        id, milestoneId: o.milestoneId, foundInRound: o.round, reportedBy: [r], area: d.area || r,
        severity: (DEFECT_SEVERITIES as readonly string[]).includes(d.severity) ? d.severity : "medium",
        title: d.title, evidence: d.evidence || [], expected: d.expected, actual: d.actual, status: "OPEN", attempts: 0, history: [],
      });
      if (d.decisionRef) t.decisionRefs[id] = d.decisionRef;
    }
    for (const p of x.proposals || []) t.proposals.push({ id: `P-${String(pn++).padStart(2, "0")}`, by: r, title: p.title, detail: p.detail, rationale: p.rationale, evidence: p.evidence || [] });
  }
  return t;
}

/** Washiriki: Ultron + Vextron + Optimus; wengine TU ikiwa Optimus amewaongeza kwa milestone hii (`extra`). */
export function reviewParticipants(extra: string[] = []): string[] {
  const known = new Set(AGENTS.map((a) => a.id));
  return [...new Set([...REVIEW_BASE_PARTICIPANTS, ...extra.filter((x) => known.has(x))])];
}

export function makeReviewAgendaItem(p: ReviewAgendaPayload): ReviewAgendaItem {
  return {
    index: REVIEW_NO_INDEX,
    item: `${p.reviewId} — team review of milestone ${p.milestoneId} "${p.milestoneTitle}": website UI/UX defects and improvement proposals`,
    owners: p.participants,
    requiresCode: false,
    kind: REVIEW_KIND,
    reviewId: p.reviewId,
    review: p,
  };
}

/** Kanuni ya urefu wa ujumbe (mstari wa 6 wa prompt ya owner). */
export function turnWordRule(item: AgendaItem): string {
  return isReviewAgenda(item)
    ? `This is a REVIEW discussion: long answers are expected — write about ${REVIEW_WORDS.min}-${REVIEW_WORDS.max} words when you have substance, never more than ${REVIEW_WORDS.max} words.`
    : NORMAL_WORD_RULE;
}

// ── Prompt ya REVIEW (inaongezwa juu ya prompt ya kawaida ya owner) ──────────
export function reviewPromptBlock(item: ReviewAgendaItem, selfId: string): string {
  const p = item.review;
  const t = p.table;
  const others = p.participants.filter((x) => x !== selfId).map(nameOf).join(", ");
  const defects = t.defects.map((d) => `- ${d.id} [${d.severity}] (${nameOf(d.reportedBy[0])}) ${d.title}${t.decisionRefs[d.id] ? ` · violates ${t.decisionRefs[d.id]}` : ""}\n    expected: ${clip(d.expected, 300)}\n    actual: ${clip(d.actual, 300)}\n    evidence: ${d.evidence.slice(0, 6).map((e) => clip(e, 160)).join(" | ")}`).join("\n") || "- (none)";
  const props = t.proposals.map((x) => `- ${x.id} (${x.by === "team" ? "team" : nameOf(x.by)}) ${x.title}\n    detail: ${clip(x.detail, 500)}\n    rationale: ${clip(x.rationale, 300)}\n    evidence: ${x.evidence.slice(0, 4).map((e) => clip(e, 140)).join(" | ") || "-"}`).join("\n") || "- (none)";
  const notes = (["designer", "frontend"] as ReviewerId[]).filter((r) => t.notes[r]).map((r) => `- ${nameOf(r)}: ${clip(t.notes[r], 700)}`).join("\n") || "- (none)";
  return `=== REVIEW ${p.reviewId} — milestone ${p.milestoneId} "${p.milestoneTitle}", round ${p.round} (NOT a numbered agenda) ===
Ultron (Designer) and Vextron (Frontend Engineer) each reviewed what XMD Computer built INDEPENDENTLY. Now the team (${p.participants.map(nameOf).join(", ")}) discusses BOTH reviews like a normal Board agenda: read each other's findings, challenge or support them, research current practice (RESEARCH_REQUEST / READ_SOURCE work here), propose bigger changes when justified. You discuss with: ${others}.
Refer to the other participants' points explicitly by name and id (e.g. "Vextron's D-003 …", "I disagree with Ultron's P-02 because …").

LOCKED LEDGER DECISIONS (authoritative; the CEO brief is authoritative too):
${p.ledgerLines.join("\n") || "- (none)"}

CHECK RESULTS (decided by code — an LLM can never turn FAIL into PASS):
${p.checkLines.join("\n") || "- (none)"}

EVIDENCE REFERENCES (screenshots / DOM metrics of the evidence pack):
${p.evidenceRefs.join("\n") || "- (none)"}

DEFECTS (from both reviews). A defect ENTERS THE DEFECT LEDGER unless BOTH reviewers agree it is invalid (give the reason):
${defects}

PROPOSALS (from both reviews). A proposal is REJECTED by default. It becomes a decision ONLY if Ultron AND Vextron AND Optimus all agree AND it does not contradict a locked ledger decision or the CEO brief. A proposal that contradicts a locked ledger decision or the CEO brief can NEVER be accepted and is NEVER silently dropped: list it under CHANGE REQUESTS with the decision id (e.g. "P-04 conflicts with A2 (reason)") — the CEO decides; nothing is silently edited:
${props}

REVIEWER NOTES:
${notes}

DECISION FORMAT — the PROPOSED DECISION of this REVIEW must contain ALL these lines (write "none" when empty):
PROPOSED DECISION:
ACCEPTED PROPOSALS: P-02, P-05
REJECTED PROPOSALS: P-01 (reason); P-03 (reason)
INVALID DEFECTS: D-004 (reason both reviewers accept)
CHANGE REQUESTS: P-04 conflicts with A2 (reason)
NEW PROPOSALS: <title> — <detail>   (bigger changes the team originates; same acceptance rule)
RATIONALE: …
Only AGREE to a block you have actually checked line by line. Every proposal id not under ACCEPTED or CHANGE REQUESTS is rejected.`;
}

// ── Uamuzi → muundo ──────────────────────────────────────────────────────────
export interface ParsedReviewDecision {
  accepted: string[];
  rejected: { id: string; reason: string }[];
  invalid: { id: string; reason: string }[];
  changeRequests: { id: string; conflictsWith: string; reason: string }[];
  newProposals: { title: string; detail: string }[];
  found: string[];
}
const LABELS = ["ACCEPTED PROPOSALS", "REJECTED PROPOSALS", "INVALID DEFECTS", "CHANGE REQUESTS", "NEW PROPOSALS", "RATIONALE", "TRADE-OFF", "EVIDENCE"] as const;

function sectionOf(text: string, label: string): string | null {
  const t = String(text || "").replace(/\*\*/g, "");
  const re = new RegExp(`(?:^|\\n)\\s*[-*]?\\s*${label.replace(/[-]/g, "\\-")}\\s*:\\s*`, "i");
  const m = re.exec(t);
  if (!m) return null;
  const rest = t.slice(m.index + m[0].length);
  const next = new RegExp(`\\n\\s*[-*]?\\s*(?:${LABELS.filter((l) => l !== label).map((l) => l.replace(/[-]/g, "\\-")).join("|")}|PROPOSED DECISION|UPDATED DECISION)\\s*:`, "i").exec(rest);
  // sehemu inaishia kwenye lebo inayofuata, mstari mtupu, au "[Condition added by …]" ya mashine ya Board (AGREE yenye masharti)
  const body = next ? rest.slice(0, next.index) : rest;
  return body.split(/\n\s*\n|\n?\s*\[Condition added by/i)[0].trim();
}
const LEDGER_CONFLICT = /\b(contradict|conflict|violat|locked|against)\w*/i;
const conflictRefOf = (reason: string): string => (reason.match(/\bA\d+\b/) || [/\bbrief\b/i.test(reason) ? "CEO brief" : ""])[0] || "";
const isNone = (s: string | null) => !s || /^(none|n\/a|-|—|nil|hakuna)\.?$/i.test(s.trim());
/** Vipengele vya sehemu: vinatenganishwa kwa mstari mpya, ";" au ", <id>" NJE ya mabano — id ndani ya mabano ni sehemu ya sababu
 *  (run B2 halisi: "D-004 (Duplicate of D-002; merged into D-002)" ilibatilisha D-002 kimakosa). */
function splitEntries(s: string, kind: "P" | "D"): string[] {
  const out: string[] = [];
  let depth = 0, cur = "";
  const t = String(s).replace(/\*\*/g, "");
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (ch === "(" || ch === "[") depth++;
    else if ((ch === ")" || ch === "]") && depth > 0) depth--;
    const split = depth === 0 && (ch === "\n" || ch === ";" || (ch === "," && new RegExp(`^\\s*${kind}-\\d`, "i").test(t.slice(i + 1))));
    if (split) { out.push(cur); cur = ""; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.replace(/^[\s*\-•\d.)]+(?=[A-Za-z])/, "").trim()).filter(Boolean);
}
/** "P-01 (reason); P-03, P-04 — reason" → [{id, reason}] — id za MWANZO wa kipengele tu; zinazotajwa ndani ya sababu hazihesabiwi. */
function idsWithReasons(s: string | null, kind: "P" | "D"): { id: string; reason: string }[] {
  if (isNone(s)) return [];
  const lead = new RegExp(`^(${kind}-\\d+(?:\\s*(?:,|/|&|and)\\s*${kind}-\\d+)*)\\b`, "i");
  const res: { id: string; reason: string }[] = [];
  for (const e of splitEntries(String(s), kind)) {
    const m = lead.exec(e);
    if (!m) continue;
    const reason = e.slice(m[0].length).replace(/^[\s:—–-]*\(?/, "").replace(/\)?[\s;,.]*$/, "").trim();
    for (const id of m[1].match(new RegExp(`${kind}-\\d+`, "gi")) || []) res.push({ id: normId(id), reason });
  }
  return res;
}
const normId = (id: string) => { const [k, n] = id.toUpperCase().split("-"); return `${k}-${String(Number(n)).padStart(k === "D" ? 3 : 2, "0")}`; };

export function parseReviewDecision(text: string): ParsedReviewDecision {
  const acc = sectionOf(text, "ACCEPTED PROPOSALS");
  const rej = sectionOf(text, "REJECTED PROPOSALS");
  const inv = sectionOf(text, "INVALID DEFECTS");
  const cr = sectionOf(text, "CHANGE REQUESTS");
  const np = sectionOf(text, "NEW PROPOSALS");
  const found = (["ACCEPTED PROPOSALS", "REJECTED PROPOSALS", "INVALID DEFECTS", "CHANGE REQUESTS", "NEW PROPOSALS"] as const).filter((l) => sectionOf(text, l) !== null);
  return {
    accepted: [...new Set(idsWithReasons(acc, "P").map((x) => x.id))],
    rejected: idsWithReasons(rej, "P"),
    invalid: idsWithReasons(inv, "D"),
    changeRequests: idsWithReasons(cr, "P").map((x) => ({ id: x.id, conflictsWith: conflictRefOf(x.reason), reason: x.reason })),
    newProposals: isNone(np) ? [] : String(np).split(/\n|;\s*(?=[A-Z])/).map((l) => l.replace(/^[\s*\-•\d.)]+/, "").trim()).filter((l) => l && !isNone(l)).map((l) => {
      // run B3 halisi: "P-05 — Strict Grid: …" → kichwa si "P-05" (id hutolewa na code: P-T1…)
      const [title, ...rest] = l.replace(/^P-\d+\s*[—–:-]\s*/i, "").split(/\s+[—–-]\s+|:\s+/);
      return { title: clip(title, 160), detail: rest.join(" — ").trim() || title };
    }),
    found,
  };
}

/**
 * maelezo24 #2 + CEO #2 — kanuni zinazotekelezwa na CODE:
 *  • bila consensus (owners WOTE: Ultron + Vextron + Optimus) → proposals ZOTE REJECTED, defects ZOTE zinabaki (hakuna R37 forced closure);
 *  • defect inaondoka TU ikiwa iko kwenye INVALID DEFECTS ya uamuzi uliokubaliwa na wote (reviewers WOTE wawili) + sababu;
 *  • proposal inakubaliwa TU ikiwa iko kwenye ACCEPTED ya uamuzi huo; ikipingana na Ledger → CR (si CO, si uamuzi).
 */
export function applyReviewRules(t: ReviewTable, d: { consensus: boolean; decision: string; participants: string[] }): ReviewRulesResult {
  const warnings: string[] = [];
  const reviewersAgreed = ["designer", "frontend"].every((r) => d.participants.includes(r));
  if (!d.consensus || !d.decision.trim() || !reviewersAgreed) {
    return {
      consensus: false, acceptedProposals: [], invalidDefects: [], changeRequests: [], openDefects: [...t.defects], warnings,
      rejectedProposals: t.proposals.map((p) => ({ id: p.id, reason: "no consensus of Ultron + Vextron + Optimus — rejected by default (forced closure is never applied to REVIEW)" })),
    };
  }
  const pd = parseReviewDecision(d.decision);
  if (pd.found.length < 3) warnings.push(`decision is missing REVIEW lines (found: ${pd.found.join(", ") || "none"})`);
  const pIds = new Set(t.proposals.map((p) => p.id));
  const dIds = new Set(t.defects.map((x) => x.id));
  for (const id of [...pd.accepted, ...pd.changeRequests.map((x) => x.id), ...pd.rejected.map((x) => x.id)]) if (!pIds.has(id)) warnings.push(`unknown proposal id ${id} in decision — ignored`);
  for (const x of pd.invalid) if (!dIds.has(x.id)) warnings.push(`unknown defect id ${x.id} in decision — ignored`);

  // maelezo24 #2: mgongano na Ledger/brief = CR (CEO anaamua) — hata kama timu iliuandika chini ya REJECTED
  const autoCr = pd.rejected
    .filter((x) => pIds.has(x.id) && !pd.changeRequests.some((c) => c.id === x.id) && LEDGER_CONFLICT.test(x.reason) && !!conflictRefOf(x.reason))
    .map((x) => ({ id: x.id, conflictsWith: conflictRefOf(x.reason), reason: x.reason }));
  for (const x of autoCr) warnings.push(`${x.id} was rejected for contradicting ${x.conflictsWith} — recorded as a change request for the CEO (not silently dropped)`);
  const crs = [...pd.changeRequests.filter((x) => pIds.has(x.id)), ...autoCr];
  const crIds = new Set(crs.map((x) => x.id));
  const props: ReviewProposal[] = [...t.proposals];
  let tn = 1;
  for (const np of pd.newProposals) props.push({ id: `P-T${tn++}`, by: "team", title: np.title, detail: np.detail, rationale: "originated in the team discussion and agreed by all participants", evidence: [] });
  const acceptedIds = new Set([...pd.accepted.filter((id) => pIds.has(id) && !crIds.has(id)), ...props.filter((p) => p.by === "team").map((p) => p.id)]);
  const invalid = pd.invalid.filter((x) => dIds.has(x.id));
  const noReason = invalid.filter((x) => !x.reason);
  for (const x of noReason) warnings.push(`${x.id} listed as invalid without a reason — kept in the defect ledger`);
  const invalidOk = invalid.filter((x) => x.reason);
  const invalidIds = new Set(invalidOk.map((x) => x.id));
  const rejReason = new Map(pd.rejected.map((x) => [x.id, x.reason]));
  return {
    consensus: true,
    acceptedProposals: props.filter((p) => acceptedIds.has(p.id)),
    rejectedProposals: t.proposals.filter((p) => !acceptedIds.has(p.id) && !crIds.has(p.id)).map((p) => ({ id: p.id, reason: rejReason.get(p.id) || "not accepted by all three (Ultron, Vextron, Optimus)" })),
    invalidDefects: invalidOk,
    changeRequests: crs.map((x) => ({ proposalId: x.id, conflictsWith: x.conflictsWith || "ledger", reason: x.reason })),
    openDefects: t.defects.filter((x) => !invalidIds.has(x.id)),
    warnings,
  };
}

/** maelezo24 #5: hakuna defect ≥ medium + checks ZOTE PASS + hakuna uamuzi mpya unaohitaji kazi → NO_CHANGES (R0 inaweza kusign-off). */
export function isNoChanges(openDefects: Defect[], checks: EvidencePack["checks"], acceptedDecisions: number): boolean {
  return !openDefects.some((d) => BLOCKING.includes(d.severity)) && (checks || []).every((c) => c.result === "PASS") && acceptedDecisions === 0;
}

// ── Optimus: consolidate(discussion, defects) → ChangeOrder[] ────────────────
/** TASK-26: namba ya CO inayofuata = max(namba zilizopo, idadi) + 1 — ids zisizofuatana hazirudiwi (T3 halisi: CO-003 ilitolewa mara 2). */
export function nextCoNumber(cos: { id: string }[]): number {
  return Math.max(cos.length, ...cos.map((c) => Number(/(\d+)\s*$/.exec(c.id)?.[1] || 0))) + 1;
}

export interface ConsolidateInput {
  reviewId: string;
  milestoneId: string;
  round: number;
  reviewMode: ReviewMode;
  defects: Defect[];
  decisions: ReviewDecision[];
  ledgerLines: string[];
  discussion: string;
  /** routes zilizopo kwenye evidence pack (checks za browser zinahitaji route halisi) */
  routes: string[];
  /** mfano wa selectors/thamani halisi kutoka DOM metrics (Optimus aandike checks zinazotekelezeka) */
  domHints: string[];
  nextCoNo: number;
  /** TASK-26: RoundHeader (kutoka DB) — kila wito wa Optimus kwenye kitanzi cha review/fix */
  roundHeader?: string;
  /** TASK-26: ujumbe wa harness (mf. "round 2 reverted: made things worse") */
  notes?: string[];
}
export interface ConsolidateDeps {
  complete: (messages: { role: string; content: string }[], attempt: number) => Promise<string>;
  log?: (level: "info" | "warning" | "error" | "success", text: string) => void;
}
export interface ConsolidateResult {
  changeOrders: ChangeOrder[];
  /** maamuzi ambayo Optimus aligundua yanapingana na Ledger → yanakuwa CR (si CO) */
  ledgerConflicts: { decisionId: string; conflictsWith: string; reason: string }[];
  valid: boolean;
  attempts: number;
  errors: string[];
  raw: string;
}

const CHECK_SPEC = `Check union (acceptance must be a non-empty array of these objects — free text is NOT allowed; give every check a unique "id"):
- {"id","type":"dom_exists","route","selector","viewport?"}
- {"id","type":"computed_style","route","selector","property","expected"} or with "forbidden" instead of "expected"
- {"id","type":"contrast_min","route","selector","min":4.5,"viewport?"}
- {"id","type":"touch_target_min","route","selector","minPx":44,"viewport?"}
- {"id","type":"no_horizontal_overflow","routes":["/"],"viewports":["375x667","768x1024","1280x800"]}
- {"id","type":"console_clean","route":"/"}
- {"id","type":"screenshot_taken","route","viewport?","state?"}
- {"id","type":"http","url":"/path","expectStatus":200,"bodyContains?"}
- {"id","type":"grep","pattern","path","expect":"present|absent"} · {"id","type":"file_exists","path"} · {"id","type":"file_contains","path","text"} · {"id","type":"command","cmd","expectExit":0}
Viewports are "WIDTHxHEIGHT" (375x667, 768x1024, 1280x800). Browser checks must use a route listed under ROUTES and should use selectors that exist in the DOM HINTS (or the selector the fix will create).`;

function consolidatePrompt(i: ConsolidateInput): { role: string; content: string }[] {
  const system = `You are Optimus, Chair of PROFESSOR XMD COMPANY. You consolidate the team's REVIEW ${i.reviewId} into Change Orders (COs) for XMD Computer, which executes them literally and cannot ask questions. Reply with ONE JSON object only.`;
  const user = `${i.roundHeader ? `${i.roundHeader}\n` : ""}MILESTONE ${i.milestoneId} · round ${i.round} · reviewMode ${i.reviewMode}
${i.notes?.length ? `\nHARNESS NOTES:\n${i.notes.map((n) => `- ${n}`).join("\n")}\n` : ""}
LOCKED LEDGER DECISIONS:
${i.ledgerLines.join("\n") || "- (none)"}

OPEN DEFECTS (EVERY one needs ≥1 CO — a defect without a CO is a bug):
${i.defects.map((d) => `- ${d.id} [${d.severity}] ${d.title} · area ${d.area}\n    expected: ${clip(d.expected, 260)}\n    actual: ${clip(d.actual, 260)}\n    evidence: ${d.evidence.slice(0, 5).map((e) => clip(e, 150)).join(" | ")}`).join("\n") || "- (none)"}

ACCEPTED DECISIONS (agreed by Ultron + Vextron + Optimus; EVERY one needs ≥1 CO unless it contradicts a locked ledger decision or the CEO brief — then list it under ledgerConflicts instead, never as a CO):
${i.decisions.map((d) => `- ${d.id}: ${d.title} — ${clip(d.detail, 400)}`).join("\n") || "- (none)"}

TEAM DISCUSSION (excerpt):
${clip(i.discussion, 12_000)}

ROUTES: ${i.routes.join(", ") || "/"}
DOM HINTS (real selectors and values measured on the built site):
${i.domHints.slice(0, 40).join("\n") || "- (none)"}

${CHECK_SPEC}

OUTPUT:
{
  "changeOrders": [
    { "id": "CO-001", "defectIds": ["D-001"], "decisionIds": [], "attempt": 1, "priority": 1,
      "location": { "route": "/", "selector": "header nav", "files": ["optional/path"] },
      "current": "what is there now (cite the evidence)", "desired": "exactly what must be there after the fix",
      "visionNote": "why it matters for the product vision (required unless reviewMode is technical)",
      "acceptance": [ <Check objects> ], "mode": "standard" }
  ],
  "ledgerConflicts": [ { "decisionId": "R-M1-0/P-04", "conflictsWith": "A2", "reason": "..." } ]
}
Rules: priority 1 = most urgent (blockers first). A CO may cover several related defects/decisions. defectIds may be empty only when decisionIds is not empty. Use only the ids listed above.`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

/** Uthibitisho wa matokeo ya consolidate: kila CO (validateChangeOrder) + kila defect/uamuzi una CO + ids zinajulikana. */
export function validateConsolidation(raw: unknown, i: ConsolidateInput): { ok: true; changeOrders: ChangeOrder[]; ledgerConflicts: ConsolidateResult["ledgerConflicts"] } | { ok: false; errors: string[] } {
  const e: string[] = [];
  if (!raw || typeof raw !== "object") return { ok: false, errors: ["output must be a JSON object {changeOrders, ledgerConflicts}"] };
  const o = raw as { changeOrders?: unknown; ledgerConflicts?: unknown };
  const list = Array.isArray(o.changeOrders) ? o.changeOrders : null;
  if (!list) e.push("changeOrders: must be an array");
  const conflicts = (Array.isArray(o.ledgerConflicts) ? o.ledgerConflicts : []).filter((x) => x && typeof x === "object") as ConsolidateResult["ledgerConflicts"];
  const dIds = new Set(i.defects.map((d) => d.id));
  const decIds = new Set(i.decisions.map((d) => d.id));
  for (const c of conflicts) {
    if (!decIds.has(String(c.decisionId))) e.push(`ledgerConflicts: unknown decisionId ${JSON.stringify(c.decisionId)}`);
    if (!String(c.conflictsWith || "").trim()) e.push(`ledgerConflicts[${c.decisionId}].conflictsWith: required (e.g. "A2" or "CEO brief")`);
  }
  const conflictIds = new Set(conflicts.map((c) => String(c.decisionId)));
  const out: ChangeOrder[] = [];
  (list || []).forEach((co: any, k: number) => {
    const P = `changeOrders[${k}]`;
    const v = validateChangeOrder(co, i.reviewMode);
    if (!v.ok) { v.errors.forEach((x) => e.push(`${P}: ${x}`)); return; }
    for (const id of co.defectIds || []) if (!dIds.has(id)) e.push(`${P}.defectIds: unknown defect ${id}`);
    for (const id of co.decisionIds || []) {
      if (!decIds.has(id)) e.push(`${P}.decisionIds: unknown decision ${id}`);
      else if (conflictIds.has(id)) e.push(`${P}.decisionIds: ${id} is listed under ledgerConflicts — it must become a change request, not a CO`);
    }
    const ids = (co.acceptance as Check[]).map((c) => c.id);
    if (new Set(ids).size !== ids.length) e.push(`${P}.acceptance: check ids must be unique`);
    (co.acceptance as Check[]).forEach((c: any, j: number) => {
      if (typeof c.route === "string" && !c.route.startsWith("/")) e.push(`${P}.acceptance[${j}].route: must start with "/" (got ${JSON.stringify(c.route)})`);
      for (const vp of [c.viewport, ...(Array.isArray(c.viewports) ? c.viewports : [])]) if (vp !== undefined && !/^\d{3,4}x\d{3,4}$/.test(String(vp))) e.push(`${P}.acceptance[${j}].viewport: must look like 375x667 (got ${JSON.stringify(vp)})`);
    });
    out.push(v.value);
  });
  const covered = new Set(out.flatMap((c) => c.defectIds));
  for (const d of i.defects) if (!covered.has(d.id)) e.push(`defect ${d.id} has no Change Order — every open defect needs ≥1 CO`);
  const coveredDec = new Set(out.flatMap((c) => c.decisionIds || []));
  for (const d of i.decisions) if (!coveredDec.has(d.id) && !conflictIds.has(d.id)) e.push(`decision ${d.id} has no Change Order (or ledgerConflicts entry)`);
  if (e.length) return { ok: false, errors: e };
  // ids za CO zinapangwa na code (za kipekee kwa milestone), attempt = 1 kwa R0
  const renum = out.map((c, k) => ({ ...c, id: `CO-${String(i.nextCoNo + k).padStart(3, "0")}`, attempt: 1 }));
  return { ok: true, changeOrders: renum, ledgerConflicts: conflicts };
}

export async function consolidate(i: ConsolidateInput, deps: ConsolidateDeps): Promise<ConsolidateResult> {
  const base = consolidatePrompt(i);
  let messages = base;
  let raw = "", errors: string[] = ["not run"];
  for (let attempt = 1; attempt <= CONSOLIDATE_MAX_TRIES; attempt++) {
    try {
      raw = await deps.complete(messages, attempt);
    } catch (e: any) {
      errors = [`LLM call failed: ${String(e?.message || e).slice(0, 300)}`];
      deps.log?.("error", `🧾 consolidate ${i.reviewId} attempt ${attempt}: ${errors[0]}`);
      continue;
    }
    let parsed: unknown;
    try { parsed = extractJson(raw); } catch (e: any) { parsed = undefined; errors = [`invalid JSON: ${String(e?.message || e).slice(0, 200)}`]; }
    if (parsed !== undefined) {
      const v = validateConsolidation(parsed, i);
      if (v.ok) {
        deps.log?.("success", `🧾 Optimus: COs ${v.changeOrders.length} · ledger conflicts ${v.ledgerConflicts.length} (attempt ${attempt})`);
        return { changeOrders: v.changeOrders, ledgerConflicts: v.ledgerConflicts, valid: true, attempts: attempt, errors: [], raw };
      }
      errors = v.errors;
    }
    deps.log?.("warning", `🧾 consolidate ${i.reviewId} attempt ${attempt}: ${errors.length} error(s) — ${errors.slice(0, 3).join("; ").slice(0, 300)}`);
    messages = [...base, { role: "assistant", content: clip(raw, 40_000) }, { role: "user", content: `Your output is not valid. Fix EVERY error below and reply with the complete corrected JSON object only:\n${errors.slice(0, 40).map((x) => `- ${x}`).join("\n")}` }];
  }
  return { changeOrders: [], ledgerConflicts: [], valid: false, attempts: CONSOLIDATE_MAX_TRIES, errors, raw };
}

// ── Orchestrator ya hatua ya review (loop.ts inaiita; deps zote zinaingizwa) ──
export interface ReviewStoreDeps {
  get: <T>(key: string) => Promise<T | null>;
  update: <T>(key: string, mutate: (cur: T | null) => T) => Promise<T>;
}
export interface ReviewRoundInput {
  milestoneId: string;
  milestoneTitle: string;
  round: number;
  reviewMode: ReviewMode;
  pack: EvidencePack;
  ledgerLines: string[];
  domHints: string[];
  participants: string[];
  /** TASK-26: RoundHeader (kutoka DB) kwa Optimus */
  roundHeader?: string;
}
export interface ReviewRoundDeps {
  /** T23 reviewRound0 (wote wawili sambamba, huru) → findings */
  analyse: () => Promise<{ designer: Findings | null; frontend: Findings | null; meta: Record<string, unknown> }>;
  /** mjadala kupitia mashine ya agenda ya Board (boardRunner `discussAgenda`) */
  discuss: (item: ReviewAgendaItem) => Promise<DiscussionOutcome>;
  consolidate: (i: ConsolidateInput) => Promise<ConsolidateResult>;
  store: ReviewStoreDeps;
  bcast: (e: Record<string, unknown>) => void;
  blog: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
  addChip: (text: string) => void;
  now?: () => string;
}
export interface ReviewRoundResult {
  status: "NO_CHANGES" | "CHANGES" | "FAILED";
  reviewId: string;
  table: ReviewTable;
  rules: ReviewRulesResult;
  discussion: DiscussionOutcome;
  decisions: ReviewDecision[];
  changeRequests: ChangeRequest[];
  changeOrders: ChangeOrder[];
  consolidation: Omit<ConsolidateResult, "changeOrders"> | null;
  reason: string;
}
interface FindingsRecord { version: number; designer: Findings | null; frontend: Findings | null; meta: Record<string, unknown>; at: string }
interface ReviewRecord { version: number; reviewId: string; discussion: DiscussionOutcome; rules: ReviewRulesResult; table: ReviewTable; at: string }

export async function runReviewRound(inp: ReviewRoundInput, deps: ReviewRoundDeps): Promise<ReviewRoundResult> {
  const now = deps.now || (() => new Date().toISOString());
  const { milestoneId: mId, round } = inp;
  const reviewId = reviewAgendaId(mId, round);

  // 1) Findings huru (T23) — zinahifadhiwa; resume haiziendeshi tena
  let fr = await deps.store.get<FindingsRecord>(findingsKey(mId, round));
  if (!fr) {
    const a = await deps.analyse();
    fr = await deps.store.update<FindingsRecord>(findingsKey(mId, round), () => ({ version: 1, designer: a.designer, frontend: a.frontend, meta: a.meta, at: now() }));
  }
  deps.bcast({
    type: "reviewFindings", id: mId, round, reviewId,
    designer: fr.designer ? { defects: fr.designer.defects.length, proposals: fr.designer.proposals.length } : null,
    frontend: fr.frontend ? { defects: fr.frontend.defects.length, proposals: fr.frontend.proposals.length } : null,
    meta: fr.meta,
  });

  // 2) jedwali lenye ids (defect ids za kipekee kwa session)
  const ledger = (await deps.store.get<{ version: number; defects: Defect[] }>(DEFECTS_KEY))?.defects || [];
  const prior = ledger.filter((d) => !(d.milestoneId === mId && d.foundInRound === round));
  const maxNo = prior.reduce((m, d) => Math.max(m, Number(d.id.slice(2)) || 0), 0);
  const table = numberFindings({ designer: fr.designer, frontend: fr.frontend }, { milestoneId: mId, round, nextDefectNo: maxNo + 1 });

  // 3) mjadala wa TIMU (mashine ya agenda) — matokeo yanahifadhiwa; resume hairudii mjadala uliokamilika
  let rv = await deps.store.get<ReviewRecord>(reviewKey(mId, round));
  if (!rv) {
    const item = makeReviewAgendaItem({
      reviewId, milestoneId: mId, milestoneTitle: inp.milestoneTitle, round, reviewMode: inp.reviewMode, table,
      ledgerLines: inp.ledgerLines,
      checkLines: (inp.pack.checks || []).map((c) => `- check:${c.id} [${c.type}] ${c.result} — ${clip(c.detail, 200)}`),
      evidenceRefs: (inp.pack.screenshots || []).map((s) => `- ${s.id}: ${s.route} @${s.viewport} ${s.state}`),
      participants: inp.participants,
    });
    deps.addChip(`🧑‍⚖️ ${reviewId}: mjadala wa timu (${inp.participants.map(nameOf).join(" + ")}) — defects ${table.defects.length} · proposals ${table.proposals.length}`);
    const discussion = await deps.discuss(item);
    const rules = applyReviewRules(table, { consensus: discussion.consensus, decision: discussion.decision, participants: inp.participants });
    rv = await deps.store.update<ReviewRecord>(reviewKey(mId, round), () => ({
      version: 1, reviewId, table, rules, at: now(),
      discussion: { ...discussion, transcript: discussion.transcript.map((t) => ({ ...t, text: t.text.slice(0, 8000) })).slice(-60) },
    }));
  }
  const { rules, discussion } = rv;
  for (const w of rules.warnings) deps.blog("warning", `🧑‍⚖️ ${reviewId}: ${w}`);

  // 4) defect ledger: defects zote isipokuwa zilizobatilishwa na reviewers WOTE (sababu inarekodiwa kwenye review:…)
  await deps.store.update<{ version: number; defects: Defect[] }>(DEFECTS_KEY, (cur) => ({
    version: 1,
    defects: [...(cur?.defects || []).filter((d) => !(d.milestoneId === mId && d.foundInRound === round)), ...rules.openDefects],
  }));

  const decisionsAll: ReviewDecision[] = rules.acceptedProposals.map((p) => ({
    id: `${reviewId}/${p.id}`, reviewId, milestoneId: mId, round, proposalId: p.id, title: p.title, detail: p.detail,
    proposedBy: p.by, agreedBy: inp.participants, at: now(),
  }));
  const crFrom = (proposalId: string, conflictsWith: string, reason: string, k: number): ChangeRequest => {
    const p = table.proposals.find((x) => x.id === proposalId) || rules.acceptedProposals.find((x) => x.id === proposalId);
    return { id: `CR-${mId}-${round}-${String(k).padStart(2, "0")}`, reviewId, proposalId, title: p?.title || proposalId, detail: p?.detail || "", conflictsWith, reason, status: "OPEN", raisedBy: inp.participants };
  };
  let changeRequests: ChangeRequest[] = rules.changeRequests.map((c, k) => crFrom(c.proposalId, c.conflictsWith, c.reason, k + 1));

  // 5) NO_CHANGES?
  const noChanges = isNoChanges(rules.openDefects, inp.pack.checks, decisionsAll.length);
  let changeOrders: ChangeOrder[] = [];
  let consolidation: ReviewRoundResult["consolidation"] = null;
  let decisions = decisionsAll;
  let status: ReviewRoundResult["status"] = "NO_CHANGES";
  let reason = "no defect ≥ medium, all checks PASS, no accepted proposals";
  if (noChanges) {
    // defects ndogo (minor) zinabebwa kwenda milestone inayofuata (INHERITED) — hakuna CO kwa R0 inayosign-off
    if (rules.openDefects.length) {
      await deps.store.update<{ version: number; defects: Defect[] }>(DEFECTS_KEY, (cur) => ({
        version: 1, defects: (cur?.defects || []).map((d) => (d.milestoneId === mId && d.foundInRound === round ? { ...d, status: "INHERITED" as const } : d)),
      }));
    }
  } else {
    // 6) Optimus: COs (kila defect + kila uamuzi ≥1 CO); maamuzi yanayopingana na Ledger → CR
    const prevCos = (await deps.store.get<{ version: number; changeOrders: ChangeOrder[] }>(cosKey(mId)))?.changeOrders || [];
    const res = await deps.consolidate({
      reviewId, milestoneId: mId, round, reviewMode: inp.reviewMode, defects: rules.openDefects, decisions: decisionsAll, roundHeader: inp.roundHeader,
      ledgerLines: inp.ledgerLines, discussion: discussion.transcript.map((t) => `${t.name}: ${t.text}`).join("\n\n"),
      routes: [...new Set((inp.pack.screenshots || []).map((s) => s.route))], nextCoNo: nextCoNumber(prevCos),
      domHints: inp.domHints.length ? inp.domHints : [...new Set([...table.defects, ...table.proposals].flatMap((x) => x.evidence).filter((e) => / dom: /.test(e)))],
    });
    const { changeOrders: cos, ...meta } = res;
    consolidation = meta;
    if (!res.valid) {
      status = "FAILED";
      reason = `consolidation invalid after ${res.attempts} attempt(s): ${res.errors.slice(0, 3).join("; ")}`;
    } else {
      changeOrders = cos;
      const conflictIds = new Set(res.ledgerConflicts.map((c) => c.decisionId));
      decisions = decisionsAll.filter((d) => !conflictIds.has(d.id));
      changeRequests = [...changeRequests, ...res.ledgerConflicts.map((c, k) => crFrom(c.decisionId.split("/").pop() || c.decisionId, c.conflictsWith, c.reason, changeRequests.length + k + 1))];
      await deps.store.update<{ version: number; changeOrders: ChangeOrder[] }>(cosKey(mId), (cur) => ({ version: 1, changeOrders: [...(cur?.changeOrders || []).filter((c) => !cos.some((x) => x.id === c.id)), ...cos] }));
      status = "CHANGES";
      reason = `${rules.openDefects.length} open defect(s), ${decisions.length} accepted decision(s) → ${cos.length} CO(s)`;
    }
  }
  // 7) maamuzi mapya (ledger ya review) + CRs (CEO anaamua) — hazihariri Ledger ya Board kimya kimya
  if (decisions.length) await deps.store.update<{ version: number; decisions: ReviewDecision[] }>(DECISIONS_KEY, (cur) => ({ version: 1, decisions: [...(cur?.decisions || []).filter((d) => d.reviewId !== reviewId), ...decisions] }));
  if (changeRequests.length) await deps.store.update<{ version: number; changeRequests: ChangeRequest[] }>(CRS_KEY, (cur) => ({ version: 1, changeRequests: [...(cur?.changeRequests || []).filter((c) => c.reviewId !== reviewId), ...changeRequests] }));

  deps.bcast({
    type: "reviewDecision", id: mId, round, reviewId, consensus: rules.consensus, closeReason: discussion.closeReason, turns: discussion.turns,
    searches: discussion.searches.length, accepted: decisions.map((d) => d.id), rejected: rules.rejectedProposals, invalidDefects: rules.invalidDefects,
    changeRequests: changeRequests.map((c) => ({ id: c.id, proposalId: c.proposalId, conflictsWith: c.conflictsWith })), openDefects: rules.openDefects.map((d) => d.id), status,
  });
  if (status !== "NO_CHANGES") deps.bcast({ type: "changeOrders", id: mId, round, reviewId, valid: status === "CHANGES", count: changeOrders.length, changeOrders, errors: consolidation?.errors || [] });
  deps.addChip(`🧑‍⚖️ ${reviewId}: ${status} — ${reason}${changeRequests.length ? ` · CR ${changeRequests.length} kwa CEO` : ""}`);
  deps.blog(status === "FAILED" ? "error" : "success", `🧑‍⚖️ ${reviewId}: consensus ${rules.consensus ? "✓" : "✗ (proposals zote REJECTED)"} · defects wazi ${rules.openDefects.length} · batili ${rules.invalidDefects.length} · maamuzi ${decisions.length} · CR ${changeRequests.length} · COs ${changeOrders.length} → ${status}.`);
  return { status, reviewId, table, rules, discussion, decisions, changeRequests, changeOrders, consolidation, reason };
}

// ── Test hook (XMD_TEST_HOOKS=1 + XMD_TEST_REVIEW_INPUT PEKEE) ───────────────
/** Ingizo la REVIEW halisi bila Computer: plan/evidence/findings/ledger kutoka faili — mjadala (agenda machine), Optimus
 *  consolidate na store ni HALISI. Inert kabisa bila flags zote mbili. */
export interface TestReviewInput {
  milestoneId?: string;
  pack: EvidencePack;
  findings: { designer: Findings | null; frontend: Findings | null };
  ledger?: { agenda_index: number; agenda_item: string; status: string; decision_summary?: string; decision_detail?: string }[];
  planMarkdown?: string;
  buildReport?: string;
  extraParticipants?: string[];
}
export function testReviewInput(env: Record<string, string | undefined> = process.env, read: (p: string) => string = (p) => readFileSync(p, "utf8")): TestReviewInput | null {
  if (env.XMD_TEST_HOOKS !== "1" || !env.XMD_TEST_REVIEW_INPUT) return null;
  try {
    const j = JSON.parse(read(env.XMD_TEST_REVIEW_INPUT)) as TestReviewInput;
    return j && j.pack && j.findings ? j : null;
  } catch { return null; }
}
