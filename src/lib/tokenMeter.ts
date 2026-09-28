// src/lib/tokenMeter.ts
// Token accounting ya kweli + live kwa kila call ya LLM.
//
// XKiro (na providers wengine wa OpenAI-compatible) hurudisha usage KWENYE FRAME YA
// MWISHO YENYE `choices: []` — ikiwa tu `stream_options.include_usage = true`.
// Parser inayosoma `choices[0]` kwanza huiruka frame hiyo, ndiyo maana tokens zilikuwa 0.
//
// Meter hii:
//   1. readUsage(chunk)  -> husoma usage kwenye frame yoyote (hata choices: []).
//   2. createLiveMeter() -> huhesabu tokens live kwa tokenizer (o200k) kila delta inapofika,
//                           ikituma makadirio kila ~300ms mpaka usage ya kweli ifike.
//   (calls zisizo za stream zinahesabiwa na usageTap — fetch ya kila provider — kupitia broker.)

import { countTokens } from "gpt-tokenizer";

export interface ExactUsage {
  prompt: number;
  completion: number;
  total: number;
  /** R26 (G): tokens za prompt zilizotoka cache ya provider (prompt_tokens_details.cached_tokens) — kipimo tu */
  cached?: number;
}

/** Husoma usage kutoka chunk/response yoyote ya OpenAI-compatible. */
export function readUsage(obj: unknown): ExactUsage | null {
  const u = (obj as { usage?: Record<string, unknown> } | null)?.usage;
  if (!u || typeof u !== "object") return null;
  const prompt = Number(u.prompt_tokens ?? u.input_tokens ?? 0) || 0;
  const completion = Number(u.completion_tokens ?? u.output_tokens ?? 0) || 0;
  const total = Number(u.total_tokens ?? 0) || prompt + completion;
  if (total <= 0) return null;
  const det = (u.prompt_tokens_details || u.input_tokens_details) as Record<string, unknown> | undefined;
  const cached = Number(det?.cached_tokens ?? u.cached_tokens ?? 0) || 0;
  return cached > 0 ? { prompt, completion, total, cached } : { prompt, completion, total };
}

function safeCount(text: string): number {
  if (!text) return 0;
  try {
    return countTokens(text);
  } catch {
    return Math.ceil(text.length / 4);
  }
}

/** Makadirio ya tokens za prompt (messages zote + overhead ya chat format). */
export function estimatePromptTokens(messages: Record<string, unknown>[]): number {
  let n = 3;
  for (const m of messages) {
    const c = m?.content;
    const text = typeof c === "string" ? c : Array.isArray(c) ? c.map((p: any) => p?.text || "").join("") : "";
    n += 4 + safeCount(text);
  }
  return n;
}

export interface LiveMeter {
  /** Ongeza delta (reasoning au content) kadri inavyofika. */
  add(delta: string): void;
  /** Hesabu ya sasa (makadirio). */
  snapshot(): ExactUsage;
  /** Tuma update ya mwisho mara moja na simamisha throttle. */
  stop(): void;
}

/**
 * Live meter kwa stream moja. onTick huitwa kwa throttle (default 300ms) wakati jibu
 * linaendelea kurudi, ili UI ionyeshe tokens zikipanda papo hapo.
 */
export function createLiveMeter(
  messages: Record<string, unknown>[],
  onTick: (u: ExactUsage) => void,
  throttleMs = 300,
): LiveMeter {
  const prompt = estimatePromptTokens(messages);
  let completion = 0;
  let pending = "";
  let last = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  const flushCount = () => {
    if (pending) {
      completion += safeCount(pending);
      pending = "";
    }
  };
  const emit = () => {
    timer = null;
    if (stopped) return;
    flushCount();
    last = Date.now();
    onTick({ prompt, completion, total: prompt + completion });
  };

  return {
    add(delta: string) {
      if (!delta || stopped) return;
      pending += delta;
      // Hesabu kwa vipande vya maneno kamili ili tokenizer isikate neno katikati.
      if (pending.length > 48) {
        const cut = pending.lastIndexOf(" ");
        if (cut > 0) {
          completion += safeCount(pending.slice(0, cut));
          pending = pending.slice(cut);
        }
      }
      const wait = throttleMs - (Date.now() - last);
      if (wait <= 0) emit();
      else if (!timer) timer = setTimeout(emit, wait);
    },
    snapshot() {
      flushCount();
      return { prompt, completion, total: prompt + completion };
    },
    stop() {
      if (timer) clearTimeout(timer);
      timer = null;
      stopped = true;
    },
  };
}
