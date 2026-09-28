// src/lib/broker/broker.ts — CAPACITY BROKER (R16). Ubongo MMOJA wa kuchagua akaunti/model kwa kila wito wa LLM.
// Mtiririko: estimate → filter (darasa) → admit (namba halisi) → score → reserve + dispatch (subiri ≤8s ikibidi)
//            → settle (done/fail) → classify kosa → zungusha kwenda lane nyingine.
// Hakuna stage wala mzunguko wa kila agent: agents wote wanashiriki lanes 20 kwa haki (priority) — R18: + Gemini 8.
// Mwitaji anabaki na stream loop yake mwenyewe (parser, meter, retries) — broker anampa "lease".
//
//   const run = brokerRun({ agentId, purpose: "board-turn", cls: "normal", messages, maxOut: 2000, priority: "live" });
//   for (let hop = 0; hop < 5; hop++) {
//     const lease = await run.next();                 // BrokerExhaustedError kama hakuna chochote ndani ya dirisha
//     try { …stream kwa lease.client / lease.model / lease.maxTokens / lease.extraBody…; lease.done(); break; }
//     catch (e) { if (!lease.fail(e).reroute) throw e; }
//   }
import OpenAI from "openai";
import { meteredFetch } from "@/lib/server/usageTap";
import type { ProviderId } from "@/lib/usage/accounts";
import { engineOf } from "@/lib/env";
import { keyFor } from "@/lib/server/usageKeys";
import { nextUtcMidnight, noteRoute, takeUnoSlot } from "@/lib/server/usageLedger";
import { allLanes, type Lane } from "./lanes";
import { classOf, estimateTokens, type Priority, type WorkClass } from "./estimate";
import { classify, reroutable, type Verdict } from "./errors";
import { admit, laneWeight, score, SCARCE } from "./policy";
import { isReasoningDump, repairHead } from "@/lib/board/turnText";
import { bstate, recordOutcome, wakeAll, type Reservation } from "./state";
import { idleGuard } from "./idle";
import { isNetworkError, waitOnline } from "./online";

export type { WorkClass, Priority } from "./estimate";
export type { Lane } from "./lanes";

type Msg = { role: string; content?: unknown };

export class BrokerExhaustedError extends Error {
  code = "BROKER_EXHAUSTED";
  constructor(public nextReadyAt: number | null, public cls: WorkClass) {
    super(nextReadyAt ? `All free lanes are busy — next opens ${new Date(nextReadyAt).toISOString()}` : "All free lanes are used up for today");
    this.name = "BrokerExhaustedError";
  }
}
export const isBrokerExhausted = (e: unknown): e is BrokerExhaustedError => (e as { code?: string })?.code === "BROKER_EXHAUSTED";

export interface WaitInfo { until: number | null; reason: string; cls: WorkClass }

export interface AcquireSpec {
  agentId: string;
  purpose: string;
  maxOut: number;
  cls?: WorkClass;
  messages?: Msg[];
  estIn?: number;
  priority?: Priority;
  /** muda wa juu wa kusubiri nafasi (default: 8s; background 65s) */
  waitMs?: number;
  signal?: AbortSignal;
  /** broker anasubiri nafasi (UI: shimmer "anasubiri nafasi") · null = amepata */
  onWait?: (w: WaitInfo | null) => void;
  /** tuma include_reasoning kwa lanes zinazoitambua (streams za thinking) */
  reasoning?: boolean;
  allow?: ProviderId[];
  /** R18: kazi muhimu (script ya mwisho, ripoti) — inaruhusiwa kutumia requests za Flash zilizohifadhiwa (FLASH_RESERVE) */
  critical?: boolean;
  /** R21 · njia ya haraka (title/scope/agenda): lanes zinapangwa kwa kasi ya kujibu — policy.fastWeightOf */
  fast?: boolean;
  /** R21 · fast: hop ikizidi muda huu → lane inaachwa (bila adhabu) na ombi linahamia lane inayofuata. Default 90s. */
  fastTimeoutMs?: number;
  /** R26 · Gemini: reasoning_effort (thinking inakula max_tokens) — "low" kwa review/observer. Imethibitishwa: "none" → 400. */
  effort?: "low" | "medium" | "high";
}

export interface Lease {
  id: string;
  lane: Lane;
  model: string;
  provider: ProviderId;
  account: string;
  label: string;
  client: OpenAI;
  maxTokens: number;
  extraBody: Record<string, unknown>;
  cls: WorkClass;
  startedAt: number;
  done(usage?: { total_tokens?: number } | null): void;
  fail(err: unknown): Verdict & { reroute: boolean };
  /** R20: achilia lane bila adhabu wala mafanikio (mtandao wetu ulikatika — si kosa la provider) */
  release(): void;
}

export interface Run {
  next(): Promise<Lease>;
  readonly hops: number;
  readonly excluded: Set<string>;
}

/* ------------------------------------------------------------------ clients */

const g = globalThis as unknown as { __xmdBrokerClients?: Map<string, OpenAI> };
function clientFor(lane: Lane, key: string): OpenAI {
  const M = (g.__xmdBrokerClients ||= new Map());
  const k = `${lane.baseURL}|${key.slice(-12)}|${key.length}`;
  let c = M.get(k);
  if (!c) {
    c = new OpenAI({
      apiKey: key,
      baseURL: lane.baseURL,
      maxRetries: 0, // broker ndiye anayeamua kurudia/kuzungusha
      fetch: meteredFetch, // R20: kipimo moja kwa moja (next dev hurukia tap ya global)
      timeout: 10 * 60_000,
      defaultHeaders: lane.provider === "openrouter" ? { "HTTP-Referer": "https://professor-xmd.company", "X-Title": "PROFESSOR XMD COMPANY" } : undefined,
    });
    M.set(k, c);
  }
  return c;
}

/* ------------------------------------------------------------------ uchaguzi */

type Pick = { lane: Lane; maxTokens: number } | { waitUntil: number } | { exhausted: number | null };

function pick(cls: WorkClass, estIn: number, maxOut: number, agentId: string, excluded: Set<string>, deadline: number, allow?: ProviderId[], now = Date.now(), critical = false, fast = false): Pick {
  const S = bstate();
  const sticky = S.sticky.get(agentId);
  const stickyId = sticky && now - sticky.at < 10 * 60_000 ? sticky.laneId : undefined;
  const lanes = allLanes().filter((l) => !excluded.has(l.id) && laneWeight(cls, l, fast) > 0 && (!allow || allow.includes(l.provider)));
  let best: { lane: Lane; maxTokens: number; s: number; w: number } | null = null;
  const upcoming: { at: number; w: number }[] = [];
  for (const lane of lanes) {
    const a = admit(lane, estIn, maxOut, now, { critical });
    const w = laneWeight(cls, lane, fast);
    if (a.ok) {
      const s = score(lane, cls, a.headroom, stickyId, fast);
      if (!best || s > best.s) best = { lane, maxTokens: a.maxTokens, s, w };
    } else if (a.readyAt != null) upcoming.push({ at: a.readyAt, w });
  }
  if (best) {
    // lane bora iliyo wazi ni ya uzito mdogo (au ya provider adimu — OpenRouter), na bora zaidi itafunguka ndani
    // ya dirisha → subiri kidogo (thinking inaendelea kwenye UI; hakuna request adimu inayopotea)
    if ((best.w < 0.6 || SCARCE.includes(best.lane.provider)) && now < deadline) {
      const better = upcoming.filter((u) => u.w > best!.w && u.at <= deadline);
      if (better.length) return { waitUntil: Math.min(...better.map((u) => u.at)) };
    }
    return { lane: best.lane, maxTokens: best.maxTokens };
  }
  const soon = upcoming.filter((u) => u.at <= deadline);
  if (soon.length) return { waitUntil: Math.min(...soon.map((u) => u.at)) };
  return { exhausted: upcoming.length ? Math.min(...upcoming.map((u) => u.at)) : null };
}

const PRIO_DELAY: Record<Priority, number> = { live: 0, chat: 0, observer: 200, background: 500 };

function sleepOrWake(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const S = bstate();
    let t: ReturnType<typeof setTimeout> | undefined;
    const fin = () => { if (t) clearTimeout(t); S.waiters.delete(fin); signal?.removeEventListener("abort", fin); resolve(); };
    t = setTimeout(fin, Math.max(0, ms));
    S.waiters.add(fin);
    signal?.addEventListener("abort", fin, { once: true });
  });
}

function abortError(): Error {
  const e = new Error("aborted");
  e.name = "AbortError";
  return e;
}

/** Anza "run" ya ombi moja: kila next() ni hop mpya (lane iliyoshindwa haitumiki tena kwenye run hii). */
export function brokerRun(spec: AcquireSpec): Run {
  const excluded = new Set<string>();
  let hops = 0;
  const estIn = spec.estIn ?? (spec.messages ? estimateTokens(spec.messages) : 2000);
  const cls = classOf(estIn, spec.maxOut, spec.cls);
  const prio: Priority = spec.priority || (cls === "background" ? "background" : "chat");
  const windowMs = spec.waitMs ?? (cls === "background" ? 65_000 : 8_000);

  async function next(): Promise<Lease> {
    hops++;
    const S = bstate();
    const start = Date.now();
    const deadline = start + windowMs;
    const waitKey = `${spec.agentId}:${spec.purpose}:${start}:${Math.random().toString(36).slice(2, 6)}`;
    let waited = false;
    try {
      for (;;) {
        if (spec.signal?.aborted) throw abortError();
        const now = Date.now();
        const p = pick(cls, estIn, spec.maxOut, spec.agentId, excluded, deadline, spec.allow, now, !!spec.critical, !!spec.fast);
        if ("lane" in p) {
          if (waited) spec.onWait?.(null);
          return dispatch(p.lane, p.maxTokens);
        }
        if ("exhausted" in p) throw new BrokerExhaustedError(p.exhausted, cls);
        if (!waited) {
          waited = true;
          spec.onWait?.({ until: p.waitUntil, reason: "capacity", cls });
        }
        S.waiting.set(waitKey, { agentId: spec.agentId, since: start, until: p.waitUntil, purpose: spec.purpose });
        await sleepOrWake(Math.min(p.waitUntil, deadline) - Date.now() + PRIO_DELAY[prio], spec.signal);
        if (PRIO_DELAY[prio] && Date.now() < p.waitUntil) await new Promise((r) => setTimeout(r, PRIO_DELAY[prio]));
        if (Date.now() >= deadline + PRIO_DELAY[prio]) {
          // dirisha limeisha: jaribio la mwisho bila kusubiri
          const last = pick(cls, estIn, spec.maxOut, spec.agentId, excluded, 0, spec.allow, Date.now(), !!spec.critical, !!spec.fast);
          if ("lane" in last) { spec.onWait?.(null); return dispatch(last.lane, last.maxTokens); }
          throw new BrokerExhaustedError("waitUntil" in last ? last.waitUntil : "exhausted" in last ? last.exhausted : null, cls);
        }
      }
    } finally {
      S.waiting.delete(waitKey);
    }
  }

  function dispatch(lane: Lane, maxTokens: number): Lease {
    const S = bstate();
    const now = Date.now();
    const id = `L${++S.seq}`;
    const key = keyFor(lane.account, spec.agentId);
    const res: Reservation = { id, laneId: lane.id, account: lane.account, agentId: spec.agentId, tokens: estIn + maxTokens, start: now };
    S.leases.set(id, res);
    if (lane.provider === "openrouter") S.orMinute.set(lane.account, [...(S.orMinute.get(lane.account) || []), now]);
    if (lane.provider === "gemini") S.orMinute.set(lane.id, [...(S.orMinute.get(lane.id) || []), now]); // RPM ya kila model
    if (lane.provider === "unorouter") takeUnoSlot(lane.account as "uno-1" | "uno-2", lane.model);
    try { noteRoute([engineOf(spec.agentId)], lane.account, lane.model, true); } catch { /* */ }
    let settled = false;
    const settle = () => {
      if (settled) return false;
      settled = true;
      S.leases.delete(id);
      res.end = Date.now();
      S.recent.push(res);
      return true;
    };
    const extraBody: Record<string, unknown> = spec.reasoning && lane.reasoning ? { include_reasoning: true } : {};
    if (spec.effort && lane.provider === "gemini") extraBody.reasoning_effort = spec.effort;
    return {
      id, lane, model: lane.model, provider: lane.provider, account: lane.account, label: lane.label,
      client: clientFor(lane, key), maxTokens, extraBody, cls, startedAt: now,
      done() {
        if (!settle()) return;
        recordOutcome(lane.id, true, Date.now() - now);
        S.sticky.set(spec.agentId, { laneId: lane.id, at: Date.now() });
        wakeAll();
      },
      release() {
        if (settle()) wakeAll();
      },
      fail(err: unknown) {
        const v = classify(lane.provider, err);
        if (!settle()) return { ...v, reroute: reroutable(v.kind) };
        const t = Date.now();
        excluded.add(lane.id);
        switch (v.kind) {
          case "minute": S.busyUntil.set(lane.id, t + Math.max(3_000, v.waitMs ?? 20_000)); break;
          case "busy": S.busyUntil.set(lane.id, t + (v.waitMs ?? 60_000)); break;
          case "daily": S.disabled.set(lane.id, { until: v.untilMs ?? (v.waitMs ? t + v.waitMs : nextUtcMidnight(t)), reason: "daily" }); break;
          case "auth": S.disabled.set(lane.id, { until: v.untilMs ?? t + 6 * 3_600_000, reason: "auth" }); break;
          case "model": S.disabled.set(lane.id, { until: v.untilMs ?? nextUtcMidnight(t), reason: "model" }); break;
          default: break;
        }
        if (v.kind === "transient" || v.kind === "busy") recordOutcome(lane.id, false);
        console.warn(`[broker] ${lane.label} · ${spec.purpose} · ${v.kind}${v.waitMs ? ` ${Math.round(v.waitMs / 1000)}s` : ""} → ${reroutable(v.kind) ? "reroute" : "stop"} · ${v.message.slice(0, 140)}`);
        wakeAll();
        return { ...v, reroute: reroutable(v.kind) };
      },
    };
  }

  return { next, get hops() { return hops; }, excluded };
}

/* ------------------------------------------------------------------ non-stream helper */

export interface CompleteSpec extends AcquireSpec {
  messages: Msg[];
  temperature?: number;
  maxHops?: number;
  /** jibu tupu ni kosa (default: kweli) */
  requireText?: boolean;
  responseFormat?: unknown;
}
export interface CompleteResult { text: string; reasoning: string; usage: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number } | null; lane: Lane; hops: number }

/**
 * R16.1 — wito "usio wa stream" unatumwa KAMA stream ndani kwa ndani na kukusanywa: provider aliyekwama
 * anagunduliwa na idle guard (idle.ts) ndani ya sekunde, si baada ya dakika 10 za kimya.
 * Inarudisha umbo la jibu la kawaida la OpenAI (choices[0].message + usage) ili waitaji wasibadilike.
 */
async function collect(lease: Lease, body: Record<string, unknown>, parent?: AbortSignal): Promise<any> {
  const guard = idleGuard(parent);
  try {
    const s: any = await lease.client.chat.completions.create(
      {
        ...body,
        model: lease.model,
        max_tokens: lease.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
        ...lease.extraBody,
      } as any,
      { signal: guard.signal },
    );
    let text = "", reasoning = "", model = lease.model, finish: string | null = null;
    let usage: any = null;
    for await (const ch of s) {
      guard.touch();
      if (ch?.usage) usage = ch.usage;
      if (ch?.model) model = ch.model;
      const c = ch?.choices?.[0];
      if (!c) continue;
      const d = c.delta || {};
      const rc = d.reasoning_content ?? d.reasoning;
      if (typeof rc === "string") reasoning += rc;
      if (typeof d.content === "string") text += d.content;
      if (c.finish_reason) finish = c.finish_reason;
    }
    // SDK ya openai humeza AbortError na kumaliza loop kimya kimya — jibu nusu si jibu
    if (guard.signal.aborted) throw Object.assign(new Error("Request was aborted."), { partial: text });
    if (finish === "error") throw Object.assign(new Error("provider stream error"), { status: 502, partial: text });
    // R21: Uno ikigonga max_tokens ndani ya reasoning hurudisha MAWAZO kama content — si jibu → lane nyingine
    if (reasoning && isReasoningDump(text, reasoning)) throw Object.assign(new Error("reasoning returned as content"), { status: 502 });
    // R21: mwanzo wa jibu uliokatika na provider (".D DECISION", ".REE:") → neno kamili la kuanzia
    text = repairHead(text).text;
    return { model, choices: [{ index: 0, message: { role: "assistant", content: text, reasoning }, finish_reason: finish }], usage };
  } catch (e) {
    throw guard.wrap(e);
  } finally {
    guard.stop();
  }
}

export async function brokerComplete(spec: CompleteSpec): Promise<CompleteResult> {
  const run = brokerRun(spec);
  const max = spec.maxHops ?? 5;
  let lastErr: unknown = null;
  for (let hop = 0; hop < max; hop++) {
    const lease = await run.next();
    try {
      const r: any = await collect(
        lease,
        {
          messages: spec.messages as any,
          temperature: spec.temperature ?? 0.3,
          ...(spec.responseFormat ? { response_format: spec.responseFormat } : {}),
        },
        spec.signal,
      );
      const msg = r?.choices?.[0]?.message || {};
      const text = String(msg.content || "");
      const reasoning = String(msg.reasoning || "");
      if (spec.requireText !== false && !text.trim()) {
        const e: any = Object.assign(new Error("empty response"), { status: 502 });
        lease.fail(e);
        lastErr = e;
        continue;
      }
      lease.done(r?.usage);
      return { text, reasoning, usage: r?.usage ?? null, lane: lease.lane, hops: hop + 1 };
    } catch (e) {
      lastErr = e;
      // R20: mtandao wetu umekatika → subiri urudi, kisha jaribu tena (hop haihesabiwi, lane haiadhibiwi)
      if (isNetworkError(e)) {
        lease.release();
        if (await waitOnline(spec.signal)) { hop--; continue; }
        if (spec.signal?.aborted) throw e;
      }
      const v = lease.fail(e);
      if (!v.reroute) throw e;
    }
  }
  throw lastErr ?? new BrokerExhaustedError(null, classOf(0, spec.maxOut, spec.cls));
}

/**
 * Client ya OpenAI "bandia" (non-stream tu) kwa code inayopokea client (agenda, title): kila create() inapitia broker —
 * model/max_tokens/key zinachaguliwa na broker; makosa ya provider (na provider aliyekwama) yanazungushwa kimya kimya.
 */
export function brokerClient(base: Omit<AcquireSpec, "maxOut" | "messages" | "estIn">, onUsage?: (usage: any, lane: Lane) => void): OpenAI {
  const create = async (body: any, opts?: { signal?: AbortSignal }) => {
    if (body?.stream) throw new Error("brokerClient: stream haitumiki hapa — tumia brokerRun");
    const run = brokerRun({ ...base, messages: body.messages, maxOut: Number(body.max_tokens) || 2000, signal: opts?.signal ?? base.signal });
    const { model: _m, max_tokens: _x, stream: _s, ...rest } = body || {};
    let lastErr: unknown = null;
    const parent = opts?.signal ?? base.signal;
    for (let hop = 0; hop < 5; hop++) {
      const lease = await run.next();
      // R21 · fast: lane inayochelewa (mf. reasoning ndefu) inaachwa baada ya fastTimeoutMs → lane inayofuata.
      // Hops 3 za mwisho hazina kikomo (ombi lisishindwe kabisa); lane haiadhibiwi (si kosa lake — ni polepole tu).
      let slow = false;
      let slowTimer: ReturnType<typeof setTimeout> | undefined;
      let ctl: AbortController | undefined;
      const onParentAbort = () => ctl?.abort();
      if (base.fast && hop < 2) {
        ctl = new AbortController();
        if (parent?.aborted) ctl.abort();
        parent?.addEventListener("abort", onParentAbort, { once: true });
        const ms = base.fastTimeoutMs ?? 90_000;
        slowTimer = setTimeout(() => { slow = true; ctl?.abort(); }, ms);
      }
      try {
        const r: any = await collect(lease, rest, ctl ? ctl.signal : parent);
        const text = String(r?.choices?.[0]?.message?.content || "");
        if (!text.trim() && hop < 4) { lease.fail(Object.assign(new Error("empty response"), { status: 502 })); continue; }
        lease.done(r?.usage);
        if (r?.usage) onUsage?.(r, lease.lane);
        return r;
      } catch (e) {
        lastErr = e;
        if (slow && !parent?.aborted) {
          lease.release();
          run.excluded.add(lease.lane.id);
          console.warn(`[broker] ${lease.label} · ${base.purpose} · polepole (> ${Math.round((base.fastTimeoutMs ?? 90_000) / 1000)}s) → lane ya haraka inayofuata`);
          continue;
        }
        if (isNetworkError(e)) {
          lease.release();
          if (await waitOnline(opts?.signal ?? base.signal)) { hop--; continue; }
          if ((opts?.signal ?? base.signal)?.aborted) throw e;
        }
        if (!lease.fail(e).reroute) throw e;
      } finally {
        if (slowTimer) clearTimeout(slowTimer);
        parent?.removeEventListener("abort", onParentAbort);
      }
    }
    throw lastErr ?? new Error("LLM haikupatikana");
  };
  return { chat: { completions: { create } } } as unknown as OpenAI;
}

/* ------------------------------------------------------------------ kwa prompts / UI */

/** Mid-stream: jibu lilikatika baada ya maandishi → endelea kwenye lane nyingine bila kuanza upya. */
export function continuationMessages<T extends Msg>(messages: T[], partial: string, reason: "network" | "length" = "network"): Msg[] {
  // R26: jibu lililofika kikomo cha tokens (finish_reason=length) linaendelezwa pia — si kukatwa kimya kimya
  const why = reason === "length" ? "reached the output token limit" : "was cut off by a network error";
  return [
    ...messages,
    { role: "assistant", content: partial },
    { role: "user", content: `Your previous reply ${why}. Continue EXACTLY where you stopped — do not repeat anything already written, no preamble.` },
  ];
}

/** R27: kabla ya kuendeleza — ondoa neno lisilokamilika mwishoni (kikomo cha tokens kilikata "`#1C" → model ya pili
 *  ilianza upya "`1C1C1C`" → "`#1C`1C1C1C`"). Maandishi yanaishia kwenye nafasi → kuendeleza kunaanza neno zima. */
/**
 * R27: maandishi yanaishia KATIKATI (neno/sentensi) — si alama ya mwisho, si kichwa, si safu ya jedwali,
 * au fence ya code bado iko wazi. Inatumika tu pamoja na "stream bila finish_reason" (si peke yake).
 */
export function looksCut(text: string): boolean {
  const t = String(text || "").replace(/<think>[\s\S]*?<\/think>/gi, "").trimEnd();
  if (t.length < 200) return false;
  if (((t.match(/```/g) || []).length) % 2 === 1) return true;
  const last = t.split("\n").pop()!.trim();
  if (/^#{1,6}\s/.test(last) || /^\|.*\|$/.test(last) || /^(?:-{3,}|\*{3,})$/.test(last)) return false;
  return /[\p{L}\p{N},]$/u.test(t);
}

export function trimForContinuation(text: string): string {
  const t = String(text || "");
  if (/\s$/.test(t)) return t;
  const m = t.match(/\s(\S{1,40})$/);
  if (!m || t.length - m[1].length < 40) return t;
  return t.slice(0, t.length - m[1].length);
}

/** R27: unganisha prefix + continuation bila marudio (model ikirudia mwisho wa prefix, unaondolewa). */
export function joinContinuation(prefix: string, cont: string): string {
  let c = String(cont || "");
  if (!prefix) return c;
  if (/\s$/.test(prefix)) c = c.replace(/^[ \t]+/, "");
  const max = Math.min(300, prefix.length, c.length);
  for (let k = max; k >= 8; k--) {
    if (prefix.endsWith(c.slice(0, k))) { c = c.slice(k); break; }
  }
  return prefix + c;
}

/** Lane ambayo broker ANGECHAGUA sasa hivi (bila kuhifadhi) — badge ya model + prompts. */
export function peekLane(agentId: string, cls: WorkClass = "normal", estIn = 5000, maxOut = 2000): Lane | null {
  const p = pick(cls, estIn, maxOut, agentId, new Set(), 0);
  return "lane" in p ? p.lane : null;
}

export function brokerStatus() {
  const S = bstate();
  const now = Date.now();
  return {
    inflight: [...S.leases.values()].map((r) => ({ lane: r.laneId, agent: r.agentId, since: r.start })),
    waiting: [...S.waiting.values()],
    cooling: [...S.busyUntil.entries()].filter(([, t]) => t > now).map(([lane, until]) => ({ lane, until })),
    disabled: [...S.disabled.entries()].filter(([, d]) => d.until > now).map(([lane, d]) => ({ lane, ...d })),
  };
}
