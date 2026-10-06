import { getAgent, AGENTS } from "./agents";
import { wantsThinkTags, withThinkDirective } from "./thinkDirective";
import { isReasoningDump, makeHeadGate, parseProposal, repairHead, tidyTurn, visibleTurn, type HeadRepair } from "./board/turnText";
import { scanFinale, SECTION_DEFS, extractSections, missingParts, type FinaleItem, type FinaleState } from "./board/finale";
import { BUFFER_SOFT_LIMIT, compactBuffer } from "./runnerBuffer";
import { applyReviewFixes } from "./scriptBox";
import { brokerRun, brokerStatus, brokerComplete, brokerClient, continuationMessages, trimForContinuation, joinContinuation, looksCut, idleGuard, isBrokerExhausted, isNetworkError, isOnline, onNetState, waitOnline, type Lease, type Priority, type WorkClass } from "./broker";
import { capacityMessage } from "./groq";
import type { LlmOpts } from "./brain/llm";
import { searchWeb, searchWebDirect, type SearchResult } from "./search";
import { curateSources, onOwnerTurn, onObserverNote, reviewFacts, onReviewVerdict, onReport } from "./brain/skills/runTools";
import { saveReport, saveSession, updateSessionItems, getConversation, lastSaveError, type SessionItem } from "./reports";
import { saveLedgerEntry, finalBoardResolution, markSuperseded, type LedgerObjection } from "./ledger";
import { generateAgenda, type AgendaItem } from "./agenda";
import type { BoardEvent } from "./types";
import { readUsage, createLiveMeter, type ExactUsage } from "./tokenMeter";
import { writeMiniReport as writeMiniReportCore, provisionalMini, miniDecisionSection, miniContext, needsMiniRedo, miniTries, cleanDecision, type MiniReport, type MiniInput } from "./miniReport";
import { openRecord } from "./board/openRecord";
import { auditScript, auditSection } from "./board/scriptAudit";
import { updateLedgerMini } from "./ledgerUpdate";
import { trimInterrupted, seedEvents, agendaTalk } from "./board/rehydrate";
import type { SavedItem } from "./board/adapter";
import { compactTranscript } from "./brain/memory/transcript";
import { createBoardBrain, type BrainUiEvent } from "./brain/hooks";
import { stateBus } from "./brain/stateBus";
import { parseClarify, pickSpeaker, clarifyNote, type ClarifyAsk } from "./brain/clarify";
import { hasRealCode } from "./codeFence";
import { createDeliberation, DELIBERATION_RULES } from "./brain/deliberation";
import { createSourceDesk } from "./board/sourceDesk";
import { uniqueByUrl } from "./searchHygiene";
import { emptyUsage, isHiddenChip, readUsageChip, usageChipItem, type ProviderUsage, type UsageMap } from "./usageChip";
// R26: usahihi 100% — Fact Sheet (data rasmi), faili za data za mfumo, Data Guard, script ya mwisho ya kideterministic
import { extractFactSheet, factSheetBlock, factSummary, mergeLlmFacts, readBriefChip, readFactsChip, BRIEF_PREFIX, FACTS_PREFIX, type FactSheet } from "./board/factSheet";
import { systemDataFiles, dataFilesBlock, enforceDataFiles, dataRefHits } from "./board/dataFiles";
import { guardText, guardRejectNote, guardSummary, guardSection, swahiliHoursDecided, type GuardHit } from "./board/dataGuard";
import { normalizeDeliverable } from "./board/codeBlocks";
import { sessionLabel, pastAuthorityHits, pastAuthorityNote, pastProjectNames, rememberPastTitles, stripPastAuthority } from "@/lib/board/memoryAuthority";
import { listSessionMeta } from "@/lib/server/sessionIndex";
import { contrastHits, contrastNote, contrastSummary } from "@/lib/board/contrastGuard";
import { echoOf } from "@/lib/board/echoGuard";
import { assembleScript } from "./board/assemble";
import { reviewVerdict } from "./board/reviewVerdict";
// R30 · PLAN MODE: mini-reports kwenye collection yake + Mpango Kazi wa Agent (computer-use)
import { BOARD_PLAN_MODE } from "./env";
import { saveMiniReport, miniDetailsMap, MINI_LEDGER_POINTER, isMiniPointer, type MiniReportDoc } from "./server/miniReports";
import { saveProjectPlan } from "./server/plans";
// R31 · XMD COMPUTER (computer-use): engine ya phase ya mwisho — baada ya memory ya Board
import { cuEnabled, startComputerPhase, ensureCuState, cuChipItemOf, readCuChip, cuChipItem, type CuRunState, type CuHooks } from "./cu/engine";
import {
  PLAN_PARTS, PLAN_SECTION_DEFS, PLAN_STEPS_MIN, PLAN_STEPS_MAX, planPartChip, PLAN_SAVED_CHIP,
  extractPlanSections, parsePlanSteps, assemblePlanDocument, officialDataMarkdown, constraintsMarkdown, constraintFallbackLines, PLAN_STEP_TEMPLATE,
} from "./board/workPlan";

export interface Runner {
  id: string;
  project: string;
  /** R30: "plan" = Board ya maamuzi + Mpango Kazi (hakuna code nzima) · "code" = flow ya zamani · undefined (zamani) = code */
  mode?: "code" | "plan";
  /** R16.1: "paused" = Detach — engine imesimama KABISA, hali yote iko hai kwenye memory; Resume inaendelea pale pale */
  status: "running" | "paused" | "completed" | "error";
  items: SessionItem[];
  buffer: BoardEvent[];
  /** ukubwa wa buffer utakaosababisha ubanaji unaofuata (runnerBuffer.ts) */
  compactAt?: number;
  subs: Set<(e: BoardEvent) => void>;
  startedAt: number;
  agenda?: AgendaItem[];
  sessionId?: string | null;
  /** Usage + muda kutoka session iliyohifadhiwa (resume) — hesabu inaendelea. */
  priorUsage?: UsageMap;
  /** R20: tokens/requests za session kwa provider (kutoka usage chip) */
  priorByProvider?: ProviderUsage;
  priorElapsedMs?: number;
  /** R16.1 PAUSE: inakata wito unaoendelea (zamu/aux) Detach inapobonyezwa; mpya kila Resume */
  pauseAbort?: AbortController;
  pausedAt?: number;
  /** run() iliyosimama kwenye gate inasubiri hapa: false = endelea, true = acha kabisa */
  resumeWaiters?: ((stop: boolean) => void)[];
  stopRequested?: boolean;
  /** agenda zilizokamilika (LOCKED/OPEN) — zinahifadhiwa kwenye resume state kama akiba ya Ledger */
  doneIdx?: number[];
  /** R20: maendeleo ya finale (ripoti imehifadhiwa? memory imeandikwa?) — kwa Endeleza */
  finale?: FinaleState;
  /** R26: data rasmi ya brief (inahifadhiwa kama chip iliyofichwa → resume haipotezi) */
  facts?: FactSheet | null;
  /** R31: session hii imepangiwa awamu ya XMD Computer (sessions za zamani hazina hii → hazigusiwi) */
  computerPlanned?: boolean;
  /** R31: hali ya run ya computer-use (in-memory; chip ya CU_STATE inadumu Appwrite) */
  cu?: CuRunState;
  /** R31: hooks za ndani za run() — endpoint ya cu-event zinazitumia (route haina access ya closure) */
  cuHooks?: CuHooks;
}

const g: any = globalThis;
g.__boardRunners = g.__boardRunners || new Map<string, Runner>();
const runners: Map<string, Runner> = g.__boardRunners;

const nid = () => Math.random().toString(36).slice(2, 10);
const MAX_RETRIES = 2;
const MAX_TURNS = 40; // usalama wa mwisho tu -- baada ya AGREE-detection fix, consensus halisi inapaswa kufunga mapema; hii si tena kikomo cha kibiashara // deliberation safety ceiling; NOT a search cap
const TO = "<" + "think>";
const TC = "<" + "/think>";
const thinkRe = new RegExp(TO + "[\\s\\S]*?" + TC, "g");
const THINK_CAP =
  "\n(Keep internal reasoning concise. Do not emit <think> tags in the visible report.)";

export function activeRunner(): Runner | null {
  for (const r of runners.values()) if (r.status === "running") return r;
  return null;
}
export function getRunner(id: string): Runner | null {
  return runners.get(id) || null;
}
/** runner kwa runner id AU session id (Sessions → Resume hutuma session id) — kinga ya runner wa pili sambamba */
export function findRunner(id: string): Runner | null {
  if (!id) return null;
  const direct = runners.get(id);
  if (direct) return direct;
  for (const r of runners.values()) if (r.sessionId === id) return r;
  return null;
}

/* ================= R16.1 — PAUSE / RESUME (Detach = simama kabisa · Resume = endelea pale pale) ================= */
export class BoardStopped extends Error {
  constructor() { super("board stopped"); this.name = "BoardStopped"; }
}
const MAX_PAUSED = 2;

export function pausedRunners(): Runner[] {
  return [...runners.values()].filter((r) => r.status === "paused").sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0));
}

function chip(runner: Runner, text: string) {
  runner.items.push({ kind: "chip", id: nid(), text });
  broadcast(runner, { type: "system", text });
}

/** Detach: simamisha KABISA. Wito unaoendelea unakatwa sasa hivi; run() inasimama kwenye gate inayofuata. */
export function pauseRun(id: string): Runner | null {
  const r = findRunner(id);
  if (!r) return null;
  if (r.status === "paused") return r;
  if (r.status !== "running") return null;
  r.status = "paused";
  r.pausedAt = Date.now();
  r.pauseAbort?.abort();
  stateBus.update(r.id, { status: "paused" });
  chip(r, "⏸️ Mjadala umesimamishwa — hakuna agent anayeendelea. Bonyeza Resume kuendelea pale pale ulipoishia.");
  // mijadala iliyosimamishwa isiwe mingi kwenye memory: ya zamani zaidi inaachwa (inabaki resumable kutoka Appwrite)
  const extra = pausedRunners().slice(MAX_PAUSED);
  for (const old of extra) stopRunner(old);
  return r;
}

/** Resume/Attach: endelea pale pale. false = kuna mjadala mwingine unaoendelea sasa hivi. */
export function unpauseRun(r: Runner): boolean {
  if (r.status !== "paused") return r.status === "running";
  const other = activeRunner();
  if (other && other.id !== r.id) return false;
  if (r.pausedAt) r.startedAt += Date.now() - r.pausedAt; // muda wa kusimama hauhesabiwi
  r.pausedAt = undefined;
  r.status = "running";
  r.pauseAbort = new AbortController();
  stateBus.update(r.id, { status: "running" });
  chip(r, "▶️ Mjadala umeendelea pale pale ulipoishia.");
  const w = r.resumeWaiters || [];
  r.resumeWaiters = [];
  w.forEach((fn) => fn(false));
  return true;
}

/** Acha mjadala uliosimamishwa (bila kuufuta Appwrite) — Resume ya baadaye inatumia Ledger (agenda iliyokatizwa inaanza upya). */
function stopRunner(r: Runner) {
  r.stopRequested = true;
  const w = r.resumeWaiters || [];
  r.resumeWaiters = [];
  w.forEach((fn) => fn(true));
  r.status = "error";
  runners.delete(r.id);
}

function broadcast(runner: Runner, e: BoardEvent) {
  runner.buffer.push(e);
  if (runner.buffer.length > (runner.compactAt ?? BUFFER_SOFT_LIMIT)) {
    runner.buffer = compactBuffer(runner.buffer); // bana, usifute historia
    runner.compactAt = Math.max(BUFFER_SOFT_LIMIT, runner.buffer.length * 2);
  }
  runner.subs.forEach((fn) => {
    try { fn(e); } catch {}
  });
}

export function attach(runner: Runner, emit: (e: BoardEvent) => void): () => void {
  runner.buffer.forEach((e) => { try { emit(e); } catch {} });
  // R16.1: mwisho wa historia — UI inachora yaliyotangulia papo hapo (bila animation), kisha live inaendelea
  try { emit({ type: "sync" }); } catch {}
  runner.subs.add(emit);
  return () => { runner.subs.delete(emit); };
}

export function streamRunner(runner: Runner): Response {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: BoardEvent) => { try { controller.enqueue(encoder.encode(JSON.stringify(e) + "\n")); } catch {} };
      const off = attach(runner, (e) => {
        send(e);
        if (runner.status !== "running") setTimeout(() => { off(); try { controller.close(); } catch {} }, 150);
      });
      if (runner.status !== "running") setTimeout(() => { off(); try { controller.close(); } catch {} }, 150);
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", "X-Runner-Id": runner.id },
  });
}

export function startRun(project: string, opts: { force?: boolean } = {}): Runner {
  const existing = activeRunner();
  if (existing && !opts.force) {
    broadcast(existing, { type: "system", text: "♻️ Kuna mjadala unaoendelea background — umerejea kwake." });
    return existing;
  }
  // R32.1 (agizo la CEO 06-10): kazi MPYA = session MPYA daima — mjadala unaoendelea
  // unasimamishwa (unasalia resumable kutoka Sessions), mpya inachukua uwanja.
  let pausedProject: string | null = null;
  if (existing) {
    pausedProject = existing.project;
    broadcast(existing, { type: "system", text: "🆕 Session mpya imeanza (“" + project.slice(0, 80) + "”) — mjadala huu umesimamishwa; utaendelea nayo kutoka Sessions (Resume)." });
    pauseRun(existing.id);
  }
  const id = nid();
  const runner: Runner = { id, project, status: "running", items: [], buffer: [], subs: new Set(), startedAt: Date.now(), pauseAbort: new AbortController(), mode: BOARD_PLAN_MODE ? "plan" : "code",
    // R31: sessions mpya zimepangiwa computer-use (mazingira yakiwa yamekamilika); zamani hazina flag → hazigusiwi
    computerPlanned: BOARD_PLAN_MODE && cuEnabled() ? true : undefined };
  runners.set(id, runner);
  if (pausedProject) {
    chip(runner, "⏸️ Mjadala uliopita (“" + pausedProject.slice(0, 60) + "”) umesimamishwa ili hii ianze — utaendelea nayo kutoka Sessions (Resume).");
  }
  if (runners.size > 3) {
    for (const [k, v] of runners) { if (v.status !== "running" && v.status !== "paused" && k !== id) { runners.delete(k); break; } }
  }
  startLoop(runner);
  return runner;
}

// Endelea (resume) na mjadala uliosimama kabla ya kufikia mwisho.
//   1) Runner yupo hai (Detach → paused): anaendelea PALE PALE — zamu ileile, agenda ileile (hali yote iko memory).
//   2) Runner yupo lakini alikufa kwa kosa: run() mpya kwenye runner uleule — agenda zilizofungwa (Ledger + progress) zinarukwa.
//   3) Server ilianza upya: runner anajengwa upya kutoka Appwrite kwa id ileile — kama (2).
// `id` inaweza kuwa runner id AU session id. HAKUNA runner wa pili sambamba kwa mjadala mmoja (hiyo ndiyo iliyochanganya
// agenda zamani: Resume ya session id iliunda runner mpya wakati wa zamani bado unaendelea).
export type ResumeResult = Runner | "busy" | null;

export async function resumeRun(id: string): Promise<ResumeResult> {
  const live = findRunner(id);

  if (live) {
    if (live.status === "running") return live;
    if (live.status === "paused") return unpauseRun(live) ? live : "busy";
    if (live.status === "completed") return null;
    if (!live.agenda || live.agenda.length === 0) return null;
    const other = activeRunner();
    if (other && other.id !== live.id) return "busy";
    live.status = "running";
    live.pauseAbort = new AbortController();
    live.stopRequested = false;
    broadcast(live, { type: "system", text: "♻️ Kuendelea na mjadala uliosimama..." });
    startLoop(live);
    return live;
  }

  // Server restart path: recover the EXACT persisted conversation from Appwrite.
  const saved = await getConversation(id);
  if (!saved) return null;
  if (saved.status === "completed") return null;

  const PREFIX = "__PROFESSOR_XMD_RESUME_STATE__:";
  const stateItem = [...(saved.items || [])]
    .reverse()
    .find((it: any) => it?.kind === "chip" && typeof it?.text === "string" && it.text.startsWith(PREFIX));
  if (!stateItem) return null;

  let state: any;
  try {
    state = JSON.parse(stateItem.text!.slice(PREFIX.length));
  } catch {
    return null;
  }
  if (!state || !Array.isArray(state.agenda) || state.agenda.length === 0 || typeof state.runnerId !== "string") return null;

  // runner wa id hii yupo tayari (mf. Resume ilitumwa kwa session id wakati runner yuko hai) → tumia huyo
  const existing = runners.get(state.runnerId);
  if (existing) return resumeRun(existing.id);

  const other = activeRunner();
  if (other) return "busy";

  // R18: agenda zilizokamilika = progress iliyohifadhiwa ∪ Ledger. Agenda iliyokatizwa katikati (haipo hapo) inafutiwa
  // maneno yake ya zamani na kuanza upya safi (A=1); finale iliyokatizwa inafutwa pia (inaandikwa upya yote).
  const resolved = new Set<number>(Array.isArray(state.done) ? state.done.filter((n: unknown) => typeof n === "number") : []);
  try { (await finalBoardResolution(state.runnerId)).forEach((e) => resolved.add(e.agenda_index)); } catch {}
  const trim = trimInterrupted((saved.items || []).filter((it: any) => !isHiddenChip(it)) as SessionItem[], resolved, state.agenda.length);
  const items: SessionItem[] = trim.items;
  if (trim.restarted) {
    items.push({ kind: "chip", id: nid(), text: `♻️ Agenda ${trim.restarted} imeanza upya — server ilianza upya katikati yake, kwa hiyo maneno yake ya zamani yameondolewa ili yasichanganyike.` } as SessionItem);
  } else if (trim.finaleCut) {
    items.push({ kind: "chip", id: nid(), text: "♻️ Endeleza: sehemu ya finale iliyokatika inaandikwa upya — vipande vilivyokamilika vimebaki." } as SessionItem);
  }
  const priorChip = readUsageChip(saved.items);
  const priorUsage = priorChip?.usage;
  // R26 (A1): brief kamili kutoka chip iliyofichwa (saved.project imekatwa kwenye herufi 500)
  const fullBrief = readBriefChip(saved.items);
  const project = fullBrief && fullBrief.startsWith(String(saved.project || "").slice(0, 200)) ? fullBrief : fullBrief || saved.project;

  // Restore the SAME runner ID — Ledger entries use runner.id as project_id.
  const runner: Runner = {
    id: state.runnerId,
    project,
    facts: readFactsChip(saved.items),
    status: "running",
    items,
    // R18: historia YOTE iko kwenye buffer → kila attach (refresh/tab nyingine/auto-attach) inapata mjadala kamili na title
    buffer: seedEvents(items as SavedItem[], project, { title: saved.title && saved.title !== "Untitled" ? saved.title : "", usage: priorUsage, byProvider: priorChip?.byProvider }),
    subs: new Set(),
    startedAt: Date.now(),
    agenda: state.agenda,
    sessionId: saved.id,
    priorUsage,
    priorByProvider: priorChip?.byProvider,
    priorElapsedMs: priorChip?.elapsedMs,
    pauseAbort: new AbortController(),
  };
  // R16.1: agenda zilizokamilika kwa mujibu wa progress iliyohifadhiwa (akiba ikiwa Ledger haisomeki)
  if (Array.isArray(state.done)) runner.doneIdx = state.done.filter((n: unknown) => typeof n === "number");
  if (state.finale && typeof state.finale === "object") runner.finale = { reportId: state.finale.reportId ?? null, memory: !!state.finale.memory, planId: state.finale.planId ?? null, computer: !!(state.finale as any).computer || undefined };
  // R30: mode ya session inarudishwa (zamani hazina → code); mpya zinazaliwa na env BOARD_PLAN_MODE
  runner.mode = state.mode === "plan" ? "plan" : state.mode === "code" ? "code" : "code";
  // R31: computerPlanned inarudishwa; hali ya CU (sandboxId/token/maxI/links/files) inajengwa kutoka chip yake
  if ((state as any).computer) runner.computerPlanned = true;
  // R31-G4: chip ya CU IINGIE items (isHiddenChip ilikuwa inaichuja nje → ensureCuState
  // ilizaliwa UPYA: pausedOnce=false/maxI=0/snapshot=hakuna → fast-path iliruka, test
  // hook ilirudi, events za bridge mpya zilirudia i:1..7 → loop ya re-pause ya 6ac3ce60).
  // Persist haina madhara: inachuja hidden chips kisha inaandika fresh.
  const cuChip = readCuChip((saved.items || []) as SessionItem[]);
  if (cuChip && !runner.finale?.computer) { runner.items.push(cuChipItem(cuChip) as SessionItem); }
  if (runner.computerPlanned && !runner.finale?.computer) ensureCuState(runner);
  runners.set(runner.id, runner);
  if (trim.dropped) console.warn(`[resume] ${runner.id}: items ${trim.dropped} za ${trim.restarted ? `agenda ${trim.restarted}` : "finale"} iliyokatizwa zimeondolewa`);

  broadcast(runner, {
    type: "system",
    text: "♻️ Conversation imerejeshwa kutoka Appwrite. Inaendelea na agenda na Ledger ile ile kutoka checkpoint ya mwisho...",
  });
  startLoop(runner);
  return runner;
}

function startLoop(runner: Runner) {
  // R20: mtandao ukikatika — chip moja inaonekana (na kupona kunatangazwa); zamu/kazi zinasubiri ndani ya broker
  const offNet = onNetState((offline) => {
    if (runner.status !== "running") return;
    chip(runner, offline ? "📡 Mtandao umekatika — Board inasubiri mtandao urudi (hakuna kinachopotea)…" : "📶 Mtandao umerudi — Board inaendelea pale ilipoishia.");
  });
  run(runner).finally(offNet).catch((e) => {
    if (e instanceof BoardStopped || runner.stopRequested) return; // imeachwa kwa makusudi — kimya
    runner.status = "error";
    broadcast(runner, { type: "error", message: e?.message || "Unknown" });
    broadcast(runner, { type: "done" });
  });
}

function hasActualResponse(text: string): boolean {
  const validationText = text
    .replace(thinkRe, "")
    .replace(/[\p{White_Space}\p{Cc}\p{Cf}]/gu, "");

  return validationText.length > 0;
}

function makeParser(onThink: (t: string) => void, onAnswer: (t: string) => void) {
  const OPEN = TO; const CLOSE = TC;
  let pending = ""; let inThink = false;
  const emit = (t: string) => { if (t) (inThink ? onThink(t) : onAnswer(t)); };
  const feed = (t: string) => {
    pending += t;
    let guard = 0;
    while (guard++ < 40) {
      const tag = inThink ? CLOSE : OPEN;
      const idx = pending.indexOf(tag);
      if (idx >= 0) { emit(pending.slice(0, idx)); pending = pending.slice(idx + tag.length); inThink = !inThink; continue; }
      let keep = 0;
      for (let k = 1; k <= Math.min(pending.length, tag.length - 1); k++) if (tag.startsWith(pending.slice(pending.length - k))) keep = k;
      const len = pending.length - keep;
      if (len > 0) { emit(pending.slice(0, len)); pending = pending.slice(len); }
      break;
    }
  };
  return { feed, flush: () => { if (pending) { emit(pending); pending = ""; } } };
}

function splitThinkBlocks(raw: string): { think: string; answer: string } {
  const thinkParts: string[] = [];
  const cleaned = raw.replace(/<think>[\s\S]*?<\/think>/gi, (m) => {
    thinkParts.push(m.replace(/<\/?think[^>]*>/gi, "").trim());
    return "";
  });
  const openIdx = cleaned.toLowerCase().indexOf("<think>");
  let finalAnswer = cleaned;
  if (openIdx >= 0) {
    const before = cleaned.slice(0, openIdx).trim();
    const after = cleaned.slice(openIdx + 7);
    thinkParts.push(after.split(/\n##|\n\*\*Jina|\nMkuu,/)[0].trim());
    const rest = after.slice(thinkParts[thinkParts.length - 1].length).trim();
    finalAnswer = (before + "\n" + rest).trim();
  }
  return { think: thinkParts.filter(Boolean).join("\n\n"), answer: finalAnswer.trim() };
}

function extractSearch(content: string): string | null {
  const stripped = content.replace(thinkRe, "\n");
  for (const line of stripped.split("\n")) {
    const m = line.match(/^\s*SEARCH:\s*(.+)$/i);
    if (m) {
      let q = m[1].trim().replace(/^["']+|["']+$/g, "").replace(/[.,;:!?]+$/g, "").trim();
      const poison = ["<query>", "i should", "let me", "the search", "reasoning", "analysis", "plan:", "step ", "wait,", "actually", "but the"];
      if (poison.some((p) => q.toLowerCase().includes(p))) return null;
      if (q.includes("<") || q.includes(">")) return null;
      if (q.length > 250 || q.length < 5) return null;
      return q;
    }
  }
  return null;
}

// ================= RUN: AGENDA FLOW =================
async function run(runner: Runner) {

  const bcast = (e: BoardEvent) => broadcast(runner, e);
  // R31-G5: adapter ijue mode KABLA ya ujumbe wowote — plan mode haionyeshi script/patch/review
  bcast({ type: "mode", mode: runner.mode === "plan" ? "plan" : "code" });
  const blog = (type: "info" | "success" | "warning" | "error" | "api" | "search" | "system", message: string) =>
    bcast({ type: "log", entry: { id: nid(), timestamp: new Date().toLocaleTimeString("en-GB"), at: Date.now(), type, message } });
  const usage: UsageMap = {};
  for (const a of AGENTS) usage[a.id] = { ...emptyUsage(), ...(runner.priorUsage?.[a.id] || {}) };
  /** Kila call ya LLM (stream au la) inarekodiwa hapa — exact kutoka provider, au makadirio ya tokenizer. */
  // R20: mgawanyo kwa provider — Session details inaonyesha tokens za kila provider (kulinganisha na Pulse)
  const byProvider: ProviderUsage = {};
  for (const [k, v] of Object.entries(runner.priorByProvider || {})) byProvider[k] = { ...v };
  const recordUsage = (agentId: string, u: ExactUsage, exact: boolean, id?: string, provider?: string) => {
    const rec = (usage[agentId] ||= emptyUsage());
    rec.requests++;
    rec.tokens += u.total;
    rec.prompt += u.prompt;
    rec.completion += u.completion;
    bcast({ type: "usage", agentId, requests: rec.requests, tokens: rec.tokens, id, prompt: u.prompt, completion: u.completion, exact });
    if (provider) {
      const p = (byProvider[provider] ||= { requests: 0, tokens: 0 });
      p.requests++;
      p.tokens += u.total;
      bcast({ type: "usage_provider", byProvider: JSON.parse(JSON.stringify(byProvider)) });
    }
    // R12: agents wanajua matumizi halisi (resources.ts inasoma hapa)
    const byAgent: Record<string, { tokens: number; requests: number }> = {};
    let total = 0, requests = 0;
    for (const [k, v] of Object.entries(usage)) { byAgent[k] = { tokens: v.tokens, requests: v.requests }; total += v.tokens; requests += v.requests; }
    stateBus.update(runner.id, { usage: { total, requests, byAgent } });
  };
  const boardTokens = () => Object.values(usage).reduce((n, v) => n + v.tokens, 0);

  let sessionId: string | null = runner.sessionId || null;
  const RESUME_PREFIX = "__PROFESSOR_XMD_RESUME_STATE__:";

  const getPersistItems = (): SessionItem[] => {
    const clean = runner.items.filter((it: any) => !isHiddenChip(it));
    clean.push(usageChipItem(usage, (runner.priorElapsedMs || 0) + (Date.now() - runner.startedAt), byProvider));
    // R26 (A1): brief KAMILI (field ya project ina herufi 500 tu) + Fact Sheet — resume inazirejesha neno kwa neno
    if (runner.project.length > 500) clean.push({ kind: "chip", id: "__professor_xmd_brief__", text: BRIEF_PREFIX + runner.project } as SessionItem);
    if (runner.facts) clean.push({ kind: "chip", id: "__professor_xmd_facts__", text: FACTS_PREFIX + JSON.stringify(runner.facts) } as SessionItem);
    // R31 · XMD Computer: hali ya run (sandboxId/token/maxI/files/links) — resume na Files badge zinaisoma
    if (runner.cu) clean.push(cuChipItemOf(runner) as SessionItem);

    if (!runner.agenda || runner.agenda.length === 0) {
      return clean;
    }

    clean.push({
      kind: "chip",
      id: "__professor_xmd_resume_state__",
      text:
        RESUME_PREFIX +
        JSON.stringify({
          version: 2,
          runnerId: runner.id,
          agenda: runner.agenda,
          done: runner.doneIdx || [],
          ...(runner.mode ? { mode: runner.mode } : {}),
          ...(runner.computerPlanned ? { computer: true } : {}),
          ...(runner.finale ? { finale: runner.finale } : {}),
        })
    } as SessionItem);

    return clean;
  };

  // R18: kushindwa kuhifadhi hakuko kimya tena — onyo linaonekana (mara moja kwa kila mfululizo wa makosa) na kupona kunatangazwa
  let saveFailing = false;
  const noteSave = (ok: boolean) => {
    if (!ok) {
      const why = lastSaveError.session || "sababu haijulikani";
      blog("warning", `⚠️ Persistence: mazungumzo hayakuhifadhiwa Appwrite — ${why}`);
      if (!saveFailing) bcast({ type: "system", text: `⚠️ Mazungumzo hayakuhifadhiwa Appwrite (${why.slice(0, 90)}) — yatajaribiwa tena hatua ijayo.` });
      saveFailing = true;
    } else if (saveFailing) {
      saveFailing = false;
      blog("success", "💾 Persistence: mazungumzo yamehifadhiwa tena Appwrite.");
      bcast({ type: "system", text: "💾 Mazungumzo yamehifadhiwa tena Appwrite." });
    }
  };
  // R20: kuhifadhi kukishindwa kwa sababu ya MTANDAO → jaribu tena mtandao ukirudi (kila 15s), si "hatua ijayo" tu.
  // Mara 3 zikishindwa ilhali mtandao upo → kosa si la mtandao (Appwrite/ukubwa) — onyo la noteSave linabaki.
  const persist = async (status: string, title?: string) => {
    await persistOnce(status, title);
    for (let tries = 0; saveFailing && tries < 40 && !runner.stopRequested && !runner.pauseAbort?.signal.aborted; tries++) {
      if (await isOnline(true)) {
        if (tries >= 2) break;
        await new Promise((r) => setTimeout(r, 15_000));
      } else {
        await waitOnline((runner.pauseAbort ||= new AbortController()).signal, 15_000);
      }
      await persistOnce(status, title);
    }
  };
  const persistOnce = async (status: string, title?: string) => {
    try {
      if (!sessionId) {
        sessionId = await saveSession(runner.project.slice(0, 500), getPersistItems(), status, title);
        if (sessionId) {
          runner.sessionId = sessionId;
          bcast({ type: "system", text: `💾 Conversation imeundwa (id: ${sessionId.slice(0, 8)}...)` });
        }
        noteSave(!!sessionId);
      } else {
        noteSave(await updateSessionItems(sessionId, getPersistItems(), status, title));
      }
    } catch (e: any) { blog("error", `❌ Persistence: ${e?.message || e}`); }
  };

  // ===== R16.1 PAUSE GATE — Detach inasimamisha KABISA; kila wito wa LLM/search unapita hapa kwanza =====
  // Hali yote (zamu, mapendekezo, agrees, transcript) iko kwenye closure hii → Resume inaendelea pale pale.
  runner.pauseAbort ||= new AbortController();
  const gate = async (where: string): Promise<void> => {
    if (runner.stopRequested) throw new BoardStopped();
    if (runner.status !== "paused") return;
    blog("system", `⏸️ Board imesimama (${where}) — inasubiri Resume.`);
    await persist("paused");
    if (runner.status === "paused") {
      const stop = await new Promise<boolean>((res) => (runner.resumeWaiters ||= []).push(res));
      if (stop || runner.stopRequested) throw new BoardStopped();
    }
    blog("system", `▶️ Board imeendelea (${where}).`);
  };
  /** wito wowote unaoweza kukatwa na Detach: ukikatwa → subiri Resume → rudia wito uleule */
  const pausable = async <T,>(where: string, fn: (signal: AbortSignal) => Promise<T>): Promise<T> => {
    for (;;) {
      await gate(where);
      const sig = (runner.pauseAbort ||= new AbortController()).signal;
      try {
        return await fn(sig);
      } catch (e) {
        if (sig.aborted && (runner.status === "paused" || runner.stopRequested)) continue;
        throw e;
      }
    }
  };

  try {
    const pm = getAgent("pm")!;
    // R30 · PLAN MODE: hakuna awamu ya kuandika code nzima (sample code ndogo tu kama hoja) —
    // mwisho wa Board ni RIPOTI (Kiswahili) + MPANGO KAZI WA AGENT (Kiingereza) kwa computer-use agent.
    const planModeRun = runner.mode === "plan";
    // R16: title/agenda zinapitia Capacity Broker (client ya broker — model/key huchaguliwa kwa nafasi halisi)
    // R21: fast = njia ya haraka ya broker (Gemini Lite → Flash → Groq → XKiro …) kwa kazi zinazomsubirisha Mkuu
    const pmClient = (purpose: string, cls: WorkClass, fast = false) => {
      const c = brokerClient({ agentId: "pm", purpose, cls, priority: "live", fast }, (r, lane) => { const u = readUsage(r); if (u) recordUsage("pm", u, true, undefined, lane.provider); });
      // R16.1: Detach inakata wito huu pia; Resume inaurudia
      const create = (body: any) => pausable(`Optimus · ${purpose}`, (signal) => c.chat.completions.create(body, { signal }) as Promise<any>);
      return { chat: { completions: { create } } } as unknown as typeof c;
    };
    const transcript: { name: string; text: string; item?: number }[] = [];
    const allDeliverables: { itemIndex: number; itemText: string; writerName: string; code: string }[] = [];

    // Huondoa majina ya chapa/kampuni yanayoandikwa KWA HERUFI KUBWA na
    // hyphens (mfano "PROFESSOR-XMD-COMPANY") kutoka kwenye maandishi --
    // ngao ya ziada pale call ya LLM ya kutengeneza search query
    // ikishindwa na tunarudi kwenye fallback ya kideterministic.
    const stripBrandTokens = (text: string): string =>
      text
        .replace(/\b[A-Z][A-Z0-9]*(?:-[A-Z0-9]+){1,}\b/g, "")
        .replace(/\s+/g, " ")
        .trim();

    // [PATCH-XMD-V3-QUERY] Msaidizi wa fallback ya search-query (angalia chini):
    // huondoa sentensi za maelekezo ("do not ask me...", "decide everything
    // yourself"...) na kukata kwa mpaka wa neno (si katikati ya neno).
    const QUERY_FILLER_RE = new RegExp(
      [
        "i am intentionally giving you[^.!?]*",
        "full creative freedom",
        "do not ask me to choose[^.!?]*",
        "decide everything yourself",
        "sit down,?\\s*think deeply[^.!?]*",
        "make your own decisions[^.!?]*",
        "the final result should feel[^.!?]*",
        "you should also find[^.!?]*",
        "choose (the )?images? yourself[^.!?]*",
        "based on the experience you creat\\w*",
        "genuinely original",
        "generic \\w+ template",
        "as a professional \\w+ and \\w+",
      ].join("|"),
      "gi",
    );
    const QUERY_TRAILING_STOPWORD_RE = /\s+(a|an|the|and|or|for|to|of|in|on|at|by|with|from)$/i;
    const truncateQueryWords = (s: string, max: number): string => {
      let out = s;
      if (out.length > max) {
        const cut = out.slice(0, max);
        const lastSpace = cut.lastIndexOf(" ");
        out = (lastSpace > 20 ? cut.slice(0, lastSpace) : cut).trim();
      }
      let prev;
      do {
        prev = out;
        out = out.replace(QUERY_TRAILING_STOPWORD_RE, "").trim();
      } while (out !== prev);
      return out;
    };
    const buildFallbackQuery = (agentRole: string, itemItem: string): string => {
      let base = itemItem
        .replace(/^Execute the CEO-requested deliverable only:\s*/i, "")
        .replace(QUERY_FILLER_RE, " ")
        .replace(/\s+/g, " ")
        .trim();
      base = base.split(/(?<=[.!?])\s+/)[0] || base;
      base = truncateQueryWords(base, 90);
      const wordCount = base.split(/\s+/).filter(Boolean).length;
      const looksLikeInstruction =
        wordCount > 16 ||
        wordCount === 0 ||
        /\b(i am|you should|do not|please|must|decide|choose)\b/i.test(base);
      return looksLikeInstruction
        ? `${agentRole} best practices modern web design trends`
        : stripBrandTokens(`${agentRole} ${base}`);
    };

    // R16 — CAPACITY BROKER: call ndogo za "utility" (search query, mini-report, memory…) → brokerComplete.
    // Darasa: kwa ukubwa (LIGHT ndogo → Groq; NORMAL → XKiro) au kama mwitaji ametaja (background → Uno/Groq).
    const auxChatWithRotation = async (
      agentId: string,
      messages: Record<string, unknown>[],
      maxTokens: number,
      o?: LlmOpts,
    ): Promise<string> => {
      const r = await pausable(o?.purpose || "aux", (signal) => brokerComplete({
        agentId, purpose: o?.purpose || "board-aux", cls: o?.cls, priority: o?.cls === "background" ? "background" : "observer",
        messages: messages as never, maxOut: maxTokens, temperature: 0, signal,
      }));
      const u = readUsage({ usage: r.usage });
      if (u) recordUsage(agentId, u, true, undefined, r.lane?.provider);
      try { o?.onMeta?.({ model: r.lane.label, tokens: u?.total ?? null }); } catch {}
      return r.text;
    };

    /*
     * R16 — ZAMU YA AGENT (stream) kupitia Capacity Broker. Hakuna stage/mzunguko wa kila agent tena:
     * broker anampa lane yenye nafasi HALISI (TPM/quota/slot) kabla ya kutuma, anasubiri ≤8s ikibidi
     * (shimmer "anasubiri nafasi"), na kosa lolote la provider linazungushwa kimya kimya kwenda lane nyingine.
     * Jibu likikatika katikati (≥200 chars) → linaendelea kwenye lane nyingine bila kuanza upya.
     *   jibu la zamu → NORMAL (XKiro kwanza) · decide → LIGHT · ripoti/context kubwa (>30K au jibu >8K) → HEAVY (Uno → OpenRouter)
     */
    // R26: hali ya kila zamu (finish_reason, lane, kama bado imekatika) — lock gate na review zinaisoma
    const turnInfo = new Map<string, { finish: string | null; lane: string; lengthCut: boolean; continued: number }>();
    const cutTexts = new Set<string>(); // maandishi ya zamu zilizokatika — fallback ya AGREE haiyarudishi
    let authorityNote = ""; // R27: pendekezo lililotegemea kikao/mradi mwingine lilikataliwa → owners wanaambiwa zamu ijayo
    let contrastNoteS = "";
    let echoNote = ""; // R27: AGREE ya kunakili → owners wanaambiwa // R27: madai ya contrast yaliyokosewa (hesabu ya WCAG kwa code) → owners wanapewa thamani halisi
    const streamTurn = async (
      agent: typeof pm,
      messages: Record<string, unknown>[],
      msgId: string,
      answer: boolean,
      maxTok = 2000,
      o?: { cls?: WorkClass; priority?: Priority; critical?: boolean; effort?: "low" | "medium" | "high" },
    ): Promise<string> => {
      await gate(agent.name);
      // R20: agizo la <think> ni kwa lanes zisizo na reasoning channel tu (XKiro, Gemini) — tazama thinkDirective.ts
      const sent = withThinkDirective(messages) as Record<string, unknown>[];
      const baseFor = (l: Lease) => (wantsThinkTags(l.provider) ? sent : messages);
      let waitAct: string | null = null;
      const endWait = () => { if (waitAct) { activityEnd(waitAct); waitAct = null; } };
      const mkRun = () => brokerRun({
        agentId: agent.id, purpose: answer ? "board-turn" : "board-decide", cls: o?.cls ?? (answer ? "normal" : "light"),
        messages: sent as never, maxOut: maxTok, priority: o?.priority ?? "live", reasoning: true, critical: o?.critical, effort: o?.effort,
        onWait: (w) => {
          if (w && !waitAct) { waitAct = activityStart(`${agent.name} anasubiri nafasi…`); blog("info", `⏳ ${agent.name}: anasubiri nafasi ya lane (${w.cls})…`); }
          if (!w) endWait();
        },
      });
      let run = mkRun();
      const cutRe = /<think>[\s\S]*?<\/think>/gi;
      // R21: maneno ya kuanzia yaliyomo kwenye prompt ya zamu hii = kidokezo cha kurekebisha mwanzo uliokatika
      const lastUser = [...messages].reverse().find((m) => m?.role === "user");
      const headHints = typeof lastUser?.content === "string" ? (lastUser.content as string) : "";
      let prefix = ""; // maandishi yaliyokwisha kuonekana kabla stream haijakatika
      let prefixWhy: "network" | "length" = "network";
      let lengthHops = 0; // R26: mara ngapi jibu liliendelezwa baada ya finish_reason=length
      let empties = 0;
      let lastErr: unknown = null;
      // R28: lanes zote zilikuwa busy/transient (Gemini 503 "high demand" ×6) → Board nzima ilianguka ("Critical: 503").
      //      Sasa: zamu inasubiri lane ya kwanza ipoe, kisha run MPYA (lanes zote zinaruhusiwa tena) — hadi mizunguko 4.
      let lastKind = "";
      for (let patience = 0; ; patience++) {
      if (patience > 0) {
        const opens = brokerStatus().cooling.map((c: { until: number }) => c.until - Date.now()).filter((x: number) => x > 0);
        const cool = opens.length ? Math.min(...opens) : 0; // lane ya KWANZA kupoa
        const waitS = Math.round(Math.min(75_000, Math.max(20_000, cool + 2_000)) / 1000);
        blog("warning", `⏳ ${agent.name}: lanes zote ziko busy (${lastKind}) — inasubiri ${waitS}s kisha inajaribu tena (${patience}/4). Hakuna kinachopotea.`);
        const waitAct2 = activityStart(`${agent.name} anasubiri provider apoe…`);
        try {
          for (let t = 0; t < waitS; t++) {
            if (runner.stopRequested || runner.status === "paused") break;
            await new Promise((r) => setTimeout(r, 1000));
          }
        } finally { activityEnd(waitAct2); }
        await gate(agent.name);
        run = mkRun();
        lastKind = "";
      }

      for (let hop = 0; hop < 6; hop++) {
        let lease: Lease;
        try {
          lease = await run.next();
        } catch (e) {
          endWait();
          // R28: lanes zinapoa kwa muda mfupi (si quota ya siku) → subiri kwenye mzunguko wa patience, usiangushe Board
          if (isBrokerExhausted(e) && e.nextReadyAt && e.nextReadyAt - Date.now() < 300_000 && patience < 4) {
            lastErr = e; lastKind = "busy";
            break;
          }
          if (isBrokerExhausted(e)) {
            blog("warning", `⏸️ ${agent.name}: lanes zote za bure zimejaa (${e.cls}).`);
            throw new Error(capacityMessage(e.nextReadyAt));
          }
          throw e;
        }
        const msgs = prefix ? (continuationMessages(baseFor(lease) as never, prefix, prefixWhy) as Record<string, unknown>[]) : baseFor(lease);
        let finish: string | null = null; // R26: finish_reason ya provider (stop/length/…)

        let content = "";
        let tokensUsed = 0;
        let detectedThinkField = false;
        // call mpya ya agent yule yule (mf. search → jibu): mawazo yake yaanze aya mpya, yasiungane na ya call iliyopita
        let thinkOpened = false;
        const thinkSep = (text: string) => {
          if (thinkOpened) return text;
          thinkOpened = true;
          const prev = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
          const had = prev && prev.kind === "msg" ? prev.thinking || "" : "";
          return had.trim() && !/\n\s*\n\s*$/.test(had) ? `\n\n${text.replace(/^\s+/, "")}` : text;
        };
        const emitThinking = (raw: string) => {
          if (!raw) return;
          const text = thinkSep(raw);
          const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
          if (it && it.kind === "msg") it.thinking = `${it.thinking || ""}${text}`;
          bcast({ type: "think", id: msgId, text });
        };
        const resetLiveMessage = () => {
          const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
          if (it && it.kind === "msg") it.content = prefix;
          bcast({ type: "msg_reset", id: msgId });
          if (prefix) bcast({ type: "token", id: msgId, text: prefix });
        };
        const emitAnswer = (text: string) => {
          if (!answer || !text) return;
          const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
          if (it && it.kind === "msg") it.content = `${it.content || ""}${text}`;
          bcast({ type: "token", id: msgId, text });
        };
        // R21: mwanzo wa jibu unashikiliwa mpaka neno la kwanza likamilike → ".REE"/".D DECISION" hazionekani kwenye UI
        let headFix: HeadRepair | null = null;
        let reasonAcc = "";
        const firstDeltas: string[] = [];
        const head = makeHeadGate((t) => emitAnswer(t), prefix ? "" : headHints, (r) => { headFix = r; });
        if (prefix) head.flush(); // continuation: mwanzo ulikwisha onekana — hakuna cha kushikilia
        const parser = makeParser((t) => emitThinking(t), (t) => head.feed(t));
        // R16.1: Detach (pauseAbort) + provider aliyekwama (idle guard) — zote zinakata wito huu
        const pauseSig = (runner.pauseAbort ||= new AbortController()).signal;
        const guard = idleGuard(pauseSig);

        try {
          blog("api", `🔌 ${agent.name} → ${lease.label}${hop ? ` · hop ${hop + 1}` : ""}${prefix ? " · inaendelea" : ""}`);
          const s = await lease.client.chat.completions.create({
            model: lease.model,
            messages: msgs as never,
            temperature: 0.5,
            max_tokens: lease.maxTokens,
            stream: true,
            stream_options: { include_usage: true },
            ...lease.extraBody,
          } as never, { signal: guard.signal } as never) as unknown as AsyncIterable<any>;
          endWait();

          const meter = createLiveMeter(msgs, (u) =>
            bcast({ type: "usage_live", id: msgId, agentId: agent.id, prompt: u.prompt, completion: u.completion }),
          );
          let exactUsage: ExactUsage | null = null;
          // finally: timer ya meter isibaki hai stream ikitupa error katikati
          try {
            for await (const chunk of s) {
              guard.touch();
              // Usage frame (`choices: []`) — isomwe KABLA ya kuangalia delta.
              const frameUsage = readUsage(chunk);
              if (frameUsage) exactUsage = frameUsage;
              const fr = chunk.choices?.[0]?.finish_reason;
              if (typeof fr === "string" && fr) finish = fr;
              const d = chunk.choices?.[0]?.delta;
              if (!d) continue;
              // reasoning_content (XKiro/DeepSeek) · reasoning (Groq gpt-oss / OpenRouter)
              const rcRaw = (d as any).reasoning_content ?? (d as any).reasoning;
              if (typeof d.content === "string" && d.content && firstDeltas.length < 3) firstDeltas.push(JSON.stringify(d).slice(0, 160));
              if (typeof rcRaw === "string" && rcRaw) {
                reasonAcc += rcRaw;
                detectedThinkField = true;
                meter.add(rcRaw);
                emitThinking(rcRaw);
              }
              if (typeof d.content === "string" && d.content) {
                content += d.content;
                parser.feed(d.content);
                meter.add(d.content);
              }
            }
            // R16.1: SDK ya openai HUMEZA AbortError na kumaliza loop kimya kimya — jibu nusu lisikubaliwe kama kamili
            if (guard.signal.aborted) throw new Error("Request was aborted.");
          } catch (midErr) {
            parser.flush();
            head.flush();
            const u = exactUsage || meter.snapshot();
            if (u.total) recordUsage(agent.id, u, !!exactUsage, msgId, lease.provider);
            throw Object.assign(midErr instanceof Error ? midErr : new Error(String(midErr)), { partial: content });
          } finally {
            meter.stop();
          }
          parser.flush();
          head.flush();

          // Tokens zinatozwa hata attempt ikirudiwa — rekodi kila stream iliyokamilika.
          const finalUsage = exactUsage || meter.snapshot();
          tokensUsed = finalUsage.total;
          recordUsage(agent.id, finalUsage, !!exactUsage, msgId, lease.provider);

          if (!detectedThinkField && /<think/i.test(content)) {
            const parts = splitThinkBlocks(content);
            // parser tayari imetuma mawazo haya wakati wa stream — yasitumwe mara ya pili
            if (parts.think && !thinkOpened) emitThinking("\n" + parts.think);
            content = parts.answer;
          }
          // R21: mwanzo uliokatika na provider → neno kamili la kuanzia (maandishi yanayohifadhiwa + parser ya pendekezo)
          if (!prefix) {
            const rh = repairHead(content, headHints);
            if (rh.fixed) {
              content = rh.text;
              // gate haikuona kosa (nadra) → UI ilionyesha mwanzo uliokatika: tuma maandishi sahihi upya
              if (answer) {
                const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
                if (it && it.kind === "msg") it.content = content;
                bcast({ type: "msg_reset", id: msgId });
                bcast({ type: "token", id: msgId, text: content });
              }
            }
            const fx = rh.fixed ? rh : headFix;
            if (fx) blog("warning", `🩹 ${agent.name}: mwanzo wa jibu ulikatika kwenye ${lease.label} ("${fx.from}") → umerejeshwa kuwa "${fx.to}" · delta za kwanza: ${firstDeltas.join(" | ")}`);
          }
          // R27: continuation — marudio ya mwisho wa prefix yanaondolewa; UI inalinganishwa na maandishi ya mwisho
          const full = prefix ? joinContinuation(prefix, content) : content;
          if (prefix && answer && full !== `${prefix}${content}`) {
            const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
            if (it && it.kind === "msg") it.content = full;
            bcast({ type: "msg_reset", id: msgId });
            bcast({ type: "token", id: msgId, text: full });
          }
          // R21: provider alirudisha MAWAZO kama jibu (max_tokens iliisha ndani ya reasoning) → si jibu → lane nyingine
          const dumped = answer && detectedThinkField && isReasoningDump(content, reasonAcc);

          // Urefu wa jibu SI kipimo (mf. "APPROVED" ni jibu halali) — jibu TUPU tu ndilo kosa → lane nyingine.
          if (answer && (!hasActualResponse(full) || dumped)) {
            resetLiveMessage();
            if (empties++ < 2) {
              lease.fail(Object.assign(new Error(dumped ? "reasoning returned as content" : "empty response"), { status: 502 }));
              blog("warning", dumped
                ? `⚠️ ${agent.name}: ${lease.label} ilirudisha mawazo badala ya jibu (tokens ziliisha ndani ya reasoning) — lane nyingine...`
                : `⚠️ ${agent.name}: jibu tupu kutoka ${lease.label} — lane nyingine...`);
              continue;
            }
            lease.done();
            throw new Error(`${agent.name}: jibu tupu mara 3`);
          }
          lease.done();
          if (!exactUsage) blog("warning", `⚠️ ${agent.name}: provider hakurudisha usage frame — tokenizer imekadiria ${tokensUsed} tokens.`);
          // R26 (B1): kikomo cha tokens kilikata jibu → liendelezwe (mara 2) badala ya kukubaliwa nusu (A1 v1 / A3 v2 za R24)
          // R27 (ripoti Kipande 1 "…kuhusu-sisi.astro` ut"): stream ilifungwa BILA finish_reason katikati ya neno
          //      (Gemini ikiwa na msongamano) → ni jibu lililokatika, si kamili → linaendelezwa kama "length"
          const cutNoFinish = answer && !finish && hasActualResponse(full) && looksCut(full);
          if ((finish === "length" || cutNoFinish) && hasActualResponse(full) && lengthHops < 2 && hop < 5) {
            lengthHops++;
            prefix = trimForContinuation(full); // R27: bila neno lililokatika katikati
            prefixWhy = "length";
            if (prefix !== full) resetLiveMessage();
            blog("warning", cutNoFinish
              ? `✂️ ${agent.name}: stream ya ${lease.label} iliisha bila finish_reason katikati ya neno — linaendelezwa (${lengthHops}/2)…`
              : `✂️ ${agent.name}: jibu lilifika kikomo cha tokens kwenye ${lease.label} (max ${lease.maxTokens}) — linaendelezwa (${lengthHops}/2)…`);
            continue;
          }
          const lengthCut = finish === "length";
          turnInfo.set(msgId, { finish, lane: lease.label, lengthCut, continued: lengthHops });
          if (lengthCut) blog("error", `✂️ ${agent.name}: jibu bado limekatika baada ya kuendelezwa ${lengthHops} — halitafungwa kama uamuzi kamili.`);
          const cachedT = (exactUsage as ExactUsage | null)?.cached || 0;
          blog("success", `✅ ${agent.name} alimaliza kwa ${lease.label} (tokens: ${tokensUsed}${exactUsage ? "" : " ≈"}${finish && finish !== "stop" ? ` · finish ${finish}` : !finish && answer ? " · finish —" : ""}${cachedT ? ` · cache ${cachedT}` : ""}${lengthHops ? ` · imeendelezwa ${lengthHops}` : ""})`);
          return full;
        } catch (err0: any) {
          endWait();
          if (err0?.message?.endsWith("jibu tupu mara 3")) throw err0;
          // R16.1 — Detach katikati ya zamu: slot inaachiwa bila adhabu, maandishi yaliyoonekana yanabaki,
          // run() inasubiri Resume hapa hapa, kisha zamu ILEILE inaendelea (continuation) — si agenda nyingine.
          if (pauseSig.aborted && !guard.stalled && (runner.status === "paused" || runner.stopRequested)) {
            lease.done();
            const partialP = String(err0?.partial || "");
            const pv = partialP.replace(cutRe, "").replace(/<think>[\s\S]*$/i, "").trim();
            if (answer && pv.length >= 200) { prefix = `${prefix}${pv}`; prefixWhy = "network"; }
            else if (answer && partialP) resetLiveMessage();
            await gate(agent.name);
            hop--;
            continue;
          }
          // R20: MTANDAO WETU umekatika (si provider) → lane haiadhibiwi; Board inasubiri, kisha zamu ILEILE inaendelea
          // (maandishi yaliyoonekana yanabaki kama prefix). Stall ya stream (TCP inaganda) nayo inakaguliwa hapa.
          if ((isNetworkError(err0) || guard.stalled) && !(await isOnline(true))) {
            lease.release();
            blog("warning", `📡 ${agent.name}: mtandao umekatika (${lease.label}) — inasubiri mtandao urudi…`);
            const partialN = String(err0?.partial || "");
            const pvN = partialN.replace(cutRe, "").replace(/<think>[\s\S]*$/i, "").trim();
            if (answer && pvN.length >= 200) { prefix = `${prefix}${pvN}`; prefixWhy = "network"; }
            else if (answer && partialN) resetLiveMessage();
            await waitOnline(pauseSig);
            await gate(agent.name);
            blog("info", `📶 ${agent.name}: mtandao umerudi — zamu inaendelea${prefix ? " pale ilipokatika" : ""}.`);
            hop--;
            continue;
          }
          const err: any = guard.wrap(err0);
          lastErr = err;
          const v = lease.fail(err);
          const partial = String(err?.partial || "");
          const partialVisible = partial.replace(cutRe, "").replace(/<think>[\s\S]*$/i, "").trim();
          if (answer && partialVisible.length >= 200 && v.kind !== "fatal" && v.kind !== "aborted") {
            // stream ilikatika katikati: maandishi yaliyokwisha kuonekana yanabaki; lane nyingine inaendelea pale pale
            prefix = trimForContinuation(prefix ? joinContinuation(prefix, partialVisible) : partialVisible); // R27
            prefixWhy = "network";
            resetLiveMessage(); // R27: UI = prefix iliyosafishwa
            blog("warning", `🔌 ${agent.name}: jibu lilikatika (${lease.label}) — linaendelea kwenye lane nyingine bila kuanza upya.`);
            continue;
          }
          if (answer && partial) resetLiveMessage();
          if (!v.reroute) {
            blog("error", `❌ ${agent.name} → ${lease.label}: ${String(err?.message || err).slice(0, 160)}`);
            throw err;
          }
          blog("system", `🔁 ${agent.name}: ${lease.label} → ${v.kind} · lane nyingine`);
          if (v.kind === "busy" || v.kind === "transient" || v.kind === "minute") lastKind ||= v.kind; // lane hii itarudi baada ya kupoa
        } finally {
          guard.stop();
        }
      }
      if (patience < 4 && lastKind) continue; // R28: angalau lane moja ilikuwa na msongamano wa muda — subiri, jaribu tena
      throw lastErr instanceof Error ? lastErr : new Error(`${agent.name}: LLM haikupatikana`);
      }
    };

    const addMsg = (agentId: string): string => {
      const id = nid();
      runner.items.push({ kind: "msg", id, agentId, thinking: "", content: "", sources: [], done: false });
      bcast({ type: "msg_start", id, agentId });
      return id;
    };
    const setItemContent = (id: string, raw: string, sources: SearchResult[] = []) => {
      const it = runner.items.find((i) => i.id === id && i.kind === "msg");
      if (it) { it.content = raw; it.sources = sources; it.done = true; }
    };
    const addChip = (text: string) => {
      const id = nid();
      runner.items.push({ kind: "chip", id, text });
      bcast({ type: "system", text });
    };

    // ===== [PATCH-XMD-V2] ACTIVITY (shimmer) — process ya background, SI ujumbe wa chat =====
    const activityStart = (text: string): string => {
      const id = nid();
      bcast({ type: "activity", id, text, state: "start" } as unknown as BoardEvent);
      return id;
    };
    const activityEnd = (id: string) => {
      bcast({ type: "activity", id, state: "end" } as unknown as BoardEvent);
    };
    const withActivity = async <T>(text: string, fn: () => Promise<T>): Promise<T> => {
      const id = activityStart(text);
      try {
        return await fn();
      } finally {
        activityEnd(id);
      }
    };

    // ===== MINI-REPORT ya Optimus — logic imehamia src/lib/miniReport.ts (R10) =====
    // Inaandikwa MARA MOJA, mwisho wa agenda (baada ya observers/objection). Wakati wa LOCK
    // inahifadhiwa mini-report ya muda (provisionalMini) ili Resume iwe salama.
    const writeMiniReport = (a: MiniInput): Promise<MiniReport> =>
      writeMiniReportCore({ llm: auxChatWithRotation, withActivity, blog, thinkRe }, a);

    // ===== AGENT BRAIN (R10) — prompt ya kila wito + memory checkpoints/reflection/consolidation =====
    const brain = createBoardBrain({
      sessionId: () => runner.id,
      project: runner.project,
      label: () => sessionLabel(conversationTitle, runner.sessionId || runner.id), // R27: lebo ya KIKAO, si jina tu
      llm: auxChatWithRotation,
      blog: (type, msg) => blog(type, msg),
      emit: (e: BrainUiEvent) => bcast(e as unknown as BoardEvent),
    });
    const nowDate = () => new Date().toLocaleString("en-GB");

    // ===== [PATCH-XMD-V2] Vipande vya code kutoka LEDGER (approved_code), si memory =====
    const collectLockedPieces = async (): Promise<{ itemIndex: number; itemText: string; writerName: string; code: string; status?: string }[]> => {
      const out: { itemIndex: number; itemText: string; writerName: string; code: string; status?: string }[] = [];
      try {
        const fbrAll = await finalBoardResolution(runner.id);
        for (const e of fbrAll) {
          if (e.status !== "LOCKED" || !e.approved_code) continue;
          let parsed: Record<string, string> | null = null;
          try {
            const p = JSON.parse(e.approved_code);
            if (p && typeof p === "object" && !Array.isArray(p)) parsed = p as Record<string, string>;
          } catch {
            parsed = null;
          }
          if (parsed) {
            for (const [wid, code] of Object.entries(parsed)) {
              if (typeof code === "string" && code.trim()) {
                out.push({ itemIndex: e.agenda_index, itemText: e.agenda_item, writerName: getAgent(wid)?.name || wid, code, status: (e as { code_status?: string }).code_status }); // R28: hali ya code → kichwa cha faili
              }
            }
          } else if (e.approved_code.trim()) {
            blog("warning", `⚠️ Agenda ${e.agenda_index}: approved_code si JSON kamili (huenda ilikatwa) — inatumika kama ilivyo.`);
            out.push({ itemIndex: e.agenda_index, itemText: e.agenda_item, writerName: "Code", code: e.approved_code });
          }
        }
      } catch (err: any) {
        blog("warning", `⚠️ Imeshindwa kusoma code kutoka Ledger: ${String(err?.message || err).slice(0, 120)}`);
      }
      return out;
    };

    const isResume = Boolean(runner.agenda && runner.agenda.length > 0);
    let conversationTitle = runner.project.slice(0, 60);
    let agenda: AgendaItem[];

    if (isResume) {
      agenda = runner.agenda!;
      const existingTitle = runner.items.find((it) => it.kind === "title");
      if (existingTitle && existingTitle.kind === "title" && existingTitle.text) {
        conversationTitle = existingTitle.text;
      }
      addChip(`♻️ Board Room imeendelea — "${runner.project.slice(0, 80)}${runner.project.length > 80 ? "…" : ""}"`);
      blog("system", `♻️ Mjadala umeendelea kutoka pale ulipoishia (${agenda.length} vipengele).`);
      // R31-G4 · QUOTA-PASTE RESUME: quota ilirudi na CU pekee ndiyo inayokosekana →
      // awamu ya XMD Computer inaendelea MOJA KWA MOJA. Finale HAI-RUDIWI (kosa la test
      // 6ac3b624/6ac3c713: LLM/Appwrite hiccup kwenye validator/reports za re-run iliuua
      // resume ingawa CU ina snapshot yake ya workspace + chip yake ya hali).
      // (Kosa la 6ac3ce60: rebuilt runner hana `cu` bado — ensureCuState hapa, si baadaye)
      if (runner.computerPlanned && !runner.finale?.computer) ensureCuState(runner);
      if (runner.cu?.pausedOnce && !runner.cu?.done && runner.computerPlanned && cuEnabled()) {
        blog("system", "♻️ Quota ilirudi — XMD Computer inaendelea moja kwa moja (snapshot inarejesha workspace).");
        addChip("▶️ Quota ilirudi — XMD Computer inaendelea moja kwa moja kutoka pale ilipoishia.");
        void persist("running"); // doc ionekane YA SASA (si kwa tukio la kwanza la CU)
        runner.cuHooks = { persist, bcast, blog, addChip, recordUsage, usage, byProvider, title: conversationTitle };
        await startComputerPhase(runner, runner.cuHooks);
        if (runner.cu?.pausedOnce && !runner.cu?.done) {
          // quota ikisha TENA kabla ya kumaliza — pause mpya (doc "paused" + timer mpya vipo)
          runner.status = "error";
          bcast({ type: "done" });
          return;
        }
        const cuOk = !!runner.cu?.done;
        if (cuOk) runner.finale = { ...(runner.finale || {}), computer: true };
        await persist(cuOk ? "completed" : "finale_incomplete", conversationTitle);
        const total = Object.values(usage).reduce(
          (a, u) => ({ requests: a.requests + u.requests, tokens: a.tokens + u.tokens, prompt: a.prompt + u.prompt, completion: a.completion + u.completion }),
          { requests: 0, tokens: 0, prompt: 0, completion: 0 },
        );
        bcast({ type: "summary", usage: { ...usage, total } });
        runner.status = cuOk ? "completed" : "error";
        bcast({ type: "done" });
        return;
      }
    } else {
      addChip(`🏛️ Board Room — "${runner.project.slice(0, 80)}${runner.project.length > 80 ? "…" : ""}"`);
      blog("system", "🧠 Optimus anaunda jina la conversation...");
      try {
        const t = await pmClient("title", "light", true).chat.completions.create({
          model: pm.model,
          messages: [
            { role: "system", content: "Title generator. Output ONLY a short title (max 6 words, English). No quotes, no reasoning." },
            { role: "user", content: `Project: "${runner.project}"` },
          ],
          temperature: 0.3, max_tokens: 40,
        });
        const raw = (t.choices?.[0]?.message?.content || "").replace(thinkRe, "").replace(/["`'*#\n]/g, " ").trim();
        if (raw && raw.length <= 80 && !/thinking|analyze|process|heres/i.test(raw)) conversationTitle = raw;
      } catch {}
      bcast({ type: "title_done", title: conversationTitle });
      runner.items.push({ kind: "title", id: nid(), text: conversationTitle });
      await persist("title_created", conversationTitle);

      // ===== HATUA 1: AGENDA =====
      blog("system", "📋 Optimus anaunda agenda ya mradi...");
      addChip("📋 Optimus anaunda agenda ya mradi...");
      const agendaResult = await generateAgenda(pmClient("agenda", "normal", true), pm.model, runner.project);
      agenda = agendaResult.items;
      runner.agenda = agenda;
      if (agendaResult.skills) {
        blog("info", `🧠 skills.scope · Optimus · ${agendaResult.skills.scope || "—"}`);
        blog("info", `🧠 skills.agenda · Optimus · ${agendaResult.skills.agenda || "—"}`);
      }
      if (agendaResult.understanding) {
        addChip(`🧭 Optimus ameelewa: ${agendaResult.understanding}`);
        blog("info", `🧭 Uelewa wa Optimus: ${agendaResult.understanding}`);
      }
      addChip(`📋 Agenda (${agenda.length} vipengele): ${agenda.map((a) => a.item).join(" · ")}`);
      await persist("agenda_created", conversationTitle);
    }

    // ===== R26 · AWAMU 1: FACT SHEET — data rasmi ya brief inafungwa KWA CODE (chanzo kimoja cha ukweli) =====
    if (runner.facts === undefined || (runner.facts === null && !isResume)) {
      runner.facts = extractFactSheet(runner.project);
      if (!runner.facts && /\d/.test(runner.project) && /\b(bei|price|tzs|tsh|saa za|hours|anwani|address|simu|phone|whatsapp)\b/i.test(runner.project)) {
        // brief huru (bila muundo): LLM inasoma — lakini kila thamani lazima ionekane NENO KWA NENO kwenye brief (mergeLlmFacts)
        try {
          const raw = await auxChatWithRotation("pm", [
            { role: "system", content: "Extract ONLY facts literally written in the brief. Output JSON only: {\"name\":string|null,\"address\":string|null,\"hours\":[{\"days\":string,\"time\":\"HH:MM – HH:MM\"}],\"services\":[{\"name\":string,\"price\":string}],\"phone\":string|null}. Copy text exactly; never invent." },
            { role: "user", content: runner.project.slice(0, 12000) },
          ], 1200, { cls: "light", purpose: "fact-sheet" });
          const js = raw.replace(/<think>[\s\S]*?<\/think>/gi, "").match(/\{[\s\S]*\}/);
          if (js) runner.facts = mergeLlmFacts(null, JSON.parse(js[0]), runner.project);
        } catch (e: any) { blog("warning", `⚠️ Fact Sheet (LLM): ${String(e?.message || e).slice(0, 100)} — inaendelea bila data rasmi.`); }
      }
      if (runner.facts) {
        addChip(`📌 Data rasmi imefungwa kutoka brief: ${factSummary(runner.facts)} — kila script inakaguliwa dhidi yake kwa code (si kwa LLM).`);
        blog("success", `📌 Fact Sheet (${runner.facts.source}): ${factSummary(runner.facts)}`);
        await persist("facts_locked", conversationTitle);
      } else {
        blog("info", "📌 Brief haina DATA RASMI inayotambulika (bei/saa/anwani/simu) — Data Guard haitumiki kwa mradi huu.");
      }
    }
    // R29: majina ya vikao vingine (Appwrite) → gate ya mamlaka ya mradi wa zamani haitegemei memory recall pekee
    try {
      const metas = await listSessionMeta(60);
      rememberPastTitles(metas.filter((m) => m.id !== runner.sessionId).map((m) => m.title), conversationTitle);
    } catch { /* */ }
    const facts: FactSheet | null = runner.facts || null;
    const sysFiles = systemDataFiles(facts, runner.project);
    // R28: faili la data la agent likikubaliwa (thamani zote rasmi, muundo wa Board) → linakuwa toleo la marejeo kwa
    //      zamu/agenda zinazofuata (prompts, review, Data Guard) — muundo haurudishwi tena kwa {name, price} ya mfumo.
    const enforce = (text: string) => {
      const r = enforceDataFiles(text, sysFiles);
      for (const k of r.kept) {
        const f = sysFiles.find((d) => d.path === k.path);
        if (f && f.content !== k.content) { f.content = k.content; blog("info", `📐 ${k.path}: muundo wa Board umekubaliwa — thamani zimehakikiwa kwa code dhidi ya DATA RASMI.`); }
      }
      return r;
    };
    // saa za Kiswahili zinaruhusiwa TU kama Board ilifunga uamuzi huo waziwazi (R25: vinginevyo neno kwa neno)
    let swahiliHours = false;
    if (facts && isResume) {
      try { swahiliHours = (await finalBoardResolution(runner.id)).some((e) => e.status === "LOCKED" && swahiliHoursDecided(e.decision_summary || "")); } catch { /* */ }
      // R29: baada ya resume sysFiles hujengwa upya kutoka Fact Sheet → muundo wa Board uliokubaliwa ulipotea.
      //      Faili za data zilizomo kwenye code iliyoidhinishwa ya agenda zilizofungwa zinarejeshwa (thamani zinahakikiwa tena).
      try {
        const done = (await finalBoardResolution(runner.id)).filter((e) => e.status === "LOCKED" && e.approved_code).sort((a, b) => a.agenda_index - b.agenda_index);
        for (const e of done) {
          let codes: Record<string, string> = {};
          try { codes = JSON.parse(String(e.approved_code)); } catch { continue; }
          for (const c of Object.values(codes)) if (typeof c === "string" && /```json/i.test(c)) enforce(c);
        }
      } catch { /* */ }
    }
    const factsBlock = () => factSheetBlock(facts, { swahiliHoursLocked: swahiliHours });
    const guardOf = (text: string): GuardHit[] => guardText(text, facts, { swahiliHoursLocked: swahiliHours });

    // R30: MINI-REPORTS ziko kwenye collection yake (mini_reports — za Optimus). Ledger ya zamani (R16-R29)
    // inabaki fallback: maelezo yake ndani ya decision_detail. Pointer = ledger ya session mpya.
    const miniCache = new Map<number, string>();
    let minisMapPromise: Promise<Map<number, MiniReportDoc>> | null = null;
    const minisMap = () => (minisMapPromise ||= miniDetailsMap(runner.id));
    const miniDetailOf = async (e: { agenda_index: number; decision_detail?: string }): Promise<string> => {
      const c = miniCache.get(e.agenda_index);
      if (c) return c;
      const doc = (await minisMap()).get(e.agenda_index);
      if (doc?.detail) { miniCache.set(e.agenda_index, doc.detail); return doc.detail; }
      return isMiniPointer(e.decision_detail) ? "" : String(e.decision_detail || "");
    };

    // R10: agenda zilizotangulia zinaonekana kwa MINI-REPORT (sehemu ya "Uamuzi") + masharti yanayobebwa,
    // si "index. item → decision" fupi tu.
    const ledgerSummary = async (): Promise<string> => {
      const fbr = await finalBoardResolution(runner.id);
      if (!fbr.length) return "(bado hakuna decision iliyofungwa)";
      // R10: agenda 2 za karibu zinapata CONTEXT KAMILI ya mini-report (uamuzi, masharti, pingamizi,
      // sababu, yaliyobaki wazi, thamani halisi); za zamani — uamuzi + carried constraints (bajeti ya tokens).
      const sorted = fbr.sort((a, b) => a.agenda_index - b.agenda_index);
      return (
        await Promise.all(
          sorted.map(async (e, i) => {
            const recent = i >= sorted.length - 2 || e.status !== "LOCKED"; // R21: agenda OPEN inaonekana kamili (sababu halisi + pendekezo)
            const carried = String(e.carried_constraints || "").trim().slice(0, recent ? 900 : 450);
            if (recent) {
              const full = miniContext(await miniDetailOf(e), 2400) || String(e.decision_summary || "").slice(0, 1500);
              return `[Agenda ${e.agenda_index}: ${e.agenda_item}] (${e.status}) — Optimus mini-report:\n${full}${carried ? `\nCarried constraints (lazima ziheshimiwe):\n${carried}` : ""}`;
            }
            const uamuzi = miniDecisionSection(await miniDetailOf(e), 750) || String(e.decision_summary || "").slice(0, 750);
            return `[Agenda ${e.agenda_index}: ${e.agenda_item}] (${e.status})\nDecision (Optimus mini-report): ${uamuzi}${carried ? `\nCarried constraints:\n${carried}` : ""}`;
          }),
        )
      ).join("\n\n");
    };

    // ============================================================
    // UNIVERSAL RESEARCH HANDLER — owner discussion, tie-break, objection
    // Round ya kwanza kwa item: Appwrite-cache-first kisha engine (searchWeb).
    // Rounds zinazofuata: angalia local memory (itemSources) kwanza,
    // kisha engine moja kwa moja (searchWebDirect) — Appwrite haikaguliwi tena.
    // ============================================================
    function findInMemory(query: string, pool: SearchResult[]): SearchResult[] | null {
      const qWords = query.toLowerCase().split(/\s+/).filter((w) => w.length > 3);
      if (qWords.length === 0 || pool.length === 0) return null;
      const matches = pool.filter((r) => {
        const hay = `${r.title} ${r.content}`.toLowerCase();
        const hits = qWords.filter((w) => hay.includes(w)).length;
        return hits >= Math.ceil(qWords.length * 0.5);
      });
      return matches.length > 0 ? matches : null;
    }

    function evidenceLooksRelevant(
      itemText: string,
      results: SearchResult[]
    ): boolean {
      if (!results.length) return false;

      const stop = new Set([
        "current",
        "best",
        "practices",
        "implementation",
        "strategy",
        "model",
        "system",
        "design",
        "production",
        "architecture",
        "technical",
        "plan",
        "specification",
        "integration",
        "validation",
        "security",
        "users",
        "project",
        "using",
        "based",
      ]);

      const words = Array.from(
        new Set(
          itemText
            .toLowerCase()
            .replace(/[^a-z0-9+#.-]+/g, " ")
            .split(/\s+/)
            .filter((w) => w.length >= 5 && !stop.has(w))
        )
      );

      if (words.length === 0) return true;

      const haystack = results
        .map((r) => `${r.title} ${r.content}`.toLowerCase())
        .join("\n");

      const hits = words.filter((w) => haystack.includes(w)).length;

      const required = Math.min(
        2,
        Math.max(1, Math.ceil(words.length * 0.25))
      );

      return hits >= required;
    }

    // R11: vyanzo vyote vya Board (baada ya research-lookup curate) — kwa audit ya citations ya ripoti
    const boardSources: SearchResult[] = [];
    // R12: URL ileile haiingii mara mbili (ilisababisha "two children with the same key" kwenye UI)
    const pushUnique = (pool: SearchResult[], add: SearchResult[]) => {
      const have = new Set(pool.map((x) => x.url));
      for (const r of add) if (r?.url && !have.has(r.url)) { pool.push(r); have.add(r.url); }
    };

    async function handleResearchRequest(
      agent: { id: string; name: string },
      query: string,
      budget: Record<string, number>,
      itemSources: SearchResult[],
      hasSearchedItem: Record<string, boolean>
    ): Promise<void> {
      if (!(agent.id in budget)) budget[agent.id] = Number.POSITIVE_INFINITY;
      await gate(`${agent.name} · search`);

      const sid = addMsg(agent.id);

      if (hasSearchedItem[agent.id]) {
        blog("search", `🧠 ${agent.name} anaangalia memory ya mjadala huu kwanza (Appwrite tayari ilikaguliwa kwa item hii)...`);
        const mem = findInMemory(query, itemSources);
        if (mem) {
          blog("success", `✅ ${agent.name}: amepata kwenye memory — hahitaji search mpya.`);
          const memU = uniqueByUrl(mem);
          bcast({ type: "sources", id: sid, sources: memU });
          setItemContent(sid, `🧠 (memory) ${query}`, memU);
          bcast({ type: "msg_done", id: sid });
          return;
        }
        blog("warning", `❌ ${agent.name}: hakupata kwenye memory — anawasha search engine moja kwa moja.`);
        budget[agent.id]--;
        bcast({ type: "search", id: sid, query });
        try {
          const fwd = (e: any) => bcast(e as BoardEvent);
          const results = curateSources(await searchWebDirect(query, fwd, agent.name), agent.name, blog, boardSources);
          bcast({ type: "sources", id: sid, sources: results });
          setItemContent(sid, `🔍 ${query}`, results);
          pushUnique(itemSources, results);
        } catch {
          blog("warning", `⚠️ ${agent.name}: search failed`);
        }
        bcast({ type: "msg_done", id: sid });
        return;
      }

      hasSearchedItem[agent.id] = true;
      budget[agent.id]--;
      bcast({ type: "search", id: sid, query });
      try {
        const fwd = (e: any) => bcast(e as BoardEvent);
        const results = curateSources(await searchWeb(query, fwd, agent.name), agent.name, blog, boardSources);
        bcast({ type: "sources", id: sid, sources: results });
        setItemContent(sid, `🔍 ${query}`, results);
        pushUnique(itemSources, results);
      } catch {
        blog("warning", `⚠️ ${agent.name}: search failed`);
      }
      bcast({ type: "msg_done", id: sid });
    }

    // ===== HATUA 2-6: KILA AGENDA ITEM =====
    let resolvedIndices = new Set<number>();
    if (isResume) {
      // R16.1: Ledger ikishindwa kusomeka, listLedger inarudisha [] — zamani hilo lilirudisha mjadala agenda 1.
      // Sasa: Ledger + progress iliyohifadhiwa (doneIdx); vyote vikiwa tupu ilhali agenda zilikuwa zimeanza → simama, usianze upya.
      const alreadyResolved = await finalBoardResolution(runner.id);
      resolvedIndices = new Set([...alreadyResolved.map((e) => e.agenda_index), ...(runner.doneIdx || [])]);
      const reachedBefore = runner.items.some((it) => it.kind === "chip" && /^\s*🔒 LOCKED:|^\s*🟠 OPEN:/.test(String((it as { text?: string }).text || "")));
      if (resolvedIndices.size === 0 && reachedBefore) {
        const again = await finalBoardResolution(runner.id);
        again.forEach((e) => resolvedIndices.add(e.agenda_index));
        if (resolvedIndices.size === 0) {
          throw new Error("Ledger haisomeki sasa hivi — Resume imesimama ili mjadala usianze upya agenda 1. Jaribu Resume tena baada ya muda mfupi.");
        }
      }
      runner.doneIdx = [...resolvedIndices].sort((a, b) => a - b);
      // R18: agenda iliyofungwa (LOCKED) kabla server haijaanza upya lakini mini-report ya MWISHO haikuandikwa (Ledger bado
      // ina ya muda) → Optimus anaikamilisha SASA kutoka mjadala uliohifadhiwa, kabla agenda inayofuata haijaanza.
      for (const e of alreadyResolved) {
        // R20: pia mini-report ya FALLBACK (LLM ilishindwa wakati huo) inaandikwa upya
        // R30: chanzo cha ukaguzi ni mini_reports (collection) kwanza; ledger ya zamani = fallback
        const effDetail = await miniDetailOf(e);
        if (e.status !== "LOCKED" || !e.id || !needsMiniRedo(effDetail)) continue;
        const a = agenda.find((x) => x.index === e.agenda_index);
        if (!a) continue;
        await gate(`Mini-report A${a.index}`);
        const wasProvisional = /Mini-report ya muda/.test(effDetail);
        addChip(wasProvisional
          ? `🧾 Agenda ${a.index} ilifungwa bila mini-report ya mwisho (server ilianza upya) — Optimus anaikamilisha kabla ya kuendelea.`
          : `🧾 Mini-report ya Agenda ${a.index} ilikuwa fupi (fallback — LLM haikupatikana wakati huo) — Optimus anaiandika upya kutoka mjadala uliohifadhiwa.`);
        let writers: string[] = [];
        try { writers = Object.keys(JSON.parse(String(e.approved_code || "{}"))).map((id) => getAgent(id)?.name || id); } catch {}
        const fm = await writeMiniReport({
          agendaIndex: a.index,
          agendaItem: a.item,
          decision: String(e.decision_summary || ""),
          consensus: true,
          owners: a.owners.map((o) => getAgent(o)?.name || o),
          codeWriters: writers,
          talk: agendaTalk(runner.items as SavedItem[], a.index),
          observers: [],
          objection: undefined,
          priorTries: miniTries(effDetail), // R26 (E1): kikomo cha majaribio — si kila resume milele
        });
        // R30: kwanza collection (mini_reports) — kisha ledger inapata pointer; collection ikishindwa → ledger ya zamani
        const savedMini = await saveMiniReport({
          projectId: runner.id, sessionId: sessionId || runner.id, agendaIndex: a.index, agendaItem: a.item,
          status: "LOCKED", decisionSummary: String(e.decision_summary || "").slice(0, 4000),
          detail: fm.detail, carriedConstraints: fm.constraints,
        });
        const ok = await updateLedgerMini(e.id, savedMini
          ? { decision_detail: MINI_LEDGER_POINTER, carried_constraints: fm.constraints, trade_off: fm.tradeOff }
          : { decision_detail: fm.detail, carried_constraints: fm.constraints, trade_off: fm.tradeOff });
        if (savedMini) miniCache.set(a.index, fm.detail);
        else if (ok) e.decision_detail = fm.detail;
        blog(savedMini || ok ? "success" : "warning", savedMini || ok
          ? `🧾 Mini-report ya mwisho ya Agenda ${a.index} imekamilishwa baada ya resume (${fm.detail.length} chars${fm.llm ? "" : " · fallback"} · ${savedMini ? "mini_reports" : "ledger fallback"}).`
          : `⚠️ Mini-report ya Agenda ${a.index} haikuhifadhiwa baada ya resume — ile ya muda inabaki.`);
        await persist(`agenda_${a.index}_mini_resume`, conversationTitle);
      }
      // R11: checkpoints zilizokatika (Board ilisimama katikati ya memory checkpoints) → backfill kutoka Ledger
      await brain.onResume(
        (await Promise.all(
          alreadyResolved.map(async (e) => ({ index: e.agenda_index, item: e.agenda_item || agenda.find((a) => a.index === e.agenda_index)?.item || "", owners: agenda.find((a) => a.index === e.agenda_index)?.owners || [], mini: (await miniDetailOf(e)) || String(e.decision_summary || "") })),
        )).filter((r) => r.owners.length),
      );
    }

    for (const item of agenda) {
      if (isResume && resolvedIndices.has(item.index)) {
        blog("info", `♻️ Kipengele ${item.index}/${agenda.length} tayari kimeshughulikiwa — kinarukwa.`);
        continue;
      }
      await gate(`Agenda ${item.index}`);

      bcast({ type: "round", round: item.index, total: agenda.length });
      const ownerAgents = item.owners.map((o) => getAgent(o)!).filter(Boolean);
      const ownerNames = ownerAgents.map((a) => a.name).join(" + ");
      addChip(` Agenda ${item.index}/${agenda.length}: ${item.item} — owners: ${ownerNames}`);
      blog("system", `🎯 Agenda ${item.index}: ${item.item} | owners: ${ownerNames}`);
      authorityNote = ""; // R27: onyo la kikao kingine ni la agenda hii tu
      contrastNoteS = "";
      echoNote = "";

      const budget: Record<string, number> = {};
      ownerAgents.forEach((a) => (budget[a.id] = Number.POSITIVE_INFINITY));
      const hasSearchedItem: Record<string, boolean> = {};
      const itemSources: SearchResult[] = [];
      // subTalk = MJADALA WOTE wa agenda hii (owners, code, review, observers, objection) — chanzo cha mini-report
      const subTalk: { name: string; text: string; tag?: string }[] = [];
      let proposed = ""; let proposedBy = ""; const agrees = new Set<string>();
      let decision = "";
      // R10: washiriki (kwa memory checkpoints) + CLARIFY: @agent
      const participants: { id: string; role: string }[] = [];
      const joined = (id: string, role: string) => { if (!participants.some((x) => x.id === id)) participants.push({ id, role }); };
      let pendingClarify: ClarifyAsk | null = null;
      const observerNames = AGENTS.filter((a) => !item.owners.includes(a.id)).map((a) => a.name);
      const agendaCtx = { index: item.index, total: agenda.length, item: item.item };
      brain.state({ status: "running", phase: "discussion", agendaTotal: agenda.length, agendaIndex: item.index, agendaItem: item.item, owners: ownerAgents.map((a) => a.name), observers: observerNames, agendaStartTokens: boardTokens(), delib: undefined });

      // ========================================================
      // MANDATORY EVIDENCE GATE — BEFORE FIRST OWNER ANSWER
      // Every owner gets one evidence check per agenda item.
      // searchWeb() itself remains Appwrite-cache-first.
      // ========================================================
      const evidenceChecked = new Set<string>();
      const runMandatoryEvidenceGate = async (agent: typeof pm) => {
        if (evidenceChecked.has(agent.id)) return;
        await gate(`${agent.name} · evidence`);
        evidenceChecked.add(agent.id);

        // The mandatory gate counts as one real search for this owner/item.
        if (!(agent.id in budget)) budget[agent.id] = Number.POSITIVE_INFINITY;

        // ========================================================
        // SEARCH QUERY GENERATOR
        // IMPORTANT:
        // Never send the CEO request / agenda text directly to search.
        // Optimus creates a short knowledge-search query instead.
        // ========================================================
        let gateQuery = "";

        try {
          const queryPrompt = `Create ONE concise web search query for the knowledge/evidence needed for this agenda item.

Agenda item:
${item.item}

Agent expertise:
${agent.role}

RULES:
- Return ONLY the search query.
- Use 4-10 keywords or short phrases.
- Do NOT write a question.
- Do NOT use a question mark.
- Do NOT repeat the CEO request.
- Do NOT include the agent name.
- Do NOT include any brand name, company name, product name, or project name — including any proper noun that also appears in the agenda item or the CEO request below. Search for the GENERIC technical/industry topic only, as if this were for any company.
- Do NOT explain anything.
- Maximum 160 characters.
- Search for technical/industry knowledge, not the user's instructions.

CEO REQUEST (context only, to help you identify which proper nouns to exclude — do not search for this, do not include any of its names in the query):
${runner.project}`;

          const queryRaw = await auxChatWithRotation(
            "pm",
            [
              {
                role: "system",
                content: "You generate concise, generic technical search queries only. Never include the client's brand, company, or product name."
              },
              {
                role: "user",
                content: queryPrompt
              }
            ],
            120
          );

          gateQuery = queryRaw
            .replace(/[`"']/g, "")
            .replace(/\?/g, "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160);
        } catch (queryError: any) {
          blog(
            "warning",
            `⚠️ ${agent.name}: search-query generation failed — ${String(queryError?.message || queryError).slice(0, 120)}`
          );
        }

        // [PATCH-XMD-V3-QUERY] Final deterministic safety fallback.
        // Never fall back to item.item / CEO request. Strips instruction
        // boilerplate ("do not ask me...", "decide everything yourself"),
        // cuts at a sentence/word boundary (never mid-word), and if the
        // agenda item is one giant CEO-prompt dump (single-item agenda),
        // falls back to a fully generic role-based query instead of
        // leaking half the CEO prompt into the search engine.
        if (!gateQuery) {
          gateQuery = buildFallbackQuery(agent.role, item.item);
        }

        const sid = addMsg(agent.id);

        blog("search", `🧠 ${agent.name}: MANDATORY evidence gate → Appwrite semantic cache first.`);
        bcast({ type: "search", id: sid, query: gateQuery });

        try {
          const fwd = (e: any) => bcast(e as BoardEvent);
          let results = await searchWeb(
            gateQuery,
            fwd,
            agent.name
          );

          /*
           * Semantic similarity peke yake haitoshi.
           * Cache hit lazima pia ionekane relevant kwa agenda item.
           */
          if (
            results.length > 0 &&
            !evidenceLooksRelevant(item.item, results) &&
            budget[agent.id] > 0
          ) {
            blog(
              "warning",
              `⚠️ ${agent.name}: cache hit haionekani relevant kwa agenda hii — inafanya fresh verification search.`
            );

            budget[agent.id]--;

            const freshResults = await searchWebDirect(
              gateQuery,
              fwd,
              agent.name
            );

            if (freshResults.length > 0) {
              results = freshResults;
            }
          }

          results = curateSources(results, agent.name, blog, boardSources);

          bcast({
            type: "sources",
            id: sid,
            sources: results
          });

          setItemContent(
            sid,
            `🔎 Evidence check: ${gateQuery}`,
            results
          );

          pushUnique(itemSources, results);
          hasSearchedItem[agent.id] = true;

          blog(
            "success",
            `✅ ${agent.name}: mandatory evidence gate imekamilika — sources ${results.length}.`
          );
        } catch (err: any) {
          blog("warning", `⚠️ ${agent.name}: mandatory evidence gate imeshindwa — ${String(err?.message || err).slice(0, 120)}`);
        }

        bcast({ type: "msg_done", id: sid });
      };

      // ========================================================
      // OWNER DISCUSSION — R12: deliberation guard (anti-loop) + dawati la hati (READ_SOURCE)
      // ========================================================
      const delib = createDeliberation({ owners: ownerAgents.map((a) => ({ id: a.id, name: a.name })), chairId: "pm" });
      const desk = createSourceDesk({ blog, bcast, addMsg, setItemContent });
      const syncDelib = () => brain.state({ delib: { ...delib.snapshot(), docsRead: desk.count } });
      const HARD_TURNS = Math.min(MAX_TURNS, delib.maxTurns + ownerAgents.length + 2);
      for (let turn = 0; turn < HARD_TURNS && !decision && !delib.closed(); turn++) {
        // CLARIFY: @Owner inampa owner huyo zamu hii; CHAIR/VOTE (deliberation) inalazimisha mzungumzaji
        const forcedId = delib.forcedSpeaker();
        const agent: typeof pm = (forcedId && ownerAgents.find((a) => a.id === forcedId)) || pickSpeaker(ownerAgents, turn, pendingClarify);
        const clarifyForMe = clarifyNote(pendingClarify, agent);
        if (pendingClarify && pendingClarify.toId === agent.id) {
          blog("info", `🙋 CLARIFY: ${pendingClarify.from} → ${agent.name} anapewa zamu hii kujibu swali.`);
          pendingClarify = null;
        }
        joined(agent.id, "owner");

        // Mandatory evidence check happens BEFORE this owner's first answer.
        await runMandatoryEvidenceGate(agent);
        // R12: chanzo cha msingi kilichoonekana kwenye matokeo (mf. PDF rasmi) kinasomwa kamili
        await desk.autoRead(agent, itemSources, `${item.item} ${runner.project}`);
        delib.noteEvidence([...itemSources.map((x) => x.url), ...desk.docs.map((x) => x.url)]);
        syncDelib();

        const msgId = addMsg(agent.id);
        const ledger = await ledgerSummary();

        try {
          const ownerList = ownerAgents
            .filter((a) => a.id !== agent.id)
            .map((a) => a.name)
            .join(", ") || "hakuna";

          // R10: mjadala WOTE wa agenda hii (code imebanwa), si jumbe 3 zilizokatwa herufi 500
          const recentTalk = compactTranscript(subTalk, 9000);

          const evidenceContext = itemSources
            .slice(-8)
            .map((s) => `- ${s.title}\n  ${s.url}\n  ${s.content.slice(0, 450)}`)
            .join("\n");

          const hasProposal = Boolean(proposed);

          const prompt = `
PROJECT: "${runner.project}"

LOCKED LEDGER:
${ledger}

AGENDA ITEM:
${item.index}/${agenda.length} — ${item.item}

YOUR ROLE:
You are ${agent.name}.
You are an OWNER of this agenda item.

OTHER OWNERS:
${ownerList}

CURRENT PROPOSAL:
${hasProposal ? proposed : "(Hakuna proposal bado)"}

DISCUSSION OF THIS AGENDA ITEM SO FAR (full, oldest first):
${recentTalk || "(Hii ndiyo exchange ya kwanza.)"}
${clarifyForMe}
=== MANDATORY EVIDENCE AVAILABLE ===
${evidenceContext || "(Hakuna usable external evidence iliyorudi.)"}

${desk.block(item.item) || "(No document has been read in full yet — use READ_SOURCE: <url> on the most promising source above.)"}

Use this evidence when making factual claims. Do not invent sources, benchmarks, standards, or current facts.

=== OWNER DISCUSSION ===

Your job in this exchange:

1. Evaluate the current proposal if one exists.
2. Agree or push back with a concrete reason.
3. If the proposal is weak, ANY owner may create a better proposal.
4. A new PROPOSED DECISION automatically resets all previous approvals.
5. Never pretend to agree with a proposal that you have not actually evaluated.
6. Keep this exchange under 180 words.
7. Do not output internal reasoning, self-corrections, meta commentary, or tags.
8. NEVER output SEARCH: inside your visible answer.
9. If fresh external evidence is genuinely necessary, write only:
   RESEARCH_REQUEST: <query>
   as the LAST line. Plain keywords only (no site:, OR, filetype:, quotes). To read the FULL text of a listed
   source (web page or PDF) instead, write READ_SOURCE: <url> as the last line — prefer this over re-searching.
10. If proposing a decision, use exactly:
   PROPOSED DECISION: <decision>
   RATIONALE: <reason>
   TRADE-OFF: <trade-off>
   EVIDENCE: <evidence or source summary>
11. If accepting the CURRENT proposal, begin with:
   AGREE:
${facts ? `12. DATA RASMI: every price, service name, hour, address, phone or email you write must be copied EXACTLY from the DATA RASMI block of PROJECT above — never invent, round or convert (e.g. no Swahili-time conversion unless the Board explicitly decides it). The system verifies this by code.\n` : ""}${planModeRun ? `13. PLAN MODE (this Board): short illustrative code snippets (under 40 lines, e.g. a button, a CSS rule, a data file) are welcome as evidence for a decision. Do NOT write complete files or full page scripts — this Board's deliverable is LOCKED decisions plus a work plan; the implementation agent writes the code later.\n` : ""}
${authorityNote ? `${authorityNote}\n` : ""}${contrastNoteS ? `${contrastNoteS}\n` : ""}${echoNote ? `${echoNote}\n` : ""}IMPORTANT:
- Base every claim on THIS session only (brief, DATA RASMI, discussion above, evidence above). Never cite a past project or session as a reason, as "verified" or as "locked".
- Do not reopen already LOCKED decisions unless this agenda item directly depends on them.
- The goal is consensus, not endless discussion.

${DELIBERATION_RULES}
${delib.instructionFor(agent.id)}`;

          const content = await streamTurn(
            agent,
            [
              {
                role: "system",
                content: await brain.prompt(agent.id, {
                  phase: "discussion", role: "owner", agenda: agendaCtx, owners: ownerAgents.map((a) => a.name), observers: observerNames,
                  task: `${proposed ? `Current proposal: ${proposed.slice(0, 600)}` : ""}`, need: itemSources.length ? "" : "evidence missing", msgId, date: nowDate(),
                }),
              },
              {
                role: "user",
                content: prompt,
              },
            ],
            msgId,
            true,
            2400 // R26 (B1): 1100 ilikata maamuzi (A1 v1 / A3 v2 za R24) — thinking inakula bajeti pia
          );

          // Visible text must be clean.
          const clean = content
            .replace(thinkRe, "")
            .replace(/<think>[\s\S]*?<\/think>/gi, "")
            .replace(/^SEARCH:\s*.+$/gim, "")
            .replace(/^\s*Self-Correction.*$/gim, "")
            .replace(/^\s*Output Generation.*$/gim, "")
            .trim();
          const cleanT = tidyTurn(clean);

          // R20: signal ya READ_SOURCE haionekani kama jibu — mstari unaonyesha kitendo halisi (chanzo kinachosomwa)
          setItemContent(msgId, visibleTurn(cleanT));
          bcast({ type: "msg_done", id: msgId });

          subTalk.push({
            name: agent.name,
            text: cleanT,
            tag: "owner",
          });

          transcript.push({
            name: agent.name,
            text: cleanT,
            item: item.index,
          });

          // R10: SKILL_REQUEST + CLARIFY: @Owner (zamu inayofuata)
          brain.noteSignals(agent.id, clean, item.index, msgId);
          onOwnerTurn(clean, itemSources, agent.name, blog);
          const ask: ClarifyAsk | null = parseClarify(clean, agent, ownerAgents);
          if (ask) {
            pendingClarify = ask;
            blog("info", `🙋 ${agent.name} → CLARIFY @${ask.toName}: "${ask.question.slice(0, 90)}" — ${ask.toName} anapata zamu inayofuata.`);
          }

          // ------------------------------------------------------
          // Research request — kupitia universal handler
          // ------------------------------------------------------
          const rs = clean.match(/READ_SOURCE:\s*<?(https?:\/\/[^\s>]+)/i);
          if (rs) await desk.read(agent, rs[1]);
          const rq = clean.match(/RESEARCH_REQUEST:\s*(.+)/i);
          if (rq) {
            const q = rq[1].trim();
            const allow = delib.queryAllowed(agent.id, q);
            if (allow.ok) {
              delib.noteQuery(agent.id, q);
              await handleResearchRequest(agent, q, budget, itemSources, hasSearchedItem);
              await desk.autoRead(agent, itemSources, `${item.item} ${runner.project}`);
            } else {
              blog("warning", `🔁 ${agent.name}: RESEARCH_REQUEST imerukwa — ${allow.why}${allow.similarTo ? ` ("${allow.similarTo.slice(0, 70)}")` : ""}. Tumia READ_SOURCE au pendekeza uamuzi.`);
            }
          }
          delib.noteEvidence([...itemSources.map((x) => x.url), ...desk.docs.map((x) => x.url)]);

          // ------------------------------------------------------
          // Proposal parser
          // ------------------------------------------------------
          const isAgreeMessage = /(^|\n)\s*\*{0,2}\s*AGREE:\s*\*{0,2}/i.test(clean);

          // R20: pendekezo lililo sehemu ya MWISHO ya ujumbe (bila RATIONALE baadaye) sasa linakamatwa — `$` ya zamani
          // ilikuwa ndani ya `\n(?:…|$)` na ilihitaji newline kabla ya mwisho (A6 ya Mama Lishe: pendekezo la Optimus lilipotea)
          let pd = parseProposal(cleanT);
          // R26 (B2) LOCK GATE: pendekezo kutoka jibu lililobaki limekatika (finish_reason=length hata baada ya kuendelezwa)
          // halikubaliwi — uamuzi nusu haufungwi kamwe
          if (pd && turnInfo.get(msgId)?.lengthCut) {
            blog("warning", `✂️ ${agent.name}: PROPOSED DECISION ilikatika (kikomo cha tokens) — haikubaliwi kama pendekezo; owner ataombwa kuliandika kamili zamu ijayo.`);
            pd = null;
            cutTexts.add(cleanT);
          }
          // R27 LOCK GATE: pendekezo linalotegemea kikao/mradi MWINGINE ("previous project chose…", "verified token set",
          // "continuity") halikubaliwi — memory ni somo, si ushahidi wala uamuzi wa kikao hiki
          if (pd) {
            const ah = pastAuthorityHits(cleanT, pastProjectNames(conversationTitle, runner.project));
            if (ah.length) {
              blog("warning", `🧱 ${agent.name}: PROPOSED DECISION inategemea kikao/mradi mwingine (${ah.map((h) => `"${h}"`).join(", ")}) — haikubaliwi; owners wanaombwa pendekezo kutoka brief na ushahidi wa kikao hiki.`);
              authorityNote = pastAuthorityNote(ah, agent.name);
              pd = null;
              cutTexts.add(cleanT);
            } else authorityNote = "";
          }
          // R27 CONTRAST GUARD: uwiano wa contrast ulioandikwa na agent unahesabiwa upya kwa code (WCAG 2.x). Dai lisilo sahihi
          // (R27: "#7A263A on #FFF9F4 ~4.2:1 fails AA" — halisi 9.28:1) → pendekezo halikubaliwi + thamani halisi kwa owners
          {
            const ch = contrastHits(cleanT, proposed || "", ledger);
            if (ch.length) {
              blog("warning", `🎨 ${agent.name}: madai ${ch.length} ya contrast si sahihi (hesabu ya WCAG kwa code): ${contrastSummary(ch)}${pd ? " — PROPOSED DECISION haikubaliwi" : ""}`);
              contrastNoteS = contrastNote(ch, agent.name);
              if (pd) { pd = null; cutTexts.add(cleanT); }
            } else if (pd) contrastNoteS = "";
          }

          // R20 · fallback ya chair: AGREE ikifika bila pendekezo lililokamatwa, tafuta pendekezo la mwisho la owner kwenye agenda hii
          if (isAgreeMessage && !proposed) {
            for (let k = subTalk.length - 2; k >= 0; k--) {
              const t = subTalk[k];
              if (t.tag !== "owner" || /(^|\n)\s*\*{0,2}\s*AGREE:/i.test(t.text) || cutTexts.has(t.text)) continue;
              const prev = parseProposal(t.text);
              if (!prev) continue;
              const by = ownerAgents.find((a) => a.name === t.name);
              proposed = prev[1].trim();
              proposedBy = by?.id || agent.id;
              agrees.clear();
              if (by) agrees.add(by.id);
              blog("info", `🧷 ${agent.name} alikubali pendekezo la ${t.name} — pendekezo limerejeshwa kutoka mjadala (parser ya awali haikulikamata).`);
              break;
            }
          }

          if (pd && !isAgreeMessage) {
            proposed = pd[1].trim();
            proposedBy = agent.id;

          // MUHIMU:
          // proposal mpya = approvals zote za zamani zinafutwa
          agrees.clear();
          agrees.add(agent.id);
          }

          // ------------------------------------------------------
          // Approval
          // ------------------------------------------------------
          // R27: AGREE iliyonakili ujumbe wa mwenzake neno kwa neno haihesabiwi (si tathmini ya owner huyu)
          const echoed = proposed && isAgreeMessage ? echoOf(cleanT, subTalk.slice(0, -1), agent.name) : null;
          if (echoed) {
            blog("warning", `🪞 ${agent.name}: AGREE imenakili ujumbe wa ${echoed} neno kwa neno — haihesabiwi kama kura; atatoa tathmini yake mwenyewe.`);
            echoNote = `SYSTEM CHECK (automatic): ${agent.name}'s last AGREE copied ${echoed}'s message word for word and was NOT counted. Every AGREE must contain YOUR OWN evaluation from your role (what you checked and why it holds).`;
          } else if (
      proposed &&
      isAgreeMessage
    ) {
      agrees.add(agent.id);

      // FIX #1: fold conditions stated inside an "AGREE:" message into the
      // proposal text itself, so they are not lost when consensus locks.
      // FIX #3: an AGREE message that ALSO restates "PROPOSED DECISION:"
      // (agents often "formalize" what was already agreed this way) is
      // NOT a new proposal -- must not clear agrees, or consensus already
      // reached gets silently wiped every time someone paraphrases it.
      // isAgreeMessage above guards this, and also now tolerates markdown
      // bold ("**AGREE:**"), which previously failed to match at all.
      // R10 (audit): sharti TU — linasimama kwenye PROPOSED/UPDATED DECISION, RATIONALE, TRADE-OFF,
      // EVIDENCE, RESEARCH_REQUEST au signal nyingine; lina kikomo cha herufi 900.
      const __agreeBody = clean
        .replace(/^[\s\S]*?\*{0,2}\s*AGREE:\s*\*{0,2}\s*/i, "")
        .split(/\n\s*\*{0,2}(?:PROPOSED DECISION|UPDATED DECISION|RATIONALE|TRADE-OFF|EVIDENCE|RESEARCH_REQUEST|READ_SOURCE|CLARIFY|SKILL_REQUEST|WAIT|DISAGREE|DEFER|ASSUMPTION|CONTRADICTION|INSUFFICIENT_EVIDENCE)\*{0,2}\s*:/i)[0]
        .trim()
        .slice(0, 900);
      // idhini tupu ("I agree, great proposal") si sharti — lazima iwe na lugha ya sharti
      const __isCondition = /\b(condition|provided|as long as|only if|must|should|require[sd]?|ensure|add(?:ing)?|include|but|except|with the (?:following|addition)|on top|plus)\b/i.test(__agreeBody);
      if (__agreeBody.length > 30 && __isCondition) {
        proposed = `${proposed}\n\n[Condition added by ${agent.name}]: ${__agreeBody}`;
      }
    }

          // ------------------------------------------------------
          // Consensus
          // ------------------------------------------------------
          if (
            proposed &&
            ownerAgents.every((a) => agrees.has(a.id))
          ) {
            decision = proposed;
          }

          // ------------------------------------------------------
          // Extract supporting metadata
          // ------------------------------------------------------
          if (/RATIONALE:/i.test(clean)) {
            const rr = cleanT.match(
              /RATIONALE\*{0,2}\s*:\s*\*{0,2}\s*([\s\S]+?)(?=\n\s*\*{0,2}(?:TRADE-OFF|EVIDENCE)\*{0,2}\s*:|$)/i
            );
            if (rr) (item as any).__rationale = rr[1].trim();
          }

          if (/TRADE-OFF:/i.test(clean)) {
            const tt = cleanT.match(
              /TRADE-OFF\*{0,2}\s*:\s*\*{0,2}\s*([\s\S]+?)(?=\n\s*\*{0,2}EVIDENCE\*{0,2}\s*:|$)/i
            );
            if (tt) (item as any).__tradeoff = tt[1].trim();
          }

          if (/EVIDENCE:/i.test(clean)) {
            const ee = clean.match(
              /EVIDENCE:\s*([\s\S]+)$/i
            );
            if (ee) (item as any).__evidence = ee[1].trim();
          }

          // ------------------------------------------------------
          // R12: DELIBERATION GUARD — zamu hii imeongeza nini?
          // ------------------------------------------------------
          const v = delib.observe(agent.id, clean, { proposal: pd && !isAgreeMessage ? pd[1].trim() : undefined });
          const df = clean.match(/(?:^|\n)\s*\*{0,2}\s*DEFER:\s*([\s\S]{3,600})/i);
          if (df) (item as any).__deferred = df[1].trim();
          blog(
            v.progress ? "info" : "warning",
            `🧭 [delib] ${agent.name} · zamu ${delib.turns}/${delib.maxTurns} · overlap ${v.maxOverlap} · ${v.progress ? `✓ ${v.reasons.join(", ")}` : `hakuna jipya (stall ${v.stall})`}${v.action !== "continue" ? ` → ${v.action.toUpperCase()}` : ""}`,
          );
          if (v.action === "chair") {
            const chair = ownerAgents.find((a) => a.id === delib.forcedSpeaker())?.name || "Optimus";
            addChip(`⚖️ Mjadala umekwama (${v.stall >= 3 ? `zamu ${v.stall} bila jipya` : `kikomo cha zamu ${delib.maxTurns}`}) — ${chair} (mwenyekiti) anafunga: uamuzi bora uliopo au DEFER.`);
          } else if (v.action === "vote") {
            blog("info", `🗳️ Kura ya mwisho: ${ownerAgents.find((a) => a.id === delib.forcedSpeaker())?.name || "owner"} anapiga kura moja (AGREE/DISAGREE).`);
          } else if (v.action === "close") {
            blog("info", `🔚 [delib] Mjadala wa Agenda ${item.index} umefungwa — ${delib.closedReason}.`);
          }
          syncDelib();

        } catch (err: any) {
          bcast({
            type: "error",
            message: `${agent.name}: ${err?.message}`,
          });

          bcast({
            type: "msg_done",
            id: msgId,
          });
        }
      }

      // ========================================================
      // ===== CONSENSUS GATE — NO FORCED DECISION =====
            // ========================================================
      // ===== CONSENSUS GATE — NO FORCED DECISION =====
      const consensusReached =
        Boolean(decision) &&
        ownerAgents.length > 0 &&
        ownerAgents.every((a) => agrees.has(a.id));

      // R26 · DATA GUARD ya UAMUZI: uamuzi uliokubaliwa wenye bei/saa/namba zisizo rasmi hauingii Ledger hivyo hivyo —
      // marekebisho ya mfumo (thamani sahihi za DATA RASMI) yanaongezwa WAZI ndani ya uamuzi, na code inafuata DATA RASMI.
      if (consensusReached && facts) {
        if (swahiliHoursDecided(decision)) swahiliHours = true;
        const dh = guardText(decision, facts, { prose: true, swahiliHoursLocked: swahiliHours });
        if (dh.length) {
          decision = `${decision}\n\n[DATA RASMI — marekebisho ya mfumo]: ${dh.map((h) => `"${h.found}" → ${h.expected}`).join("; ")}`;
          addChip(`🛡️ Data Guard: uamuzi wa Agenda ${item.index} ulikuwa na ${guardSummary(dh)} — thamani sahihi za DATA RASMI zimeongezwa kwenye uamuzi.`);
          blog("warning", `🛡️ Data Guard (uamuzi A${item.index}): ${dh.map((h) => `"${h.found}"`).join(", ")}`);
        }
      }

      // R29 (Bakery A2): Board ililock schema ya menu.json iliyopangwa kwa makundi (JSON ndani ya pendekezo la Vextron),
      // lakini awamu ya code ilipewa orodha tupu ya mfumo {name, price} → code haikuweza kufuata uamuzi, reviewer akakataa mara 3.
      // Sasa: consensus ikifika, JSON ya faili la mfumo iliyopendekezwa na owner (thamani zimehakikiwa kwa code) inakuwa
      // toleo la marejeo KABLA ya code. Pendekezo lililokataliwa na guard (cutTexts) halitumiki.
      if (consensusReached && facts && sysFiles.length) {
        for (const t of subTalk) {
          if (t.tag !== "owner" || cutTexts.has(t.text) || !/```json/i.test(t.text)) continue;
          enforce(t.text);
        }
      }

      // ========================================================
      // ===== CODE-WRITING PHASE (kabla ya LOCK) — CODE MODE TU =====
      // Kwa vipengele vyenye requiresCode:true PEKEE. Kila code-writer
      // (frontend/backend/qa) anaandika script yake halisi, akijua
      // script za wenzake walizoandika kabla yake. Reviewer (mwanachama
      // asiye-code-writer wa item hii, au Optimus) anaikagua kabla
      // decision haijafungwa.
      // R30 · PLAN MODE: awamu hii IMERUKWA kabisa — hakuna script za
      // faili kamili wala review-fix loops; sample code ndogo ya hoja
      // imeshaonyeshwa kwenye mjadala wenyewe.
      // ========================================================
      let codeApproved = !item.requiresCode || !consensusReached || planModeRun;
      // R26: hali halisi ya code ya agenda hii (Ledger: code_status) — approved | unreviewed | data_errors | rejected
      let codeStatus = "";
      const codeByAgent: Record<string, string> = {};
      const codeWriters = ownerAgents.filter((a) =>
        ["frontend", "backend", "qa"].includes(a.id)
      );
      if (planModeRun && item.requiresCode) {
        blog("info", `📋 Plan mode · Agenda ${item.index}: awamu ya kuandika code IMERUKWA — maamuzi (LOCKED) + sample code za hoja ndogo tu; utekelezaji kamili upo kwenye Mpango Kazi wa Agent (HATUA 6.6).`);
      }
      const lastVisibleMsgId: Record<string, string> = {};

      if (consensusReached && item.requiresCode && !planModeRun) {
        if (codeWriters.length > 0) {
          const reviewer =
            ownerAgents.find((a) => !codeWriters.includes(a)) || pm;

          const isOpenFence = (text: string) =>
            (text.match(/```/g) || []).length % 2 === 1;
          const BT = String.fromCharCode(96);

          const lockedLedgerForCode = (await ledgerSummary()).slice(0, 6000);
          const runCodeWriters = async () => {
            for (const writer of codeWriters) {
              joined(writer.id, "code writer");
              let soFar = "";
              let msgId = "";
              for (let attempt = 0; attempt < 3; attempt++) {
                msgId = addMsg(writer.id);
                const othersCode = Object.entries(codeByAgent)
                  .filter(([id]) => id !== writer.id)
                  .map(([id, code]) => `--- Script ya ${getAgent(id)?.name || id} ---\n${code}`)
                  .join("\n\n");

                const prompt = `${facts ? `${factsBlock()}\n${dataFilesBlock(sysFiles)}\n\n` : ""}
LOCKED DECISION (karibu kufungwa):
${decision}

LOCKED LEDGER — stack, rangi na masharti ya agenda zilizotangulia (LAZIMA uyafuate, usibadilishe stack iliyofungwa):
${lockedLedgerForCode}

AGENDA ITEM:
${item.item}

YOUR ROLE:
You are ${writer.name} (${writer.role}). Write the ${writer.id === "frontend" ? "FRONTEND" : writer.id === "backend" ? "BACKEND" : "QA/test"} script for this decision, in a single fenced code block with the correct language tag.

SCRIPT ZA WENZAKO ZILIZOKWISHA-ANDIKWA (soma ili usilete mkanganyiko, script yako iendane nazo):
${othersCode || "(Hakuna mwenzako ameandika bado.)"}

${attempt > 0 ? `SCRIPT YAKO MWENYEWE ULIYOANZA (ENDELEA PALE ULIPOISHIA, USIRUDIE ulichokwisha andika, kamilisha fence ya code na ${BT}${BT}${BT} mwishoni):\n${soFar}` : ""}

RULES:
- Andika code KAMILI, halisi, inayofanya kazi -- si maelezo, si pseudocode.
- Code lazima ifuate KABISA kila kilichokubaliwa kwenye decision hapo juu -- hakuna tofauti hata moja.
- Tumia fenced code block moja (${BT}${BT}${BT}language ... ${BT}${BT}${BT}) yenye lugha sahihi.
- Usiandike maelezo marefu ya nje ya code block -- sentensi 1-2 tu kabla ya code inatosha.
- Weka njia ya faili kama comment kwenye mstari wa KWANZA wa code (mf. \`// src/components/X.astro\`) — script ya mwisho inakusanywa kwa njia hizo.${facts ? "\n- DATA RASMI hapo juu ndiyo pekee: bei, huduma, saa, anwani, simu, barua pepe — nakili neno kwa neno au import faili za data za mfumo. Mfumo unakagua kwa code; kosa lolote = REJECT ya moja kwa moja." : ""}
`;

                const content = await streamTurn(
                  writer,
                  [
                    { role: "system", content: await brain.prompt(writer.id, { phase: "code", role: "code writer", agenda: agendaCtx, task: decision.slice(0, 800), msgId, date: nowDate() }) },
                    { role: "user", content: prompt },
                  ],
                  msgId,
                  true,
                  20000
                );

                const clean = content
                  .replace(thinkRe, "")
                  .replace(/<think>[\s\S]*?<\/think>/gi, "")
                  .trim();

                setItemContent(msgId, clean);
                bcast({ type: "msg_done", id: msgId });

                subTalk.push({ name: writer.name, text: clean, tag: "code" });
                transcript.push({ name: writer.name, text: clean, item: item.index });

                soFar = attempt > 0 ? `${soFar}\n${clean}` : clean;

                if (!isOpenFence(soFar) && soFar.includes("```")) {
                  if (hasRealCode(soFar)) break;
                  // R10 (audit): fence imefungwa lakini hakuna code halisi → andika upya (si "endelea")
                  blog("warning", `⚠️ ${writer.name}: script imefika bila code halisi (fence tupu) — anaandika upya (${attempt + 1}/3).`);
                  soFar = "";
                  continue;
                }

                blog("info", `♻️ ${writer.name}: script haijakamilika -- anaendelea pale alipoishia (${attempt + 1}/3).`);
              }
              // R26 (D2): toleo KAMILI moja kwa kila faili (majaribio ya kuanza upya hayaunganishwi) + faili za data za mfumo
              const norm = normalizeDeliverable(soFar);
              if (norm.changed) blog("info", `🧩 ${writer.name}: deliverable imesafishwa — toleo kamili moja kwa kila faili${norm.incomplete.length ? ` · ⚠️ bado haijakamilika: ${norm.incomplete.join(", ")}` : ""}.`);
              const enf = enforce(norm.text);
              if (enf.replaced.length) blog("success", `🔒 ${writer.name}: ${enf.replaced.join(", ")} imeandikwa na mfumo kutoka DATA RASMI (toleo la agent limebadilishwa).`);
              codeByAgent[writer.id] = enf.text;
              lastVisibleMsgId[writer.id] = msgId;
            }
          };

          // ========================================================
          // MAREKEBISHO BAADA YA OBJECTION/REJECT -- SIYO KUANDIKA
          // SCRIPT NZIMA UPYA. Writer anatoa PATCH (SEARCH/REPLACE),
          // mfumo unaitumia kwenye script iliyopo, ujumbe wa zamani
          // (script kamili) unadissolve kuwa alama fupi -- hii
          // inapunguza token, ukubwa unaokwenda Appwrite, na
          // inaboresha usahihi kwa sababu writer haandiki upya
          // kila kitu, ni kipande tu kilichoathirika.
          // ========================================================


          await runCodeWriters();

          // R27: `onlyIds` — fix ya Data Guard inakwenda kwa mwandishi mwenye kosa TU (R27 A2: Megatron alipewa kosa la anwani la
          // Vextron → patch 3 zilizoshindwa bure)
          const fixWith = (note: string, onlyIds?: Set<string>) => applyReviewFixes({
            decision,
            itemText: item.item,
            reviewNote: facts ? `${note}\n\n${factsBlock()}\n${dataFilesBlock(sysFiles)}\n(Data files are the ground truth for file/field names — if a review comment asks for a field or file that does not exist above, keep the existing correct one.)` : note,
            itemIndex: item.index,
            codeWriters: onlyIds ? codeWriters.filter((w) => onlyIds.has(w.id)) : codeWriters,
            codeByAgent,
            lastVisibleMsgId,
            addMsg,
            streamTurn,
            setItemContent,
            bcast,
            blog,
            subTalk,
            transcript,
            systemFor: (w) => brain.prompt(w.id, { phase: "fix", role: "code writer (fix)", agenda: agendaCtx, task: decision.slice(0, 600) || item.item, date: nowDate() }),
          });
          // baada ya fix: toleo kamili moja + faili za data za mfumo tena (fix haiwezi kurudisha bei za kubuni kwenye services.json)
          const reEnforce = () => {
            for (const w of codeWriters) {
              const c = codeByAgent[w.id];
              if (!c) continue;
              codeByAgent[w.id] = enforce(normalizeDeliverable(c).text).text;
            }
          };
          // R28: + marejeo ya field yasiyokuwepo kwenye faili za data (configData.hours wakati config.json haina hours)
          const guardAll = () => Object.entries(codeByAgent).flatMap(([id, c]) => [
            ...guardOf(c),
            ...dataRefHits(c, sysFiles).map((h): GuardHit => ({ kind: "sehemu", found: h.ref, expected: `${h.file} ina keys: ${h.keys.join(", ")}${/hours/.test(h.ref) && !/hours\.json/.test(h.file) ? " — saa ziko kwenye hours.json" : ""}` })),
          ].map((h) => ({ ...h, who: getAgent(id)?.name || id, whoId: id })));
          let guardFixes = 0; // R27: marekebisho ya Data Guard (≤2) HAYATUMII rounds za review — review ya LLM inafanyika Guard ikipita
          let reviewed = false; // R27: review ya LLM ilifanyika kweli? (bila review → "unreviewed", si "rejected")
          let unreviewed = false;

          // R28: round ya 3 = HUKUMU YA MWISHO tu (bila fix) — marekebisho ya mwisho hayaachwi bila kukaguliwa
          for (let round = 0; round < 3 && !codeApproved; round++) {
            // R26 · DATA GUARD KWANZA — ukaguzi wa code dhidi ya DATA RASMI (bila LLM, hauwezi kukosea kwa kubahatisha)
            const gh = guardAll();
            if (gh.length && guardFixes < 2) {
              guardFixes++;
              addChip(`🛡️ Data Guard: ${guardSummary(gh)} — script inarudishwa kwa marekebisho moja kwa moja (${guardFixes}/2).`);
              blog("warning", `🛡️ Data Guard · Agenda ${item.index} · ${gh.length} kosa: ${gh.slice(0, 4).map((h) => `${h.who}: "${h.found}" → ${h.expected.slice(0, 50)}`).join(" · ")}`);
              await fixWith(guardRejectNote(gh), new Set(gh.map((h) => h.whoId)));
              reEnforce();
              round--; // R27: si round ya review
              continue;
            }
            if (gh.length) break; // bado kuna makosa baada ya marekebisho 2 → data_errors (ukaguzi wa mwisho hapa chini)
            const rid = addMsg(reviewer.id);
            const allCode = Object.entries(codeByAgent)
              .map(([id, code]) => `--- Script ya ${getAgent(id)?.name || id} ---\n${code}`)
              .join("\n\n");
            // R11: webapp-testing STATIC PROBE + condition-based waiting (automatic facts)
            const probe = reviewFacts(allCode, reviewer.name, blog);

            // R29 (Bakery A2/A3): reviewer alijipinga kati ya raundi (A2: "lazima flexbox" → "flexbox haijaidhinishwa";
            // A3: "tumia kahawia" → "lazima kijani kama Ledger") → code writer anafukuzia maagizo yanayopingana, code inakataliwa.
            // Sasa: maagizo ya review za awali za agenda hii yanaonyeshwa + sheria ya uthabiti (Ledger inashinda).
            const prevReviews = subTalk.filter((t) => t.tag === "code review" && /^\s*REJECT/i.test(t.text)).map((t, k) => `Round ${k + 1} (${t.name}): ${t.text.replace(/\s+/g, " ").slice(0, 600)}`);
            const consistency = prevReviews.length
              ? `\nYOUR EARLIER REVIEW DEMANDS ON THIS AGENDA:\n${prevReviews.join("\n")}\nCONSISTENCY RULE: do not demand the opposite of an earlier demand. If an earlier demand contradicted the LOCKED DECISION, the LOCKED DECISION wins — drop that demand (say "earlier demand withdrawn") instead of rejecting the fix. Every REJECT point must quote the exact words of the LOCKED DECISION (or DATA RASMI) it violates; a point you cannot quote is a preference, not a mismatch — leave it out.\n`
              : `\nEvery REJECT point must quote the exact words of the LOCKED DECISION (or DATA RASMI) it violates; a point you cannot quote is a preference, not a mismatch — leave it out.\n`;
            const reviewPrompt = `${facts ? `${factsBlock()}\n${dataFilesBlock(sysFiles)}\nDATA GUARD (code check against DATA RASMI + the data files above): PASSED — prices, hours, phone, email, address and every data-file field the scripts read exist and match.\nDATA FILES RULE: the data files above are the ground truth for file names and field names. If the LOCKED DECISION names a different file or field for the same data (e.g. "hours from config.json"), the scripts must follow the data files — never reject for that, and never ask for a field that does not exist in them.\n\n` : ""}
LOCKED DECISION (karibu kufungwa):
${decision}

AGENDA ITEM:
${item.item}

SCRIPTS ZILIZOANDIKWA:
${allCode}
${probe.text ? `\n${probe.text}\n` : ""}${consistency}
YOUR ROLE:
You are ${reviewer.name}, ${reviewer.role}. Check whether these scripts, TOGETHER, faithfully implement EVERY detail of the LOCKED DECISION above -- colors, behavior, structure, naming -- with no mismatch.

If they match completely, output exactly:
APPROVE

If ANY mismatch exists, output exactly:
REJECT: <concrete list of what must change>

Your FIRST line must be APPROVE or REJECT: … Keep the answer under 150 words.
`;
            const reviewMsgs: Record<string, unknown>[] = [
              { role: "system", content: await brain.prompt(reviewer.id, { phase: "review", role: "code reviewer", agenda: agendaCtx, task: decision.slice(0, 800), msgId: rid, date: nowDate() }) },
              { role: "user", content: reviewPrompt },
            ];
            // R26 (B1): 600 ilikata reviews 8 za R24 kabla ya hukumu — 2000 + reasoning_effort=low kwa Gemini
            const reviewContent = await streamTurn(reviewer, reviewMsgs, rid, true, 2000, { effort: "low" });

            let cleanReview = reviewContent
              .replace(thinkRe, "")
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .trim();

            // R29 (Bakery A5): review ilidai "locked Ledger (Gereji/Saluni) … 48x48px" — mamlaka ya mradi wa zamani ikaingia
            // kwenye fix, mini-report na ripoti. Sasa hoja hizo zinaondolewa kabla ya kufika kwa mwandishi/mini-report.
            {
              const sp = stripPastAuthority(cleanReview, pastProjectNames(conversationTitle, runner.project));
              if (sp.removed.length) {
                blog("warning", `🧭 ${reviewer.name}: hoja za review zilizotegemea mradi wa zamani zimeondolewa (${sp.removed.join(", ")}).`);
                cleanReview = /^\s*REJECT:?\s*$/i.test(sp.text.trim()) ? "APPROVE" : sp.text;
              }
            }
            setItemContent(rid, cleanReview);
            bcast({ type: "msg_done", id: rid });
            subTalk.push({ name: reviewer.name, text: cleanReview, tag: "code review" });
            transcript.push({ name: reviewer.name, text: cleanReview, item: item.index });
            joined(reviewer.id, "code reviewer");

            onReviewVerdict(cleanReview, reviewer.name, probe.openFindings, blog);
            let v = reviewVerdict(cleanReview);
            reviewed = true;
            if (v.verdict === "none") {
              // R26 (D3): hakuna hukumu ≠ REJECT — jaribio moja tu la kuomba hukumu (jibu fupi), bila fix call
              blog("warning", `🔎 ${reviewer.name}: review haikuwa na hukumu (APPROVE/REJECT) — anaombwa hukumu tu…`);
              const rid2 = addMsg(reviewer.id);
              try {
                const again = await streamTurn(reviewer, [...reviewMsgs, { role: "assistant", content: cleanReview.slice(0, 1500) }, { role: "user", content: "Give your verdict now. First line exactly APPROVE, or REJECT: <concrete list>. Nothing else." }], rid2, true, 800, { effort: "low" });
                const a2 = again.replace(thinkRe, "").replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
                setItemContent(rid2, a2);
                subTalk.push({ name: reviewer.name, text: a2, tag: "code review" });
                transcript.push({ name: reviewer.name, text: a2, item: item.index });
                v = reviewVerdict(a2);
              } catch (e: any) {
                blog("warning", `🔎 ${reviewer.name}: ombi la hukumu limeshindwa — ${String(e?.message || e).slice(0, 90)}`);
              }
              bcast({ type: "msg_done", id: rid2 });
            }
            if (v.verdict === "approve") {
              codeApproved = true;
              blog("success", `✅ ${reviewer.name}: script zimekaguliwa na kukubaliwa kwa "${item.item}".`);
            } else if (v.verdict === "reject") {
              if (round < 2) {
                blog("warning", `🛠️ ${reviewer.name}: script imerudishwa kwa marekebisho — round ${round + 1}/2.`);
                await fixWith(v.note || cleanReview);
                reEnforce();
              } else {
                blog("warning", `🛠️ ${reviewer.name}: hukumu ya mwisho (baada ya marekebisho 2) — bado REJECT.`);
              }
            } else {
              unreviewed = true;
              addChip(`🔎 Agenda ${item.index}: script HAIKUKAGULIWA — ${reviewer.name} hakutoa hukumu mara mbili (haihesabiwi kama REJECT; hakuna marekebisho ya kubahatisha).`);
              break;
            }
          }

          // R26: ukaguzi wa mwisho wa data (baada ya fix ya mwisho ambayo haikukaguliwa tena)
          const finalHits = guardAll();
          if (finalHits.length) {
            codeApproved = false;
            addChip(`⚠️ Data Guard: script ya Agenda ${item.index} bado ina tofauti ${finalHits.length} na DATA RASMI (${guardSummary(finalHits)}) — zitaandikwa kwenye ripoti.`);
            blog("error", `🛡️ Data Guard · Agenda ${item.index}: bado ${finalHits.length} — ${finalHits.slice(0, 4).map((h) => `"${h.found}"`).join(", ")}`);
          }
          codeStatus = codeApproved ? "approved" : finalHits.length ? "data_errors" : unreviewed || !reviewed ? "unreviewed" : "rejected";
          if (!codeApproved) {
            blog("warning", `⚠️ Script ya "${item.item}" haijapitishwa (${codeStatus}) -- inaendelea kama ilivyo (angalia logs).`);
          }

          // Deliverable ya mwisho, safi, kwa kila code-writer -- hii ndiyo
          // itakayonaswa na collectDeliverables() kwenye ripoti.
          for (const writer of codeWriters) {
            const finalId = addMsg(writer.id);
            const code = codeByAgent[writer.id] || "";
            // [PATCH-XMD-V2] allDeliverables.push imeondolewa hapa — inaingia mwishoni mwa agenda, BAADA ya objection phase.
            setItemContent(finalId, `**Deliverable ya mwisho — ${item.item}:**\n\n${code}`);
            bcast({ type: "msg_done", id: finalId });
          }
        }
      }

// ===== HATUA 5: LOCK — mini-report ya MUDA (bila LLM) ili Resume iwe salama =====
      // R10: mini-report KAMILI inaandikwa MWISHO wa agenda (baada ya observers wote SILENT au objection
      // kutatuliwa) — angalia "HATUA 5B" chini. Hapa hakuna wito wa LLM.
      // R21: agenda OPEN (si DEFER) → rekodi ya ukweli: sababu halisi, pendekezo la mwisho mezani, nani alikubali
      const openNote = !consensusReached && !(item as any).__deferred
        ? openRecord({
            reason: delib.closedReason || "hakuna consensus ya kutosha",
            proposal: cleanDecision(proposed || ""),
            proposedBy: proposedBy ? getAgent(proposedBy)?.name || proposedBy : undefined,
            owners: ownerAgents.map((a) => a.name),
            agreed: ownerAgents.filter((a) => agrees.has(a.id)).map((a) => a.name),
          })
        : "";
      const mini = provisionalMini({ agendaIndex: item.index, agendaItem: item.item, decision, consensus: consensusReached }, openNote);
      const __lockAct = activityStart("Optimus anafunga agenda kwenye Ledger…");
            const entryId = await saveLedgerEntry({
        session_id: runner.id,
        project_id: runner.id,
        agenda_index: item.index,
        agenda_item: item.item,
        status: consensusReached
          ? "LOCKED"
          : "OBJECTED_OPEN",
        decision_summary:
          (decision || ((item as any).__deferred ? `DEFERRED — ${(item as any).__deferred}` : `UNRESOLVED — hakuna consensus ya kutosha${delib.closedReason ? ` (${delib.closedReason})` : ""}`)).slice(0, 4000),
        // R30: mini-report HAIPATI tena kwenye ledger (ni ya Optimus — collection yake); pointer tu. Fallback hapa chini.
        decision_detail: MINI_LEDGER_POINTER,
        carried_constraints: mini.constraints,
        approved_code: Object.keys(codeByAgent).length > 0 ? JSON.stringify(codeByAgent) : undefined,
        code_status: Object.keys(codeByAgent).length > 0 ? codeStatus || undefined : undefined,
        rationale:
          (item as any).__rationale ||
          (proposedBy
            ? `Imekubaliwa na ${getAgent(proposedBy)?.name || proposedBy}`
            : "Hakuna tie-break; unresolved huachwa OPEN"),
        trade_off: (item as any).__tradeoff || mini.tradeOff,
        evidence: (item as any).__evidence || "",
        sources: JSON.stringify(
          itemSources.map((s) => s.url)
        ),
        owners: JSON.stringify(
          ownerAgents.map((a) => a.name)
        ),
      });
      // R30: mini-report ya muda → collection yake (mini_reports). Resume/5B inaisasisha pale pale.
      if (entryId) {
        const savedProvisional = await saveMiniReport({
          projectId: runner.id, sessionId: sessionId || runner.id, agendaIndex: item.index, agendaItem: item.item,
          status: consensusReached ? "LOCKED" : "OBJECTED_OPEN",
          decisionSummary: String(decision || "UNRESOLVED").slice(0, 4000),
          detail: mini.detail, carriedConstraints: mini.constraints,
        });
        if (savedProvisional) {
          miniCache.set(item.index, mini.detail);
          blog("info", `🧾 [mini-reports] Agenda ${item.index}: mini ya muda imehifadhiwa collection (${mini.detail.length} chars) — Ledger ina pointer.`);
        } else {
          // collection imeshindwa → ledger ya zamani inabeba mini ya muda (resume-safe kama R20)
          await updateLedgerMini(entryId, { decision_detail: mini.detail, carried_constraints: mini.constraints });
          blog("warning", `⚠️ [mini-reports] Agenda ${item.index}: mini ya muda HAikuweza kuhifadhiwa collection — Ledger ya zamani inaibeba muda huu.`);
        }
      }
      activityEnd(__lockAct);
      if (!entryId) {
        blog("error", `❌ Agenda ${item.index} haikuweza kuhifadhiwa kwenye Ledger baada ya majaribio yote — mkutano unasimama (bonyeza Resume).`);
        addChip(`❌ Ledger imeshindwa kuhifadhi Agenda ${item.index}: ${item.item} — mkutano umesimamishwa. Bonyeza Resume.`);
        throw new Error(`Ledger save failed for agenda ${item.index}`);
      }
      // R16.1: progress (akiba ya Ledger kwa Resume) — inahifadhiwa na persist inayofuata
      runner.doneIdx = [...new Set([...(runner.doneIdx || []), item.index])].sort((a, b) => a - b);
      // R10: entry na uamuzi wa MWISHO wa agenda hii (vinabadilika tu kama objection imekubaliwa na re-lock imefaulu)
      let finalEntryId: string = entryId;
      let finalDecisionText: string = decision;
      const observerVerdicts: { name: string; verdict: string }[] = [];
      let objectionInfo: MiniInput["objection"] = undefined;
      brain.lock({ index: item.index, item: item.item, decision: decision || "UNRESOLVED", status: consensusReached ? "LOCKED" : "OPEN" });
      brain.state({ phase: consensusReached ? "observers" : "open" });
      if (consensusReached) {
        addChip(`🔒 LOCKED: ${item.item} → ${decision.slice(0, 90)}`);
      } else {
        addChip(`🟠 OPEN: ${item.item} → ${(item as any).__deferred ? `DEFER: ${String((item as any).__deferred).slice(0, 110)}` : `hakuna consensus ya kutosha${delib.closedReason ? ` · ${delib.closedReason}` : ""}`}`);
      }
      if (consensusReached) {
        blog("success", `🔒 Ledger entry imehifadhiwa: ${item.item}`);
      } else {
        blog("warning", `🟠 Ledger item imeachwa OPEN: ${item.item}`);
      }
      await persist(
        consensusReached
          ? `agenda_${item.index}_locked`
          : `agenda_${item.index}_open`,
        conversationTitle
      );

      // ===== Observers objection — max 1 valid objection =====
      if (entryId && consensusReached) {
        const observers = AGENTS.filter(
          (a) => !item.owners.includes(a.id)
        );

        const objections: LedgerObjection[] = [];

        for (const ob of observers) {
          // Max ONE objection is evaluated for this locked item.
          if (objections.length >= 1) break;

          const oid = addMsg(ob.id);

          try {
            const observerPrompt = `
LOCKED DECISION:
${item.item} → ${decision}

YOUR ROLE:
You are ${ob.name}, ${ob.role}.

Check whether this decision creates a REAL problem in your domain.

If there is no real problem, output exactly:
SILENT

If there is a serious domain-specific problem, output exactly:
OBJECTION: <short concrete concern>
SEVERITY: high

Do not invent objections.
Do not reopen unrelated decisions.
Keep the answer under 80 words.
`;

            const oc = await streamTurn(
              ob,
              [
                {
                  role: "system",
                  content: await brain.prompt(ob.id, { phase: "observer", role: "observer", agenda: agendaCtx, owners: ownerAgents.map((a) => a.name), observers: observerNames, task: decision.slice(0, 800), msgId: oid, date: nowDate() }),
                },
                {
                  role: "user",
                  content: observerPrompt,
                },
              ],
              oid,
              true,
              700, // R26 (B1): 220 ilikata observers kabla ya SEVERITY — thinking ya Gemini inakula bajeti
              { priority: "observer", cls: "light", effort: "low" }, // R18: Gemini Flash-Lite kwanza (prompt kubwa, jibu fupi)
            );

            const clean = tidyTurn(oc // R20: observer pia — <tool_call> na vichwa vilivyoharibika havivuji
              .replace(thinkRe, "")
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .replace(/^\s*SEARCH:\s*.+$/gim, "")
              .trim());

            setItemContent(oid, clean);
            bcast({ type: "msg_done", id: oid });

            // R10: observers ni sehemu ya mjadala wa agenda (mini-report inawasoma)
            subTalk.push({ name: ob.name, text: clean, tag: "observer" });
            transcript.push({ name: ob.name, text: clean, item: item.index });
            joined(ob.id, "observer");
            observerVerdicts.push({ name: ob.name, verdict: /^SILENT$/i.test(clean.trim()) ? "SILENT" : clean.replace(/\s+/g, " ").slice(0, 300) });
            onObserverNote(clean, ob.name, ob.id === "pm" ? "optimus" : ob.id, blog);

            const om = clean.match(
              /OBJECTION:\s*(.+?)(?:\n|$)/i
            );

            const sm = clean.match(
              /SEVERITY:\s*(high|medium|low)/i
            );

            if (/^SILENT$/i.test(clean.trim())) {
              blog(
                "info",
                `🤫 ${ob.name}: SILENT accepted — hakuna objection ya domain iliyotolewa.`
              );
            }

            if (
              om &&
              sm &&
              sm[1].toLowerCase() === "high"
            ) {
              objections.push({
                agent: ob.name,
                concern: om[1].trim().slice(0, 400),
                severity: "high",
                resolution: "accepted",
              });
            }

          } catch (err: any) {
            blog(
              "warning",
              `⚠️ ${ob.name}: observer check failed — ${String(
                err?.message || err
              ).slice(0, 120)}`
            );

            bcast({
              type: "msg_done",
              id: oid,
            });
          }
        }

        // ======================================================
        // VALID OBJECTION → RETURN TO RELEVANT OWNER
        // ======================================================

        if (objections.length > 0) {
          const objection = objections[0];

          blog(
            "warning",
            `🛑 Objection halali kutoka ${objection.agent}: ${objection.concern}`
          );

          addChip(
            `🛑 Objection: ${objection.concern.slice(0, 90)}...`
          );

          // First owner responds to the objection.
          const responder = ownerAgents[0] || pm;
          
          
          // ====================================================
          // OBJECTION EVIDENCE VERIFICATION
          // ====================================================
          // Verify the objection before the owner accepts/rejects it.
          // Remaining search budget is used; existing evidence is
          // reused automatically if the budget is exhausted.

          const objectionSearchQuery = await withActivity("Optimus anatengeneza search query ya pingamizi…", async () => {
            try {
              const raw = await auxChatWithRotation(
                "pm",
                [
                  {
                    role: "system",
                    content: "You generate concise, generic technical search queries only. Never include the client's brand, company, or product name.",
                  },
                  {
                    role: "user",
                    content: `Create ONE concise web search query (4-10 keywords, no question mark, max 160 characters) to verify this specific technical concern:\n\n${objection.concern}\n\nDo NOT include any brand, company, or product name. Do NOT explain anything -- return only the query.`,
                  },
                ],
                120,
              );
              const q = raw
                .replace(/[`"']/g, "")
                .replace(/\?/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .slice(0, 160);
              return q || stripBrandTokens(objection.concern).slice(0, 160);
            } catch {
              return stripBrandTokens(objection.concern).slice(0, 160);
            }
          });

          await handleResearchRequest(
            responder,
            objectionSearchQuery,
            budget,
            itemSources,
            hasSearchedItem
          );
const uid = addMsg(responder.id);

          try {
                        const objectionEvidence = itemSources
              .slice(-8)
              .map((src) => `- ${src.title}\n  ${src.url}\n  ${src.content.slice(0, 450)}`)
              .join("\n");

const response = await streamTurn(
              responder,
              [
                {
                  role: "system",
                  content: await brain.prompt(responder.id, { phase: "objection", role: "owner answering an objection", agenda: agendaCtx, task: `${objection.agent}: ${objection.concern}`, need: "evidence claim objection", msgId: uid, date: nowDate() }),
                },
                {
                  role: "user",
                  content: `
LOCKED DECISION:
${decision}

OBJECTION FROM ${objection.agent}:
${objection.concern}

=== VERIFIED OBJECTION EVIDENCE ===
${objectionEvidence || "(Hakuna usable evidence mpya iliyopatikana.)"}

Use this evidence when evaluating the objection.
Do not invent facts, standards, benchmarks, or security claims.

You are an owner of this agenda item.

Evaluate the objection.

If the objection is VALID and requires a change, output:
UPDATED DECISION: <the COMPLETE new decision — restate every part of the locked decision that still applies, with the change applied; it REPLACES the old decision entirely>
RATIONALE: <why the change is required>

If the objection is NOT valid, output:
OBJECTION REJECTED: <short reason>

Do not reopen unrelated decisions.
Keep under 220 words.
`,
                },
              ],
              uid,
              true,
              1500 // R26 (B1): 500 ilikata UPDATED DECISION ya A3 (R24) katikati
            );

            const cleanResponse = response
              .replace(thinkRe, "")
              .replace(/<think>[\s\S]*?<\/think>/gi, "")
              .trim();

            setItemContent(uid, cleanResponse);
            subTalk.push({ name: responder.name, text: cleanResponse, tag: `jibu la pingamizi la ${objection.agent}` });
            transcript.push({ name: responder.name, text: cleanResponse, item: item.index });
            joined(responder.id, "owner (objection response)");

            const updated = cleanResponse.match(
              /UPDATED DECISION:\s*([\s\S]+?)(?=\nRATIONALE:|$)/i
            );

            const rejected = cleanResponse.match(
              /OBJECTION REJECTED:\s*([\s\S]+)$/i
            );

            // R27: UPDATED DECISION inayotegemea kikao/mradi mwingine haifungwi — uamuzi wa awali unabaki
            const updAuth = updated ? [...pastAuthorityHits(cleanResponse, pastProjectNames(conversationTitle, runner.project)), ...contrastHits(cleanResponse).map((h) => `contrast ${h.fgHex}/${h.bgHex} ${h.claimed}:1 ≠ ${h.actual.toFixed(2)}:1`)] : [];
            if (updated && updAuth.length) {
              blog("warning", `🧱 ${responder.name}: UPDATED DECISION inategemea kikao/mradi mwingine (${updAuth.map((h) => `"${h}"`).join(", ")}) — haifungwi; uamuzi wa awali unabaki.`);
              objection.resolution = "rejected";
              objectionInfo = { by: objection.agent, concern: objection.concern, responder: responder.name, outcome: "rejected", answer: "Jibu (UPDATED DECISION) lilitegemea kikao kingine, si ushahidi wa kikao hiki — uamuzi wa awali unabaki." };
            } else if (updated && turnInfo.get(uid)?.lengthCut) {
              // R26 (B2): UPDATED DECISION iliyokatika haifungwi — lock ya awali inabaki (kamili)
              blog("error", `✂️ ${responder.name}: UPDATED DECISION ilikatika (kikomo cha tokens) — haifungwi; uamuzi uliofungwa awali unabaki.`);
              addChip(`✂️ Jibu la pingamizi la ${objection.agent} lilikatika kabla ya kukamilika — uamuzi wa awali (kamili) unabaki LOCKED.`);
              objection.resolution = "rejected";
              objectionInfo = { by: objection.agent, concern: objection.concern, responder: responder.name, outcome: "rejected", answer: "Jibu (UPDATED DECISION) lilikatika kabla ya kukamilika — uamuzi wa awali unabaki." };
            } else if (updated) {
              const newDecision = updated[1].trim();

          // R26 (B3): UPDATED DECISION ni uamuzi KAMILI mpya (prompt inaagiza hivyo) — hauunganishwi tena na wa zamani.
          // R24: muunganiko "[Previous lock — superseded …]" ulizaa uamuzi unaojipinga (sticky vs "Hakuna sticky header").
          // Uamuzi wa zamani unabaki kwenye rekodi ya SUPERSEDED ya Ledger (na kwenye decision_detail kama rejea tu).
          const mergedDecision = newDecision;

              const rationaleMatch = cleanResponse.match(
                /RATIONALE:\s*([\s\S]+)$/i
              );

              // Upasuaji: Ikiwa kuna code, rekebisha kodi kulingana na pingamizi lililokubaliwa
              if (codeWriters.length > 0 && Object.keys(codeByAgent).length > 0) {
                blog("warning", `🛠️ ${objection.agent}: pingamizi limekubaliwa — kodi inarekebishwa upya kulingana na uamuzi mpya.`);
                await applyReviewFixes({
                  decision: mergedDecision,
                  itemText: item.item,
                  reviewNote: `PINGAMIZI ILIYOKUBALIWA (${objection.agent}): ${objection.concern}\nSABABU: ${rationaleMatch?.[1]?.trim() || "Marekebisho ya kiufundi"}\nUAMUZI MPYA: ${newDecision}${facts ? `\n\n${factsBlock()}` : ""}`,
                  itemIndex: item.index,
                  codeWriters,
                  codeByAgent,
                  lastVisibleMsgId,
                  addMsg,
                  streamTurn,
                  setItemContent,
                  bcast,
                  blog,
                  subTalk,
                  transcript,
                  systemFor: (w) => brain.prompt(w.id, { phase: "fix", role: "code writer (fix)", agenda: agendaCtx, task: decision.slice(0, 600) || item.item, date: nowDate() }),
                });

                // R26: fix ya pingamizi nayo inapita Data Guard + faili za data za mfumo
                for (const w of codeWriters) { const c = codeByAgent[w.id]; if (c) codeByAgent[w.id] = enforce(normalizeDeliverable(c).text).text; }
                const objHits = Object.values(codeByAgent).flatMap((c) => guardOf(c));
                if (objHits.length) {
                  codeStatus = "data_errors";
                  addChip(`⚠️ Data Guard: baada ya marekebisho ya pingamizi, script ya Agenda ${item.index} ina tofauti ${objHits.length} na DATA RASMI (${guardSummary(objHits)}).`);
                }
                // Sasisha allDeliverables ili kodi mpya ichukue nafasi ya ile ya zamani
                for (let dIdx = allDeliverables.length - 1; dIdx >= 0; dIdx--) {
                  if (allDeliverables[dIdx].itemIndex === item.index) {
                    allDeliverables.splice(dIdx, 1);
                  }
                }
                for (const writer of codeWriters) {
                  const updatedCode = codeByAgent[writer.id] || "";
                  if (updatedCode.trim()) {
                    allDeliverables.push({
                      itemIndex: item.index,
                      itemText: item.item,
                      writerName: writer.name,
                      code: updatedCode,
                    });
                  }
                }
              }

              // R10: re-lock inahifadhi mini-report ya muda; ya mwisho inaandikwa HATUA 5B.
              const mini2 = provisionalMini({ agendaIndex: item.index, agendaItem: item.item, decision: mergedDecision, consensus: true }, `**Pingamizi lililokubaliwa:** ${objection.agent}: ${objection.concern}`);
              const __relockAct = activityStart("Optimus anafunga upya agenda kwenye Ledger…");
              // R30: mini ya re-lock inaandikwa kwenye mini_reports (collection); ledger ina rejea ya re-lock + pointer
              const relockMiniDetail = `[OBJECTION ACCEPTED & RE-LOCKED]\nObjection ya ${objection.agent}: ${objection.concern}\nUamuzi mpya (unachukua nafasi ya wa zamani kabisa): ${newDecision}\n\n${mini2.detail}\n\n[Rejea tu — uamuzi uliobadilishwa (SUPERSEDED)]: ${decision.slice(0, 1500)}`;
              const savedRelockMini = await saveMiniReport({
                projectId: runner.id, sessionId: sessionId || runner.id, agendaIndex: item.index, agendaItem: item.item,
                status: "LOCKED", decisionSummary: mergedDecision.slice(0, 4000),
                detail: relockMiniDetail, carriedConstraints: mini2.constraints,
              });
              if (savedRelockMini) { miniCache.set(item.index, relockMiniDetail); blog("info", `🧾 [mini-reports] Agenda ${item.index}: mini ya re-lock imehifadhiwa collection (${relockMiniDetail.length} chars).`); }
              const newId = await saveLedgerEntry({
                session_id: runner.id,
                project_id: runner.id,
                agenda_index: item.index,
                agenda_item: item.item,
                status: "LOCKED",
                decision_summary: mergedDecision.slice(0, 4000),
                decision_detail: savedRelockMini ? MINI_LEDGER_POINTER : relockMiniDetail,
                carried_constraints: mini2.constraints,
                approved_code: Object.keys(codeByAgent).length > 0 ? JSON.stringify(codeByAgent) : undefined,
                code_status: Object.keys(codeByAgent).length > 0 ? codeStatus || undefined : undefined,
                rationale:
                  rationaleMatch?.[1]?.trim() ||
                  `Updated baada ya objection ya ${objection.agent}`,
                trade_off: (item as any).__tradeoff || mini2.tradeOff,
                evidence: (item as any).__evidence || "",
                objections: JSON.stringify(objections),
                supersedes: entryId,
                owners: JSON.stringify(
                  ownerAgents.map((a) => a.name)
                ),
                sources: JSON.stringify(
                  itemSources
                    .slice(0, 5)
                    .map((src) => src.url)
                ),
              });

              activityEnd(__relockAct);
              if (!newId) {
                blog("error", `❌ Re-lock ya Agenda ${item.index} imeshindwa kuhifadhiwa — entry ya zamani inabaki LOCKED (haijafutwa).`);
                addChip(`⚠️ Re-lock ya Agenda ${item.index} imeshindwa — Ledger inabaki na toleo la zamani.`);
              }
              // Old decision becomes historical ONLY if newId was successfully saved!
              if (newId) {
                await markSuperseded(entryId);
                finalEntryId = newId;
                finalDecisionText = mergedDecision;
              }
              objectionInfo = { by: objection.agent, concern: objection.concern, responder: responder.name, outcome: "accepted", answer: newDecision };
              brain.objection({ index: item.index, by: objection.agent, outcome: newId ? "accepted (re-locked)" : "accepted (re-lock failed)" });
              if (newId) brain.lock({ index: item.index, item: item.item, decision: mergedDecision, status: "LOCKED" });

              decision = "";
              proposed = mergedDecision;
              for (const owner of ownerAgents) {
                agrees.delete(owner.id);
              }

              addChip(
                `🔁 SUPERSEDED → ${newDecision.slice(0, 90)}`
              );

              if (newId) {
                blog(
                  "success",
                  `✅ ${item.item}: objection imekubaliwa na decision mpya ime-lockiwa.`
                );
              }

            } else if (rejected) {
              objectionInfo = { by: objection.agent, concern: objection.concern, responder: responder.name, outcome: "rejected", answer: rejected[1].trim() };
              brain.objection({ index: item.index, by: objection.agent, outcome: "rejected" });
              addChip(
                `↩️ Objection imekataliwa: ${rejected[1]
                  .trim()
                  .slice(0, 80)}`
              );
            }

          } catch (err: any) {
            blog(
              "warning",
              `⚠️ Owner objection response failed: ${String(
                err?.message || err
              ).slice(0, 140)}`
            );
          }

          bcast({
            type: "msg_done",
            id: uid,
          });
        }
      }

      // ===== [PATCH-XMD-V2] Deliverables zinaingia HAPA TU — baada ya objection phase kuisha (code mode tu) =====
      if (consensusReached && item.requiresCode && !planModeRun && codeWriters.length > 0) {
        for (let dIdx = allDeliverables.length - 1; dIdx >= 0; dIdx--) {
          if (allDeliverables[dIdx].itemIndex === item.index) allDeliverables.splice(dIdx, 1);
        }
        for (const writer of codeWriters) {
          const finalCode = codeByAgent[writer.id] || "";
          if (finalCode.trim()) {
            allDeliverables.push({ itemIndex: item.index, itemText: item.item, writerName: writer.name, code: finalCode });
          }
        }
      }


      // ===== HATUA 5B (R10): MINI-REPORT YA MWISHO — mjadala wote wa agenda umeisha =====
      // Observers wote wamesema SILENT au objection imetatuliwa (UPDATED DECISION → re-lock, au REJECTED).
      // Optimus anasoma MJADALA WOTE (owners, code, review, observers, pingamizi na jibu lake) na kuandika
      // mini-report sahihi; inachukua nafasi ya ile ya muda kwenye entry ya MWISHO ya Ledger. Kisha memory
      // checkpoints za washiriki — na HAPO NDIPO agenda inayofuata inaanza.
      if (consensusReached && finalDecisionText.trim()) {
        brain.state({ phase: "mini-report" });
        const finalMini = await writeMiniReport({
          agendaIndex: item.index,
          agendaItem: item.item,
          decision: finalDecisionText,
          consensus: true,
          owners: ownerAgents.map((a) => a.name),
          codeWriters: Object.keys(codeByAgent).map((id) => getAgent(id)?.name || id),
          talk: subTalk,
          observers: observerVerdicts,
          objection: objectionInfo,
        });
        // R30: mini-report ya MWISHO → collection yake (mini_reports — ya Optimus). Ledger ina uamuzi rasmi + pointer.
        const savedFinalMini = await saveMiniReport({
          projectId: runner.id, sessionId: sessionId || runner.id, agendaIndex: item.index, agendaItem: item.item,
          status: "LOCKED", decisionSummary: String(finalDecisionText || "").slice(0, 4000),
          detail: finalMini.detail, carriedConstraints: finalMini.constraints,
        });
        const okMini = await updateLedgerMini(finalEntryId, savedFinalMini
          ? { decision_detail: MINI_LEDGER_POINTER, carried_constraints: finalMini.constraints, trade_off: finalMini.tradeOff }
          : { decision_detail: finalMini.detail, carried_constraints: finalMini.constraints, trade_off: finalMini.tradeOff });
        if (savedFinalMini) miniCache.set(item.index, finalMini.detail);
        blog(
          savedFinalMini || okMini ? "success" : "warning",
          savedFinalMini || okMini
            ? `🧾 Mini-report ya mwisho ya Agenda ${item.index} imehifadhiwa (${savedFinalMini ? "collection mini_reports" : "Ledger fallback"}) (${finalMini.detail.length} chars${finalMini.llm ? "" : " · fallback"}${finalMini.missing.length ? ` · thamani ${finalMini.missing.length} zimeongezwa` : ""}).`
            : `⚠️ Mini-report ya mwisho ya Agenda ${item.index} haikuhifadhiwa — ile ya muda inabaki.`,
        );
        await persist(`agenda_${item.index}_mini`, conversationTitle);
        brain.state({ phase: "memory checkpoints" });
        await brain.onAgendaDone({ agendaIndex: item.index, agendaItem: item.item, participants, talk: subTalk, miniDecision: miniDecisionSection(finalMini.detail, 1500) });
      } else if (participants.length) {
        brain.state({ phase: "memory checkpoints" });
        await brain.onAgendaDone({ agendaIndex: item.index, agendaItem: item.item, participants, talk: subTalk, miniDecision: (item as any).__deferred ? `DEFERRED — ${String((item as any).__deferred).slice(0, 600)}` : `UNRESOLVED — no consensus; the item stays OPEN.${delib.closedReason ? ` (${delib.closedReason})` : ""}${openNote ? `\n${openNote.slice(0, 1200)}` : ""}` });
      }

}
    // ===== R20: FINISHING PASS (Endeleza) — finale iliyokatika inakamilishwa: KILICHOKOSEKANA tu kinaandikwa =====
    const prior = isResume ? scanFinale(runner.items as FinaleItem[]) : null;
    if (prior?.started) {
      if (prior.dropped > 0) {
        const keepIds = new Set(prior.keep.map((x) => x.id));
        for (const it of runner.items) if (it.kind === "msg" && !keepIds.has(it.id)) bcast({ type: "msg_reset", id: it.id });
        runner.items = prior.keep as typeof runner.items;
      }
      const need = missingParts({ status: "resume", items: runner.items as FinaleItem[], agendaTotal: agenda.length, done: agenda.map((a) => a.index), finale: runner.finale, mode: runner.mode, computerPlanned: runner.computerPlanned });
      blog("system", `♻️ Endeleza: finale ilikuwa imeanza — ${need.length ? `inakamilisha: ${need.join(" · ")}` : "hakuna kilichokosekana"}.`);
      addChip(`♻️ Endeleza: ${need.length ? `inakamilisha ${need.join(" · ")}` : "inathibitisha finale"} — vipande vilivyokamilika havirudiwi.`);
    }

    // ===== [PATCH-XMD-V2] HATUA 6.4: PROGRAMMATIC VALIDATOR — agenda 1..N zote lazima ziwe kwenye Ledger =====
    {
      const expected = agenda.map((a) => a.index);
      let missingIdx: number[] = expected;
      let fbrCheck: Array<{ agenda_index: number; status: string }> = [];
      await withActivity(`Optimus anakagua Ledger (agenda 1–${agenda.length})…`, async () => {
        for (let attempt = 0; attempt < 3; attempt++) {
          fbrCheck = await finalBoardResolution(runner.id);
          const have = new Set(fbrCheck.map((e) => e.agenda_index));
          missingIdx = expected.filter((i) => !have.has(i));
          if (missingIdx.length === 0) break;
          await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
        }
      });
      if (missingIdx.length > 0) {
        blog("error", `❌ Validator: agenda zilizokosekana kwenye Ledger: ${missingIdx.join(", ")}`);
        addChip(`❌ Validator: agenda ${missingIdx.join(", ")} hazipo kwenye Ledger — mkutano umesimamishwa. Bonyeza Resume kuzikamilisha.`);
        throw new Error(`Validator: agenda zilizokosekana kwenye Ledger: ${missingIdx.join(", ")}`);
      }
      const openIdx = fbrCheck.filter((e) => e.status !== "LOCKED").map((e) => e.agenda_index);
      if (openIdx.length > 0) {
        blog("warning", `🟠 Validator: agenda ${openIdx.join(", ")} hazina LOCKED (OBJECTED_OPEN/UNRESOLVED).`);
        if (!prior?.validated) addChip(`🟠 Validator: agenda ${openIdx.join(", ")} hazikufungwa kwa consensus — zitaandikwa kama UNRESOLVED kwenye ripoti.`);
      } else {
        blog("success", `✅ Validator: agenda zote ${agenda.length}/${agenda.length} ziko kwenye Ledger kama LOCKED.`);
      }
    }

    // ===== HATUA 6.5: OPTIMUS ANAUNGANISHA SCRIPT YA MWISHO =====
    // Optimus anachukua vipande vyote vya code vilivyokubaliwa (LOCKED)
    // kutoka kwa items zote, na kuviunganisha kuwa script MOJA kamili,
    // sahihi, inayofanya kazi -- si kubandika vipande pamoja bila
    // mpangilio. Inaendelea pale ilipoishia turns kadhaa ikihitajika.
    // R26 (F1): script ya mwisho inakusanywa na MFUMO (board/assemble.ts) kwa njia ya faili — si kuandikwa upya na LLM.
    // R24: toleo la LLM lilipoteza A7/A9, lilikatika katikati ya CSS ya A3, na halikuweka alama za NYONGEZA.
    async function assembleFinalScript(): Promise<string> {
      // [PATCH-XMD-V2] Chanzo ni Ledger (approved_code). allDeliverables ni fallback tu.
      const lockedPieces = await collectLockedPieces();
      const pieces = lockedPieces.length > 0 ? lockedPieces : allDeliverables;
      if (pieces.length === 0) return "";
      const fbrS = await finalBoardResolution(runner.id).catch(() => [] as Awaited<ReturnType<typeof finalBoardResolution>>);
      const asm = assembleScript(pieces, sysFiles, { title: conversationTitle, openAgendas: fbrS.filter((e) => e.status !== "LOCKED").map((e) => e.agenda_index) });
      blog("info", `🧾 Script ya mwisho (mfumo, bila LLM): faili ${asm.files.length} kutoka vipande ${pieces.length} vya ${lockedPieces.length > 0 ? "Ledger (approved_code)" : "memory (fallback)"}${sysFiles.length ? ` + faili ${sysFiles.length} za DATA RASMI` : ""}.`);
      for (const [ag, by] of Object.entries(asm.coveredBy)) blog("info", `🧾 Agenda ${ag}: faili zake zimesasishwa na Agenda ${by.join(", ")} — toleo la baadaye limetumika.`);
      if (asm.missingAgendas.length) blog("error", `❌ Script ya mwisho: code ya Agenda ${asm.missingAgendas.join(", ")} haikutambulika (hakuna faili).`);
      if (asm.incomplete.length) blog("warning", `⚠️ Script ya mwisho: faili ${asm.incomplete.length} hazikukamilika — ${asm.incomplete.join(", ")}`);
      for (const pr of asm.problems) blog("error", `⛔ Script ya mwisho · ${pr}`);
      const msgId = addMsg(pm.id);
      const it = runner.items.find((x) => x.kind === "msg" && x.id === msgId);
      if (it && it.kind === "msg") it.content = asm.markdown;
      bcast({ type: "token", id: msgId, text: asm.markdown });
      setItemContent(msgId, asm.markdown);
      bcast({ type: "msg_done", id: msgId });
      return asm.markdown;
    }

    let finalScript = "";
    if (planModeRun) {
      // R30 · PLAN MODE: hakuna script ya mwisho — deliverable ni RIPOTI + MPANGO KAZI (HATUA 6.6)
      blog("info", "📋 Plan mode: awamu ya kuunganisha script ya mwisho IMERUKWA — maamuzi (LOCKED) + Mpango Kazi wa Agent ndiyo deliverable.");
    } else if (prior?.scriptDone) {
      finalScript = prior.script;
      blog("info", `♻️ Endeleza: script ya mwisho tayari imeunganishwa (${finalScript.length} chars) — haiandikwi upya.`);
    } else {
      addChip("🧩 Optimus anaunganisha vipande vyote vya code kuwa script moja kamili — kwa njia ya faili, neno kwa neno kutoka Ledger...");
      blog("system", "🧩 Optimus anaunganisha deliverables kuwa script moja...");
      finalScript = await assembleFinalScript();
    }
    if (finalScript) {
      blog("success", `📦 Optimus: script ya mwisho imeunganishwa (${finalScript.length} chars).`);
    } else {
      blog("info", "📦 Hakuna deliverable ya code iliyogunduliwa kwa mradi huu.");
    }
    // R26 (F2): ukaguzi wa DATA RASMI kwenye script ya mwisho (code, si LLM) — matokeo yanaingia ripoti neno kwa neno
    const scriptHits: GuardHit[] = finalScript && facts ? guardOf(finalScript) : [];
    if (finalScript && facts) {
      if (scriptHits.length) {
        addChip(`⚠️ Data Guard (script ya mwisho): ${guardSummary(scriptHits)} — zimeandikwa kwenye ripoti (sehemu 10.3).`);
        blog("warning", `🛡️ Data Guard · script ya mwisho: ${scriptHits.length} — ${scriptHits.slice(0, 5).map((h) => `"${h.found}"`).join(", ")}`);
      } else {
        blog("success", "🛡️ Data Guard · script ya mwisho: ✅ bei, saa, namba, anwani na barua pepe zote zinalingana na DATA RASMI.");
      }
    }

// ===== HATUA 6.6 (R30 · plan mode): MPANGO KAZI WA AGENT (kwa computer-use) =====
    // Optimus anajenga kutoka mini-reports zake (chanzo kikuu) + maamuzi ya Ledger: hatua 8-15 za Kiingereza
    // zenye muundo uniform. Sehemu 2 (Official Data) na 3 (Constraints) zinaandikwa na MFUMO kutoka Fact Sheet.
    // Kipande kimoja kwa wakati kinaonekana kwenye card ya "Mpango Kazi" (kama ripoti — shimmer, si chip).
    let planHits: GuardHit[] = [];
    let planStepsTotal = 0;
    let planSavedId: string | null = runner.finale?.planId || null;
    if (planModeRun && !planSavedId) {
      const pc = (s: string | undefined | null, n: number) => (String(s || "").length > n ? String(s).slice(0, n) + " […]" : String(s || ""));
      const planTitle = conversationTitle || "Agent Work Plan";
      const planTexts: string[] = [...(prior?.planTexts || [])];
      const planCollected: Record<number, string> = {};
      const ingestPlan = (md: string) => {
        const sec = extractPlanSections(md);
        for (const [k, v] of Object.entries(sec)) { const n = Number(k); if (!planCollected[n] || sec[n].length > planCollected[n].length) planCollected[n] = v; }
      };
      for (const t of planTexts) ingestPlan(t);

      brain.state({ phase: "plan" });
      const planSystem = await brain.prompt(pm.id, { phase: "plan", role: "work plan writer", date: nowDate() });
      // context: mini-reports za Optimus (collection kwanza, fallback ledger) + maamuzi
      const fbrP = await finalBoardResolution(runner.id);
      // R30.1 (E2): fallback ya §3 ya Mpango — brief isipate "MASHARTI:" → carried_constraints za maamuzi LOCKED (neno kwa neno, dedupe)
      const constraintFallback = constraintFallbackLines(fbrP.filter((e) => e.status === "LOCKED").flatMap((e) => String(e.carried_constraints || "").split("\n")));
      if (!facts?.constraints?.length && constraintFallback.length) {
        blog("info", `📄 Mpango §3: brief haina "MASHARTI:" — inatumia fallback ya Ledger (carried_constraints · mistari ${constraintFallback.length}).`);
      }
      const miniLines = (
        await Promise.all(
          fbrP.map(async (e) => {
            const md = await miniDetailOf(e);
            let owners: string[] = [];
            try { owners = JSON.parse(String(e.owners || "[]")); } catch { /* */ }
            return `### A${e.agenda_index} [${e.status}] ${e.agenda_item}\nOwners: ${owners.join(", ") || "(haijulikani)"}\nDecision: ${pc(e.decision_summary, 1200)}\nOptimus mini-report:\n${pc(miniContext(md, 2000) || md || String(e.decision_summary || ""), 2200)}`;
          }),
        )
      ).join("\n\n");
      const planCtx = `PROJECT BRIEF: "${runner.project}"\n\n${facts ? `${factsBlock()}\n\n` : ""}${sysFiles.length ? `${dataFilesBlock(sysFiles)}\n\n` : ""}=== LOCKED DECISIONS + MINI-REPORTS (the Board has finished — this is the source of truth) ===\n${miniLines}`;

      for (const p of PLAN_PARTS) {
        if (p.nums.every((n) => planCollected[n])) {
          blog("info", `♻️ Endeleza: Kipande ${p.label} cha Mpango Kazi tayari kimeandikwa kamili — kinarukwa.`);
          continue;
        }
        blog("system", `📋 Optimus anaandika Mpango Kazi wa Agent — Kipande ${p.label}...`);
        addChip(planPartChip(p.part)); // adapter inaifungua kuwa CARD ya plan (kama ripoti) — si chip ya UI
        const planMsgId = addMsg(pm.id);
        const secs =
          p.part === 1
            ? `## 1. Objective & Deliverable — what the agent is building (3-6 sentences, from the brief + Agenda 1 decision)
## 2. Official Data — copy the DATA RASMI block above WORD FOR WORD as bullet lists (the system replaces this section with its own deterministic copy — never invent anything here)
## 3. Constraints — copy the project constraints word for word (the system replaces this section too)
## 4. Tech Stack & Design Tokens — from LOCKED decisions only: framework, fonts, colors (hex codes + where used), touch targets, layout rules`
            : `## 5. File Structure — every file with its job and the agenda that owns it (tree or table)
## 6. Work Steps — ${PLAN_STEPS_MIN} to ${PLAN_STEPS_MAX} steps; each step EXACTLY in this shape:
${PLAN_STEP_TEMPLATE}
Step rules: sequential numbering 1..N; coarse-grained (each step is one meaningful chunk of work with its own verification); copy every official value word for word; if something was not discussed, write "not discussed"; dependencies reference earlier steps only.
## 7. QA Checklist — checkbox list (size budget, WCAG contrast, data accuracy vs Official Data, closed days, phone placeholder, no-JS rule)
## 8. Agent Rules — DATA RASMI is law; never invent; mark additions beyond this plan as NYONGEZA (not discussed); stop and report on data conflicts or failed verification x2`;
        const planPart = await streamTurn(
          pm,
          [
            { role: "system", content: planSystem },
            {
              role: "user",
              content: `${planCtx}

=== YOUR TASK ===
Write PART ${p.part} of the AGENT WORK PLAN in English. A computer-use coding agent that has NOT seen this Board will execute it step by step — it must be fully self-contained. Output ONLY the sections listed below, each starting with its exact heading.

${secs}

RULES:
- English only. Markdown only. No preamble, no closing remarks.
- Never invent prices, hours, names, phone numbers, emails or addresses — copy them from DATA RASMI / LOCKED decisions only.
- If something was not discussed by the Board, write "not discussed" — never fill gaps.
- Do NOT write complete files or full scripts; short reference snippets only (max 40 lines).${THINK_CAP}`,
            },
          ],
          planMsgId,
          true,
          24000,
          { critical: true },
        );
        setItemContent(planMsgId, planPart);
        bcast({ type: "msg_done", id: planMsgId });
        planTexts.push(planPart);
        ingestPlan(planPart);
        await persist(`plan_part_${p.part}`, conversationTitle);
      }

      // kuunganisha (deterministic): sehemu 2/3 za mfumo + hatua zinapewa namba mfululizo
      let asm = assemblePlanDocument({ partTexts: planTexts, title: planTitle, sessionId: sessionId || runner.id, date: nowDate(), facts, constraintFallback });
      planStepsTotal = asm.steps.length;
      for (const pr of asm.problems) blog("warning", `📋 Mpango Kazi: ⚠️ ${pr}`);
      // Data Guard (maandishi): kila bei/saa/simu/email/anwani lazima iwepo kwenye Fact Sheet
      planHits = facts ? guardOf(asm.markdown) : [];
      if (planHits.length) {
        addChip(`📋 Optimus anarekebisha Mpango Kazi: ${planHits.slice(0, 4).map((h) => `"${h.found}"`).join(", ")}...`);
        blog("warning", `🛡️ Data Guard · Mpango Kazi: tofauti ${planHits.length} — ${planHits.slice(0, 6).map((h) => `"${h.found}" (lazima: ${String(h.expected).slice(0, 60)})`).join(", ")}`);
        const fixMsgId = addMsg(pm.id);
        const fixed = await streamTurn(
          pm,
          [
            { role: "system", content: planSystem },
            {
              role: "user",
              content: `${planCtx}

The work plan you wrote contains values that contradict DATA RASMI. These are ALL the mismatches found by the system's deterministic guard:
${planHits.map((h) => `- Found: "${h.found}" — expected instead: ${String(h.expected).slice(0, 140)}`).join("\n")}

Rewrite ONLY the affected sections (same headings, same structure), with every value corrected to match DATA RASMI word for word. Do not change anything else.${THINK_CAP}`,
            },
          ],
          fixMsgId,
          true,
          8000,
          { critical: true },
        );
        setItemContent(fixMsgId, fixed);
        bcast({ type: "msg_done", id: fixMsgId });
        planTexts.push(fixed);
        ingestPlan(fixed);
        asm = assemblePlanDocument({ partTexts: planTexts, title: planTitle, sessionId: sessionId || runner.id, date: nowDate(), facts, constraintFallback });
        planStepsTotal = asm.steps.length;
        planHits = facts ? guardOf(asm.markdown) : [];
      }
      const planStatus = planHits.length ? "guard_failed" : "active";
      planSavedId = await saveProjectPlan({
        projectId: runner.id,
        sessionId: sessionId || runner.id,
        title: planTitle,
        objective: pc(asm.sections[1], 10_000),
        status: planStatus,
        constraints: constraintsMarkdown(facts, constraintFallback),
        officialData: officialDataMarkdown(facts),
        planContent: asm.markdown,
        totalSteps: planStepsTotal,
      });
      runner.finale = { ...(runner.finale || {}), planId: planSavedId };
      if (planSavedId) {
        addChip(`${PLAN_SAVED_CHIP} (hatua ${planStepsTotal}${planHits.length ? ` · ⚠️ tofauti ${planHits.length} za data zimeandikwa wazi` : ""}) — computer-use agent inaupata kwa /api/plans?session=${sessionId || runner.id}`);
        blog("success", `📋 Mpango Kazi wa Agent umehifadhiwa (hatua ${planStepsTotal} · status ${planStatus} · doc ${planSavedId.slice(0, 8)}… · herufi ${asm.markdown.length}).`);
      } else {
        addChip("❌ Mpango Kazi umeshindwa kuhifadhiwa Appwrite — ripoti inaendelea; bonyeza Endeleza kujaribu tena.");
        blog("error", "❌ [plans] Mpango Kazi haukuhifadhiwa Appwrite (angalia logs za server).");
      }
      await persist(planSavedId ? "plan_saved" : "plan_failed", conversationTitle);
    } else if (planModeRun && planSavedId) {
      blog("info", `♻️ Endeleza: Mpango Kazi tayari umehifadhiwa (${planSavedId.slice(0, 8)}…) — haandikwi upya.`);
    }

// ===== HATUA 7: RIPOTI KUTOKA LEDGER (FBR) =====
    const fbr = await finalBoardResolution(runner.id);
    const __cap = (s: string | undefined, n: number): string => ((s || "").length > n ? (s as string).slice(0, n) + " […]" : s || "");
    // R10: MINI-REPORT ya mwisho ndiyo chanzo kikuu cha ripoti (Optimus aliisoma agenda yote);
    // decision_summary ni akiba tu pale mini-report haipo.
    // R30: mini-report inasomwa kutoka collection (mini_reports); ledger ya zamani = fallback.
    const ledgerText = (
      await Promise.all(
        fbr.map(async (e) => {
          const md = await miniDetailOf(e);
          return (
            `## ${e.agenda_index}. ${e.agenda_item}\nStatus: ${e.status}${e.status === "LOCKED" ? "" : " (HAIKUFUNGWA — eleza sababu halisi ILIYOANDIKWA hapa tu; usibuni sababu nyingine; pendekezo la mwisho SI uamuzi)"}` +
            (md
              ? `\nMINI-REPORT YA OPTIMUS (chanzo kikuu — nakili orodha, cases, namba na thamani BILA kubadilisha):\n${__cap(md, 7000)}`
              : `\nUamuzi: ${__cap(e.decision_summary, 1500)}`) +
            (e.rationale ? `\nRationale: ${__cap(e.rationale, 600)}` : "") +
            (e.evidence ? `\nEvidence: ${__cap(e.evidence, 500)}` : "") +
            (e.objections ? `\nObjections: ${__cap(e.objections, 500)}` : "")
          );
        }),
      )
    ).join("\n\n");
    brain.state({ phase: "report" });
    const reportSystem = await brain.prompt(pm.id, { phase: "report", role: "report writer", date: nowDate() });
    // R26 (F3): ukweli wa kiufundi kwa ripoti — ripoti haidai "bei halisi"/"imekaguliwa" bila ushahidi huu
    const codeStatusLine = fbr
      .filter((e) => (e as any).code_status)
      .map((e) => `A${e.agenda_index}: ${({ approved: "code imekaguliwa na kukubaliwa", unreviewed: "code HAIKUKAGULIWA na mkaguzi wa LLM (Data Guard ya code ilipita)", data_errors: "code ina tofauti na DATA RASMI", rejected: "code haikupitishwa na mkaguzi" } as Record<string, string>)[(e as any).code_status] || (e as any).code_status}`)
      .join(" · ");
    // R31-G5: plan mode HAINA script ya mwisho — DATA GUARD ya "final script" ni ya code mode
    // pekee (ilikuwa inaingia hata plan mode → ripoti ilitajia "script" isiyokuwepo).
    const guardLine = planModeRun
      ? "DATA GUARD (plan mode): Board hii haina code/script — DATA RASMI hapo juu ndiyo chanzo pekee cha ukweli wa bei, saa, simu, barua pepe na anwani."
      : `DATA GUARD (code check of the final script against DATA RASMI): ${scriptHits.length ? `${scriptHits.length} MISMATCHES — ${scriptHits.slice(0, 8).map((h) => `"${h.found}" (should be: ${h.expected.slice(0, 80)})`).join("; ")}. Do NOT claim the data is correct/official; state these mismatches honestly.` : "PASSED — every price, hour, phone, email and address in the final script matches DATA RASMI."}`;
    const reportFacts = facts
      ? `\n${factsBlock()}\n${guardLine}${!planModeRun && codeStatusLine ? `\nCODE STATUS PER AGENDA: ${codeStatusLine}` : ""}\nNever write a price, hour, phone, email or address that is not in DATA RASMI.\n`
      : !planModeRun && codeStatusLine ? `\nCODE STATUS PER AGENDA: ${codeStatusLine}\n` : "";
    const byItem: Record<number, string[]> = {};
          for (const t of transcript) { const k = t.item || 0; (byItem[k] = byItem[k] || []).push(`${t.name}: ${t.text.slice(0, 500)}`); }
          const __TRANSCRIPT_PER_ITEM_CAP = 900;
const fullTranscript = Object.keys(byItem)
  .map((k) => {
    const block = `--- Kipengele ${k} ---\n` + byItem[Number(k)].slice(-3).join("\n");
    return block.length > __TRANSCRIPT_PER_ITEM_CAP
      ? block.slice(0, __TRANSCRIPT_PER_ITEM_CAP) + "\n[...]"
      : block;
  })
  .join("\n\n");

    void fullTranscript; // [PATCH-XMD-V2] haitumwi tena kwa Optimus
    // SECTION_DEFS + extractSections: chanzo kimoja kwenye board/finale.ts (R20 — Endeleza inazitumia pia)
    const collected: Record<number, string> = {};
    const ingest = (md: string) => { const sec = extractSections(md); for (const k of Object.keys(sec)) { const n = Number(k); if (!collected[n] || sec[n].length > collected[n].length) collected[n] = sec[n]; } };
    // R20: vipande vya ripoti vilivyokamilika kabla mtandao/server haijakatika — havirudiwi
    for (const t of prior?.reportTexts || []) ingest(t);

    const partSpecs = [
      { label: "1/2 (1-5)", nums: [1, 2, 3, 4, 5], secs: "## 1. Muhtasari\n## 2. Utafiti\n## 3. Mjadala\n## 4. Maamuzi\n## 5. Rangi (hex codes + emoji za rangi)", tail: "" },
      {
        label: "2/2 (6-10)", nums: [6, 7, 8, 9, 10], secs: "## 6. Kurasa & Menu\n## 7. Safari ya Mteja\n## 8. Tech Stack\n## 9. Hatari\n## 10. Action Plan",
        tail:
          "UMESHA andika sehemu 1-5. Sasa ENDELEA na 6-10 TU. USIRUDIE kichwa cha ripoti wala sehemu 1-5." +
          (planModeRun
            ? ` Sehemu 10 (Action Plan): andika kwa MANENO mpangilio wa utekelezaji wa mradi, na taja wazi kwamba MPANGO KAZI KAMILI WA AGENT (hatua ${planStepsTotal || "N"}, Kiingereza) umetayarishwa na upo kwa endpoint /api/plans?session=${sessionId || runner.id} — computer-use agent ndiye atakayetekeleza. USIANDIKE code wala script nzima kwenye ripoti hii. KILA hatua ya checklist iwe "- [ ]" (bado HAIJATEKELEZWA — plan mode haina utekelezaji); KABISA usitumie "- [x]".`
            : ""),
      },
    ];
    for (const pp of partSpecs) {
      if (pp.nums.every((n) => collected[n])) {
        blog("info", `♻️ Endeleza: Kipande ${pp.label} tayari kimeandikwa kamili — kinarukwa.`);
        continue;
      }
      // R20: kipande nusu (Endeleza) → sehemu ZILIZOKOSEKANA tu zinaombwa
      const have = pp.nums.filter((n) => collected[n]);
      if (have.length) {
        const need = pp.nums.filter((n) => !collected[n]);
        pp.secs = pp.secs.split("\n").filter((l) => need.includes(Number((l.match(/##\s*(\d+)\./) || [])[1]))).join("\n");
        pp.tail = `${pp.tail ? `${pp.tail}\n` : ""}Sehemu ${have.join(", ")} TAYARI zimeandikwa — USIZIRUDIE. Andika TU: ${need.join(", ")}.`;
      }
      blog("system", `📑 Optimus anaandika ripoti — Kipande ${pp.label}...`);
      addChip(`📑 Optimus anaandika ripoti — Kipande ${pp.label}...`);
      const repId = addMsg(pm.id);
      try {
        const part = await streamTurn(pm, [
          { role: "system", content: reportSystem },
          { role: "user", content: `PROJECT: "${runner.project}"\n${reportFacts}FINAL BOARD RESOLUTION (Ledger — source of truth):\n${ledgerText}\n\n(Raw transcript HAIJATUMWA. Ledger pekee ndio chanzo cha ukweli.)

IMPORTANT:
Ledger ndiyo SOURCE OF TRUTH.
Kama transcript na Ledger zinapingana, TUMIA LEDGER pekee.
Usirudishe proposal iliyokataliwa au superseded.
SHERIA ZA USAHIHI (R10): kila FACT, namba, asilimia au kanuni (mfano rounding) lazima iwe na chanzo kwenye Ledger/mini-report hapo juu — kama haipo, usiiandike. Usibadilishe, usipunguze wala usibadilishane orodha, cases, thamani au mpangilio uliopo kwenye mini-report (mfano: case A ibaki case A). Masharti (conditions) na pingamizi zilizokubaliwa ni sehemu ya uamuzi.
KWENYE SEHEMU YA 4 (Maamuzi): taja KILA agenda ya Ledger (1 hadi ${agenda.length}) bila kuruka hata moja, na anza kila kipengele kwa lebo [A<namba>] (mfano [A1], [A2], ...). Hakuna agenda inayoruhusiwa kuachwa.

=== REPORT MODE — KIPANDE ${pp.label} (KISWAHILI) ===\n${pp.tail}\nAndika ripoti KUTOKA kwa Ledger hapo juu. Andika sehemu hizi tu, kila moja iwe na kichwa "## N. Kichwa":\n${pp.secs}\n${THINK_CAP}` },
        ], repId, true, 24000, { critical: true });
        setItemContent(repId, part);
        bcast({ type: "msg_done", id: repId });
        ingest(part);
        blog("success", `✅ Kipande ${pp.label} kimekamilika (${part.replace(thinkRe, "").trim().length} chars).`);
      } catch (err: any) {
        blog("error", `❌ Kipande ${pp.label} imefeli: ${err?.message}`);
        bcast({ type: "msg_done", id: repId });
      }
      await persist(`report_part_${pp.label}`, conversationTitle);
    }
    for (let repair = 0; repair < 2; repair++) {
      const missing = SECTION_DEFS.filter((d) => !collected[d[0]]);
      if (missing.length === 0) break;
      addChip(`🛠️ Optimus anarekebisha ripoti: ${missing.map((m) => m[2]).join(", ")}...`);
      const repId = addMsg(pm.id);
      try {
        const fix = await streamTurn(pm, [
          { role: "system", content: reportSystem },
          { role: "user", content: `FINAL BOARD RESOLUTION:\n${ledgerText}\n=== REPORT REPAIR (KISWAHILI) ===\nRipoti imekosa: ${missing.map((m) => `${m[0]}. ${m[2]}`).join(", ")}.\nAndika TU sehemu hizo, kila moja iwe na kichwa "## N. Kichwa".${THINK_CAP}` },
        ], repId, true, 20000, { critical: true });
        setItemContent(repId, fix);
        bcast({ type: "msg_done", id: repId });
        ingest(fix);
      } catch { bcast({ type: "msg_done", id: repId }); }
    }

    // ========================================================
    // REPORT TITLE — SINGLE SOURCE OF TRUTH
    // ========================================================
    // Jina la report lazima liwe EXACTLY jina la conversation
    // lililotengenezwa na Optimus mwanzoni.
    // Hakuna AI title-generation ya pili hapa.
    const reportTitle = conversationTitle.trim().slice(0, 250);

    // ===== [PATCH-XMD-V2] VALIDATOR YA RIPOTI: agenda 1..N zote lazima ziwemo =====
    if (collected[4]) {
      const tagged = (n: number) => new RegExp("\\[A" + n + "\\]").test(collected[4] || "");
      const missingAgendas = () => agenda.filter((a) => !tagged(a.index));
      let miss = missingAgendas();
      const byIdx = new Map(fbr.map((e) => [e.agenda_index, e] as const));
      if (miss.length > 0) {
        blog("warning", `⚠️ Validator: ripoti imeacha agenda ${miss.map((a) => a.index).join(", ")} — inarekebishwa kutoka Ledger.`);
        await withActivity("Optimus anakagua agenda zote kwenye ripoti…", async () => {
          try {
            const src = miss
              .map((a) => {
                const e = byIdx.get(a.index);
                return `[A${a.index}] ${a.item}\n${e ? (e.decision_detail ? __cap(e.decision_detail, 6000) : __cap(e.decision_summary, 3000)) : "(Haipo kwenye Ledger — UNRESOLVED)"}`;
              })
              .join("\n\n");
            const fix = await auxChatWithRotation(
              "pm",
              [
                { role: "system", content: "You are Optimus. Write in Kiswahili. Do not invent facts." },
                {
                  role: "user",
                  content: `Ripoti yako imeacha agenda hizi. Zijumuishe SASA kutoka Ledger, kila moja ianze na lebo yake [A<namba>] na uamuzi wake kama ulivyofungwa (usibadilishe maana):\n\n${src}`,
                },
              ],
              3500,
            );
            const cleanFix = fix.replace(thinkRe, "").trim();
            if (cleanFix) collected[4] = `${collected[4].trim()}\n\n${cleanFix}`;
          } catch {}
        });
        miss = missingAgendas();
      }
      if (miss.length > 0) {
        // Stitch ya kiprogramu — hakuna agenda inayopotea.
        for (const a of miss) {
          const e = byIdx.get(a.index);
          collected[4] = `${collected[4].trim()}\n\n- [A${a.index}] **${a.item}** — ${e ? (miniDecisionSection(await miniDetailOf(e), 2500) || __cap(e.decision_summary, 2500)) : "UNRESOLVED (haipo kwenye Ledger)"}`;
        }
        blog("warning", `🧵 Validator: agenda ${miss.map((a) => a.index).join(", ")} zimeongezwa kiprogramu kutoka Ledger.`);
      }
      collected[4] = collected[4].replace(/\[A(\d{1,3})\]/g, "Agenda $1 —");
      blog("success", `✅ Validator: ripoti ina agenda zote ${agenda.length}/${agenda.length}.`);
    }

    // ========================================================
    // DELIVERABLE CAPTURE
    // ========================================================
    // Kazi ya agent iliyotolewa kama code haipaswi kupotea kwenye
    // report kwa sababu transcript ya report imefupishwa.
    //
    // Mfumo unakamata code halisi kutoka kwenye Board Room messages
    // na kuiweka moja kwa moja bila kuomba LLM iandike upya.
    function collectDeliverables(items: SessionItem[]): string[] {
      const blocks: string[] = [];
      const seen = new Set<string>();

      const addBlock = (language: string, code: string) => {
        const clean = code.trim();
        if (!clean || clean.length < 20) return;

        const normalized = clean.replace(/\r\n/g, "\n").trim();
        if (seen.has(normalized)) return;

        seen.add(normalized);
        blocks.push(`\`\`\`${language}\n${normalized}\n\`\`\``);
      };

      for (const it of items) {
        if (it.kind !== "msg" || !it.content) continue;

        const content = it.content
          .replace(thinkRe, "")
          .trim();

        // Standard fenced code blocks:
        // ```html
        // ...
        // ```
        const fenced =
          /```([a-zA-Z0-9_+#-]*)\s*\n([\s\S]*?)```/g;

        let match: RegExpExecArray | null;

        while ((match = fenced.exec(content)) !== null) {
          const lang = (match[1] || "").trim().toLowerCase();
          const code = match[2] || "";

          const looksLikeCode =
            /^(html?|xhtml|css|scss|js|javascript|ts|typescript|tsx|jsx|json|xml|svg|sql|bash|sh|python)$/i.test(lang) ||
            /<!doctype\s+html/i.test(code) ||
            /<html[\s>]/i.test(code) ||
            /<\/?(div|section|canvas|script|style|body|head)[\s>]/i.test(code) ||
            /\b(import|export|const|let|function)\b/.test(code);

          if (!looksLikeCode) continue;

          let finalLang = lang;

          // HTML detection even when the agent forgot the language tag.
          if (
            !finalLang &&
            (/<html[\s>]/i.test(code) ||
             /<!doctype\s+html/i.test(code))
          ) {
            finalLang = "html";
          }

          if (!finalLang) finalLang = "text";

          addBlock(finalLang, code);
        }

        // Raw HTML protection:
        // Kama agent ameandika HTML bila fenced code block,
        // usipoteze deliverable hiyo.
        const rawHtml =
          content.match(/<!doctype\s+html[\s\S]*?<\/html>/i);

        if (rawHtml?.[0]) {
          addBlock("html", rawHtml[0]);
        }
      }

      return blocks;
    }

    // R30: plan mode — hakuna "10.1 Deliverables" (sample code za mjadala si deliverable; plan ndiyo)
    const deliverables = planModeRun ? [] : collectDeliverables(runner.items);
    const finalDeliverableBlock = finalScript
      ? `### 10.1 Script Kamili ya Mwisho (Imeunganishwa na mfumo kutoka Ledger)\n\nHii ni script inayokusanya faili ZOTE zilizokubaliwa (LOCKED) kwa njia ya faili, neno kwa neno kutoka approved_code ya Ledger — hakuna kilichoandikwa upya wala kubuniwa. Kila faili inaonyesha agenda iliyotoka.\n\n${finalScript}`
      : deliverables.length > 0
        ? `### 10.1 Deliverables zilizotolewa kwenye Board Room\n\nHizi ni deliverables halisi zilizotolewa na agents wakati wa mjadala; mfumo umeziweka moja kwa moja bila kuzalisha upya code.\n\n${deliverables.join("\n\n")}`
        : "";

    // R21: ukaguzi wa kideterministic — kilichoongezwa kwenye script ya mwisho (si kwenye approved_code / maamuzi ya Ledger)
    const scriptAuditBlock = finalScript
      ? auditSection(auditScript(finalScript, [runner.project, ...(
            await Promise.all(fbr.map(async (e) => [e.approved_code, e.decision_summary, await miniDetailOf(e), e.carried_constraints, e.rationale, e.trade_off].filter(Boolean).join("\n")))
          )]))
      : "";
    // R26 (F2/F3): 10.3 — DATA RASMI dhidi ya script ya mwisho NA dhidi ya maandishi ya ripoti (jedwali la code, si la LLM)
    let factsAuditBlock = "";
    if (facts) {
      const proseHits = guardText(Object.values(collected).join("\n"), facts, { prose: true, swahiliHoursLocked: swahiliHours });
      const rows: string[] = [];
      if (facts.services.length) rows.push(...facts.services.map((x) => `| Huduma | ${x.name} | ${x.price}${facts.currency ? ` ${facts.currency}` : ""} |`));
      if (facts.hours.length) rows.push(...facts.hours.map((h) => `| Saa | ${h.days} | ${h.time} |`));
      if (facts.address) rows.push(`| Anwani | — | ${facts.address} |`);
      if (facts.phone) rows.push(`| Simu/WhatsApp | — | ${facts.phone.value}${facts.phone.placeholder ? " (placeholder)" : ""} |`);
      if (facts.email) rows.push(`| Barua pepe | — | ${facts.email.forbidden ? "HAKUNA (brief imekataza)" : facts.email.value} |`);
      factsAuditBlock = [
        "### 10.3 DATA RASMI na Ukaguzi wa Usahihi (mfumo)",
        "",
        "_Jedwali hili limetolewa na code kutoka brief (si na LLM). Data Guard imelinganisha kila thamani ndani ya script ya mwisho na ndani ya ripoti hii._",
        "",
        "| Aina | Kipengele | Thamani rasmi |",
        "|---|---|---|",
        ...rows,
        "",
        finalScript ? `**Script ya mwisho:** ${guardSection(scriptHits)}` : planModeRun ? `**Mpango Kazi wa Agent:** ${planHits.length ? guardSection(planHits) : "✅ kila bei, saa, simu, barua pepe na anwani inalingana na DATA RASMI."}` : "",
        "",
        proseHits.length ? `**Maandishi ya ripoti:** ${guardSection(proseHits)}` : "**Maandishi ya ripoti:** ✅ hakuna bei, saa, namba wala barua pepe isiyo rasmi iliyotajwa.",
        codeStatusLine ? `\n**Hali ya code kwa kila agenda (Ledger):** ${codeStatusLine}` : "",
      ].filter((x) => x !== "").join("\n");
      if (proseHits.length) blog("warning", `🛡️ Data Guard · ripoti: ${proseHits.length} — ${proseHits.slice(0, 5).map((h) => `"${h.found}"`).join(", ")}`);
    }
    if (finalDeliverableBlock && collected[10]) {
      collected[10] = `${collected[10].trim()}\n\n${finalDeliverableBlock}${scriptAuditBlock ? `\n\n${scriptAuditBlock}` : ""}${factsAuditBlock ? `\n\n${factsAuditBlock}` : ""}`;
      blog(
        "success",
        finalScript
          ? `📦 Deliverable capture: script ya mwisho iliyounganishwa na Optimus imeingizwa kwenye report.`
          : `📦 Deliverable capture: ${deliverables.length} code block(s) zimeingizwa kwenye report.`
      );
    } else if (!finalDeliverableBlock) {
      blog(
        "info",
        "📦 Deliverable capture: hakuna code deliverable iliyogunduliwa kwenye Board Room."
      );
    }

    const assembled: string[] = [`# Ripoti: ${reportTitle}`, ""];
    for (const d of SECTION_DEFS) if (collected[d[0]]) assembled.push(`## ${d[0]}. ${d[2]}`, "", collected[d[0]].trim(), "");
    // R10: code ya mwisho haipotei hata kama sehemu ya 10 haikuipokea
    if (finalDeliverableBlock && !collected[10]) assembled.push("## Kiambatisho: Code ya Mwisho", "", finalDeliverableBlock, "", ...(scriptAuditBlock ? [scriptAuditBlock, ""] : []), ...(factsAuditBlock ? [factsAuditBlock, ""] : []));
    else if (factsAuditBlock && !finalDeliverableBlock) assembled.push("## Kiambatisho: DATA RASMI na Ukaguzi", "", factsAuditBlock, "");
    // R10: kiambatisho cha kideterministic — mini-reports za mwisho (R30: collection mini_reports; ledger = fallback)
    {
      const minis = (
        await Promise.all(
          fbr.map(async (e) => {
            const md = await miniDetailOf(e);
            return md ? md.split("\n**Maneno halisi ya uamuzi uliofungwa (Ledger):**")[0].replace(/^### /, "### ").trim() : "";
          }),
        )
      ).filter(Boolean);
      if (minis.length) assembled.push("## Kiambatisho: Mini-Reports za Agenda (Optimus)", "", "_Kumbukumbu rasmi za kila agenda kama Optimus alivyoziandika baada ya mjadala wote kuisha._", "", minis.join("\n\n"), "");
    }
    // R30.1 (E1): Plan mode — HAKUNA hatua iliyotekelezwa (computer-use agent ndiye atakayetekeleza).
    // LLM ikidai [x] = udanganyifu wa R29 unaorudi → guard ya mfumo inarudisha kuwa [ ] + log.
    const rawReport = assembled.join("\n").replace(thinkRe, "");
    const planFalseDone = planModeRun ? (rawReport.match(/- \[x\]/gi) || []).length : 0;
    if (planFalseDone) {
      blog("warning", `☑️ Guard ya Plan Mode: ripoti ilidai hatua ${planFalseDone} imekamilika ([x]) — HAKUNA utekelezaji mpaka sasa; zimerudishwa kuwa [ ].`);
    }
    const cleanReport = (planModeRun ? rawReport.replace(/- \[x\]/gi, "- [ ]") : rawReport).trim();
    onReport(cleanReport, [...boardSources, ...runner.items.flatMap((it: any) => (Array.isArray(it?.sources) ? it.sources : []))], blog);
    const missingFinal = SECTION_DEFS.filter((d) => !collected[d[0]]).map((d) => d[2]);
    if (missingFinal.length === 0 && cleanReport.length >= 2000 && runner.finale?.reportId) {
      // R20: ripoti ilikwisha kuhifadhiwa kabla ya kukatika (Endeleza kwa ajili ya memory tu) — haihifadhiwi mara ya pili
      bcast({ type: "report", id: runner.finale.reportId, title: reportTitle, content: cleanReport });
      blog("info", `♻️ Endeleza: ripoti tayari iko Reports (${runner.finale.reportId.slice(0, 8)}…) — haihifadhiwi upya.`);
    } else if (missingFinal.length === 0 && cleanReport.length >= 2000) {
      // R20: mtandao ukikatika wakati wa kuhifadhi → subiri urudi, jaribu tena (mara 3 zaidi ikiwa mtandao upo)
      let rid = await saveReport({ title: reportTitle, project: runner.project, agents: "Timu ya Agents 5", content: cleanReport });
      for (let tries = 0; !rid && tries < 40 && !runner.stopRequested; tries++) {
        if (await isOnline(true)) { if (tries >= 2) break; await new Promise((r) => setTimeout(r, 15_000)); }
        else await waitOnline((runner.pauseAbort ||= new AbortController()).signal, 15_000);
        rid = await saveReport({ title: reportTitle, project: runner.project, agents: "Timu ya Agents 5", content: cleanReport });
      }
      if (rid) runner.finale = { ...(runner.finale || {}), reportId: rid };
      if (rid) {
        bcast({ type: "report", id: rid, title: reportTitle, content: cleanReport });
        blog("success", `✅ Ripoti kamili (${cleanReport.length} chars, 10/10) imehifadhiwa Reports Dashboard.`);
        addChip("🤝 Mjadala umekamilika. Ripoti iko kwenye 📑 Reports.");
      } else {
        blog("error", `❌ Ripoti haikuhifadhiwa Appwrite — ${lastSaveError.report || "sababu haijulikani"}`);
        addChip(`❌ Ripoti imeandikwa lakini IMESHINDWA kuhifadhiwa Appwrite (${(lastSaveError.report || "sababu haijulikani").slice(0, 90)}) — pakua kutoka hapa.`);
      }
    } else {
      blog("error", `❌ Ripoti haina sehemu zote 10. Zinazokosekana: ${missingFinal.join(", ")}`);
      addChip(`❌ Ripoti imekosa: ${missingFinal.join(", ")} — angalia logs.`);
    }
    // R20: "completed" inaandikwa TU sehemu zote zikikamilika (ripoti imehifadhiwa + memory) — kabla ya hapo hali ni ya kati
    await persist(runner.finale?.reportId ? "report_saved" : "report_incomplete", conversationTitle);

    // ===== AGENT BRAIN: Final Reflection → Collector → Consolidation (Optimus, kila agent kando) =====
    brain.state({ status: "done", phase: "memory", reportSaved: !!runner.finale?.reportId });
    let memoryOk = !!runner.finale?.memory;
    if (memoryOk) {
      blog("info", "♻️ Endeleza: memory ya Board ilikwisha kuandikwa — hairudiwi.");
    } else {
      try {
        // R21: kila mstari una status ya Ledger — agenda OPEN haisomeki kama "DECISION LOCKED" kwenye reflection/company memory
        const decisionsBrief = (
          await Promise.all(
            fbr.map(async (e) => `A${e.agenda_index} [${e.status === "LOCKED" ? "LOCKED" : "OPEN — NOT locked"}] ${e.agenda_item}: ${(miniDecisionSection(await miniDetailOf(e), 500) || String(e.decision_summary || "").slice(0, 500)).replace(/\s+/g, " ")}`),
          )
        ).join("\n");
        const mr = await brain.onBoardDone({ decisions: decisionsBrief, open: fbr.filter((e) => e.status !== "LOCKED").map((e) => ({ index: e.agenda_index, item: e.agenda_item })) });
        memoryOk = mr?.ok !== false;
      } catch (err: any) {
        blog("warning", `⚠️ 🧠 Memory ya mwisho wa Board imeshindwa: ${String(err?.message || err).slice(0, 140)}`);
      }
      if (memoryOk) runner.finale = { ...(runner.finale || {}), memory: true };
    }
    let stillMissing = missingParts({ status: "finale", items: runner.items as FinaleItem[], agendaTotal: agenda.length, done: agenda.map((a) => a.index), finale: runner.finale, mode: runner.mode, computerPlanned: runner.computerPlanned });
    // ===== R31 · XMD COMPUTER — awamu ya MWISHO (baada ya card ya MWISHO kabisa ya Board: memory imekamilika).
    // Inaanza YENYEWE — hakuna kitufe (uamuzi #1 wa CEO). Agent MMOJA "XMD Computer" (hana jina) anatekeleza
    // Mpango Kazi kwenye sandbox ya E2B: jenga → jipime (Playwright) → GitHub → Vercel → ripoti ya Kiswahili.
    const cuOnlyMissing = stillMissing.length === 1 && stillMissing[0] === "Utekelezaji wa XMD Computer";
    if (cuOnlyMissing && planModeRun && runner.finale?.planId && runner.computerPlanned && cuEnabled()) {
      runner.cuHooks = { persist, bcast, blog, addChip, recordUsage, usage, byProvider, title: conversationTitle };
      blog("system", "🖥️ Awamu ya XMD COMPUTER inaanza — Mpango Kazi unatekelezwa na agent (E2B sandbox).");
      addChip("🖥️ Awamu ya XMD Computer inaanza — agent anatekeleza Mpango Kazi (E2B sandbox). Hakuna kitufe; inaendelea yenyewe.");
      await startComputerPhase(runner, runner.cuHooks);
      // R31-G4: quota ya siku imeisha → CU imepumzika (doc iko "paused" tayari; auto-resume
      // imeratibiwa). Run inakagua chips za "haijakamilika" mara mbili — inaisha hapa kimya.
      if (runner.cu?.pausedOnce && !runner.cu?.done) {
        runner.status = "error"; // si "completed": Endeleza/auto-resume inaendeleza kawaida
        bcast({ type: "done" });
        return;
      }
      stillMissing = missingParts({ status: "finale", items: runner.items as FinaleItem[], agendaTotal: agenda.length, done: agenda.map((a) => a.index), finale: runner.finale, mode: runner.mode, computerPlanned: runner.computerPlanned });
    }

    if (stillMissing.length) {
      await persist("finale_incomplete", conversationTitle);
      blog("warning", `⚠️ Board haijakamilika: ${stillMissing.join(" · ")} — bonyeza Endeleza kukamilisha.`);
      addChip(`⚠️ Board haijakamilika: ${stillMissing.join(" · ")} — bonyeza ▶ Endeleza kukamilisha kilichobaki.`);
    } else {
      await persist("completed", conversationTitle);
    }

    const total = Object.values(usage).reduce(
      (a, u) => ({ requests: a.requests + u.requests, tokens: a.tokens + u.tokens, prompt: a.prompt + u.prompt, completion: a.completion + u.completion }),
      { requests: 0, tokens: 0, prompt: 0, completion: 0 },
    );
    bcast({ type: "summary", usage: { ...usage, total } });
    // R20: finale isiyokamilika → "error" (si completed) ili Endeleza iweze kuendesha runner huyu tena
    runner.status = stillMissing.length ? "error" : "completed";
    bcast({ type: "done" });
  } catch (err: any) {
    // R16.1: mjadala uliosimamishwa umeachwa kwa makusudi (nafasi ya mijadala iliyosimamishwa imejaa) — kimya
    if (err instanceof BoardStopped || runner.stopRequested) throw err;
    bcast({ type: "error", message: err?.message || "Unexpected error" });
    blog("error", `❌ Critical: ${err?.message}`);
    stateBus.update(runner.id, { status: "halted" });
    runner.status = "error";
    // R31-G4: kosa LINAHIFADHIWA doc (error trail — vifo visivyoonekana vya 6ac3b624/6ac3c713)
    try {
      runner.items.push({ kind: "chip", id: nid(), text: `❌ Run ilikufa: ${String(err?.message || err).slice(0, 220)} — bonyeza ▶ Endeleza kuipokeza.` } as SessionItem);
      await persist("error");
    } catch { /* kimya */ }
    bcast({ type: "done" });
  }
}

// [PATCH-XMD-V2] applied

// [PATCH-XMD-V3-QUERY] applied

// [PATCH-XMD-V5-ARBITER] applied
