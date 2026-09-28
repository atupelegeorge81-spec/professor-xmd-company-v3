// src/lib/brain/searchPolicy.ts — search-first, kanuni moja kwa chat na board.
import type { Phase } from "./skills/selector";

export const MAX_SEARCH_RETRIES_DEFAULT = 10;

export function searchPolicyBlock(surface: "chat" | "board", phase: Phase): string {
  if (phase === "report" || phase === "assembly" || phase === "memory") return "";
  if (surface === "chat") {
    return `=== SEARCH-FIRST ===
- For anything current, factual, version-specific, price/benchmark/standard related, or that you are not sure about: verify with a web search BEFORE answering, then cite the sources.
- Do not search for greetings, opinions about Mkuu's own ideas, or things already in your memory/live context.`;
  }
  return `=== SEARCH-FIRST ===
- Evidence comes before claims. Use the evidence provided; if it is insufficient, outdated or conflicting, end with RESEARCH_REQUEST: <query> (plain keywords — no site:, OR, filetype: or quotes; they break the search engines).
- A promising source already in the list (official page, PDF, standard) → READ_SOURCE: <url> to read it in full. Reading beats re-searching.
- Never repeat a query that already ran for this item; the system skips near-duplicates.`;
}
