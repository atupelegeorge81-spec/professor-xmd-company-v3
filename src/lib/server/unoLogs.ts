// src/lib/server/unoLogs.ts — R20: matumizi HALISI ya UnoRouter kutoka kwa provider mwenyewe.
// UnoRouter (new-api) inatoa logs za kila ombi la key: GET <origin>/api/log/token?key=<key> (Authorization: Bearer <key>)
// → [{ created_at, type (2 = limefanikiwa · 5 = kosa), model_name, prompt_tokens, completion_tokens, content }].
// Imehakikiwa (27 Sep): logs zilionyesha requests 26 / tokens 261,706 za Board wakati Pulse (ledger ya ndani) ilisoma 0.
// Hapa tunahesabu siku ya UTC (reset ya Uno — 03:00 Dar), chat tu (embeddings zimeachwa), na kuhifadhi kwenye ledger.
import { UNOROUTER_BASE_URL } from "@/lib/env";
import { slotKeys } from "./usageKeys";
import { persist, unoState, utcDay } from "./usageLedger";

type UnoId = "uno-1" | "uno-2";
interface UnoLog { created_at: number; type: number; model_name?: string; prompt_tokens?: number; completion_tokens?: number }

const FRESH_MS = 60_000;
const inflight = new Map<UnoId, Promise<void>>();

/** Muhtasari wa leo (UTC) kutoka logs — safi (bila mtandao) ili ujaribike. */
export function summarizeUnoLogs(logs: UnoLog[], dayStartSec: number): { requests: number; tokens: number; errors: number; partial: boolean } {
  let requests = 0, tokens = 0, errors = 0, oldest = Infinity;
  for (const x of logs) {
    const t = Number(x?.created_at) || 0;
    if (t && t < oldest) oldest = t;
    if (t < dayStartSec || /embedding/i.test(String(x?.model_name || ""))) continue;
    if (x.type === 2) { requests++; tokens += (Number(x.prompt_tokens) || 0) + (Number(x.completion_tokens) || 0); }
    else if (x.type === 5) errors++;
  }
  // logs zikianza BAADA ya mwanzo wa siku, huenda orodha imekatwa (mengi sana) → partial
  return { requests, tokens, errors, partial: logs.length > 0 && oldest > dayStartSec };
}

async function probe(id: UnoId): Promise<void> {
  const key = slotKeys(id)[0];
  if (!key) return;
  const origin = new URL(UNOROUTER_BASE_URL).origin;
  // fetch ya kawaida (si meteredFetch) — hii si wito wa LLM
  const r = await fetch(`${origin}/api/log/token?key=${encodeURIComponent(key)}`, {
    headers: { Authorization: `Bearer ${key}`, "User-Agent": "professor-xmd/usage" },
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return;
  const j = await r.json().catch(() => null);
  if (!j?.success || !Array.isArray(j.data)) return;
  const now = Date.now();
  const d = new Date(now);
  const dayStart = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) / 1000;
  const sum = summarizeUnoLogs(j.data as UnoLog[], dayStart);
  const u = unoState(id);
  u.provider = { day: utcDay(), ...sum, at: now };
  persist();
}

/** Sasisha hesabu halisi ya Uno (cache 60s; makosa yanapuuzwa — ledger ya ndani inabaki akiba). */
export async function unoLogsProbe(id: UnoId, force = false): Promise<void> {
  const p0 = unoState(id).provider;
  if (!force && p0 && p0.day === utcDay() && Date.now() - p0.at < FRESH_MS) return;
  const cur = inflight.get(id);
  if (cur) return cur;
  const p = probe(id).catch(() => undefined).finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}
