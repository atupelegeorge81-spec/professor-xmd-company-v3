// src/lib/modelArbiter.ts
// [PATCH-XMD-V5-ARBITER] Tri-Tier Failover & Recovery Engine.
//   Tier 1: XKiro (Key 1 -> Key 2)
//   Tier 2: Groq Compound Matrix (groq/compound -> groq/compound-mini), kufuli ya
//           sekunde 60 (rolling window) kwa kila "pool" (agent + stage/key).
//   Tier 3: TokenHarbor Relief — daraja la muda wakati Groq inapoa.
//
// Faili hili LINABEBA HALI (state) TU — halina API key wala haliundi OpenAI client
// yoyote. boardRunner.ts ndiyo inayoamua ni pool gani (agentId + stage) na kutumia
// apiKeyFor/apiBaseUrlFor kutoka env.ts kuunda client, kama sehemu nyingine zote.
//
// Hakuna hali ya pamoja (global) kati ya agents — kila agent (na kila stage/key ya
// Groq) ina "pool" yake ya kufuli, ili Ultron akigonga TPM asimfungie Vextron, na
// Groq Key 1 ikigonga TPM lisiathiri Groq Key 2 (funguo tofauti = quota tofauti).

interface GroqLockState {
  compoundLockedUntil: number;
  compoundMiniLockedUntil: number;
}

const groqLocks = new Map<string, GroqLockState>();
const xkiroExhausted = new Set<string>();

function getLock(poolKey: string): GroqLockState {
  let s = groqLocks.get(poolKey);
  if (!s) {
    s = { compoundLockedUntil: 0, compoundMiniLockedUntil: 0 };
    groqLocks.set(poolKey, s);
  }
  return s;
}

/** poolKey inapendekezwa kuwa `${agentId}:${stage}` — kila (agent, Groq-key-slot) ina pool yake. */
export function lockGroqModel(poolKey: string, model: string, cooldownMs = 60_000): void {
  const s = getLock(poolKey);
  const until = Date.now() + cooldownMs;
  if (model.includes("compound-mini")) s.compoundMiniLockedUntil = until;
  else if (model.includes("compound")) s.compoundLockedUntil = until;
}

export function isGroqModelLocked(poolKey: string, model: string): boolean {
  const s = getLock(poolKey);
  const now = Date.now();
  if (model.includes("compound-mini")) return now < s.compoundMiniLockedUntil;
  if (model.includes("compound")) return now < s.compoundLockedUntil;
  return false;
}

export function bothGroqModelsLocked(poolKey: string): boolean {
  const s = getLock(poolKey);
  const now = Date.now();
  return now < s.compoundLockedUntil && now < s.compoundMiniLockedUntil;
}

/** Kwa ajili ya Auto-Recovery: je, `groq/compound` ya pool hii tayari imepoa? */
export function groqCompoundReady(poolKey: string): boolean {
  const s = getLock(poolKey);
  return Date.now() >= s.compoundLockedUntil;
}

export function groqLockRemainingMs(poolKey: string, model: string): number {
  const s = getLock(poolKey);
  const until = model.includes("compound-mini") ? s.compoundMiniLockedUntil : s.compoundLockedUntil;
  return Math.max(0, until - Date.now());
}

/** XKiro exhausted ni per-agent (funguo zote mbili za XKiro za agent huyo zimeisha quota ya leo). */
export function isXkiroExhausted(agentId: string): boolean {
  return xkiroExhausted.has(agentId);
}

export function markXkiroExhausted(agentId: string): void {
  xkiroExhausted.add(agentId);
}

// --- Test-only helpers (havitumiwi na app; huruhusu majaribio kudhibiti muda) ---
export function __resetArbiterStateForTests(): void {
  groqLocks.clear();
  xkiroExhausted.clear();
}
