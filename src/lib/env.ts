// src/lib/env.ts — providers, models na majina ya personas (R16 · Capacity Broker).
// HAKUNA key ndani ya code — zote zinatoka .env.local. Uchaguzi wa key/model kwa kila ombi unafanywa na
// src/lib/broker (hakuna tena "stage" 0..4 wala mzunguko wa kila agent).

export const XTROUTER_BASE_URL = process.env.XTROUTER_BASE_URL || "https://api.xkiro.com/v1";
export const XTROUTER_MODEL = process.env.XTROUTER_MODEL || "qwen/qwen3.8-max:free";

export const GROQ_BASE_URL = process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1";
// Groq: models 2 kwa kila account (kila model ina TPM/TPD yake). Limits zinasomwa live: lib/server/groqLimits.ts
export const GROQ_MODELS: string[] = (process.env.GROQ_MODELS || "qwen/qwen3.8-27b,openai/gpt-oss-120b")
  .split(",").map((s) => s.trim()).filter(Boolean);

export const OPENROUTER_BASE_URL = process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
export const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "nvidia/nemotron-3-ultra-550b-a55b:free";

export const UNOROUTER_BASE_URL = process.env.UNOROUTER_BASE_URL || "https://api.unorouter.com/v1";
export const UNOROUTER_MODELS: string[] = (process.env.UNOROUTER_MODELS || "space-bunny-alpha:free,nemotron-3-ultra-550b-a55b:free")
  .split(",").map((s) => s.trim()).filter(Boolean);

// R18 · Gemini (Google AI Studio free tier) kupitia njia ya OpenAI (…/v1beta/openai) — imejaribiwa: stream + usage.
//   Quota ni kwa PROJECT na kwa KILA MODEL (kila model ina hesabu yake). Imehakikiwa kwa 429 halisi (quotaValue):
//   Flash = 5 kwa dakika · Flash-Lite = 15 kwa dakika. Kwa siku (vipimo huru Sep 2026): Flash 20 · Flash-Lite 500.
//   gemma haitumiki (Mkuu) · 2.5-pro/2.5-flash-lite = 404 kwa watumiaji wapya · 3.1-pro = kulipia tu.
export const GEMINI_BASE_URL = process.env.GEMINI_BASE_URL || "https://generativelanguage.googleapis.com/v1beta/openai";
export const GEMINI_NATIVE_URL = process.env.GEMINI_NATIVE_URL || "https://generativelanguage.googleapis.com/v1beta";
const list = (v: string | undefined, d: string) => (v || d).split(",").map((s) => s.trim()).filter((m) => m && !/gemma/i.test(m));
/** Flash (nzito, bora kwanza) — kazi za HEAVY: code, mini-report, script ya mwisho, ripoti */
export const GEMINI_FLASH_MODELS: string[] = list(process.env.GEMINI_FLASH_MODELS, "gemini-3.8-flash,gemini-3.7-flash,gemini-3.6-flash,gemini-3.5-flash,gemini-3-flash-preview,gemini-2.5-flash");
/** Flash-Lite (haraka, nyingi) — kazi za LIGHT/BACKGROUND: observers, memory, search query, title */
export const GEMINI_LITE_MODELS: string[] = list(process.env.GEMINI_LITE_MODELS, "gemini-3.5-flash-lite,gemini-3.1-flash-lite");
/** R38: models zilizo 404 kwa akaunti MAALUM tu — live probe 08-10: gemini-2.5-flash
 *  gemini-1 ✅ 200 OK · gemini-2 ❌ 404 "no longer available to new users".
 *  Lane ya kombinations hizi haizalishwi kabisa (broker ya Board + config ya CU / brain.py); gemini-1 inabaki nayo. */
export const GEMINI_MODEL_SKIP: Record<string, string[]> = { "gemini-2": ["gemini-2.5-flash"] };
/** Embeddings za search cache: ya kwanza = msingi, ya pili = akiba (space yake — vectors hazichanganywi) */
export const GEMINI_EMBED_MODELS: string[] = list(process.env.GEMINI_EMBED_MODELS, "gemini-embedding-001,gemini-embedding-2");
export const GEMINI_FLASH_RPD = Number(process.env.GEMINI_FLASH_RPD) || 20;
export const GEMINI_FLASH_RPM = Number(process.env.GEMINI_FLASH_RPM) || 5;
export const GEMINI_LITE_RPD = Number(process.env.GEMINI_LITE_RPD) || 500;
export const GEMINI_LITE_RPM = Number(process.env.GEMINI_LITE_RPM) || 15;
export const GEMINI_EMBED_RPD = Number(process.env.GEMINI_EMBED_RPD) || 1000;
export const GEMINI_EMBED_RPM = Number(process.env.GEMINI_EMBED_RPM) || 100;

/** Model ya kuonyesha kabla broker hajachagua chochote (UI/prompts). */
export const DEFAULT_MODEL = XTROUTER_MODEL;

// agent id (kwenye agents.ts) -> jina la persona kwenye .env.local
export const PERSONAS = ["OPTIMUS", "ULTRON", "VEXTRON", "MEGATRON", "CYBERTRON"] as const;
export type Persona = (typeof PERSONAS)[number];
export const ENGINE_OF: Record<Persona, string> = { OPTIMUS: "pm", ULTRON: "designer", VEXTRON: "frontend", MEGATRON: "backend", CYBERTRON: "qa" };
const AGENT_ENV_NAME: Record<string, Persona> = { pm: "OPTIMUS", designer: "ULTRON", frontend: "VEXTRON", backend: "MEGATRON", qa: "CYBERTRON" };

export function personaOf(agentId: string): Persona | undefined {
  const id = String(agentId || "").toLowerCase();
  if (AGENT_ENV_NAME[id]) return AGENT_ENV_NAME[id];
  const up = String(agentId || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  return PERSONAS.find((p) => up.includes(p));
}

/** engine id ("pm", "designer" …) kwa jina lolote (engine au persona). */
export function engineOf(agentId: string): string {
  const p = personaOf(agentId);
  return p ? ENGINE_OF[p] : String(agentId || "");
}

export function readEnv(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() ? v.trim() : undefined;
}

// ================= R30 · PLAN MODE =================
// Board ya plan mode (default): mjadala + LOCK kama kawaida, HAKUNA awamu ya code nzima (sample code ndogo tu).
// Mwisho: RIPOTI (Kiswahili) + MPANGO KAZI WA AGENT (Kiingereza, hatua 8-15) unaopewa computer-use agent.
// "off" = flow ya zamani ya code (HATUA 6.5 script ya mwisho + review loops) — logic ya zamani haivunjwi.
export const BOARD_PLAN_MODE = (process.env.BOARD_PLAN_MODE || "on").toLowerCase() !== "off";
/** Kikomo cha hatua za plan (coarse — amri ya Mkuu). */
export const PLAN_STEPS_LIMITS = { min: Number(process.env.PLAN_STEPS_MIN) || 8, max: Number(process.env.PLAN_STEPS_MAX) || 60 };  // R35
