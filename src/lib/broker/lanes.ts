// src/lib/broker/lanes.ts — "lanes" 20 = (akaunti × model). Kila lane ni njia moja halisi ya kupiga LLM.
//   XKiro 1/2      × qwen3.8-max:free                     (tokens/siku kwa account)
//   Groq 1/2       × qwen3.8-27b · gpt-oss-120b           (TPM 8K + TPD kwa kila model)
//   OpenRouter 1/2 × nemotron-3-ultra:free                (requests 50/siku UTC, 20/dakika)
//   Uno 1/2        × space-bunny-alpha · nemotron-ultra   (request 1/dakika kwa kila model)
//   Gemini 1       × Flash 3.8/3.7/3.6/3.5/3-preview/2.5    (R18: 20/siku + 5/dak KILA model — HEAVY)
//                  × Flash-Lite 3.5/3.1                     (R18: 500/siku + 15/dak KILA model — LIGHT/BACKGROUND)
// Lane zisizo na key hazipo kabisa (broker hazioni).
import { ACCOUNTS, type AccountId, type ProviderId } from "@/lib/usage/accounts";
import {
  GEMINI_BASE_URL, GEMINI_FLASH_MODELS, GEMINI_LITE_MODELS, GEMINI_MODEL_SKIP, GROQ_BASE_URL, GROQ_MODELS, OPENROUTER_BASE_URL, OPENROUTER_MODEL,
  UNOROUTER_BASE_URL, UNOROUTER_MODELS, XTROUTER_BASE_URL, XTROUTER_MODEL,
} from "@/lib/env";
import { slotKeyCount } from "@/lib/server/usageKeys";

export interface Lane {
  id: string; // "uno-1:space-bunny-alpha:free"
  account: AccountId;
  provider: ProviderId;
  label: string; // "Uno 1 · space-bunny-alpha"
  model: string;
  baseURL: string;
  /** tokens za juu za jibu ambazo provider anaruhusu */
  maxOut: number;
  /** context ya model (tokens) */
  ctx: number;
  /** tuma include_reasoning (XKiro/Groq/OpenRouter — Uno na Gemini haziitambui; Gemini inarudisha 400) */
  reasoning: boolean;
  /** R18 · Gemini: daraja la model (flash = nzito/adimu, lite = haraka/nyingi) · rank = nafasi kwenye orodha (0 = bora) */
  tier?: "flash" | "lite";
  rank?: number;
}

const SPEC: Record<ProviderId, { base: () => string; models: () => string[]; maxOut: number; ctx: number; reasoning: boolean }> = {
  xkiro: { base: () => XTROUTER_BASE_URL, models: () => [XTROUTER_MODEL], maxOut: 32_000, ctx: 256_000, reasoning: true },
  groq: { base: () => GROQ_BASE_URL, models: () => GROQ_MODELS, maxOut: 8_000, ctx: 131_000, reasoning: true },
  openrouter: { base: () => OPENROUTER_BASE_URL, models: () => [OPENROUTER_MODEL], maxOut: 65_000, ctx: 1_000_000, reasoning: true },
  unorouter: { base: () => UNOROUTER_BASE_URL, models: () => UNOROUTER_MODELS, maxOut: 128_000, ctx: 1_000_000, reasoning: false },
  gemini: { base: () => GEMINI_BASE_URL, models: () => [...GEMINI_FLASH_MODELS, ...GEMINI_LITE_MODELS], maxOut: 65_536, ctx: 1_000_000, reasoning: false },
};

const tierOf = (model: string): { tier?: "flash" | "lite"; rank?: number } => {
  const f = GEMINI_FLASH_MODELS.indexOf(model);
  if (f >= 0) return { tier: "flash", rank: f };
  const l = GEMINI_LITE_MODELS.indexOf(model);
  return l >= 0 ? { tier: "lite", rank: l } : {};
};

const shortModel = (m: string) => m.replace(/^.*\//, "").replace(/:free$/, "");

export function allLanes(): Lane[] {
  const out: Lane[] = [];
  for (const a of ACCOUNTS) {
    if (slotKeyCount(a.id) === 0) continue;
    const s = SPEC[a.provider];
    for (const model of s.models()) {
      // R38: (akaunti × model) iliyokufa 404 "no longer available to new users" — mf. gemini-2:gemini-2.5-flash
      if ((GEMINI_MODEL_SKIP[a.id] || []).includes(model)) continue;
      out.push({
        id: `${a.id}:${model}`, account: a.id, provider: a.provider, label: `${a.short} · ${shortModel(model)}`,
        model, baseURL: s.base(), maxOut: s.maxOut, ctx: s.ctx, reasoning: s.reasoning,
        ...(a.provider === "gemini" ? tierOf(model) : {}),
      });
    }
  }
  return out;
}

export const laneById = (id: string) => allLanes().find((l) => l.id === id);
