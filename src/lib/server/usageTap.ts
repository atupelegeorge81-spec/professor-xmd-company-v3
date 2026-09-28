// src/lib/server/usageTap.ts — KIPIMO KIMOJA cha kila wito wa LLM (Board, chat, memory, agenda, title…).
// R20: KIPIMO KIKUU ni `meteredFetch` — inapewa kila client wa broker moja kwa moja (broker.ts → new OpenAI({ fetch })).
//   Sababu (imethibitishwa): chini ya `next dev` Next.js inaweka fetch yake juu ya globalThis.fetch, kwa hiyo tap ya
//   global ilirukwa na pete za Uno/Groq/Gemini/OR tokens zilisoma 0 wakati kazi ilifanyika. meteredFetch haitegemei global.
//   Tap ya global (installUsageTap, kupitia src/instrumentation.ts) inabaki kama akiba kwa wito wowote usiopita broker,
//   na inaruka wito ambao meteredFetch imeshaupima (AsyncLocalStorage) — hakuna kuhesabu mara mbili.
// Kipimo kinaangalia majibu ya
// /chat/completions kwenda XKiro / Groq / OpenRouter / UnoRouter / Gemini (key zetu tu). Hakibadilishi request wala response:
//   • headers halisi (Groq x-ratelimit-*, OpenRouter X-RateLimit-*, Uno retry-after) → usageLedger
//   • `usage` ya jibu (JSON au frame ya mwisho ya stream) husomwa kutoka nakala (clone) ya body
//   • makosa (429 n.k.) → ujumbe halisi wa provider unasomwa (Limit/Used/try again in)
//   • agent gani alitumia akaunti gani + model gani (kwa uelewa wa agent — resources.ts)
import { AsyncLocalStorage } from "node:async_hooks";
import { keyInfo } from "./usageKeys";
import { type GemAcct, noteGemError, noteGemResult, noteGroqError, noteGroqHeaders, noteGroqTokens, noteOrError, noteOrResult, noteUnoError, noteUnoResult, noteXkiroError, noteXkiroTokens } from "./usageLedger";
import { ensureGroqLimits } from "./groqLimits";
import { orKeyProbeSoon } from "./orKeyProbe";

const MARK = Symbol.for("xmd.usageTap");
/** wito unaopimwa na meteredFetch — tap ya global inauruka (usihesabiwe mara mbili) */
// R20: singleton ya process NZIMA — Next inabundle module hii mara mbili (instrumentation + routes); ALS mbili tofauti
// zingefanya tap ya global isione alama ya meteredFetch → kila ombi lingehesabiwa mara mbili (imethibitishwa: Gemini 98 vs 62).
const METER_KEY = Symbol.for("xmd.usageTap.metering");
const gm = globalThis as unknown as { [METER_KEY]?: AsyncLocalStorage<boolean> };
const metering: AsyncLocalStorage<boolean> = gm[METER_KEY] ?? (gm[METER_KEY] = new AsyncLocalStorage<boolean>());

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return String((input as { url?: string })?.url || "");
}

function headersOf(input: unknown, init?: RequestInit): Headers {
  const h = new Headers((input as Request)?.headers || undefined);
  if (init?.headers) new Headers(init.headers as HeadersInit).forEach((v, k) => h.set(k, v));
  return h;
}

function bodyOf(init?: RequestInit): { model: string; stream: boolean } {
  try {
    const b = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    return { model: String(b?.model || ""), stream: !!b?.stream };
  } catch {
    return { model: "", stream: false };
  }
}

/** usage kutoka JSON au SSE (frame ya mwisho yenye usage — XKiro/Groq/OpenRouter/Uno hutuma `choices: []`). */
export function usageFromBody(text: string): { total: number; model?: string } | null {
  const pick = (o: any) => {
    const u = o?.usage || o?.x_groq?.usage;
    if (!u) return null;
    const total = Number(u.total_tokens ?? 0) || (Number(u.prompt_tokens ?? u.input_tokens ?? 0) + Number(u.completion_tokens ?? u.output_tokens ?? 0));
    return total > 0 ? { total, model: typeof o?.model === "string" ? o.model : undefined } : null;
  };
  const t = text.trim();
  if (t.startsWith("{")) { try { return pick(JSON.parse(t)); } catch { return null; } }
  const lines = t.split("\n").filter((l) => l.startsWith("data:") && l.includes("usage"));
  for (let i = lines.length - 1; i >= 0; i--) {
    try { const u = pick(JSON.parse(lines[i].slice(5).trim())); if (u) return u; } catch { /* frame isiyo kamili */ }
  }
  return null;
}

function observe(url: string, reqHeaders: Headers, init: RequestInit | undefined, res: Response): void {
  if (!/\/chat\/completions(\?|$)/.test(url)) return;
  const auth = reqHeaders.get("authorization") || "";
  const key = auth.replace(/^Bearer\s+/i, "").trim();
  const info = keyInfo(key);
  if (!info) return;
  const { model } = bodyOf(init);
  const acct = info.account;
  // noteRoute (agent → akaunti/model) inaandikwa na broker wakati wa kuchagua — hapa tunapima tu.

  if (info.provider === "groq") {
    void ensureGroqLimits();
    noteGroqHeaders(acct as "groq-1" | "groq-2", model, res.headers);
  }

  let copy: Response;
  try { copy = res.clone(); } catch { return; }
  void copy.text().then((text) => {
    if (!res.ok) {
      if (info.provider === "groq") noteGroqError(acct as "groq-1" | "groq-2", model, res.status, text);
      else if (info.provider === "xkiro") noteXkiroError(acct as "xkiro-1" | "xkiro-2", res.status, text);
      else if (info.provider === "openrouter") noteOrError(acct as "or-1" | "or-2", res.status, text, res.headers);
      else if (info.provider === "unorouter") noteUnoError(acct as "uno-1" | "uno-2", model, res.status, text, res.headers);
      else if (info.provider === "gemini") noteGemError("chat", model, res.status, text, acct as GemAcct);
      return;
    }
    const u = usageFromBody(text);
    if (info.provider === "openrouter") {
      // mid-stream error (data:{"error":{code:429}}) bila usage = ombi halikuhesabiwa kama jibu
      if (u) { noteOrResult(acct as "or-1" | "or-2", true, u.total); orKeyProbeSoon(acct as "or-1" | "or-2"); }
      else if (/"error"\s*:/.test(text)) noteOrError(acct as "or-1" | "or-2", 429, text, res.headers);
      return;
    }
    if (info.provider === "gemini") {
      // R18: Google inahesabu kila ombi lililofanikiwa dhidi ya RPD ya model hiyo (usage = hesabu ya tokens, taarifa tu)
      if (u || text.includes("choices")) noteGemResult("chat", model || u?.model || "unknown", true, u?.total ?? null, acct as GemAcct);
      return;
    }
    if (info.provider === "unorouter") {
      if (u) noteUnoResult(acct as "uno-1" | "uno-2", model || u.model || "unknown", true, u.total);
      return;
    }
    if (!u) return;
    if (info.provider === "groq") noteGroqTokens(acct as "groq-1" | "groq-2", model || u.model || "unknown", u.total);
    else if (info.provider === "xkiro") noteXkiroTokens(acct as "xkiro-1" | "xkiro-2", u.total);
  }).catch(() => { /* stream ilikatwa — hakuna usage */ });
}

/**
 * R20: fetch yenye kipimo — kwa clients wa broker (OpenAI SDK `fetch` option). Inafanya kazi kwenye `next dev` na `next start`.
 * Haibadilishi request wala response; inapima nakala (clone) ya jibu tu.
 */
export const meteredFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const res = await metering.run(true, () => globalThis.fetch(input as never, init));
  try { observe(urlOf(input), headersOf(input, init), init, res); } catch { /* kipimo kisivunje wito */ }
  return res;
}) as typeof fetch;

/** Weka tap mara moja kwa process (idempotent). */
export function installUsageTap(): void {
  const gf = globalThis as unknown as { fetch: typeof fetch & { [MARK]?: boolean } };
  if (!gf.fetch || gf.fetch[MARK]) return;
  const orig = gf.fetch;
  const tapped = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const res = await orig(input as never, init);
    if (!metering.getStore()) {
      try { observe(urlOf(input), headersOf(input, init), init, res); } catch { /* kipimo kisivunje wito */ }
    }
    return res;
  }) as typeof fetch & { [MARK]?: boolean };
  tapped[MARK] = true;
  gf.fetch = tapped;
}
