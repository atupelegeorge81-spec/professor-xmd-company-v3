// src/lib/server/usageLedger.ts — DAFTARI LA MATUMIZI HALISI ya akaunti 9 (server) · R16 · R18 Gemini.
// Vyanzo (vyote halisi, hakuna makisio ya muda wala reset iliyoandikwa ndani ya code):
//   • XKiro     → GET /v1/usage (used_today/limit_per_day/remaining) + tokens za kila jibu kati ya maombi mawili.
//                 Reset inagunduliwa pale used_today INAPOSHUKA (kweli imereset), si kwa saa iliyoandikwa.
//   • Groq      → headers za kila jibu (x-ratelimit-*: RPD/TPM halisi + reset-requests), `usage` ya kila jibu,
//                 na ujumbe wa 429 ("Limit N, Used M … try again in Xs") unaorekebisha namba kwa za Groq zenyewe.
//                 Groq inajaza upya (refill) taratibu ndani ya saa 24 (reset-requests = 86400/RPD) — tunaiga hivyo hivyo.
//                 TPD ya kila model inasomwa live kutoka docs za Groq (groqLimits.ts), si hardcoded.
//   • OpenRouter → requests + tokens za kila jibu (siku ya UTC), GET /api/v1/key (bure; inachelewa 20–80s),
//                 429 (X-RateLimit-Reset). Kikomo = free_model_daily_requests.limit (50).
//   • UnoRouter  → tokens + requests za kila jibu (siku ya UTC), slot ya dakika kwa kila model (Retry-After).
//                 Hakuna API ya kikomo cha tokens → kikomo cha siku KINAJIFUNZWA kikionekana (429 ya bajeti ya siku).
//   • Gemini     → R18: requests + tokens za kila jibu kwa KILA model (siku ya Pacific = reset 10:00 Dar), 429 ya Google
//                 (QuotaFailure: quotaId …PerDay…/…PerMinute… + quotaValue = kikomo halisi + retryDelay). Google haitumi
//                 headers za kikomo kwenye jibu zuri → tunahesabu wenyewe. Embeddings = sehemu YAKE (gem.embed), si chat.
// Hali inahifadhiwa .xmd/usage-ledger.json ili isipotee server ikizimwa (ikishindikana → memory tu).
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import type { AccountId } from "@/lib/usage/accounts";

export interface GroqModelState {
  bucket: number; // tokens zilizo "ndani" ya dirisha la saa 24 (zinapungua taratibu kwa kasi ya TPD/86400s)
  at: number; // bucket ilisasishwa lini
  requests: number; // maombi ya app hii (taarifa tu)
  tpd?: number; // tokens per day halisi (docs au 429)
  tpdSrc?: "docs" | "429";
  rpdLimit?: number;
  rpdRemaining?: number;
  rpdAt?: number;
  rpdResetMs?: number; // x-ratelimit-reset-requests
  tpmLimit?: number;
  tpmRemaining?: number;
  tpmAt?: number; // header ya TPM ilisomwa lini
  tpmResetMs?: number; // x-ratelimit-reset-tokens
  retryAt?: number; // 429: "try again in …"
  lastError?: string;
}

export interface XkiroSlotState {
  used?: number;
  limit?: number;
  remaining?: number;
  accounts?: number;
  fetchedAt?: number;
  prevUsed?: number;
  lastResetAt?: number; // ilionekana kweli (used ilishuka)
  localSinceFetch: number; // tokens za majibu yaliyofika baada ya fetch ya mwisho
  exhaustedAt?: number; // 429 ya "daily free-model token quota"
  error?: string;
}

/** Siku ya UTC (OpenRouter/UnoRouter wanahesabu kwa siku ya UTC — docs zao). */
export const utcDay = (t = Date.now()) => new Date(t).toISOString().slice(0, 10);
export const nextUtcMidnight = (t = Date.now()) => { const d = new Date(t); d.setUTCHours(24, 0, 0, 0); return d.getTime(); };

export interface OrState {
  day: string;
  requests: number; // requests zilizofanikiwa leo (hesabu yetu ya papo hapo)
  tokens: number; // tokens halisi za majibu leo
  api?: { used: number; limit: number; at: number }; // GET /api/v1/key (inachelewa)
  retryAt?: number; // 429 ya dakika / provider busy
  exhaustedUntil?: number; // 429 ya siku → mpaka X-RateLimit-Reset / saa sita usiku UTC
  lastError?: string;
  lastAt?: number;
}

export interface UnoState {
  day: string;
  requests: number;
  tokens: number;
  models: Record<string, { slotUntil?: number; busyUntil?: number; requests: number; tokens: number }>;
  learnedCap?: number; // tokens/siku zilizoonekana kabla ya 429 ya bajeti ya siku
  learnedAt?: number;
  exhaustedUntil?: number;
  lastError?: string;
  lastAt?: number;
  /** R20: hesabu HALISI ya leo kutoka logs za UnoRouter (/api/log/token) — chanzo cha ukweli pale inapopatikana */
  provider?: { day: string; requests: number; tokens: number; errors: number; partial: boolean; at: number };
}

/** R18 · Gemini: hali ya model moja (chat au embedding) kwa siku ya Pacific. */
export interface GemModelState {
  requests: number; // maombi yaliyofanikiwa leo (Google inahesabu haya dhidi ya RPD)
  tokens: number;
  rpdLimit?: number; // kutoka 429 (quotaValue ya …PerDay…) — vinginevyo default ya env
  rpmLimit?: number; // kutoka 429 (quotaValue ya …PerMinute…)
  retryAt?: number; // 429 ya dakika → retryDelay
  busyUntil?: number; // 503 "high demand"
  exhaustedUntil?: number; // 429 ya siku → saa 6 usiku Pacific
  lastError?: string;
  lastAt?: number;
}
export interface GemState { day: string; chat: Record<string, GemModelState>; embed: Record<string, GemModelState> }

/** Siku ya Pacific (Google inareset RPD saa 6 usiku America/Los_Angeles = 10:00/11:00 Dar). */
const PT = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
function ptParts(t: number) {
  const o: Record<string, number> = {};
  for (const p of PT.formatToParts(new Date(t))) if (p.type !== "literal") o[p.type] = Number(p.value);
  return o as { year: number; month: number; day: number; hour: number; minute: number; second: number };
}
export const pacificDay = (t = Date.now()) => { const p = ptParts(t); return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`; };
export function nextPacificMidnight(t = Date.now()): number {
  const p = ptParts(t);
  const wall = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  const offset = wall - Math.floor(t / 1000) * 1000; // PT − UTC (ms, hasi)
  return Date.UTC(p.year, p.month - 1, p.day + 1, 0, 0, 0) - offset;
}

export interface RouteState { account: AccountId; model: string; at: number; ok: boolean }

export interface LedgerState {
  v: 1;
  xkiro: Record<"xkiro-1" | "xkiro-2", XkiroSlotState>;
  groq: Record<"groq-1" | "groq-2", { models: Record<string, GroqModelState>; lastAt?: number }>;
  or: Record<"or-1" | "or-2", OrState>;
  uno: Record<"uno-1" | "uno-2", UnoState>;
  gem?: GemState; // gemini-1 (jina la zamani — data ya R18 inabaki)
  gem2?: GemState; // gemini-2
  groqLimits?: { at: number; src: string; models: Record<string, { rpm: number | null; rpd: number | null; tpm: number | null; tpd: number | null }> };
  routes: Record<string, RouteState>; // engine id → call ya mwisho halisi
}

const FILE = join(process.cwd(), ".xmd", "usage-ledger.json");
const g = globalThis as unknown as { __xmdLedger?: LedgerState; __xmdLedgerTimer?: ReturnType<typeof setTimeout> | null };

const fresh = (): LedgerState => ({
  v: 1,
  xkiro: { "xkiro-1": { localSinceFetch: 0 }, "xkiro-2": { localSinceFetch: 0 } },
  groq: { "groq-1": { models: {} }, "groq-2": { models: {} } },
  or: { "or-1": { day: utcDay(), requests: 0, tokens: 0 }, "or-2": { day: utcDay(), requests: 0, tokens: 0 } },
  uno: { "uno-1": { day: utcDay(), requests: 0, tokens: 0, models: {} }, "uno-2": { day: utcDay(), requests: 0, tokens: 0, models: {} } },
  gem: { day: pacificDay(), chat: {}, embed: {} },
  gem2: { day: pacificDay(), chat: {}, embed: {} },
  routes: {},
});

export function ledger(): LedgerState {
  if (g.__xmdLedger) return g.__xmdLedger;
  let s = fresh();
  try {
    const j = JSON.parse(readFileSync(FILE, "utf8"));
    if (j?.v === 1) s = { ...s, ...j, xkiro: { ...s.xkiro, ...(j.xkiro || {}) }, groq: { ...s.groq, ...(j.groq || {}) }, or: { ...s.or, ...(j.or || {}) }, uno: { ...s.uno, ...(j.uno || {}) }, gem: j.gem?.chat ? j.gem : s.gem, gem2: j.gem2?.chat ? j.gem2 : s.gem2, routes: j.routes || {} };
    delete (s as unknown as { th?: unknown }).th; // R16: TokenHarbor imeondolewa
  } catch { /* hakuna faili bado */ }
  g.__xmdLedger = s;
  return s;
}

/** Hifadhi (debounced 800ms). */
export function persist(): void {
  if (g.__xmdLedgerTimer) return;
  g.__xmdLedgerTimer = setTimeout(() => {
    g.__xmdLedgerTimer = null;
    try {
      mkdirSync(dirname(FILE), { recursive: true });
      const tmp = `${FILE}.tmp`;
      writeFileSync(tmp, JSON.stringify(ledger()));
      renameSync(tmp, FILE);
    } catch { /* read-only FS → memory tu */ }
  }, 800);
}

/* ------------------------------------------------------------------ helpers */

/** "1m26.4s" / "255ms" / "7.66s" / "2h3m" → ms */
export function parseDuration(v: string | null | undefined): number | null {
  if (!v) return null;
  const s = String(v).trim();
  if (/^\d+(\.\d+)?$/.test(s)) return Math.round(Number(s) * 1000);
  let ms = 0;
  let hit = false;
  for (const m of s.matchAll(/(\d+(?:\.\d+)?)(ms|h|m|s)/g)) {
    hit = true;
    const n = Number(m[1]);
    ms += m[2] === "h" ? n * 3_600_000 : m[2] === "m" ? n * 60_000 : m[2] === "s" ? n * 1000 : n;
  }
  return hit ? Math.round(ms) : null;
}

const intOr = (v: string | null | undefined): number | undefined => {
  if (v == null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Bucket ya Groq baada ya refill hadi sasa (kasi = TPD kwa saa 24). */
export function groqBucketNow(m: GroqModelState, now = Date.now()): number {
  if (!m.tpd) return m.bucket;
  const refill = ((now - m.at) * m.tpd) / 86_400_000;
  return Math.max(0, m.bucket - refill);
}

function groqModel(slot: "groq-1" | "groq-2", model: string): GroqModelState {
  const st = ledger().groq[slot];
  let m = st.models[model];
  if (!m) {
    m = { bucket: 0, at: Date.now(), requests: 0 };
    st.models[model] = m;
  }
  const tpd = ledger().groqLimits?.models[model]?.tpd;
  if (tpd && m.tpdSrc !== "429") { m.tpd = tpd; m.tpdSrc = "docs"; }
  return m;
}

/* ------------------------------------------------------------------ writers (usageTap) */

export function noteRoute(engines: string[], account: AccountId, model: string, ok: boolean): void {
  const L = ledger();
  for (const e of engines) L.routes[e] = { account, model, at: Date.now(), ok };
}

export function noteGroqHeaders(slot: "groq-1" | "groq-2", model: string, h: Headers): void {
  const m = groqModel(slot, model);
  const rl = intOr(h.get("x-ratelimit-limit-requests"));
  const rr = intOr(h.get("x-ratelimit-remaining-requests"));
  if (rl != null) m.rpdLimit = rl;
  if (rr != null) { m.rpdRemaining = rr; m.rpdAt = Date.now(); }
  const rs = parseDuration(h.get("x-ratelimit-reset-requests"));
  if (rs != null) m.rpdResetMs = rs;
  const tl = intOr(h.get("x-ratelimit-limit-tokens"));
  const tr = intOr(h.get("x-ratelimit-remaining-tokens"));
  if (tl != null) m.tpmLimit = tl;
  if (tr != null) { m.tpmRemaining = tr; m.tpmAt = Date.now(); }
  const trs = parseDuration(h.get("x-ratelimit-reset-tokens"));
  if (trs != null) m.tpmResetMs = trs;
  ledger().groq[slot].lastAt = Date.now();
  persist();
}

export function noteGroqTokens(slot: "groq-1" | "groq-2", model: string, tokens: number): void {
  const m = groqModel(slot, model);
  const now = Date.now();
  m.bucket = groqBucketNow(m, now) + tokens;
  m.at = now;
  m.requests++;
  if (m.retryAt && m.retryAt < now) m.retryAt = undefined;
  persist();
}

/** Ujumbe wa 429 wa Groq: "... on tokens per day (TPD): Limit 200000, Used 199812, Requested 1650. Please try again in 4m35.1s" */
export function noteGroqError(slot: "groq-1" | "groq-2", model: string, status: number, body: string): void {
  const m = groqModel(slot, model);
  const msg = String(body || "").slice(0, 600);
  const kind = /\((TPD|TPM|RPD|RPM)\)/.exec(msg)?.[1] || (/tokens per day/i.test(msg) ? "TPD" : /requests per day/i.test(msg) ? "RPD" : "");
  const lim = /Limit\s+(\d+)/i.exec(msg);
  const used = /Used\s+(\d+)/i.exec(msg);
  const wait = /try again in\s+([0-9hms.]+)/i.exec(msg);
  const now = Date.now();
  if (kind === "TPD" && lim) {
    m.tpd = Number(lim[1]);
    m.tpdSrc = "429";
    if (used) { m.bucket = Number(used[1]); m.at = now; }
  }
  if (kind === "RPD" && lim) { m.rpdLimit = Number(lim[1]); m.rpdRemaining = 0; m.rpdAt = now; }
  const w = parseDuration(wait?.[1]);
  if (status === 429 && w != null) m.retryAt = now + w;
  m.lastError = `${status}${kind ? ` ${kind}` : ""}`;
  persist();
}

export function noteXkiroTokens(slot: "xkiro-1" | "xkiro-2", tokens: number): void {
  ledger().xkiro[slot].localSinceFetch += tokens;
  persist();
}

export function noteXkiroError(slot: "xkiro-1" | "xkiro-2", status: number, body: string): void {
  const s = ledger().xkiro[slot];
  if (/free-model token quota|daily.*quota/i.test(body)) { s.exhaustedAt = Date.now(); s.remaining = 0; }
  s.error = `HTTP ${status}`;
  persist();
}

/** Matokeo ya GET /v1/usage (xkiroUsage.ts) kwa slot. */
export function noteXkiroFetch(slot: "xkiro-1" | "xkiro-2", r: { used: number; limit: number; remaining: number; accounts: number } | { error: string }): void {
  const s = ledger().xkiro[slot];
  const now = Date.now();
  if ("error" in r) { s.error = r.error; persist(); return; }
  if (s.used != null && r.used < s.used - Math.max(1000, s.used * 0.2)) {
    // namba ya XKiro imeshuka → quota imereset KWELI (tunaona kutoka kwao, si saa iliyoandikwa)
    s.lastResetAt = now;
    s.exhaustedAt = undefined;
  }
  s.prevUsed = s.used;
  s.used = r.used;
  s.limit = r.limit;
  s.remaining = r.remaining;
  s.accounts = r.accounts;
  s.fetchedAt = now;
  s.localSinceFetch = 0;
  s.error = undefined;
  if (r.remaining > 0) s.exhaustedAt = undefined;
  persist();
}

export function setGroqLimits(src: string, models: NonNullable<LedgerState["groqLimits"]>["models"]): void {
  const L = ledger();
  L.groqLimits = { at: Date.now(), src, models };
  for (const slot of ["groq-1", "groq-2"] as const)
    for (const [name, m] of Object.entries(L.groq[slot].models))
      if (models[name]?.tpd && m.tpdSrc !== "429") { m.tpd = models[name].tpd!; m.tpdSrc = "docs"; }
  persist();
}

/* ------------------------------------------------------------------ OpenRouter / UnoRouter (R16) */

export function orState(id: "or-1" | "or-2"): OrState {
  const L = ledger();
  let o = L.or[id];
  if (!o) o = L.or[id] = { day: utcDay(), requests: 0, tokens: 0 };
  if (o.day !== utcDay()) { // siku mpya ya UTC = reset halisi ya OpenRouter
    o.day = utcDay(); o.requests = 0; o.tokens = 0; o.api = undefined; o.exhaustedUntil = undefined;
  }
  return o;
}

export function unoState(id: "uno-1" | "uno-2"): UnoState {
  const L = ledger();
  let u = L.uno[id];
  if (!u) u = L.uno[id] = { day: utcDay(), requests: 0, tokens: 0, models: {} };
  if (u.day !== utcDay()) {
    u.day = utcDay(); u.requests = 0; u.tokens = 0; u.exhaustedUntil = undefined; u.provider = undefined;
    for (const m of Object.values(u.models)) { m.requests = 0; m.tokens = 0; }
  }
  return u;
}

const unoModel = (id: "uno-1" | "uno-2", model: string) => {
  const u = unoState(id);
  return (u.models[model] ||= { requests: 0, tokens: 0 });
};

export function noteOrResult(id: "or-1" | "or-2", ok: boolean, tokens: number | null): void {
  const o = orState(id);
  if (ok) { o.requests++; if (tokens) o.tokens += tokens; o.lastError = undefined; }
  o.lastAt = Date.now();
  persist();
}

/** 429 ya OpenRouter: ya siku (X-RateLimit-Remaining 0 + reset mbali) au ya dakika / provider busy. */
export function noteOrError(id: "or-1" | "or-2", status: number, body: string, h: Headers): void {
  const o = orState(id);
  const now = Date.now();
  const remaining = intOr(h.get("x-ratelimit-remaining"));
  const resetRaw = intOr(h.get("x-ratelimit-reset"));
  const resetAt = resetRaw != null ? (resetRaw > 1e12 ? resetRaw : resetRaw * 1000) : null;
  const daily = /per.?day|free-models-per-day|daily/i.test(body) || (remaining === 0 && resetAt != null && resetAt - now > 10 * 60_000);
  if (status === 429 && daily) o.exhaustedUntil = resetAt && resetAt > now ? resetAt : nextUtcMidnight(now);
  else if (status === 429) {
    const ra = parseDuration(h.get("retry-after"));
    o.retryAt = now + (ra ?? (resetAt && resetAt > now && resetAt - now < 10 * 60_000 ? resetAt - now : 60_000));
  }
  o.lastError = `${status}${daily ? " daily" : ""}`;
  o.lastAt = now;
  persist();
}

export function noteOrKey(id: "or-1" | "or-2", used: number, limit: number): void {
  const o = orState(id);
  o.api = { used, limit, at: Date.now() };
  if (used >= limit && !o.exhaustedUntil) o.exhaustedUntil = nextUtcMidnight();
  persist();
}

/** Broker: slot ya dakika ya Uno imechukuliwa sasa (kabla ya jibu kufika). */
export function takeUnoSlot(id: "uno-1" | "uno-2", model: string, ms = 60_000): void {
  unoModel(id, model).slotUntil = Date.now() + ms;
  persist();
}

export function noteUnoResult(id: "uno-1" | "uno-2", model: string, ok: boolean, tokens: number | null): void {
  const u = unoState(id);
  const m = unoModel(id, model);
  if (ok) {
    u.requests++; m.requests++;
    if (tokens) { u.tokens += tokens; m.tokens += tokens; }
    u.lastError = undefined;
  }
  u.lastAt = Date.now();
  persist();
}

/** Makosa ya Uno: 429 ya dakika (Retry-After), 503 get_channel_failed (busy), au bajeti ya siku (kikomo kinajifunzwa). */
export function noteUnoError(id: "uno-1" | "uno-2", model: string, status: number, body: string, h: Headers): void {
  const u = unoState(id);
  const m = unoModel(id, model);
  const now = Date.now();
  const ra = parseDuration(h.get("retry-after"));
  const perMinute = /every\s+\d+\s*min|per.?minute|request\(s\) every/i.test(body);
  const daily = !perMinute && /daily|per day|quota|budget/i.test(body);
  if (status === 429 && perMinute) m.slotUntil = now + (ra ?? 60_000);
  else if (status === 429 && daily) {
    if (u.tokens > 20_000) { u.learnedCap = u.tokens; u.learnedAt = now; }
    u.exhaustedUntil = nextUtcMidnight(now);
  } else if (status === 429) m.slotUntil = now + (ra ?? 60_000);
  else if (status === 503) m.busyUntil = now + (ra ?? 90_000);
  u.lastError = `${status}${daily ? " daily" : perMinute ? " minute" : ""}`;
  u.lastAt = now;
  persist();
}

/* ------------------------------------------------------------------ Gemini (R18) */

export type GemKind = "chat" | "embed";
export type GemAcct = "gemini-1" | "gemini-2";
const GEM_SLOT: Record<GemAcct, "gem" | "gem2"> = { "gemini-1": "gem", "gemini-2": "gem2" };

/** Hali ya Gemini ya leo kwa akaunti (project) moja — siku mpya ya Pacific = reset halisi ya Google → hesabu zinaanza upya. */
export function gemState(acct: GemAcct = "gemini-1"): GemState {
  const L = ledger();
  const k = GEM_SLOT[acct] || "gem";
  let g = L[k];
  if (!g || !g.chat) g = L[k] = { day: pacificDay(), chat: {}, embed: {} };
  if (g.day !== pacificDay()) {
    g.day = pacificDay();
    for (const kind of ["chat", "embed"] as const)
      for (const m of Object.values(g[kind])) { m.requests = 0; m.tokens = 0; m.exhaustedUntil = undefined; }
  }
  return g;
}

export function gemModel(kind: GemKind, model: string, acct: GemAcct = "gemini-1"): GemModelState {
  const g = gemState(acct);
  return (g[kind][model] ||= { requests: 0, tokens: 0 });
}

export function noteGemResult(kind: GemKind, model: string, ok: boolean, tokens: number | null, acct: GemAcct = "gemini-1"): void {
  const m = gemModel(kind, model, acct);
  if (ok) { m.requests++; if (tokens) m.tokens += tokens; m.lastError = undefined; }
  m.lastAt = Date.now();
  persist();
}

/** Kosa la Google → aina + muda. Body ina QuotaFailure (quotaId + quotaValue) na RetryInfo (retryDelay "20s"). */
export function parseGemError(status: number, body: string): { kind: "daily" | "minute" | "busy" | "other"; waitMs: number | null; limit: number | null } {
  const b = String(body || "");
  if (status === 429) {
    // kila kikomo kilichovukwa: {"quotaId":"GenerateRequestsPerDayPerProjectPerModel-FreeTier", …, "quotaValue":"20"}
    const pairs = [...b.matchAll(/"quotaId"\s*:\s*"([^"]+)"(?:(?!"quotaId")[\s\S]){0,600}?"quotaValue"\s*:\s*"?(\d+)/g)].map((m) => ({ id: m[1], value: Number(m[2]) }));
    const daily = pairs.length ? pairs.some((p) => /PerDay/i.test(p.id)) : /PerDay|per day/i.test(b);
    const hit = pairs.find((p) => (daily ? /PerDay/i : /PerMinute/i).test(p.id));
    const delay = /"retryDelay"\s*:\s*"([0-9.]+)s"/.exec(b) || /retry in\s+([0-9.]+)s/i.exec(b);
    return { kind: daily ? "daily" : "minute", waitMs: delay ? Math.ceil(Number(delay[1]) * 1000) : null, limit: hit ? hit.value : null };
  }
  if (status === 503 || /UNAVAILABLE|overloaded|high demand/i.test(b)) return { kind: "busy", waitMs: 30_000, limit: null };
  return { kind: "other", waitMs: null, limit: null };
}

export function noteGemError(kind: GemKind, model: string, status: number, body: string, acct: GemAcct = "gemini-1"): void {
  const m = gemModel(kind, model, acct);
  const now = Date.now();
  const e = parseGemError(status, body);
  if (e.kind === "daily") { m.exhaustedUntil = nextPacificMidnight(now); if (e.limit && e.limit > 0) m.rpdLimit = e.limit; }
  else if (e.kind === "minute") { m.retryAt = now + Math.max(2_000, e.waitMs ?? 20_000); if (e.limit && e.limit > 0) m.rpmLimit = e.limit; }
  else if (e.kind === "busy") m.busyUntil = now + (e.waitMs ?? 30_000);
  m.lastError = `${status}${e.kind !== "other" ? ` ${e.kind}` : ""}`;
  m.lastAt = now;
  persist();
}
