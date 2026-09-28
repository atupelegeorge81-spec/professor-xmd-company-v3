// src/lib/server/xkiroUsage.ts — quota ya bure ya XKiro (GET /v1/usage ni bure, haihesabiwi kwenye rate limit).
// Inatumiwa na /api/usage/xkiro, /api/usage/accounts (UI) NA Runtime (resources.ts).
// MUHIMU: keys nyingi zinaweza kuwa za AKAUNTI MOJA (mf. XTROUTER_API_KEY_<AGENT>_1 za agents wote = mtumiaji mmoja).
// Kwa hiyo tunaunganisha kwa mtumiaji (user.email kutoka /v1/usage) — quota inahesabiwa mara moja kwa kila akaunti.
// Kila slot (Key 1 / Key 2) inaandikwa kwenye ledger (usageLedger.noteXkiroFetch) — reset inagunduliwa pale namba inaposhuka.
// Key yenyewe wala email HAZIRUDISHWI kwa UI.
import { createHash } from "node:crypto";
import { XTROUTER_BASE_URL } from "@/lib/env";
import { slotKeys } from "./usageKeys";
import { noteXkiroFetch } from "./usageLedger";

export interface XkiroAccount { account: number; label: string; ok: boolean; plan?: string | null; usedToday?: number; limitPerDay?: number; remaining?: number; error?: string; slot?: 1 | 2; keys?: number }
export interface XkiroUsage { configured: boolean; accounts: XkiroAccount[]; usedToday: number; limitPerDay: number; remaining: number; fetchedAt: string }

const g = globalThis as unknown as { __xkiroUsage?: { at: number; body: XkiroUsage }; __xkiroPending?: Promise<XkiroUsage>; __xkiroWho?: Map<string, string> };
// key fingerprint → akaunti; baada ya kutambuliwa mara moja, key MOJA tu kwa kila akaunti inaulizwa (keys nyingine ni nakala)
const whoOf = () => (g.__xkiroWho ||= new Map<string, string>());
const fp = (k: string) => createHash("sha256").update(k).digest("hex").slice(0, 16);
function representatives(keys: string[]): string[] {
  const W = whoOf();
  const picked = new Set<string>();
  const out: string[] = [];
  for (const k of keys) {
    const w = W.get(fp(k));
    if (!w) { out.push(k); continue; }
    if (!picked.has(w)) { picked.add(w); out.push(k); }
  }
  return out;
}
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);

interface Probe { ok: boolean; who?: string; plan?: string | null; used?: number; limit?: number; remaining?: number; error?: string }

async function probe(key: string): Promise<Probe> {
  try {
    const r = await fetch(`${XTROUTER_BASE_URL.replace(/\/$/, "")}/usage`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!r.ok) return { ok: false, error: `HTTP ${r.status}` };
    const j: any = await r.json();
    const f = j?.free_tokens || {};
    const id = String(j?.user?.email || j?.user?.id || j?.user?.name || "");
    return {
      ok: true,
      who: id ? createHash("sha256").update(id).digest("hex").slice(0, 12) : createHash("sha256").update(key).digest("hex").slice(0, 12),
      plan: typeof j?.plan === "string" ? j.plan : j?.plan?.name || null,
      used: num(f.used_today),
      limit: num(f.limit_per_day),
      remaining: num(f.remaining),
    };
  } catch (e: any) {
    return { ok: false, error: e?.name === "TimeoutError" ? "timeout" : "unreachable" };
  }
}

async function fetchUsage(): Promise<XkiroUsage> {
  const slots = [
    { slot: 1 as const, id: "xkiro-1" as const, keys: slotKeys("xkiro-1") },
    { slot: 2 as const, id: "xkiro-2" as const, keys: slotKeys("xkiro-2") },
  ];
  const accounts: XkiroAccount[] = [];
  const seenWho = new Map<string, Probe>(); // akaunti moja inahesabiwa mara moja tu (hata kama iko slot mbili)
  let n = 0;
  for (const s of slots) {
    if (!s.keys.length) continue;
    const ask = representatives(s.keys);
    const probes = await Promise.all(ask.map(probe));
    probes.forEach((p, i) => { if (p.ok && p.who) whoOf().set(fp(ask[i]), p.who); else whoOf().delete(fp(ask[i])); });
    const byWho = new Map<string, Probe>();
    for (const p of probes) if (p.ok && p.who && !byWho.has(p.who)) byWho.set(p.who, p);
    const distinct = [...byWho.values()];
    if (!distinct.length) {
      const err = probes.find((p) => !p.ok)?.error || "unreachable";
      noteXkiroFetch(s.id, { error: err });
      accounts.push({ account: ++n, label: `Key ${s.slot}`, ok: false, error: err, slot: s.slot, keys: s.keys.length });
      continue;
    }
    const used = distinct.reduce((a, p) => a + (p.used || 0), 0);
    const limit = distinct.reduce((a, p) => a + (p.limit || 0), 0);
    const remaining = distinct.reduce((a, p) => a + (p.remaining || 0), 0);
    noteXkiroFetch(s.id, { used, limit, remaining, accounts: distinct.length });
    for (const p of distinct) {
      if (seenWho.has(p.who!)) continue;
      seenWho.set(p.who!, p);
      accounts.push({ account: ++n, label: `Key ${s.slot}`, ok: true, plan: p.plan, usedToday: p.used, limitPerDay: p.limit, remaining: p.remaining, slot: s.slot, keys: s.keys.length });
    }
  }
  const ok = accounts.filter((a) => a.ok);
  const body: XkiroUsage = {
    configured: slots.some((s) => s.keys.length > 0),
    accounts,
    usedToday: ok.reduce((a, x) => a + (x.usedToday || 0), 0),
    limitPerDay: ok.reduce((a, x) => a + (x.limitPerDay || 0), 0),
    remaining: ok.reduce((a, x) => a + (x.remaining || 0), 0),
    fetchedAt: new Date().toISOString(),
  };
  g.__xkiroUsage = { at: Date.now(), body };
  return body;
}

/** Soma usage (cache ya maxAgeMs). Maombi yanayogongana yanashiriki fetch moja. */
export async function getXkiroUsage(maxAgeMs = 20_000): Promise<XkiroUsage> {
  if (g.__xkiroUsage && Date.now() - g.__xkiroUsage.at < maxAgeMs) return g.__xkiroUsage.body;
  if (!g.__xkiroPending) g.__xkiroPending = fetchUsage().finally(() => { g.__xkiroPending = undefined; });
  return g.__xkiroPending;
}

/** Kwa prompts: rudisha iliyopo papo hapo (stale-while-revalidate); subiri ≤waitMs mara ya kwanza tu. */
export async function peekXkiroUsage(waitMs = 2500, maxAgeMs = 60_000): Promise<XkiroUsage | null> {
  const c = g.__xkiroUsage;
  if (c && Date.now() - c.at < maxAgeMs) return c.body;
  const p = getXkiroUsage(0).catch(() => null);
  if (c) return c.body; // ya zamani sasa; mpya inakuja nyuma
  return Promise.race([p, new Promise<null>((r) => setTimeout(() => r(null), waitMs))]);
}
