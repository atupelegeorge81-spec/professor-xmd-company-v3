// src/lib/server/orKeyProbe.ts — hesabu HALISI ya requests za bure za OpenRouter (GET /api/v1/key — bure).
// Jibu: data.free_model_daily_requests {used, limit, remaining} kwa siku ya UTC. Inachelewa 20–80s, kwa hiyo
// ledger inachukua max(hesabu yetu, ya API). Cache: sekunde 60 kwa kila akaunti.
import { OPENROUTER_BASE_URL } from "@/lib/env";
import { slotKeys } from "./usageKeys";
import { noteOrKey } from "./usageLedger";

type OrId = "or-1" | "or-2";
const g = globalThis as unknown as { __orProbe?: Partial<Record<OrId, { at: number; p?: Promise<void> }>>; __orSoon?: Partial<Record<OrId, ReturnType<typeof setTimeout>>> };
const S = () => (g.__orProbe ||= {});

export async function orKeyProbe(id: OrId, maxAgeMs = 60_000): Promise<void> {
  const key = slotKeys(id)[0];
  if (!key) return;
  const c = S()[id];
  if (c?.p) return c.p;
  if (c && Date.now() - c.at < maxAgeMs) return;
  const p = (async () => {
    try {
      const r = await fetch(`${OPENROUTER_BASE_URL.replace(/\/$/, "")}/key`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!r.ok) return;
      const j: any = await r.json();
      const f = j?.data?.free_model_daily_requests;
      if (f && Number.isFinite(Number(f.limit))) noteOrKey(id, Number(f.used) || 0, Number(f.limit) || 50);
    } catch { /* mtandao — hesabu ya ndani inabaki */ }
  })();
  S()[id] = { at: Date.now(), p };
  try { await p; } finally { S()[id] = { at: Date.now() }; }
}

/** Baada ya jibu: soma tena baada ya ~45s (API inachelewa). */
export function orKeyProbeSoon(id: OrId): void {
  const T = (g.__orSoon ||= {});
  if (T[id]) return;
  T[id] = setTimeout(() => { T[id] = undefined; void orKeyProbe(id, 0); }, 45_000);
  (T[id] as { unref?: () => void }).unref?.();
}
