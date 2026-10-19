// src/lib/milestone/loop.ts — TASK 14 (maelezo14): kitanzi cha milestones — CODE inaamua lini milestone imefungwa.
// Agenda zote za milestone zikiwa kwenye Ledger (finalBoardResolution) → DISCUSSING → PLANNING (CAS) → runMilestoneBuild.
// runMilestoneBuild ni STUB kwa sasa (tasks 15+ zinabadilisha mwili wake). Inatumika TU XMD_MILESTONES=1.

import { milestonesEnabled } from "./flag";
import { HOLD_STATUSES, newMilestoneState, planSteps, setStep, stepIdOf, transition, TERMINAL_STATUSES } from "./state";
import type { MilestonePlanResult } from "./plan";
import { BUILD_REPORT_INLINE_MAX, buildReportPath, crossCheckBuildReport, parseBuildReport, type BuildReportCommand } from "./buildReport";
import { evidenceKey } from "./evidence"; // TASK-19
import type { DomJson } from "./review"; // TASK-26 (occlusion)
import { getRecord, msChip, MS_PREFIX, stateKey, updateRecord, type Versioned } from "./store";
import { MAX_ROUNDS, type ChangeOrder, type Defect, type EvidenceCheckResult, type EvidencePack, type Milestone, type MilestoneMap, type MilestoneState, type MilestoneStatus, type RoundHeaderData } from "./types";
import { formatRoundHeader, reviewRound0, REVIEWERS, type ReviewContext, type ReviewDeps, type ReviewerId } from "./review"; // TASK-24 (T23 analyses)
import { consolidate, cosKey, makeReviewAgendaItem, reviewAgendaId, reviewParticipants, runReviewRound, type ConsolidateInput, type ConsolidateResult, type DiscussionOutcome, type ReviewAgendaItem, type ReviewRoundResult } from "./reviewAgenda"; // TASK-24
import { brokerComplete } from "../broker/broker"; // TASK-24: Optimus consolidate
import {
  applyRoundToDefects, fixChecksKey, fixKey, mergeAttempts, noOpReminder, parseNumstat, parseReceipts, prevChangesLines, renderFixPack, roundChecks,
  summarizeChecks, verifyReceipts, type CoVerification, type FixPhaseInput, type FixRaw, type RoundChecks, type RoundVerification,
} from "./fixRound"; // TASK-25
import {
  applyVerifyToDefects, bestKey, CHECK_MISSED_IT, cosRoundKey, decide, decideNext, disagreements, isOpenDefect, nextAttempt, revertNote, roundOutcome, syncTurn,
  verifyBoth, verifyKey, type Decision, type NextDecision, type VerifyContext, type VerifyDeps, type VerifyFindings, type VerifyRun, type VerifyVerdict,
  planGoalOf, newlyOccluded, type OcclusionRegression,
} from "./verify"; // TASK-26
import { buildOCB } from "./ocb";
import { maybeCapturePrompt } from "./testHooks";

export interface LoopRunner {
  id: string;
  sessionId?: string | null;
  msMap?: MilestoneMap | null;
  msChips?: any[];
}

export interface LoopHooks {
  bcast: (e: any) => void;
  addChip: (text: string) => void;
  blog: (level: "info" | "success" | "warning" | "error" | "system", text: string) => void;
  persist: () => Promise<void>;
  /** agenda zilizofungwa kwenye Ledger (chanzo cha ukweli) */
  resolvedAgendas: () => Promise<Set<number>>;
  /** TASK-15: Optimus anaandika plan ya milestone (bila hook → stub ya task 14) */
  plan?: (m: Milestone) => Promise<MilestonePlanResult>;
  /** TASK-16: XMD Computer anajenga milestone MOJA kutoka plan yake (bila hook → stub) */
  build?: (m: Milestone, planMarkdown: string) => Promise<BuildOutcome>;
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
  };
  /** TASK-26: raundi ya uthibitisho — evidence upya (tasks 19–22) → reviewers 2 → decide → git → Optimus COs. */
  verify?: {
    evidence: (m: Milestone, round: number, planMarkdown: string, cos: ChangeOrder[]) => Promise<NonNullable<BuildOutcome["evidence"]>>;
    /** OCB (bila stage/self) + ledger kwa reviewers */
    context: (m: Milestone, round: number, openDefects: number) => Promise<{ ocb: VerifyContext["ocb"]; ledger: VerifyContext["ledger"]; ledgerLines: string[] }>;
    git: (m: Milestone, op: { kind: "tag"; name: string } | { kind: "revert"; from: string; message: string; label: string }) => Promise<{ ok: boolean; sha: string; detail: string }>;
    /** majaribio tu: badala ya LLM halisi */
    deps?: VerifyDeps;
    consolidate?: (i: ConsolidateInput) => Promise<ConsolidateResult>;
    /** test hook (XMD_TEST_STOP_AFTER_ROUND): simama baada ya uthibitisho wa raundi hii */
    stopAfterRound?: number;
  };
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
export async function maybeCloseMilestones(runner: LoopRunner, hooks: LoopHooks): Promise<string[]> {
  if (!milestonesEnabled() || !runner.msMap || !runner.sessionId) return [];
  const resolved = await hooks.resolvedAgendas();
  const done: string[] = [];
  for (const m of runner.msMap.milestones) {
    if (!agendasOf(m).every((i) => resolved.has(i))) continue;
    const cur = (await getRecord<MilestoneState>(runner.sessionId, stateKey(m.id)))?.data ?? null;
    const status = cur?.status ?? "DISCUSSING";
    if (TERMINAL_STATUSES.includes(status)) continue;
    if (HOLD_STATUSES.includes(status)) continue; // TASK-15: BLOCKED (plan haitekelezeki) / PAUSED — hairudiwi yenyewe
    if ((status === "VERIFYING" && !hooks.verify) || (status === "FIXING" && !hooks.fix)) continue; // TASK-24/25/26: FIXING → hooks.fix · VERIFYING → hooks.verify
    const lockKey = `${runner.sessionId}:${m.id}`;
    if (running.has(lockKey)) continue;
    running.add(lockKey);
    try {
      let won = false;
      if (status === "DISCUSSING") {
        try {
          await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
            const base = s ?? newMilestoneState(m.id);
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
      done.push(m.id);
    } finally {
      running.delete(lockKey);
    }
  }
  return done;
}

/**
 * STUB (task 14): hatua `plan` na `build` zinawekwa DONE (stub:true), kisha state → SIGNED_OFF kwa forward edges.
 * Kila hatua inaruka ikiwa tayari DONE (resume haiendeshi kitu mara mbili).
 */
export async function runMilestoneBuild(runner: LoopRunner, m: Milestone, hooks: LoopHooks): Promise<MilestoneState> {
  const steps = ["plan", "build", ...(hooks.review ? ["review"] : [])].map((s) => stepIdOf(m.id, 0, s)); // TASK-24: review baada ya evidence
  let rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(planSteps(s ?? newMilestoneState(m.id), steps)));
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
  if (!out.ok) return fail(out.finalState === "PAUSED_QUOTA" ? "PAUSED_QUOTA" : "BLOCKED", `${out.finalState}${out.reason ? ` — ${out.reason}` : ""} (XMD Computer)`);
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
    })).text,
    log: log ? (lvl, t) => log(lvl, t) : undefined,
  });
}

/** TASK-24: hatua ya review — EVIDENCE → REVIEW_R0 → runReviewRound → NO_CHANGES (SIGNED_OFF kwa njia ya kawaida) |
 *  CHANGES (COs zimehifadhiwa → FIXING, round 1; raundi za marekebisho ni tasks 25+) | FAILED (CO haikuthibitika → BLOCKED). */
async function runReviewStep(runner: LoopRunner, m: Milestone, hooks: LoopHooks, id: string): Promise<{ ok: boolean; state: MilestoneState; result?: ReviewRoundResult }> {
  const rh = hooks.review as NonNullable<LoopHooks["review"]>;
  const sid = runner.sessionId as string;
  const ev = sid ? (await getRecord<EvidencePack>(sid, evidenceKey(m.id, 0)))?.data : null;
  if (!ev || !(ev.screenshots || []).length) {
    // technical / bila UI → hakuna evidence ya kuona: review ya R0 inarukwa (njia ya zamani)
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => {
      const st = must(setStep(s as MilestoneState, id, "DONE"));
      return { ...st, steps: (st.steps || []).map((x) => (x.stepId === id ? { ...x, stub: true } : x)) };
    });
    hooks.blog("info", `🧑‍⚖️ ${m.id}: hakuna evidence ya screenshots (${m.reviewMode}) — REVIEW R0 imerukwa.`);
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
  ctx.analyseCtx = { ...ctx.analyseCtx, roundHeader: header0 };
  const result = await runReviewRound({
    milestoneId: m.id, milestoneTitle: m.title, round: 0, reviewMode: m.reviewMode, pack: ev, ledgerLines: ctx.ledgerLines, domHints: [],
    participants: reviewParticipants(ctx.extraParticipants), roundHeader: formatRoundHeader(header0),
  }, {
    analyse: async () => {
      const r = await reviewRound0(ev, ctx.analyseCtx, { log: (lvl, t) => hooks.blog(lvl, t), ...(rh.analyseDeps || {}) });
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
    const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, id, "DONE")), { type: "GOTO", to: "FIXING" })));
    hooks.blog("info", `🔧 ${m.id} → FIXING (round ${rec.data.round}) — COs ${result.changeOrders.length} zinasubiri raundi za marekebisho (tasks 25+).`);
    await hooks.persist();
    return { ok: false, state: rec.data, result };
  }
  const rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "DONE")));
  await hooks.persist();
  return { ok: true, state: rec.data, result };
}

/* ============================ TASK-25: raundi ya marekebisho ============================ */

const CLOSED_DEFECT = ["VERIFIED_FIXED", "WAIVED"];
const OPEN_DEFECT = ["OPEN", "IN_FIX", "REOPENED"];

/** RoundHeader (data) ya raundi n kutoka ledger ya defects. */
export function fixRoundHeader(m: Milestone, round: number, maxRounds: number, defects: Defect[]): RoundHeaderData {
  const mine = defects.filter((d) => d.milestoneId === m.id);
  return {
    milestoneId: m.id, round, maxRounds,
    closedDefects: mine.filter((d) => CLOSED_DEFECT.includes(d.status)).length,
    open: mine.filter((d) => OPEN_DEFECT.includes(d.status)).map((d) => ({ id: d.id, attempt: (d.attempts || 0) + 1 })),
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
  const ocb = await fh.ocb(m, round, header.open.length);
  const orderIds = cos.map((c) => c.id);
  let captured = false;
  const render = (repo: { tree: string; gitLog: string }) => {
    const pack = renderFixPack({ roundHeader: header, ocb, changeOrders: cos, repo, prevChanges: prevChangesLines(prev), milestoneId: m.id, round });
    if (!captured) { captured = true; maybeCapturePrompt({ sessionId: sid, agent: "computer", agenda: 0, phase: `fix:${m.id}:R${round}`, system: pack }); } // TASK-26 T3
    return pack;
  };

  await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(setStep(s as MilestoneState, id, "RUNNING")));
  await hooks.persist();
  hooks.addChip(`🔧 ${m.id} R${round}: XMD Computer anatekeleza COs ${orderIds.length} (${orderIds.join(", ")})`);
  hooks.blog("system", `🔧 ${m.id} R${round}: raundi ya marekebisho — COs ${orderIds.join(", ")} · ${header.open.length} defects wazi.`);
  hooks.bcast({ type: "fixRound", id: m.id, round, phase: "start", orderIds });

  const t0 = Date.now();
  let out = await fh.run(m, plan, { round, attempt: 1, orderIds, render });
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
    out = await fh.run(m, plan, { round, attempt: 2, orderIds, render, reminder, diffBase: out.fix?.headBefore || out.fix?.diffBase });
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
  const rc = roundChecks(cos, plan);
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
  }));
  await msUpdate<{ version: number; defects: Defect[] }>(runner, "defects", (cur) => ({ version: 1, ...(cur || {}), defects: applyRoundToDefects(cur?.defects || defects0, cos, v, round, perCo) }));
  const ck = perCo.global || { pass: 0, fail: 0, error: 0 };
  const all = Object.values(perCo).reduce((a, s) => ({ pass: a.pass + s.pass, fail: a.fail + s.fail, error: a.error + s.error }), { pass: 0, fail: 0, error: 0 });
  hooks.bcast({ type: "fixRound", id: m.id, round, phase: "done", finalState: out.finalState, ok: out.ok, flags: v.flags, unlisted: v.unlisted, perCo: v.cos.map((c) => ({ orderId: c.orderId, verdict: c.verdict, receipt: c.receipt, receiptStatus: c.receiptStatus, diff: c.diff, checks: perCo[c.orderId] })), checks: all, global: ck, rerun: v.rerun ? { before: v.rerun.before, after: v.rerun.after } : undefined });
  if (!out.ok) return fail(out.finalState === "PAUSED_QUOTA" ? "PAUSED_QUOTA" : "BLOCKED", `${out.finalState}${out.reason ? ` — ${out.reason}` : ""} (XMD Computer, raundi ya marekebisho) · ${verificationLine(v)}`);
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
  disputed: string[];
  sync: Partial<Record<ReviewerId, Record<string, VerifyVerdict>>> | null;
  syncTranscript?: { reviewer: ReviewerId; text: string }[];
  defectsBefore?: Defect[];
  outcome?: ReturnType<typeof roundOutcome> & { openBefore: number; openAfter: number; regressions: number };
  git?: { op: "tag" | "revert" | "none"; ok: boolean; sha: string; detail: string };
  decision?: Decision;
  next?: NextDecision;
  consolidation?: { valid: boolean; attempts: number; errors: string[]; changeOrders: ChangeOrder[]; discussed: boolean };
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
  };
  const deps: VerifyDeps = { log: (l, t) => hooks.blog(l, t), capture: (agent, phase, text) => { maybeCapturePrompt({ sessionId: sid, agent, agenda: 0, phase, system: text }); }, ...(vh.deps || {}) };
  const now = () => new Date().toISOString();
  let vr = (await getRecord<VerifyRecord>(sid, verifyKey(m.id, round)))?.data ?? null;

  // 2) reviewers wawili (peke yao) → sync MOJA wakitofautiana
  if (!done(vId)) {
    await running(vId);
    if (!vr?.runs) {
      hooks.addChip(`🔍 ${m.id} R${round}: Ultron + Vextron wanathibitisha COs ${orderIds.join(", ")} (peke yao)`);
      hooks.blog("system", `🔍 ${formatRoundHeader(header)} — reviewers 2 wanathibitisha (REVIEW_VERIFY).`);
      const runs = await verifyBoth(vctx, deps);
      const disputed = disagreements(orderIds, runs.designer.findings, runs.frontend.findings);
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), () => ({ version: 1, id: m.id, round, header: formatRoundHeader(header), runs, disputed, sync: null, at: now() }))).data;
      await hooks.persist();
    } else hooks.blog("info", `♻️ ${m.id} R${round}: verdicts za reviewers zimeshahifadhiwa — hazirudiwi (resume).`);
    if (vr.disputed.length && !vr.sync && vr.runs.designer.findings && vr.runs.frontend.findings) {
      hooks.addChip(`🤝 ${m.id} R${round}: reviewers wanatofautiana (${vr.disputed.join(", ")}) — zamu MOJA ya sync`);
      const ocbOf = (r: ReviewerId) => buildOCB({ ...vctx.ocb, stage: "REVIEW_VERIFY", self: r });
      const st = await syncTurn(header, ocbOf, vr.runs.designer.findings, vr.runs.frontend.findings, vr.disputed, deps);
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), sync: st.sync, syncTranscript: st.transcript }))).data;
    }
    await stepDone(vId);
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
      const from = fixRec?.attempts?.[0]?.headBefore || fixRec?.attempts?.[0]?.diffBase || "";
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

  const tally = results.reduce((a, r) => ({ pass: a.pass + (r.result === "PASS" ? 1 : 0), fail: a.fail + (r.result === "FAIL" ? 1 : 0), error: a.error + (r.result !== "PASS" && r.result !== "FAIL" ? 1 : 0) }), { pass: 0, fail: 0, error: 0 });
  const openList = mineOpen(res.defects);
  let nd = decideNext({
    round, maxRounds: rec.data.maxRounds, cos: decision.cos, reviewersValid: !!designer && !!frontend, checks: tally,
    openDefects: openList.map((d) => ({ id: d.id, severity: d.severity })), listedMinor: [], // orodha ya minor zinazoruhusiwa = task 28
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
      const asked = [designer, frontend].filter((f) => f?.requestDiscussion);
      if (asked.length && hooks.review?.discuss) {
        // mjadala wa timu TU reviewer akiomba (maelezo26 #2)
        try {
          const reviewId = reviewAgendaId(m.id, round);
          const item = makeReviewAgendaItem({
            reviewId, milestoneId: m.id, milestoneTitle: m.title, round, reviewMode: m.reviewMode,
            table: { reviewId, milestoneId: m.id, round, defects: openList, proposals: [], decisionRefs: {}, notes: { designer: designer?.notes, frontend: frontend?.notes } },
            ledgerLines: base.ledgerLines, checkLines: results.map((c) => `- check:${c.id} [${c.type}] ${c.result} — ${c.detail.slice(0, 160)}`),
            evidenceRefs: pack.screenshots.map((x) => `- ${x.id}: ${x.route} @${x.viewport} ${x.state}`), participants: reviewParticipants(),
          });
          hooks.addChip(`🧑‍⚖️ ${reviewId}: mjadala wa timu umeombwa na ${asked.map((f) => f!.reviewer).join(" + ")}`);
          const d = await hooks.review.discuss(item);
          discussion += `\n\nTEAM DISCUSSION (requested: ${asked.map((f) => `${f!.reviewer} — ${f!.requestDiscussion!.reason}`).join("; ")}):\n${d.transcript.map((t) => `${t.name}: ${t.text}`).join("\n\n")}`;
          discussed = true;
        } catch (e: any) { hooks.blog("warning", `🧑‍⚖️ ${m.id} R${round}: mjadala ulioombwa haukufanyika: ${String(e?.message || e).slice(0, 160)}`); }
      }
      const prevAll = (await getRecord<{ changeOrders?: ChangeOrder[] }>(sid, cosKey(m.id)))?.data?.changeOrders || [];
      const nowHeader = fixRoundHeader(m, round, rec.data.maxRounds, res.defects); // raundi ya SASA, counts mpya kutoka DB
      const consolidateFn = vh.consolidate || hooks.review?.consolidate || ((i: ConsolidateInput) => defaultConsolidate(i, hooks.blog, sid));
      const r = await consolidateFn({
        reviewId: reviewAgendaId(m.id, round), milestoneId: m.id, round: round + 1, reviewMode: m.reviewMode, defects: openList, decisions: [],
        ledgerLines: base.ledgerLines, discussion, routes: [...new Set([...(pack.screenshots || []).map((x) => x.route), ...(checksRec?.routes || [])])],
        domHints: [...new Set([...decision.newDefects, ...decision.regressions].flatMap((x) => x.evidence).concat(decision.concerns.flatMap((c) => c.evidence)).filter((e) => / dom: /.test(e)))],
        nextCoNo: prevAll.length + 1, roundHeader: formatRoundHeader(nowHeader), notes: reverted ? [reverted] : [],
      });
      cons = { valid: r.valid, attempts: r.attempts, errors: r.errors, discussed, changeOrders: r.valid ? r.changeOrders.map((c) => ({ ...c, attempt: nextAttempt(c, res.defects) })) : [] };
      vr = (await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), consolidation: cons }))).data;
    }
    if (!cons.valid) nd = { ...nd, next: "BLOCKED", reason: `consolidation invalid after ${cons.attempts} attempt(s): ${cons.errors.slice(0, 3).join("; ")}` };
    else {
      newCos = cons.changeOrders;
      await msUpdate<{ version: number; changeOrders: ChangeOrder[] }>(runner, cosKey(m.id), (cur) => ({ version: 1, changeOrders: [...(cur?.changeOrders || []).filter((c) => !newCos.some((x) => x.id === c.id)), ...newCos] }));
      await msUpdate(runner, cosRoundKey(m.id, round + 1), () => ({ version: 1, round: round + 1, changeOrders: newCos }));
    }
  }
  const to: MilestoneStatus = nd.next === "SIGN_OFF" ? (nd.leftoverMinor.length ? "SIGNED_OFF_WITH_WAIVERS" : "SIGNED_OFF") : nd.next === "CONTINUE" ? "FIXING" : nd.next === "CAP_REACHED" ? "CAP_REACHED" : "BLOCKED";
  await msUpdate<VerifyRecord>(runner, verifyKey(m.id, round), (cur) => ({ ...(cur as VerifyRecord), decision, next: nd, added: res.added.map((d) => d.id), duplicates: trial.duplicates, at: now() }));
  rec = await msUpdate<MilestoneState>(runner, stateKey(m.id), (s) => must(transition(must(setStep(s as MilestoneState, dId, to === "BLOCKED" ? "FAILED" : "DONE")), { type: "GOTO", to })));
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
