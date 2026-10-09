// src/lib/server/usageKeys.ts — key → akaunti + agent, kutoka .env.local TU (R16: akaunti 8 · R18: + Gemini 1 & 2 = 10).
// Key yenyewe haihifadhiwi popote wala kurudishwa kwa UI; tunatumia alama fupi (fingerprint) kwa ramani ya ndani.
//   XKiro/Groq : XTROUTER_API_KEY_<PERSONA>_1|2 · GROQ_API_KEY_<PERSONA>_1|2 (keys 5 = account moja kwa kila slot)
//   OpenRouter : OPENROUTER_API_KEY_1|2 (key moja kwa account — agents wote)
//   UnoRouter  : UNOROUTER_API_KEY_1|2  (key moja kwa account — agents wote)
//   Gemini     : GEMINI_API_KEY_1 · GEMINI_API_KEY_2 · GEMINI_API_KEY_3 · GEMINI_API_KEY_4 (R41 — chat lanes + embeddings; quota ni ya PROJECT nzima,
//                kwa hiyo kila key lazima iwe ya project tofauti ili iwe akaunti ya pili halisi)
import { createHash } from "node:crypto";
import { ACCOUNTS, type AccountId, type ProviderId } from "@/lib/usage/accounts";
import { ENGINE_OF, PERSONAS, personaOf, readEnv } from "@/lib/env";

export interface KeyInfo { account: AccountId; provider: ProviderId; engines: string[]; envNames: string[] }

export const fingerprint = (key: string) => createHash("sha256").update(key.trim()).digest("hex").slice(0, 16);

const SLOT_ENV: Record<AccountId, (persona?: string) => string[]> = {
  "xkiro-1": (p) => (p ? [`XTROUTER_API_KEY_${p}_1`] : ["XTROUTER_API_KEY"]),
  "xkiro-2": (p) => (p ? [`XTROUTER_API_KEY_${p}_2`] : []),
  "groq-1": (p) => (p ? [`GROQ_API_KEY_${p}_1`] : ["GROQ_API_KEY"]),
  "groq-2": (p) => (p ? [`GROQ_API_KEY_${p}_2`] : []),
  "or-1": () => ["OPENROUTER_API_KEY_1"],
  "or-2": () => ["OPENROUTER_API_KEY_2"],
  "uno-1": () => ["UNOROUTER_API_KEY_1"],
  "uno-2": () => ["UNOROUTER_API_KEY_2"],
  "gemini-1": () => ["GEMINI_API_KEY_1", "GEMINI_API_KEY"],
  "gemini-2": () => ["GEMINI_API_KEY_2"],
  "gemini-3": () => ["GEMINI_API_KEY_3"], // R41: key 3 (project mpya)
  "gemini-4": () => ["GEMINI_API_KEY_4"], // R41: key 4 (project mpya)
};
const PER_AGENT = (a: AccountId) => a.startsWith("xkiro") || a.startsWith("groq");

let cache: { map: Map<string, KeyInfo>; bySlot: Record<AccountId, string[]>; values: Map<string, string> } | null = null;

function build() {
  const map = new Map<string, KeyInfo>();
  const values = new Map<string, string>(); // fp → key (server tu)
  const bySlot = Object.fromEntries(ACCOUNTS.map((a) => [a.id, [] as string[]])) as Record<AccountId, string[]>;
  const add = (envName: string, account: AccountId, engine?: string) => {
    const v = readEnv(envName);
    if (!v) return;
    const fp = fingerprint(v);
    const cur = map.get(fp);
    if (cur) {
      if (engine && !cur.engines.includes(engine)) cur.engines.push(engine);
      cur.envNames.push(envName);
      return;
    }
    const provider = ACCOUNTS.find((a) => a.id === account)!.provider;
    map.set(fp, { account, provider, engines: engine ? [engine] : [], envNames: [envName] });
    values.set(fp, v);
    bySlot[account].push(fp);
  };
  for (const a of ACCOUNTS) {
    if (PER_AGENT(a.id)) {
      for (const p of PERSONAS) for (const n of SLOT_ENV[a.id](p)) add(n, a.id, ENGINE_OF[p]);
      for (const n of SLOT_ENV[a.id]()) add(n, a.id);
    } else {
      for (const n of SLOT_ENV[a.id]()) add(n, a.id);
    }
  }
  return { map, bySlot, values };
}

function idx() {
  if (!cache) cache = build();
  return cache;
}

/** Key hii ni ya akaunti gani? (null = si key yetu) */
export function keyInfo(key: string): KeyInfo | null {
  if (!key) return null;
  return idx().map.get(fingerprint(key)) || null;
}

/** Idadi ya keys tofauti zilizosanidiwa kwenye akaunti. */
export function slotKeyCount(account: AccountId): number {
  return idx().bySlot[account].length;
}

/** Keys halisi za akaunti (server tu — XKiro /v1/usage, OpenRouter /api/v1/key). */
export function slotKeys(account: AccountId): string[] {
  const I = idx();
  return I.bySlot[account].map((fp) => I.values.get(fp)!).filter(Boolean);
}

/** Key ya kutumia kwa agent huyu kwenye akaunti hii: key yake mwenyewe (XKiro/Groq) → key yoyote ya akaunti. */
export function keyFor(account: AccountId, agentId?: string): string {
  const p = agentId ? personaOf(agentId) : undefined;
  if (p && PER_AGENT(account)) {
    for (const n of SLOT_ENV[account](p)) { const v = readEnv(n); if (v) return v; }
  }
  return slotKeys(account)[0] || "";
}
