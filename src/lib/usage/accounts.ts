// src/lib/usage/accounts.ts — AKAUNTI 12 ZA API (client + server; HAKUNA key hapa).
// R18: + Gemini 1 & 2 (Google AI Studio free tier — requests kwa siku kwa KILA model, siku ya Pacific = 10:00 Dar).
//      Kikomo cha Google ni kwa PROJECT (si kwa key) — imepimwa: keys 2 za project moja zinashiriki ndoo; Gemini 2 ni
//      project TOFAUTI (ndoo yake yenyewe), kwa hiyo ni akaunti ya pili halisi.
//      Embeddings za search cache (Gemini) zinahesabiwa PEKE YAKE (EmbedView) — si lane ya chat.
// R16 · Capacity Broker: akaunti zote zinashirikiana (hakuna "stage" wala mnyororo). Kila akaunti ni account
// halisi ya provider: XTROUTER_API_KEY_<AGENT>_1 za agents wote ni account MOJA (XKiro /v1/usage inarudisha
// mtumiaji yule yule), vivyo hivyo _2 na Groq _1/_2. OpenRouter/UnoRouter: key moja kwa account (agents wote).
// Zote zinareset KILA SIKU (TokenHarbor iliondolewa R16 kwa sababu inareset kwa wiki).

export type ProviderId = "xkiro" | "groq" | "openrouter" | "unorouter" | "gemini";
export type AccountId = "xkiro-1" | "xkiro-2" | "groq-1" | "groq-2" | "or-1" | "or-2" | "uno-1" | "uno-2" | "gemini-1" | "gemini-2" | "gemini-3" | "gemini-4";
export type GemAccountId = "gemini-1" | "gemini-2" | "gemini-3" | "gemini-4";
// R41: keys 4 za Gemini (akaunti 4 za project tofauti — kila moja ndoo yake ya quota)
export const GEM_ACCOUNTS: GemAccountId[] = ["gemini-1", "gemini-2", "gemini-3", "gemini-4"];

export interface AccountMeta {
  id: AccountId;
  provider: ProviderId;
  label: string; // jina kamili (prompts, tooltips)
  short: string; // chini ya circle
  color: string; // rangi ya circle na ya percentage
  rgb: string;
  /** kikomo cha provider kinapimwa kwa nini: tokens (XKiro/Groq), requests (OpenRouter), slot ya dakika (Uno) */
  unit: "tokens" | "requests" | "slots";
}

export const ACCOUNTS: AccountMeta[] = [
  { id: "xkiro-1", provider: "xkiro", label: "XKiro Key 1", short: "XKiro 1", color: "#3d7bff", rgb: "61 123 255", unit: "tokens" },
  { id: "xkiro-2", provider: "xkiro", label: "XKiro Key 2", short: "XKiro 2", color: "#a78bfa", rgb: "167 139 250", unit: "tokens" },
  { id: "groq-1", provider: "groq", label: "Groq Key 1", short: "Groq 1", color: "#f97316", rgb: "249 115 22", unit: "tokens" },
  { id: "groq-2", provider: "groq", label: "Groq Key 2", short: "Groq 2", color: "#f43f5e", rgb: "244 63 94", unit: "tokens" },
  { id: "or-1", provider: "openrouter", label: "OpenRouter 1", short: "OpenR 1", color: "#06b6d4", rgb: "6 182 212", unit: "requests" },
  { id: "or-2", provider: "openrouter", label: "OpenRouter 2", short: "OpenR 2", color: "#eab308", rgb: "234 179 8", unit: "requests" },
  { id: "uno-1", provider: "unorouter", label: "UnoRouter 1", short: "Uno 1", color: "#10b981", rgb: "16 185 129", unit: "slots" },
  { id: "uno-2", provider: "unorouter", label: "UnoRouter 2", short: "Uno 2", color: "#ec4899", rgb: "236 72 153", unit: "slots" },
  { id: "gemini-1", provider: "gemini", label: "Gemini 1", short: "Gemini 1", color: "#84cc16", rgb: "132 204 22", unit: "requests" },
  { id: "gemini-2", provider: "gemini", label: "Gemini 2", short: "Gemini 2", color: "#2dd4bf", rgb: "45 212 191", unit: "requests" },
  { id: "gemini-3", provider: "gemini", label: "Gemini 3", short: "Gemini 3", color: "#e879f9", rgb: "232 121 249", unit: "requests" },
  { id: "gemini-4", provider: "gemini", label: "Gemini 4", short: "Gemini 4", color: "#fbbf24", rgb: "251 191 36", unit: "requests" },
];

/** Pete ya Embeddings (search cache) — rangi yake yenyewe, haipo kwenye ACCOUNTS (si lane ya chat). */
export const EMBED_META = { id: "embed", label: "Gemini Embeddings", short: "Embed", color: "#38bdf8", rgb: "56 189 248" } as const;

export const accountMeta = (id: AccountId): AccountMeta => ACCOUNTS.find((a) => a.id === id)!;
export const isAccountId = (v: unknown): v is AccountId => ACCOUNTS.some((a) => a.id === v);

/** Hali ya akaunti moja kama inavyoonyeshwa UI na kwa agents (namba zote ni halisi — null = haijulikani bado). */
export interface AccountView {
  id: AccountId;
  label: string;
  short: string;
  provider: ProviderId;
  color: string;
  rgb: string;
  unit: AccountMeta["unit"];
  configured: boolean;
  keys: number; // idadi ya keys tofauti kwenye account hii
  /** tokens halisi zilizotumika leo / kwenye dirisha la provider (zinahesabiwa kwa KILA provider) */
  used: number | null;
  /** kikomo cha tokens (XKiro/Groq; Uno ikiwa kikomo kimejifunzwa) — null kama provider hapimi kwa tokens */
  limit: number | null;
  remaining: number | null;
  /** asilimia kulingana na kikomo HALISI cha provider (tokens · requests · kikomo kilichojifunzwa) */
  pct: number | null;
  pctSource: "api" | "counted" | "requests" | "learned" | null;
  /** requests za leo (OpenRouter: kikomo 50; wengine: taarifa) */
  requests: number | null;
  requestLimit: number | null;
  /** muda wa reset ujao (ms) kama unajulikana (OpenRouter/Uno: saa sita usiku UTC · Groq: refill) */
  resetAt: number | null;
  resetKind: "utc-midnight" | "pacific-midnight" | "refill" | "daily" | null;
  lastResetAt: number | null;
  window: string; // maelezo mafupi ya dirisha (kwa prompts)
  status: "ok" | "low" | "exhausted" | "cooling" | "idle" | "error" | "missing";
  /** Uno: slot ijayo iko wazi lini (ms) kwa kila model */
  slots?: { model: string; readyAt: number | null }[];
  note?: string;
  models?: { model: string; used: number; tpd: number | null; rpdUsed: number | null; rpdLimit: number | null; retryAt: number | null }[];
  updatedAt: number | null;
}

/** Embeddings za search cache (Gemini): requests za leo kwa kila model (siku ya Pacific) — hesabu PEKE YAKE. */
export interface EmbedView {
  configured: boolean;
  requests: number;
  requestLimit: number;
  pct: number;
  models: { model: string; account?: GemAccountId; requests: number; limit: number; status: "ok" | "cooling" | "exhausted"; readyAt: number | null }[];
  resetAt: number;
  status: "ok" | "low" | "exhausted" | "cooling" | "missing";
  note?: string;
  updatedAt: number | null;
}

export interface UsageSnapshot {
  accounts: AccountView[];
  /** jumla ya tokens za akaunti zote leo (kila provider anahesabiwa) */
  totalToday: number;
  /** jumla ya uwezo wa tokens unaojulikana (XKiro + Groq + Uno iliyojifunzwa) */
  tokenCapacity: number;
  /** R18: embeddings (requests, peke yake) */
  embeddings?: EmbedView;
  at: number;
}
