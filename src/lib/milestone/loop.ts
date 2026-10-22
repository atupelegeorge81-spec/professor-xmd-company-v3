// src/lib/milestone/loop.ts — TASK 14 (maelezo14): kitanzi cha milestones — CODE inaamua lini milestone imefungwa.
// Agenda zote za milestone zikiwa kwenye Ledger (finalBoardResolution) → DISCUSSING → PLANNING (CAS) → runMilestoneBuild.
// runMilestoneBuild ni STUB kwa sasa (tasks 15+ zinabadilisha mwili wake). Inatumika TU XMD_MILESTONES=1.

import { milestonesEnabled } from "./flag";
import { appendLaneUse, BLOCKED_RETRY_MAX, failedR0Step, HOLD_STATUSES, newMilestoneState, planSteps, replanBlocked, setStep, stepIdOf, transition, TERMINAL_STATUSES } from "./state";
import { digestKey, makeImageDigest, type ImageDigest } from "./judge"; // TASK-30
import { judgeVisionReady } from "../broker/broker"; // TASK-30
import type { MilestonePlanResult } from "./plan";
import { BUILD_REPORT_INLINE_MAX, buildReportPath, crossCheckBuildReport, parseBuildReport, type BuildReportCommand } from "./buildReport";
import { evidenceKey } from "./evidence"; // TASK-19
import type { DomJson } from "./review"; // TASK-26 (occlusion)
import { getRecord, msChip, MS_PREFIX, stateKey, updateRecord, type Versioned } from "./store";
import { MAX_ROUNDS, type LaneUse, type ChangeOrder, type Check, type Defect, type EvidenceCheckResult, type EvidencePack, type Milestone, type MilestoneMap, type MilestoneState, type MilestoneStatus, type RoundHeaderData, type WaiverEntry } from "./types";
import { formatRoundHeader, reviewRound0, REVIEWERS, type ReviewContext, type ReviewDeps, type ReviewerId } from "./review"; // TASK-24 (T23 analyses)
import { consolidate, cosKey, DECISIONS_KEY, findingsKey, reviewKey, makeReviewAgendaItem, nextCoNumber, reviewAgendaId, reviewParticipants, runReviewRound, type ConsolidateInput, type ConsolidateResult, type DiscussionOutcome, type ReviewAgendaItem, type ReviewRoundResult } from "./reviewAgenda"; // TASK-24
import { brokerComplete } from "../broker/broker"; // TASK-24: Optimus consolidate
import { castAgentId, reviewCast, technicalHints, type ReviewCast } from "./techEvidence"; // TASK-29
import { validateMilestonePlan } from "./plan"; // TASK-29 (technicalHints)
import { AGENT_ID_BY_ROSTER } from "./roster"; // TASK-29
import { AGENTS } from "@/lib/agents"; // TASK-29
import {
  applyRoundToDefects, fixChecksKey, fixKey, mergeAttempts, noOpReminder, parseNumstat, parseReceipts, prevChangesLines, renderFixPack, roundChecks, escalationLines, reproducedMap, type PatchApply,
  summarizeChecks, verifyReceipts, type CoVerification, type FixPhaseInput, type FixRaw, type RoundChecks, type RoundVerification,
} from "./fixRound"; // TASK-25
import {
  applyVerifyToDefects, bestKey, CHECK_MISSED_IT, cosRoundKey, decide, decideNext, disagreements, isOpenDefect, nextAttempt, revertNote, roundOutcome, syncTurn,
  verifyBoth, verifyKey, type Decision, type NextDecision, type VerifyContext, type VerifyDeps, type VerifyFindings, type VerifyRun, type VerifyVerdict,
  planGoalOf, newlyOccluded, type OcclusionRegression,
} from "./verify"; // TASK-26
import { buildOCB } from "./ocb";
import { maybeCapturePrompt } from "./testHooks";
import { allowedOpenAtSignoff, applyInheritedResults, closeOutMilestone, CLOSE_STATUSES, baselineRound, inheritedChecks, isInheritedCheck, signoffStatus, type CloseoutDeps } from "./signoff"; // TASK-28
import { testCrashAfterSignoffGit, testMaxRounds } from "./testHooks"; // TASK-28
import {
  addMemoEntry, checkR0Coverage, closeFacts, confirmR0, defectHistoryLines, discussionFacts, entryText, escalationFactsText, fixFacts, memoEntryId, memoKey, ownR0Findings, r0Facts, r0RequiredIds,
  redecideFactsText, renderMemo, REQUESTED_DISCUSSION_MAX_TURNS, saveConfirmations, syncFacts, verifyFacts, type MemoComplete, type MemoKind, type MemoMsg, type MemoRecord, type MemoStore, type R0MemoInput,
} from "./reviewMemory"; // TASK-33 (MISSION ONE)
import { msUiCo, renderR0Findings, renderVerifyFindings, type MsUiEvent } from "./uiEvents"; // TASK-34 (MISSION TWO)
import { amendmentLine, applyEscalationToDefects, escalateChangeOrders, escalationChip, requirementChecksOf, type Amendment, type EscalateDeps, type EscalateResult, type Msg as EscMsg, type PrevAttemptFact, type Waiver } from "./escalation"; // TASK-27

export interface LoopRunner {
  id: string;
  sessionId?: string | null;
  msMap?: MilestoneMap | null;
  msChips?: any[];
  /** TASK-34: kila state:Mk inapobadilika (UI — card ya Milestones/header) */
  onMsState?: (milestoneId: string, state: MilestoneState) => void;
}

export interface LoopHooks {
  bcast: (e: any) => void;
  addChip: (text: string) => void;
  blog: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
  persist: () => Promise<void>;
  /** TASK-34 (MISSION TWO): tukio la UI (badges/cards) — chip iliyofichwa inayohifadhiwa */
  ui?: (e: MsUiEvent) => void;
  /** TASK-34: ujumbe kamili wa agent kwenye chat (reviewers — findings/uthibitisho/sync) */
  say?: (agentId: string, text: string) => void;
  /** TASK-30 (tests): muda wa ukaguzi wa PAUSED_QUOTA ya vision + chanzo cha "vision ina nafasi?" (default: broker.judgeVisionReady) */
  visionWait?: { pollMs?: number; ready?: () => { ready: boolean; lane: string | null } };
  /** TASK-32 (tests): muda kabla ya kujaribu tena build/raundi iliyosimama kwa quota ya lanes za XMD Computer */
  buildQuotaPollMs?: number;
  /** agenda zilizofungwa kwenye Ledger (chanzo cha ukweli) */
  resolvedAgendas: () => Promise<Set<number>>;
  /** TASK-15: Optimus anaandika plan ya milestone (bila hook → stub ya task 14) */
  plan?: (m: Milestone) => Promise<MilestonePlanResult>;
  /** TASK-16: XMD Computer anajenga milestone MOJA kutoka plan yake (bila hook → stub) */
  build?: (m: Milestone, planMarkdown: string) => Promise<BuildOutcome>;
  /** TASK-32: mara ngapi kujenga upya evidence ikiwa na errors bila screenshots (default EVIDENCE_REBUILDS) */
  evidenceRebuilds?: number;
  /** TASK-24: REVIEW (R-Mk-0) baada ya evidence — context ya reviewers + mjadala kupitia mashine ya agenda ya Board.
   *  run() ya boardRunner ni closure moja: hook hii inajengwa ndani yake (msHooks) na `discuss` = `discussAgenda(item)`. */
  review?: {
    context: (m: Milestone, pack: EvidencePack) => Promise<{ analyseCtx: Omit<ReviewContext, "pack">; ledgerLines: string[]; extraParticipants?: string[] }>;
    discuss: (item: ReviewAgendaItem) => Promise<DiscussionOutcome>;
    /** majaribio tu: badala ya LLM halisi */
    analyseDeps?: ReviewDeps;
    consolidate?: (i: ConsolidateInput) => Promise<ConsolidateResult>;
  };
  /** TASK-25: raundi ya marekebisho — Computer (mechanics za task 16) anatekeleza COs na kurudisha receipts. */
  fix?: {
    /** Computer OCB (stage FIX, pamoja na ledger fupi iliyofungwa) */
    ocb: (m: Milestone, round: number, openDefects: number) => Promise<string>;
    /** awamu ya Computer (engine.startComputerPhase + fix) */
    run: (m: Milestone, planMarkdown: string, fix: FixPhaseInput) => Promise<BuildOutcome>;
    /** acceptance + global checks (task 21 runChecks) kwenye sandbox ya milestone */
    checks: (m: Milestone, rc: RoundChecks) => Promise<{ results: EvidenceCheckResult[]; ms: number }>;
    /** TASK-27 (pair_patch): harness `git apply --check` → `git apply` + commit kwenye sandbox */
    applyPatch?: (m: Milestone, round: number, co: ChangeOrder) => Promise<PatchApply>;
  };
  /** TASK-26: raundi ya uthibitisho — evidence upya (tasks 19–22) → reviewers 2 → decide → git → Optimus COs. */
  verify?: {
    evidence: (m: Milestone, round: number, planMarkdown: string, cos: ChangeOrder[]) => Promise<NonNullable<BuildOutcome["evidence"]>>;
    /** OCB (bila stage/self) + ledger kwa reviewers · TASK-33: mini-reports za agenda za milestone (hiari) */
    context: (m: Milestone, round: number, openDefects: number) => Promise<{ ocb: VerifyContext["ocb"]; ledger: VerifyContext["ledger"]; ledgerLines: string[]; miniReports?: VerifyContext["agendaMiniReports"] }>;
    git: (m: Milestone, op: { kind: "tag"; name: string } | { kind: "revert"; from: string; message: string; label: string } | { kind: "signoff"; tag: string; message: string }) => Promise<{ ok: boolean; sha: string; detail: string }>;
    /** TASK-28 (sign-off, task 22): screenshots zilizoidhinishwa za raundi hii → baselines (sandbox + storage) */
    saveBaselines?: (m: Milestone, round: number) => Promise<{ uploaded: number; entries: number; errors: string[]; manifestUrl?: string }>;
    /** majaribio tu: badala ya LLM halisi */
    deps?: VerifyDeps;
    consolidate?: (i: ConsolidateInput) => Promise<ConsolidateResult>;
    /** TASK-27: LLM ya escalation (majaribio: stub) + kusoma faili za sandbox (pair patch) */
    escalateComplete?: EscalateDeps["complete"];
    readFiles?: (m: Milestone, paths: string[]) => Promise<Record<string, string>>;
    /** test hook (XMD_TEST_STOP_AFTER_ROUND): simama baada ya uthibitisho wa raundi hii */
    stopAfterRound?: number;
  };
  /** TASK-33: Optimus anaandika maelezo ya mini-report ya review + reviewers wanathibitisha R0 (bila hook → data za code peke yake) */
  memo?: { complete?: MemoComplete };
}

/** TASK-16: matokeo ya awamu ya Computer (engine.MilestoneBuildOutcome — bila ku-import engine hapa). */
export interface BuildOutcome {
  ok: boolean;
  /** CuFinalState (task 3) au "PAUSED" (Board ilipumzishwa katikati — hatua inarudiwa ikiresume) */
  finalState: string;
  reason: string;
  report?: string;
  sandboxId?: string;
  freshSandbox?: boolean;
  restored?: number;
  gitLog?: string;
  ms?: number;
  /** TASK-17: ripoti ghafi kutoka sandbox (engine.MsBuildReportRaw) */
  buildReport?: { found: boolean; path: string; markdown: string; fileId?: string; changed: string[] };
  /** TASK-19: EvidencePack ya R0 (engine.captureEvidence) — visual/mixed tu */
  evidence?: { pack: EvidencePack; exit: number; invalid: string[]; uploaded: number; ms: number };
  /** TASK-25: receipts + git diff ya raundi ya marekebisho (engine.MsFixRaw) */
  fix?: FixRaw;
}

export const buildKey = (milestoneId: string) => `build:${milestoneId}`;
export const reportKey = (milestoneId: string) => `report:${milestoneId}`;

/** TASK-19: hifadhi EvidencePack (`evidence:Mk:R0`) + tukio `evidence` + chip 📸. Haibadilishi hali (review inapima baadaye). */
async function recordEvidence(runner: LoopRunner, m: Milestone, hooks: LoopHooks, ev: NonNullable<BuildOutcome["evidence"]>) {
  const p = ev.pack;
  await msUpdate(runner, evidenceKey(m.id, p.round), () => ({
    version: 1, ...p, screenshots: p.screenshots.slice(0, 120), consoleErrors: p.consoleErrors.slice(0, 60), errors: p.errors.slice(0, 60),
    exit: ev.exit, invalid: ev.invalid.slice(0, 20), uploaded: ev.uploaded, ms: ev.ms, at: new Date().toISOString(),
  }));
  hooks.bcast({ type: "evidence", id: m.id, round: p.round, screenshots: p.screenshots.length, uploaded: ev.uploaded, errors: p.errors.length, consoleErrors: p.consoleErrors.length, invalid: ev.invalid.length, exit: ev.exit });
  const bad = p.errors.length > 0 || ev.invalid.length > 0;
  hooks.addChip(`📸 Evidence ya ${m.id} R${p.round}: ${p.screenshots.length} screenshots · errors ${p.errors.length} · console ${p.consoleErrors.length}`);
  hooks.blog(bad ? "warning" : "success", `📸 Evidence ya ${m.id} R${p.round}: ${p.screenshots.length} screenshots (uploaded ${ev.uploaded}) · errors ${p.errors.length}${p.errors.length ? ` — ${p.errors.slice(0, 3).map((e) => `${e.kind}: ${e.detail}`).join("; ").slice(0, 240)}` : ""}.`);
}

/** TASK-17: kagua Build Report (muundo + sehemu ya 2 ↔ git diff), ihifadhi `report:Mk`, toa tukio `buildReport`.
 *  Haibadilishi hali ya milestone (lango la on_stop ni task 18; review inapima baadaye). */
async function recordBuildReport(runner: LoopRunner, m: Milestone, hooks: LoopHooks, raw: NonNullable<BuildOutcome["buildReport"]> | undefined) {
  const r = raw ?? { found: false, path: buildReportPath(m.id), markdown: "", changed: [] };
  const parsed = r.found ? parseBuildReport(r.markdown) : { ok: false, errors: [`report file missing: ${r.path}`], paths: [] as string[], commands: [] as BuildReportCommand[], sections: {} };
  const cross = crossCheckBuildReport(parsed.paths, r.changed);
  const inline = r.markdown.length <= BUILD_REPORT_INLINE_MAX || !r.fileId;
  await msUpdate(runner, reportKey(m.id), () => ({
    version: 1, id: m.id, path: r.path, found: r.found, ok: parsed.ok, errors: parsed.errors,
    paths: parsed.paths, commands: parsed.commands.slice(0, 60), changed: r.changed.slice(0, 300), fake: cross.fake, unreported: cross.unreported,
    chars: r.markdown.length, markdown: inline ? r.markdown.slice(0, BUILD_REPORT_INLINE_MAX) : "", fileId: r.fileId,
    at: new Date().toISOString(),
  }));
  hooks.bcast({
    type: "buildReport", id: m.id, found: r.found, ok: parsed.ok, errors: parsed.errors.slice(0, 10),
    sections: Object.keys(parsed.sections).length, commands: parsed.commands.length, paths: parsed.paths.length,
    fake: cross.fake.slice(0, 20), unreported: cross.unreported.slice(0, 20), chars: r.markdown.length, fileId: r.fileId,
  });
  const flags = [
    !r.found ? "haipo" : parsed.ok ? "muundo sahihi" : `makosa ${parsed.errors.length}`,
    cross.fake.length ? `paths ${cross.fake.length} hazipo kwenye git diff` : "",
    cross.unreported.length ? `faili ${cross.unreported.length} hazikutajwa` : "",
  ].filter(Boolean).join(" · ");
  const bad = !r.found || !parsed.ok || cross.fake.length > 0;
  hooks.addChip(`📑 Build Report ya ${m.id}: ${flags}`);
  hooks.blog(bad ? "warning" : "success", `📑 Build Report ya ${m.id}: ${flags}${parsed.errors.length ? ` — ${parsed.errors.slice(0, 3).join("; ")}` : ""}${cross.fake.length ? ` — fake: ${cross.fake.slice(0, 5).join(", ")}` : ""}.`);
}

/** Mfuatano wa forward edges hadi SIGNED_OFF (njia ya stub — hakuna mzunguko wa marekebisho bado). */
const STUB_PATH: MilestoneStatus[] = ["PLANNING", "BUILDING", "EVIDENCE", "REVIEW_R0", "SIGNED_OFF"];

class NoChange extends Error {}

/** Andika rekodi kupitia store (CAS) + iweke kwenye runner.msChips (persist ya Board huchuja hidden chips). */
export async function msUpdate<T>(runner: LoopRunner, key: string, mutate: (cur: T | null) => T): Promise<Versioned<T>> {
  const rec = await updateRecord<T>(runner.sessionId as string, key, (cur) => mutate(cur));
  mirrorChip(runner, key, rec);
  return rec;
}

export function mirrorChip(runner: LoopRunner, key: string, rec: Versioned<unknown>): void {
  const chip = msChip(key, rec.version, rec.data);
  runner.msChips = [...(runner.msChips || []).filter((x: any) => x?.id !== chip.id), chip];
  if (key.startsWith("state:") && runner.onMsState) { try { runner.onMsState(key.slice(6), rec.data as MilestoneState); } catch { /* UI tu */ } } // TASK-34
}

const must = (r: { state: MilestoneState } | { error: string }): MilestoneState => {
  if ("error" in r) throw new Error(`[milestone/loop] ${r.error}`);
  return r.state;
};

export function agendasOf(m: Milestone): number[] {
  return Array.from({ length: m.agendas.to - m.agendas.from + 1 }, (_, i) => m.agendas.from + i);
}

/** Milestone zinazoendeshwa sasa ndani ya process hii — kinga ya wito sambamba (mf. trigger mbili za haraka). */
const G = globalThis as unknown as { __xmdMsRunning?: Set<string> };
const running = (G.__xmdMsRunning ||= new Set<string>());

/**
 * Inaitwa baada ya kila agenda kufungwa (na mara moja wakati wa resume). Idempotent: state + stepId vinazuia
 * milestone kuendeshwa mara mbili; `milestoneClosed` inatolewa TU na aliyeshinda CAS ya DISCUSSING → PLANNING.
 * Inarudisha ids za milestones zilizokamilishwa katika wito huu.
 */
/** TASK-29: hints za COs za technical — checks kamili za plan + matokeo + faili halisi (badala ya DOM HINTS). */
function techHintsFor(m: Milestone, planMd: string, pack: EvidencePack): string[] {
  let planChecks: Check[] = [];
  try { planChecks = validateMilestonePlan(planMd, { id: m.id, reviewMode: "technical" }).checks; } catch { /* plan mbovu → matokeo + faili tu */ }
  return technicalHints(planChecks, pack);
}

/** state mpya ya milestone — TASK-28 test hook `XMD_TEST_MAX_ROUNDS` inashusha kikomo (inert bila XMD_TEST_HOOKS=1) */
export const freshMilestoneState = (id: string): MilestoneState => { const st = newMilestoneState(id); const cap = testMaxRounds(); return cap ? { ...st, maxRounds: cap } : st; };

/** TASK-28: deps za closeOutMilestone (sign-off / cap) kutoka hooks za loop */
export function closeoutDeps(runner: LoopRunner, m: Milestone, hooks: LoopHooks): CloseoutDeps {
  const sid = runner.sessionId as string;
  const vh = hooks.verify;
  return {
    sid, update: (key, mutate) => msUpdate(runner, key, mutate),
    git: vh ? async (tag, message) => vh.git(m, { kind: "signoff", tag, message }) : undefined,
    saveBaselines: vh?.saveBaselines && m.reviewMode !== "technical" ? async (round) => {
      // evidence inayolingana na HEAD (raundi iliyorudishwa → ya mwisho isiyorudishwa)
      const outcomes: Record<number, string | null> = {};
      for (let r = 1; r <= round; r++) outcomes[r] = (await getRecord<{ outcome?: { outcome?: string } }>(sid, verifyKey(m.id, r)))?.data?.outcome?.outcome ?? null;
      const br = baselineRound(round, outcomes);
      if (br === null) return { uploaded: 0, entries: 0, errors: [`skipped: R${round} was reverted and no earlier round has evidence that matches HEAD`] };
      return { ...(await vh.saveBaselines!(m, br)), fromRound: br };
    } : undefined,
    crashAfterGit: async () => {
      if (!testCrashAfterSignoffGit(m.id)) return;
      const mark = `xmdtest-crash:${m.id}`; // mara moja tu — alama kwenye store (inadumu baada ya restart ya container)
      if ((await getRecord(sid, mark))?.data) return;
      await msUpdate(runner, mark, () => ({ version: 1, at: new Date().toISOString() }));
      hooks.blog("warning", `🧪 XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_${m.id}: kill -9 baada ya commit/tag (kabla ya rekodi)`);
      await hooks.persist().catch(() => {});
      process.kill(process.pid, "SIGKILL");
    },
    bcast: hooks.bcast, addChip: hooks.addChip, blog: hooks.blog,
  };
}

export async function maybeCloseMilestones(runner: LoopRunner, hooks: LoopHooks): Promise<string[]> {
  if (!milestonesEnabled() || !runner.msMap || !runner.sessionId) return [];
  const resolved = await hooks.resolvedAgendas();
  const done: string[] = [];
  for (const m of runner.msMap.milestones) {
    if (!agendasOf(m).every((i) => resolved.has(i))) continue;
    const cur = (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data ?? null;
    const status = cur?.status ?? "DISCUSSING";
    if (TERMINAL_STATUSES.includes(status)) continue;
    const visionHold = isVisionHold(cur); // TASK-30: PAUSED_QUOTA ya SYSTEM (vision) — inasubiri resumeAt kisha inaendelea yenyewe
    const retry = status === "BLOCKED" && (await canRetryBlocked(runner.sessionId, m, cur, hooks)); // TASK-32: BLOCKED → re-plan MARA MOJA
    if (HOLD_STATUSES.includes(status) && !visionHold && !retry) continue; // TASK-15: BLOCKED (baada ya retry 1) / PAUSED — hairudiwi yenyewe
    if ((status === "VERIFYING" && !hooks.verify) || (status === "FIXING" && !hooks.fix)) continue; // TASK-24/25/26: FIXING → hooks.fix · VERIFYING → hooks.verify
    const lockKey = `${runner.sessionId}:${m.id}`;
    if (running.has(lockKey)) continue;
    running.add(lockKey);
    try {
      if (visionHold && !(await waitVisionThenResume(runner, m, hooks, hooks.visionWait))) continue;
      if (retry) {
        let moved = false;
        try {
          await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
            if (!s || s.status !== "BLOCKED") throw new NoChange(); // mwingine ameshairudia → si sisi
            return must(replanBlocked(s));
          });
          moved = true;
        } catch (e) {
          if (!(e instanceof NoChange)) throw e;
        }
        if (!moved) continue;
        await msUpdate(runner, digestKey(m.id, 0), () => ({ version: 1, byId: null, clearedBy: "blocked-retry", at: new Date().toISOString() })); // digest ya build ya zamani isitumike
        const step = cur ? failedR0Step(cur) : null;
        hooks.bcast({ type: "milestoneRetry", id: m.id, failedStep: step, attempt: 1, max: BLOCKED_RETRY_MAX });
        hooks.addChip(`🔁 Milestone ${m.id} ilikuwa BLOCKED (hatua: ${step}) — inarudiwa MARA MOJA: plan mpya → build → evidence → review`);
        hooks.blog("warning", `🔁 ${m.id}: BLOCKED (${step}) → PLANNING — retry ${1}/${BLOCKED_RETRY_MAX} (re-plan kamili ya R0).`);
        await hooks.persist();
        await runMilestoneBuild(runner, m, hooks);
        await memoClose(runner, m, hooks, true); // TASK-33 (sehemu 8)
        done.push(m.id);
        continue;
      }
      let won = false;
      if (status === "DISCUSSING") {
        try {
          await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
            const base = s ?? freshMilestoneState(m.id);
            if (base.status !== "DISCUSSING") throw new NoChange(); // mwingine ameshabadilisha → si sisi
            return must(transition(base, { type: "GOTO", to: "PLANNING" }));
          });
          won = true;
        } catch (e) {
          if (!(e instanceof NoChange)) throw e;
        }
      }
      if (won) {
        hooks.bcast({ type: "milestoneClosed", id: m.id });
        hooks.addChip(`🏁 Milestone ${m.id} closed — ${m.title} (agendas ${m.agendas.from}–${m.agendas.to})`);
        hooks.blog("success", `🏁 Milestone ${m.id} imefungwa (agenda ${m.agendas.from}–${m.agendas.to} zote ziko kwenye Ledger) → PLANNING.`);
      } else {
        hooks.blog("info", `♻️ Milestone ${m.id} iko ${status} — inaendelea pale ilipoachwa (resume).`);
      }
      await runMilestoneBuild(runner, m, hooks);
      await memoClose(runner, m, hooks); // TASK-33 (sehemu 8)
      done.push(m.id);
    } finally {
      running.delete(lockKey);
    }
  }
  return done;
}

/** TASK-32: BLOCKED inarudiwa (re-plan) MARA MOJA tu — kabla ya raundi za marekebisho, na hatua iliyoshindwa ni plan/build,
 *  au review iliyokwama KABLA reviewers hawajaandika findings (mf. evidence errors). Kizuizi cha raundi 1+ hakirudiwi (rekodi za raundi). */
export async function canRetryBlocked(sessionId: string, m: Milestone, cur: MilestoneState | null, hooks: Pick<LoopHooks, "plan" | "build">): Promise<boolean> {
  if (!cur || cur.status !== "BLOCKED" || !hooks.plan || !hooks.build) return false;
  if (cur.round !== 0 || (cur.blockedRetries || 0) >= BLOCKED_RETRY_MAX) return false;
  const step = failedR0Step(cur);
  if (step === "plan" || step === "build") return true;
  if (step === "review") return !(await getRecord(sessionId, findingsKey(m.id, 0)))?.data;
  return false;
}

/**
 * STUB (task 14): hatua `plan` na `build` zinawekwa DONE (stub:true), kisha state → SIGNED_OFF kwa forward edges.
 * Kila hatua inaruka ikiwa tayari DONE (resume haiendeshi kitu mara mbili).
 */
export async function runMilestoneBuild(runner: LoopRunner, m: Milestone, hooks: LoopHooks): Promise<MilestoneState> {
  const steps = ["plan", "build", ...(hooks.review ? ["review"] : [])].map((s) => stepIdOf(m.id, 0, s)); // TASK-24: review baada ya evidence
  let rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(planSteps(s ?? freshMilestoneState(m.id), steps)));
  for (const id of steps) {
    if ((rec.data.steps || []).find((x) => x.stepId === id)?.status === "DONE") continue;
    if (id.endsWith(".plan") && hooks.plan) {
      // TASK-15: plan halisi ya milestone (build inabaki stub hadi task 16)
      const r = await runPlanStep(runner, m, hooks, id);
      if (!r.ok) return r.state;
      rec = { ...rec, data: r.state };
      continue;
    }
    if (id.endsWith(".build") && hooks.build) {
      // TASK-16: XMD Computer halisi (awamu moja kwa milestone hii)
      const r = await runBuildStep(runner, m, hooks, id);
      if (!r.ok) return r.state;
      rec = { ...rec, data: r.state };
      continue;
    }
    if (id.endsWith(".review") && hooks.review) {
      // TASK-24: R0 — findings huru (T23) → mjadala wa timu (R-Mk-0) → Optimus COs. CHANGES → FIXING.
      const r = await runReviewStep(runner, m, hooks, id);
      if (!r.ok && !(r.state.status === "FIXING" && hooks.fix)) return r.state;
      rec = { ...rec, data: r.state };
      if (r.state.status === "FIXING") break; // TASK-25: raundi ya marekebisho inafuata (chini)
      continue;
    }
    rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
      const st = must(setStep(s as MilestoneState, id, "DONE"));
      return { ...st, steps: (st.steps || []).map((x) => (x.stepId === id ? { ...x, stub: true } : x)) };
    });
    hooks.blog("info", `🧩 ${id} DONE (stub — kazi halisi inakuja tasks 15+).`);
  }
  if ((rec.data.status === "FIXING" && hooks.fix) || (rec.data.status === "VERIFYING" && hooks.verify)) return runFixVerifyLoop(runner, m, rec.data, hooks); // TASK-25/26 (resume pia)
  if (rec.data.status === "REVIEW_R0" && hooks.review && hooks.verify && runner.sessionId) {
    // TASK-28: R0 bila mabadiliko → utaratibu kamili wa sign-off (ledger, commit + tag, baselines, ripoti, event) kabla ya mpito
    const ds = (await getRecord<{ defects?: Defect[] }>(runner.sessionId, "defects"))?.data?.defects || [];
    const to = signoffStatus(ds, m.id);
    const co = await closeOutMilestone(m, 0, to, "R0 review: no changes needed", closeoutDeps(runner, m, hooks));
    rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(s as MilestoneState, { type: "GOTO", to: co.problems.length ? "BLOCKED" : to })));
    hooks.blog(co.problems.length ? "error" : "success", `✅ Milestone ${m.id} → ${rec.data.status}${co.problems.length ? `: ${co.problems.join(" · ")}` : " (R0)"}.`);
    await hooks.persist();
    return rec.data;
  }
  rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    let st = s as MilestoneState;
    for (let i = STUB_PATH.indexOf(st.status) + 1; i > 0 && i < STUB_PATH.length; i++) st = must(transition(st, { type: "GOTO", to: STUB_PATH[i] }));
    return st;
  });
  hooks.blog("success", `✅ Milestone ${m.id} → ${rec.data.status}${hooks.build ? " (evidence/review bado stub — tasks 17+)" : " (stub)"}.`);
  await hooks.persist();
  return rec.data;
}

export const planKey = (milestoneId: string) => `plan:${milestoneId}`;

/** TASK-15: hatua ya plan — RUNNING → Optimus anaandika → store `plan:Mk` + event `milestonePlan` → DONE au FAILED + BLOCKED. */
async function runPlanStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState }> {
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "RUNNING")));
  await hooks.persist();
  const res = await (hooks.plan as NonNullable<LoopHooks["plan"]>)(m);
  await msUpdate(runner, planKey(m.id), () => ({ ...res, version: 1, generatedAt: new Date().toISOString() }));
  hooks.bcast({ type: "milestonePlan", id: m.id, status: res.status, executable: res.executable, steps: res.steps, checks: res.checks, routes: res.routes, reasons: res.reasons, warnings: res.warnings, markdown: res.markdown });
  if (!res.executable) {
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to: "BLOCKED" })));
    hooks.addChip(`⛔ Plan ya Milestone ${m.id} haitekelezeki (${res.status}) — XMD Computer HAIANZI. ${res.reasons.slice(0, 2).join(" · ").slice(0, 220)}`);
    hooks.blog("error", `⛔ Plan ya ${m.id}: ${res.status} — ${res.reasons.join(" · ").slice(0, 400)} → ${m.id} BLOCKED (Computer haianzi).`);
    await hooks.persist();
    return { ok: false, state: rec.data };
  }
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  hooks.addChip(`🗺️ Plan ya Milestone ${m.id} iko tayari — hatua ${res.steps} · checks ${res.checks}${res.routes ? ` · routes ${res.routes}` : ""}${res.warnings.length ? ` · onyo ${res.warnings.length}` : ""}`);
  hooks.blog("success", `🗺️ Plan ya ${m.id}: active · hatua ${res.steps} · checks ${res.checks} · routes ${res.routes} · marekebisho muundo ${res.repairs.structure}/data ${res.repairs.guard}.`);
  await hooks.persist();
  return { ok: true, state: rec.data };
}

/** TASK-16: hatua ya build — PLANNING → BUILDING, Computer (StartPack, bridge mpya) → store `build:Mk` + event `milestoneBuild`.
 *  STUCK/BLOCKED/ERROR → FAILED + BLOCKED · PAUSED_QUOTA → FAILED + PAUSED_QUOTA · PAUSED (Board pause) → hatua inabaki RUNNING (resume inairudia). */
async function runBuildStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState }> {
  const plan = runner.sessionId ? (await getRecord<{ markdown?: string; executable?: boolean }>(runner.sessionId, planKey(m.id)))?.data : null;
  const fail = async (to: MilestoneStatus, why: string) => {
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to })));
    hooks.addChip(`⛔ Build ya Milestone ${m.id}: ${why.slice(0, 240)}`);
    hooks.blog("error", `⛔ Build ya ${m.id}: ${why.slice(0, 400)} → ${m.id} ${to}.`);
    await hooks.persist();
    return { ok: false, state: rec.data };
  };
  if (!plan?.markdown || plan.executable === false) return fail("BLOCKED", `plan:${m.id} haipo au haitekelezeki — Computer haianzi`);
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    let st = must(setStep(s as MilestoneState, id, "RUNNING"));
    if (st.status === "PLANNING") st = must(transition(st, { type: "GOTO", to: "BUILDING" }));
    return st;
  });
  await hooks.persist();
  hooks.ui?.({ t: "cu", id: m.id, r: 0 }); // TASK-34: badge ya Computer (kila inapoingia)
  const out = await (hooks.build as NonNullable<LoopHooks["build"]>)(m, plan.markdown);
  await msUpdate(runner, buildKey(m.id), () => ({
    version: 1, id: m.id, title: m.title, ok: out.ok, finalState: out.finalState, reason: out.reason,
    report: String(out.report || "").slice(0, 12_000), sandboxId: out.sandboxId, freshSandbox: out.freshSandbox,
    restored: out.restored, gitLog: out.gitLog, ms: out.ms, at: new Date().toISOString(),
  }));
  hooks.bcast({ type: "milestoneBuild", id: m.id, ok: out.ok, finalState: out.finalState, reason: out.reason, restored: out.restored ?? 0, freshSandbox: !!out.freshSandbox });
  if (out.finalState !== "PAUSED") {
    try { await recordBuildReport(runner, m, hooks, out.buildReport); }
    catch (e: any) { hooks.blog("warning", `📑 Build Report ya ${m.id} haikuhifadhiwa: ${String(e?.message || e).slice(0, 160)}`); }
    if (out.evidence) {
      try { await recordEvidence(runner, m, hooks, out.evidence); }
      catch (e: any) { hooks.blog("warning", `📸 Evidence ya ${m.id} haikuhifadhiwa: ${String(e?.message || e).slice(0, 160)}`); }
    }
  }
  if (out.finalState === "PAUSED") {
    hooks.blog("warning", `⏸️ Build ya ${m.id} imesimama (Board pause) — itarudiwa Board ikiresume.`);
    const cur = runner.sessionId ? (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data : null;
    return { ok: false, state: (cur ?? newMilestoneState(m.id)) as MilestoneState };
  }
  if (!out.ok && out.finalState === "PAUSED_QUOTA") {
    // TASK-32: zamani FAILED + PAUSED_QUOTA bila origin → HOLD ya milele (M1 ya run 7). Sasa: subiri → jaribu build tena.
    if (await holdForBuildQuota(runner, m, hooks, id, out.reason || "paused (quota)")) return runBuildStep(runner, m, hooks, id);
    const cur = runner.sessionId ? (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data : null;
    return { ok: false, state: (cur ?? newMilestoneState(m.id)) as MilestoneState };
  }
  if (!out.ok) return fail("BLOCKED", `${out.finalState}${out.reason ? ` — ${out.reason}` : ""} (XMD Computer)`);
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  hooks.addChip(`🧱 Build ya Milestone ${m.id}: ${out.finalState}${out.restored ? ` · faili ${out.restored} zimerejeshwa` : ""}`);
  hooks.blog("success", `🧱 Build ya ${m.id}: ${out.finalState} — hatua DONE.`);
  await hooks.persist();
  return { ok: true, state: rec.data };
}

/** TASK-24: Optimus anaunganisha REVIEW kuwa Change Orders (lanes za kawaida za Optimus; stall default 90s). */
export async function defaultConsolidate(i: ConsolidateInput, log?: LoopHooks["blog"], sessionId?: string): Promise<ConsolidateResult> {
  return consolidate(i, {
    complete: async (messages, attempt) => (attempt === 1 && sessionId && maybeCapturePrompt({ sessionId, agent: "pm", agenda: 0, phase: `consolidate:${i.milestoneId}:R${i.round}`, system: messages.map((x) => x.content).join("\n\n") }), await brokerComplete({
      agentId: "pm", purpose: `review-consolidate:${i.milestoneId}:R${i.round}:a${attempt}`, messages: messages as never,
      maxOut: 16_000, cls: "heavy", temperature: 0.2, priority: "background", waitMs: 120_000, critical: true,
      maxHops: 32, // TASK-32 (E2E halisi): quota ya Gemini ikiisha, hops 5 zote ziliangukia lanes za 429 → R0 BLOCKED
    })).text,
    log: log ? (lvl, t) => log(lvl, t) : undefined,
    retryDelayMs: 45_000,
  });
}

/** TASK-24: hatua ya review — EVIDENCE → REVIEW_R0 → runReviewRound → NO_CHANGES (SIGNED_OFF kwa njia ya kawaida) |
 *  CHANGES (COs zimehifadhiwa → FIXING, round 1; raundi za marekebisho ni tasks 25+) | FAILED (CO haikuthibitika → BLOCKED). */
async function runReviewStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState; result?: ReviewRoundResult }> {
  const rh = hooks.review as NonNullable<LoopHooks["review"]>;
  const sid = runner.sessionId as string;
  let ev = sid ? (await getRecord<EvidencePack>(sid, evidenceKey(m.id, 0)))?.data : null;
  // TASK-32 (E2E halisi, E7 M2): harness haikupata screenshots kwa sababu app HAIKUHUDUMIA (next start → HTTP 500), lakini
  // tawi la "hakuna evidence" liliruka review → M2 SIGNED_OFF ya uongo. Evidence yenye errors ≠ hakuna evidence:
  // XMD Computer inajenga upya ikiwa na kosa (hadi mara EVIDENCE_REBUILDS); ikishindikana → BLOCKED, kamwe si sign-off.
  for (let k = 1; ev && hooks.build && !(ev.screenshots || []).length && !ev.technical && (ev.errors || []).length; k++) {
    const why = (ev.errors || []).map((e) => `${e.kind}: ${String(e.detail || "").slice(0, 700)}`).join("\n");
    if (k > (hooks.evidenceRebuilds ?? EVIDENCE_REBUILDS)) {
      const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to: "BLOCKED" })));
      hooks.addChip(`⛔ ${m.id}: app haihudumii kwenye evidence harness hata baada ya kujenga upya mara ${k - 1} — sign-off IMEKATALIWA (${why.slice(0, 160)})`);
      hooks.blog("error", `⛔ ${m.id}: evidence errors bila screenshots → BLOCKED (si SIGNED_OFF): ${why.slice(0, 400)}`);
      await hooks.persist();
      return { ok: false, state: rec.data };
    }
    const plan = (await getRecord<{ markdown?: string }>(sid, planKey(m.id)))?.data?.markdown || "";
    hooks.addChip(`🔁 ${m.id}: evidence harness haikupata screenshots — app haihudumii (${why.slice(0, 140)}) → XMD Computer inajenga upya (${k}/${hooks.evidenceRebuilds ?? EVIDENCE_REBUILDS})`);
    hooks.ui?.({ t: "cu", id: m.id, r: 0 }); // TASK-34: Computer inaingia tena (kujenga upya)
    const out = await hooks.build(m, `${plan}\n\n## EVIDENCE HARNESS FAILURE — MUST FIX FIRST\nAfter your last build the independent evidence harness ran \`npm run build && npm run start -- -p 4173\` and the app did NOT serve HTTP 200 on / — no screenshots could be taken, so this milestone cannot be reviewed or signed off. Harness error:\n${why}\nFind the root cause (read .xmd/evidence/${m.id}/R0/server.log), fix it, and confirm the production server answers HTTP 200 on every planned route before you finish.`);
    if (out.finalState === "PAUSED" || out.finalState === "PAUSED_QUOTA") {
      hooks.blog("warning", `⏸️ ${m.id}: kujenga upya baada ya evidence errors kumesimama (${out.finalState}) — kutarudiwa.`);
      const cur = (await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data;
      return { ok: false, state: (cur ?? newMilestoneState(m.id)) as MilestoneState };
    }
    try { await recordBuildReport(runner, m, hooks, out.buildReport); } catch { /* si lazima */ }
    if (out.evidence) {
      try { await recordEvidence(runner, m, hooks, out.evidence); }
      catch (e: any) { hooks.blog("warning", `📸 Evidence ya ${m.id} haikuhifadhiwa: ${String(e?.message || e).slice(0, 160)}`); }
    }
    ev = (await getRecord<EvidencePack>(sid, evidenceKey(m.id, 0)))?.data ?? null;
  }
  if (!ev || (!(ev.screenshots || []).length && !ev.technical)) {
    // hakuna screenshots WALA ushahidi wa technical (TASK-29) → review ya R0 inarukwa (njia ya zamani)
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
      const st = must(setStep(s as MilestoneState, id, "DONE"));
      return { ...st, steps: (st.steps || []).map((x) => (x.stepId === id ? { ...x, stub: true } : x)) };
    });
    hooks.blog("info", `🧑‍⚖️ ${m.id}: hakuna evidence (screenshots wala technical) (${m.reviewMode}) — REVIEW R0 imerukwa.`);
    return { ok: true, state: rec.data };
  }
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    let st = must(setStep(s as MilestoneState, id, "RUNNING"));
    for (const to of ["EVIDENCE", "REVIEW_R0"] as MilestoneStatus[]) {
      const order = ["BUILDING", "EVIDENCE", "REVIEW_R0"];
      if (order.indexOf(st.status) >= 0 && order.indexOf(st.status) < order.indexOf(to)) st = must(transition(st, { type: "GOTO", to }));
    }
    return st;
  });
  await hooks.persist();
  const ctx = await rh.context(m, ev);
  // TASK-26: RoundHeader inajengwa kutoka DB kila wito (si thamani ya kudumu)
  const header0 = fixRoundHeader(m, 0, MAX_ROUNDS, (await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || []);
  const cast = milestoneCast(m); // TASK-29: technical → Megatron/Cybertron (kutoka roster)
  ctx.analyseCtx = { ...ctx.analyseCtx, roundHeader: header0, cast, reviewMode: m.reviewMode };
  hooks.ui?.({ t: "rev", id: m.id, r: 0, who: [castAgentId(cast, "designer"), castAgentId(cast, "frontend")] }); // TASK-34: badge ya reviewers (R0)
  if (m.reviewMode === "technical") hooks.blog("info", `🛡️ ${m.id}: technical review — reviewers ${castNames(cast)} (roster: ${m.roster.join(", ")}) · screenshots 0 · checks ${(ev.checks || []).length}`);
  const result = await runReviewRound({
    milestoneId: m.id, milestoneTitle: m.title, round: 0, reviewMode: m.reviewMode, pack: ev, ledgerLines: ctx.ledgerLines, domHints: m.reviewMode === "technical" ? techHintsFor(m, ctx.analyseCtx.planMarkdown || "", ev) : [],
    participants: reviewParticipants(ctx.extraParticipants, cast), roundHeader: formatRoundHeader(header0), cast,
  }, {
    analyse: async () => {
      const imageDigest = await ensureDigest(runner, m, 0, ev, hooks, rh.analyseDeps?.loadImage, id); // TASK-30: Flash vision MAPEMA
      const r = await reviewRound0(ev, ctx.analyseCtx, { log: (lvl, t) => hooks.blog(lvl, t), imageDigest, onLane: laneSink(runner, m, id), ...(rh.analyseDeps || {}) });
      if (hooks.say) { // TASK-34: findings za kila reviewer — kamili, kama ujumbe wake kwenye chat
        const names = reviewerNames(m);
        for (const rv of REVIEWERS) hooks.say(castAgentId(cast, rv), renderR0Findings(r[rv].findings, names[rv]));
      }
      return {
        designer: r.designer.findings, frontend: r.frontend.findings,
        meta: { independence: { ok: r.independence.ok, hashesDiffer: r.independence.hashesDiffer, leaks: [r.independence.designerLeakIntoFrontend.length, r.independence.frontendLeakIntoDesigner.length] }, designer: r.designer.meta, frontend: r.frontend.meta },
      };
    },
    discuss: rh.discuss,
    consolidate: rh.consolidate || ((i) => defaultConsolidate(i, hooks.blog, sid)),
    store: {
      get: async <T,>(key: string) => ((await getRecord<T>(sid, key))?.data ?? null),
      update: async <T,>(key: string, mutate: (cur: T | null) => T) => (await msUpdate<T>(runner, key, mutate)).data,
    },
    bcast: hooks.bcast, blog: hooks.blog, addChip: hooks.addChip,
  });
  if (result.status === "FAILED") {
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to: "BLOCKED" })));
    hooks.blog("error", `⛔ ${result.reviewId}: ${result.reason} → ${m.id} BLOCKED (defect bila CO ni kosa).`);
    await hooks.persist();
    return { ok: false, state: rec.data, result };
  }
  if (result.status === "CHANGES") {
    await writeR0Memo(runner, m, hooks, result); // TASK-33: mini-report ya R0 + uthibitisho wa reviewers (MARA MOJA)
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "DONE")), { type: "GOTO", to: "FIXING" })));
    hooks.blog("info", `🔧 ${m.id} → FIXING (round ${rec.data.round}) — COs ${result.changeOrders.length} zinasubiri raundi za marekebisho (tasks 25+).`);
    await hooks.persist();
    return { ok: false, state: rec.data, result };
  }
  // TASK-30: NO_CHANGES → sign-off ifuatayo; visual/mixed HAIKUBALI verdicts za visionDegraded → PAUSED_QUOTA → vision ikirudi: R0 upya
  if (m.reviewMode !== "technical") {
    const fr = (await getRecord<{ meta?: Record<string, { visionDegraded?: boolean; lane?: string } | undefined> }>(sid, findingsKey(m.id, 0)))?.data;
    const deg = REVIEWERS.filter((r) => fr?.meta?.[r]?.visionDegraded);
    if (deg.length) {
      hooks.addChip(`🚫 ${m.id} R0: sign-off ya ${m.reviewMode} imekataliwa — verdicts ni visionDegraded (${deg.join(", ")})`);
      const lanes = Object.fromEntries(REVIEWERS.map((r) => [r, String(fr?.meta?.[r]?.lane || "")]));
      await msUpdate(runner, findingsKey(m.id, 0), (cur) => ({ ...(cur as object), superseded: true }));
      await msUpdate(runner, reviewKey(m.id, 0), (cur) => ({ ...(cur as object), superseded: true }));
      if (!(await pauseForVision(runner, m, hooks, id, `R0 verdicts visionDegraded (${deg.join(", ")})`, lanes))) return { ok: false, state: (await getRecord<MilestoneState>(sid, stateKey(m.id)))!.data, result };
      return runReviewStep(runner, m, hooks, id);
    }
  }
  await writeR0Memo(runner, m, hooks, result); // TASK-33
  await emitLaneDigest(runner, m, hooks, "R0");
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  await hooks.persist();
  return { ok: true, state: rec.data, result };
}

/* ============================ TASK-30: judge lanes · vision rule ============================ */

export const visionPauseKey = (milestoneId: string) => `visionPause:${milestoneId}`;
/** muda kati ya ukaguzi wa nafasi ya vision wakati wa PAUSED_QUOTA (mmiliki: muda si tatizo — tunasubiri) */
export const VISION_POLL_MS = 3 * 60_000;
/** TASK-32: + `build:` — quota ya lanes za XMD Computer wakati wa build/raundi (zamani: PAUSED_QUOTA bila origin → hold ya milele) */
/** rekodi za ZAMANI: fail("PAUSED_QUOTA") ya build/raundi iliandika PAUSED_QUOTA BILA origin (code mpya haiandiki hivyo tena) → nazo ni build hold */
const isLegacyBuildHold = (s: MilestoneState | null | undefined) => s?.status === "PAUSED_QUOTA" && !s.pauseOrigin && (s.resumeTo === "BUILDING" || s.resumeTo === "FIXING");
const isVisionHold = (s: MilestoneState | null | undefined) => (s?.status === "PAUSED_QUOTA" && s.pauseOrigin === "system" && /^(vision|build):/.test(s.pauseReason || "")) || isLegacyBuildHold(s);
const isBuildHold = (s: MilestoneState | null | undefined) => /^build:/.test(s?.pauseReason || "") || isLegacyBuildHold(s);
/** TASK-32 (E2E run 7): muda kabla ya kujaribu tena build iliyosimama kwa quota (ikiwa bado hakuna quota → hold mpya) */
export const EVIDENCE_REBUILDS = 2;
export const BUILD_QUOTA_POLL_MS = 20 * 60_000;

/** rekodi ya wito wa judge → state.lanesUsed (append-only; CAS ya store inalinda wito sambamba). Haiangushi loop. */
export async function recordLaneUse(runner: LoopRunner, milestoneId: string, rec: LaneUse): Promise<void> {
  if (!runner.sessionId) return;
  try { await msUpdate<MilestoneState>(runner, stateKey(milestoneId), (s) => appendLaneUse((s ?? freshMilestoneState(milestoneId)) as MilestoneState, rec)); }
  catch (e) { console.warn(`[milestone] lanesUsed ${milestoneId}: ${String((e as Error)?.message || e).slice(0, 160)}`); }
}
const lanePending = new WeakMap<LoopRunner, Set<Promise<void>>>();
/** stepId inawekwa WAKATI wa wito (rekodi inaandikwa async — currentStepId ingeweza kuwa hatua inayofuata: REAL T4 run 1) */
const laneSink = (runner: LoopRunner, m: Milestone, stepId?: string) => (rec: LaneUse) => {
  const set = lanePending.get(runner) || new Set<Promise<void>>();
  lanePending.set(runner, set);
  const p = recordLaneUse(runner, m.id, { ...rec, stepId: rec.stepId || stepId || "" }).finally(() => set.delete(p));
  set.add(p);
};
const laneShown = new WeakMap<LoopRunner, Map<string, number>>();
/** chip INAYOONEKANA (inaingia kwenye Export .md): muhtasari wa lanes za judge + kila wito mpya tangu muhtasari uliopita. */
async function emitLaneDigest(runner: LoopRunner, m: Milestone, hooks: LoopHooks, label: string): Promise<void> {
  try {
    await Promise.all([...(lanePending.get(runner) || [])]);
    const all = (await getRecord<MilestoneState>(runner.sessionId as string, stateKey(m.id)))?.data?.lanesUsed || [];
    const seen = laneShown.get(runner) || new Map<string, number>();
    laneShown.set(runner, seen);
    const fresh = all.slice(seen.get(m.id) ?? 0);
    if (!fresh.length) return;
    seen.set(m.id, all.length);
    const by: Record<string, number> = {};
    for (const x of all) by[x.laneClass || x.lane] = (by[x.laneClass || x.lane] || 0) + 1;
    const keys: Record<string, number> = {};
    for (const x of all) if (x.laneClass === "gemini-flash") keys[x.keyId] = (keys[x.keyId] || 0) + 1;
    const n = (f: (x: LaneUse) => boolean) => all.filter(f).length;
    const head = `🔌 ${m.id} lanes (${label}): wito ${all.length} · ${Object.entries(by).map(([k, v]) => `${k} ${v}`).join(" · ")}${Object.keys(keys).length ? ` · Flash keys ${Object.entries(keys).map(([k, v]) => `${k}×${v}`).join(" ")}` : ""} · fallback ${n((x) => !!(x.usedFallback ?? x.fallback))} · visionDegraded ${n((x) => !!x.visionDegraded)} · thinking tokens ${all.reduce((a, x) => a + (x.reasoningTokens || 0), 0)}`;
    const rows = fresh.slice(-16).map((x) => `- ${x.callId} · ${x.stepId} · ${x.purpose || "?"} → ${x.lane} (${x.model}) key ${x.keyId} · vision ${x.visionCapable ? "yes" : "NO"}${x.visionDegraded ? " · visionDegraded" : ""}${(x.usedFallback ?? x.fallback) ? " · fallback" : ""} · in ${x.tokensIn ?? "?"} / out ${x.tokensOut ?? "?"}${x.reasoningTokens ? ` (thinking ${x.reasoningTokens})` : ""} · ${(x.ms / 1000).toFixed(1)}s`);
    hooks.addChip([head, ...(fresh.length > 16 ? [`- … ${fresh.length - 16} za mwanzo ziko kwenye state:${m.id}.lanesUsed`] : []), ...rows].join("\n"));
  } catch (e) { console.warn(`[milestone] lane digest ${m.id}: ${String((e as Error)?.message || e).slice(0, 160)}`); }
}

/** digest ya picha za raundi (wito wa Flash wenye vision, KABLA ya wito wa judge) — imehifadhiwa `digest:Mk:Rn`. */
async function ensureDigest(runner: LoopRunner, m: Milestone, round: number, pack: EvidencePack, hooks: LoopHooks, loadImage?: ReviewDeps["loadImage"], stepId?: string): Promise<Record<string, string> | null> {
  if (m.reviewMode === "technical" || !(pack.screenshots || []).length || !runner.sessionId) return null;
  const have = (await getRecord<ImageDigest>(runner.sessionId, digestKey(m.id, round)))?.data;
  if (have?.byId) return have.byId;
  try {
    const d = await makeImageDigest(pack, { loadImage, onLane: laneSink(runner, m, stepId) });
    if (!d) { hooks.blog("warning", `🖼️ ${m.id} R${round}: digest ya picha haikupatikana — lane bila vision ingetumia DOM metrics pekee.`); return null; }
    await msUpdate(runner, digestKey(m.id, round), () => d);
    hooks.blog("info", `🖼️ ${m.id} R${round}: digest ya picha ${Object.keys(d.byId).length} (${d.lane}) — kwa lanes bila vision.`);
    return d.byId;
  } catch (e: any) {
    hooks.blog("warning", `🖼️ ${m.id} R${round}: digest ya picha imeshindwa: ${String(e?.message || e).slice(0, 160)}`);
    return null;
  }
}

/** PAUSED_QUOTA (origin system, resumeAt) — hatua husika FAILED (resume inairudia), kisha INASUBIRI lane ya vision. */
async function pauseForVision(runner: LoopRunner, m: Milestone, hooks: LoopHooks, stepId: string, why: string, lanes: Record<string, string> = {}): Promise<boolean> {
  const resumeAt = new Date(Date.now() + (hooks.visionWait?.pollMs ?? VISION_POLL_MS)).toISOString();
  await emitLaneDigest(runner, m, hooks, `kabla ya pause · ${stepId}`);
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    const st = must(transition(must(setStep(s as MilestoneState, stepId, "FAILED")), { type: "GOTO", to: "PAUSED_QUOTA" }));
    return { ...st, resumeAt, pauseOrigin: "system", pauseReason: `vision: ${why}` };
  });
  await msUpdate<{ version: number; events: unknown[] }>(runner, visionPauseKey(m.id), (cur) => ({ version: 1, events: [...(cur?.events || []), { stepId, why, lanes, pausedAt: new Date().toISOString(), resumeAt }] }));
  hooks.bcast({ type: "milestonePaused", id: m.id, status: "PAUSED_QUOTA", origin: "system", reason: why, resumeAt });
  hooks.addChip(`⏸️ ${m.id} PAUSED_QUOTA — ${why}. Inasubiri lane ya judge yenye vision (ukaguzi ${resumeAt.slice(11, 16)} UTC).`);
  hooks.blog("warning", `⏸️ ${m.id} → PAUSED_QUOTA (system · resumeAt ${resumeAt}) — ${why}.`);
  await hooks.persist();
  return waitVisionThenResume(runner, m, hooks, hooks.visionWait);
}

/** TASK-32: quota ya lanes za XMD Computer (build au raundi) → PAUSED_QUOTA ya SYSTEM (resumeAt) → subiri → RESUME → hatua inarudiwa. */
async function holdForBuildQuota(runner: LoopRunner, m: Milestone, hooks: LoopHooks, stepId: string, why: string): Promise<boolean> {
  const resumeAt = new Date(Date.now() + (hooks.buildQuotaPollMs ?? BUILD_QUOTA_POLL_MS)).toISOString();
  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
    const st = must(transition(must(setStep(s as MilestoneState, stepId, "FAILED")), { type: "GOTO", to: "PAUSED_QUOTA" }));
    return { ...st, resumeAt, pauseOrigin: "system", pauseReason: `build: ${why}`.slice(0, 300) };
  });
  hooks.bcast({ type: "milestonePaused", id: m.id, status: "PAUSED_QUOTA", origin: "system", reason: why, resumeAt });
  hooks.addChip(`⏸️ ${m.id} PAUSED_QUOTA — lanes za XMD Computer hazina quota (${why.slice(0, 120)}). Itajaribu tena yenyewe ${resumeAt.slice(11, 16)} UTC.`);
  hooks.blog("warning", `⏸️ ${m.id} → PAUSED_QUOTA (system · build · resumeAt ${resumeAt}) — ${why.slice(0, 300)}.`);
  await hooks.persist();
  return waitVisionThenResume(runner, m, hooks, hooks.visionWait);
}

/** Subiri resumeAt → kagua nafasi ya vision (broker) → RESUME, au resumeAt mpya na kusubiri tena. false = si pause ya vision / imesimamishwa. */
export async function waitVisionThenResume(runner: LoopRunner, m: Milestone, hooks: LoopHooks, opts: { pollMs?: number; ready?: () => { ready: boolean; lane: string | null } } = {}): Promise<boolean> {
  const sid = runner.sessionId as string;
  const poll = opts.pollMs ?? VISION_POLL_MS;
  for (;;) {
    const st = (await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data;
    if (!isVisionHold(st)) return false;
    const due = Date.parse(st!.resumeAt || "") || 0;
    while (Date.now() < due) {
      if ((runner as { stopRequested?: boolean }).stopRequested) return false;
      await new Promise((r) => setTimeout(r, Math.min(15_000, Math.max(0, due - Date.now()))));
    }
    const buildHold = isBuildHold(st);
    const ready = buildHold ? { ready: true, lane: "build-retry" } : (opts.ready || judgeVisionReady)();
    if (ready.ready && buildHold) {
      const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(s as MilestoneState, { type: "RESUME" })));
      hooks.addChip(`▶️ ${m.id}: muda wa kusubiri quota umeisha — XMD Computer inajaribu tena (${rec.data.status}).`);
      hooks.blog("success", `▶️ ${m.id} RESUME → ${rec.data.status} (build: quota retry).`);
      await hooks.persist();
      return true;
    }
    if (ready.ready) {
      const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(s as MilestoneState, { type: "RESUME" })));
      await msUpdate<{ version: number; events: Record<string, unknown>[] }>(runner, visionPauseKey(m.id), (cur) => {
        const ev = [...(cur?.events || [])];
        if (ev.length) ev[ev.length - 1] = { ...ev[ev.length - 1], resumedAt: new Date().toISOString(), resumedOn: ready.lane };
        return { version: 1, events: ev };
      });
      hooks.addChip(`▶️ ${m.id}: lane ya vision ina nafasi tena (${ready.lane}) — inaendelea (${rec.data.status}).`);
      hooks.blog("success", `▶️ ${m.id} RESUME → ${rec.data.status} (vision: ${ready.lane}).`);
      await hooks.persist();
      return true;
    }
    const next = new Date(Date.now() + poll).toISOString();
    await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => ({ ...(s as MilestoneState), resumeAt: next, updatedAt: new Date().toISOString() }));
    hooks.blog("info", `⏸️ ${m.id}: bado hakuna lane ya judge yenye vision na nafasi — ukaguzi ujao ${next.slice(11, 16)} UTC.`);
    await hooks.persist();
  }
}

/** TASK-29: cast ya reviewers ya milestone (visual/mixed → designer/frontend; technical → wataalamu wa roster). */
export const milestoneCast = (m: Pick<Milestone, "reviewMode" | "roster">): ReviewCast => reviewCast(m.reviewMode, m.roster || [], AGENT_ID_BY_ROSTER);
const castNames = (c: ReviewCast) => (["designer", "frontend"] as const).map((r) => AGENTS.find((a) => a.id === castAgentId(c, r))?.name || r).join(" + ");

/* ============================ TASK-25: raundi ya marekebisho ============================ */

const CLOSED_DEFECT = ["VERIFIED_FIXED", "WAIVED"];
const OPEN_DEFECT = ["OPEN", "IN_FIX", "REOPENED"];

/** RoundHeader (data) ya raundi n kutoka ledger ya defects. */
export function fixRoundHeader(m: Milestone, round: number, maxRounds: number, defects: Defect[]): RoundHeaderData {
  const mine = defects.filter((d) => d.milestoneId === m.id);
  return {
    milestoneId: m.id, round, maxRounds,
    closedDefects: mine.filter((d) => CLOSED_DEFECT.includes(d.status)).length,
    // jaribio LINALOENDELEA: raundi hii ikishaijaribu (history ya raundi hii ipo — verify/consolidate) = attempts; kabla ya fix = attempts + 1 (T3 halisi)
    open: mine.filter((d) => OPEN_DEFECT.includes(d.status)).map((d) => ({ id: d.id, attempt: (d.attempts || 0) + ((d.history || []).some((h) => h.round === round) ? 0 : 1) })),
    waivers: mine.filter((d) => d.status === "WAIVED").length,
    roundsLeft: Math.max(0, maxRounds - round),
  };
}

function verifyRaw(cos: ChangeOrder[], raw: FixRaw | undefined): RoundVerification {
  return verifyReceipts(cos, parseReceipts(raw?.receiptsRaw ?? null), raw?.changed || [], parseNumstat(raw?.numstat || ""));
}

function verificationLine(v: RoundVerification): string {
  const n = (k: string) => v.cos.filter((c) => c.verdict === k).length;
  return `APPLIED ${n("APPLIED")} · NOT_ATTEMPTED ${n("NOT_ATTEMPTED")} · BLOCKED ${n("BLOCKED")}${v.unlisted.length ? ` · UNLISTED_CHANGE ${v.unlisted.join(", ")}` : ""}${v.cos.some((c) => c.receipt === "REJECTED") ? ` · receipt REJECTED ${v.cos.filter((c) => c.receipt === "REJECTED").map((c) => c.orderId).join(", ")}` : ""}${v.receiptErrors.length ? ` · receipt errors ${v.receiptErrors.length}` : ""}`;
}

/**
 * TASK-25 (maelezo25): raundi n ya marekebisho. Pack ya Computer = RoundHeader · Computer OCB · COs (kamili) · repo summary ·
 * "what previous rounds changed" (≤40) — hakuna kingine. Computer anaandika `.xmd/receipts/R<n>.json` + commit (lango la task 18 (e)).
 * Code inathibitisha receipts dhidi ya `git diff <before>..HEAD`; NO-OP → ujumbe wa kudumu + rerun MARA MOJA. Kisha acceptance za COs
 * + checks za global (task 21) → store `fix:Mk:Rn`, `checks:Mk:Rn`, historia ya defects → VERIFYING (verify ya reviewers = task 26).
 */
export async function runFixRound(runner: LoopRunner, m: Milestone, round: number, hooks: LoopHooks): Promise<MilestoneState> {
  const fh = hooks.fix as NonNullable<LoopHooks["fix"]>;
  const sid = runner.sessionId as string;
  const id = stepIdOf(m.id, round, "fix");
  let rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(planSteps(s as MilestoneState, [id])));
  if ((rec.data.steps || []).find((x) => x.stepId === id)?.status === "DONE") return rec.data;
  const fail = async (to: MilestoneStatus, why: string) => {
    const r = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "FAILED")), { type: "GOTO", to })));
    hooks.addChip(`⛔ Raundi ya marekebisho ${m.id} R${round}: ${why.slice(0, 240)}`);
    hooks.blog("error", `⛔ ${m.id} R${round}: ${why.slice(0, 400)} → ${m.id} ${to}.`);
    await hooks.persist();
    return r.data;
  };
  // TASK-26: COs za raundi hii (`cos:Mk:Rn`, zinaandikwa na verify ya raundi iliyopita); R1 → `cos:Mk` (R0)
  const roundCos = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosRoundKey(m.id, round)))?.data?.changeOrders;
  const cos = (roundCos || (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || []).slice().sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const plan = (await getRecord<{ markdown?: string }>(sid, planKey(m.id)))?.data?.markdown || "";
  if (!cos.length) return fail("BLOCKED", `cos:${m.id} haina Change Orders — hakuna cha kutekeleza`);
  const defects0 = (await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || [];
  const header = fixRoundHeader(m, round, rec.data.maxRounds, defects0);
  const prev: { round: number; cos: CoVerification[] }[] = [];
  for (let k = 1; k < round; k++) {
    const r = (await getRecord<{ verification?: RoundVerification }>(sid, fixKey(m.id, k)))?.data;
    if (r?.verification) prev.push({ round: k, cos: r.verification.cos });
  }
  const amends = (await getRecord<{ amendments?: Amendment[] }>(sid, amendmentsKey(m.id)))?.data?.amendments || [];
  const ocb = (await fh.ocb(m, round, header.open.length)) + (amends.length ? `\n\nAMENDED REQUIREMENTS (redecide MODIFY — binding, they replace the original requirement):\n${amends.map(amendmentLine).join("\n")}` : "");
  // TASK-27: pair patch — harness inajaribu `git apply --check` → `git apply` KABLA ya Computer (idempotent: patch:Mk:Rn)
  let patchRec = (await getRecord<{ results: PatchApply[]; base: string }>(sid, patchKey(m.id, round)))?.data || null;
  const pp = cos.filter((c) => c.mode === "pair_patch" && c.patch);
  if (pp.length && !patchRec && fh.applyPatch) {
    const results: PatchApply[] = [];
    for (const co of pp) {
      try { results.push(await fh.applyPatch(m, round, co)); }
      catch (e: any) { results.push({ orderId: co.id, applied: false, method: "none", base: "", sha: "", detail: String(e?.message || e).slice(0, 300) }); }
    }
    patchRec = { results, base: results.find((r) => r.base)?.base || "" };
    await msUpdate(runner, patchKey(m.id, round), () => ({ version: 1, id: m.id, round, ...patchRec, at: new Date().toISOString() }));
    for (const r of results) {
      hooks.addChip(`🩹 ${m.id} R${round} ${r.orderId}: pair patch ${r.applied ? `applied by harness (${r.method}, ${r.sha.slice(0, 7)})` : `did NOT apply (${r.detail.slice(0, 120)}) → Computer applies it verbatim`}`);
      hooks.blog(r.applied ? "success" : "warning", `🩹 ${m.id} R${round} ${r.orderId}: ${r.method} · ${r.applied ? `commit ${r.sha.slice(0, 12)}` : "not applied"} · ${r.detail.slice(0, 300)}`);
    }
  }
  const patchNotes = Object.fromEntries((patchRec?.results || []).map((r) => [r.orderId, r.applied
    ? `the HARNESS ALREADY APPLIED this patch (${r.method}, commit ${r.sha.slice(0, 7)}) — do NOT re-apply or edit those lines; verify the file, then write the receipt status DONE listing the patched file(s).`
    : `the harness could NOT apply it (${r.detail.slice(0, 160)}) — apply the patch VERBATIM (exactly these lines, nothing else), then write the receipt.`]));
  const diffBase0 = /^[0-9a-f]{7,40}$/.test(patchRec?.base || "") ? patchRec!.base : undefined;
  const escLines = escalationLines(cos, patchNotes);
  const orderIds = cos.map((c) => c.id);
  // TASK-33 (CEO #5): historia ya defects za COs hizi — Computer asirudie jaribio lililoshindwa (muktadha wake bado ni mpya kila raundi)
  const targeted = new Set(cos.flatMap((c) => c.defectIds));
  const allCos = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || [];
  const history = defectHistoryLines(defects0.filter((d) => targeted.has(d.id)), m.id, allCos.filter((c) => !orderIds.includes(c.id)));
  let captured = false;
  const render = (repo: { tree: string; gitLog: string }) => {
    const pack = renderFixPack({ roundHeader: header, ocb, changeOrders: cos, repo, prevChanges: prevChangesLines(prev), milestoneId: m.id, round, escalation: escLines, history });
    if (!captured) { captured = true; maybeCapturePrompt({ sessionId: sid, agent: "computer", agenda: 0, phase: `fix:${m.id}:R${round}`, system: pack }); } // TASK-26 T3
    return pack;
  };

  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "RUNNING")));
  await hooks.persist();
  hooks.ui?.({ t: "cu", id: m.id, r: round, cos: cos.map(msUiCo) }); // TASK-34: card ya marekebisho + badge ya Computer
  hooks.addChip(`🔧 ${m.id} R${round}: XMD Computer anatekeleza COs ${orderIds.length} (${orderIds.join(", ")})`);
  hooks.blog("system", `🔧 ${m.id} R${round}: raundi ya marekebisho — COs ${orderIds.join(", ")} · ${header.open.length} defects wazi.`);
  hooks.bcast({ type: "fixRound", id: m.id, round, phase: "start", orderIds });

  const t0 = Date.now();
  let out = await fh.run(m, plan, { round, attempt: 1, orderIds, render, ...(diffBase0 ? { diffBase: diffBase0 } : {}) });
  if (out.finalState === "PAUSED") {
    hooks.blog("warning", `⏸️ ${m.id} R${round}: Computer imesimama (Board pause) — raundi itarudiwa Board ikiresume.`);
    return ((await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data ?? rec.data) as MilestoneState;
  }
  const v1 = verifyRaw(cos, out.fix);
  hooks.bcast({ type: "receipts", id: m.id, round, attempt: 1, finalState: out.finalState, flags: v1.flags, unlisted: v1.unlisted, cos: v1.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, receipt: c.receipt, receiptStatus: c.receiptStatus })) });
  hooks.blog(v1.flags.length ? "warning" : "success", `🧾 ${m.id} R${round} attempt 1 (${out.finalState}): ${verificationLine(v1)}`);
  let v: RoundVerification & { rerun?: { before: string[]; after: string[]; reminder: string } } = v1;
  const attempts: { attempt: number; finalState: string; reason: string; verification: RoundVerification; fix?: FixRaw }[] = [{ attempt: 1, finalState: out.finalState, reason: out.reason, verification: v1, fix: out.fix }];
  if (out.ok && v1.notAttempted.length) {
    // NO-OP: ujumbe wa kudumu (maelezo25 §3) → Computer → rerun MARA MOJA (diff ya raundi nzima inapimwa upya)
    const reminder = noOpReminder(v1);
    hooks.addChip(`🔁 ${m.id} R${round}: NO-OP ${v1.notAttempted.join(", ")} — Computer anarudishiwa agizo (mara moja)`);
    hooks.blog("warning", `🔁 ${m.id} R${round}: NOT_ATTEMPTED ${v1.notAttempted.join(", ")} → ujumbe kwa Computer: ${reminder.replace(/\n/g, " | ").slice(0, 400)}`);
    hooks.bcast({ type: "fixReminder", id: m.id, round, orderIds: v1.notAttempted, message: reminder });
    out = await fh.run(m, plan, { round, attempt: 2, orderIds, render, reminder, diffBase: out.fix?.diffBase || out.fix?.headBefore });
    if (out.finalState === "PAUSED") {
      hooks.blog("warning", `⏸️ ${m.id} R${round}: rerun imesimama (Board pause).`);
      return ((await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data ?? rec.data) as MilestoneState;
    }
    const v2 = verifyRaw(cos, out.fix);
    v = { ...mergeAttempts(v1, v2), rerun: { ...mergeAttempts(v1, v2).rerun, reminder } };
    attempts.push({ attempt: 2, finalState: out.finalState, reason: out.reason, verification: v2, fix: out.fix });
    hooks.bcast({ type: "receipts", id: m.id, round, attempt: 2, finalState: out.finalState, flags: v2.flags, unlisted: v2.unlisted, cos: v2.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, receipt: c.receipt, receiptStatus: c.receiptStatus })) });
    hooks.blog(v2.flags.length ? "warning" : "success", `🧾 ${m.id} R${round} attempt 2 (${out.finalState}): ${verificationLine(v2)}`);
  }

  // checks: acceptance za COs + global (build, tests, console_clean, no_horizontal_overflow) — Computer ikimaliza kwa mafanikio tu
  const rc0 = roundChecks(cos, plan, { technical: m.reviewMode === "technical" });
  const inh = inheritedChecks(defects0, m.id); // TASK-28: checks za defects zilizorithiwa zinaendeshwa tena kila raundi
  const rc: RoundChecks = inh.checks.length ? { ...rc0, checks: [...rc0.checks, ...inh.checks], owner: { ...rc0.owner, ...inh.owner } } : rc0;
  let results: EvidenceCheckResult[] = [];
  let checksMs = 0;
  if (out.ok) {
    try { const r = await fh.checks(m, rc); results = r.results; checksMs = r.ms; }
    catch (e: any) { results = rc.checks.map((c) => ({ id: c.id, type: c.type, result: "ERROR" as const, detail: `check runner failed: ${String(e?.message || e).slice(0, 200)}` })); }
  }
  const perCo = summarizeChecks(results, rc.owner);
  const now = new Date().toISOString();
  await msUpdate(runner, fixChecksKey(m.id, round), () => ({ version: 1, id: m.id, round, results, owner: rc.owner, routes: rc.routes, ms: checksMs, ran: out.ok, at: now }));
  await msUpdate(runner, fixKey(m.id, round), () => ({
    version: 1, id: m.id, round, finalState: out.finalState, reason: out.reason, ok: out.ok, ms: Date.now() - t0,
    orderIds, flags: v.flags, unlisted: v.unlisted, verification: v, openBefore: header.open.length, roundHeader: formatRoundHeader(header),
    perCo: v.cos.map((c) => ({ orderId: c.orderId, attempt: c.attempt, runs: v.rerun?.before.includes(c.orderId) ? 2 : 1, verdict: c.verdict, receiptStatus: c.receiptStatus, receipt: c.receipt, diff: c.diff, checks: perCo[c.orderId] || { pass: 0, fail: 0, error: 0 }, blockedReason: c.blockedReason })),
    attempts: attempts.map((a) => ({ attempt: a.attempt, finalState: a.finalState, reason: a.reason, flags: a.verification.flags, notAttempted: a.verification.notAttempted,
      headBefore: a.fix?.headBefore, head: a.fix?.head, diffBase: a.fix?.diffBase, changed: (a.fix?.changed || []).slice(0, 200), receiptsRaw: String(a.fix?.receiptsRaw ?? "").slice(0, 20_000) || null, sabotaged: !!a.fix?.sabotaged })),
    global: perCo.global || { pass: 0, fail: 0, error: 0 }, at: now,
    patches: patchRec?.results, reproduced: reproducedMap(cos, parseReceipts(out.fix?.receiptsRaw)), modes: Object.fromEntries(cos.map((c) => [c.id, c.mode || "standard"])),
  }));
  let inheritedFixed: string[] = [];
  await msUpdate<{ version: number; defects: Defect[] }>(runner, "defects", (cur) => {
    const ds = applyRoundToDefects(cur?.defects || defects0, cos, v, round, perCo);
    const ir = inh.checks.length ? applyInheritedResults(ds, m.id, round, results) : { defects: ds, fixed: [] };
    inheritedFixed = ir.fixed;
    return { version: 1, ...(cur || {}), defects: ir.defects };
  });
  if (inh.checks.length) hooks.blog(inheritedFixed.length ? "success" : "info", `📦 ${m.id} R${round}: inherited checks ${results.filter(isInheritedCheck).filter((r) => r.result === "PASS").length}/${inh.checks.length} PASS${inheritedFixed.length ? ` → ${inheritedFixed.join(", ")} VERIFIED_FIXED` : ""}`);
  const ck = perCo.global || { pass: 0, fail: 0, error: 0 };
  const all = Object.values(perCo).reduce((a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail, error: a.error + s.error }), { pass: 0, fail: 0, error: 0 });
  hooks.bcast({ type: "fixRound", id: m.id, round, phase: "done", finalState: out.finalState, ok: out.ok, flags: v.flags, unlisted: v.unlisted, perCo: v.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, receipt: c.receipt, receiptStatus: c.receiptStatus, diff: c.diff, checks: perCo[c.orderId] })), checks: all, global: ck, rerun: v.rerun ? { before: v.rerun.before, after: v.rerun.after } : undefined });
  if (!out.ok && out.finalState === "PAUSED_QUOTA") {
    // TASK-32: raundi iliyosimama kwa quota → subiri → raundi ileile inarudiwa (si hold ya milele)
    if (await holdForBuildQuota(runner, m, hooks, id, out.reason || "paused (quota)")) return runFixRound(runner, m, round, hooks);
    return ((await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data ?? newMilestoneState(m.id)) as MilestoneState;
  }
  // TASK-33 (sehemu 2): kila raundi ya marekebisho → data za code + "kwa nini" ya Optimus
  await memoAdd(runner, m, hooks, { round, kind: "fix", facts: fixFacts({
    round, finalState: out.finalState, ok: out.ok, reason: out.reason, unlisted: v.unlisted, flags: v.flags, notAttempted: v.notAttempted, global: perCo.global,
    cos: v.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, receiptStatus: c.receiptStatus, receipt: c.receipt, touched: c.touched, phantom: c.phantom, diff: c.diff, blockedReason: c.blockedReason, checks: perCo[c.orderId] })),
  }) });
  if (!out.ok) return fail("BLOCKED", `${out.finalState}${out.reason ? ` — ${out.reason}` : ""} (XMD Computer, raundi ya marekebisho) · ${verificationLine(v)}`);
  const done = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "DONE")), { type: "GOTO", to: "VERIFYING" })));
  hooks.addChip(`🧾 ${m.id} R${round}: ${verificationLine(v)} · checks ${all.pass}P/${all.fail}F/${all.error}E`);
  hooks.blog(all.error ? "warning" : "success", `🧾 ${m.id} R${round} imekamilika: ${verificationLine(v)} · checks PASS ${all.pass} · FAIL ${all.fail} · ERROR ${all.error} → VERIFYING (verify ya reviewers = task 26).`);
  await hooks.persist();
  return done.data;
}

/* ============================ TASK-26: raundi za uthibitisho ============================ */

/** FIXING ⇄ VERIFYING hadi SIGN_OFF | CAP_REACHED | BLOCKED | pause. Kila hatua ina step yake (resume = hatua isiyo DONE). */
async function runFixVerifyLoop(runner: LoopRunner, m: Milestone, st0: MilestoneState, hooks: LoopHooks): Promise<MilestoneState> {
  let st = st0;
  for (let guard = 0; guard < 2 * (st.maxRounds || MAX_ROUNDS) + 2; guard++) {
    if (st.status === "FIXING" && hooks.fix) {
      const s = await runFixRound(runner, m, st.round, hooks);
      if (s.status !== "VERIFYING" || !hooks.verify) return s;
      st = s;
      continue;
    }
    if (st.status === "VERIFYING" && hooks.verify) {
      const s = await runVerifyRound(runner, m, st.round, hooks);
      if (s.status !== "FIXING" || s.round <= st.round) return s;
      if (hooks.verify.stopAfterRound !== undefined && st.round >= hooks.verify.stopAfterRound) {
        hooks.blog("warning", `🧪 XMD_TEST_STOP_AFTER_ROUND=${hooks.verify.stopAfterRound}: ${m.id} inasimama ikiwa FIXING R${s.round} (COs zimehifadhiwa).`);
        return s;
      }
      st = s;
      continue;
    }
    return st;
  }
  return st;
}

const emptyPack = (milestoneId: string, round: number, detail: string): EvidencePack => ({
  milestoneId, round, screenshots: [], domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [], consoleErrors: [], errors: [{ kind: "harness", detail }] as EvidencePack["errors"],
});

interface VerifyRecord {
  version: number; id: string; round: number; header: string;
  runs: Record<ReviewerId, VerifyRun>;
  /** TASK-30: sign-off ilikataliwa (verdicts visionDegraded) → uthibitisho unarudiwa vision ikirudi */
  rejudge?: boolean;
  degradedRuns?: { at: string; reviewers: string[]; cos: { orderId: string; verdict: string }[]; lanes: Record<string, string> }[];
  disputed: string[];
  sync: Partial<Record<ReviewerId, Record<string, VerifyVerdict>>> | null;
  syncTranscript?: { reviewer: ReviewerId; text: string }[];
  defectsBefore?: Defect[];
  outcome?: ReturnType<typeof roundOutcome> & { openBefore: number; openAfter: number; regressions: number };
  git?: { op: "tag" | "revert" | "none"; ok: boolean; sha: string; detail: string };
  decision?: Decision;
  next?: NextDecision;
  consolidation?: { valid: boolean; attempts: number; errors: string[]; changeOrders: ChangeOrder[]; discussed: boolean; escalation?: Pick<EscalateResult, "events" | "waivers" | "amendments" | "conflicts"> };
  added?: string[];
  duplicates?: { title: string; of: string }[];
  harnessRegressions?: OcclusionRegression[];
  at: string;
}

/**
 * TASK-26 (maelezo26): raundi n ya uthibitisho. Hatua tatu, kila moja inahifadhiwa (resume haiirudii iliyokamilika):
 *  `Mk.Rn.evidence` evidence upya (tasks 19–22) → `Mk.Rn.verify` reviewers WAWILI peke yao (RoundHeader + OCB REVIEW_VERIFY),
 *  sync MOJA wakitofautiana → `Mk.Rn.decide` decide()/roundOutcome()/git (tag au revert)/decideNext() → Optimus COs (CONTINUE).
 */
/** evidence ya raundi iliyopita iliyopo (R(n-1) … R0) ↔ evidence mpya → `newlyOccluded` (DOM json kupitia URL). */
async function occlusionRegressions(sid: string, m: Milestone, round: number, after: EvidencePack, loadDom?: (d: EvidencePack["domMetrics"][number]) => Promise<DomJson | null>): Promise<OcclusionRegression[]> {
  let before: EvidencePack | null = null;
  for (let r = round - 1; r >= 0 && !before; r--) before = (await getRecord<EvidencePack>(sid, evidenceKey(m.id, r)))?.data ?? null;
  if (!before) return [];
  const load = loadDom || (async (d: EvidencePack["domMetrics"][number]) => (/^https?:\/\//.test(d.url || "") ? ((await fetch(String(d.url))).json() as Promise<DomJson>) : null));
  const side = async (p: EvidencePack) => Promise.all((p.screenshots || []).map(async (sh) => {
    const dm = (p.domMetrics || []).find((d) => d.screenshotId === sh.id);
    return { meta: { route: sh.route, viewport: sh.viewport, state: sh.state, screenshotId: sh.id }, dom: dm ? await load(dm).catch(() => null) : null };
  }));
  return newlyOccluded(await side(before), await side(after));
}

/* ============================ TASK-33: mini-report ya review (rolling) ============================ */

const memoStoreOf = (runner: LoopRunner): MemoStore => ({
  get: async <T,>(key: string) => ((await getRecord<T>(runner.sessionId as string, key))?.data ?? null),
  update: async <T,>(key: string, mutate: (cur: T | null) => T) => (await msUpdate<T>(runner, key, mutate)).data,
});
const reviewerNames = (m: Milestone): Record<ReviewerId, string> => {
  const c = milestoneCast(m);
  return Object.fromEntries(REVIEWERS.map((r) => [r, AGENTS.find((a) => a.id === castAgentId(c, r))?.name || r])) as Record<ReviewerId, string>;
};

/** Optimus (LLM) wa mini-report — lane ya kawaida, si critical (sehemu ikishindikana, data za code zinabaki). */
export async function memoLlm(sid: string, agent: string, purpose: string, messages: MemoMsg[]): Promise<string> {
  if (/:a1$|^memo-confirm:/.test(purpose)) maybeCapturePrompt({ sessionId: sid, agent, agenda: 0, phase: purpose.replace(/:a1$/, ""), system: messages.map((x) => x.content).join("\n\n") });
  return (await brokerComplete({ agentId: agent, purpose, messages: messages as never, maxOut: 4000, cls: "normal", temperature: 0.2, priority: "background", waitMs: 120_000, maxHops: 16 })).text;
}

/** Inaongeza sehemu (idempotent) + badge ya "mini report imeandikwa" (activity — maandishi yenyewe hayaonyeshwi kwenye UI). Haisimamishi loop kamwe. */
async function memoAdd(runner: LoopRunner, m: Milestone, hooks: LoopHooks, o: { round: number; kind: MemoKind; facts: string; ids?: string[]; idSuffix?: string; context?: string }): Promise<void> {
  if (!runner.sessionId) return;
  const store = memoStoreOf(runner);
  try {
    if ((await store.get<MemoRecord>(memoKey(m.id)))?.entries.some((e) => e.id === memoEntryId(o.kind, o.round, o.idSuffix))) return; // resume
  } catch { /* addMemoEntry inasoma tena */ }
  const act = `memo-${m.id}-${o.kind}-R${o.round}-${Date.now().toString(36)}`;
  hooks.bcast({ type: "activity", id: act, text: `Optimus anaandika mini report ya review (${m.id} · R${o.round} · ${o.kind})…`, state: "start" });
  try {
    const r = await addMemoEntry(store, { milestoneId: m.id, ...o, complete: hooks.memo?.complete, log: (l, t) => hooks.blog(l, t) });
    if (r.created) hooks.blog("info", `📝 ${r.entry.head}: mini report ya review imeongezwa (${r.entry.by}${r.entry.missing.length ? ` · ukaguzi wa code: haikutaja ${r.entry.missing.join(", ")}` : ""}).`);
  } catch (e: any) { hooks.blog("warning", `📝 ${m.id} R${o.round} ${o.kind}: mini report haikuandikwa: ${String(e?.message || e).slice(0, 160)}`); }
  finally { hooks.bcast({ type: "activity", id: act, state: "end" }); }
}

/** Sehemu 1: baada ya mjadala wa timu R0 — Optimus anaandika, code inakagua kila D/P/CO, reviewers wote 2 wanathibitisha MARA MOJA. */
export async function writeR0Memo(runner: LoopRunner, m: Milestone, hooks: LoopHooks, result: ReviewRoundResult): Promise<void> {
  if (!runner.sessionId) return;
  const i: R0MemoInput = {
    milestoneId: m.id, reviewId: result.reviewId, consensus: result.rules.consensus, closeReason: result.discussion.closeReason,
    defects: result.table.defects, invalidDefects: result.rules.invalidDefects, rejected: result.rules.rejectedProposals, changeRequests: result.rules.changeRequests,
    accepted: result.rules.acceptedProposals.map((p) => ({ id: p.id, title: p.title, detail: p.detail, by: p.by })), changeOrders: result.changeOrders,
  };
  await memoAdd(runner, m, hooks, { round: 0, kind: "review", facts: r0Facts(i), ids: r0RequiredIds(i), context: result.discussion.transcript.map((t) => `${t.name}: ${t.text}`).join("\n\n").slice(-12_000) });
  try {
    const store = memoStoreOf(runner);
    const memo = await store.get<MemoRecord>(memoKey(m.id));
    const e = memo?.entries.find((x) => x.id === memoEntryId("review", 0));
    if (!e || memo?.confirmations) return;
    const cov = checkR0Coverage(e.note, i);
    if (e.note && !cov.ok) hooks.blog("warning", `📝 ${m.id} R0 mini report: Optimus hakutaja ${cov.missing.join(", ")} — data za code zinazo, reviewers wanaambiwa.`);
    const cast = milestoneCast(m);
    const list = await confirmR0({
      memoText: entryText(e), milestoneId: m.id, complete: hooks.memo?.complete,
      reviewers: REVIEWERS.map((r) => { const a = AGENTS.find((x) => x.id === castAgentId(cast, r)); return { reviewer: r, agent: a?.id || r, name: a?.name || r, role: a?.role || r, own: ownR0Findings(result.table, r, castAgentId(cast, r)) }; }),
    });
    await saveConfirmations(store, m.id, e.id, list);
    hooks.blog(list.some((x) => x.verdict === "AMEND") ? "warning" : "info", `📝 ${m.id} R0 mini report — uthibitisho: ${list.map((x) => `${x.name} ${x.verdict}${x.verdict === "AMEND" ? ` (${x.note.slice(0, 120)})` : ""}`).join(" · ")}`);
  } catch (err: any) { hooks.blog("warning", `📝 ${m.id} R0: uthibitisho wa mini report haukufanyika: ${String(err?.message || err).slice(0, 160)}`); }
}

/** Sehemu 6/7: redecide (KEEP/MODIFY/WAIVE) na escalation (diagnose/split/patch) baada ya raundi. */
async function memoEscalation(runner: LoopRunner, m: Milestone, round: number, hooks: LoopHooks, ex: Pick<EscalateResult, "events" | "amendments">): Promise<void> {
  const red = ex.events.filter((e) => e.redecide);
  const rest = ex.events.filter((e) => !e.redecide);
  if (rest.length) await memoAdd(runner, m, hooks, { round, kind: "escalation", ids: [...new Set(rest.flatMap((e) => [e.coId, ...e.defectIds, ...e.resultIds]))], facts: escalationFactsText(round, rest) });
  if (red.length) await memoAdd(runner, m, hooks, { round, kind: "redecide", ids: [...new Set(red.flatMap((e) => e.defectIds))], facts: redecideFactsText(round, red, ex.amendments) });
}

/** Sehemu 8: milestone ikifungwa (SIGNED_OFF / WITH_WAIVERS / CAP_REACHED / BLOCKED) — tu ikiwa ilipitia review (memo ipo). */
async function memoClose(runner: LoopRunner, m: Milestone, hooks: LoopHooks, retried = false): Promise<void> {
  if (!runner.sessionId) return;
  try {
    const sid = runner.sessionId;
    if (!(await getRecord<MemoRecord>(sid, memoKey(m.id)))?.data?.entries?.length) return;
    const st = (await getRecord<MilestoneState>(sid, stateKey(m.id)))?.data;
    if (!st || !["SIGNED_OFF", "SIGNED_OFF_WITH_WAIVERS", "CAP_REACHED", "BLOCKED"].includes(st.status)) return;
    const ds = ((await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || []).filter((d) => d.milestoneId === m.id);
    const vr = (await getRecord<{ next?: { reason?: string } }>(sid, verifyKey(m.id, st.round)))?.data;
    const open = ds.filter((d) => isOpenDefect(d));
    await memoAdd(runner, m, hooks, { round: st.round, kind: "close", idSuffix: st.status, ids: open.map((d) => d.id), facts: closeFacts({
      status: st.status, round: st.round, reason: vr?.next?.reason || "", retried,
      open: open.map((d) => ({ id: d.id, severity: d.severity })), waived: ds.filter((d) => d.status === "WAIVED").map((d) => d.id),
    }) });
  } catch (e: any) { hooks.blog("warning", `📝 ${m.id}: sehemu ya kufunga mini report haikuandikwa: ${String(e?.message || e).slice(0, 160)}`); }
}

/** CEO #3: kumbukumbu ya reviewers wa uthibitisho — mini-report (3 kamili) + findings zao za R0 + historia ya defects + mini-reports za agenda. Hakuna transcript. */
export async function verifyMemory(sid: string, m: Milestone, defects: Defect[], roundCos: ChangeOrder[], miniReports?: VerifyContext["agendaMiniReports"]): Promise<Pick<VerifyContext, "memo" | "ownR0" | "defectHistory" | "agendaMiniReports">> {
  const memo = renderMemo((await getRecord<MemoRecord>(sid, memoKey(m.id)))?.data);
  const table = (await getRecord<{ table?: ReviewRoundResult["table"] }>(sid, reviewKey(m.id, 0)))?.data?.table;
  const cast = milestoneCast(m);
  const ownR0 = Object.fromEntries(REVIEWERS.map((r) => [r, ownR0Findings(table, r, castAgentId(cast, r))]).filter(([, t]) => t)) as Partial<Record<ReviewerId, string>>;
  const allCos = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || [];
  const ids = new Set(roundCos.map((c) => c.id));
  const defectHistory = defectHistoryLines(defects, m.id, allCos.filter((c) => !ids.has(c.id)));
  return { ...(memo ? { memo } : {}), ...(Object.keys(ownR0).length ? { ownR0 } : {}), ...(defectHistory.length ? { defectHistory } : {}), ...(miniReports?.length ? { agendaMiniReports: miniReports } : {}) };
}

/* ============================ TASK-27: escalation ladder ============================ */

export const amendmentsKey = (milestoneId: string) => `amendments:${milestoneId}`;
export const waiversKey = (milestoneId: string) => `waivers:${milestoneId}`;
export const patchKey = (milestoneId: string, round: number) => `patch:${milestoneId}:R${round}`;

export async function escalateLlm(sid: string, agent: string, purpose: string, messages: EscMsg[]): Promise<string> {
  if (/:a1$/.test(purpose)) maybeCapturePrompt({ sessionId: sid, agent, agenda: 0, phase: purpose.replace(/:a1$/, ""), system: messages.map((x) => x.content).join("\n\n") });
  return (await brokerComplete({ agentId: agent, purpose, messages: messages as never, maxOut: 12_000, cls: "heavy", temperature: 0.2, priority: "background", waitMs: 120_000, critical: true, maxHops: 32 })).text; // TASK-32
}

/** Majaribio yaliyopita kwa kila defect, kama yalivyopimwa na harness (fix:Mk:Rk + NO-OP detector + reviewers). */
export async function escalationFacts(sid: string, m: Milestone, upTo: number): Promise<Record<string, PrevAttemptFact[]>> {
  const out: Record<string, PrevAttemptFact[]> = {};
  for (let k = 1; k <= upTo; k++) {
    const fr = (await getRecord<{ verification?: RoundVerification; perCo?: { orderId: string; checks?: { pass: number; fail: number; error: number } }[] }>(sid, fixKey(m.id, k)))?.data;
    if (!fr?.verification) continue;
    const kc = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosRoundKey(m.id, k)))?.data?.changeOrders || (k === 1 ? (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders : undefined) || [];
    const vr = (await getRecord<VerifyRecord>(sid, verifyKey(m.id, k)))?.data;
    for (const c of fr.verification.cos) {
      const co = kc.find((x) => x.id === c.orderId);
      if (!co) continue;
      const notes = (["designer", "frontend"] as const).map((r) => vr?.runs?.[r]?.findings?.cos.find((x) => x.orderId === c.orderId)).filter(Boolean).map((x) => `${x!.verdict}: ${x!.note.slice(0, 160)}`);
      const fact: PrevAttemptFact = { round: k, orderId: c.orderId, verdict: c.verdict, receiptStatus: String(c.receiptStatus), targets: c.targets, touched: c.touched, blockedReason: c.blockedReason,
        checks: fr.perCo?.find((x) => x.orderId === c.orderId)?.checks || { pass: 0, fail: 0, error: 0 }, reviewerNotes: notes, reverted: vr?.git?.op === "revert" && vr.git.ok };
      for (const d of co.defectIds) (out[d] ||= []).push(fact);
    }
  }
  return out;
}

/** Hitaji la asili kwa kila defect: computed_style checks za CO ya KWANZA iliyoilenga (cos:Mk ina COs zote). Defect iliyo-AMEND (redecide MODIFY) haina kinga tena. */
export async function escalationRequirements(sid: string, m: Milestone, amends: Amendment[]): Promise<Record<string, ReturnType<typeof requirementChecksOf>>> {
  const all = ((await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || []).slice().sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  const out: Record<string, ReturnType<typeof requirementChecksOf>> = {};
  for (const co of all) for (const d of co.defectIds) {
    if (out[d] || amends.some((a) => a.defectId === d)) continue;
    const req = requirementChecksOf(co);
    if (req.length) out[d] = req;
  }
  return out;
}

/** Inahifadhi matokeo ya escalation (idempotent kwa kitambulisho): history, WAIVED, amendments (ledger), waivers (state + ripoti), chips. */
export async function applyEscalation(runner: LoopRunner, m: Milestone, round: number, hooks: LoopHooks, ex: Pick<EscalateResult, "events" | "waivers" | "amendments" | "conflicts">): Promise<Defect[]> {
  const sid = runner.sessionId as string;
  const marker = `R${round + 1}`;
  const rec = await msUpdate<{ version: number; defects: Defect[] }>(runner, "defects", (cur) => {
    const ds = cur?.defects || [];
    const already = ds.some((d) => (d.history || []).some((h) => h.round === round + 1 && /^ESCALATED/.test(h.result))); // resume → si mara mbili
    return { version: 1, defects: already ? ds : applyEscalationToDefects(ds, ex, round + 1) };
  });
  if (ex.amendments.length) {
    await msUpdate<{ version: number; amendments: Amendment[] }>(runner, amendmentsKey(m.id), (cur) => ({ version: 1, amendments: [...(cur?.amendments || []).filter((a) => !ex.amendments.some((x) => x.id === a.id)), ...ex.amendments] }));
    await msUpdate<{ version: number; decisions: unknown[] }>(runner, DECISIONS_KEY, (cur) => ({ version: 1, ...(cur || {}), decisions: [...((cur?.decisions || []) as { id?: string }[]).filter((d) => !ex.amendments.some((x) => x.id === d.id)), ...ex.amendments.map((a) => ({ id: a.id, milestoneId: m.id, round: a.round, source: "redecide", decision: "MODIFY", defectId: a.defectId, text: a.requirement, reason: a.reason, at: a.at }))] }));
  }
  if (ex.waivers.length) {
    const ws: WaiverEntry[] = ex.waivers.map((w) => ({ defectId: w.defectId, title: w.title, severity: w.severity, round: w.round, reason: w.reason, approvedBy: w.approvedBy, at: w.at }));
    await msUpdate<{ version: number; waivers: Waiver[] }>(runner, waiversKey(m.id), (cur) => ({ version: 1, waivers: [...(cur?.waivers || []).filter((x) => !ex.waivers.some((w) => w.defectId === x.defectId)), ...ex.waivers] }));
    await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => ({ ...(s as MilestoneState), waivers: [...((s as MilestoneState).waivers || []).filter((x) => !ws.some((w) => w.defectId === x.defectId)), ...ws] }));
  }
  for (const e of ex.events) {
    for (const d of e.defectIds) hooks.addChip(`🪜 ${escalationChip(d, e.attempt, e.mode)}${e.diagnosis ? ` · diagnosis ${e.diagnosis.cause}` : ""}${e.redecide ? ` → ${e.redecide.outcome}` : ""}${e.valid ? "" : " (fallback)"}`);
    hooks.blog(e.valid ? "info" : "warning", `🪜 ${m.id} ${marker} ${e.coId} attempt ${e.attempt} (${e.mode}) → ${e.resultIds.join(", ") || "no order"}${e.diagnosis ? ` · ${e.diagnosis.cause}: ${e.diagnosis.reason}` : ""}${e.patch ? ` · patch ${e.patch.kind} (${e.patch.files.join(", ")})` : ""}${e.laneSwitch ? ` · ${e.laneSwitch}` : ""}${e.redecide ? ` · ${e.redecide.outcome} (${e.redecide.turns} turns): ${e.redecide.reason.slice(0, 200)}` : ""}${e.errors.length ? ` · errors: ${e.errors.slice(0, 2).join("; ").slice(0, 200)}` : ""}`);
  }
  for (const w of ex.waivers) hooks.addChip(`🏳️ WAIVE ${w.defectId} (${m.id} R${w.round}): ${w.reason.slice(0, 200)} — approved by ${w.approvedBy.join(" + ")}`);
  for (const a of ex.amendments) hooks.addChip(`📜 MODIFY ${a.defectId} → ledger ${a.id}: ${a.requirement.slice(0, 200)}`);
  hooks.bcast({ type: "escalation", id: m.id, round: round + 1, events: ex.events.map((e) => ({ coId: e.coId, attempt: e.attempt, mode: e.mode, resultIds: e.resultIds, diagnosis: e.diagnosis, outcome: e.redecide?.outcome, valid: e.valid })), waivers: ex.waivers.map((w) => w.defectId), amendments: ex.amendments.map((a) => a.id), conflicts: ex.conflicts.found.length });
  return rec.data.defects.filter((d) => d.milestoneId === m.id);
}

export async function runVerifyRound(runner: LoopRunner, m: Milestone, round: number, hooks: LoopHooks): Promise<MilestoneState> {
  const vh = hooks.verify as NonNullable<LoopHooks["verify"]>;
  const sid = runner.sessionId as string;
  const [evId, vId, dId] = ["evidence", "verify", "decide"].map((x) => stepIdOf(m.id, round, x));
  let rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(planSteps(s as MilestoneState, [evId, vId, dId])));
  const done = (id: string) => (rec.data.steps || []).find((x) => x.stepId === id)?.status === "DONE";
  if (done(dId)) return rec.data;
  const running = async (id: string) => { rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "RUNNING"))); await hooks.persist(); };
  const stepDone = async (id: string) => { rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE"))); await hooks.persist(); };

  const plan = (await getRecord<{ markdown?: string }>(sid, planKey(m.id)))?.data?.markdown || "";
  const roundCos = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosRoundKey(m.id, round)))?.data?.changeOrders;
  const cos = (roundCos || (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || []).slice().sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
  const orderIds = cos.map((c) => c.id);
  const fixRec = (await getRecord<{ verification?: RoundVerification; flags?: string[]; openBefore?: number; attempts?: { headBefore?: string; diffBase?: string }[] }>(sid, fixKey(m.id, round)))?.data;
  const checksRec = (await getRecord<{ results?: EvidenceCheckResult[]; owner?: Record<string, string>; routes?: string[] }>(sid, fixChecksKey(m.id, round)))?.data;
  const results = checksRec?.results || [];
  const perCo = summarizeChecks(results, checksRec?.owner || {});

  // 1) evidence upya (tasks 19–22)
  if (!done(evId)) {
    await running(evId);
    hooks.addChip(`📸 ${m.id} R${round}: harness inakusanya evidence upya (uthibitisho)`);
    let ev: NonNullable<BuildOutcome["evidence"]>;
    try { ev = await vh.evidence(m, round, plan, cos); }
    catch (e: any) { ev = { pack: emptyPack(m.id, round, `evidence failed: ${String(e?.message || e).slice(0, 200)}`), exit: -1, invalid: [], uploaded: 0, ms: 0 }; }
    await recordEvidence(runner, m, hooks, ev);
    await stepDone(evId);
  }
  const pack = (await getRecord<EvidencePack>(sid, evidenceKey(m.id, round)))?.data ?? emptyPack(m.id, round, "evidence record missing");

  // RoundHeader kutoka DB (kila wito)
  const defectsNow = (await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || [];
  const header = fixRoundHeader(m, round, rec.data.maxRounds, defectsNow);
  const base = await vh.context(m, round, header.open.length);
  const vctx: VerifyContext = {
    ocb: base.ocb, roundHeader: header, ledger: base.ledger, pack, changeOrders: cos, checkResults: results, defects: defectsNow, planGoal: planGoalOf(plan),
    receipts: (fixRec?.verification?.cos || []).map((c) => ({ orderId: c.orderId, verdict: c.verdict, receipt: c.receipt, receiptStatus: c.receiptStatus, touched: c.touched, diff: c.diff })),
    cast: milestoneCast(m), reviewMode: m.reviewMode, // TASK-29
    ...(await verifyMemory(sid, m, defectsNow, cos, base.miniReports)), // TASK-33: mini-report · findings zake za R0 · historia ya defects · mini-reports za agenda
  };
  const deps: VerifyDeps = { log: (l, t) => hooks.blog(l, t), capture: (agent, phase, text) => { maybeCapturePrompt({ sessionId: sid, agent, agenda: 0, phase, system: text }); }, onLane: laneSink(runner, m, stepIdOf(m.id, round, "verify")), ...(vh.deps || {}) };
  const now = () => new Date().toISOString();
  let vr = (await getRecord<VerifyRecord>(sid, verifyKey(m.id, round)))?.data ?? null;

  // 2) reviewers wawili (peke yao) → sync MOJA wakitofautiana
  const rejudge = !!vr && !vr.runs && !!vr.rejudge; // TASK-30: sign-off ilikataliwa (visionDegraded) → uthibitisho upya
  if (!done(vId) || rejudge) {
    if (!done(vId)) await running(vId);
    if (!vr?.runs) {
      hooks.ui?.({ t: "rev", id: m.id, r: round, who: REVIEWERS.map((r) => castAgentId(vctx.cast, r)) }); // TASK-34
      hooks.addChip(`🔍 ${m.id} R${round}: ${castNames(milestoneCast(m))} wanathibitisha COs ${orderIds.join(", ")} (peke yao)${rejudge ? " — upya kwa vision halisi" : ""}`);
      hooks.blog("system", `🔍 ${formatRoundHeader(header)} — reviewers 2 wanathibitisha (REVIEW_VERIFY).`);
      deps.imageDigest = deps.imageDigest ?? (await ensureDigest(runner, m, round, pack, hooks, deps.loadImage, vId)); // TASK-30: Flash vision MAPEMA
      const runs = await verifyBoth(vctx, deps);
      if (hooks.say) { const names = reviewerNames(m); for (const r of REVIEWERS) hooks.say(castAgentId(vctx.cast, r), renderVerifyFindings(runs[r].findings, names[r], round)); } // TASK-34
      const disputed = disagreements(orderIds, runs.designer.findings, runs.frontend.findings);
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({
        ...(cur?.rejudge ? { defectsBefore: cur.defectsBefore, harnessRegressions: cur.harnessRegressions, degradedRuns: cur.degradedRuns } : {}),
        version: 1, id: m.id, round, header: formatRoundHeader(header), runs, disputed, sync: null, at: now(),
      }))).data;
      await hooks.persist();
    } else hooks.blog("info", `♻️ ${m.id} R${round}: verdicts za reviewers zimeshahifadhiwa — hazirudiwi (resume).`);
    if (vr.disputed.length && !vr.sync && vr.runs.designer.findings && vr.runs.frontend.findings) {
      hooks.addChip(`🤝 ${m.id} R${round}: reviewers wanatofautiana (${vr.disputed.join(", ")}) — zamu MOJA ya sync`);
      const ocbOf = (r: ReviewerId) => buildOCB({ ...vctx.ocb, stage: "REVIEW_VERIFY", self: castAgentId(vctx.cast, r) as Parameters<typeof buildOCB>[0]["self"] });
      const st = await syncTurn(header, ocbOf, vr.runs.designer.findings, vr.runs.frontend.findings, vr.disputed, deps, vctx.cast);
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), sync: st.sync, syncTranscript: st.transcript }))).data;
      if (hooks.say) for (const x of st.transcript) if (x.text?.trim()) hooks.say(castAgentId(vctx.cast, x.reviewer), `**Sync R${round}** — ${x.text.trim()}`); // TASK-34
    }
    if (vr.disputed.length && vr.sync && vr.runs.designer.findings && vr.runs.frontend.findings) { // TASK-33 (sehemu 4)
      const fd = vr.runs.designer.findings, ff = vr.runs.frontend.findings;
      const pick = (f: VerifyFindings, id: string) => f.cos.find((c) => c.orderId === id);
      await memoAdd(runner, m, hooks, { round, kind: "sync", ids: vr.disputed, facts: syncFacts(round, reviewerNames(m), vr.disputed.map((id) => ({
        orderId: id, designer: pick(fd, id)?.verdict || "-", frontend: pick(ff, id)?.verdict || "-", designerNote: pick(fd, id)?.note, frontendNote: pick(ff, id)?.note,
      })), vr.sync) });
    }
    if (!done(vId)) await stepDone(vId);
  }
  if (!vr) vr = (await getRecord<VerifyRecord>(sid, verifyKey(m.id, round)))?.data ?? null;
  if (!vr?.runs) {
    const r = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, dId, "FAILED")), { type: "GOTO", to: "BLOCKED" })));
    hooks.blog("error", `⛔ ${m.id} R${round}: rekodi ya uthibitisho haipo → BLOCKED.`);
    await hooks.persist();
    return r.data;
  }

  // 3) uamuzi (code) → defects → git → decideNext → Optimus COs
  await running(dId);
  const designer = vr.runs.designer.findings as VerifyFindings | null, frontend = vr.runs.frontend.findings as VerifyFindings | null;
  const decision = decide({ orderIds, checks: perCo, designer, frontend, sync: vr.sync || undefined });
  if (!vr.defectsBefore) vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), defectsBefore: defectsNow }))).data;
  const before = vr.defectsBefore || defectsNow;
  const mineOpen = (ds: Defect[]) => ds.filter((d) => d.milestoneId === m.id && isOpenDefect(d));
  const trial = applyVerifyToDefects(before, { milestoneId: m.id, round, changeOrders: cos, decision });
  const openBefore = fixRec?.openBefore ?? mineOpen(before).length;
  // concern (check ilipita, reviewer hakuridhika) = tatizo lilelile la CO → haihesabiwi kama "made things worse"
  const openAfter = mineOpen(trial.defects).length - trial.added.filter((d) => d.history[0]?.cause === CHECK_MISSED_IT).length;
  // regression ya CODE: maandishi yaliyofunikwa sasa (hayakuwa yamefunikwa kwenye evidence ya raundi iliyopita) — haitegemei LLM
  if (!vr.harnessRegressions) {
    const hr = await occlusionRegressions(sid, m, round, pack, vh.deps?.loadDom).catch(() => []);
    vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), harnessRegressions: hr }))).data;
    if (hr.length) hooks.blog("warning", `🧱 ${m.id} R${round}: harness — maandishi ${hr.length} yamefunikwa na raundi hii: ${hr.slice(0, 4).map((x) => `${x.selector} @${x.viewport} (chini ya ${x.by || "?"})`).join(" · ")}`);
  }
  const harnessRegs = vr.harnessRegressions || [];
  const regressions = decision.regressions.length + (pack.regression || []).filter((r) => r.kind === "regression").length + harnessRegs.length;
  const outcome = { ...roundOutcome({ openBefore, openAfter, regressions }), openBefore, openAfter, regressions };
  let git = vr.git;
  if (!git) {
    const safe = async (op: Parameters<NonNullable<LoopHooks["verify"]>["git"]>[1]) => { try { return await vh.git(m, op); } catch (e: any) { return { ok: false, sha: "", detail: String(e?.message || e).slice(0, 200) }; } };
    if (outcome.outcome === "REVERT") {
      const patchBase = (await getRecord<{ base?: string }>(sid, patchKey(m.id, round)))?.data?.base || ""; // TASK-27: kabla ya pair patch ya harness
      const from = patchBase || fixRec?.attempts?.[0]?.headBefore || fixRec?.attempts?.[0]?.diffBase || "";
      git = from ? { op: "revert", ...(await safe({ kind: "revert", from, message: `xmd: revert ${m.id} R${round} — made things worse (${outcome.reason})`, label: `${m.id}-R${round}-revert` })) } : { op: "revert", ok: false, sha: "", detail: "round base commit unknown" };
    } else if (outcome.outcome === "BEST") git = { op: "tag", ...(await safe({ kind: "tag", name: `xmd-best-${m.id}` })) };
    else git = { op: "none", ok: true, sha: "", detail: outcome.reason };
    vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), git, outcome }))).data;
  }
  const reverted = git.op === "revert" && git.ok ? revertNote(round, outcome.reason) : undefined;
  const res = reverted ? applyVerifyToDefects(before, { milestoneId: m.id, round, changeOrders: cos, decision, reverted }) : trial;
  await msUpdate<{ version: number; defects: Defect[] }>(runner, "defects", () => ({ version: 1, defects: res.defects }));
  if (git.op === "tag" && git.ok) await msUpdate(runner, bestKey(m.id), () => ({ version: 1, id: m.id, round, sha: git!.sha, tag: `xmd-best-${m.id}`, openAfter, at: now() }));
  if (reverted) {
    hooks.addChip(`⏪ ${m.id} R${round}: ${reverted} · ${git.detail}`);
    hooks.blog("warning", `⏪ ${m.id} R${round}: ${reverted} — ${git.detail} (HEAD ${git.sha.slice(0, 7)}). Optimus ataambiwa.`);
  } else if (git.op === "revert") hooks.blog("error", `⏪ ${m.id} R${round}: revert ilihitajika (${outcome.reason}) lakini haikufanyika: ${git.detail}`);
  else if (git.op === "tag") hooks.blog(git.ok ? "success" : "warning", `🏷️ ${m.id} R${round}: ${outcome.reason} → ${git.ok ? `best mpya (tag xmd-best-${m.id} @ ${git.sha.slice(0, 7)})` : `tag haikufanyika: ${git.detail}`}`);

  const tally = results.filter((r) => !isInheritedCheck(r)).reduce((a, r) => ({ pass: a.pass + (r.result === "PASS" ? 1 : 0), fail: a.fail + (r.result === "FAIL" ? 1 : 0), error: a.error + (r.result !== "PASS" && r.result !== "FAIL" ? 1 : 0) }), { pass: 0, fail: 0, error: 0 });
  const openList = mineOpen(res.defects);
  let nd = decideNext({
    round, maxRounds: rec.data.maxRounds, cos: decision.cos, reviewersValid: !!designer && !!frontend, checks: tally,
    openDefects: openList.map((d) => ({ id: d.id, severity: d.severity })), listedMinor: openList.filter(allowedOpenAtSignoff).map((d) => d.id), // TASK-28: minor zinaruhusiwa — sign-off inaziorodhesha (ledger backlog + ripoti)
    receiptsMatch: !!fixRec && (fixRec.flags || []).length === 0, blocked: cos.length ? undefined : "no change orders for this round",
  });
  if (reverted && nd.next === "SIGN_OFF") nd = { ...nd, next: round >= rec.data.maxRounds ? "CAP_REACHED" : "CONTINUE", reason: reverted };

  // CONTINUE → Optimus anaunganisha defects wazi + mpya + regressions kuwa COs (uthibitisho ule ule wa T24)
  let newCos: ChangeOrder[] = [];
  if (nd.next === "CONTINUE") {
    let cons = vr.consolidation;
    if (!cons) {
      const verdictLines = decision.cos.map((c) => `- ${c.orderId}: ${c.verdict} — ${c.reason}`);
      const findLines = [designer, frontend].filter(Boolean).map((f) => `${f!.reviewer}: ${f!.cos.map((c) => `${c.orderId} ${c.verdict} (${c.note.slice(0, 200)})`).join("; ")} · notes: ${f!.notes.slice(0, 600)}`);
      let discussion = [`VERIFICATION OF ROUND ${round}:`, ...verdictLines, ...findLines, ...(vr.syncTranscript || []).map((t) => `sync ${t.reviewer}: ${t.text.slice(0, 600)}`)].join("\n");
      let discussed = false;
      let dOut: DiscussionOutcome | null = null;
      const asked = [designer, frontend].filter((f) => f?.requestDiscussion);
      if (asked.length && hooks.review?.discuss) {
        // mjadala wa timu TU reviewer akiomba (maelezo26 #2)
        try {
          const reviewId = reviewAgendaId(m.id, round);
          const item = makeReviewAgendaItem({
            reviewId, milestoneId: m.id, milestoneTitle: m.title, round, reviewMode: m.reviewMode,
            table: { reviewId, milestoneId: m.id, round, defects: openList, proposals: [], decisionRefs: {}, notes: { designer: designer?.notes, frontend: frontend?.notes } },
            ledgerLines: base.ledgerLines, checkLines: results.map((c) => `- check:${c.id} [${c.type}] ${c.result} — ${c.detail.slice(0, 160)}`),
            evidenceRefs: pack.screenshots.map((x) => `- ${x.id}: ${x.route} @${x.viewport} ${x.state}`), participants: reviewParticipants([], vctx.cast), cast: vctx.cast,
            maxTurns: REQUESTED_DISCUSSION_MAX_TURNS, // TASK-33 (CEO #4): mfupi na wenye kikomo — mjadala kamili ni R0 tu
          });
          hooks.addChip(`🧑‍⚖️ ${reviewId}: mjadala wa timu umeombwa na ${asked.map((f) => f!.reviewer).join(" + ")}`);
          const d = await hooks.review.discuss(item);
          discussion += `\n\nTEAM DISCUSSION (requested: ${asked.map((f) => `${f!.reviewer} — ${f!.requestDiscussion!.reason}`).join("; ")}):\n${d.transcript.map((t) => `${t.name}: ${t.text}`).join("\n\n")}`;
          discussed = true;
          dOut = d;
        } catch (e: any) { hooks.blog("warning", `🧑‍⚖️ ${m.id} R${round}: mjadala ulioombwa haukufanyika: ${String(e?.message || e).slice(0, 160)}`); }
        const names = reviewerNames(m);
        await memoAdd(runner, m, hooks, { round, kind: "discussion", ids: openList.map((d) => d.id),
          facts: discussionFacts(round, asked.map((f) => ({ name: names[f!.reviewer], reason: f!.requestDiscussion!.reason })), dOut, REQUESTED_DISCUSSION_MAX_TURNS),
          context: dOut ? dOut.transcript.map((t) => `${t.name}: ${t.text}`).join("\n\n").slice(-12_000) : "" }); // TASK-33 (sehemu 5)
      }
      const prevAll = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || [];
      const nowHeader = fixRoundHeader(m, round, rec.data.maxRounds, res.defects); // raundi ya SASA, counts mpya kutoka DB
      const consolidateFn = vh.consolidate || hooks.review?.consolidate || ((i: ConsolidateInput) => defaultConsolidate(i, hooks.blog, sid));
      const r = await consolidateFn({
        reviewId: reviewAgendaId(m.id, round), milestoneId: m.id, round: round + 1, reviewMode: m.reviewMode, defects: openList, decisions: [],
        ledgerLines: base.ledgerLines, discussion, routes: [...new Set([...(pack.screenshots || []).map((x) => x.route), ...(checksRec?.routes || [])])],
        domHints: m.reviewMode === "technical" ? techHintsFor(m, plan, pack) : [...new Set([...decision.newDefects, ...decision.regressions].flatMap((x) => x.evidence).concat(decision.concerns.flatMap((c) => c.evidence)).filter((e) => / dom: /.test(e)))],
        nextCoNo: nextCoNumber(prevAll), roundHeader: formatRoundHeader(nowHeader), notes: reverted ? [reverted] : [],
      });
      cons = { valid: r.valid, attempts: r.attempts, errors: r.errors, discussed, changeOrders: r.valid ? r.changeOrders.map((c) => ({ ...c, attempt: nextAttempt(c, res.defects) })) : [] };
      // TASK-27: escalation ladder — attempt ≥2 inabadilisha mbinu (concrete → pair_patch → split → redecide) + conflicting COs
      if (cons.valid) {
        const facts = await escalationFacts(sid, m, round);
        const amends = (await getRecord<{ amendments?: Amendment[] }>(sid, amendmentsKey(m.id)))?.data?.amendments || [];
        const ex = await escalateChangeOrders({
          milestoneId: m.id, round: round + 1, reviewMode: m.reviewMode, defects: res.defects, ledgerLines: [...base.ledgerLines, ...amends.map(amendmentLine)],
          roundHeader: formatRoundHeader(nowHeader), planGoal: planGoalOf(plan), notes: reverted ? [reverted] : [],
          requirements: await escalationRequirements(sid, m, amends), cast: vctx.cast,
        }, cons.changeOrders, facts, Math.max(nextCoNumber(prevAll), nextCoNumber(cons.changeOrders)), {
          complete: vh.escalateComplete || ((agent, purpose, messages) => escalateLlm(sid, agent, purpose, messages)),
          readFiles: vh.readFiles ? (paths) => vh.readFiles!(m, paths) : undefined, log: hooks.blog,
        });
        cons = { ...cons, changeOrders: ex.changeOrders, escalation: { events: ex.events, waivers: ex.waivers, amendments: ex.amendments, conflicts: ex.conflicts } };
      }
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), consolidation: cons }))).data;
    }
    if (!cons.valid) nd = { ...nd, next: "BLOCKED", reason: `consolidation invalid after ${cons.attempts} attempt(s): ${cons.errors.slice(0, 3).join("; ")}` };
    else {
      newCos = cons.changeOrders;
      if (cons.escalation) {
        const esc = await applyEscalation(runner, m, round, hooks, cons.escalation);
        await memoEscalation(runner, m, round, hooks, cons.escalation); // TASK-33 (sehemu 6/7)
        if (!newCos.length && !mineOpen(esc).length && cons.escalation.waivers.length) nd = { ...nd, next: "SIGN_OFF", reason: `all remaining defects waived by redecide (${cons.escalation.waivers.map((w) => w.defectId).join(", ")})` };
      }
      // hakuna defect wazi wala CO lakini bado si SIGN_OFF (mf. receipts ≠ diffs) → raundi tupu haina maana: BLOCKED yenye sababu ya wazi
      if (nd.next === "CONTINUE" && !newCos.length) nd = { ...nd, next: "BLOCKED", reason: `nothing for a fix round (no open defects, no change orders) — remaining blocker: ${nd.reason}` };
      await msUpdate<{ version: number; changeOrders: ChangeOrder[] }>(runner, cosKey(m.id), (cur) => ({ version: 1, changeOrders: [...(cur?.changeOrders || []).filter((c) => !newCos.some((x) => x.id === c.id)), ...newCos] }));
      await msUpdate(runner, cosRoundKey(m.id, round + 1), () => ({ version: 1, round: round + 1, changeOrders: newCos }));
    }
  }
  const defsNow = (await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || [];
  let to: MilestoneStatus = nd.next === "SIGN_OFF" ? signoffStatus(defsNow, m.id) : nd.next === "CONTINUE" ? "FIXING" : nd.next === "CAP_REACHED" ? "CAP_REACHED" : "BLOCKED";
  await emitLaneDigest(runner, m, hooks, `R${round}`);
  // TASK-30: sign-off ya visual/mixed HAIKUBALI verdicts za visionDegraded → defects zinarudi kama kabla, PAUSED_QUOTA (system
  // resumeAt) → lane ya vision ikirudi: uthibitisho wa raundi hii upya, kisha uamuzi upya
  if ((to === "SIGNED_OFF" || to === "SIGNED_OFF_WITH_WAIVERS") && m.reviewMode !== "technical") {
    const deg = REVIEWERS.filter((r) => vr!.runs[r]?.visionDegraded);
    if (deg.length) {
      hooks.addChip(`🚫 ${m.id} R${round}: sign-off ya ${m.reviewMode} imekataliwa — verdicts ni visionDegraded (${deg.join(", ")})`);
      await msUpdate<{ version: number; defects: Defect[] }>(runner, "defects", () => ({ version: 1, defects: before }));
      const lanes = Object.fromEntries(REVIEWERS.map((r) => [r, String(vr!.runs[r]?.model || "")]));
      await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => {
        const c = cur as VerifyRecord;
        const { runs: _r, git: _g, outcome: _o, ...rest } = c;
        return { ...rest, runs: undefined as unknown as VerifyRecord["runs"], sync: null, disputed: [], rejudge: true, degradedRuns: [...(c.degradedRuns || []), { at: now(), reviewers: deg, cos: decision.cos.map((x) => ({ orderId: x.orderId, verdict: x.verdict })), lanes }] };
      });
      if (!(await pauseForVision(runner, m, hooks, dId, `R${round} verdicts visionDegraded (${deg.join(", ")})`, lanes))) return (await getRecord<MilestoneState>(sid, stateKey(m.id)))!.data;
      return runVerifyRound(runner, m, round, hooks);
    }
  }
  // TASK-28: sign-off / cap — utaratibu kamili KABLA ya mpito wa mwisho (kila hatua idempotent → kill -9 inaendelea hapa)
  if (CLOSE_STATUSES.includes(to)) {
    const co = await closeOutMilestone(m, round, to, nd.reason, closeoutDeps(runner, m, hooks));
    if (co.problems.length) { to = "BLOCKED"; nd = { ...nd, next: "BLOCKED", reason: `close-out refused: ${co.problems.join(" · ")}` }; }
  }
  await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), decision, next: nd, added: res.added.map((d) => d.id), duplicates: trial.duplicates, at: now() }));
  rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, dId, to === "BLOCKED" ? "FAILED" : "DONE")), { type: "GOTO", to })));
  { // TASK-33 (sehemu 3): kila uthibitisho → data za code + "kwa nini" ya Optimus
    const notesOf = (f: VerifyFindings | null) => Object.fromEntries((f?.cos || []).map((c) => [c.orderId, c.note]));
    const left = ((await getRecord<{ defects?: Defect[] }>(sid, "defects"))?.data?.defects || []).filter((d) => d.milestoneId === m.id && isOpenDefect(d));
    await memoAdd(runner, m, hooks, { round, kind: "verify", ids: orderIds, facts: verifyFacts({
      round, names: reviewerNames(m), cos: decision.cos, notes: { designer: notesOf(designer), frontend: notesOf(frontend) },
      added: res.added, fixed: res.fixed, reopened: res.reopened, regressions, reverted, outcome: outcome.outcome, next: nd,
      open: left.map((d) => ({ id: d.id, severity: d.severity, attempts: d.attempts })), newCos: newCos.map((c) => c.id),
    }) });
  }
  hooks.bcast({
    type: "verifyRound", id: m.id, round, next: nd.next, status: to, reason: nd.reason, outcome: outcome.outcome, git: { op: git.op, ok: git.ok, sha: git.sha.slice(0, 12), detail: git.detail },
    cos: decision.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, designer: c.designer, frontend: c.frontend, disagreement: c.disagreement, checkOverride: c.checkOverride })),
    newDefects: res.added.map((d) => d.id), fixed: res.fixed, reopened: res.reopened, nextCos: newCos.map((c) => c.id),
  });
  hooks.addChip(`✅ ${m.id} R${round} verify: ${decision.cos.map((c) => `${c.orderId} ${c.verdict}`).join(" · ")} → ${nd.next}${newCos.length ? ` (COs ${newCos.map((c) => c.id).join(", ")})` : ""}`);
  hooks.blog(to === "BLOCKED" ? "error" : "success", `✅ ${m.id} R${round} → ${to}: ${nd.reason} · defects fixed ${res.fixed.length} · reopened ${res.reopened.length} · new ${res.added.length}${trial.duplicates.length ? ` · duplicates ${trial.duplicates.map((x) => `${x.of}`).join(", ")}` : ""} · ${outcome.outcome} (${outcome.reason}).`);
  await hooks.persist();
  return rec.data;
}

/** Hali ya milestones kutoka chips za runner (kwa OCB counts) — bila kugusa DB. */
export function milestonesDoneFromChips(chips: any[] | undefined): string[] {
  const out: string[] = [];
  for (const c of chips || []) {
    const t = String(c?.text || "");
    if (!t.startsWith(MS_PREFIX)) continue;
    try {
      const r = JSON.parse(t.slice(MS_PREFIX.length));
      if (String(r?.key || "").startsWith("state:") && TERMINAL_STATUSES.includes(r?.data?.status)) out.push(r.data.id);
    } catch { /* */ }
  }
  return out.sort();
}
