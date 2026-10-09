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
import { getPlanBySession, PROJECT_PLANS_COL, type ProjectPlanDoc } from "@/lib/server/plans";
import { unpack } from "@/lib/server/packed";
import {
  noteGemResult, noteXkiroTokens, noteOrResult, noteGroqTokens, noteUnoResult,
  ledger, type GemAcct,
} from "@/lib/server/usageLedger";
import { slotKeys } from "@/lib/server/usageKeys";
import { GEMINI_MODEL_SKIP } from "@/lib/env";
import { GEM_ACCOUNTS, type GemAccountId } from "@/lib/usage/accounts";
import type { ProviderUsage, UsageMap } from "@/lib/usageChip";
import type { Runner } from "@/lib/boardRunner";
import type { BoardEvent, LogEntry } from "@/lib/types";

/* ============================ env ============================ */

export const CU_TEMPLATE = process.env.CU_E2B_TEMPLATE || "professor-xmd-browser-v3";
/** R31-G: kikomo cha ku-subiri awamu ya CU (run() haiachi stream open milele). */
const CU_HARD_CAP_MS = Number(process.env.CU_HARD_CAP_MS) || 30 * 60 * 1000;
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
  snapshot?: { fileId: string; bucketId: string };
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
  snapshot?: { fileId: string; bucketId: string };
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
    };
    for (const it of runner.items as any[]) {
      if (it?.kind === "cu" && typeof it.i === "number") runner.cu.seen.add(`${it.cu}:${it.i}`);
      // item ya "files" ile ile inayosasishwa — rudia id yake (item ya pili isionekane)
      if (it?.kind === "cu" && it.cu === "files" && typeof it.id === "string") (runner.cu as any).filesItemId = it.id;
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
  const lite = (process.env.GEMINI_LITE_MODELS || "gemini-3.5-flash-lite,gemini-3.1-flash-lite").split(",").map(s => s.trim()).filter(Boolean);
  const emergency: Record<string, unknown>[] = [];

  const xkiro = { ...keysOf("xkiro-1"), ...keysOf("xkiro-2") };
  if (Object.keys(xkiro).length) {
    emergency.push({
      provider: "xkiro", baseUrl: process.env.XTROUTER_BASE_URL || "https://api.xkiro.com/v1",
      models: [process.env.XTROUTER_MODEL || "qwen/qwen3.8-max:free"], keys: xkiro, maxOut: 32_000, ctx: 256_000, reasoning: true,
      quota: {
        "xkiro-1": { remaining: L.xkiro?.["xkiro-1"]?.remaining, exhaustedAt: L.xkiro?.["xkiro-1"]?.exhaustedAt },
        "xkiro-2": { remaining: L.xkiro?.["xkiro-2"]?.remaining, exhaustedAt: L.xkiro?.["xkiro-2"]?.exhaustedAt },
      },
    });
  }
  const or = { ...keysOf("or-1"), ...keysOf("or-2") };
  if (Object.keys(or).length) {
    emergency.push({
      provider: "openrouter", baseUrl: process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1",
      models: [process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free"], keys: or, maxOut: 65_000, ctx: 1_000_000, reasoning: true,
      quota: {
        "or-1": { requests: L.or?.["or-1"]?.requests, exhaustedUntil: L.or?.["or-1"]?.exhaustedUntil, retryAt: L.or?.["or-1"]?.retryAt },
        "or-2": { requests: L.or?.["or-2"]?.requests, exhaustedUntil: L.or?.["or-2"]?.exhaustedUntil, retryAt: L.or?.["or-2"]?.retryAt },
      },
    });
  }
  const groq = { ...keysOf("groq-1"), ...keysOf("groq-2") };
  const groqModels = (process.env.GROQ_MODELS || "qwen/qwen3.8-27b,openai/gpt-oss-120b").split(",").map(s => s.trim()).filter(Boolean);
  if (Object.keys(groq).length) {
    emergency.push({
      provider: "groq", baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
      models: groqModels, keys: groq, maxOut: 8_000, ctx: 131_000, reasoning: true,
      quota: {
        "groq-1": { models: L.groq?.["groq-1"]?.models || {} },
        "groq-2": { models: L.groq?.["groq-2"]?.models || {} },
      },
    });
  }
  const uno = { ...keysOf("uno-1"), ...keysOf("uno-2") };
  const unoModels = (process.env.UNOROUTER_MODELS || "space-bunny-alpha:free,nemotron-3-ultra-550b-a55b:free").split(",").map(s => s.trim()).filter(Boolean);
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

export async function planMarkdown(runner: Runner): Promise<{ title: string; md: string; steps: number } | null> {
  const doc = await planDocFor(runner);
  if (!doc) return null;
  return {
    title: doc.title || runner.project.slice(0, 120),
    md: unpack(doc.plan_content) || doc.plan_content || doc.objective || "",
    steps: doc.total_steps || 0,
  };
}

/* ============================ sandbox lifecycle ============================ */

const q = (x: string) => `'${String(x).replace(/'/g, `'\\''`)}'`;
const VENV_PY = "/code/openhands-venv/bin/python";

async function readCuFile(name: string): Promise<string> {
  return readFile(join(process.cwd(), "cu", name), "utf8");
}

async function getSandbox(cu: CuRunState): Promise<any> {
  if (cu.sandbox) return cu.sandbox;
  const apiKey = process.env.E2B_API_KEY!;
  if (cu.sandboxId) {
    // R31-G4: sandbox ya zamani (pause/error) — connect kwenye iliyouawa inaweza HANGA
    // bila kosa (run ya 6ac3ce60 ilikaa dakika 22!). Timebox sekunde 25 = kama imekufa.
    try {
      const sbx = await Promise.race([
        Sandbox.connect(cu.sandboxId, { apiKey }),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B connect timeout (25s)")), 25_000).unref?.()),
      ]);
      cu.sandbox = sbx;
      return sbx;
    } catch { /* imikufa / imehangia → mpya */ }
  }
  // create pia inapewa timebox (90s) — E2B ikikwama run isife kimya
  const sbx = await Promise.race([
    Sandbox.create(CU_TEMPLATE, { apiKey }),
    new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B create timeout (90s)")), 90_000).unref?.()),
  ]);
  cu.sandbox = sbx;
  cu.sandboxId = sbx.sandboxId;
  return sbx;
}

function bridgeCommand(o: {
  title: string; session: string; token: string; startI: number; resumeNote: string; restoreUrl?: string;
}): string {
  const env = [
    `cd /home/user && bash /home/user/cu_setup.sh;`,
    `PATH=/home/user/.local/bin:/home/user/node_modules/.bin:/usr/local/bin:$PATH`,
    `PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright`,
    `ANTHROPIC_BASE_URL=http://127.0.0.1:4010`,
    `ANTHROPIC_API_KEY=sk-xmd-local`,
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
    `PYTHONUNBUFFERED=1`,
    // R32: URL ya search tool (MCP in-process ya bridge inapiga route ya Koyeb kwanza,
    // fallback SearXNG direct). Hakuna token budget — agizo la CEO 06-10 usiku.
    `CU_SEARCH_URL=${q(CU_PUBLIC_URL + "/api/boardroom/cu-search")}`,
    `GITHUB_TOKEN=${q(process.env.CU_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "")}`,
    `GH_TOKEN=${q(process.env.CU_GITHUB_TOKEN || process.env.GITHUB_TOKEN || "")}`,
    `GITHUB_ORG=${q(GITHUB_ORG)}`,
    `GITHUB_USERNAME=${q(GITHUB_USER)}`,
    `VERCEL_TOKEN=${q(process.env.CU_VERCEL_TOKEN || process.env.VERCEL_TOKEN || "")}`,
  ].join(" ");
  const args = [
    `/home/user/cu_bridge.py`,
    `--task-file /home/user/plan.md`,
    `--title ${q(o.title.slice(0, 300))}`,
    `--session ${q(o.session)}`,
    `--start-i ${o.startI}`,
    `--callback-url ${q(CU_PUBLIC_URL + CU_EVENT_PATH)}`,
    `--callback-token ${q(o.token)}`,
  ];
  if (o.resumeNote) args.push(`--resume-note ${q(o.resumeNote.slice(0, 3000))}`);
  if (o.restoreUrl) args.push(`--restore-url ${q(o.restoreUrl)}`);
  return `${env} ${VENV_PY} ${args.join(" ")}`;
}

/* ============================ PHASE: kuanza / kuendelea ============================ */

export async function startComputerPhase(runner: Runner, hooks: CuHooks): Promise<void> {
  const cu = ensureCuState(runner);
  if (cu.done) return;
  // R38-RC5: awamu inaanza → pause ya ZAMANI inaisha (events mpya za bridge zinakubalika tena)
  cu.pausedNow = false;
  // R31-G4: awamu MPYA = promise MPYA (ile ya run iliyopita imesharesolve — bila hii,
  // awaitPhase ingerudi MARA MOJA na run ingeisha huku bridge bado unaendelea)
  cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
  const awaitPhase = () => Promise.race([
    cu.phaseDone ?? Promise.resolve(),
    new Promise<void>((r) => setTimeout(r, CU_HARD_CAP_MS)),
  ]);

  // ── divider + card ya kuanza (baada ya card ya MWISHO kabisa ya Board — memory imekamilika)
  hooks.bcast({ type: "cu", cu: { type: "divider" } });
  runner.items.push({ kind: "cu", id: `cu_divider_${runner.items.length}`, cu: "divider" } as any);
  hooks.blog("system", "🖥️ Awamu ya XMD COMPUTER inaanza — agent anatekeleza Mpango Kazi (E2B sandbox).");

  const plan = await planMarkdown(runner);
  if (!plan) {
    cuError(runner, hooks, "Mpango Kazi haukupatikana kwenye project_plans — computer-use haiwezi kuanza.");
    return;
  }

  const resume = cu.maxI > 0;
  if (resume) hooks.blog("info", `♻️ XMD Computer inaendelea (resume) — events ${cu.maxI} zilizoongozwa nazo zipo.`);

  let brainSrc: string, bridgeSrc: string, setupSrc: string;
  try {
    [brainSrc, bridgeSrc, setupSrc] = await Promise.all([readCuFile("brain.py"), readCuFile("bridge.py"), readCuFile("setup.sh")]);
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
        const r = await sbx.commands.run("pgrep -f '[c]u_bridge.py' >/dev/null 2>&1 && echo ALIVE || echo DEAD", { timeoutMs: 15_000 });
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
        startWatchdog(runner, hooks, cu); // R38-RC1: bridge hai lakini ikinyamaza → onyo/pause
        await awaitPhase();
        return;
      }
    }

    // kila run: files fresh (mfumo wa XMD — sandbox isibaki na code ya zamani)
    await sbx.files.write("/home/user/cu_brain.py", brainSrc);
    await sbx.files.write("/home/user/cu_bridge.py", bridgeSrc);
    await sbx.files.write("/home/user/cu_setup.sh", setupSrc);
    await sbx.files.write("/home/user/plan.md", plan.md);
    const cuCfg = buildCuConfig() as Record<string, unknown>;
    const testPauseMs = Number(process.env.CU_TEST_QUOTA_PAUSE_MS) || 0;
    if (testPauseMs && !cu.pausedOnce) cuCfg.test_quota_pause_ms = testPauseMs; // traffic ya uongo (test ya auto-resume)
    await sbx.files.write("/home/user/cu-config.json", JSON.stringify(cuCfg));

    const resumeNote = resume ? buildResumeNote(runner) : "";
    // R31-G4: resume kutoka pause (quota) — snapshot ya workspace ya jana inarejesha kwanza
    const restoreUrl = resume && cu.snapshot?.fileId && !cu.done
      ? `${process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1"}/storage/buckets/${cu.snapshot.bucketId || CU_BUCKET}/files/${cu.snapshot.fileId}/view?project=${process.env.APPWRITE_PROJECT_ID || ""}`
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
      await sbx.commands.run("pkill -9 -f '[c]u_bridge.py' || true", { timeoutMs: 15_000 }).catch(() => {});
    }
    const handle = await sbx.commands.run(`bash -lc ${q(cmd)}`, {
      background: true, timeoutMs: 60 * 60 * 1000,
      onStdout: (d: string) => { for (const l of String(d).split("\n")) if (l.startsWith("@@XMD ")) hooks.blog("info", `🖥️ ${l.slice(6, 400)}`); },
      onStderr: (d: string) => { const s = String(d).trim(); if (s) hooks.blog("warning", `🖥️ stderr: ${s.slice(0, 300)}`); },
    });

    // heartbeat: sandbox isife wakati run inaendelea
    if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; } // R40: kasi inachukua
    cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);
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
    cuError(runner, hooks, `Sandbox ya E2B haikuwezekana: ${String(e?.message || e).slice(0, 200)}`);
  }
}

/** Maelezo ya resume kwa agent (hali halisi — si madai): hatua ya ndani + kazi zilizoonekana. */
function buildResumeNote(runner: Runner): string {
  const cu = runner.cu!;
  const execs = runner.items.filter((it: any) => it?.kind === "cu" && it?.cu === "exec").slice(-12).map((it: any) => `${it.tool}: ${String(it.command || "").slice(0, 80)}`);
  return `A previous run stopped at internal step ${cu.step}. Recent completed commands: ${execs.join(" | ") || "(none recorded)"}. The workspace /home/user/ws may still contain that work — INSPECT it first, do not redo what is already done, then continue the plan from where it stopped.`;
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

function stopHeartbeat(cu: CuRunState) {
  if (cu.heartbeat) { clearInterval(cu.heartbeat); cu.heartbeat = undefined; }
  if (cu.slowHeartbeat) { clearInterval(cu.slowHeartbeat); cu.slowHeartbeat = undefined; }
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
  const idleMs = Date.now() - (cu.lastEventAt || cu.startedAt);
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
  const st = runner.status === "paused" ? "paused" : runner.cu?.pausedOnce && !runner.cu?.done ? "paused" : "running";
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
      const s = Number(ev.step) || 0;
      cu.textAcc.set(s, (cu.textAcc.get(s) || "") + String(ev.text || ""));
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
    } else if (provider === "xkiro" && ok && (account === "xkiro-1" || account === "xkiro-2")) {
      noteXkiroTokens(account, total);
    } else if (provider === "openrouter" && (account === "or-1" || account === "or-2")) {
      noteOrResult(account, ok, total);
    } else if (provider === "groq" && ok && (account === "groq-1" || account === "groq-2")) {
      noteGroqTokens(account, model, total);
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
export async function pauseComputerFromServer(runner: Runner, hooks: CuHooks | null, reason: string, resumeAt: number): Promise<boolean> {
  const cu = runner.cu;
  // pausedNow = pause ya SASA (si historia ya pausedOnce — hiyo inaruhusu resume-continue)
  if (!cu || cu.done || cu.pausedNow || cu.pausing) return false;
  cu.pausing = true;
  stopHeartbeat(cu); // heartbeat + watchdog (RC1)
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
  cu.pausedOnce = true;
  cu.resumeAt = resumeAt;
  cu.stallWarned = false;
  runner.items.push({ kind: "cu", id: `cu_pause_${runner.items.length}`, i: cu.maxI, cu: "pause", resumeAt, reason: String(reason).slice(0, 200), steps: cu.step } as any);
  if (hooks) {
    const t = resumeAt ? new Date(resumeAt).toLocaleTimeString("en-GB", { timeZone: "Africa/Dar_es_Salaam", hour12: false }) : "";
    hooks.blog("warning", `⏸️ XMD Computer imepumzishwa — ${reason}. Workspace inahifadhiwa...`);
    hooks.addChip(resumeAt
      ? `⏸️ XMD Computer imepumzika (${reason}) — itajaribiwa tena yenyewe ${t}.`
      : `⏸️ XMD Computer imepumzishwa (${reason}) — hali ya workspace imehifadhiwa; ▶ Resume inarejesha pale pale.`);
  }

  // (1) SNAPSHOT: tar.gz ya workspace kutoka sandbox hai (bridge yenyewe hushiriki quota-path
  //     pekee — hapa ni server inayopanga). Imefungwa kwa muda (≤2dk) ili pause isighairi kuisha.
  const sbx = cu.sandbox;
  if (sbx && !cu.snapshot) {
    try {
      const r = await Promise.race([
        sbx.commands.run(
          `cd /home/user/ws 2>/dev/null || cd /home/user; tar czf /tmp/cu-ws-pause.tar.gz --exclude node_modules --exclude .git --exclude .cache --exclude playwright-report -S . 2>/dev/null; stat -c%s /tmp/cu-ws-pause.tar.gz 2>/dev/null || echo 0`,
          { timeoutMs: 120_000 },
        ),
        new Promise<never>((_, rej) => setTimeout(() => rej(new Error("tar timeout")), 150_000).unref?.()),
      ]);
      const size = Number(String(r?.stdout || "").trim().split(/\s+/).pop()) || 0;
      if (size > 0 && size <= 40 * 1024 * 1024) {
        const bytes = await Promise.race([
          sbx.files.read("/tmp/cu-ws-pause.tar.gz", { format: "bytes", requestTimeoutMs: 150_000 } as any),
          new Promise<never>((_, rej) => setTimeout(() => rej(new Error("read timeout")), 180_000).unref?.()),
        ]);
        if (bytes && bytes.length) {
          if (appwriteConfigured) {
            const f: any = await Promise.race([
              storage.createFile(CU_BUCKET, "unique()", InputFile.fromBuffer(Buffer.from(bytes), `cu-ws-${Date.now()}.tar.gz`)),
              new Promise<never>((_, rej) => setTimeout(() => rej(new Error("upload timeout")), 150_000).unref?.()),
            ]);
            cu.snapshot = { fileId: f.$id, bucketId: CU_BUCKET };
          }
          hooks?.blog("info", `🎒 Snapshot ya workspace imehifadhiwa (${Math.round(bytes.length / 1024)}KB) — Resume itairejesha.`);
        }
      } else if (size > 40 * 1024 * 1024) {
        hooks?.blog("warning", `🎒 Workspace ni kubwa mno kwa snapshot (${Math.round(size / 1024 / 1024)}MB) — sandbox itabaki hai kuhifadhi kazi; haijaangamia.`);
      }
    } catch (err: any) {
      hooks?.blog("warning", `🎒 Snapshot haikupatikana (${String(err?.message || err).slice(0, 120)}) — sandbox itabaki hai kuhifadhi kazi; haijaangamia.`);
    }
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
        sbx2.commands.run("pkill -9 -f '[c]u_bridge.py'; pkill -9 -f '[c]u_brain.py'; true", { timeoutMs: 20_000 }),
        new Promise((r2) => setTimeout(r2, 25_000).unref?.()),
      ]);
    } catch { /* bridge haikuuliwa — sandbox-kill hapa chini inaugua */ }
    if (resumeAt) {
      // R40: pause ya watchdog (auto-resume inakuja) — sandbox INABAKI hai (heartbeat polepole).
      // Snapshot bado imehifadhiwa (backup); bridge ameuliwa ili aisogee mwenyewe.
      startSlowHeartbeat(cu, sbx2);
      hooks?.blog?.("info", `🫀 Sandbox ${String(cu.sandboxId || "").slice(0, 8)}… inabaki hai kwa auto-resume (heartbeat 5dk).`);
    } else if (cu.snapshot) {
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
export function scheduleAutoResume(sessionId: string, resumeAt: number): void {
  if (!sessionId || !resumeAt) return;
  // resumeAt iliyoisha kabla (mtego wa re-pause au resume ilipotea): 60s — si 5s (loop nzito)
  const ms = Math.max(resumeAt > Date.now() ? 5_000 : 60_000, Math.min(resumeAt - Date.now(), 2_000_000_000));
  setTimeout(() => {
    void import("@/lib/cu/autoResume")
      .then((m) => m.autoResumeSession(sessionId))
      .catch((err) => console.warn(`[cu/autoResume] timer ya ${sessionId.slice(0, 8)}… imeshindikana: ${String(err).slice(0, 140)}`));
  }, ms);
}

function finishComputer(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu!;
  if (cu.done) return;
  stopHeartbeat(cu);
  if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; } // race: "running" isiandike juu ya status ya mwisho
  const status = String(ev.status || "done");
  const ok = !!cu.report && status !== "error";

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
      hooks.blog("success", `✅ XMD Computer imemaliza (${cu.usage.requests} LLM calls · ${cu.usage.tokens.toLocaleString("en-US")} tokens · GitHub ${cu.links.repo ? "✓" : "✗"} · Vercel ${cu.links.live ? "✓" : "✗"}).`);
      hooks.addChip(`🖥️ XMD Computer amemaliza: ripoti + ${cu.usage.tokens.toLocaleString("en-US")} tokens.`);
    }
  } else if (hooks) {
    hooks.blog("error", `❌ XMD Computer haijakamilika (${status}${ev.fatal ? ` · ${ev.fatal}` : ""}) — Endeleza inarudisha.`);
    hooks.addChip("❌ XMD Computer haijakamilika — bonyeza ▶ Endeleza kuiendeleza.");
  }

  // chip ya CU state (resume + Files badge) + persist ya mwisho — R31-G4: status ya MWISHO
  // (kosa la G: ilikuwa inaendelea "running" hata CU ikisha — session ya login iliwa "running").
  cu.phaseResolve?.();
  writeCuChip(runner);
  if (hooks) {
    void hooks.persist(ok ? "completed" : "finale_incomplete", hooks.title);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok, status } });
  }
}

export function cuChipItemOf(runner: Runner): ReturnType<typeof cuChipItem> {
  const cu = runner.cu!;
  return cuChipItem({
    v: 1, sandboxId: cu.sandboxId, token: cu.token, maxI: cu.maxI,
    repo: cu.links.repo, live: cu.links.live, done: cu.done, files: cu.files, report: cu.report,
    pausedOnce: cu.pausedOnce, resumeAt: cu.resumeAt, snapshot: cu.snapshot,
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
