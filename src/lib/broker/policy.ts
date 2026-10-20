// src/lib/broker/policy.ts — admission (je, lane hii INAWEZA kubeba ombi hili sasa?) + alama (score).
// Kila uamuzi unatoka kwenye namba halisi za ledger (headers/usage za provider) + reservations za broker.
import { GEMINI_FLASH_MODELS, GEMINI_FLASH_RPD, GEMINI_FLASH_RPM, GEMINI_LITE_RPD, GEMINI_LITE_RPM, GROQ_MODELS } from "@/lib/env";
import { gemState, groqBucketNow, ledger, orState, unoState } from "@/lib/server/usageLedger";
import { GEM_ACCOUNTS, type GemAccountId, type ProviderId } from "@/lib/usage/accounts";
import { slotKeyCount } from "@/lib/server/usageKeys";
import type { Lane } from "./lanes";
import type { WorkClass } from "./estimate";
import { bstate, health, healthScore, pruneRecent } from "./state";

export const GROQ_TPM = 8_000;
export const GROQ_TPD = 200_000;
export const OR_RPM = 20;
export const OR_DAILY = 50;
/** Providers adimu (requests chache kwa siku): broker anasubiri lane bora ikifunguka ndani ya dirisha badala ya kuzitumia. */
export const SCARCE: ProviderId[] = ["openrouter"];
// (Gemini Flash ni adimu pia, lakini inalindwa na FLASH_RESERVE + uzito wake wa HEAVY — si kusubiri.)

/** Uzito wa kila provider kwa darasa (0 = kamwe). Plan v2 + marekebisho ya e2e: BACKGROUND inaanza na Groq
 *  (memory ni ndogo na Groq ina tokens nyingi) ili slots za Uno zibaki kwa kazi NZITO (ripoti) — vinginevyo
 *  ripoti inalazimika kutumia requests adimu za OpenRouter (100/siku). */
export const WEIGHTS: Record<WorkClass, Record<Exclude<ProviderId, "gemini">, number>> = {
  heavy: { unorouter: 1, openrouter: 0.8, xkiro: 0.6, groq: 0 },
  normal: { xkiro: 1, unorouter: 0.85, openrouter: 0.6, groq: 0.5 },
  light: { groq: 1, xkiro: 0.8, unorouter: 0.3, openrouter: 0 },
  background: { groq: 1, unorouter: 0.75, xkiro: 0.6, openrouter: 0 },
};

/** R18 · Gemini kwa daraja (tier): Flash = 20/siku kila model → HEAVY tu (code, mini-report, script ya mwisho, ripoti —
 *  zinajibu kwa sekunde badala ya dakika 5–11 za Uno). Flash-Lite = 500/siku kila model → LIGHT/BACKGROUND kwanza
 *  (observers, memory, search query, title), NORMAL ya dharura, HEAVY ya mwisho kabisa. */
export const GEMINI_WEIGHTS: Record<WorkClass, { flash: number; lite: number }> = {
  heavy: { flash: 1.2, lite: 0.35 },
  normal: { flash: 0, lite: 0.55 },
  light: { flash: 0, lite: 1.05 },
  background: { flash: 0, lite: 1.05 },
};
/** Requests za Flash zinazobaki kwa kazi muhimu (script ya mwisho + ripoti 2 + repair 1) — code ya kawaida haizigusi. */
export const FLASH_RESERVE = 4;

/** Uzito wa lane hii kwa darasa (0 = kamwe). Gemini: kwa tier, na model bora kidogo mbele (rank). */
export function weightOf(cls: WorkClass, lane: Lane): number {
  if (lane.provider === "gemini") {
    const w = GEMINI_WEIGHTS[cls][lane.tier === "flash" ? "flash" : "lite"];
    return w ? Math.max(0.01, w - (lane.rank ?? 0) * 0.01) : 0;
  }
  return WEIGHTS[cls][lane.provider];
}

/** R21 · NJIA YA HARAKA (fast) — kazi fupi zinazomsubirisha Mkuu (jina la conversation, scope na AGENDA).
 *  Mpangilio ni kwa KASI HALISI ya kujibu, si ubora wa reasoning: Gemini Flash-Lite (sekunde, 500/siku kila model) →
 *  Gemini Flash (sekunde; FLASH_RESERVE inalinda ripoti) → Groq (LPU, haraka sana; TPM 8K inabana ukubwa) →
 *  XKiro qwen-max (reasoning — dakika kwa jibu refu) → Uno/OpenRouter ya dharura tu (Uno = request 1/dakika, polepole).
 *  Haina uzito 0 kwa yeyote: provider za haraka zikiisha, kazi bado inapata lane (si agenda ya fallback). */
export function fastWeightOf(lane: Lane): number {
  if (lane.provider === "gemini") return Math.max(0.01, (lane.tier === "flash" ? 0.9 : 1.2) - (lane.rank ?? 0) * 0.01);
  return { groq: 0.8, xkiro: 0.4, unorouter: 0.1, openrouter: 0.05 }[lane.provider];
}
/** R49 · MPANGO KAZI (agizo la Mkuu 11-10): sehemu inayoandika Mpango Kazi wa Agent inaruhusiwa kutumia
 *  PROVIDERS HIZI PEKEE, kwa mpangilio huu:
 *    1) XKiro qwen — akaunti ZOTE 2 (XTROUTER_API_KEY_OPTIMUS_1 / _2) zinaruhusiwa; ndiyo ya kwanza kujaribiwa.
 *    2) UnoRouter (nemotron-3-ultra-550b · space-bunny-alpha) na OpenRouter (nemotron-3-ultra-550b:free)
 *       — zinaingia XKiro ISIPOKUWA na nafasi.
 *  Gemini HAIORODHESHWI (ni haraka, lakini haifanyi reasoning ya kutosha kwa mpango — inakosea);
 *  Groq pia haipo. broker inafunga hii kwa `planWork: true` — filter ya provider (si uzito pekee),
 *  kwa hiyo hata weights zikibadilika baadaye Gemini haitaingia kwenye mpango. */
export const PLAN_PROVIDERS: ProviderId[] = ["xkiro", "unorouter", "openrouter"];
const PLAN_WEIGHTS: Record<string, number> = { xkiro: 1, unorouter: 0.85, openrouter: 0.7 };
export const planWeightOf = (lane: Lane): number => PLAN_WEIGHTS[lane.provider] ?? 0;

/** TASK-30 · JUDGE (uamuzi wa mmiliki — usibadilishe): kila kinachohukumu au kuchambua picha (reviewer analysis,
 *  verification, mjadala wa review) kinatumia mnyororo HUU PEKEE, kwa mpangilio huu:
 *    1) Gemini Flash — models ZOTE za Flash kwenye keys ZOTE 4 (thinking ON) — zinazungushwa (broker.pick)
 *    2) XKiro — Flash ikikosa nafasi (admission ya kawaida: quota/rpm/circuit)
 *    3) Gemini Flash-Lite — XKiro ikikosa nafasi
 *  Lanes nyingine zote na policies zake hazibadiliki (judge ni darasa jipya, si uzito mpya wa madarasa ya zamani). */
export type LaneClassId = "gemini-flash" | "gemini-flash-lite" | Exclude<ProviderId, "gemini">;
export const laneClassOf = (lane: Lane): LaneClassId => (lane.provider === "gemini" ? (lane.tier === "lite" ? "gemini-flash-lite" : "gemini-flash") : lane.provider);
export const JUDGE_CHAIN: readonly LaneClassId[] = ["gemini-flash", "xkiro", "gemini-flash-lite"];
/** TASK-32 (uamuzi wa CEO 2026-10-21): XKiro ina kikomo cha tokens 500k/siku na picha zinakula tokens nyingi →
 *  judge YENYE picha (vision) HATUMII XKiro kamwe (filter ngumu kwenye broker.pick + judgeVisionReady).
 *  Judge wa maandishi tu bado anaweza kutumia XKiro kwenye mnyororo. */
export const VISION_JUDGE_EXCLUDED: readonly LaneClassId[] = ["xkiro"];
export const visionJudgeAllowed = (lane: Lane): boolean => !VISION_JUDGE_EXCLUDED.includes(laneClassOf(lane));
/** nafasi kwenye mnyororo wa judge (0 = Flash) · -1 = lane haipo kwenye judge */
export const judgeTierOf = (lane: Lane): number => JUDGE_CHAIN.indexOf(laneClassOf(lane));
export const judgeWeightOf = (lane: Lane): number => { const t = judgeTierOf(lane); return t < 0 ? 0 : JUDGE_CHAIN.length - t; };

/** FLOW-MAP F (jaribio halisi la picha 64×64): Flash, XKiro qwen na Flash-Lite ZOTE zilijibu "Red". Groq/Uno/OpenRouter hazikuthibitishwa. */
export const VISION_PROVEN: readonly LaneClassId[] = ["gemini-flash", "xkiro", "gemini-flash-lite"];
const testClasses = (name: string, env: Record<string, string | undefined>): Set<string> =>
  env.XMD_TEST_HOOKS === "1" ? new Set(String(env[name] || "").split(",").map((x) => x.trim()).filter(Boolean)) : new Set();
/** TASK-30 test hook (XMD_TEST_HOOKS=1 pekee): `XMD_TEST_LANES_DOWN=gemini-flash,xkiro` — lane classes hizo hazipatikani kwa judge. */
export const testLanesDown = (env: Record<string, string | undefined> = process.env) => testClasses("XMD_TEST_LANES_DOWN", env);
/** TASK-30 test hook (XMD_TEST_HOOKS=1 pekee; uamuzi wa CEO): `XMD_TEST_LANES_NOVISION=xkiro` — lane class ihesabiwe haina vision (T4). */
export const testLanesNoVision = (env: Record<string, string | undefined> = process.env) => testClasses("XMD_TEST_LANES_NOVISION", env);
export const visionCapable = (lane: Lane, env: Record<string, string | undefined> = process.env): boolean =>
  VISION_PROVEN.includes(laneClassOf(lane)) && !testLanesNoVision(env).has(laneClassOf(lane));

/** Uzito unaotumika kweli: judge → judgeWeightOf; mpango → planWeightOf; njia ya haraka → fastWeightOf; vinginevyo darasa la kawaida. */
export function laneWeight(cls: WorkClass, lane: Lane, fast?: boolean, plan?: boolean, judge?: boolean): number {
  return judge ? judgeWeightOf(lane) : plan ? planWeightOf(lane) : fast ? fastWeightOf(lane) : weightOf(cls, lane);
}

const gemLimits = (lane: Lane) => (lane.tier === "flash" ? { rpd: GEMINI_FLASH_RPD, rpm: GEMINI_FLASH_RPM } : { rpd: GEMINI_LITE_RPD, rpm: GEMINI_LITE_RPM });

/** Requests za Flash zilizobaki leo — models zote za Flash kwenye AKAUNTI ZOTE za Gemini (kila project ina ndoo yake). */
export function flashRemaining(now = Date.now()): number {
  let rem = 0;
  for (const acct of GEM_ACCOUNTS) {
    if (slotKeyCount(acct) === 0) continue;
    const g = gemState(acct);
    for (const model of GEMINI_FLASH_MODELS) {
      const m = g.chat[model];
      if (m?.exhaustedUntil && m.exhaustedUntil > now) continue;
      const rpd = m?.rpdLimit ?? GEMINI_FLASH_RPD;
      const inflight = [...bstate().leases.values()].filter((r) => r.laneId === `${acct}:${model}`).length;
      rem += Math.max(0, rpd - (m?.requests ?? 0) - inflight);
    }
  }
  return rem;
}

export type Admission =
  | { ok: true; maxTokens: number; headroom: number }
  | { ok: false; readyAt: number | null; reason: string }; // readyAt null = haiwezi kwa ombi hili/leo

const reservedOn = (pred: (laneId: string, account: string) => boolean) => {
  let t = 0;
  for (const r of bstate().leases.values()) if (pred(r.laneId, r.account)) t += r.tokens;
  return t;
};
const activeOn = (laneId: string) => [...bstate().leases.values()].filter((r) => r.laneId === laneId).length;

export function admit(lane: Lane, estIn: number, wantOut: number, now = Date.now(), opts?: { critical?: boolean }): Admission {
  const S = bstate();
  pruneRecent(now);
  const dis = S.disabled.get(lane.id);
  if (dis && dis.until > now) return { ok: false, readyAt: null, reason: dis.reason };
  const h = health(lane.id);
  if (h.openUntil > now) return { ok: false, readyAt: h.openUntil, reason: "circuit" };
  const busy = S.busyUntil.get(lane.id) || 0;
  if (busy > now) return { ok: false, readyAt: busy, reason: "cooling" };
  if (estIn + 256 > lane.ctx) return { ok: false, readyAt: null, reason: "context" };
  const minOut = Math.min(wantOut, 1200);
  let out = Math.min(wantOut, lane.maxOut);

  if (lane.provider === "xkiro") {
    const x = ledger().xkiro[lane.account as "xkiro-1" | "xkiro-2"];
    if (x?.exhaustedAt) return { ok: false, readyAt: null, reason: "daily" };
    if (x?.limit && x.used != null) {
      const rem = x.limit - x.used - (x.localSinceFetch || 0) - reservedOn((_, a) => a === lane.account);
      if (rem < estIn + minOut) return { ok: false, readyAt: null, reason: "daily" };
      out = Math.min(out, rem - estIn);
      return { ok: true, maxTokens: out, headroom: Math.max(0, Math.min(1, rem / x.limit)) };
    }
    return { ok: true, maxTokens: out, headroom: 0.8 }; // hakuna data bado — optimistic
  }

  if (lane.provider === "groq") {
    const L = ledger();
    const m = L.groq[lane.account as "groq-1" | "groq-2"]?.models[lane.model];
    const lim = m?.tpmLimit || L.groqLimits?.models[lane.model]?.tpm || GROQ_TPM;
    // Groq inahesabu prompt + max_tokens dhidi ya TPM → kama prompt pekee + jibu dogo haitoshi, lane haifai kabisa
    if (estIn + minOut > lim) return { ok: false, readyAt: null, reason: "size" };
    out = Math.min(out, lim - estIn);
    const need = estIn + out;
    if (m?.retryAt && m.retryAt > now) return { ok: false, readyAt: m.retryAt, reason: "cooling" };
    // TPM: header ya mwisho + refill tangu hapo − leases ambazo header bado haijaziona
    const tpmAt = m?.tpmAt ?? 0;
    const base = m?.tpmRemaining != null && tpmAt ? Math.min(lim, m.tpmRemaining + ((now - tpmAt) * lim) / 60_000) : lim;
    let pending = 0;
    for (const r of [...S.leases.values(), ...S.recent]) if (r.laneId === lane.id && r.start > tpmAt) pending += r.tokens;
    const avail = base - pending;
    if (avail < need) return { ok: false, readyAt: now + Math.ceil(((need - avail) * 60_000) / lim) + 250, reason: "tpm" };
    // TPD (dirisha la saa 24 linalojijaza)
    const tpd = m?.tpd ?? L.groqLimits?.models[lane.model]?.tpd ?? GROQ_TPD;
    const bucket = m ? groqBucketNow({ ...m, tpd }, now) : 0;
    if (bucket + need > tpd) return { ok: false, readyAt: now + Math.ceil(((bucket + need - tpd) / tpd) * 86_400_000), reason: "daily" };
    if (m?.rpdRemaining === 0 && m.rpdAt && now - m.rpdAt < 3_600_000) return { ok: false, readyAt: null, reason: "daily" };
    return { ok: true, maxTokens: out, headroom: Math.max(0, 1 - bucket / tpd) };
  }

  if (lane.provider === "openrouter") {
    const o = orState(lane.account as "or-1" | "or-2");
    if (o.exhaustedUntil && o.exhaustedUntil > now) return { ok: false, readyAt: null, reason: "daily" };
    const limit = o.api?.limit || OR_DAILY;
    const inflight = [...S.leases.values()].filter((r) => r.account === lane.account).length;
    const used = Math.max(o.requests, o.api?.used ?? 0) + inflight;
    if (used >= limit) return { ok: false, readyAt: null, reason: "daily" };
    if (o.retryAt && o.retryAt > now) return { ok: false, readyAt: o.retryAt, reason: "cooling" };
    const ts = S.orMinute.get(lane.account) || [];
    if (ts.length >= OR_RPM) return { ok: false, readyAt: ts[0] + 60_000, reason: "rpm" };
    return { ok: true, maxTokens: out, headroom: Math.max(0, 1 - used / limit) };
  }

  if (lane.provider === "gemini") {
    // R18: Google haitumi headers za kikomo → hesabu yetu (ledger, siku ya Pacific) + 429 halisi (quotaValue/retryDelay)
    const m = gemState(lane.account as GemAccountId).chat[lane.model];
    if (m?.exhaustedUntil && m.exhaustedUntil > now) return { ok: false, readyAt: null, reason: "daily" };
    if (m?.busyUntil && m.busyUntil > now) return { ok: false, readyAt: m.busyUntil, reason: "busy" };
    if (m?.retryAt && m.retryAt > now) return { ok: false, readyAt: m.retryAt, reason: "cooling" };
    const lim = gemLimits(lane);
    const rpd = m?.rpdLimit ?? lim.rpd;
    const used = (m?.requests ?? 0) + activeOn(lane.id);
    if (used >= rpd) return { ok: false, readyAt: null, reason: "daily" };
    if (lane.tier === "flash" && !opts?.critical && flashRemaining(now) <= FLASH_RESERVE) return { ok: false, readyAt: null, reason: "reserve" };
    const ts = S.orMinute.get(lane.id) || [];
    const rpm = m?.rpmLimit ?? lim.rpm;
    if (ts.length >= rpm) return { ok: false, readyAt: ts[ts.length - rpm] + 60_000 + 250, reason: "rpm" };
    // Gemini inahesabu thinking ndani ya max_tokens → nafasi ya ziada ili jibu lisikatike tupu
    return { ok: true, maxTokens: Math.min(lane.maxOut, out + 8_192), headroom: Math.max(0, 1 - used / rpd) };
  }

  // unorouter: request 1 kwa dakika kwa kila (akaunti, model)
  const u = unoState(lane.account as "uno-1" | "uno-2");
  if (u.exhaustedUntil && u.exhaustedUntil > now) return { ok: false, readyAt: null, reason: "daily" };
  if (u.learnedCap && u.tokens + reservedOn((_, a) => a === lane.account) + estIn + out > u.learnedCap) return { ok: false, readyAt: null, reason: "daily" };
  const um = u.models[lane.model];
  const slot = Math.max(um?.slotUntil ?? 0, um?.busyUntil ?? 0);
  if (slot > now) return { ok: false, readyAt: slot, reason: "slot" };
  if (activeOn(lane.id) > 0) return { ok: false, readyAt: now + 60_000, reason: "slot" };
  return { ok: true, maxTokens: out, headroom: u.learnedCap ? Math.max(0, 1 - u.tokens / u.learnedCap) : 1 };
}

/**
 * Alama = uzito wa darasa × (0.85 + 0.15·headroom) × afya + sticky 0.05.
 * Mpangilio wa darasa ndio mkuu (NORMAL inabaki XKiro mpaka iishe kweli — admission inaiweka kando); headroom
 * inaamua kati ya akaunti za provider mmoja (mf. XKiro 1 vs 2) na afya inashusha lane zinazoyumba.
 */
export function score(lane: Lane, cls: WorkClass, headroom: number, stickyLaneId?: string, fast?: boolean, plan?: boolean, judge?: boolean): number {
  const w = laneWeight(cls, lane, fast, plan, judge);
  if (!w) return 0;
  const sticky = stickyLaneId === lane.id ? 0.05 : 0;
  return w * (0.85 + 0.15 * headroom) * healthScore(lane.id) + sticky;
}

/** Groq models zinazojulikana (kwa uwazi wa prompts). */
export const groqModels = () => GROQ_MODELS;
