// src/lib/milestone/reviewMemory.ts — TASK-33 (MISSION ONE, uamuzi wa CEO 2026-10-22): MINI-REPORT YA REVIEW INAYOKUA (rolling).
//
// Rekodi MOJA kwa milestone (`memo:Mk`) — sehemu zinaongezwa, hazifutwi:
//   review (R0 baada ya mjadala wa timu · reviewers 2 wanathibitisha MARA MOJA · code inakagua kila D/P/CO limetajwa)
//   fix (kila raundi ya Computer) · verify (kila uthibitisho) · sync · discussion (requestDiscussion) · redecide · escalation · close
// Data (facts) zinajazwa na CODE kutoka rekodi — hazibuniwi. Optimus anaongeza maelezo (note) tu; bila LLM (tests / lane haipo)
// sehemu inabaki ya code peke yake. Kinachopewa reviewers / Computer: ingizo 3 za mwisho KAMILI, za zamani zimefupishwa.
// Hakuna transcript kwenye kumbukumbu hii (maelezo ya CEO: "Sio transcript").

import type { ChangeOrder, Defect } from "./types";
import type { ReviewerId } from "./review";

export const memoKey = (milestoneId: string) => `memo:${milestoneId}`;
/** ingizo za mwisho zinazopewa reviewers / Computer KAMILI; za zamani zinafupishwa */
export const MEMO_FULL_LAST = 3;
/** TASK-33 (#4): mjadala ulioombwa (requestDiscussion) katika raundi za uthibitisho — mfupi na wenye kikomo (E8 M3 R2 ulikuwa zamu 13) */
export const REQUESTED_DISCUSSION_MAX_TURNS = 6;
const NOTE_TRIES = 2;
const COMPACT_CHARS = 500;

export type MemoKind = "review" | "fix" | "verify" | "sync" | "discussion" | "redecide" | "escalation" | "close";
const KIND_LABEL: Record<MemoKind, string> = {
  review: "review (team discussion)", fix: "fix", verify: "verify", sync: "sync", discussion: "requested discussion",
  redecide: "redecide", escalation: "escalation", close: "milestone close",
};

export interface MemoEntry {
  /** \`${kind}:R${round}\` (+ kiambishi) — idempotent: resume haiandiki upya */
  id: string;
  kind: MemoKind;
  milestoneId: string;
  round: number;
  at: string;
  /** "M3 · R2 · verify · 20:48 UTC" */
  head: string;
  /** data za code (chanzo cha ukweli) */
  facts: string;
  /** maelezo ya Optimus ("" = code peke yake) */
  note: string;
  /** vitambulisho vinavyohusika (D-xxx, P-xx, CO-xxx) — Optimus lazima avitaje */
  ids: string[];
  /** vitambulisho ambavyo Optimus HAKUVITAJA (code coverage check) */
  missing: string[];
  by: "optimus" | "code";
}
export interface MemoConfirmation { reviewer: ReviewerId; agent: string; name: string; verdict: "CONFIRM" | "AMEND" | "NO_ANSWER"; note: string }
export interface MemoRecord { version: number; milestoneId: string; entries: MemoEntry[]; confirmations?: MemoConfirmation[]; confirmedAt?: string }

export type MemoMsg = { role: "system" | "user"; content: string };
export type MemoComplete = (agentId: string, purpose: string, messages: MemoMsg[]) => Promise<string>;
export interface MemoStore {
  get: <T>(key: string) => Promise<T | null>;
  update: <T>(key: string, mutate: (cur: T | null) => T) => Promise<T>;
}

const cap = (s: unknown, n: number) => { const t = String(s ?? "").replace(/\s+/g, " ").trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };
const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const uniq = <T,>(a: T[]) => [...new Set(a)];

export function memoHead(milestoneId: string, round: number, kind: MemoKind, at: string): string {
  const d = new Date(at);
  const hm = Number.isNaN(d.getTime()) ? "" : ` · ${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")} UTC`;
  return `${milestoneId} · R${round} · ${KIND_LABEL[kind]}${hm}`;
}

/** Vitambulisho ambavyo havijatajwa kwenye maandishi ("P-01" haulingani na "P-012"). */
export function missingIds(text: string, ids: string[]): string[] {
  const t = String(text || "");
  return uniq(ids.filter(Boolean)).filter((id) => !new RegExp(`(^|[^A-Za-z0-9])${escRe(id)}(?![0-9])`, "i").test(t));
}

/* ============================== 1) R0 — baada ya mjadala wa timu ============================== */

export interface R0MemoInput {
  milestoneId: string;
  reviewId: string;
  consensus: boolean;
  closeReason: string;
  /** defects ZOTE za jedwali la R0 (pamoja na zilizobatilishwa) */
  defects: Defect[];
  invalidDefects: { id: string; reason: string }[];
  accepted: { id: string; title: string; detail: string; by: string }[];
  rejected: { id: string; reason: string }[];
  changeRequests: { proposalId: string; conflictsWith: string; reason: string }[];
  changeOrders: ChangeOrder[];
}

/** CEO #2: kila defect, kila pendekezo lililokubaliwa na kila CO lazima litajwe. */
export function r0RequiredIds(i: Pick<R0MemoInput, "defects" | "accepted" | "changeOrders">): string[] {
  return uniq([...i.defects.map((d) => d.id), ...i.accepted.map((p) => p.id), ...i.changeOrders.map((c) => c.id)]);
}

export function r0Facts(i: R0MemoInput): string {
  const inv = new Map(i.invalidDefects.map((x) => [x.id, x.reason]));
  const L: string[] = [`Discussion ${i.reviewId}: ${i.consensus ? "consensus reached" : "NO consensus — every proposal rejected by default"} (${cap(i.closeReason, 160) || "closed"}).`];
  L.push("DEFECTS:", ...(i.defects.length ? i.defects.map((d) => `- ${d.id} [${d.severity}] ${cap(d.title, 140)} — by ${d.reportedBy.join(", ")} · ${inv.has(d.id) ? `INVALID (${cap(inv.get(d.id), 160)})` : "OPEN → fix"}`) : ["- (none)"]));
  L.push("ACCEPTED PROPOSALS:", ...(i.accepted.length ? i.accepted.map((p) => `- ${p.id} ${cap(p.title, 140)} — by ${p.by}: ${cap(p.detail, 200)}`) : ["- (none)"]));
  L.push("REJECTED PROPOSALS:", ...(i.rejected.length ? i.rejected.map((p) => `- ${p.id} — ${cap(p.reason, 200) || (i.consensus ? "rejected" : "no consensus")}`) : ["- (none)"]));
  if (i.changeRequests.length) L.push("CHANGE REQUESTS (CEO decides):", ...i.changeRequests.map((c) => `- ${c.proposalId} conflicts with ${c.conflictsWith}: ${cap(c.reason, 160)}`));
  L.push("CHANGE ORDERS:", ...(i.changeOrders.length ? i.changeOrders.map((c) => `- ${c.id} → ${[...c.defectIds, ...(c.decisionIds || [])].join(", ") || "-"} · desired: ${cap(c.desired, 200)} · checks ${(c.acceptance || []).length}`) : ["- (none — no changes needed)"]));
  return L.join("\n");
}

/** CEO test (b): pointi iliyokubaliwa ikiachwa kwenye maandishi ya Optimus → ukaguzi wa code unashindwa. */
export function checkR0Coverage(text: string, i: Pick<R0MemoInput, "defects" | "accepted" | "changeOrders">): { ok: boolean; missing: string[] } {
  const missing = missingIds(text, r0RequiredIds(i));
  return { ok: missing.length === 0, missing };
}

/* ============================== 2) fix — baada ya raundi ya Computer ============================== */

export interface FixFactsInput {
  round: number;
  finalState: string;
  ok: boolean;
  reason?: string;
  cos: { orderId: string; verdict: string; receiptStatus: string; receipt: string; touched: string[]; phantom?: string[]; diff: { added: number; deleted: number }; blockedReason?: string; checks?: { pass: number; fail: number; error: number } }[];
  unlisted: string[];
  flags: string[];
  notAttempted: string[];
  global?: { pass: number; fail: number; error: number };
}
export function fixFacts(i: FixFactsInput): string {
  const ck = (c?: { pass: number; fail: number; error: number }) => (c ? `checks ${c.pass}P/${c.fail}F/${c.error}E` : "checks not run");
  return [
    `XMD Computer round ${i.round}: ${i.finalState}${i.ok ? "" : ` (FAILED${i.reason ? `: ${cap(i.reason, 200)}` : ""})`}`,
    ...i.cos.map((c) => `- ${c.orderId}: ${c.verdict} · receipt ${c.receiptStatus} (${c.receipt}) · files ${c.touched.join(", ") || "none"} (+${c.diff.added}/-${c.diff.deleted}) · ${ck(c.checks)}${c.phantom?.length ? ` · receipt claims unchanged files: ${c.phantom.join(", ")}` : ""}${c.blockedReason ? ` · blocked: ${cap(c.blockedReason, 160)}` : ""}`),
    ...(i.notAttempted.length ? [`- NOT_ATTEMPTED (NO-OP): ${i.notAttempted.join(", ")}`] : []),
    ...(i.unlisted.length ? [`- UNLISTED_CHANGE: ${i.unlisted.slice(0, 12).join(", ")}`] : []),
    ...(i.flags.length ? [`- flags: ${i.flags.join(", ")}`] : []),
    `- global ${ck(i.global)}`,
  ].join("\n");
}

/* ============================== 3) verify — baada ya uthibitisho ============================== */

export interface VerifyFactsInput {
  round: number;
  names: Record<ReviewerId, string>;
  cos: { orderId: string; verdict: string; reason: string; designer: string | null; frontend: string | null }[];
  notes: Partial<Record<ReviewerId, Record<string, string>>>;
  added: { id: string; title: string; severity: string }[];
  fixed: string[];
  reopened: string[];
  regressions: number;
  reverted?: string;
  outcome: string;
  next: { next: string; reason: string };
  open: { id: string; severity: string; attempts: number }[];
  newCos: string[];
}
export function verifyFacts(i: VerifyFactsInput): string {
  return [
    `Verification of round ${i.round} → ${i.next.next}: ${cap(i.next.reason, 220)}`,
    ...i.cos.map((c) => `- ${c.orderId}: ${c.verdict} (${cap(c.reason, 140)}) · ${i.names.designer}: ${c.designer || "-"}${i.notes.designer?.[c.orderId] ? ` "${cap(i.notes.designer[c.orderId], 160)}"` : ""} · ${i.names.frontend}: ${c.frontend || "-"}${i.notes.frontend?.[c.orderId] ? ` "${cap(i.notes.frontend[c.orderId], 160)}"` : ""}`),
    `- defects fixed: ${i.fixed.join(", ") || "none"} · reopened: ${i.reopened.join(", ") || "none"} · new: ${i.added.map((d) => `${d.id} [${d.severity}] ${cap(d.title, 80)}`).join("; ") || "none"}`,
    `- regressions: ${i.regressions} · round outcome ${i.outcome}${i.reverted ? ` · REVERTED: ${cap(i.reverted, 160)}` : ""}`,
    `- still open: ${i.open.map((d) => `${d.id} (${d.severity}, attempts ${d.attempts})`).join(", ") || "none"}${i.newCos.length ? ` · next round COs: ${i.newCos.join(", ")}` : ""}`,
  ].join("\n");
}

/* ============================== 4) sync · 5) discussion · 6/7) escalation · 8) close ============================== */

export function syncFacts(round: number, names: Record<ReviewerId, string>, items: { orderId: string; designer: string; frontend: string; designerNote?: string; frontendNote?: string }[], after: Partial<Record<ReviewerId, Record<string, string>>> | null): string {
  return [
    `Reviewers disagreed in round ${round} on ${items.map((x) => x.orderId).join(", ")} → ONE sync turn.`,
    ...items.map((x) => `- ${x.orderId}: ${names.designer} ${x.designer}${x.designerNote ? ` ("${cap(x.designerNote, 140)}")` : ""} vs ${names.frontend} ${x.frontend}${x.frontendNote ? ` ("${cap(x.frontendNote, 140)}")` : ""} → after sync: ${names.designer} ${after?.designer?.[x.orderId] || "-"} · ${names.frontend} ${after?.frontend?.[x.orderId] || "-"}`),
  ].join("\n");
}

export function discussionFacts(round: number, asked: { name: string; reason: string }[], d: { consensus: boolean; decision: string; closeReason: string; turns: number } | null, maxTurns: number): string {
  return [
    `Team discussion requested in round ${round} by ${asked.map((a) => `${a.name} ("${cap(a.reason, 200)}")`).join(" + ")} — max ${maxTurns} turns.`,
    d ? `- outcome: ${d.consensus ? "consensus" : "no consensus"} after ${d.turns} turns (${cap(d.closeReason, 140)})${d.decision ? ` · decided: ${cap(d.decision, 500)}` : ""}` : "- the discussion did not take place (error)",
  ].join("\n");
}

export interface EscEventLike {
  coId: string; attempt: number; mode: string; defectIds: string[]; resultIds: string[]; valid: boolean;
  diagnosis?: { cause: string; reason: string }; laneSwitch?: string;
  redecide?: { outcome: string; reason: string; turns: number; approvedBy: string[]; requirement?: string };
}
export function escalationFactsText(round: number, events: EscEventLike[], amendments: { id: string; defectId: string }[] = []): string {
  return [
    `Escalation after round ${round}:`,
    ...events.map((e) => `- ${e.coId} (${e.defectIds.join(", ")}) attempt ${e.attempt} → ${e.mode}${e.diagnosis ? ` · diagnosis ${e.diagnosis.cause}: ${cap(e.diagnosis.reason, 160)}` : ""} → ${e.resultIds.join(", ") || "no order"}${e.laneSwitch ? ` · ${e.laneSwitch}` : ""}${e.valid ? "" : " (fallback)"}`),
  ].join("\n") + (amendments.length ? `\n- ledger amendments: ${amendments.map((a) => `${a.id} (${a.defectId})`).join(", ")}` : "");
}
export function redecideFactsText(round: number, events: EscEventLike[], amendments: { id: string; defectId: string }[] = []): string {
  return [
    `Redecide after round ${round} (attempt ≥5, max 4 turns):`,
    ...events.map((e) => `- ${e.defectIds.join(", ")} (${e.coId}): ${e.redecide?.outcome || "?"} after ${e.redecide?.turns ?? 0} turns — ${cap(e.redecide?.reason, 220)} · approved by ${(e.redecide?.approvedBy || []).join(", ") || "-"}${e.redecide?.requirement ? ` · new requirement: ${cap(e.redecide.requirement, 200)}` : ""}${e.resultIds.length ? ` → ${e.resultIds.join(", ")}` : ""}`),
    ...(amendments.length ? [`- ledger entries: ${amendments.map((a) => `${a.id} (${a.defectId})`).join(", ")}`] : []),
  ].join("\n");
}

export function closeFacts(i: { status: string; reason: string; round: number; open: { id: string; severity: string }[]; waived: string[]; retried?: boolean }): string {
  return [
    `Milestone closed: ${i.status} after round ${i.round}${i.reason ? ` — ${cap(i.reason, 240)}` : ""}`,
    `- defects left open: ${i.open.map((d) => `${d.id} (${d.severity})`).join(", ") || "none"} · waived: ${i.waived.join(", ") || "none"}${i.retried ? " · BLOCKED retry was used" : ""}`,
  ].join("\n");
}

/* ============================== Optimus: maelezo (note) + coverage ============================== */

const NOTE_RULES: Record<MemoKind, string> = {
  review: `Write the REVIEW MINI-REPORT in plain Markdown (no JSON, max ~350 words) with three short sections:
**Agreed** — every accepted point and every valid defect, each with its reason.
**Rejected / no consensus** — every rejected proposal and every invalid defect, each with its reason (say "no consensus" where that was the case).
**Change orders** — for every CO: what it targets and how success will be measured.`,
  fix: "In 1–3 sentences say WHY this fix round went the way it did (what was applied, what was not and why). Plain text.",
  verify: "In 1–3 sentences say WHY each change order passed or failed and what must happen next. Plain text.",
  sync: "In 1–3 sentences record each disputed change order, each reviewer's position and the outcome after the sync turn. Plain text.",
  discussion: "In 2–4 sentences record who asked for the discussion and why, what was decided and any ledger change. Plain text.",
  redecide: "In 2–4 sentences record KEEP / MODIFY / WAIVE for every defect with its reason and who approved it. Plain text.",
  escalation: "In 1–3 sentences record the diagnosed cause and how each change order was rewritten or split. Plain text.",
  close: "In 1–3 sentences record the final state of the milestone, rounds used, defects left and waivers. Plain text.",
};

export function notePrompt(kind: MemoKind, head: string, facts: string, ids: string[], context: string, missingBefore: string[]): MemoMsg[] {
  const system = [
    "You are Optimus, the Product Manager of PROFESSOR XMD COMPANY. You keep the milestone's REVIEW MINI-REPORT: the shared, written memory that every later verification round and XMD Computer will read instead of the discussion transcript.",
    NOTE_RULES[kind],
    ids.length ? "Mention EVERY id under REQUIRED IDS literally (exactly as written, e.g. D-004, P-02, CO-003). Never invent ids, numbers or facts — the FACTS block (written by code) is the source of truth." : "Never invent ids, numbers or facts — the FACTS block (written by code) is the source of truth.",
  ].join("\n\n");
  const user = [
    `SECTION: ${head}`,
    `FACTS (code):\n${facts}`,
    ...(context ? [`CONTEXT:\n${context}`] : []),
    ...(ids.length ? [`REQUIRED IDS: ${ids.join(", ")}`] : []),
    ...(missingBefore.length ? [`YOUR PREVIOUS ANSWER OMITTED: ${missingBefore.join(", ")} — mention every one of them this time.`] : []),
    "Write the section text only.",
  ].join("\n\n");
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

const cleanNote = (s: string) => String(s || "").replace(/^```[a-z]*\s*/i, "").replace(/```\s*$/i, "").trim().slice(0, 6000);

export async function optimusNote(o: { kind: MemoKind; milestoneId: string; round: number; head: string; facts: string; ids: string[]; context?: string; complete?: MemoComplete; tries?: number; log?: (lvl: "info" | "warning", t: string) => void }): Promise<{ note: string; missing: string[]; by: "optimus" | "code"; attempts: number }> {
  if (!o.complete) return { note: "", missing: [], by: "code", attempts: 0 };
  let note = "";
  let missing: string[] = [];
  let attempts = 0;
  for (let a = 1; a <= (o.tries ?? (o.ids.length ? NOTE_TRIES : 1)); a++) {
    attempts = a;
    try { note = cleanNote(await o.complete("pm", `memo:${o.kind}:${o.milestoneId}:R${o.round}:a${a}`, notePrompt(o.kind, o.head, o.facts, o.ids, o.context || "", missing))); }
    catch (e: any) { o.log?.("warning", `📝 ${o.head}: Optimus hakuandika maelezo (${String(e?.message || e).slice(0, 140)}) — data za code zinabaki.`); break; }
    missing = missingIds(note, o.ids);
    if (note && !missing.length) return { note, missing: [], by: "optimus", attempts };
  }
  if (!note) return { note: "", missing: [], by: "code", attempts };
  return { note, missing, by: "optimus", attempts };
}

/* ============================== uthibitisho wa R0 na reviewers wote (MARA MOJA) ============================== */

export function confirmPrompt(name: string, role: string, memoText: string, own: string): MemoMsg[] {
  return [
    { role: "system", content: `You are ${name}, the ${role} of PROFESSOR XMD COMPANY. Optimus wrote the review mini-report of the team discussion you took part in. It becomes the ONLY memory of that discussion for every later verification round — anything missing or wrong in it is lost. Check it ONCE against your own findings and what was agreed.
Answer on the FIRST line with exactly "CONFIRM" if it is correct and complete, or "AMEND:" followed by the precise corrections (which id, what is wrong or missing). Max 120 words. No JSON.` },
    { role: "user", content: `REVIEW MINI-REPORT (Optimus):\n${memoText}\n\nYOUR OWN R0 FINDINGS:\n${own || "(none)"}\n\nCONFIRM or AMEND:` },
  ];
}
export function parseConfirm(raw: string): { verdict: "CONFIRM" | "AMEND"; note: string } | null {
  const t = String(raw || "").replace(/^[\s*`#>_-]+/, "").trim();
  if (/^AMEND\b/i.test(t)) return { verdict: "AMEND", note: cap(t.replace(/^AMEND[\s:*_`.-]*/i, ""), 900) };
  if (/^CONFIRM\b/i.test(t)) return { verdict: "CONFIRM", note: cap(t.replace(/^CONFIRM(ED)?[\s:*_`.!-]*/i, ""), 300) };
  return null;
}

export async function confirmR0(o: { memoText: string; milestoneId: string; reviewers: { reviewer: ReviewerId; agent: string; name: string; role: string; own: string }[]; complete?: MemoComplete }): Promise<MemoConfirmation[]> {
  return Promise.all(o.reviewers.map(async (r): Promise<MemoConfirmation> => {
    if (!o.complete) return { reviewer: r.reviewer, agent: r.agent, name: r.name, verdict: "NO_ANSWER", note: "no LLM (code-only memo)" };
    try {
      const p = parseConfirm(await o.complete(r.agent, `memo-confirm:${o.milestoneId}:R0:${r.reviewer}`, confirmPrompt(r.name, r.role, o.memoText, r.own)));
      return p ? { reviewer: r.reviewer, agent: r.agent, name: r.name, ...p } : { reviewer: r.reviewer, agent: r.agent, name: r.name, verdict: "NO_ANSWER", note: "answer was neither CONFIRM nor AMEND" };
    } catch (e: any) { return { reviewer: r.reviewer, agent: r.agent, name: r.name, verdict: "NO_ANSWER", note: cap(e?.message || e, 160) }; }
  }));
}

/* ============================== store: kuongeza sehemu (idempotent) ============================== */

export const memoEntryId = (kind: MemoKind, round: number, suffix?: string) => `${kind}:R${round}${suffix ? `:${suffix}` : ""}`;

export async function addMemoEntry(store: MemoStore, o: {
  milestoneId: string; round: number; kind: MemoKind; facts: string; ids?: string[]; idSuffix?: string; context?: string; at?: string;
  complete?: MemoComplete; log?: (lvl: "info" | "warning", t: string) => void;
}): Promise<{ entry: MemoEntry; created: boolean }> {
  const id = memoEntryId(o.kind, o.round, o.idSuffix);
  const cur = await store.get<MemoRecord>(memoKey(o.milestoneId));
  const had = cur?.entries.find((e) => e.id === id);
  if (had) return { entry: had, created: false };
  const at = o.at || new Date().toISOString();
  const head = memoHead(o.milestoneId, o.round, o.kind, at);
  const ids = uniq(o.ids || []);
  const n = await optimusNote({ kind: o.kind, milestoneId: o.milestoneId, round: o.round, head, facts: o.facts, ids, context: o.context, complete: o.complete, log: o.log });
  const entry: MemoEntry = { id, kind: o.kind, milestoneId: o.milestoneId, round: o.round, at, head, facts: o.facts, note: n.note, ids, missing: n.missing, by: n.by };
  if (n.missing.length) o.log?.("warning", `📝 ${head}: ukaguzi wa code — Optimus hakutaja ${n.missing.join(", ")} (data za code zinabaki kamili).`);
  const rec = await store.update<MemoRecord>(memoKey(o.milestoneId), (c) => ({
    version: 1, ...(c || {}), milestoneId: o.milestoneId,
    entries: (c?.entries || []).some((e) => e.id === id) ? c!.entries : [...(c?.entries || []), entry],
  }));
  return { entry: rec.entries.find((e) => e.id === id) || entry, created: true };
}

/** Uthibitisho wa reviewers unaandikwa kwenye sehemu ya R0 (marekebisho yao yanaongezwa — hayafuti chochote). */
export async function saveConfirmations(store: MemoStore, milestoneId: string, entryId: string, list: MemoConfirmation[], at = new Date().toISOString()): Promise<MemoRecord> {
  return store.update<MemoRecord>(memoKey(milestoneId), (c) => ({
    version: 1, milestoneId, ...(c || {}), entries: c?.entries || [], confirmations: list, confirmedAt: at,
  }));
}

/* ============================== kusoma: prompt ya reviewers / Computer ============================== */

export function entryText(e: MemoEntry, conf?: MemoConfirmation[]): string {
  const c = e.kind === "review" && conf?.length ? `\nReviewer confirmation: ${conf.map((x) => `${x.name} ${x.verdict}${x.note && x.verdict === "AMEND" ? ` — ${x.note}` : ""}`).join(" · ")}` : "";
  return `### ${e.head}\n${e.facts}${e.note ? `\nOptimus: ${e.note}` : ""}${e.missing.length ? `\n(code coverage check: Optimus omitted ${e.missing.join(", ")} — the facts above are complete)` : ""}${c}`;
}
export function entryCompact(e: MemoEntry): string {
  return `### ${e.head} (compressed)\n${cap(e.note || e.facts, COMPACT_CHARS)}${e.ids.length ? `\nids: ${e.ids.join(", ")}` : ""}`;
}
/** CEO #3: ingizo 3 za mwisho KAMILI, za zamani zimefupishwa. */
export function renderMemo(rec: MemoRecord | null | undefined, fullLast = MEMO_FULL_LAST): string {
  const es = rec?.entries || [];
  if (!es.length) return "";
  return es.map((e, k) => (k >= es.length - fullLast ? entryText(e, rec?.confirmations) : entryCompact(e))).join("\n\n");
}

/** CEO #3/#5: historia ya kila defect (majaribio, sababu za kushindwa, COs zilizopita). Defects ambazo hazijajaribiwa haziorodheshwi. */
export function defectHistoryLines(defects: Defect[], milestoneId: string, cos: ChangeOrder[], max = 80): string[] {
  const out: string[] = [];
  for (const d of defects.filter((x) => x.milestoneId === milestoneId && (x.attempts > 0 || (x.history || []).length))) {
    out.push(`- ${d.id} [${d.status}, ${d.severity}, attempts ${d.attempts}] ${cap(d.title, 140)}`);
    for (const h of d.history || []) out.push(`  · R${h.round}: ${h.result}${h.mode ? ` (${h.mode})` : ""} — ${cap(h.cause, 200)}${h.diagnosis ? ` · diagnosis ${h.diagnosis.cause}: ${cap(h.diagnosis.reason, 160)}` : ""}${h.outcome ? ` · ${h.outcome}` : ""}${h.laneSwitch ? ` · ${h.laneSwitch}` : ""}`);
    for (const c of cos.filter((x) => x.defectIds.includes(d.id))) out.push(`  · ${c.id} (attempt ${c.attempt}${c.mode ? `, ${c.mode}` : ""}): ${cap(c.desired, 180)}`);
  }
  return out.length > max ? [...out.slice(0, max - 1), `- … ${out.length - max + 1} more lines`] : out;
}

/** CEO #3: findings ZAKE kamili za R0 (si vichwa tu) — kutoka jedwali la review:Mk:R0. */
export function ownR0Findings(table: { defects: Defect[]; proposals: { id: string; by: string; title: string; detail: string; rationale: string; evidence: string[] }[]; notes: Partial<Record<ReviewerId, string>>; decisionRefs?: Record<string, string> } | null | undefined, reviewer: ReviewerId, agentId: string): string {
  if (!table) return "";
  const ds = table.defects.filter((d) => d.reportedBy.includes(agentId));
  const ps = table.proposals.filter((p) => p.by === agentId);
  const L: string[] = [];
  L.push("DEFECTS YOU REPORTED:", ...(ds.length ? ds.map((d) => `- ${d.id} [${d.severity}, ${d.area}]${table.decisionRefs?.[d.id] ? ` violates ${table.decisionRefs[d.id]}` : ""} ${cap(d.title, 160)}\n  expected: ${cap(d.expected, 300)}\n  actual: ${cap(d.actual, 300)}\n  evidence: ${d.evidence.slice(0, 6).join(" | ") || "-"}`) : ["- (none)"]));
  L.push("PROPOSALS YOU MADE:", ...(ps.length ? ps.map((p) => `- ${p.id} ${cap(p.title, 160)}: ${cap(p.detail, 300)} (why: ${cap(p.rationale, 200)})`) : ["- (none)"]));
  if (table.notes[reviewer]) L.push(`YOUR R0 NOTES: ${cap(table.notes[reviewer], 800)}`);
  return L.join("\n");
}
