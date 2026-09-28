// src/lib/broker/errors.ts — kosa la provider → aina moja ya uamuzi (hakuna ujumbe wa quota unaofika UI).
//   size      → ombi ni kubwa mno kwa lane hii (Groq 413 / TPM, Uno 413, context) — ruka lane kwa ombi hili tu
//   minute    → kikomo cha dakika (Groq TPM/RPM, XKiro 429, Uno 1/dak) — lane inapumzika waitMs
//   daily     → kikomo cha siku (XKiro quota, Groq TPD/RPD, OpenRouter 50/siku, Uno bajeti) — weka kando mpaka reset
//   busy      → provider yuko busy upstream (OpenRouter provider_code, Uno get_channel_failed, Gemini 503) — pumzika 30–90s
//   auth      → 401/403/402 — zima lane
//   model     → model haipo (Uno model_not_found / 404) — zima lane mpaka kesho
//   transient → 5xx / mtandao / timeout — jaribu lane nyingine
//   (stalled — provider hakutuma data ndani ya muda wa idle.ts → busy 60s)
//   fatal     → 400 ya kweli (ombi baya) — hakuna maana kuzungusha
import type { ProviderId } from "@/lib/usage/accounts";
import { nextPacificMidnight, nextUtcMidnight, parseDuration, parseGemError } from "@/lib/server/usageLedger";
import { isStall } from "./idle";

export type ErrorKind = "size" | "minute" | "daily" | "busy" | "auth" | "model" | "transient" | "fatal" | "aborted";
export interface Verdict { kind: ErrorKind; waitMs?: number; untilMs?: number; message: string }

function headerOf(err: any, name: string): string | null {
  const h = err?.headers;
  if (!h) return null;
  if (typeof h.get === "function") return h.get(name);
  return h[name] ?? h[name.toLowerCase()] ?? null;
}

export function describe(err: any): { status: number | null; body: string } {
  const e = err?.error;
  const nestedCode = Number(e?.code);
  const status = Number(err?.status) || (Number.isFinite(nestedCode) && nestedCode >= 400 && nestedCode < 600 ? nestedCode : null);
  let body = "";
  try { body = [err?.message, typeof e === "string" ? e : JSON.stringify(e ?? {})].filter(Boolean).join(" "); } catch { body = String(err?.message || err); }
  return { status, body };
}

export function classify(provider: ProviderId, err: any): Verdict {
  const now = Date.now();
  // kukatwa na mwitaji (Stop ya chat / Detach ya Board): SDK hutupa APIUserAbortError ("Request was aborted.") au AbortError
  if (
    !isStall(err) && !err?.status &&
    (err?.name === "AbortError" || err?.constructor?.name === "APIUserAbortError" || /abort|cancel/i.test(String(err?.name || "")) || /request was aborted|operation was aborted/i.test(String(err?.message || "")))
  ) return { kind: "aborted", message: "aborted" };
  // R16.1: provider aliyekwama (idle.ts) → pumzisha lane 60s, zungusha kwenda nyingine
  if (isStall(err)) return { kind: "busy", waitMs: 60_000, message: String(err?.message || "stalled").slice(0, 240) };
  const { status, body } = describe(err);
  const msg = body.slice(0, 240);
  const retryAfter = parseDuration(headerOf(err, "retry-after"));

  if (provider === "gemini") {
    // R18 · Google: key mbaya = 400 (si 401) · 429 → QuotaFailure (…PerDay… / …PerMinute…) + retryDelay · 503 = "high demand"
    if (status === 400 && /API_KEY_INVALID|API key not valid|API key expired|PERMISSION_DENIED/i.test(body)) return { kind: "auth", message: msg };
    if (status === 429) {
      const e = parseGemError(429, body);
      if (e.kind === "daily") return { kind: "daily", untilMs: nextPacificMidnight(now), message: msg };
      return { kind: "minute", waitMs: e.waitMs ?? 20_000, message: msg };
    }
    if (status === 503 || /UNAVAILABLE|overloaded|high demand/i.test(body)) return { kind: "busy", waitMs: 30_000, message: msg };
  }

  if (status === 401 || status === 403) return { kind: "auth", message: msg };
  if (status === 402) return { kind: "auth", untilMs: nextUtcMidnight(now), message: msg };
  if (status === 413 || /request too large|context.?length|maximum context|too many tokens|prompt is too long/i.test(body)) {
    // Groq: "Request too large … on tokens per minute (TPM)" = ukubwa, SI kusubiri
    return { kind: "size", message: msg };
  }
  if (/model_not_found|model not found|does not exist|no endpoints found/i.test(body) || status === 404) return { kind: "model", untilMs: nextUtcMidnight(now), message: msg };

  if (status === 429) {
    if (provider === "groq") {
      if (/\(TPD\)|\(RPD\)|per day/i.test(body)) {
        const m = body.match(/try again in ([0-9hms.]+)/i);
        return { kind: "daily", waitMs: (m && parseDuration(m[1])) || 30 * 60_000, message: msg };
      }
      const m = body.match(/try again in ([0-9hms.]+)/i);
      return { kind: "minute", waitMs: retryAfter ?? ((m && parseDuration(m[1])) || 20_000), message: msg };
    }
    if (provider === "xkiro") {
      if (/free-model token quota|token quota|daily|per day/i.test(body)) return { kind: "daily", waitMs: 15 * 60_000, message: msg };
      return { kind: "minute", waitMs: retryAfter ?? 20_000, message: msg };
    }
    if (provider === "openrouter") {
      if (/temporarily rate-limited upstream|provider_code|upstream/i.test(body)) return { kind: "busy", waitMs: retryAfter ?? 60_000, message: msg };
      const rem = Number(headerOf(err, "x-ratelimit-remaining"));
      const resetRaw = Number(headerOf(err, "x-ratelimit-reset"));
      const reset = Number.isFinite(resetRaw) && resetRaw > 0 ? (resetRaw > 1e12 ? resetRaw : resetRaw * 1000) : 0;
      if (/per.?day|free-models-per-day|daily/i.test(body) || (rem === 0 && reset - now > 10 * 60_000)) return { kind: "daily", untilMs: reset > now ? reset : nextUtcMidnight(now), message: msg };
      return { kind: "minute", waitMs: retryAfter ?? (reset > now ? reset - now : 60_000), message: msg };
    }
    // unorouter
    if (/every\s+\d+\s*min|per.?minute|request\(s\) every|retry in/i.test(body) || retryAfter != null) return { kind: "minute", waitMs: retryAfter ?? 60_000, message: msg };
    if (/daily|per day|quota|budget/i.test(body)) return { kind: "daily", untilMs: nextUtcMidnight(now), message: msg };
    return { kind: "minute", waitMs: 60_000, message: msg };
  }
  if (status === 503 && /get_channel_failed|busy|overloaded|no available/i.test(body)) return { kind: "busy", waitMs: retryAfter ?? 90_000, message: msg };
  if (status === 400) return { kind: "fatal", message: msg };
  if (status && status >= 500) return { kind: "transient", message: msg };
  // mtandao / timeout / stream iliyokatika bila status
  return { kind: "transient", message: msg || "network" };
}

/** Kosa hili linaruhusu kuzungusha kwenda lane nyingine? */
export const reroutable = (k: ErrorKind) => k !== "fatal" && k !== "aborted";
