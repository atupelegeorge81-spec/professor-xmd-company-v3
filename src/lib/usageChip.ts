// src/lib/usageChip.ts
// Usage (tokens/requests kwa kila agent) + muda wa mjadala huhifadhiwa ndani ya session
// kama chip iliyofichwa — ili Sessions page isome tokens halisi na resume iendeleze hesabu.

import type { SessionItem } from "./reports";

export interface UsageRec {
  requests: number;
  tokens: number;
  prompt: number;
  completion: number;
}
export type UsageMap = Record<string, UsageRec>;
/** R20: matumizi ya session kwa PROVIDER (xkiro/groq/openrouter/unorouter/gemini) — kulinganisha na Pulse */
export type ProviderUsage = Record<string, { requests: number; tokens: number }>;

export const USAGE_PREFIX = "__PROFESSOR_XMD_USAGE__:";
export const RESUME_PREFIX = "__PROFESSOR_XMD_RESUME_STATE__:";
const USAGE_ID = "__professor_xmd_usage__";
/** R26: brief kamili + Fact Sheet (board/factSheet.ts) — chip za ndani pia */
const BRIEF_PREFIX_R26 = "__PROFESSOR_XMD_BRIEF__:";
const FACTS_PREFIX_R26 = "__PROFESSOR_XMD_FACTS__:";

export const emptyUsage = (): UsageRec => ({ requests: 0, tokens: 0, prompt: 0, completion: 0 });

/** Chip za ndani (resume state, usage) hazionyeshwi wala hazirudiwi kwenye items. */
export function isHiddenChip(it: any): boolean {
  return (
    it?.kind === "chip" &&
    typeof it?.text === "string" &&
    (it.text.startsWith(USAGE_PREFIX) || it.text.startsWith(RESUME_PREFIX) || it.text.startsWith(BRIEF_PREFIX_R26) || it.text.startsWith(FACTS_PREFIX_R26))
  );
}

export function usageChipItem(usage: UsageMap, elapsedMs: number, byProvider?: ProviderUsage): SessionItem {
  return {
    kind: "chip",
    id: USAGE_ID,
    // byProvider ni hiari (R20) — chip za zamani hazina, na zinasomeka kama kawaida
    text: USAGE_PREFIX + JSON.stringify({ version: 1, usage, elapsedMs: Math.max(0, Math.round(elapsedMs)), ...(byProvider && Object.keys(byProvider).length ? { byProvider } : {}) }),
  };
}

export function readUsageChip(items: any[] | undefined): { usage: UsageMap; elapsedMs: number; byProvider?: ProviderUsage } | null {
  const it = [...(items || [])].reverse().find((x) => x?.kind === "chip" && typeof x?.text === "string" && x.text.startsWith(USAGE_PREFIX));
  if (!it) return null;
  try {
    const s = JSON.parse(it.text.slice(USAGE_PREFIX.length));
    const usage: UsageMap = {};
    for (const [k, v] of Object.entries<any>(s?.usage || {})) {
      usage[k] = {
        requests: Number(v?.requests) || 0,
        tokens: Number(v?.tokens) || 0,
        prompt: Number(v?.prompt) || 0,
        completion: Number(v?.completion) || 0,
      };
    }
    let byProvider: ProviderUsage | undefined;
    if (s?.byProvider && typeof s.byProvider === "object") {
      byProvider = {};
      for (const [k, v] of Object.entries<any>(s.byProvider)) byProvider[k] = { requests: Number(v?.requests) || 0, tokens: Number(v?.tokens) || 0 };
    }
    return { usage, elapsedMs: Number(s?.elapsedMs) || 0, ...(byProvider ? { byProvider } : {}) };
  } catch {
    return null;
  }
}
