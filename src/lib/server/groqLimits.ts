// src/lib/server/groqLimits.ts — limits HALISI za Groq (RPM/RPD/TPM/TPD kwa kila model) kutoka docs zao live.
// Headers za Groq zinatoa RPD na TPM tu (docs: "x-ratelimit-limit-tokens always refers to TPM"), kwa hiyo TPD
// inasomwa kutoka jedwali la https://console.groq.com/docs/rate-limits.md (markdown rasmi) — hakuna namba ndani ya code.
// Cache: saa 12 (inahifadhiwa kwenye ledger). 429 ya TPD ikileta "Limit N" → hiyo inashinda (usageLedger.noteGroqError).
import { ledger, setGroqLimits } from "./usageLedger";

const SRC = process.env.GROQ_LIMITS_URL || "https://console.groq.com/docs/rate-limits.md";
const TTL = 12 * 3_600_000;
const g = globalThis as unknown as { __groqLimitsPending?: Promise<void> | null };

/** "1K" → 1000 · "14.4K" → 14400 · "1.2M" → 1200000 · "-" → null */
export function parseQty(v: string): number | null {
  const s = String(v || "").replace(/\\/g, "").trim();
  const m = /^(\d+(?:\.\d+)?)\s*([KkMm]?)$/.exec(s);
  if (!m) return null;
  const n = Number(m[1]) * (m[2].toLowerCase() === "k" ? 1_000 : m[2].toLowerCase() === "m" ? 1_000_000 : 1);
  return Math.round(n);
}

/** Jedwali la markdown → { model: {rpm,rpd,tpm,tpd} } (safu zinatambuliwa kwa kichwa "MODEL ID | RPM | RPD | TPM | TPD"). */
export function parseLimitsTable(md: string) {
  const out: Record<string, { rpm: number | null; rpd: number | null; tpm: number | null; tpd: number | null }> = {};
  let cols: string[] | null = null;
  for (const line of md.split("\n")) {
    if (!line.trim().startsWith("|")) continue;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells[0]?.toUpperCase() === "MODEL ID") { cols = cells.map((c) => c.toUpperCase()); continue; }
    if (!cols || /^-+$/.test(cells[0] || "") || !cells[0]) continue;
    const at = (k: string) => { const i = cols!.indexOf(k); return i >= 0 ? parseQty(cells[i] || "") : null; };
    if (!/\//.test(cells[0]) && !/^[a-z0-9._-]+$/i.test(cells[0])) continue;
    out[cells[0]] = { rpm: at("RPM"), rpd: at("RPD"), tpm: at("TPM"), tpd: at("TPD") };
  }
  return out;
}

async function refresh(): Promise<void> {
  try {
    const r = await fetch(SRC, { headers: { "User-Agent": "professor-xmd/usage" }, cache: "no-store", signal: AbortSignal.timeout(10_000) });
    if (!r.ok) return;
    const models = parseLimitsTable(await r.text());
    if (Object.keys(models).length) setGroqLimits(SRC, models);
  } catch { /* offline → tunaendelea na za mwisho zilizohifadhiwa */ }
}

/** Hakikisha limits ziko (hazisubiriwi zaidi ya waitMs). */
export async function ensureGroqLimits(waitMs = 0): Promise<void> {
  const L = ledger();
  if (L.groqLimits && Date.now() - L.groqLimits.at < TTL) return;
  if (!g.__groqLimitsPending) g.__groqLimitsPending = refresh().finally(() => { g.__groqLimitsPending = null; });
  if (waitMs > 0) await Promise.race([g.__groqLimitsPending, new Promise((r) => setTimeout(r, waitMs))]);
}
