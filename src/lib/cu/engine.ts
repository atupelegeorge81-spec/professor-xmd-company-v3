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
import type { ProviderUsage, UsageMap } from "@/lib/usageChip";
import type { Runner } from "@/lib/boardRunner";
import type { BoardEvent, LogEntry } from "@/lib/types";

/* ============================ env ============================ */

export const CU_TEMPLATE = process.env.CU_E2B_TEMPLATE || "professor-xmd-browser-v3";
export const CU_MAX_STEPS = Number(process.env.CU_MAX_STEPS) || 60;
/** R31-G: kikomo cha ku-subiri awamu ya CU (run() haiachi stream open milele). */
const CU_HARD_CAP_MS = Number(process.env.CU_HARD_CAP_MS) || 30 * 60 * 1000;
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
  thinkAcc: Map<number, string>;
  persistTimer?: ReturnType<typeof setTimeout>;
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
    };
    for (const it of runner.items as any[]) {
      if (it?.kind === "cu" && typeof it.i === "number") runner.cu.seen.add(`${it.cu}:${it.i}`);
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
  const gem = ledger().gem || ({ day: "", chat: {} } as any);
  const gem2 = ledger().gem2 || ({ day: "", chat: {} } as any);
  const L = ledger();
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
    gemini: {
      keys: { ...(process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY ? { "gemini-1": process.env.GEMINI_API_KEY_1 || process.env.GEMINI_API_KEY } : {}), ...(process.env.GEMINI_API_KEY_2 ? { "gemini-2": process.env.GEMINI_API_KEY_2 } : {}) },
      flashModels: flash, liteModels: lite,
      flashRpd: Number(process.env.GEMINI_FLASH_RPD) || 20,
      liteRpd: Number(process.env.GEMINI_LITE_RPD) || 500,
      flashRpm: Number(process.env.GEMINI_FLASH_RPM) || 5,
      liteRpm: Number(process.env.GEMINI_LITE_RPM) || 15,
      baseUrl: process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai",
      quota: { "gemini-1": { day: gem.day, chat: gem.chat || {} }, "gemini-2": { day: gem2.day, chat: gem2.chat || {} } },
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
    try {
      const sbx = await Sandbox.connect(cu.sandboxId, { apiKey });
      cu.sandbox = sbx;
      return sbx;
    } catch { /* imikufa → mpya */ }
  }
  const sbx = await Sandbox.create(CU_TEMPLATE, { apiKey });
  cu.sandbox = sbx;
  cu.sandboxId = sbx.sandboxId;
  return sbx;
}

function bridgeCommand(o: {
  title: string; session: string; token: string; startI: number; resumeNote: string; maxSteps: number;
}): string {
  const env = [
    `cd /home/user && bash /home/user/cu_setup.sh;`,
    `PATH=/home/user/.local/bin:/home/user/node_modules/.bin:/usr/local/bin:$PATH`,
    `PLAYWRIGHT_BROWSERS_PATH=/home/user/.cache/ms-playwright`,
    `ANTHROPIC_BASE_URL=http://127.0.0.1:4010`,
    `ANTHROPIC_API_KEY=sk-xmd-local`,
    `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1`,
    `PYTHONUNBUFFERED=1`,
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
    `--max-steps ${o.maxSteps}`,
    `--start-i ${o.startI}`,
    `--callback-url ${q(CU_PUBLIC_URL + CU_EVENT_PATH)}`,
    `--callback-token ${q(o.token)}`,
  ];
  if (o.resumeNote) args.push(`--resume-note ${q(o.resumeNote.slice(0, 3000))}`);
  return `${env} ${VENV_PY} ${args.join(" ")}`;
}

/* ============================ PHASE: kuanza / kuendelea ============================ */

export async function startComputerPhase(runner: Runner, hooks: CuHooks): Promise<void> {
  const cu = ensureCuState(runner);
  if (cu.done) return;
  if (!cu.phaseDone) cu.phaseDone = new Promise<void>((res) => { cu.phaseResolve = res; });
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
            handleCuEvent(runner, hooks, ev);
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
        const r = await sbx.commands.run("pgrep -f cu_bridge.py >/dev/null 2>&1 && echo ALIVE || echo DEAD", { timeoutMs: 15_000 });
        bridgeAlive = String(r?.stdout || "").includes("ALIVE");
      } catch { /* */ }
      // run_end ipo events.jsonl + bridge IMEKUFA → awamu inakamilika kutoka replay
      // (Koyeb ilipotea kabla ya POST zote kufika — muda wa ushairi). Idempotent: dedupe
      // ya run_end inaondolewa ili finishComputer iweze kukamilisha hata kama item ipo tayari.
      const lastEnd = (cu as any).lastEnd;
      if (!bridgeAlive && lastEnd) {
        hooks.blog("success", "♻️ Bridge imemaliza huko nyuma (Koyeb ilipotea) — run_end inacompletishwa kutoka replay.");
        cu.seen.delete(`run_end:${lastEnd.i}`);
        handleCuEvent(runner, hooks, lastEnd);
        if (cu.done) return;
        // run_end ya kosa → fatal card ipo; Endeleza itaanza run mpya (hapa chini haitaji — tunarudi)
        return;
      }
      if (bridgeAlive) {
        hooks.blog("success", "🖥️ Bridge bado inaendelea ndani ya sandbox — tume-attach tu ( hakuna run mpya).");
        cu.startedAt = Date.now();
        cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);
        await awaitPhase();
        return;
      }
    }

    // kila run: files fresh (mfumo wa XMD — sandbox isibaki na code ya zamani)
    await sbx.files.write("/home/user/cu_brain.py", brainSrc);
    await sbx.files.write("/home/user/cu_bridge.py", bridgeSrc);
    await sbx.files.write("/home/user/cu_setup.sh", setupSrc);
    await sbx.files.write("/home/user/plan.md", plan.md);
    await sbx.files.write("/home/user/cu-config.json", JSON.stringify(buildCuConfig()));

    const resumeNote = resume ? buildResumeNote(runner) : "";
    const cmd = bridgeCommand({
      title: plan.title, session: runner.sessionId || runner.id, token: cu.token,
      startI: cu.maxI, resumeNote, maxSteps: CU_MAX_STEPS,
    });
    hooks.blog("api", `🚀 Sandbox ${cu.sandboxId?.slice(0, 8)}… — bridge inaanzishwa${resume ? " (resume)" : ""}.`);

    cu.startedAt = Date.now();
    const handle = await sbx.commands.run(`bash -lc ${q(cmd)}`, {
      background: true, timeoutMs: 60 * 60 * 1000,
      onStdout: (d: string) => { for (const l of String(d).split("\n")) if (l.startsWith("@@XMD ")) hooks.blog("info", `🖥️ ${l.slice(6, 400)}`); },
      onStderr: (d: string) => { const s = String(d).trim(); if (s) hooks.blog("warning", `🖥️ stderr: ${s.slice(0, 300)}`); },
    });

    // heartbeat: sandbox isife wakati run inaendelea
    cu.heartbeat = setInterval(() => { sbx.setTimeout(60 * 60 * 1000).catch(() => {}); }, 60_000);

    // watchdog: bridge ikifa bila run_end → fatal card moja (+ Endelea inabaki)
    handle.wait().then((r: any) => {
      if (!cu.done && runner.status === "running") {
        hooks.blog("error", `🖥️ Bridge imekufa (code ${r?.exitCode ?? "?"}) bila kumaliza.`);
        handleCuEvent(runner, hooks, { i: cu.maxI + 1, type: "run_end", status: "error", steps: cu.step, ms: Date.now() - cu.startedAt, fatal: `bridge exit ${r?.exitCode ?? "?"}` });
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
  cu.phaseResolve?.();
  void hooks.persist("running", hooks.title);
}

function stopHeartbeat(cu: CuRunState) {
  if (cu.heartbeat) { clearInterval(cu.heartbeat); cu.heartbeat = undefined; }
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
  if (force) {
    if (cu.persistTimer) { clearTimeout(cu.persistTimer); cu.persistTimer = undefined; }
    void hooks.persist("running", hooks.title);
    cu.lastPersistAt = Date.now();
    return;
  }
  if (cu.persistTimer) return;
  cu.persistTimer = setTimeout(() => {
    const c = runner.cu;
    if (!c) return;
    c.persistTimer = undefined;
    c.lastPersistAt = Date.now();
    void hooks.persist("running", hooks.title);
  }, 2_500);
}

/** Tukio moja kutoka bridge: dedupe → bucket (shot) → usage → item(s) → broadcast. */
export function handleCuEvent(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu || ensureCuState(runner);
  const key = `${ev.type}:${ev.i}`;
  if (cu.seen.has(key)) return;
  cu.seen.add(key);
  if (ev.i > cu.maxI) cu.maxI = ev.i;

  // broadcast LIVE kila tukio (UI ina-animation ya live) — shot bila base64 (fileId inakuja baadaye)
  if (hooks) hooks.bcast({ type: "cu", cu: ev.type === "shot" ? { ...ev, data: undefined, has_data: true } : ev });

  switch (ev.type) {
    case "run_start": {
      cu.startedAt = Date.now();
      runner.items.push({ kind: "cu", id: `cu_start_${runner.items.length}`, i: ev.i, cu: "run_start", task: ev.task, model: ev.model, budget: ev.budget } as any);
      schedulePersist(runner, hooks!, true);
      break;
    }
    case "think_start": break;
    case "think_delta": {
      const s = Number(ev.step) || 0;
      cu.thinkAcc.set(s, (cu.thinkAcc.get(s) || "") + String(ev.text || ""));
      break;
    }
    case "think_end": {
      const s = Number(ev.step) || 0;
      const text = (cu.thinkAcc.get(s) || "").slice(0, CAP.think);
      cu.thinkAcc.delete(s);
      runner.items.push({ kind: "cu", id: `cu_think_${runner.items.length}`, i: ev.i, cu: "think", step: s, ms: ev.ms, text } as any);
      schedulePersist(runner, hooks!);
      break;
    }
    case "text_start": break;
    case "text_delta": {
      const s = Number(ev.step) || 0;
      cu.textAcc.set(s, (cu.textAcc.get(s) || "") + String(ev.text || ""));
      break;
    }
    case "text_end": {
      const s = Number(ev.step) || 0;
      const text = (cu.textAcc.get(s) || "").slice(0, CAP.text);
      cu.textAcc.delete(s);
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
      const tree = ((ev.tree as unknown[]) || []).map(String);
      cu.files = tree;
      // item ya "files" inahifadhiwa kwenye buckets (25/50/100/200/500) — replay ya Files
      // badge ina tree ya mwisho bila kujaza session kwa snapshots 500 kila exec
      const count = tree.length;
      const bucket = count <= 25 ? 25 : count <= 50 ? 50 : count <= 100 ? 100 : count <= 200 ? 200 : 500;
      if (bucket > (cu as any).filesBucket) {
        (cu as any).filesBucket = bucket;
        runner.items.push({ kind: "cu", id: `cu_files_${runner.items.length}`, i: ev.i, cu: "files", files: tree.slice(0, 500), filesCount: count } as any);
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
      if (/^API Error/i.test(rtext.trim())) {
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
    case "run_end": {
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
    if (provider === "gemini" && (account === "gemini-1" || account === "gemini-2")) {
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

function finishComputer(runner: Runner, hooks: CuHooks | null, ev: CuEvent): void {
  const cu = runner.cu!;
  if (cu.done) return;
  stopHeartbeat(cu);
  const status = String(ev.status || "done");
  const ok = !!cu.report && status !== "error";

  // tree ya mwisho ya files (Files badge ya replay) — kwa Ujumla hii ndiyo kamili zaidi
  const treeFinal = cu.files || [];
  if (treeFinal.length) {
    runner.items.push({ kind: "cu", id: `cu_files_${runner.items.length}`, cu: "files", files: treeFinal.slice(0, 500), filesCount: treeFinal.length } as any);
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

  // chip ya CU state (resume + Files badge) + persist ya mwisho
  cu.phaseResolve?.();
  writeCuChip(runner);
  if (hooks) {
    schedulePersist(runner, hooks, true);
    hooks.bcast({ type: "cu", cu: { type: "phase_done", ok, status } });
  }
}

export function cuChipItemOf(runner: Runner): ReturnType<typeof cuChipItem> {
  const cu = runner.cu!;
  return cuChipItem({
    v: 1, sandboxId: cu.sandboxId, token: cu.token, maxI: cu.maxI,
    repo: cu.links.repo, live: cu.links.live, done: cu.done, files: cu.files, report: cu.report,
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
