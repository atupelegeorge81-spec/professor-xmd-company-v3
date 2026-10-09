// src/lib/server/usageSnapshot.ts — hali ya akaunti 10 (XKiro 1/2 · Groq 1/2 · OpenRouter 1/2 · Uno 1/2 · Gemini 1/2) + embeddings kutoka ledger halisi.
//   buildSnapshot()      → sync, kutoka ledger tu (broker + prompts zinaweza kuitumia bila kusubiri mtandao)
//   getUsageSnapshot()   → async: inasasisha XKiro (/v1/usage), OpenRouter (/api/v1/key), limits za Groq kwanza
// Maana ya "used" / % kwa kila provider (kama wao wenyewe wanavyohesabu):
//   XKiro       → used_today ya akaunti (XKiro) + tokens tangu fetch ya mwisho · % = tokens / kikomo cha siku
//   Groq        → tokens ndani ya dirisha la saa 24 linalojijaza (TPD bucket, kwa kila model) · % = tokens / (TPD × models)
//   OpenRouter  → tokens zinahesabiwa, lakini % = REQUESTS / 50 kwa siku ya UTC (kikomo chao ni requests)
//   UnoRouter   → tokens + requests za leo (UTC) · % ni "—" mpaka kikomo cha siku kijifunzwe (hakuna meter ya bure)
//   Gemini 1/2  → R18: % = REQUESTS / jumla ya vikomo vya siku (Flash 20 × 6 + Lite 500 × 2) KWA KILA project · siku ya Pacific (10:00 Dar)
//   Embeddings  → R18: PEKE YAKE (si akaunti ya chat) · requests / (1000 × models 2 × akaunti za Gemini) · siku ya Pacific
import { ACCOUNTS, GEM_ACCOUNTS, type AccountId, type GemAccountId, type AccountView, type EmbedView, type UsageSnapshot } from "@/lib/usage/accounts";
import {
  GEMINI_EMBED_MODELS, GEMINI_EMBED_RPD, GEMINI_FLASH_MODELS, GEMINI_FLASH_RPD, GEMINI_LITE_MODELS, GEMINI_LITE_RPD,
  GROQ_MODELS, UNOROUTER_MODELS,
} from "@/lib/env";
import { gemState, groqBucketNow, ledger, nextPacificMidnight, nextUtcMidnight, orState, unoState } from "./usageLedger";
import { slotKeyCount } from "./usageKeys";
import { unoLogsProbe } from "./unoLogs";
import { ensureGroqLimits } from "./groqLimits";
import { getXkiroUsage } from "./xkiroUsage";
import { orKeyProbe } from "./orKeyProbe";

/** Groq free tier (docs, research/unit/groq-limits.md): TPD 200K kwa kila model — inatumika mpaka docs live zisomwe. */
export const GROQ_TPD_DEFAULT = 200_000;
export const GROQ_TPM_DEFAULT = 8_000;
export const OR_DAILY_DEFAULT = 50;

const clampPct = (v: number) => Math.max(0, Math.min(100, v));
const statusOf = (pct: number | null, exhausted: boolean, cooling: boolean): AccountView["status"] =>
  exhausted ? "exhausted" : cooling ? "cooling" : pct != null && pct >= 85 ? "low" : "ok";

type Base = Pick<AccountView, "id" | "label" | "short" | "provider" | "color" | "rgb" | "unit" | "configured" | "keys">;
function base(id: AccountId): Base {
  const m = ACCOUNTS.find((a) => a.id === id)!;
  return { id, label: m.label, short: m.short, provider: m.provider, color: m.color, rgb: m.rgb, unit: m.unit, configured: slotKeyCount(id) > 0, keys: slotKeyCount(id) };
}

export function xkiroView(id: "xkiro-1" | "xkiro-2"): AccountView {
  const b = base(id);
  const s = ledger().xkiro[id];
  const used = s.used != null ? s.used + (s.localSinceFetch || 0) : null;
  const limit = s.limit ?? null;
  const remaining = limit != null && used != null ? Math.max(0, limit - used) : null;
  const pct = limit && used != null ? clampPct((used / limit) * 100) : null;
  const exhausted = !!s.exhaustedAt || (remaining != null && remaining <= 0);
  return {
    ...b,
    used, limit, remaining, pct, pctSource: pct != null ? "api" : null,
    requests: null, requestLimit: null,
    resetAt: null, resetKind: "daily", lastResetAt: s.lastResetAt ?? null,
    window: "free tokens per day (XKiro's own daily window)",
    status: !b.configured ? "missing" : s.exhaustedAt ? "exhausted" : used == null && s.error ? "error" : statusOf(pct, exhausted, false),
    note: s.error && used == null ? s.error : undefined,
    updatedAt: s.fetchedAt ?? null,
  };
}

export function groqView(id: "groq-1" | "groq-2"): AccountView {
  const b = base(id);
  const L = ledger();
  const st = L.groq[id];
  const now = Date.now();
  const models = GROQ_MODELS.map((model) => {
    const m = st.models[model];
    const tpd = m?.tpd ?? L.groqLimits?.models[model]?.tpd ?? GROQ_TPD_DEFAULT;
    const used = m ? Math.round(groqBucketNow({ ...m, tpd }, now)) : 0;
    let rpdUsed: number | null = null;
    if (m?.rpdLimit != null && m.rpdRemaining != null && m.rpdAt) {
      const refill = ((now - m.rpdAt) * m.rpdLimit) / 86_400_000;
      rpdUsed = Math.max(0, Math.round(m.rpdLimit - m.rpdRemaining - refill));
    }
    return { model, used, tpd, rpdUsed, rpdLimit: m?.rpdLimit ?? null, retryAt: m?.retryAt && m.retryAt > now ? m.retryAt : null };
  });
  const used = models.reduce((a, m) => a + m.used, 0);
  const limit = models.reduce((a, m) => a + m.tpd, 0);
  const pct = limit ? clampPct((used / limit) * 100) : null;
  const fullAt = models.reduce((t, m) => (m.used > 0 ? Math.max(t, now + (m.used / m.tpd) * 86_400_000) : t), 0);
  const cooling = models.some((m) => m.retryAt);
  const exhausted = models.length > 0 && models.every((m) => m.retryAt || m.used >= m.tpd);
  // R20: requests za leo kutoka headers halisi za Groq (x-ratelimit-limit/remaining-requests) — null kama bado hazijaonekana
  const known = models.filter((m) => m.rpdLimit != null);
  const requests = known.length ? known.reduce((a, m) => a + (m.rpdUsed ?? 0), 0) : null;
  const requestLimit = known.length ? known.reduce((a, m) => a + (m.rpdLimit as number), 0) : null;
  return {
    ...b,
    used, limit, remaining: Math.max(0, limit - used), pct, pctSource: "counted",
    requests, requestLimit,
    resetAt: fullAt || null, resetKind: fullAt ? "refill" : null, lastResetAt: null,
    window: `tokens per day per model (${GROQ_MODELS.length} models), refilling continuously over 24h · max ${GROQ_TPM_DEFAULT} tokens/min per request`,
    status: !b.configured ? "missing" : statusOf(pct, exhausted, cooling),
    models,
    updatedAt: st.lastAt ?? null,
  };
}

export function orView(id: "or-1" | "or-2"): AccountView {
  const b = base(id);
  const o = orState(id);
  const now = Date.now();
  const limit = o.api?.limit || OR_DAILY_DEFAULT;
  const reqs = Math.max(o.requests, o.api?.used ?? 0);
  const exhausted = (o.exhaustedUntil != null && o.exhaustedUntil > now) || reqs >= limit;
  const pct = exhausted ? 100 : clampPct((reqs / limit) * 100);
  return {
    ...b,
    used: o.tokens, limit: null, remaining: null, pct, pctSource: "requests",
    requests: reqs, requestLimit: limit,
    resetAt: nextUtcMidnight(now), resetKind: "utc-midnight", lastResetAt: null,
    window: `${limit} free requests per UTC day (resets 03:00 Dar es Salaam) · 20 per minute`,
    status: !b.configured ? "missing" : statusOf(pct, exhausted, !!(o.retryAt && o.retryAt > now)),
    note: o.lastError,
    updatedAt: o.lastAt ?? o.api?.at ?? null,
  };
}

export function unoView(id: "uno-1" | "uno-2"): AccountView {
  const b = base(id);
  const u = unoState(id);
  const now = Date.now();
  // R20: logs za UnoRouter (unoLogs.ts) ndizo ukweli; ledger ya ndani ni akiba (na huenda iko mbele kwa sekunde chache)
  const p = u.provider && u.provider.day === u.day ? u.provider : null;
  const requests = p ? Math.max(p.requests, u.requests) : u.requests;
  const tokens = p ? Math.max(p.tokens, u.tokens) : u.tokens;
  const exhausted = u.exhaustedUntil != null && u.exhaustedUntil > now;
  const cap = u.learnedCap ?? null;
  const pct = exhausted ? 100 : cap ? clampPct((tokens / cap) * 100) : null;
  const slots = UNOROUTER_MODELS.map((model) => {
    const m = u.models[model];
    const t = Math.max(m?.slotUntil ?? 0, m?.busyUntil ?? 0);
    return { model, readyAt: t > now ? t : null };
  });
  return {
    ...b,
    used: tokens, limit: cap, remaining: cap != null ? Math.max(0, cap - tokens) : null, pct, pctSource: pct != null ? "learned" : null,
    requests, requestLimit: null,
    resetAt: nextUtcMidnight(now), resetKind: "utc-midnight", lastResetAt: null,
    window: `1 request per minute per model (${UNOROUTER_MODELS.length} models) · daily token budget unpublished${cap ? ` (learned ≈${Math.round(cap / 1000)}K)` : ""}`,
    status: !b.configured ? "missing" : exhausted ? "exhausted" : slots.every((s) => s.readyAt) ? "cooling" : u.lastAt == null && !requests ? "idle" : "ok",
    slots,
    note: u.lastError,
    updatedAt: Math.max(u.lastAt ?? 0, p?.at ?? 0) || null,
  };
}

export function geminiView(id: GemAccountId = "gemini-1"): AccountView {
  const b = base(id);
  const g = gemState(id);
  const now = Date.now();
  const rows = [...GEMINI_FLASH_MODELS.map((m) => [m, GEMINI_FLASH_RPD] as const), ...GEMINI_LITE_MODELS.map((m) => [m, GEMINI_LITE_RPD] as const)];
  const models = rows.map(([model, def]) => {
    const m = g.chat[model];
    const lim = m?.rpdLimit ?? def;
    const out = m?.exhaustedUntil && m.exhaustedUntil > now;
    const retry = Math.max(m?.retryAt ?? 0, m?.busyUntil ?? 0);
    return { model, used: m?.tokens ?? 0, tpd: null, rpdUsed: out ? lim : m?.requests ?? 0, rpdLimit: lim, retryAt: retry > now ? retry : null };
  });
  const requests = models.reduce((a, m) => a + (m.rpdUsed ?? 0), 0);
  const requestLimit = models.reduce((a, m) => a + (m.rpdLimit ?? 0), 0);
  const tokens = models.reduce((a, m) => a + m.used, 0);
  const pct = requestLimit ? clampPct((requests / requestLimit) * 100) : null;
  const flash = models.filter((m) => GEMINI_FLASH_MODELS.includes(m.model));
  const lite = models.filter((m) => GEMINI_LITE_MODELS.includes(m.model));
  const sum = (xs: typeof models, k: "rpdUsed" | "rpdLimit") => xs.reduce((a, m) => a + (m[k] ?? 0), 0);
  const exhausted = models.length > 0 && models.every((m) => (m.rpdUsed ?? 0) >= (m.rpdLimit ?? 1));
  const lastAt = Math.max(0, ...Object.values(g.chat).map((m) => m.lastAt ?? 0));
  return {
    ...b,
    used: tokens, limit: null, remaining: null, pct, pctSource: "requests",
    requests, requestLimit,
    resetAt: nextPacificMidnight(now), resetKind: "pacific-midnight", lastResetAt: null,
    window: `requests per day per model, Pacific day (resets 10:00 Dar es Salaam) · Flash ${sum(flash, "rpdUsed")}/${sum(flash, "rpdLimit")} (${flash.length} models × ${GEMINI_FLASH_RPD}, 5/min each) · Flash-Lite ${sum(lite, "rpdUsed")}/${sum(lite, "rpdLimit")} (${lite.length} × ${GEMINI_LITE_RPD}, 15/min each)`,
    status: !b.configured ? "missing" : lastAt === 0 ? "idle" : statusOf(pct, exhausted, models.every((m) => m.retryAt)),
    models,
    note: `Flash ${sum(flash, "rpdUsed")}/${sum(flash, "rpdLimit")} · Lite ${sum(lite, "rpdUsed")}/${sum(lite, "rpdLimit")}`,
    updatedAt: lastAt || null,
  };
}

/** Embeddings za search cache (Gemini) — hesabu PEKE YAKE (requests), si sehemu ya pete za Gemini chat.
 *  Akaunti zote za Gemini zilizosanidiwa zinajumlishwa (kila project ina 1000/siku kwa KILA model ya embedding). */
export function embedView(): EmbedView {
  const now = Date.now();
  const accts = GEM_ACCOUNTS.filter((a) => slotKeyCount(a) > 0);
  const multi = accts.length > 1;
  const models = accts.flatMap((acct) => {
    const g = gemState(acct);
    return GEMINI_EMBED_MODELS.map((model) => {
      const m = g.embed[model];
      const limit = m?.rpdLimit ?? GEMINI_EMBED_RPD;
      const out = !!(m?.exhaustedUntil && m.exhaustedUntil > now);
      const retry = Math.max(m?.retryAt ?? 0, m?.busyUntil ?? 0);
      return {
        model: multi ? `${model} · ${acct === "gemini-1" ? "key 1" : "key 2"}` : model, account: acct,
        requests: out ? limit : m?.requests ?? 0, limit,
        status: out ? "exhausted" as const : retry > now ? "cooling" as const : "ok" as const,
        readyAt: out ? m!.exhaustedUntil! : retry > now ? retry : null,
      };
    });
  });
  const requests = models.reduce((a, m) => a + m.requests, 0);
  const requestLimit = models.reduce((a, m) => a + m.limit, 0);
  const pct = requestLimit ? clampPct((requests / requestLimit) * 100) : 0;
  const configured = accts.length > 0;
  const all = accts.flatMap((acct) => Object.entries(gemState(acct).embed).map(([k, m]) => ({ k: multi ? `${k} (${acct === "gemini-1" ? "key 1" : "key 2"})` : k, m })));
  const lastAt = Math.max(0, ...all.map(({ m }) => m.lastAt ?? 0));
  const errs = all.filter(({ m }) => m.lastError).map(({ k, m }) => `${k.replace(/^gemini-/, "")} ${m.lastError}`);
  return {
    configured, requests, requestLimit, pct, models,
    resetAt: nextPacificMidnight(now),
    status: !configured ? "missing" : models.every((m) => m.status === "exhausted") ? "exhausted" : models.every((m) => m.status !== "ok") ? "cooling" : pct >= 85 ? "low" : "ok",
    note: errs.length ? errs.join(" · ") : undefined,
    updatedAt: lastAt || null,
  };
}

export function accountView(id: AccountId): AccountView {
  if (id === "gemini-1" || id === "gemini-2") return geminiView(id);
  if (id === "xkiro-1" || id === "xkiro-2") return xkiroView(id);
  if (id === "groq-1" || id === "groq-2") return groqView(id);
  if (id === "or-1" || id === "or-2") return orView(id);
  return unoView(id);
}

export function buildSnapshot(): UsageSnapshot {
  const accounts = ACCOUNTS.map((a) => accountView(a.id));
  const tokenCapacity = accounts.reduce((a, x) => a + (x.configured && x.limit ? x.limit : 0), 0);
  return { accounts, totalToday: accounts.reduce((a, x) => a + (x.used || 0), 0), tokenCapacity, embeddings: embedView(), at: Date.now() };
}

export async function getUsageSnapshot(): Promise<UsageSnapshot> {
  // R38: probes zote zina timeout zao (8-10s) lakini endpoint iliweza kukaa bila jibu >90s kwenye
  // live (Koyeb). Hili ni kizuizi cha JUMLA: lote lisiwe zaidi ya sekunde 15 — snapshoot ya
  // ledger inarudi hata probe ikikwama; UI haihangii kamwe.
  await Promise.race([
    Promise.all([
      getXkiroUsage().catch(() => null),
      ensureGroqLimits(3000).catch(() => null),
      orKeyProbe("or-1").catch(() => null),
      orKeyProbe("or-2").catch(() => null),
      unoLogsProbe("uno-1").catch(() => null),
      unoLogsProbe("uno-2").catch(() => null),
    ]),
    new Promise<null[]>((r) => setTimeout(() => r([]), 15_000).unref?.()),
  ]);
  return buildSnapshot();
}
