// src/lib/milestone/fixRound.ts — TASK 25 (maelezo25): raundi ya marekebisho — Computer anatekeleza Change Orders
// na kurudisha Receipts. Sehemu SAFI (hakuna I/O): pack ya Computer, uthibitishaji wa receipts dhidi ya `git diff`
// (code inaamua — maneno ya Computer hayaaminiwi), ujumbe wa NO-OP (neno kwa neno), checks za global, historia ya defects.
// I/O (sandbox, store, events) iko loop.ts (runFixRound) na cu/engine.ts (startMilestonePhase + fix).

import { readFileSync } from "node:fs";
import { validateReceipt } from "./schemas";
import { formatRoundHeader } from "./review";
import { planEvidenceSpec } from "./evidence";
import { planGateCommands } from "./startpack";
import { PLAN_VIEWPORTS } from "./plan";
import type { ChangeOrder, Check, Defect, EvidenceCheckResult, Receipt, ReceiptStatus, RoundHeaderData } from "./types";

export const receiptsPath = (round: number) => `.xmd/receipts/R${round}.json`;
export const fixKey = (milestoneId: string, round: number) => `fix:${milestoneId}:R${round}`;
export const fixChecksKey = (milestoneId: string, round: number) => `checks:${milestoneId}:R${round}`;
/** "what previous rounds changed" — kikomo cha maelezo25 */
export const PREV_CHANGES_MAX_LINES = 40;
/** faili za harness — si kazi ya Computer (hazihesabiwi kama UNLISTED_CHANGE) */
export const HARNESS_PATH_RE = /^\.xmd\//;
/** TASK-27 (T2 halisi, pia T26 T4e): log za runtime za Computer (mf. `server.log` ya dev server) si kazi ya CO — hazihesabiwi kama UNLISTED */
export const RUNTIME_LOG_RE = /(^|\/)[^/]+\.log$/;

/** Ujumbe WA KUDUMU wa NO-OP (maelezo25 §3) — neno kwa neno. */
export function noOpMessage(orderId: string, files: string[]): string {
  return `Order ${orderId} was NOT applied: git diff does not touch ${files.length ? files.join(", ") : "any file"}. Apply it now and return the receipt.`;
}

export function commitMessage(milestoneId: string, round: number, orderIds: string[]): string {
  return `${milestoneId} R${round}: ${orderIds.join(", ")}`;
}

export const normPath = (p: string) => String(p || "").trim().replace(/^`|`$/g, "").replace(/^\/home\/user\/ws\//, "").replace(/^\.\//, "").replace(/\/+$/, "");

// ── Pack ya Computer: RoundHeader · Computer OCB · COs (kamili) · repo summary · raundi zilizopita (≤40) — HAKUNA kingine ──
export interface FixPackInput {
  roundHeader: RoundHeaderData;
  ocb: string;
  changeOrders: ChangeOrder[];
  repo: { tree: string; gitLog: string };
  prevChanges: string[];
  milestoneId: string;
  round: number;
  /** TASK-27: maagizo ya ngazi za escalation (concrete/pair_patch/split/redecide) */
  escalation?: string[];
}

/** TASK-27: matokeo ya harness kujaribu pair patch (`git apply --check` → `git apply`). */
export interface PatchApply { orderId: string; applied: boolean; method: "git apply" | "git apply --recount" | "already applied" | "none"; base: string; sha: string; detail: string }

/** TASK-27: jinsi Computer anavyotekeleza kila ngazi ya ladder. */
export function escalationLines(cos: ChangeOrder[], patchNotes: Record<string, string> = {}): string[] {
  const out: string[] = [];
  for (const c of cos) {
    if (c.mode === "concrete") out.push(`- ${c.id} (CONCRETE — attempt ${c.attempt}; the previous attempt failed${c.diagnosis ? `, diagnosis ${c.diagnosis.cause}: ${c.diagnosis.note}` : ""}): apply EXACTLY the file, selector, property and values in "current" → "desired"; nothing else.`);
    else if (c.mode === "pair_patch") out.push(`- ${c.id} (PAIR PATCH — attempt ${c.attempt}; the Frontend Engineer wrote the exact fix in the field "patch"${c.patch?.startsWith("*** COMPLETE FILE: ") ? " as a COMPLETE FILE: replace that whole file with the content after the first line" : " as a unified diff"}): ${patchNotes[c.id] || (c.patch ? "apply the patch VERBATIM (exactly these lines, nothing else), then write the receipt." : "no patch could be written — implement the order exactly.")}`);
    else if (c.mode === "split") out.push(`- ${c.id} (SPLIT — attempt ${c.attempt}; one file / one property): FIRST REPRODUCE — measure the current state (computed value, px, contrast…) and write it in this order's receipt "notes" as "REPRODUCED: <measurement>" — THEN fix only this file/property.`);
    else if (c.mode === "redecide") out.push(`- ${c.id} (RE-DECIDED by the reviewers + Optimus — attempt ${c.attempt}): follow "desired" exactly; it replaces the earlier instruction.`);
  }
  return out.length ? ["## ESCALATED ORDERS — these failed before; execute them exactly as described", ...out] : [];
}

/** TASK-27: split → receipt lazima iwe na "REPRODUCED: …" (kipimo kabla ya fix). */
export function reproducedMap(cos: ChangeOrder[], parsed: ParsedReceipts): Record<string, boolean> {
  return Object.fromEntries(cos.filter((c) => c.mode === "split").map((c) => [c.id, /REPRODUCED\s*:/i.test(String(parsed.receipts.find((r) => r.orderId === c.id)?.notes || ""))]));
}

export function renderFixPack(p: FixPackInput): string {
  const ids = p.changeOrders.map((c) => c.id);
  const prev = p.prevChanges.slice(0, PREV_CHANGES_MAX_LINES);
  return [
    formatRoundHeader(p.roundHeader),
    "",
    p.ocb,
    "",
    `## CHANGE ORDERS (${ids.length}) — apply every order exactly; do nothing outside them`,
    "```json",
    JSON.stringify(p.changeOrders, null, 2),
    "```",
    "",
    ...(p.escalation?.length ? [...p.escalation, ""] : []),
    "## REPO SUMMARY (real, from the sandbox)",
    "```",
    (p.repo.tree || "(empty)").trim(),
    "```",
    "Recent commits:",
    "```",
    (p.repo.gitLog || "(no commits yet)").trim(),
    "```",
    "",
    `## WHAT PREVIOUS ROUNDS CHANGED (max ${PREV_CHANGES_MAX_LINES} lines)`,
    prev.length ? prev.join("\n") : "(nothing — this is the first fix round)",
    "",
    receiptsContract(p.milestoneId, p.round, ids),
  ].join("\n");
}

/** Maagizo ya receipts (pia yako kwenye bridge prompt — cu/bridge.py receipts_contract). */
export function receiptsContract(milestoneId: string, round: number, orderIds: string[]): string {
  return [
    `## RECEIPTS + FINISH (the harness checks this itself)`,
    `1. Apply the change orders in the workspace /home/user/ws.`,
    `2. Write \`${receiptsPath(round)}\`: a JSON ARRAY with exactly one Receipt per order (${orderIds.join(", ")}):`,
    `   {"orderId":"CO-001","status":"DONE|PARTIAL|BLOCKED|CANNOT","filesChanged":[{"path":"src/x.css","summary":"what changed"}],"commandsRun":["..."],"notes":"...","blockedReason":"required when BLOCKED|CANNOT"}`,
    `   filesChanged lists ONLY files you really changed for that order (the harness compares it with git diff). If an order conflicts with a locked ledger decision or cannot be done, do NOT apply it: status BLOCKED (or CANNOT) with the reason, filesChanged [].`,
    `   Do NOT create report/notes files in the repo (RIPOTI.md, report.md, NOTES.md…): your summary goes in your final message only — any changed file missing from the receipts is flagged UNLISTED_CHANGE and blocks sign-off.`,
    `   If you start the app to test it, send its output OUTSIDE the repo (e.g. \`node server.js > /tmp/app.log 2>&1 &\`) and stop it before you finish — never leave log files in the repo and never edit .gitignore unless an order asks for it (Koyeb T29: a server.log + .gitignore edit was flagged UNLISTED_CHANGE and blocked sign-off).`,
    `3. Commit your work AND the receipts file yourself: \`git add -A && git commit -m "${commitMessage(milestoneId, round, orderIds)}"\`.`,
    `You cannot finish until the receipts file is valid, every order has a receipt, the tree is committed and the build passes. Do not grade yourself; the harness measures.`,
  ].join("\n");
}

// ── Receipts: soma + thibitisha muundo ──
export interface ParsedReceipts { ok: boolean; receipts: Receipt[]; errors: string[] }
export function parseReceipts(raw: string | null | undefined): ParsedReceipts {
  if (raw == null || !String(raw).trim()) return { ok: false, receipts: [], errors: ["receipts file missing or empty"] };
  let j: unknown;
  try { j = JSON.parse(String(raw)); } catch (e: any) { return { ok: false, receipts: [], errors: [`receipts file is not valid JSON: ${String(e?.message || e).slice(0, 120)}`] }; }
  if (!Array.isArray(j)) return { ok: false, receipts: [], errors: ["receipts file must be a JSON array of Receipt"] };
  const errors: string[] = [];
  const receipts: Receipt[] = [];
  j.forEach((r, i) => {
    const v = validateReceipt(r);
    if (v.ok) receipts.push(v.value);
    else errors.push(...v.errors.map((e) => `[${i}] ${e}`));
  });
  return { ok: errors.length === 0, receipts, errors };
}

// ── Uthibitishaji (code) ──
export type CoVerdict = "APPLIED" | "NOT_ATTEMPTED" | "BLOCKED";
export type ReceiptVerdict = "VALID" | "REJECTED" | "MISSING";
export interface DiffStat { path: string; added: number; deleted: number }
export interface CoVerification {
  orderId: string;
  attempt: number;
  verdict: CoVerdict;
  receiptStatus: ReceiptStatus | "MISSING";
  receipt: ReceiptVerdict;
  /** faili lengwa (location.files; bila hizo → faili za receipt) */
  targets: string[];
  /** faili lengwa zilizoguswa na git diff */
  touched: string[];
  /** faili ambazo receipt inadai lakini hazikubadilika → receipt REJECTED */
  phantom: string[];
  blockedReason?: string;
  diff: { files: number; added: number; deleted: number };
}
export interface RoundVerification {
  cos: CoVerification[];
  /** faili zilizobadilika lakini hazikutajwa kwenye receipt yoyote */
  unlisted: string[];
  flags: string[];
  notAttempted: string[];
  receiptErrors: string[];
  unknownReceipts: string[];
}

export function parseNumstat(out: string): DiffStat[] {
  return String(out || "").split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
    const [a, d, ...rest] = l.split(/\t/);
    return { path: normPath(rest.join("\t")), added: Number(a) || 0, deleted: Number(d) || 0 };
  }).filter((x) => x.path);
}

export function verifyReceipts(changeOrders: ChangeOrder[], parsed: ParsedReceipts, changedRaw: string[], numstat: DiffStat[] = []): RoundVerification {
  const changed = [...new Set(changedRaw.map(normPath).filter(Boolean))];
  const work = changed.filter((p) => !HARNESS_PATH_RE.test(p) && !RUNTIME_LOG_RE.test(p));
  const changedSet = new Set(changed);
  const byOrder = new Map(parsed.receipts.map((r) => [r.orderId, r]));
  const listedAll = new Set<string>();
  const cos: CoVerification[] = changeOrders.map((co) => {
    const r = byOrder.get(co.id);
    const listed = (r?.filesChanged || []).map((f) => normPath(f.path)).filter(Boolean);
    listed.forEach((p) => listedAll.add(p));
    const targets = (co.location?.files || []).map(normPath).filter(Boolean);
    const eff = targets.length ? targets : listed;
    const touched = eff.filter((p) => changedSet.has(p));
    const phantom = listed.filter((p) => !changedSet.has(p));
    const blocked = !!r && (r.status === "BLOCKED" || r.status === "CANNOT") && !!String(r.blockedReason || "").trim();
    // BLOCKED/CANNOT yenye sababu inaheshimiwa hata kama faili lengwa liliguswa — COs mbili zinaweza kulenga faili moja
    // (real run T25 R1: CO-001 ilibadilisha src/styles.css, CO-002 kwenye faili hilohilo ilikuwa BLOCKED na A1)
    const verdict: CoVerdict = blocked ? "BLOCKED" : touched.length ? "APPLIED" : "NOT_ATTEMPTED";
    const mine = new Set(blocked ? listed.filter((p) => changedSet.has(p)) : [...touched, ...listed.filter((p) => changedSet.has(p))]);
    const st = numstat.filter((s) => mine.has(s.path));
    return {
      orderId: co.id, attempt: co.attempt || 1, verdict,
      receiptStatus: r ? r.status : "MISSING",
      receipt: !r ? "MISSING" : phantom.length ? "REJECTED" : "VALID",
      targets: eff, touched, phantom,
      ...(r?.blockedReason ? { blockedReason: r.blockedReason } : {}),
      diff: { files: mine.size, added: st.reduce((a, s) => a + s.added, 0), deleted: st.reduce((a, s) => a + s.deleted, 0) },
    };
  });
  const unlisted = work.filter((p) => !listedAll.has(p));
  const unknownReceipts = parsed.receipts.map((r) => r.orderId).filter((id) => !changeOrders.some((c) => c.id === id));
  const flags: string[] = [];
  if (unlisted.length) flags.push("UNLISTED_CHANGE");
  if (cos.some((c) => c.receipt === "REJECTED")) flags.push("RECEIPT_REJECTED");
  if (cos.some((c) => c.verdict === "NOT_ATTEMPTED")) flags.push("NOT_ATTEMPTED");
  if (cos.some((c) => c.receipt === "MISSING")) flags.push("RECEIPT_MISSING");
  return { cos, unlisted, flags, notAttempted: cos.filter((c) => c.verdict === "NOT_ATTEMPTED").map((c) => c.orderId), receiptErrors: parsed.errors, unknownReceipts };
}

/** Ujumbe wa kurudia (NO-OP): mstari mmoja wa kudumu kwa kila CO ambayo haikuguswa. */
export function noOpReminder(v: RoundVerification): string {
  return v.cos.filter((c) => c.verdict === "NOT_ATTEMPTED").map((c) => noOpMessage(c.orderId, c.targets)).join("\n");
}

/** Muunganiko wa majaribio mawili ya raundi moja (rerun ya NO-OP): diff ya raundi nzima inapimwa upya na receipts za mwisho. */
export function mergeAttempts(first: RoundVerification, second: RoundVerification): RoundVerification & { rerun: { before: string[]; after: string[] } } {
  return { ...second, rerun: { before: first.notAttempted, after: second.notAttempted } };
}

// ── Checks za raundi: acceptance za COs + global (build, tests, console_clean, no_horizontal_overflow kwenye routes muhimu) ──
export interface RoundChecks { checks: Check[]; owner: Record<string, string>; startCommand: string; routes: string[] }
export function roundChecks(changeOrders: ChangeOrder[], planMarkdown: string, opts: { maxRoutes?: number; /** TASK-29: technical → hakuna console_clean / overflow (hakuna UI) */ technical?: boolean } = {}): RoundChecks {
  const owner: Record<string, string> = {};
  const checks: Check[] = [];
  for (const co of changeOrders) for (const c of co.acceptance || []) {
    const id = `${co.id}/${c.id}`;
    checks.push({ ...c, id } as Check);
    owner[id] = co.id;
  }
  const g = planGateCommands(planMarkdown);
  const spec = planEvidenceSpec(planMarkdown);
  const routes = [...new Set(spec.routes.map((r) => r.route))].slice(0, opts.maxRoutes ?? 4);
  const keyRoutes = routes.length ? routes : ["/"];
  if (g.buildCommand) { checks.push({ id: "global/build", type: "command", cmd: g.buildCommand, expectExit: 0 }); owner["global/build"] = "global"; }
  if (g.requiresTests) { checks.push({ id: "global/tests", type: "command", cmd: g.testCommand, expectExit: 0 }); owner["global/tests"] = "global"; }
  if (spec.startCommand && !opts.technical) {
    checks.push({ id: "global/console_clean", type: "console_clean", routes: keyRoutes, viewports: [...PLAN_VIEWPORTS] });
    checks.push({ id: "global/no_horizontal_overflow", type: "no_horizontal_overflow", routes: keyRoutes, viewports: [...PLAN_VIEWPORTS] });
    owner["global/console_clean"] = "global"; owner["global/no_horizontal_overflow"] = "global";
  }
  return { checks, owner, startCommand: spec.startCommand, routes: keyRoutes };
}

export function summarizeChecks(results: EvidenceCheckResult[], owner: Record<string, string>): Record<string, { pass: number; fail: number; error: number }> {
  const out: Record<string, { pass: number; fail: number; error: number }> = {};
  for (const r of results) {
    const k = owner[r.id] || "global";
    const s = (out[k] ||= { pass: 0, fail: 0, error: 0 });
    if (r.result === "PASS") s.pass++; else if (r.result === "FAIL") s.fail++; else s.error++;
  }
  return out;
}

// ── Historia ya defects (maelezo25 §5) ──
export function causeOf(c: CoVerification): string {
  if (c.verdict === "NOT_ATTEMPTED") return "NOT_ATTEMPTED";
  if (c.verdict === "BLOCKED") return `BLOCKED: ${String(c.blockedReason || "").slice(0, 200)}`;
  if (c.receipt === "REJECTED") return `receipt rejected (lists unchanged files: ${c.phantom.join(", ")})`;
  return `receipt ${c.receiptStatus}`;
}

export function applyRoundToDefects(defects: Defect[], changeOrders: ChangeOrder[], v: RoundVerification & { rerun?: { before: string[] } }, round: number, checks: Record<string, { pass: number; fail: number; error: number }>): Defect[] {
  const byCo = new Map(v.cos.map((c) => [c.orderId, c]));
  return defects.map((d) => {
    const cos = changeOrders.filter((co) => co.defectIds.includes(d.id));
    if (!cos.length) return d;
    const entries = cos.map((co) => {
      const c = byCo.get(co.id);
      const ck = checks[co.id];
      const noop = v.rerun?.before.includes(co.id) ? " (NO-OP on run 1 → reminder + rerun)" : "";
      const result = `${co.id}: ${c ? c.verdict : "NO_VERIFICATION"}${noop}${ck ? ` · checks ${ck.pass}P/${ck.fail}F/${ck.error}E` : ""}`;
      return { round, result, cause: c ? causeOf(c) : "no verification" };
    });
    const attempted = cos.some((co) => byCo.get(co.id)?.verdict === "APPLIED");
    return {
      ...d,
      attempts: (d.attempts || 0) + 1,
      status: d.status === "OPEN" || d.status === "REOPENED" ? (attempted ? "IN_FIX" : d.status) : d.status,
      history: [...(d.history || []), ...entries],
    };
  });
}

/** Mistari ya "what previous rounds changed" kutoka rekodi za raundi zilizopita (≤40). */
export function prevChangesLines(rounds: { round: number; cos: CoVerification[] }[], max = PREV_CHANGES_MAX_LINES): string[] {
  const lines: string[] = [];
  for (const r of [...rounds].sort((a, b) => a.round - b.round)) for (const c of r.cos) {
    lines.push(`- R${r.round} ${c.orderId} ${c.verdict}${c.touched.length ? ` · ${c.touched.join(", ")} (+${c.diff.added}/-${c.diff.deleted})` : ""}${c.verdict === "BLOCKED" && c.blockedReason ? ` · ${c.blockedReason.slice(0, 120)}` : ""}`);
  }
  return lines.length > max ? [...lines.slice(0, max - 1), `- … ${lines.length - max + 1} more`] : lines;
}

// ── Aina za mpaka wa loop ↔ engine (engine.MilestoneFixInput / MsFixRaw zina umbo hili) ──
export interface FixPhaseInput {
  round: number;
  attempt: number;
  orderIds: string[];
  render: (repo: { tree: string; gitLog: string }) => string;
  reminder?: string;
  diffBase?: string;
}
export interface FixRaw {
  headBefore: string;
  diffBase: string;
  head: string;
  receiptsPath: string;
  receiptsRaw: string | null;
  changed: string[];
  numstat: string;
  sabotaged?: boolean;
}

// ── TASK-25 test hook (XMD_TEST_HOOKS=1 + XMD_TEST_FIX_INPUT=<file.json>) — inert vinginevyo ──
export interface TestFixInput {
  milestoneId?: string;
  planMarkdown: string;
  /** repo ndogo `xmdtest-fix` (path → maandishi) inayopandwa kwenye sandbox kabla ya raundi */
  files: Record<string, string>;
  changeOrders: ChangeOrder[];
  defects?: Defect[];
  ledger?: { agenda_index: number; agenda_item: string; status: string; decision_summary?: string; decision_detail?: string }[];
}
export function testFixInput(env: Record<string, string | undefined> = process.env, read: (p: string) => string = (p) => readFileSync(p, "utf8")): TestFixInput | null {
  if (env.XMD_TEST_HOOKS !== "1" || !env.XMD_TEST_FIX_INPUT) return null;
  try {
    const j = JSON.parse(read(env.XMD_TEST_FIX_INPUT)) as TestFixInput;
    return j && j.files && Array.isArray(j.changeOrders) && typeof j.planMarkdown === "string" ? j : null;
  } catch { return null; }
}
