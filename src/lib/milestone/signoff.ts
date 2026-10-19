// src/lib/milestone/signoff.ts — TASK 28 (maelezo28): sign-off, cap, minor backlog, defects zilizorithiwa.
//  · SAFI (hakuna I/O): sheria za sign-off (SIGNOFF_MAX_OPEN_SEVERITY), kurithisha defects (CAP_REACHED), entry ya ledger
//    ya milestone, safu ya ripoti ya mwisho, mistari ya StartPack/plan, checks za defects zilizorithiwa.
//  · `closeOutMilestone` (I/O kupitia hooks): hatua za sign-off/cap — kila moja inahifadhiwa kwenye `signoff:Mk` na ni
//    idempotent (kill -9 katikati → resume inaendelea pale ilipoishia; git yenyewe pia haitoi tag/commit mara mbili).
import { DECISIONS_KEY } from "./reviewAgenda";
import { getRecord } from "./store";
import { isOpenDefect } from "./verify";
import { DEFECT_SEVERITIES, SIGNOFF_MAX_OPEN_SEVERITY, type ChangeOrder, type Check, type Defect, type DefectSeverity, type EvidenceCheckResult, type Milestone, type MilestoneStatus, type WaiverEntry } from "./types";

export const milestoneTag = (milestoneId: string) => `milestone-${milestoneId}`;
export const signoffKey = (milestoneId: string) => `signoff:${milestoneId}`;
export const FINAL_REPORT_KEY = "finalReport";
export const msLedgerId = (milestoneId: string) => `MS-${milestoneId}`;
export const INHERITED_CHECK_PREFIX = "inherited/";
export const CLOSE_STATUSES: readonly MilestoneStatus[] = ["SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS", "CAP_REACHED"];

/* ───────────────────────────── sheria (safi) ───────────────────────────── */

const rank = (s: DefectSeverity) => DEFECT_SEVERITIES.indexOf(s); // blocker 0 … minor 3
/** defect wazi inaruhusiwa kubaki wakati wa sign-off? (minor tu — na lazima iorodheshwe) */
export const allowedOpenAtSignoff = (d: Pick<Defect, "severity">) => rank(d.severity) >= rank(SIGNOFF_MAX_OPEN_SEVERITY);

/** SIGNED_OFF_WITH_WAIVERS ikiwa kuna defect yoyote WAIVED ya milestone hii; vinginevyo SIGNED_OFF (minor backlog haibadilishi hali). */
export function signoffStatus(defects: Defect[], milestoneId: string): "SIGNED_OFF" | "SIGNED_OFF_WITH_WAIVERS" {
  return defects.some((d) => d.milestoneId === milestoneId && d.status === "WAIVED") ? "SIGNED_OFF_WITH_WAIVERS" : "SIGNED_OFF";
}

/** CAP_REACHED: defects wazi za Mk → INHERITED (+ inheritedFrom, checks za CO ya mwisho, history). Idempotent. */
export function inheritOpenDefects(defects: Defect[], milestoneId: string, round: number, cos: ChangeOrder[]): Defect[] {
  return defects.map((d) => {
    if (d.milestoneId !== milestoneId || !isOpenDefect(d)) return d;
    const last = [...cos].filter((c) => c.defectIds.includes(d.id)).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true })).pop();
    const checks = (last?.acceptance || []).map((c) => ({ ...c, id: `${INHERITED_CHECK_PREFIX}${d.id}/${c.id}` }) as Check);
    return { ...d, status: "INHERITED" as const, inheritedFrom: milestoneId, ...(checks.length ? { inheritedChecks: checks } : {}),
      history: [...(d.history || []), { round, result: `INHERITED by the next milestone (${milestoneId} CAP_REACHED at round ${round})`, cause: `still ${d.status} after ${d.attempts} attempt(s)` }] };
  });
}

/** defects zilizorithiwa kutoka milestones ZILIZOTANGULIA (bado hazijarekebishwa). */
export function inheritedFor(defects: Defect[], milestoneId: string): Defect[] {
  return defects.filter((d) => d.status === "INHERITED" && (d.inheritedFrom || d.milestoneId) !== milestoneId);
}
export const inheritedLine = (d: Defect) =>
  `${d.id} [${d.severity}] ${d.title} — expected: ${String(d.expected).replace(/\s+/g, " ").slice(0, 240)} · actual: ${String(d.actual).replace(/\s+/g, " ").slice(0, 200)} (INHERITED from ${d.inheritedFrom || d.milestoneId}${d.attempts ? `, ${d.attempts} attempt(s)` : ""})`;
/** sehemu ya plan inayoandikwa na CODE (si LLM) — inahakikisha plan ya milestone inayofuata inazitaja */
export function inheritedSection(lines: string[]): string {
  return `## 10. Inherited Defects (verbatim — from earlier milestones; keep them in view, their checks run every round)\n\n${lines.map((l) => `- ${l}`).join("\n")}`;
}

/** checks za defects zilizorithiwa kwa raundi za milestone hii (owner = `inherited:D-xxx`). */
export function inheritedChecks(defects: Defect[], milestoneId: string): { checks: Check[]; owner: Record<string, string> } {
  const checks: Check[] = [], owner: Record<string, string> = {};
  for (const d of inheritedFor(defects, milestoneId)) for (const c of d.inheritedChecks || []) { checks.push(c); owner[c.id] = `inherited:${d.id}`; }
  return { checks, owner };
}
export const isInheritedCheck = (r: Pick<EvidenceCheckResult, "id">) => String(r.id).startsWith(INHERITED_CHECK_PREFIX);
/** defect iliyorithiwa ambayo checks zake ZOTE zimepita kwenye milestone hii → VERIFIED_FIXED (history inaonyesha wapi). */
export function applyInheritedResults(defects: Defect[], milestoneId: string, round: number, results: EvidenceCheckResult[]): { defects: Defect[]; fixed: string[] } {
  const fixed: string[] = [];
  const out = defects.map((d) => {
    if (!inheritedFor([d], milestoneId).length || !(d.inheritedChecks || []).length) return d;
    const mine = results.filter((r) => (d.inheritedChecks || []).some((c) => c.id === r.id));
    if (mine.length !== (d.inheritedChecks || []).length || mine.some((r) => r.result !== "PASS")) return d;
    fixed.push(d.id);
    return { ...d, status: "VERIFIED_FIXED" as const, history: [...(d.history || []), { round, result: `VERIFIED_FIXED in ${milestoneId} R${round} (inherited checks ${mine.length}/${mine.length} PASS)`, cause: "inherited checks re-run" }] };
  });
  return { defects: out, fixed };
}

/** baselines (task 22) lazima zilingane na HEAD wakati wa sign-off: raundi iliyorudishwa (REVERT) imeondoa kazi yake, hivyo
 *  HEAD = mwisho wa raundi iliyotangulia isiyorudishwa. outcomes[r] = outcome ya verify:Mk:Rr (null = rekodi haipo/stub → hakuna evidence ya kuaminika). */
export function baselineRound(round: number, outcomes: Record<number, string | null | undefined>): number | null {
  for (let r = round; r >= 1; r--) {
    const o = outcomes[r];
    if (!o) return null;
    if (o !== "REVERT") return r;
  }
  return 0; // R0 (build) — hakuna raundi ya marekebisho iliyobaki
}

/* ───────────────────────────── ledger + ripoti ya mwisho (safi) ───────────────────────────── */

type Brief = { id: string; title: string; severity: string };
export interface MilestoneLedgerEntry {
  id: string; // "MS-M1"
  source: "milestone";
  milestoneId: string;
  title: string;
  status: MilestoneStatus;
  round: number;
  reason: string;
  closedDefects: Brief[];
  waivers: WaiverEntry[];
  /** minor zilizoachwa wazi (zinaruhusiwa TU zikiwa hapa + kwenye ripoti ya mwisho) */
  backlog: Brief[];
  /** CAP_REACHED: defects zilizorithiwa na milestone inayofuata */
  inherited: Brief[];
  acceptedProposals: { id: string; title: string }[];
  tag?: string;
  sha?: string;
  git?: string;
  baselines?: string;
  at: string;
}
const brief = (d: Defect): Brief => ({ id: d.id, title: d.title, severity: d.severity });

export function milestoneLedgerEntry(o: { m: Milestone; status: MilestoneStatus; round: number; reason: string; defects: Defect[]; waivers: WaiverEntry[]; acceptedProposals: { id: string; title: string }[]; at: string }): MilestoneLedgerEntry {
  const mine = o.defects.filter((d) => d.milestoneId === o.m.id);
  const cap = o.status === "CAP_REACHED";
  return {
    id: msLedgerId(o.m.id), source: "milestone", milestoneId: o.m.id, title: o.m.title, status: o.status, round: o.round, reason: o.reason,
    closedDefects: mine.filter((d) => d.status === "VERIFIED_FIXED").map(brief),
    waivers: o.waivers,
    backlog: cap ? [] : mine.filter((d) => isOpenDefect(d)).map(brief),
    inherited: cap ? mine.filter((d) => d.status === "INHERITED" && d.inheritedFrom === o.m.id).map(brief) : [],
    acceptedProposals: o.acceptedProposals, at: o.at,
  };
}

/** sheria za kufunga (code, si LLM): sign-off haina medium+ wazi; kila minor wazi iko kwenye backlog; WITH_WAIVERS ⇔ waivers; cap si "safi". */
export function closeoutProblems(e: MilestoneLedgerEntry, defects: Defect[]): string[] {
  const p: string[] = [];
  const open = defects.filter((d) => d.milestoneId === e.milestoneId && isOpenDefect(d));
  if (e.status === "CAP_REACHED") {
    if (open.length) p.push(`CAP_REACHED but ${open.length} defect(s) still open (not INHERITED): ${open.map((d) => d.id).join(", ")}`);
    return p;
  }
  const tooHigh = open.filter((d) => !allowedOpenAtSignoff(d));
  if (tooHigh.length) p.push(`sign-off with open defect(s) above ${SIGNOFF_MAX_OPEN_SEVERITY}: ${tooHigh.map((d) => `${d.id} (${d.severity})`).join(", ")}`);
  const unlisted = open.filter((d) => !e.backlog.some((b) => b.id === d.id));
  if (unlisted.length) p.push(`open minor defect(s) missing from the ledger backlog: ${unlisted.map((d) => d.id).join(", ")}`);
  const waived = defects.some((d) => d.milestoneId === e.milestoneId && d.status === "WAIVED");
  if (waived !== (e.status === "SIGNED_OFF_WITH_WAIVERS")) p.push(`status ${e.status} does not match waivers (${waived ? "has" : "no"} WAIVED defect)`);
  if (e.status === "SIGNED_OFF_WITH_WAIVERS" && e.waivers.some((w) => !String(w.reason || "").trim())) p.push("a waiver has no reason");
  return p;
}

export interface FinalReportRow { milestoneId: string; title: string; status: MilestoneStatus; round: number; clean: boolean; tag?: string; waivers: { defectId: string; reason: string }[]; backlog: Brief[]; inherited: Brief[]; closed: number; at: string }
export function finalReportRow(e: MilestoneLedgerEntry): FinalReportRow {
  return {
    milestoneId: e.milestoneId, title: e.title, status: e.status, round: e.round, tag: e.tag,
    clean: e.status === "SIGNED_OFF" && !e.backlog.length && !e.inherited.length && !e.waivers.length, // CAP haiwezi kuwa "safi"
    waivers: e.waivers.map((w) => ({ defectId: w.defectId, reason: w.reason })), backlog: e.backlog, inherited: e.inherited, closed: e.closedDefects.length, at: e.at,
  };
}
export const finalReportLine = (r: FinalReportRow) =>
  `${r.milestoneId} ${r.status}${r.clean ? " (clean)" : ""} · round ${r.round} · closed ${r.closed}${r.waivers.length ? ` · WAIVED ${r.waivers.map((w) => w.defectId).join(", ")}` : ""}${r.backlog.length ? ` · minor backlog ${r.backlog.map((b) => b.id).join(", ")}` : ""}${r.inherited.length ? ` · INHERITED ${r.inherited.map((b) => b.id).join(", ")} → next milestone` : ""}${r.tag ? ` · tag ${r.tag}` : ""}`;

/* ───────────────────────────── closeOutMilestone (I/O kupitia hooks) ───────────────────────────── */

export interface SignoffRecord {
  version: number;
  id: string;
  status: MilestoneStatus;
  round: number;
  defects?: { inherited: string[]; at: string };
  ledger?: { id: string; at: string };
  git?: { ok: boolean; sha: string; tag: string; detail: string; at: string };
  baselines?: { uploaded: number; entries: number; errors: string[]; manifestUrl?: string; fromRound?: number; at: string };
  report?: { at: string };
  event?: { at: string };
}
export interface SignoffGitResult { ok: boolean; sha: string; detail: string }
export interface CloseoutDeps {
  sid: string;
  update: <T>(key: string, mutate: (cur: T | null) => T) => Promise<{ data: T }>;
  /** commit + annotated tag (+ push ikiwa remote ipo) — idempotent ndani ya sandbox */
  git?: (tag: string, message: string) => Promise<SignoffGitResult>;
  /** task 22: screenshots zilizoidhinishwa (evidence ya raundi hii) → baselines */
  saveBaselines?: (round: number) => Promise<{ uploaded: number; entries: number; errors: string[]; manifestUrl?: string; fromRound?: number }>;
  /** test hook (T5): kill -9 baada ya git, kabla ya rekodi */
  crashAfterGit?: () => void | Promise<void>;
  bcast: (e: unknown) => void;
  addChip: (t: string) => void;
  blog: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
}

/**
 * maelezo28 #1/#2: hatua za kufunga milestone — zinaendeshwa KABLA ya mpito wa mwisho wa state (ili kill -9 iendelee hapa).
 * Sign-off: (b) ledger → (c) commit + tag `milestone-Mk` (+ push) → (d) baselines → ripoti ya mwisho → (e) `milestoneSignedOff`.
 * Cap: defects wazi → INHERITED → ledger → ripoti ya mwisho → `milestoneCapReached`. Kila hatua iliyokamilika inarukwa.
 * Inarudisha matatizo ya sheria (closeoutProblems) — yakiwa yapo, milestone haifungwi (caller → BLOCKED).
 */
export async function closeOutMilestone(m: Milestone, round: number, status: MilestoneStatus, reason: string, d: CloseoutDeps): Promise<{ record: SignoffRecord; entry: MilestoneLedgerEntry; problems: string[] }> {
  const now = () => new Date().toISOString();
  const tag = milestoneTag(m.id);
  const cap = status === "CAP_REACHED";
  let rec = (await d.update<SignoffRecord>(signoffKey(m.id), (cur) => (cur && cur.round === round ? { ...cur, status } : { version: 1, id: m.id, status, round }))).data;
  const save = async (patch: Partial<SignoffRecord>) => { rec = (await d.update<SignoffRecord>(signoffKey(m.id), (cur) => ({ ...(cur as SignoffRecord), ...patch }))).data; };

  // (cap) defects wazi → INHERITED
  if (cap && !rec.defects) {
    const cos = (await getRecord<{ changeOrders?: ChangeOrder[] }>(d.sid, `cos:${m.id}`))?.data?.changeOrders || [];
    let inherited: string[] = [];
    await d.update<{ version: number; defects: Defect[] }>("defects", (cur) => {
      const before = cur?.defects || [];
      const after = inheritOpenDefects(before, m.id, round, cos);
      inherited = after.filter((x, k) => x.status === "INHERITED" && before[k]?.status !== "INHERITED").map((x) => x.id);
      return { version: 1, ...(cur || {}), defects: after };
    });
    await save({ defects: { inherited, at: now() } });
    if (inherited.length) d.blog("warning", `📦 ${m.id} CAP_REACHED: defects ${inherited.join(", ")} → INHERITED (milestone inayofuata: StartPack + plan + checks kila raundi)`);
  }

  // (b) ledger entry ya milestone (DECISIONS_KEY = ledger ya review; upsert kwa id)
  const defects = (await getRecord<{ defects?: Defect[] }>(d.sid, "defects"))?.data?.defects || [];
  const waivers = ((await getRecord<{ waivers?: WaiverEntry[] }>(d.sid, `waivers:${m.id}`))?.data?.waivers || []).map((w) => ({ defectId: w.defectId, title: w.title, severity: w.severity, round: w.round, reason: w.reason, approvedBy: w.approvedBy, at: w.at }));
  const decisions = ((await getRecord<{ decisions?: { id: string; milestoneId?: string; proposalId?: string; title?: string; source?: string }[] }>(d.sid, DECISIONS_KEY))?.data?.decisions || []);
  const accepted = decisions.filter((x) => x.milestoneId === m.id && x.proposalId && !x.source).map((x) => ({ id: x.id, title: String(x.title || "") }));
  let entry = milestoneLedgerEntry({ m, status, round, reason, defects, waivers, acceptedProposals: accepted, at: rec.ledger?.at || now() });
  if (rec.git) entry = { ...entry, tag: rec.git.ok ? rec.git.tag : undefined, sha: rec.git.sha || undefined, git: rec.git.detail };
  if (rec.baselines) entry = { ...entry, baselines: `${rec.baselines.entries} baseline(s), uploaded ${rec.baselines.uploaded}${rec.baselines.manifestUrl ? `, manifest ${rec.baselines.manifestUrl}` : ""}` };
  const problems = closeoutProblems(entry, defects);
  if (problems.length) { d.blog("error", `🚫 ${m.id}: haiwezi kufungwa kama ${status}: ${problems.join(" · ")}`); return { record: rec, entry, problems }; }
  const writeLedger = async (e: MilestoneLedgerEntry) => { await d.update<{ version: number; decisions: unknown[] }>(DECISIONS_KEY, (cur) => ({ version: 1, ...(cur || {}), decisions: [...((cur?.decisions || []) as { id?: string }[]).filter((x) => x.id !== e.id), e] })); };
  if (!rec.ledger) { await writeLedger(entry); await save({ ledger: { id: entry.id, at: entry.at } }); }

  if (!cap) {
    // (c) commit + annotated tag (+ push) — idempotent ndani ya sandbox pia (tag ipo → hakuna commit/tag mpya)
    if (!rec.git && d.git) {
      const msg = `xmd: sign-off ${m.id} (${status}, round ${round})`;
      let g: SignoffGitResult;
      try { g = await d.git(tag, msg); } catch (e: any) { g = { ok: false, sha: "", detail: String(e?.message || e).slice(0, 240) }; }
      await d.crashAfterGit?.();
      await save({ git: { ok: g.ok, sha: g.sha, tag, detail: g.detail, at: now() } });
      d.blog(g.ok ? "success" : "warning", `🏷️ ${m.id} sign-off: ${g.ok ? `tag ${tag} @ ${g.sha.slice(0, 7)}` : "git haikufanikiwa"} — ${g.detail}`);
      entry = { ...entry, tag: g.ok ? tag : undefined, sha: g.sha || undefined, git: g.detail };
      await writeLedger(entry);
    }
    // (d) baselines (task 22)
    if (!rec.baselines && d.saveBaselines) {
      let b: { uploaded: number; entries: number; errors: string[]; manifestUrl?: string; fromRound?: number };
      try { b = await d.saveBaselines(round); } catch (e: any) { b = { uploaded: 0, entries: 0, errors: [String(e?.message || e).slice(0, 240)] }; }
      await save({ baselines: { ...b, at: now() } });
      d.blog(b.errors.length ? "warning" : "success", `🖼️ ${m.id} baselines${b.fromRound !== undefined && b.fromRound !== round ? ` (evidence ya R${b.fromRound} — R${round} ilirudishwa)` : ""}: ${b.entries} saved · uploaded ${b.uploaded}${b.errors.length ? ` · errors ${b.errors.slice(0, 2).join("; ")}` : ""}`);
      entry = { ...entry, baselines: `${b.entries} baseline(s), uploaded ${b.uploaded}${b.manifestUrl ? `, manifest ${b.manifestUrl}` : ""}` };
      await writeLedger(entry);
    }
  }

  // ripoti ya mwisho (orodha — waivers, minor backlog, inherited; cap haionyeshwi kamwe kama safi)
  if (!rec.report) {
    const row = finalReportRow(entry);
    await d.update<{ version: number; milestones: FinalReportRow[] }>(FINAL_REPORT_KEY, (cur) => ({ version: 1, milestones: [...(cur?.milestones || []).filter((x) => x.milestoneId !== m.id), row] }));
    await save({ report: { at: now() } });
  }

  // (e) event (mara moja)
  if (!rec.event) {
    const row = finalReportRow(entry);
    d.bcast({ type: cap ? "milestoneCapReached" : "milestoneSignedOff", id: m.id, status, round, tag: entry.tag, sha: entry.sha, waivers: row.waivers.map((w) => w.defectId), backlog: row.backlog.map((b) => b.id), inherited: row.inherited.map((b) => b.id), clean: row.clean });
    d.addChip(cap ? `📦 ${m.id} CAP_REACHED (round ${round}) — NOT clean: inherited ${row.inherited.map((b) => b.id).join(", ") || "none"} → next milestone` : `🏁 ${m.id} ${status}${entry.tag ? ` · tag ${entry.tag}` : ""}${row.waivers.length ? ` · waivers ${row.waivers.map((w) => w.defectId).join(", ")}` : ""}${row.backlog.length ? ` · minor backlog ${row.backlog.map((b) => b.id).join(", ")}` : ""}`);
    await save({ event: { at: now() } });
  }
  return { record: rec, entry, problems: [] };
}
