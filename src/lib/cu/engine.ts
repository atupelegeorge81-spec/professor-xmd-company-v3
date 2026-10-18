// src/lib/cu/engine.ts — R31 · XMD COMPUTER: engine ya computer-use (Awamu B+C).
//
// Trigger: Board Room inapokamilika KABISA (mjadala → ripoti → memory) na mode="plan" +
// finale.planId ipo + session imepangiwa computer (chip ya resume) → phase "computer"
// inaanza YENYEWE — bila kitufe. Agent MMOJA "XMD Computer" (hana jina/persona) anaingia
// kwenye sandbox ya E2B (professor-xmd-browser-v3), anatekeleza MPANGO KAZI, anajipima
// kwa Playwright (screenshots → bucket), anapush GitHub, ku-deploy Vercel, kuandika ripoti
// ya Kiswahili (document — si card). Events zote: POST /api/boardroom/cu-event (live)
// + events.jsonl NDANI ya sandbox (source of truth ya resume) + stdout (logs).
//
// SHERIA: 503/quota/retries zote NYUMA YA PAZIA (cuBrain) — UI haiona; fatal tu = card moja.
// Appwrite keys HAZIINGII sandbox; gh/Vercel/Gemini keys zinaingia (zinahitajika).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Sandbox } from "@e2b/code-interpreter";
import { InputFile } from "node-appwrite/file";
import { appwriteConfigured, databases, DB, storage, SCREENSHOTS_BUCKET } from "@/lib/server/appwrite";
import { publicFileUrl } from "@/lib/server/supabase"; // R42.1
import { mirrorEvent, mirrorMapOf, restoreFromMirror, sandboxAlive } from "./mirror"; // R44: kiovu + liveness
import { computeFinalOutcome, type CuFinalState } from "./finalState"; // TASK-3
import { isPlanExecutable } from "./planGate"; // TASK-4
import { FEATURE_LIST_SANDBOX_PATH, featureListJson, featuresFromPlan } from "./features"; // R50-Awamu 1
import { getPlanBySession, PROJECT_PLANS_COL, type ProjectPlanDoc } from "@/lib/server/plans";
import { unpack } from "@/lib/server/packed";
import {
  noteGemResult, noteOrResult, noteUnoResult,
  ledger, type GemAcct,
} from "@/lib/server/usageLedger";
import { slotKeys } from "@/lib/server/usageKeys";
import { GEMINI_MODEL_SKIP, cuLiteModels, cuLiteRpd } from "@/lib/env";
import { GEM_ACCOUNTS, type GemAccountId } from "@/lib/usage/accounts";
import type { ProviderUsage, UsageMap } from "@/lib/usageChip";
import type { Runner, PauseOrigin } from "@/lib/boardRunner";
import type { BoardEvent, LogEntry } from "@/lib/types";
import { parseRepoSummary, renderStartPack, REPO_SUMMARY_CMD, type MilestoneStartPack } from "@/lib/milestone/startpack"; // TASK-16
import { cuSilentBridge, maybeCapturePrompt } from "@/lib/milestone/testHooks"; // TASK-16
import { BUILD_REPORT_INLINE_MAX, buildReportPath } from "@/lib/milestone/buildReport"; // TASK-17

/* ============================ env ============================ */

export const CU_TEMPLATE = process.env.CU_E2B_TEMPLATE || "professor-xmd-browser-v3";
/** R31-G: kikomo cha ku-subiri awamu ya CU (run() haiachi stream open milele). */
const CU_HARD_CAP_MS = Number(process.env.CU_HARD_CAP_MS) || 30 * 60 * 1000;
/** TASK-16: njia ya milestone (flag ON) haina cap ya wall-clock — inaachishwa TU ikiwa HAKUNA tukio jipya la bridge kwa muda huu. */
export const CU_LIVENESS_MS = Number(process.env.CU_LIVENESS_MS) || 15 * 60 * 1000;
// R51-Awamu 1: backend ya CU agent — "openhands" (default: SDK native + lanes.py policy + judge)
// au "claude" (legacy Gemini Swap Brain). Mabadiliko ni env tu — contract ya events haigezuki.
const CU_AGENT_BACKEND = (process.env.CU_AGENT_BACKEND || "openhands").toLowerCase() === "claude" ? "claude" : "openhands";
/** R38-RC1: bridge hai lakini hakuna tukio (stream ya LLM imekwama) → onyo (⅓) kisha pause+auto-resume.
 *  Matukio ya kawaida (think_delta/exec) yanafika kila sekunde chache; kutokuwepa kwa dakika 15 = kifo hakika. */
export const CU_STALL_PAUSE_MS = Number(process.env.CU_STALL_PAUSE_MS) || 15 * 60 * 1000;
/** R38-RC5: events zinazoruhusiwa kupita hata run ikiwa pausedNow (kazi halisi ya mwisho haipotei). */
const CU_PAUSE_PASSTHROUGH = new Set(["run_end", "report", "snapshot", "github", "deploy", "finish"]);
export const CU_BUCKET = SCREENSHOTS_BUCKET;
/** URL ya umma ya app hii (sandbox ina-POST events hapa). */
export const CU_PUBLIC_URL = (process.env.CU_PUBLIC_URL || process.env.KOYEB_PUBLIC_URL || "https://professor-xmd-professorcj-2c4d4efe.koyeb.app").replace(/\/$/, "");
const CU_EVENT_PATH = "/api/boardroom/cu-event";
const GITHUB_ORG = process.env.CU_GITHUB_ORG || process.env.GITHUB_ORG || "professor-xmd-company";
const GITHUB_USER = process.env.CU_GITHUB_USERNAME || process.env.GITHUB_USERNAME || "atupelegeorge81-spec";

export function cuEnabled(): boolean {
  return process.env.CU_ENABLED !== "off" && !!process.env.E2B_API_KEY;
}

/* ============================ aina ============================ */

/** Tukio la bridge (sandbox → Koyeb). `i` = namba ya mtiririko (dedupe ya replay). */
export interface CuEvent {
  i: number;
  type: string;
  t?: number;
  [k: string]: unknown;
}

/** Hali ya run ya computer (in-memory, kwenye runner). */
export interface CuRunState {
  token: string;
  sandboxId?: string;
  sandbox?: any;
  heartbeat?: ReturnType<typeof setInterval>;
  seen: Set<string>;
  maxI: number;
  step: number;
  links: { repo?: string; live?: string };
  report?: string;
  files?: unknown[];
  reportSaved?: boolean;
  done: boolean;
  startedAt: number;
  usage: { requests: number; tokens: number; prompt: number; completion: number };
  execs: Map<string, any>;
  textAcc: Map<number, string>;
  /** R31-G: run() ina-await awamu nzima ya CU (stream isifunge mapema — Koyeb free inalala
   *  ikikosa connection, runner na events zikipotea). finishComputer/cuError inaresolve. */
  phaseDone?: Promise<void>;
  phaseResolve?: () => void;
  /** R31-G4: quota ya siku imeisha → pause (si error). pausedOnce = usirudie test-hook; snapshot = faili ya tar.gz kwenye bucket. */
  pausedOnce?: boolean;
  resumeAt?: number;
  /** TASK-1: asili ya pause — user(Detach) haiwakabiliwi na recovery ya system */
  pauseOrigin?: PauseOrigin;
  /** TASK-3: hali ya mwisho ya run (COMPLETED_UNVERIFIED/STUCK/…); ikipo run imefikia run_end */
  finalState?: CuFinalState;
  finalReason?: string;
  snapshot?: { fileId: string; bucketId: string };
  /** R44-B: kifo cha sandbox — resume inarestore kutoka kiovu (cu_files) + ujumbe wa deps. */
  rebuild?: boolean;
  /** R38-RC5: pause ya sasa (manual/watchdog) — tofauti na pausedOnce (historia).
   *  pausedNow=true → events za bridge (isipokuwa run_end) zinakataliwa; inafutwa startComputerPhase ikianza. */
  pausedNow?: boolean;
  /** R38-RC5: pause ya server iko mbioni (tar/snapshot inapangwa) — Resume inasubiri isimalize. */
  pausing?: boolean;
  /** R38-RC1: watchdog ya stall — tukio la mwisho la bridge (live). */
  lastEventAt?: number;
  stallWarned?: boolean;
  watchdogTimer?: ReturnType<typeof setInterval>;
  thinkAcc: Map<number, string>;
  persistTimer?: ReturnType<typeof setTimeout>;
  /** R40: heartbeat polepole ya sandbox wakati wa pause ya watchdog (auto-resume) — sandbox isife */
  slowHeartbeat?: ReturnType<typeof setInterval>;
  /** R40-B: throttle ya blog za "waiting" (countdown) — si kila beat */
  lastWaitBlog?: number;
  lastPersistAt?: number;
}

/** Chip ya kudumu (session items) — resume haipotezi chochote. */
const CU_PREFIX = "__PROFESSOR_XMD_CU_STATE__:";
export const CU_CHIP_ID = "__professor_xmd_cu_state__";
export interface CuChip {
  v: 1;
  sandboxId?: string;
  token: string;
  maxI: number;
  repo?: string;
  live?: string;
  done?: boolean;
  files?: unknown[];
  report?: string;
  pausedOnce?: boolean;
  resumeAt?: number;
  /** TASK-1: asili ya pause (user=Detach hai-acceptwi na system; system=inarecover) */
  pauseOrigin?: PauseOrigin;
  /** TASK-3: hali ya mwisho (stuck haikubaliki tena kuwa "done") */
  finalState?: CuFinalState;
  finalReason?: string;
  snapshot?: { fileId: string; bucketId: string };
  /** R44-B: kifo cha sandbox — resume inarestore kutoka kiovu (cu_files) + ujumbe wa deps. */
  rebuild?: boolean;
}
export const isHiddenCuChip = (it: any) => it?.kind === "chip" && typeof it?.text === "string" && it.text.startsWith(CU_PREFIX);
export function cuChipItem(s: CuChip) {
  return { kind: "chip", id: CU_CHIP_ID, text: CU_PREFIX + JSON.stringify(s) };
}
export function readCuChip(items: any[]): CuChip | null {
  const it = [...(items || [])].reverse().find((x) => isHiddenCuChip(x));
  if (!it) return null;
  try { return JSON.parse(it.text.slice(CU_PREFIX.length)); } catch { return null; }
}

/** Hooks kutoka boardRunner (engine haivurugi flow ya Board — inazipita tu). */
export interface CuHooks {
  persist: (status: string, title?: string) => Promise<void>;
  bcast: (e: BoardEvent) => void;
  blog: (type: LogEntry["type"], message: string, details?: string) => void;
  addChip: (text: string) => void;
  recordUsage: (agentId: string, u: { prompt: number; completion: number; total: number }, exact: boolean, id?: string, provider?: string) => void;
  usage: UsageMap;
  byProvider: ProviderUsage;
  title: string;
}

/** TASK-8: maandishi ni ripoti halisi? (CLI huweka error text yake kama "report"). */
export function isRealReport(t: string): boolean {
  const s = String(t || "").trim();
  return !!s && !/^API Error/i.test(s) && s !== "(hakuna ripoti)";
}

export function ensureCuState(runner: Runner, token?: string): CuRunState {
  if (!runner.cu) {
    // seen inaanza na events ZILIZOHIFADHIWA (i zipo kwenye items) — replay/idhini haizirudii
    const chip = readCuChip(runner.items);
    runner.cu = {
      token: token || chip?.token || Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2),
      sandboxId: chip?.sandboxId,
      seen: new Set(),
      maxI: chip?.maxI || 0,
      step: 0,
      links: { repo: chip?.repo, live: chip?.live },
      report: chip?.report,
      files: chip?.files,
      done: !!chip?.done,
      startedAt: Date.now(),
      usage: { requests: 0, tokens: 0, prompt: 0, completion: 0 },
      execs: new Map(),
      textAcc: new Map(),
      thinkAcc: new Map(),
      // R31-G4: pause (quota) — resume inahitaji haya
      pausedOnce: !!chip?.pausedOnce,
      resumeAt: chip?.resumeAt,
      snapshot: chip?.snapshot,
      rebuild: !!chip?.rebuild, // R44-B: kifo cha sandbox — restore kutoka kiovu
      finalState: chip?.finalState, // TASK-3
      finalReason: chip?.finalReason,
    };
    for (const it of runner.items as any[]) {
      if (it?.kind === "cu" && typeof it.i === "number") runner.cu.seen.add(`${it.cu}:${it.i}`);
      // TASK-8: item ya "report" inatoka tukio la "finish" — replay ya finish ile ile isirudie ripoti
      if (it?.kind === "cu" && it.cu === "report" && typeof it.i === "number") runner.cu.seen.add(`finish:${it.i}`);
      // item ya "files" ile ile inayosasishwa — rudia id yake (item ya pili isionekane)
      if (it?.kind === "cu" && it.cu === "files" && typeof it.id === "string") (runner.cu as any).filesItemId = it.id;
    }
    // TASK-8: chip haina ripoti (finish ilifika BILA runner → orphanPersist) → ichukue kutoka items
    if (!runner.cu.report) {
      const it = [...(runner.items as any[])].reverse().find((x) => x?.kind === "cu" && ((x.cu === "report" && x.text) || (x.cu === "finish" && x.report)));
      const t = it ? String(it.cu === "report" ? it.text : it.report) : "";
      if (isRealReport(t)) runner.cu.report = t.slice(0, 120_000);
    }
  }
  return runner.cu;
}

/* ============================ config ya cuBrain ============================ */

function keysOf(account: string): Record<string, string> {
  const ks = slotKeys(account as any);
  return ks.length ? { [account]: ks[0] } : {};
}

/** Config kamili inayopakiwa sandbox: keys + models + QUOTA SNAPSHOT (ili tusichome 429 ovyo). */
/** Adaptive Brain §6: snapshot ya quota ya ledger ya server (Board + CU) kwa muundo uleule wa
 *  buildCuConfig — sandbox huisoma kila ~60s (POST /api/boardroom/cu-quota) ili CU ione matumizi
 *  ya Board wakati wa run (si mwanzoni tu). Hakuna keys ndani yake. */
export function cuQuotaSnapshot(): { gemini: Record<string, unknown>; or: Record<string, unknown>; at: number } {
  const L = ledger();
  const slots = { "gemini-1": "gem", "gemini-2": "gem2", "gemini-3": "gem3", "gemini-4": "gem4" } as const;
  const gemini: Record<string, unknown> = {};
  for (const [ga, slot] of Object.entries(slots)) {
    const st = (L as any)[slot];
    if (st?.chat) gemini[ga] = { day: st.day, chat: st.chat };
  }
  const or: Record<string, unknown> = {};
  for (const a of ["or-1", "or-2"] as const) {
    const r = L.or?.[a];
    if (r) or[a] = { day: r.day, requests: r.requests, exhaustedUntil: r.exhaustedUntil, retryAt: r.retryAt };
  }
  return { gemini, or, at: Date.now() };
}

export function buildCuConfig(): Record<string, unknown> {
  const L = ledger();
  // R41: akaunti 4 za Gemini — keys na quota snapshot zinajengwa KWA NJIA MOJA (hazijawir hardcode)
  const GEM_SLOTS = { "gemini-1": "gem", "gemini-2": "gem2", "gemini-3": "gem3", "gemini-4": "gem4" } as const;
  const gemKeys: Record<string, string> = {};
  for (const ga of GEM_ACCOUNTS) {
    const envName = ga === "gemini-1" ? "GEMINI_API_KEY_1" : `GEMINI_API_KEY_${ga.split("-")[1]}`;
    const v = ga === "gemini-1" ? (process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY) : process.env[envName];
    if (v) gemKeys[ga] = v;
  }
  const gemQuota: Record<string, { day: string; chat: Record<string, unknown> }> = {};
  for (const [ga, slot] of Object.entries(GEM_SLOTS)) {
    const st = (L as any)[slot];
    if (st?.chat) gemQuota[ga] = { day: st.day, chat: st.chat };
  }
  const flash = (process.env.GEMINI_FLASH_MODELS || "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-2.5-flash").split(",").map(s => s.trim()).filter(Boolean);
  const lite = cuLiteModels();
  const emergency: Record<string, unknown>[] = [];

  const or = { ...keysOf("or-1"), ...keysOf("or-2") };
  const orModels = (process.env.CU_OPENROUTER_MODELS || "nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free")
    .split(",").map(s => s.trim()).filter(Boolean);
  if (Object.keys(or).length) {
    emergency.push({
      provider: "openrouter", baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      models: orModels, keys: or, maxOut: 65_000, ctx: 1_000_000, reasoning: true,
      quota: {
        "or-1": { day: L.or?.["or-1"]?.day, requests: L.or?.["or-1"]?.requests, exhaustedUntil: L.or?.["or-1"]?.exhaustedUntil, retryAt: L.or?.["or-1"]?.retryAt },
        "or-2": { day: L.or?.["or-2"]?.day, requests: L.or?.["or-2"]?.requests, exhaustedUntil: L.or?.["or-2"]?.exhaustedUntil, retryAt: L.or?.["or-2"]?.retryAt },
      },
    });
  }
  const uno = { ...keysOf("uno-1"), ...keysOf("uno-2") };
  // CU allowlist: Laguna, North, Kimi, Codestral na DeepSeek V4 Flash haziwezi
  // kurudishwa hata kwa UNOROUTER_MODELS ya zamani iliyobaki kwenye env.
  const CU_ALLOWED_UNO_MODELS = new Set([
    "minimax-m2.7:free", "deepseek-v4.1-flash:free", "nemotron-3-ultra-550b-a55b:free",
  ]);
  const UNO_DEFAULT = "minimax-m2.7:free,deepseek-v4.1-flash:free,nemotron-3-ultra-550b-a55b:free";
  // CU has its own allowlisted roster: never inherit a broad Board-wide UNOROUTER_MODELS.
  const unoModels = (process.env.CU_UNOROUTER_MODELS || UNO_DEFAULT).split(",").map(s => s.trim()).filter(m => m && CU_ALLOWED_UNO_MODELS.has(m));
  if (Object.keys(uno).length) {
    emergency.push({
      provider: "unorouter", baseUrl: process.env.UNOROUTER_BASE_URL || "https://api.unorouter.com/v1",
      models: unoModels, keys: uno, maxOut: 128_000, ctx: 1_000_000, reasoning: false,
      quota: {
        "uno-1": { models: L.uno?.["uno-1"]?.models || {}, exhaustedUntil: L.uno?.["uno-1"]?.exhaustedUntil },
        "uno-2": { models: L.uno?.["uno-2"]?.models || {}, exhaustedUntil: L.uno?.["uno-2"]?.exhaustedUntil },
      },
    });
  }

  return {
    port: 4010,
    // R40-F · "kopa kidogo": dirisha la context (system+plan+karibuni vinaendelea kamili;
    // ya zamani yanabanwa — picha za zamani zinaondolewa). Brain (compact_messages) anatumia.
    ctx: {
      window: Number(process.env.CU_CTX_WINDOW) || 10,
      toolChars: Number(process.env.CU_CTX_TOOL_CHARS) || 200,
      textChars: Number(process.env.CU_CTX_TEXT_CHARS) || 600,
    },
    gemini: {
      keys: gemKeys, // R41: gemini-1..4 (zilizopo pekee)
      flashModels: flash, liteModels: lite,
      modelSkip: GEMINI_MODEL_SKIP, // R38: (akaunti × model) zilizo 404 — mf. gemini-2:gemini-2.5-flash (brain.py hazizalishi)
      flashRpd: Number(process.env.GEMINI_FLASH_RPD) || 20,
      liteRpd: Number(process.env.GEMINI_LITE_RPD) || 500,
      // 500 RPD imethibitishwa kwa base 3.1/3.5 Flash-Lite pekee. Preview/latest
      // hutumia cap ya tahadhari 20 hadi owner athibitishe limit; env inaweza kubadilisha.
      liteRpdByModel: Object.fromEntries(lite.map((m) => [m, cuLiteRpd(m)])),
      flashRpm: Number(process.env.GEMINI_FLASH_RPM) || 5,
      liteRpm: Number(process.env.GEMINI_LITE_RPM) || 15,
      tpmLimit: Number(process.env.GEMINI_TPM_LIMIT) || 200_000, // R40-A: tokens/dakika kwa kila lane — kabla ya 429
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
      quota: gemQuota, // R41: snapshot ya kila akaunti (gem/gem2/gem3/gem4)
    },
    emergency,
  };
}

/* ============================ plan → task file ============================ */

async function planDocFor(runner: Runner): Promise<ProjectPlanDoc | null> {
  if (runner.finale?.planId && appwriteConfigured) {
    try {
      const { Query } = await import("node-appwrite");
      const res = await databases.listDocuments(DB, PROJECT_PLANS_COL, [Query.equal("$id", runner.finale.planId), Query.limit(1)] as any);
      if (res.documents[0]) return res.documents[0] as unknown as ProjectPlanDoc;
    } catch { /* twende ka session */ }
  }
  return runner.sessionId ? await getPlanBySession(runner.sessionId) : null;
}

export async function planMarkdown(runner: Runner): Promise<{ title: string; md: string; steps: number; status: string; warnings: string[] } | null> {
  const doc = await planDocFor(runner);
  if (!doc) return null;
  return {
    title: doc.title || runner.project.slice(0, 120),
    md: unpack(doc.plan_content) || doc.plan_content || doc.objective || "",
    steps: doc.total_steps || 0,
    status: String(doc.status || ""), // TASK-4: gate inasoma status (guard_failed/structure_failed)
    warnings: Array.isArray(doc.warnings) ? doc.warnings.map(String) : [],
  };
}

/** TASK-4: Mpango Kazi umezuiwa — sandbox HAIUNDWI; BLOCKED + sababu zinaonekana (chip, log, items, export). */
function blockComputerForPlan(runner: Runner, hooks: CuHooks, reasons: string[]): void {
  const cu = runner.cu!;
  const reason = reasons.join(" · ").slice(0, 600);
  const message = `⛔ Plan blocked: ${reason}`;
  cu.finalState = "BLOCKED";
  cu.finalReason = reason;
  hooks.bcast({ type: "cu", cu: { type: "error", message } });
  runner.items.push({ kind: "cu", id: `cu_err_${runner.items.length}`, cu: "error", message } as any);
  runner.items.push({ kind: "cu", id: `cu_end_${runner.items.length}`, cu: "run_end", status: "blocked", finalState: "BLOCKED", finalReason: reason, steps: 0, ms: 0 } as any);
  hooks.blog("error", `${message} — XMD Computer HAIKUANZISHWA (sandbox haikuundwa).`);
  hooks.addChip(`${message} — XMD Computer haikuanza. Rekebisha Mpango Kazi kisha bonyeza ▶ Endeleza.`);
  cu.phaseResolve?.();
  writeCuChip(runner);
  hooks.bcast({ type: "cu", cu: { type: "phase_done", ok: false, status: "blocked", finalState: "BLOCKED", finalReason: reason } });
  void hooks.persist("finale_incomplete", hooks.title);
}

/* ============================ sandbox lifecycle ============================ */

const q = (x: string) => `'${String(x).replace(/'/g, `'\\''`)}'`;
const VENV_PY = "/code/openhands-venv/bin/python";

async function readCuFile(name: string): Promise<string> {
  return readFile(join(process.cwd(), "cu", name), "utf8");
}

async function getSandbox(cu: CuRunState): Promise<any> {
  // R44-C (kosa la KilimoSmart): sandbox ya mkononi PING kwanza — maiti isirudishwe
  // (resume ilirudisha cu.sandbox iliyo kufa → "not found" kila mara, create haikufika).
  if (cu.sandbox) {
    if (await sandboxAlive(cu.sandbox)) return cu.sandbox;
    cu.sandbox = undefined;
    cu.sandboxId = undefined;
  }
  const apiKey = process.env.E2B_API_KEY!;
  if (cu.sandboxId) {
    // R31-G4: sandbox ya zamani (pause/error) — connect kwenye iliyouawa inaweza HANGA
    // bila kosa (run ya 6ac3ce60 ilikaa dakika 22!). Timebox sekunde 25 = kama imekufa.
    try {
      const sbx = await Promise.race([
        Sandbox.connect(cu.sandboxId, { apiKey }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B connect timeout (25s)")), 25_000).unref?.()),
      ]);
      await sbx.setTimeout(55 * 60_000).catch(() => {}); // R44: resume inarejesha clock — panua dirisha
      cu.sandbox = sbx;
      return sbx;
    } catch { /* imikufa / imehangia → mpya */ }
  }
  // R44-B: create na timeoutMs 55dk (chini ya ukuta wa saa 1 ya Hobby) + onTimeout:"pause"
  // (beta — kifo kinakuwa pumziko). SDK ikiikataa → plain create (death protocol inabaki).
  try {
    const sbx = await Promise.race([
      Sandbox.create(CU_TEMPLATE, { apiKey, timeoutMs: 55 * 60_000, lifecycle: { onTimeout: "pause" } } as any),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B create timeout (90s)")), 90_000).unref?.()),
    ]);
    (sbx as any).__xmdFresh = true; // R44-B: iliyoundwa sasa — node_modules hazipo, deps za install
    cu.sandbox = sbx;
    cu.sandboxId = sbx.sandboxId;
    return sbx;
  } catch (e: any) {
    if (!/lifecycle|onTimeout/i.test(String(e?.message || e))) throw e;
    const sbx = await Promise.race([
      Sandbox.create(CU_TEMPLATE, { apiKey, timeoutMs: 55 * 60_000 }),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B create timeout (90s)")), 90_000).unref?.()),
    ]);
    (sbx as any).__xmdFresh = true; // R44-B: fallback create — mpya vilevile
    cu.sandbox = sbx;
    cu.sandboxId = sbx.sandboxId;
    return sbx;
  }
}

function bridgeCommand(o: {
  title: string; session: string; token: string; startI: number; resumeNote: string; restoreUrl?: string; taskFile?: string;
  /** TASK-17: awamu ya milestone → bridge inaweka mkataba wa Build Report (.xmd/reports/<Mk>-build-report.md) */
  milestone?: string;
}): string {
  const common = [
    `cd /home/user && bash /home/user/cu_setup.sh;`,
    `PATH=/home/user/.local/bin:/home/user/node_modules/.bin:/usr/local/bin:$PATH`,
    `PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright`,
    `PYTHONUNBUFFERED=1`,
    // R51: setup.sh inajua backend ipi iandae (claude pip vs oh import-check)
    `CU_AGENT_BACKEND=${CU_AGENT_BACKEND}`,
    // R32: URL ya search tool (MCP in-process ya bridge inapiga route ya Koyeb kwanza,
    // fallback SearXNG direct). Hakuna token budget — agizo la CEO 06-10 usiku.
    `CU_SEARCH_URL=${q(CU_PUBLIC_URL + "/api/boardroom/cu-search")}`,
    `GITHUB_TOKEN=${q(process.env.CU_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "")}`,
    `GH_TOKEN=${q(process.env.CU_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "")}`,
    `GITHUB_ORG=${q(GITHUB_ORG)}`,
    `GITHUB_USERNAME=${q(GITHUB_USER)}`,
    `VERCEL_TOKEN=${q(process.env.CU_VERCEL_TOKEN || process.env.VERCEL_TOKEN || "")}`,
  ];
  const sharedArgs = [
    `--task-file ${o.taskFile || "/home/user/plan.md"}`,
    `--title ${q(o.title.slice(0, 300))}`,
    `--session ${q(o.session)}`,
    `--start-i ${o.startI}`,
    `--callback-url ${q(CU_PUBLIC_URL + CU_EVENT_PATH)}`,
    `--callback-token ${q(o.token)}`,
  ];
  if (o.resumeNote) sharedArgs.push(`--resume-note ${q(o.resumeNote.slice(0, 3000))}`);
  if (o.restoreUrl) sharedArgs.push(`--restore-url ${q(o.restoreUrl)}`);
  if (o.milestone) sharedArgs.push(`--milestone ${q(o.milestone)}`);
  if (CU_AGENT_BACKEND === "openhands") {
    // R51: OpenHands SDK native — hakuna ANTHROPIC_*, hakuna brain (lanes.py ndani ya oh_bridge)
    const env = [...common, `OPENHANDS_SUPPRESS_BANNER=1`].join(" ");
    return `${env} ${VENV_PY} /home/user/oh_bridge.py ${sharedArgs.join(" ")}`;
  }
  const env = [
    ...common,
    `ANTHROPIC_BASE_URL=http://127.0.0.1:4010`,
    `ANTHROPIC_API_KEY=sk-xmd-local`,
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
  ].join(" ");
  return `${env} ${VENV_PY} /home/user/cu_bridge.py ${sharedArgs.join(" ")}`;
}

/** R51: faili za engine zinazoandikwa kwenye sandbox kila run — [sandboxPath, src] (backend inaamua seti). */
async function loadEngineFiles(): Promise<Array<[string, string]>> {
  const pairs: Array<[string, string]> = // [sandboxPath, repoName]
    CU_AGENT_BACKEND === "openhands"
      ? [
          ["/home/user/bridge.py", "bridge.py"], // oh_bridge ina-import 'bridge' (Emitter/files/snapshot)
          ["/home/user/lanes.py", "lanes.py"],
          ["/home/user/oh_util.py", "oh_util.py"],
          ["/home/user/oh_router.py", "oh_router.py"],
          ["/home/user/shotlaw.py", "shotlaw.py"],
          ["/home/user/xmd_shot.py", "xmd_shot.py"],
          ["/home/user/xmd-law.md", "xmd-law.md"],
          ["/home/user/features_verify.py", "features_verify.py"], // Awamu 2: harness gate
          ["/home/user/oh_bridge.py", "oh_bridge.py"],
          ["/home/user/cu_setup.sh", "setup.sh"],
        ]
      : [
          ["/home/user/cu_brain.py", "brain.py"],
          ["/home/user/cu_bridge.py", "bridge.py"],
          ["/home/user/cu_setup.sh", "setup.sh"],
        ];
  const srcs = await Promise.all(pairs.map(([, n]) => readCuFile(n)));
  return pairs.map(([p], i) => [p, srcs[i]]);
}

/* ============================ PHASE: kuanza / kuendelea ============================ */

export async function startComputerPhase(runner: Runner, hooks: CuHooks): Promise<void>;
export async function startComputerPhase(runner: Runner, hooks: CuHooks, phase: MilestonePhaseInput): Promise<MilestoneBuildOutcome>;
export async function startComputerPhase(runner: Runner, hooks: CuHooks, phase?: MilestonePhaseInput): Promise<void | MilestoneBuildOutcome> {
  // TASK-16: XMD_MILESTONES — awamu ya milestone MOJA (context mpya, bridge mpya) → inarudi kwenye kitanzi
  if (phase) return startMilestonePhase(runner, hooks, phase);
  const cu = ensureCuState(runner);
  if (cu.done) return;
  // R38-RC5: awamu inaanza → pause ya ZAMANI inaisha (events mpya za bridge zinakubalika tena)
  cu.pausedNow = false;
  // TASK-3: run mpya/inayoendelezwa → hali ya mwisho ya run iliyopita (mf. STUCK) si ya sasa tena
  cu.finalState = undefined; cu.finalReason = undefined;
  // R31-G4: awamu MPYA = promise MPYA (ile ya run iliyopita imesharesolve — bila hii,
  // awaitPhase ingerudi MARA MOJA na run ingeisha huku bridge bado unaendelea)
  cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
  // R51-fix (chip-ya-uongo): cap ni DEAD-MAN tu. CU ikiwa ina events HALISI za hivi karibuni
  // (lastRealAt — huvuka kila tukio isipokuwa 'usage'), cap ya wall-clock haifai kuisitisha;
  // subiri window nyingine. Kielelezo cha run halisi >30min haikatizwi tena.
  const awaitPhase = async () => {
    for (;;) {
      let resolved = false;
      await Promise.race([
        (cu.phaseDone ?? Promise.resolve()).then(() => { resolved = true; }),
        new Promise<void>((r) => setTimeout(r, CU_HARD_CAP_MS)),
      ]);
      if (resolved || cu.done) return;
      const lastReal = (cu as any).lastRealAt || cu.lastEventAt || cu.startedAt || 0;
      if (Date.now() - lastReal < CU_HARD_CAP_MS) continue; // hai — subiri window nyingine
      return; // dead-man: window NZIMA ya cap bila tukio lolote halisi
    }
  };

  // ── divider + card ya kuanza (baada ya card ya MWISHO kabisa ya Board — memory imekamilika)
  hooks.bcast({ type: "cu", cu: { type: "divider" } });
  runner.items.push({ kind: "cu", id: `cu_divider_${runner.items.length}`, cu: "divider" } as any);
  hooks.blog("system", "🖥️ Awamu ya XMD COMPUTER inaanza — agent anatekeleza Mpango Kazi (E2B sandbox).");

  const plan = await planMarkdown(runner);
  if (!plan) {
    cuError(runner, hooks, "Mpango Kazi haukupatikana kwenye project_plans — computer-use haiwezi kuanza.");
    return;
  }
  // TASK-4: gate KABLA ya sandbox — plan iliyoshindwa guard/muundo HAITEKELEZWI
  const gate = isPlanExecutable({ status: plan.status, md: plan.md, warnings: plan.warnings });
  if (!gate.ok) {
    blockComputerForPlan(runner, hooks, gate.reasons);
    return;
  }
  if (gate.warnings.length) {
    hooks.addChip(`⚠️ Mpango Kazi una warnings ${gate.warnings.length} (hazizuii utekelezaji): ${gate.warnings.join(" · ").slice(0, 300)}`);
    hooks.blog("warning", `⚠️ Mpango Kazi warnings: ${gate.warnings.join(" · ").slice(0, 400)}`);
  }

  const resume = cu.maxI > 0;
  if (resume) hooks.blog("info", `♻️ XMD Computer inaendelea (resume) — events ${cu.maxI} zilizoongozwa nazo zipo.`);

  // R51: file set inategemea backend (claude=brain+bridge; oh=bridge+lanes*+oh_bridge+sheria)
  let cuFiles: Array<[string, string]> = []; // [sandboxPath, src]
  try {
    cuFiles = await loadEngineFiles();
  } catch (e: any) {
    cuError(runner, hooks, `Faili za engine (cu/) hazipatikani kwenye server: ${String(e?.message || e).slice(0, 140)}`);
    return;
  }

  try {
    const sbx = await getSandbox(cu);
    try { await sbx.setTimeout(60 * 60 * 1000); } catch { /* */ }

    // ♻️ RESUME: (1) replay ya events zilizokosekana kutoka events.jsonl (Koyeb ilipotea)
    let bridgeAlive = false;
    if (resume) {
      try {
        const raw = await sbx.files.read("/home/user/events.jsonl");
        const lines = String(raw || "").split("\n").filter(Boolean);
        let replayed = 0;
        let lastEnd: any = null;
        for (const line of lines) {
          try {
            const ev = JSON.parse(line);
            if (typeof ev.i !== "number") continue;
            if (ev.type === "run_end") { lastEnd = ev; if (ev.i > cu.maxI) cu.maxI = ev.i; continue; }
            // TASK-8: finish ilihifadhiwa na orphanPersist (bila maandishi) → seen inairuka → ripoti ilipotea → PARTIAL ya uongo
            if (ev.type === "finish" && cu.seen.has(`finish:${ev.i}`) && !cu.report && isRealReport(String(ev.report || ""))) {
              cu.report = String(ev.report).slice(0, 120_000);
              runner.items.push({ kind: "cu", id: `cu_report_${runner.items.length}`, i: ev.i, cu: "report", text: cu.report, partial: ev.partial, status: ev.status } as any);
              hooks.blog("info", "♻️ Ripoti ya bridge (ilifika bila runner) imerejeshwa kutoka events.jsonl.");
              continue;
            }
            const before = cu.seen.size;
            await handleCuEvent(runner, hooks, ev);
            if (cu.seen.size > before) replayed++;
          } catch { /* mstari mbovu — ruuka */ }
        }
        hooks.blog("info", `♻️ Replay: events ${replayed} zimeproviwa kutoka sandbox (zilizokwishahifadhiwa hazirudiwi).`);
        (cu as any).lastEnd = lastEnd;
      } catch {
        hooks.blog("warning", "♻️ events.jsonl haikusomeka (sandbox mpya au faili hakuna) — run inaanza safi.");
      }
      // (2) bridge bado hai? → USIANZISHE Nyingine (double-run ni sumu)
      try {
        const r = await sbx.commands.run("pgrep -f '[c]u_bridge\\.py|[o]h_bridge\\.py' >/dev/null 2>&1 && echo ALIVE || echo DEAD", { timeoutMs: 15_000 });
        bridgeAlive = String(r?.stdout || "").includes("ALIVE");
      } catch { /* */ }
      // run_end ipo events.jsonl + bridge IMEKUFA → awamu inakamilika kutoka replay
      // (Koyeb ilipotea kabla ya POST zote kufika — muda wa ushairi). Idempotent: dedupe
      // ya run_end inaondolewa ili finishComputer iweze kukamilisha hata kama item ipo tayari.
      const lastEnd = (cu as any).lastEnd;
      if (!bridgeAlive && lastEnd && String(lastEnd.status) === "paused_quota") {
        // R31-G4: pause tayari ipo records (item + chip + snapshot bucket) — USI-RE-PAUSE.
        // (Kosa la test ya 6ac3b624: replay ilirudisha paused_quota run_end → pauseComputer
        // tena → timer ya 5s → loop isiyo na mwisho bila traffic → instance ililala.)
        // Mstari huu: bridge inaanzishwa upya HAPA CHINI na --restore-url ya snapshot.
        hooks.blog("info", "♻️ Pause ya quota ipo records tayari — bridge inaanzishwa upya (workspace inarejeswa kutoka snapshot).");
      } else if (!bridgeAlive && lastEnd) {
        hooks.blog("success", "♻️ Bridge imemaliza huko nyuma (Koyeb ilipotea) — run_end inacompletishwa kutoka replay.");
        cu.seen.delete(`run_end:${lastEnd.i}`);
        await handleCuEvent(runner, hooks, lastEnd);
        if (cu.done) return;
        // run_end ya kosa → fatal card ipo; Endeleza itaanza run mpya (hapa chini haitaji — tunarudi)
        return;
      }
      // R31-G4: quota-pause + bridge "hai" = ZOMBIE (run_end yake imeshatoka; process imetulia
      // bila kufa — kosa la 6ac3ce60: attach ilisubiri events za milele). Inauawa chini kabla ya launch.
      (cu as any).__zombie = bridgeAlive && !!cu.pausedOnce && !cu.done;
      if (bridgeAlive && !(cu as any).__zombie) {
        hooks.blog("success", "🖥️ Bridge bado inaendelea ndani ya sandbox — tume-attach tu ( hakuna run mpya).");
        cu.startedAt = Date.now();
        cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);
        startLiveness(runner, hooks, cu, sbx); // R44-B: kifo cha sandbox kinagundulika dakika 3-6
        startWatchdog(runner, hooks, cu); // R38-RC1: bridge hai lakini ikinyamaza → onyo/pause
        await awaitPhase();
        return;
      }
    }

    // kila run: files fresh (mfumo wa XMD — sandbox isibaki na code ya zamani)
    for (const [p, src] of cuFiles) await sbx.files.write(p, src);
    await sbx.files.write("/home/user/plan.md", plan.md);
    // R50-Awamu 1: feature_list.json — harness inaitengeneza kutoka mpango KABLA agent kuanza
    // (default-FAIL: state zote "pending", checks "not_run"). Agent anagusa state/evidence
    // pekee; Awamu 2 inathibitisha. Resume: mirror inaweza kurudisha toleo la agent juu ya hili.
    try {
      const fl = featuresFromPlan(plan.md, { runId: String(runner.sessionId || runner.id || "") });
      if (fl.features.length) {
        await sbx.files.write(FEATURE_LIST_SANDBOX_PATH, featureListJson(fl));
      }
    } catch (e) {
      console.warn(`[cu] feature_list.json: ${String(e).slice(0, 140)}`);
    }
    const cuCfg = buildCuConfig() as Record<string, unknown>;
    const testPauseMs = Number(process.env.CU_TEST_QUOTA_PAUSE_MS) || 0;
    if (testPauseMs && !cu.pausedOnce) cuCfg.test_quota_pause_ms = testPauseMs; // traffic ya uongo (test ya auto-resume)
    await sbx.files.write("/home/user/cu-config.json", JSON.stringify(cuCfg));

    // R44-B: RESTORE — kiovu (cu_files) kwanza: freshest (kila write); tar ya snapshot ni fallback.
    let mirrorCount = 0;
    // TASK-8: zamani tar ilitumika TU kiovu kikiwa tupu — kiovu pungufu (k.m. faili za shell) kilipoteza faili za tar.
    // Sasa: sandbox MPYA + snapshot → tar inarejeshwa kwanza (engine), kiovu kinafuata juu yake.
    let tarRestored = false;
    if (resume && (sbx as any).__xmdFresh && cu.snapshot?.fileId && !cu.done) {
      const url = publicFileUrl(cu.snapshot.bucketId || CU_BUCKET, cu.snapshot.fileId);
      try {
        const r: any = await sbx.commands.run(
          `mkdir -p /home/user/ws && cd /home/user/ws && export XMD_URL=${q(url)} && { (curl -fsSL --max-time 180 "$XMD_URL" | tar xzf -) || python3 -c ${q(`import os,io,tarfile,urllib.request as u; tarfile.open(fileobj=io.BytesIO(u.urlopen(os.environ["XMD_URL"],timeout=180).read()),mode="r:gz").extractall(".")`)}; } && echo XMD_TAR_OK`,
          { timeoutMs: 200_000 });
        tarRestored = String(r?.stdout || "").includes("XMD_TAR_OK");
      } catch { /* fallback: bridge --restore-url (njia ya zamani) */ }
      hooks.blog(tarRestored ? "success" : "warning", tarRestored
        ? "🎒 Snapshot (tar) imerejeshwa kwenye sandbox mpya — kiovu kinafuata juu yake."
        : "🎒 Snapshot (tar) haikurejesheka na engine — bridge itajaribu --restore-url.");
    }
    if (resume) {
      mirrorCount = await restoreFromMirror(runner.sessionId || runner.id, sbx);
      if (mirrorCount > 0) hooks.blog("success", `🪞 Kiovu: faili ${mirrorCount} za agent zimerudishwa kwenye sandbox — sandbox mpya imejaa kazi yako.`);
    }
    let resumeNote = resume ? buildResumeNote(runner) : "";
    // R44-B (panuliwa R45): note ya death-protocol — kila SANDBOX MPYA inayorudisha faili
    // kutoka kiovu (liveness-kifo AU error-run_end iliyofuta sandbox) — si rebuild-flag tu.
    if (resume && (cu.rebuild || (mirrorCount > 0 && (sbx as any).__xmdFresh))) {
      resumeNote = `IMPORTANT: The previous sandbox is GONE (it died or timed out). This is a NEW sandbox. All ${mirrorCount} of your files have been restored from the mirror (including STATUS.md). START BY reinstalling all dependencies (npm install etc. — package.json/STATUS.md have the details), THEN continue from where you stopped. Do NOT redo work that is already done.` + (resumeNote ? `\n\n${resumeNote}` : "");
      cu.rebuild = false;
    }
    // R31-G4+R44: tar ya snapshot inarejesha pale KIOVU hakina kitu
    const restoreUrl = resume && !tarRestored && mirrorCount === 0 && cu.snapshot?.fileId && !cu.done
      ? publicFileUrl(cu.snapshot.bucketId || CU_BUCKET, cu.snapshot.fileId) // R42.1: Supabase public URL
      : undefined;
    const cmd = bridgeCommand({
      title: plan.title, session: runner.sessionId || runner.id, token: cu.token,
      startI: cu.maxI, resumeNote, restoreUrl,
    });
    hooks.blog("api", `🚀 Sandbox ${cu.sandboxId?.slice(0, 8)}… — bridge inaanzishwa${resume ? " (resume)" : ""}.`);

    cu.startedAt = Date.now();
    // R31-G4: zombie (pause) inauawa KABLA ya launch — pkill pattern '[c]u_bridge.py'
    // isijimatch bash inayoi-execute (kosa la 6ac3ce60: pkill -f cu_bridge.py iliua
    // bridge MPYA yenyewe + bash yake mara tu baada ya launch)
    if ((cu as any).__zombie) {
      hooks.blog("warning", "🧟 Bridge ya pause ni zombie (run_end yake imeshatoka) — inauawa, run MPYA inaanzishwa.");
      await sbx.commands.run("pkill -9 -f '[c]u_bridge\\.py|[o]h_bridge\\.py' || true", { timeoutMs: 15_000 }).catch(() => {});
    }
    const handle = await sbx.commands.run(`bash -lc ${q(cmd)}`, {
      background: true, timeoutMs: 60 * 60 * 1000,
      onStdout: (d: string) => { for (const l of String(d).split("\n")) if (l.startsWith("@@XMD ")) hooks.blog("info", `🖥️ ${l.slice(6, 400)}`); },
      onStderr: (d: string) => { const s = String(d).trim(); if (s) hooks.blog("warning", `🖥️ stderr: ${s.slice(0, 300)}`); },
    });

    // heartbeat: sandbox isife wakati run inaendelea
    if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; } // R40: kasi inachukua
    cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);
    startLiveness(runner, hooks, cu, sbx); // R44-B: mpigo wa maisha — kifo kinagundulika dakika 3-6
    startWatchdog(runner, hooks, cu); // R38-RC1: bridge hai lakini ikinyamaza → onyo/pause

    // watchdog: bridge ikifa bila run_end → fatal card moja (+ Endelea inabaki)
    handle.wait().then(async (r: any) => {
      if (!cu.done && runner.status === "running") {
        hooks.blog("error", `🖥️ Bridge imekufa (code ${r?.exitCode ?? "?"}) bila kumaliza.`);
        await handleCuEvent(runner, hooks, { i: cu.maxI + 1, type: "run_end", status: "error", steps: cu.step, ms: Date.now() - cu.startedAt, fatal: `bridge exit ${r?.exitCode ?? "?"}` });
      }
    }).catch(() => { /* kimya — run_end imeshakuja */ });

    // R31-G: run() ina-await awamu nzima — stream haifungi mapema (Koyeb free inalala
    // bila connection, runner na events zote zikizama). Cap: dakika 30.
    await awaitPhase();
  } catch (e: any) {
    // R44-B: sandbox haipo (imekufa/timeout) → si kosa la kudumu — jenga mpya (mara moja;
    // jaribio la pili lifeli = kosa halisi lililo juu ya E2B, si maiti ya cache).
    if (/not found|sandbox timeout|paused sandbox/i.test(String(e?.message || e)) && runner.cu && !runner.cu.done && !runner.cu.pausedNow && !runner.cu.rebuild) {
      pauseForRebuild(runner, hooks, "Sandbox ya E2B haipatikani (imekufa/imepumzika)");
      return;
    }
    cuError(runner, hooks, `Sandbox ya E2B haikuwezekana: ${String(e?.message || e).slice(0, 200)}`);
  }
}

/** Maelezo ya resume kwa agent (hali halisi — si madai): hatua ya ndani + kazi zilizoonekana. */
function buildResumeNote(runner: Runner): string {
  const cu = runner.cu!;
  const execs = runner.items.filter((it: any) => it?.kind === "cu" && it?.cu === "exec").slice(-12).map((it: any) => `${it.tool}: ${String(it.command || "").slice(0, 80)}`);
  return `A previous run stopped at internal step ${cu.step}. Recent completed commands: ${execs.join(" | ") || "(none recorded)"}. The workspace /home/user/ws may still contain that work — INSPECT it first, do not redo what is already done, then continue the plan from where it stopped.`;
}

/* ============================ TASK-16: awamu ya Computer kwa kila milestone ============================ */

export interface MilestonePhaseInput {
  milestoneId: string;
  planMarkdown: string;
  startPack: MilestoneStartPack;
  title?: string;
  /** milestone ya mwisho kwenye ramani → sandbox inauawa baada ya awamu (nyingine: inabaki kwa M inayofuata) */
  last?: boolean;
}

/** Matokeo ya awamu moja. finalState kutoka computeFinalOutcome (task 3); "PAUSED" = Board ilipumzishwa katikati. */
export interface MilestoneBuildOutcome {
  ok: boolean;
  finalState: CuFinalState | "PAUSED";
  reason: string;
  report?: string;
  sandboxId?: string;
  freshSandbox?: boolean;
  restored?: number;
  gitLog?: string;
  /** TASK-17: Build Report iliyosomwa kutoka sandbox + faili zilizobadilika kwenye awamu hii (git) */
  buildReport?: MsBuildReportRaw;
  ms: number;
}

/** TASK-17: ripoti ghafi (harness inaisoma; loop inaikagua na kuihifadhi). */
export interface MsBuildReportRaw {
  found: boolean;
  path: string;
  markdown: string;
  /** ripoti > BUILD_REPORT_INLINE_MAX → nakala kamili Supabase storage */
  fileId?: string;
  /** `git diff --name-only <HEAD ya mwanzo wa awamu> HEAD` (repo mpya: faili zote za commit ya kwanza) */
  changed: string[];
}

/** Hali zinazomaliza hatua ya build kama FAILED (spec 6). PAUSED_QUOTA → milestone PAUSED_QUOTA. */
export const MS_BUILD_FAIL_STATES: readonly string[] = ["STUCK", "BLOCKED", "ERROR", "PAUSED_QUOTA"];

const MS_GIT = "git -c user.name='XMD Computer' -c user.email='computer@professor-xmd.local'";
/** faili za harness/installs — hazi-commitiwi kwenye repo ya mradi (.git/info/exclude, si .gitignore ya mradi) */
const MS_GIT_EXCLUDE = ["node_modules/", ".xmd/oh/", ".cache/", "plan.md", "feature_list.json", "AGENTS.md"];
const MS_KILL_BRIDGE = "pkill -9 -f '[c]u_bridge\\.py|[o]h_bridge\\.py|[s]leep 86400' || true";
const MS_SNAP = "/tmp/xmd-ms-ws.tar.gz";

/** Snapshot ya mwisho wa awamu: tar.gz ya /home/user/ws (PAMOJA na .git — historia inaendelea) → bucket → cu.snapshot.
 *  Kiovu (cu_files) kinanasa maandishi ya file editor tu; faili za terminal (printf/echo >>) zinaokolewa na tar hii. */
async function msSnapshot(sbx: any, cu: CuRunState, hooks: CuHooks, id: string): Promise<number> {
  try {
    const r: any = await sbx.commands.run(
      `cd /home/user/ws && tar czf ${MS_SNAP} --exclude node_modules --exclude ./.cache --exclude ./.xmd/oh --exclude ./playwright-report . 2>/dev/null; stat -c%s ${MS_SNAP} 2>/dev/null || echo 0`,
      { timeoutMs: 120_000 });
    const size = Number(String(r?.stdout || "").trim().split(/\s+/).pop()) || 0;
    if (!size || size > SNAPSHOT_MAX_BYTES || !appwriteConfigured) {
      hooks.blog("warning", `🎒 ${id}: snapshot haikuhifadhiwa (${size ? `${Math.round(size / 1024)}KB > kikomo` : "tar tupu/haipo"}) — kiovu ndicho kinga pekee.`);
      return 0;
    }
    const bytes = await sbx.files.read(MS_SNAP, { format: "bytes" } as any) as Uint8Array;
    const f: any = await storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(bytes, `cu-ws-${id}-${Date.now()}.tar.gz`));
    cu.snapshot = { fileId: f.$id, bucketId: CU_BUCKET };
    hooks.blog("info", `🎒 ${id}: snapshot ya workspace (pamoja na git) imehifadhiwa (${Math.round(bytes.length / 1024)}KB) — sandbox ikifa, milestone inayofuata inairejesha.`);
    return bytes.length;
  } catch (e: any) {
    hooks.blog("warning", `🎒 ${id}: snapshot imeshindwa: ${String(e?.message || e).slice(0, 160)}`);
    return 0;
  }
}

/** Sandbox MPYA: rejesha tar ya snapshot (kama ipo) → idadi ya faili (bila .git), -1 ikishindwa. */
async function msRestoreSnapshot(sbx: any, cu: CuRunState): Promise<number> {
  if (!cu.snapshot?.fileId) return -1;
  const url = publicFileUrl(cu.snapshot.bucketId || CU_BUCKET, cu.snapshot.fileId);
  try {
    const r: any = await sbx.commands.run(
      `mkdir -p /home/user/ws && cd /home/user/ws && export XMD_URL=${q(url)} && { (curl -fsSL --max-time 180 "$XMD_URL" | tar xzf -) || python3 -c ${q(`import os,io,tarfile,urllib.request as u; tarfile.open(fileobj=io.BytesIO(u.urlopen(os.environ["XMD_URL"],timeout=180).read()),mode="r:gz").extractall(".")`)}; } && echo XMD_TAR_OK && find . -type f -not -path './.git/*' | wc -l`,
      { timeoutMs: 200_000 });
    const out = String(r?.stdout || "");
    return out.includes("XMD_TAR_OK") ? Number(out.trim().split(/\s+/).pop()) || 0 : -1;
  } catch { return -1; }
}
/** TASK-17: soma `.xmd/reports/<Mk>-build-report.md` + faili zilizobadilika kwenye awamu hii (baada ya commit ya harness). */
async function msReadBuildReport(sbx: any, hooks: CuHooks, id: string, headBefore: string): Promise<MsBuildReportRaw> {
  const path = buildReportPath(id);
  const SEP = "@@XMD_DIFF@@";
  const diff = /^[0-9a-f]{7,40}$/.test(headBefore)
    ? `git diff --name-only ${headBefore} HEAD`
    : "git diff-tree --root -r --name-only --no-commit-id HEAD";
  const out: MsBuildReportRaw = { found: false, path, markdown: "", changed: [] };
  try {
    const r: any = await sbx.commands.run(
      `cd /home/user/ws && { if [ -f ${q(path)} ]; then echo XMD_REPORT_FOUND; head -c 262144 ${q(path)}; fi; echo; echo ${SEP}; ${diff} 2>/dev/null || true; }`,
      { timeoutMs: 30_000 });
    const so = String(r?.stdout || "");
    const k = so.lastIndexOf(SEP);
    const head = k >= 0 ? so.slice(0, k) : so;
    out.changed = (k >= 0 ? so.slice(k + SEP.length) : "").split("\n").map((l) => l.trim()).filter(Boolean);
    if (head.startsWith("XMD_REPORT_FOUND\n")) { out.found = true; out.markdown = head.slice("XMD_REPORT_FOUND\n".length).replace(/\n+$/, ""); }
  } catch (e: any) {
    hooks.blog("warning", `📑 ${id}: Build Report haikusomeka: ${String(e?.message || e).slice(0, 160)}`);
    return out;
  }
  if (out.found && out.markdown.length > BUILD_REPORT_INLINE_MAX && appwriteConfigured) {
    try {
      const f: any = await storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(Buffer.from(out.markdown, "utf8"), `cu-report-${id}-${Date.now()}.md`));
      out.fileId = f.$id;
    } catch (e: any) { hooks.blog("warning", `📑 ${id}: ripoti kubwa haikupakiwa storage: ${String(e?.message || e).slice(0, 120)}`); }
  }
  return out;
}

/** test-only (vitest) — helpers za snapshot ya milestone. */
export const __t16Snapshot = { msSnapshot, msRestoreSnapshot, msReadBuildReport };

async function startMilestonePhase(runner: Runner, hooks: CuHooks, ph: MilestonePhaseInput): Promise<MilestoneBuildOutcome> {
  const cu = ensureCuState(runner);
  const t0 = Date.now();
  const id = ph.milestoneId;
  const out = (ok: boolean, finalState: MilestoneBuildOutcome["finalState"], reason: string, extra: Partial<MilestoneBuildOutcome> = {}): MilestoneBuildOutcome =>
    ({ ok, finalState, reason, ms: Date.now() - t0, sandboxId: cu.sandboxId, ...extra });
  // Mlinzi wa concurrency: awamu MOJA tu kwa runner (kosa la bridges mbili baada ya auto-resume ya quota)
  if ((cu as any).msBusy) {
    hooks.blog("warning", `🖥️ ${id}: awamu nyingine ya XMD Computer bado inaendelea — hii haianzishwi (bridge mbili ni sumu).`);
    return out(false, "ERROR", "awamu nyingine ya Computer bado inaendelea (concurrency guard)");
  }
  (cu as any).msBusy = true;
  (cu as any).msMode = true;
  try {
    // awamu MPYA: hali ya awamu iliyopita haibebwi (maxI/seen zinabaki — dedupe ya i inaendelea)
    cu.done = false; cu.pausedNow = false; cu.finalState = undefined; cu.finalReason = undefined;
    cu.report = undefined; cu.stallWarned = false; cu.step = 0;
    (cu as any).msPhase = { id, startedAt: t0 };
    cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });

    hooks.bcast({ type: "cu", cu: { type: "divider" } });
    runner.items.push({ kind: "cu", id: `cu_divider_${runner.items.length}`, cu: "divider", milestone: id } as any);
    hooks.blog("system", `🖥️ XMD Computer · Milestone ${id} inaanza — context MPYA (StartPack), bridge mpya.`);
    hooks.addChip(`🖥️ XMD Computer · Milestone ${id} inaanza — StartPack (plan + Ledger + repo + reports), bridge mpya.`);

    let files: Array<[string, string]>;
    try { files = await loadEngineFiles(); }
    catch (e: any) { return out(false, "ERROR", `faili za engine (cu/) hazipatikani: ${String(e?.message || e).slice(0, 140)}`); }

    // (4) mwendelezo wa workspace: sandbox hai inatumika tena; vinginevyo mpya + kiovu (cu_files)
    const sbx = await getSandbox(cu);
    const fresh = !!(sbx as any).__xmdFresh;
    (sbx as any).__xmdFresh = false; // awamu ijayo kwenye sandbox hii hii si "mpya"
    try { await sbx.setTimeout(60 * 60 * 1000); } catch { /* */ }
    let restored = 0;
    if (fresh) {
      // snapshot ya mwisho wa awamu iliyopita (tar + git) ndiyo hali kamili; kiovu ni kinga ikiwa snapshot haipo
      const fromTar = await msRestoreSnapshot(sbx, cu);
      if (fromTar >= 0) {
        restored = fromTar;
        hooks.blog("success", `🎒 ${id}: sandbox MPYA ${cu.sandboxId?.slice(0, 8)}… — snapshot ya milestone iliyopita imerejeshwa (faili ${fromTar} + historia ya git).`);
      } else {
        restored = await restoreFromMirror(runner.sessionId || runner.id, sbx);
        hooks.blog(restored ? "success" : "info", restored
          ? `🪞 ${id}: sandbox MPYA ${cu.sandboxId?.slice(0, 8)}… — faili ${restored} za milestones zilizopita zimerejeshwa kutoka kiovu (cu_files).`
          : `🆕 ${id}: sandbox mpya ${cu.sandboxId?.slice(0, 8)}… (hakuna snapshot wala kiovu — mwanzo wa mradi).`);
      }
    } else {
      hooks.blog("info", `♻️ ${id}: sandbox ${cu.sandboxId?.slice(0, 8)}… iliyopo inatumika tena — workspace ya milestone iliyopita iko hai.`);
    }

    // (3) bridge MPYA kila awamu — ya zamani (kama ipo) inauawa kwanza
    await sbx.commands.run(MS_KILL_BRIDGE, { timeoutMs: 15_000 }).catch(() => {});
    for (const [p, src] of files) await sbx.files.write(p, src);
    await sbx.files.write("/home/user/ws/plan.md", ph.planMarkdown); // plan ya milestone HII (bridge haiandiki juu ya iliyopo)
    try {
      const fl = featuresFromPlan(ph.planMarkdown, { runId: `${runner.sessionId || runner.id}:${id}` });
      if (fl.features.length) await sbx.files.write(FEATURE_LIST_SANDBOX_PATH, featureListJson(fl));
    } catch (e) { console.warn(`[cu] feature_list.json (${id}): ${String(e).slice(0, 140)}`); }
    await sbx.files.write("/home/user/cu-config.json", JSON.stringify(buildCuConfig()));
    await sbx.commands.run(
      `mkdir -p /home/user/ws && cd /home/user/ws && (git rev-parse --git-dir >/dev/null 2>&1 || git init -q) && mkdir -p .git/info && printf '%s\\n' ${MS_GIT_EXCLUDE.map(q).join(" ")} > .git/info/exclude`,
      { timeoutMs: 30_000 }).catch(() => {});

    // (2) StartPack + muhtasari HALISI wa repo kutoka sandbox
    let repoOut = "";
    try { repoOut = String((await sbx.commands.run(REPO_SUMMARY_CMD, { timeoutMs: 30_000 }))?.stdout || ""); } catch { /* */ }
    const note = fresh && restored
      ? `IMPORTANT: this is a NEW sandbox — the workspace of earlier milestones was restored (${restored} files). Reinstall dependencies (npm install etc.) before you continue.`
      : "";
    const pack = renderStartPack(ph.startPack, parseRepoSummary(repoOut), note);
    await sbx.files.write("/home/user/startpack.md", pack);
    maybeCapturePrompt({ sessionId: runner.sessionId || runner.id, agent: "computer", agenda: 0, phase: `computer:${id}`, system: pack });

    const silent = cuSilentBridge();
    const cmd = silent
      ? "sleep 86400"
      : bridgeCommand({ title: `${ph.title || hooks.title || "Mradi"} · ${id}`, session: runner.sessionId || runner.id, token: cu.token, startI: cu.maxI, resumeNote: "", taskFile: "/home/user/startpack.md", milestone: id });
    // TASK-17: HEAD ya mwanzo wa awamu → `git diff` ya awamu hii (sehemu ya 2 ya Build Report inalinganishwa nayo)
    let headBefore = "";
    try { headBefore = String((await sbx.commands.run("cd /home/user/ws && git rev-parse --verify -q HEAD || true", { timeoutMs: 15_000 }))?.stdout || "").trim(); } catch { /* */ }
    if (silent) hooks.blog("warning", `🧪 XMD_TEST_CU_SILENT: bridge ya kimya (test hook) — liveness ya ${Math.round(CU_LIVENESS_MS / 1000)}s itaikata.`);
    hooks.blog("api", `🚀 ${id}: sandbox ${cu.sandboxId?.slice(0, 8)}… — bridge mpya inaanzishwa (StartPack herufi ${pack.length}).`);

    cu.startedAt = Date.now();
    cu.lastEventAt = cu.startedAt;
    const handle = await sbx.commands.run(`bash -lc ${q(cmd)}`, {
      background: true, timeoutMs: 24 * 60 * 60 * 1000, // hakuna cap ya wall-clock (liveness pekee) — 0 ingekata MARA MOJA (connect-rpc: ≤0 = abort)
      onStdout: (d: string) => { for (const l of String(d).split("\n")) if (l.startsWith("@@XMD ")) hooks.blog("info", `🖥️ ${l.slice(6, 400)}`); },
      onStderr: (d: string) => { const s = String(d).trim(); if (s) hooks.blog("warning", `🖥️ stderr: ${s.slice(0, 300)}`); },
    });
    if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; }
    cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);
    handle.wait().then(async (r: any) => {
      if (!cu.done && (cu as any).msPhase?.id === id && !cu.pausedNow && !cu.pausing) {
        hooks.blog("error", `🖥️ Bridge ya ${id} imekufa (code ${r?.exitCode ?? "?"}) bila kumaliza.`);
        await handleCuEvent(runner, hooks, { i: cu.maxI + 1, type: "run_end", status: "error", steps: cu.step, ms: Date.now() - cu.startedAt, fatal: `bridge exit ${r?.exitCode ?? "?"}` });
      }
    }).catch(() => { /* imeuawa na sisi / run_end imeshakuja */ });

    // (5) liveness: HAKUNA cap ya muda — inaachishwa TU bila tukio jipya kwa CU_LIVENESS_MS
    const tick = Math.max(1_000, Math.min(30_000, Math.floor(CU_LIVENESS_MS / 6)));
    let strikes = 0;
    let lastPing = Date.now();
    let paused = false;
    for (;;) {
      let resolved = false;
      await Promise.race([
        (cu.phaseDone ?? Promise.resolve()).then(() => { resolved = true; }),
        new Promise<void>((r) => setTimeout(r, tick).unref?.()),
      ]);
      if (resolved || cu.done) break;
      if (cu.pausedNow || cu.pausing) { paused = true; break; } // Board ilipumzishwa — snapshot/pause ya zamani inashughulikia
      const idle = Date.now() - Math.max(cu.lastEventAt || 0, cu.startedAt);
      if (idle >= CU_LIVENESS_MS) {
        const secs = Math.round(CU_LIVENESS_MS / 1000);
        hooks.blog("error", `⏱️ ${id}: hakuna tukio la bridge kwa ${secs}s (CU_LIVENESS_MS) — bridge inasimamishwa → STUCK.`);
        await sbx.commands.run(MS_KILL_BRIDGE, { timeoutMs: 15_000 }).catch(() => {});
        await handleCuEvent(runner, hooks, { i: cu.maxI + 1, type: "run_end", status: "stuck", steps: cu.step, ms: Date.now() - cu.startedAt, fatal: `liveness: no bridge event for ${secs}s` });
        break;
      }
      if (Date.now() - lastPing >= 3 * 60_000) {
        lastPing = Date.now();
        if (await sandboxAlive(sbx)) strikes = 0;
        else if (++strikes >= 2) {
          hooks.blog("error", `🧊 ${id}: sandbox haipiti ping mara 2 — imekufa.`);
          await handleCuEvent(runner, hooks, { i: cu.maxI + 1, type: "run_end", status: "error", steps: cu.step, ms: Date.now() - cu.startedAt, fatal: "sandbox ya E2B imekufa wakati wa build" });
          break;
        }
      }
    }
    stopHeartbeat(cu);
    if (paused) return out(false, "PAUSED", "Board ilipumzishwa wakati wa build — itarudiwa ikiresume", { freshSandbox: fresh, restored });

    // commit ya harness (kazi ya milestone hii ndani ya git — mwendelezo kwa M inayofuata)
    let gitLog = "";
    try {
      const r: any = await sbx.commands.run(
        `cd /home/user/ws && ${MS_GIT} add -A && (${MS_GIT} diff --cached --quiet || ${MS_GIT} commit -qm ${q(`XMD ${id}: ${ph.startPack.title}`.slice(0, 120))}); git log --oneline -n 5 2>/dev/null || true`,
        { timeoutMs: 60_000 });
      gitLog = String(r?.stdout || "").trim();
      hooks.blog("info", gitLog
        ? `🧾 git ${id}: ${gitLog.split("\n").slice(0, 3).join(" · ").slice(0, 300)}`
        : `🧾 git ${id}: hakuna mabadiliko ya kucommit (repo bado haina commit).`);
    } catch (e: any) {
      hooks.blog("warning", `🧾 git commit ya ${id} haikufanyika: ${String(e?.message || e).slice(0, 140)}`);
    }
    const buildReport = await msReadBuildReport(sbx, hooks, id, headBefore);
    await msSnapshot(sbx, cu, hooks, id);
    if (ph.last) setTimeout(() => sbx.kill?.().catch(() => {}), 15_000);
    else sbx.setTimeout(30 * 60_000).catch(() => {}); // inabaki kwa milestone inayofuata (ikifa → kiovu)

    const fs = (cu.finalState || "ERROR") as CuFinalState;
    return out(!MS_BUILD_FAIL_STATES.includes(fs), fs, cu.finalReason || "", { report: cu.report, freshSandbox: fresh, restored, gitLog, buildReport });
  } catch (e: any) {
    stopHeartbeat(cu);
    hooks.blog("error", `❌ XMD Computer · ${id}: ${String(e?.message || e).slice(0, 200)}`);
    return out(false, "ERROR", `Sandbox ya E2B haikuwezekana: ${String(e?.message || e).slice(0, 200)}`);
  } finally {
    (cu as any).msPhase = undefined;
    (cu as any).msBusy = false;
    writeCuChip(runner);
  }
}

/** run_end ya awamu ya milestone: hali ya mwisho (computeFinalOutcome) — HAIMALIZI session wala kuua sandbox. */
function finishMilestonePhase(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu!;
  if (cu.done) return;
  stopHeartbeat(cu);
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
  const id = String((cu as any).msPhase?.id || "");
  const status = String(ev.status || "done");
  const outcome = computeFinalOutcome({
    status, hasReport: !!cu.report, paused: status === "paused_quota",
    error: ev.fatal ? String(ev.fatal).slice(0, 200) : undefined,
  });
  cu.finalState = outcome.state;
  cu.finalReason = outcome.reason;
  cu.done = true;
  runner.items.push({
    kind: "cu", id: `cu_end_${runner.items.length}`, i: ev.i, cu: "run_end", status, milestone: id,
    finalState: outcome.state, finalReason: outcome.reason, steps: ev.steps, ms: ev.ms,
    github: cu.links.repo, live: cu.links.live, tokens: cu.usage.tokens, requests: cu.usage.requests,
  } as any);
  const failed = MS_BUILD_FAIL_STATES.includes(outcome.state);
  if (hooks) {
    hooks.blog(failed ? "error" : "success", `🖥️ XMD Computer · ${id}: ${outcome.state}${outcome.reason ? ` (${outcome.reason})` : ""} — ${cu.usage.requests} LLM calls · ${cu.usage.tokens.toLocaleString("en-US")} tokens.`);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok: !failed, status, finalState: outcome.state, finalReason: outcome.reason, milestone: id } });
    schedulePersist(runner, hooks, true); // msMode → "running" (Board inaendelea)
  }
  cu.phaseResolve?.();
}

export function cuError(runner: Runner, hooks: CuHooks, message: string): void {
  const cu = runner.cu!;
  hooks.bcast({ type: "cu", cu: { type: "error", message } });
  runner.items.push({ kind: "cu", id: `cu_err_${runner.items.length}`, cu: "error", message } as any);
  hooks.blog("error", `❌ XMD Computer: ${message}`);
  hooks.addChip("❌ XMD Computer imekosa: " + message.slice(0, 140) + " — bonyeza ▶ Endeleza kuijaribu tena.");
  stopHeartbeat(cu);
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
  cu.phaseResolve?.();
  // R31-G4: "running" haikufaa — kosa la session zilizo "running" milele; Endeleza inatumia
  // status hii kujua session haijakamilika
  void hooks.persist("finale_incomplete", hooks.title);
}

/** R44-B: mpigo wa maisha ya sandbox — kila dakika 3 ping; makosa 2 mfululizo → pauseForRebuild
 *  (kifo cha E2B kinagundulika dakika 3-6 badala ya kusubiri stall ya dakika 15). */
function startLiveness(runner: Runner, hooks: CuHooks, cu: CuRunState, sbx: any): void {
  stopLiveness(cu);
  let strikes = 0;
  const t = setInterval(async () => {
    if (!runner.cu || cu.done || cu.pausedNow || cu.pausing) { stopLiveness(cu); return; }
    if (await sandboxAlive(sbx)) { strikes = 0; return; }
    strikes += 1;
    hooks.blog("warning", `🧊 Sandbox haipiti ping (${strikes}/2)…`);
    if (strikes >= 2) {
      stopLiveness(cu);
      pauseForRebuild(runner, hooks, "Sandbox ya E2B haipo tena (imekufa/imepumzika kwa timeout)");
    }
  }, 3 * 60_000);
  (t as any).unref?.();
  (cu as any).livenessTimer = t;
}

function stopLiveness(cu: CuRunState) {
  const t = (cu as any).livenessTimer;
  if (t) { clearInterval(t); (cu as any).livenessTimer = undefined; }
}

/** R44-B (agizo la Mkuu): kifo cha sandbox — hakuna snapshot ya kutafuta (maiti). Mfumo unajenga
 *  sandbox MPYA kwa auto-resume ya dakika 2, unarestore kutoka KIOVU (cu_files — kila write ilihifadhiwa),
 *  na agent anapewa ujumbe: "sandbox ilikufa — hii ni mpya; install deps kwanza, kisha endelea". */
function pauseForRebuild(runner: Runner, hooks: CuHooks | null, reason: string): void {
  const cu = runner.cu;
  if (!cu || cu.done || cu.pausedNow || cu.pausing) return;
  stopHeartbeat(cu);
  stopWatchdog(cu);
  cu.pausedOnce = true;
  cu.pausedNow = true;
  cu.rebuild = true;
  cu.resumeAt = Date.now() + 2 * 60_000;
  cu.pauseOrigin = "system"; // TASK-1
  cu.sandbox = undefined;
  cu.sandboxId = undefined;
  runner.items.push({ kind: "cu", id: `cu_pause_${runner.items.length}`, i: cu.maxI, cu: "pause", resumeAt: cu.resumeAt, reason: String(reason).slice(0, 200), steps: cu.step } as any);
  const t = new Date(cu.resumeAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false });
  hooks?.blog("warning", `🧊 ${reason} — sandbox MPYA inajengwa na faili za agent zinarudishwa kutoka kiovu; inaendelea yenyewe ${t}.`);
  hooks?.addChip(`🧊 ${reason} — sandbox mpya inajengwa + faili zako zote zinarudishwa moja kwa moja (kiovu). Unaendelea ${t}.`);
  cu.phaseResolve?.();
  writeCuChip(runner);
  if (hooks) {
    void hooks.persist("paused", hooks.title);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok: false, status: "paused" } });
  }
  scheduleAutoResume(runner.sessionId || runner.id, cu.resumeAt);
}

function stopHeartbeat(cu: CuRunState) {
  if (cu.heartbeat) { clearInterval(cu.heartbeat); cu.heartbeat = undefined; }
  if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; }
  stopLiveness(cu); // R44-B
  stopWatchdog(cu);
}

/** R40: heartbeat polepole (5dk → timeout 60dk) — sandbox YA RUN isife wakati wa pause ya
 *  watchdog (auto-resume ina-connect kwenye sandbox ILIYO HAI — hakuna create ya E2B tena;
 *  kosa la 6ac803e2: pause ya dakika 15 ilimuua sandbox, resume 01:50 ikahitaji create,
 *  E2B ikatimeout usiku → run ikafa). Pause ya MWANDAMIZI (resumeAt=0) na quota ya siku
 *  bado zinaua sandbox (snapshot IPO bucket — by design, si mabadiliko). */
function startSlowHeartbeat(cu: CuRunState, sbx: any): void {
  if (cu.slowHeartbeat) clearInterval(cu.slowHeartbeat);
  const beat = () => sbx.setTimeout(60 * 60 * 1000).catch(() => {});
  beat();
  cu.slowHeartbeat = setInterval(beat, 5 * 60_000);
  (cu.slowHeartbeat as any)?.unref?.();
}

function stopWatchdog(cu: CuRunState) {
  if (cu.watchdogTimer) { clearInterval(cu.watchdogTimer); cu.watchdogTimer = undefined; }
}

/* ============================ R38-RC1 · watchdog ya stall + RC5 · pause ya server ============================ */

/** Ukaguzi mmoja wa stall (unanijishika na watchdog interval; unaweza kuitwa moja kwa moja kwenye test).
 *  "ok" = kila kitu mzuri · "warned" = onyo limetumwa · "paused" = pause imetokwa na kuanza. */
export function checkCuStall(runner: Runner, hooks: CuHooks | null): "ok" | "warned" | "paused" {
  const cu = runner.cu;
  if (!cu || cu.done || cu.pausedNow || cu.pausing) return "ok";
  if ((cu as any).msMode) return "ok"; // TASK-16: njia ya milestone ina liveness yake (CU_LIVENESS_MS)
  const idleMs = Date.now() - ((cu as any).lastRealAt || cu.lastEventAt || cu.startedAt); // R44-E: kelele za quota hazihesabiwi
  if (idleMs > CU_STALL_PAUSE_MS) {
    hooks?.blog("error", `🖥️ XMD Computer: hakuna tukio kwa ${Math.round(idleMs / 60000)} dk (stream ya LLM imekwama) — inapumzishwa; itajaring tena baada ya dakika 10.`);
    void pauseComputerFromServer(runner, hooks, `hakuna tukio la bridge kwa ${Math.round(idleMs / 60000)} dk (LLM imekwama)`, Date.now() + 10 * 60_000).catch(() => {});
    return "paused";
  }
  if (idleMs > CU_STALL_PAUSE_MS / 3 && !cu.stallWarned) {
    cu.stallWarned = true;
    hooks?.blog("warning", `⏳ XMD Computer: hakuna tukio kwa ${Math.round(idleMs / 60000)} dk — LLM inapoa au imekwama. Ikikaa zaidi ya dakika ${Math.round(CU_STALL_PAUSE_MS / 60000)} bila tukio, itapumzishwa na kujaribiwa tena.`);
    return "warned";
  }
  return "ok";
}

function startWatchdog(runner: Runner, hooks: CuHooks, cu: CuRunState) {
  stopWatchdog(cu);
  cu.lastEventAt = Date.now();
  cu.stallWarned = false;
  cu.watchdogTimer = setInterval(() => {
    if (!runner.cu || runner.cu.done || runner.cu.pausedNow || runner.cu.pausing) { stopWatchdog(runner.cu!); return; }
    checkCuStall(runner, hooks);
  }, 30_000);
  (cu.watchdogTimer as any)?.unref?.(); // timer ya ndani — isizuie exit ya Node
}

/* ============================ events (endpoint + watchdog) ============================ */

const CAP = {
  text: 16_000,
  think: 8_000,
  output: 8_000,
  preview: 24_000,
  summary: 400,
};

function schedulePersist(runner: Runner, hooks: CuHooks, force = false) {
  const cu = runner.cu!;
  // R31-G4: status halisi ya runner — "paused" ikirudi kutoka pause haivurugwi na "running"
  // TASK-6: CU ikishamaliza (finalState imewekwa na finishComputer/blocked) — tukio lolote linalochelewa
  // HALIANDIKI "running" juu ya status ya mwisho (smoke 2 ya Task 5: session ilibaki "running").
  const st = (cu as any).msMode
    // TASK-16: awamu ya milestone ikiisha Board bado inaendelea — kamwe "completed"/"finale_incomplete" kutoka hapa
    ? (runner.status === "paused" || ((cu.pausedNow || cu.pausing) && !cu.done) ? "paused" : "running")
    : cu.finalState ? (cu.done ? "completed" : "finale_incomplete")
    // TASK-8: "paused" = pause ya SASA tu (pausedNow/pausing). Zamani pausedOnce (historia) iliacha run iliyoresumiwa
    // ionekane "paused" kwenye DB hadi mwisho. pausedNow inafutwa startComputerPhase ikianza (resume).
    : runner.status === "paused" ? "paused" : (cu.pausedNow || cu.pausing) && !cu.done ? "paused" : "running";
  if (force) {
    if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
    void hooks.persist(st, hooks.title);
    cu.lastPersistAt = Date.now();
    return;
  }
  if (cu.persistTimer) return;
  cu.persistTimer = setTimeout(() => {
    const c = runner.cu;
    if (!c) return;
    c.persistTimer = undefined;
    c.lastPersistAt = Date.now();
    void hooks.persist(st, hooks.title);
  }, 2_500);
}

/** Tukio moja kutoka bridge: dedupe → bucket (shot/snapshot) → usage → item(s) → broadcast. */
/** R31-G5: bridge inatuma tree kama objects {p,d,s} (si strings). map(String) ilizifanya
 * kuwa "[object Object]" kwenye doc/UI. Sasa: entries {path,isDir,size} — UI inajenga mti
 * (kama FileTree ya xmd3). Strings za zamani (sessions za kabla) zinabaki string. */
export function normalizeCuFiles(raw: unknown[]): Array<{ path: string; isDir: boolean; size: number } | string> {
  return (raw || []).map((x: any) =>
    typeof x === "string"
      ? x
      : { path: String(x?.p ?? x?.path ?? ""), isDir: !!(x?.d ?? x?.isDir), size: Number(x?.s ?? x?.size ?? 0) || 0 },
  );
}

export async function handleCuEvent(runner: Runner, hooks: CuHooks | null, ev: CuEvent): Promise<void> {
  const cu = runner.cu || ensureCuState(runner);
  const key = `${ev.type}:${ev.i}`;
  if (cu.seen.has(key)) return;
  cu.seen.add(key);
  if (ev.i > cu.maxI) cu.maxI = ev.i;
  // R38-RC1/RC5: tukio lolote la live linaonyesha bridge inazungumza (watchdog ya stall inapumzika);
  // run iliyopumzishwa (pausedNow) inakataa events za "kelele" (think/text/exec/usage…) — bridge
  // inayokufa haizidi kugeuza hali — lakini events za MWISHO za kazi halisi (ripoti/links/snapshot/
  // run_end) zinapitishwa: kazi iliyokamilika halisi haipotei.
  cu.lastEventAt = Date.now();
  // R44-E: tukio HALISI (usage ni kelele za quota) — stall-detector inapima hii
  if (ev.type !== "usage") (cu as any).lastRealAt = Date.now();
  // R44-A: KIOVU — kila write/edit ya agent inaingia cu_files MARA MOJA (kifo hakipotezi kazi)
  if (ev.type === "exec_start") mirrorEvent(runner.sessionId || runner.id, mirrorMapOf(cu), ev);
  if (cu.pausedNow && !CU_PAUSE_PASSTHROUGH.has(ev.type)) return;

  // broadcast LIVE kila tukio (UI ina-animation ya live) — shot bila base64 (fileId inakuja baadaye)
  if (hooks) hooks.bcast({ type: "cu", cu: ev.type === "shot" ? { ...ev, data: undefined, has_data: true } : ev });

  switch (ev.type) {
    case "run_start": {
      cu.startedAt = Date.now();
      runner.items.push({ kind: "cu", id: `cu_start_${runner.items.length}`, i: ev.i, cu: "run_start", task: ev.task, model: ev.model, budget: ev.budget } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "think_start":
      // R31-G5: kila block ya think ana key YAKE (wawili kwenye step ileile walichanganyika)
      (cu as any).thinkBlock = ((cu as any).thinkBlock || 0) + 1;
      break;
    case "think_delta": {
      const key = (cu as any).thinkBlock || 1;
      cu.thinkAcc.set(key, (cu.thinkAcc.get(key) || "") + String(ev.text || ""));
      break;
    }
    case "think_end": {
      // replay ya events.jsonl: item "think:{i}" ipo tayari (i ya think_end = i ya item) — usirudie
      if (cu.seen.has(`think:${ev.i}`)) break;
      cu.seen.add(`think:${ev.i}`);
      const s = Number(ev.step) || 0;
      const key = (cu as any).thinkBlock || 1;
      const text = (cu.thinkAcc.get(key) || "").slice(0, CAP.think);
      cu.thinkAcc.delete(key);
      runner.items.push({ kind: "cu", id: `cu_think_${runner.items.length}`, i: ev.i, cu: "think", step: s, ms: ev.ms, text } as any);
      schedulePersist(runner, hooks!);
      break;
    }
    case "text_start":
      (cu as any).textBlock = ((cu as any).textBlock || 0) + 1;
      break;
    case "text_delta": {
      // Task 3b: key LAZIMA ilingane na text_end (textBlock) — zamani delta ilitumia `step` na
      // end ilisoma `textBlock` → zikitofautiana text ilitoka TUPU (live 49476add i=297).
      const key = (cu as any).textBlock || 1;
      cu.textAcc.set(key, (cu.textAcc.get(key) || "") + String(ev.text || ""));
      break;
    }
    case "text_end": {
      if (cu.seen.has(`text:${ev.i}`)) break; // replay: item ipo tayari
      cu.seen.add(`text:${ev.i}`);
      const s = Number(ev.step) || 0;
      const key = (cu as any).textBlock || 1;
      const text = (cu.textAcc.get(key) || "").slice(0, CAP.text);
      cu.textAcc.delete(key);
      runner.items.push({ kind: "cu", id: `cu_text_${runner.items.length}`, i: ev.i, cu: "text", step: s, text } as any);
      schedulePersist(runner, hooks!);
      break;
    }
    case "exec_start": {
      const id = String(ev.id || "");
      cu.execs.set(id, { step: ev.step, tool: ev.tool, kind: ev.kind, command: ev.command, path: ev.path, preview: ev.preview, lines: ev.lines,
        oldStr: ev.old_str ? String(ev.old_str).slice(0, CAP.preview) : undefined, newStr: ev.new_str ? String(ev.new_str).slice(0, CAP.preview) : undefined, out: "" });
      if (Number(ev.step) > cu.step) cu.step = Number(ev.step);
      break;
    }
    case "exec_output": {
      const e = cu.execs.get(String(ev.id || ""));
      if (e) e.out = (e.out + String(ev.chunk || "")).slice(-CAP.output);
      break;
    }
    case "exec_end": {
      if (cu.seen.has(`exec:${ev.i}`)) break; // replay: item ipo tayari
      cu.seen.add(`exec:${ev.i}`);
      const id = String(ev.id || "");
      const e = cu.execs.get(id) || { step: ev.step, tool: "?", kind: "?", command: "", out: "" };
      cu.execs.delete(id);
      runner.items.push({
        kind: "cu", id: `cu_exec_${runner.items.length}`, i: ev.i, cu: "exec", step: ev.step, execId: id,
        tool: e.tool, kindX: e.kind, command: String(e.command || "").slice(0, 2_000), path: e.path,
        preview: String(e.preview || "").slice(0, CAP.preview), lines: e.lines || undefined,
        oldStr: e.oldStr ? String(e.oldStr).slice(0, CAP.preview) : undefined, newStr: e.newStr ? String(e.newStr).slice(0, CAP.preview) : undefined,
        exit: ev.exit, ms: ev.ms, chars: ev.chars, summary: String(ev.summary || "").slice(0, CAP.summary),
        output: String(e.out || "").slice(0, CAP.output) || undefined,
      } as any);
      schedulePersist(runner, hooks!);
      break;
    }
    case "shot": {
      // picha → bucket ya Appwrite (keys za Appwrite HAZIINGII sandbox — Koyeb ndiye anapakia)
      const data = typeof ev.data === "string" ? ev.data : "";
      if (data && appwriteConfigured && data.length <= 4 * 1024 * 1024) {
        storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(Buffer.from(data, "base64"), `cu-${Date.now()}.png`))
          .then((f: any) => {
            runner.items.push({ kind: "cu", id: `cu_shot_${runner.items.length}`, i: ev.i, cu: "shot", step: ev.step, fileId: f.$id, bucketId: CU_BUCKET, label: ev.label, path: ev.path } as any);
            if (hooks) hooks.bcast({ type: "cu", cu: { type: "shot_ok", step: ev.step, fileId: f.$id, bucketId: CU_BUCKET, label: ev.label } });
            schedulePersist(runner, hooks!, true);
          })
          .catch((err: any) => {
            if (hooks) hooks.blog("warning", `Screenshot haikuweza kupakiwa bucket: ${String(err?.message || err).slice(0, 120)}`);
          });
      } else if (hooks) {
        hooks.blog("warning", `Screenshot ${data ? "kubwa mno" : "bila data"} — haipakiwi (${ev.label || ""}).`);
      }
      break;
    }
    case "usage": {
      // R40-B: beat ya "waiting" (heartbeat ya brain wakati request ndefu / TPM cooling) —
      // si call halisi: haihesabiwi kwenye usage/meters; inalisha watchdog (dakika 15 isilipe
      // kwa uongo) + countdown inayoonekana kwenye log (throttled 45s).
      if ((ev as any).waiting) {
        const cuw = runner.cu!;
        const now = Date.now();
        if (hooks && now - (cuw.lastWaitBlog || 0) > 45_000) {
          cuw.lastWaitBlog = now;
          hooks.blog("info", `⏳ XMD Computer: ${String((ev as any).note || "LLM inaendelea — inasubiri jibu")} (heartbeat — haihesabiwi)`);
        }
        break;
      }
      // tokens za computer-use → KILA MAHALI (usage chip "computer" + meters za accounts)
      const total = Number(ev.total) || 0;
      runner.items.push({ kind: "cu", id: `cu_usage_${ev.i}`, i: ev.i, cu: "usage", lane: ev.lane, provider: ev.provider, account: ev.account, model: ev.model, total, ok: !!ev.ok } as any);
      cu.usage.requests += 1;
      cu.usage.tokens += total;
      cu.usage.prompt += Number(ev.prompt) || 0;
      cu.usage.completion += Number(ev.completion) || 0;
      if (hooks && ev.ok) {
        hooks.recordUsage("computer", { prompt: Number(ev.prompt) || 0, completion: Number(ev.completion) || 0, total }, true, String(ev.i), String(ev.provider || "gemini"));
      }
      noteProviderUsage(ev, Boolean(ev.ok));
      break;
    }
    case "files": {
      const tree = normalizeCuFiles((ev.tree as unknown[]) || []);
      cu.files = tree;
      // R31-G4: item MOJA ya "files" inayosasishwa kila tukio (real-time) — replay ya Files badge
      // ina tree ya MWISHO. (Kosa la G: item ilihifadhiwa ukipita bucket 25/50 — mradi mdogo
      // ulibaki na snapshot ya KWANZA, workspace iliyo tupu.)
      const count = tree.length;
      const lastIdx = runner.items.findIndex((it: any) => it?.kind === "cu" && it.cu === "files" && it.id === (cu as any).filesItemId);
      if ((cu as any).filesItemId && lastIdx >= 0) {
        runner.items[lastIdx] = { ...(runner.items[lastIdx] as any), i: ev.i, files: tree.slice(0, 500), filesCount: count };
      } else {
        const id = `cu_files_${runner.items.length}`;
        (cu as any).filesItemId = id;
        runner.items.push({ kind: "cu", id, i: ev.i, cu: "files", files: tree.slice(0, 500), filesCount: count } as any);
      }
      // chip ya CU state inasasishwa mara kwa mara (resume + Files)
      schedulePersist(runner, hooks!);
      break;
    }
    case "github": {
      cu.links.repo = String(ev.url || "");
      runner.items.push({ kind: "cu", id: `cu_gh_${runner.items.length}`, i: ev.i, cu: "github", url: cu.links.repo, step: ev.step } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "deploy": {
      cu.links.live = String(ev.url || "");
      runner.items.push({ kind: "cu", id: `cu_dep_${runner.items.length}`, i: ev.i, cu: "deploy", url: cu.links.live, step: ev.step } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "finish": {
      // RIPOTI YA MWISHO — inarender KAWAIDA (document, si card) — CEO correction 04-10
      const rtext = String(ev.report || "").slice(0, 120_000);
      if (/^API Error/i.test(rtext.trim()) || rtext.trim() === "(hakuna ripoti)") {
        // CLI ina-weka error text yake kama "report" — hiyo SI ripoti; error event inayofuata inatuambia ukweli
        hooks?.blog("warning", "🖥️ Ripoti ilikuwa error text ya CLI (si ripoti) — haihifadhiwi kama report.");
        break;
      }
      cu.report = rtext;
      runner.items.push({ kind: "cu", id: `cu_report_${runner.items.length}`, i: ev.i, cu: "report", text: cu.report, partial: ev.partial, status: ev.status } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "error": {
      runner.items.push({ kind: "cu", id: `cu_error_${runner.items.length}`, i: ev.i, cu: "error", message: String(ev.message || "").slice(0, 500) } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "snapshot": {
      // R31-G4: tar.gz ya workspace (kutoka bridge, quota imeisha) → bucket; resume inairejesha
      const data = typeof ev.data === "string" ? ev.data : "";
      if (data && appwriteConfigured && data.length <= 64 * 1024 * 1024) {
        try {
          const f: any = await storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(Buffer.from(data, "base64"), `cu-ws-${Date.now()}.tar.gz`));
          cu.snapshot = { fileId: f.$id, bucketId: CU_BUCKET };
          hooks?.blog("info", `🎒 Snapshot ya workspace imehifadhiwa bucket (${Math.round(data.length / 1024)}KB b64) — resume itairejesha.`);
          schedulePersist(runner, hooks!, true);
        } catch (err: any) {
          hooks?.blog("warning", `Snapshot haikuweza kupakiwa: ${String(err?.message || err).slice(0, 120)}`);
        }
      }
      break;
    }
    case "xmd_hook": {
      // R32-C: ushauri/brake za nidhamu (bridge hooks) — item fupi + chip kwa brake pekee
      const kind = String(ev.kind || "advice");
      runner.items.push({ kind: "cu", id: `cu_hook_${runner.items.length}`, i: ev.i, cu: "hook", hookKind: kind,
                          text: String(ev.text || "").slice(0, 500), command: String(ev.command || "").slice(0, 300),
                          streak: Number(ev.streak) || 0 } as any);
      if (kind === "brake" && hooks) {
        hooks.blog("warning", `🛑 ${String(ev.text || "XMD brake").slice(0, 200)}`);
        hooks.addChip("🛑 XMD Computer imesimama (jibu lilelile ×3) — ripoti ipo STATUS.md. ▶ Endeleza inaendelea.");
      }
      // R36: advice/continue/shot_deny/fail = BACKGROUND — hakuna blog ya UI (agizo la CEO:
      // warnings za nidhamu hazionekani mbele; hook yenyewe inamdirect agent kama kawaida).
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "run_end": {
      // TASK-16: njia ya milestone — run_end inamaliza AWAMU (si session); nje ya awamu inapuuzwa
      if ((cu as any).msMode) {
        if ((cu as any).msPhase) finishMilestonePhase(runner, hooks, ev);
        break;
      }
      if (String(ev.status) === "paused_quota") {
        pauseComputer(runner, hooks, ev);
        break;
      }
      finishComputer(runner, hooks, ev);
      break;
    }
    default: break; // step_start, tool_draft, usage_total, shot_ok — live tu
  }
}

/** usage → daftari la matumizi (meters za /api/usage/accounts zinaonyesha calls za CU pia). */
export function noteProviderUsage(ev: CuEvent, ok: boolean): void {
  const total = Number(ev.total) || 0;
  const provider = String(ev.provider || "");
  const account = String(ev.account || "");
  const model = String(ev.model || "");
  try {
    if (provider === "gemini" && GEM_ACCOUNTS.includes(account as GemAccountId)) {
      noteGemResult("chat", model, ok, total, account as GemAcct);
    } else if (provider === "openrouter" && (account === "or-1" || account === "or-2")) {
      noteOrResult(account, ok, total);
    } else if (provider === "unorouter" && (account === "uno-1" || account === "uno-2")) {
      noteUnoResult(account, model, ok, total);
    }
  } catch { /* meters si kizuizi */ }
}

/** R31-G4: quota ya siku imeisha (accounts zote) → PAUSE, si kifo.
 *  Snapshot ipo bucket (event "snapshot" ilikuja kabla ya run_end); session inahifadhi "paused";
 *  auto-resume inapangwa (in-instance timer + checkPausedDue kwa traffic yoyote/instrumentation). */
function pauseComputer(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu!;
  // R38-RC5: pause iliyokwisha (manual/watchdog ya sasa — pausedNow) — usirudie. pausedOnce
  // ni HISTORIA (quota inaweza ikawa tena siku ijayo baada ya resume — haisimamishi).
  if (cu.done || cu.pausedNow || cu.pausing) return;
  stopHeartbeat(cu);
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; } // race: timer isiandike "running" juu ya "paused"
  cu.pausedOnce = true;
  cu.pausedNow = true;
  const resumeAt = Number((ev as any).resume_at) || 0;
  cu.resumeAt = resumeAt;
  cu.pauseOrigin = "system"; // TASK-1: pause ya bridge (run_pause) = system
  runner.items.push({ kind: "cu", id: `cu_pause_${runner.items.length}`, i: ev.i, cu: "pause", resumeAt, ms: ev.ms, steps: ev.steps } as any);
  if (hooks) {
    const t = resumeAt ? new Date(resumeAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false }) : "baadaye";
    hooks.blog("warning", `⏸️ Tokens za LLM zimeisha (quota ya siku, accounts zote) — session imepumzika; itaendelea YENYEWE ${t}.`);
    hooks.addChip(`⏸️ XMD Computer imepumzika (quota imeisha) — itaendelea yenyewe ${t}.`);
  }
  cu.phaseResolve?.();
  writeCuChip(runner);
  // sandbox haipaswi kubaki hai: snapshot IPO bucket (ndiyo hali ya kuendelea) — sandbox
  // iliyo hai kunashika slot ya E2B free na kuingiza resume kwenye mtego wa replay.
  // (Kosa la 6ac3c019: kill bila ku-clear cu.sandbox → resume ilirudisha sandbox
  // iliyokufa kwenye cache → "sandbox was not found" kwenye files.write.)
  const sbx = cu.sandbox;
  if (sbx && cu.snapshot) { setTimeout(() => sbx.kill?.().catch(() => {}), 15_000); }
  cu.sandbox = undefined; // cache hai — getSandbox ita-connect (itakufa) kisha itatengeneza MPYA
  if (hooks) {
    void hooks.persist("paused", hooks.title);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok: false, status: "paused" } });
  }
  scheduleAutoResume(runner.sessionId || runner.id, resumeAt);
}

/** R38-RC5 · PAUSE YA SERVER (manual Detach / watchdog ya stall): bridge haipewi nafasi
 *  ya "kuendelea raha" — inauawa, workspace inahifadhiwa (snapshot → bucket), session
 *  inaandikwa "paused", na awamu (awaitPhase) inarudishwa. resumeAt=0 = pause ya
 *  MWANDAMIZI (haina auto-resume — Resume ya user tu); resumeAt>0 = watchdog (retry 10dk).
 *  Mkondo uleule wa quota-pause (pauseComputer) — tofauti kubwa: snapshot inatengenezwa
 *  NA SERVER hapa (bridge haijashiriki), kwa tar+files.read kutoka sandbox hai. */
/** TASK-6 (maelezo6): mipaka ya snapshot. Bila budgetMs = muda wa zamani (Detach ya user haibadiliki). */
export type SnapshotLimits = { budgetMs?: number; maxBytes?: number };
export const SNAPSHOT_MAX_BYTES = 40 * 1024 * 1024;
/** Watchdog (RAM ≥ 78%) na SIGTERM: snapshot ndogo na ya haraka — vinginevyo inarukwa. */
export const PRESSURE_SNAPSHOT_LIMITS: Required<SnapshotLimits> = { budgetMs: 20_000, maxBytes: 8 * 1024 * 1024 };
const PERSIST_WAIT_MS = 4_000; // persist ya "paused" haizuii pause zaidi ya hapa (write inaendelea nyuma)

export async function pauseComputerFromServer(runner: Runner, hooks: CuHooks | null, reason: string, resumeAt: number, origin: PauseOrigin = "system", limits: SnapshotLimits = {}): Promise<boolean> {
  const cu = runner.cu;
  // pausedNow = pause ya SASA (si historia ya pausedOnce — hiyo inaruhusu resume-continue)
  if (!cu || cu.done || cu.pausedNow || cu.pausing) return false;
  cu.pausing = true;
  stopHeartbeat(cu); // heartbeat + watchdog (RC1)
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
  cu.pausedOnce = true;
  cu.resumeAt = resumeAt;
  cu.pauseOrigin = origin; // TASK-1: chip inabeba asili ya pause (Detach="user")
  cu.stallWarned = false;
  runner.items.push({ kind: "cu", id: `cu_pause_${runner.items.length}`, i: cu.maxI, cu: "pause", resumeAt, reason: String(reason).slice(0, 200), steps: cu.step } as any);
  if (hooks) {
    const t = resumeAt ? new Date(resumeAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false }) : "";
    hooks.blog("warning", `⏸️ XMD Computer imepumzishwa — ${reason}. Workspace inahifadhiwa...`);
    // R51: onyesha matumizi halisi muda huu — user ajue requests/tokens ngapi zimekwisha
    const used = `requests ${cu.usage?.requests ?? 0} · tokens ${(cu.usage?.tokens ?? 0).toLocaleString("en-US")}`;
    hooks.addChip(resumeAt
      ? `⏸️ XMD Computer imepumzika (${reason}) — itajaribiwa tena yenyewe ${t}. (${used} tayari)`
      : `⏸️ XMD Computer imepumzishwa (${reason}) — hali ya workspace imehifadhiwa; ▶ Resume inarejesha pale pale. (${used} tayari)`);
  }

  // TASK-6 (maelezo6): HALI KWANZA — "paused" + chip (pausedOnce/resumeAt/pauseOrigin) zinaandikwa KABLA ya
  // snapshot. SIGTERM inatoka baada ya 22s; snapshot ndefu ilikuwa ikizuia "paused" isiandikwe kabisa.
  const sid8 = String(runner.sessionId || runner.id).slice(0, 8);
  const tPause = Date.now();
  const persistPaused = async (tag: string) => {
    writeCuChip(runner);
    if (!hooks) return;
    const t = Date.now();
    await Promise.race([hooks.persist("paused", hooks.title).catch(() => {}), new Promise((r) => setTimeout(r, PERSIST_WAIT_MS).unref?.())]);
    console.log(`[cu/pause] ${sid8} ${tag} paused · ${Date.now() - t}ms (t+${Date.now() - tPause}ms tangu pause · origin ${origin} · at ${new Date().toISOString()})`);
  };
  await persistPaused("persist#1");

  // (1) SNAPSHOT: tar.gz ya workspace kutoka sandbox hai (bridge yenyewe hushiriki quota-path
  //     pekee — hapa ni server inayopanga). Imefungwa kwa muda (≤2dk) ili pause isighairi kuisha.
  // R51-fix (stale-snapshot): TUMIA YA FRESH KILA WAKATI. `!cu.snapshot` iliruka pause ya
  //     pili+ ikirejesha snapshot ya zamani — resume ikapata kazi ya zamani (data loss).
  // TASK-6: bajeti (budgetMs) + kikomo (maxBytes). Kikizidi → snapshot inarukwa, sandbox inabaki hai, pause inakamilika.
  const budgetMs = limits.budgetMs || 0;
  const maxBytes = limits.maxBytes || SNAPSHOT_MAX_BYTES;
  const tSnap = Date.now();
  const left = (dflt: number) => (budgetMs ? Math.max(0, Math.min(dflt, tSnap + budgetMs - Date.now())) : dflt);
  const within = <T,>(p: Promise<T>, dflt: number, what: string): Promise<T> => {
    const ms = left(dflt);
    if (ms <= 0) return Promise.reject(new Error(`budget ${budgetMs}ms imeisha kabla ya ${what}`));
    return Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(budgetMs ? `budget ${budgetMs}ms (${what})` : `${what} timeout`)), ms).unref?.())]);
  };
  const skipped = (why: string) => {
    hooks?.blog("warning", `🎒 snapshot skipped (${why}) — sandbox itabaki hai kuhifadhi kazi; haijaangamia.`);
    console.log(`[cu/pause] ${sid8} 🎒 snapshot skipped (${why}) · t+${Date.now() - tPause}ms`);
  };
  let snapTaken = false; // snapshot MPYA ya pause hii (ya zamani si sababu ya kuua sandbox)
  const sbx = cu.sandbox;
  if (sbx) {
    try {
      const r: any = await within(
        sbx.commands.run(
          `cd /home/user/ws 2>/dev/null || cd /home/user; tar czf /tmp/cu-ws-pause.tar.gz --exclude node_modules --exclude .git --exclude .cache --exclude playwright-report -S . 2>/dev/null; stat -c%s /tmp/cu-ws-pause.tar.gz 2>/dev/null || echo 0`,
          { timeoutMs: left(120_000) || 1 },
        ),
        150_000, "tar",
      );
      const size = Number(String(r?.stdout || "").trim().split(/\s+/).pop()) || 0;
      if (size > 0 && size <= maxBytes) {
        const bytes = await within(
          sbx.files.read("/tmp/cu-ws-pause.tar.gz", { format: "bytes", requestTimeoutMs: left(150_000) || 1 } as any),
          180_000, "read",
        ) as Uint8Array;
        if (bytes && bytes.length) {
          if (appwriteConfigured) {
            // TASK-6: hakuna nakala ya pili — InputFile.fromBuffer inapokea Uint8Array moja kwa moja (view, si copy)
            const f: any = await within(
              storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(bytes, `cu-ws-${Date.now()}.tar.gz`)),
              150_000, "upload",
            );
            cu.snapshot = { fileId: f.$id, bucketId: CU_BUCKET };
            snapTaken = true;
          }
          hooks?.blog("info", `🎒 Snapshot ya workspace imehifadhiwa (${Math.round(bytes.length / 1024)}KB) — Resume itairejesha.`);
          console.log(`[cu/pause] ${sid8} 🎒 snapshot ${Math.round(bytes.length / 1024)}KB · ${Date.now() - tSnap}ms · t+${Date.now() - tPause}ms`);
        }
      } else if (size > maxBytes) {
        skipped(`${(size / 1024 / 1024).toFixed(1)}MB > kikomo ${Math.round(maxBytes / 1024 / 1024)}MB`);
      } else {
        skipped("tar haikutoa faili");
      }
    } catch (err: any) {
      skipped(String(err?.message || err).slice(0, 120));
    }
    // persist ya pili: chip ina rejea ya snapshot (au hali ya bila snapshot)
    await persistPaused("persist#2");
  }

  // (2) Ukweli wa nje umebadilika? Bridge ikaimaliza kazi yOTE wakati sisi tunapanga pause
  //     (run_end imefika → finishComputer) → pause inaghairiwa; kazi imekamilika halisi.
  if (cu.done) { cu.pausing = false; return true; }

  // (3) BRIDGE INAUAWA sasa (isiendelee kuchoma quota/hack events) — pkill pattern '[c]u_'
  //     haijimatchi yenyewe (kosa la 6ac3ce60). brain.py ni process tofauti — inauawa pia.
  //     Snapshot IKIWA ipo: sandbox yote inafiwa baada ya sekunde 15 (nafasi ya E2B free —
  //     kiutaratibu wa quota-pause). Snapshot IKOSA kubfikia: sandbox INABAKI hai (workspace
  //     ya mwisho iko diskini — resume ina-connect kwake badala ya kuanza upya).
  const sbx2 = cu.sandbox;
  if (sbx2) {
    try {
      await Promise.race([
        sbx2.commands.run("pkill -9 -f '[c]u_bridge.py'; pkill -9 -f '[o]h_bridge.py'; pkill -9 -f '[c]u_brain.py'; true", { timeoutMs: budgetMs ? 3_000 : 20_000 }),
        new Promise((r2) => setTimeout(r2, budgetMs ? 4_000 : 25_000).unref?.()), // TASK-6: SIGTERM — neema ni 22s
      ]);
    } catch { /* bridge haikuuliwa — sandbox-kill hapa chini inaugua */ }
    if (resumeAt) {
      // R40: pause ya watchdog (auto-resume inakuja) — sandbox INABAKI hai (heartbeat polepole).
      // Snapshot bado imehifadhiwa (backup); bridge ameuliwa ili aisogee mwenyewe.
      startSlowHeartbeat(cu, sbx2);
      hooks?.blog?.("info", `🫀 Sandbox ${String(cu.sandboxId || "").slice(0, 8)}… inabaki hai kwa auto-resume (heartbeat 5dk).`);
    } else if (snapTaken) { // TASK-6: snapshot MPYA tu — iliyorukwa → sandbox inabaki hai
      setTimeout(() => sbx2.kill?.().catch(() => {}), 15_000).unref?.();
    }
  }
  // R40: watchdog-pause → cache ya sandbox inabaki (hai); manual/quota → undefined (connect-itakufa → mpya+snapshot)
  cu.sandbox = resumeAt ? (cu.sandbox ?? sbx2) : undefined;

  // (4) PAUSE INAKAMILIKA: awamu inarudishwa, session "paused", chip ya CU state inasasishwa.
  cu.pausing = false;
  cu.pausedNow = true;
  cu.phaseResolve?.();
  writeCuChip(runner);
  if (hooks) {
    void hooks.persist("paused", hooks.title);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok: false, status: "paused" } });
  }
  if (resumeAt) scheduleAutoResume(runner.sessionId || runner.id, resumeAt);
  return true;
}

/** Timer ya ndani (instance ikizima, instrumentation/active-check zinakamilisha). */
/** TASK-1: timers za auto-resume — Map ya globalThis (id-metiri kwa restart/hot-reload + cancel). */
const autoResumeTimers: Map<string, NodeJS.Timeout> =
  ((globalThis as any).__xmdAutoResumeTimers as Map<string, NodeJS.Timeout>) ??
  (((globalThis as any).__xmdAutoResumeTimers = new Map<string, NodeJS.Timeout>()));

export function scheduleAutoResume(sessionId: string, resumeAt: number): void {
  if (!sessionId || !resumeAt) return;
  cancelAutoResume(sessionId); // moja tu per session — schedule mpya inaifuta ya zamani (race za re-pause)
  // resumeAt iliyoisha kabla (mtego wa re-pause au resume ilipotea): 60s — si 5s (loop nzito)
  const ms = Math.max(resumeAt > Date.now() ? 5_000 : 60_000, Math.min(resumeAt - Date.now(), 2_000_000_000));
  const t = setTimeout(() => {
    autoResumeTimers.delete(sessionId);
    // TASK-1 (hatua 3): msisimko wa moto — kama user ana-pause origin=”user”, USI-resume; futa kando kimya
    void import("@/lib/boardRunner")
      .then(async (br) => {
        const runner = br.findRunner(sessionId); // inakubali session id pia
        if (runner?.pauseOrigin === "user") return;
        const m = await import("@/lib/cu/autoResume");
        await m.autoResumeSession(sessionId);
      })
      .catch((err) => console.warn(`[cu/autoResume] timer ya ${sessionId.slice(0, 8)}… imeshindikana: ${String(err).slice(0, 140)}`));
  }, ms);
  autoResumeTimers.set(sessionId, t);
}

/** TASK-1: futa timer ya auto-resume ya session (Detachment-Upgrade au resume). */
export function cancelAutoResume(sessionId: string): void {
  const t = autoResumeTimers.get(sessionId);
  if (!t) return;
  clearTimeout(t);
  autoResumeTimers.delete(sessionId);
}

function finishComputer(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu!;
  if (cu.done) return;
  stopHeartbeat(cu);
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; } // race: "running" isiandike juu ya status ya mwisho
  const status = String(ev.status || "done");
  // TASK-3: heuristic ya hali ya mwisho — "stuck" + ripoti si success tena; unknown status si "ok" kimya.
  const outcome = computeFinalOutcome({
    status, hasReport: !!cu.report, paused: false,
    error: ev.fatal ? String(ev.fatal).slice(0, 200) : undefined,
  });
  const finalState: CuFinalState = outcome.state;
  const ok = outcome.ok; // ok === (finalState === "COMPLETED_UNVERIFIED") — hii pekee inahesabika (interim)
  cu.finalState = finalState;
  cu.finalReason = outcome.reason;

  // tree ya mwisho ya files (Files badge ya replay) — kwa Ujumla hii ndiyo kamili zaidi
  const treeFinal = cu.files || [];
  if (treeFinal.length) {
    const fid = (cu as any).filesItemId as string | undefined;
    const fIdx = fid ? runner.items.findIndex((it: any) => it?.kind === "cu" && it.cu === "files" && it.id === fid) : -1;
    if (fIdx >= 0) runner.items[fIdx] = { ...runner.items[fIdx] as any, files: treeFinal.slice(0, 500), filesCount: treeFinal.length };
    else runner.items.push({ kind: "cu", id: `cu_files_${runner.items.length}`, cu: "files", files: treeFinal.slice(0, 500), filesCount: treeFinal.length } as any);
  }

  runner.items.push({
    kind: "cu", id: `cu_end_${runner.items.length}`, i: ev.i, cu: "run_end", status,
    finalState, finalReason: outcome.reason, // TASK-3
    steps: ev.steps, ms: ev.ms, github: cu.links.repo, live: cu.links.live,
    tokens: cu.usage.tokens, requests: cu.usage.requests,
  } as any);

  // sandbox haipaswi kubaki hai (gharama) — kazi ikiisha inafutwa
  const sbx = cu.sandbox;
  if (sbx) { setTimeout(() => sbx.kill?.().catch(() => {}), 15_000); }

  if (ok) {
    cu.done = true;
    runner.finale = { ...(runner.finale || {}), computer: true };
    if (hooks) {
      hooks.blog("success", `✅ XMD Computer: completed, NOT yet verified — imekamilika, HAIJATHIBITISHWA bado (${cu.usage.requests} LLM calls · ${cu.usage.tokens.toLocaleString("en-US")} tokens · GitHub ${cu.links.repo ? "✓" : "✗"} · Vercel ${cu.links.live ? "✓" : "✗"}).`);
      hooks.addChip(`🖥️ XMD Computer: completed, NOT yet verified — ripoti + ${cu.usage.tokens.toLocaleString("en-US")} tokens.`);
    }
  } else if (hooks) {
    hooks.blog("error", `❌ XMD Computer haijakamilika — ${finalState} (${outcome.reason || status}) — Endeleza inarudisha.`);
    hooks.addChip(`❌ XMD Computer haijakamilika (${finalState}) — bonyeza ▶ Endeleza kuiendeleza.`);
  }

  // chip ya CU state (resume + Files badge) + persist ya mwisho — R31-G4: status ya MWISHO
  // (kosa la G: ilikuwa inaendelea "running" hata CU ikisha — session ya login iliwa "running").
  cu.phaseResolve?.();
  writeCuChip(runner);
  if (hooks) {
    void hooks.persist(ok ? "completed" : "finale_incomplete", hooks.title);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok, status, finalState, finalReason: outcome.reason } });
  }
}

export function cuChipItemOf(runner: Runner): ReturnType<typeof cuChipItem> {
  const cu = runner.cu!;
  return cuChipItem({
    v: 1, sandboxId: cu.sandboxId, token: cu.token, maxI: cu.maxI,
    repo: cu.links.repo, live: cu.links.live, done: cu.done, files: cu.files, report: cu.report,
    pausedOnce: cu.pausedOnce, resumeAt: cu.resumeAt, pauseOrigin: cu.pauseOrigin, snapshot: cu.snapshot, rebuild: !!cu.rebuild,
    finalState: cu.finalState, finalReason: cu.finalReason, // TASK-3
  });
}

export function writeCuChip(runner: Runner): void {
  const cu = runner.cu;
  if (!cu) return;
  const item = cuChipItemOf(runner);
  const idx = runner.items.findIndex((it: any) => it?.kind === "chip" && it?.id === CU_CHIP_ID);
  if (idx >= 0) runner.items[idx] = item as any;
  else runner.items.push(item as any);
}

/** Mwisho wa session (persist) — chip ya CU state ijengwe kabla kila persist muhimu. */
export function cuStateBeforePersist(runner: Runner): void {
  if (runner.cu) writeCuChip(runner);
}
