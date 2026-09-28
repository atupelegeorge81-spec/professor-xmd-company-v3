// src/lib/searchHygiene.ts — usafi wa query + kuchuja matokeo yasiyohusiana (R12).
// Log halisi: query zenye `site:a OR site:b`, `filetype:pdf` na "M-Pesa" (kwenye nukuu) zilirudisha
// "The Letter M", video za alfabeti na hospitali ya Texas — engines nyingi (bangs za SearXNG) haziielewi syntax hiyo.
//   cleanQuery()   → inaondoa OR/AND/filetype:/nukuu/mabano; site:domain → domain kama neno la kawaida
//   dropOffTopic() → tokeo lisilo na neno lolote la maana la query linaondolewa (kabla ya cache — halichafui cache)

const OPS = /\b(?:OR|AND|NOT)\b/g;
const STOP = new Set("the and for with from that this into your 2024 2025 2026 2027 site filetype inurl intitle pdf official latest current".split(" "));

export function cleanQuery(q: string): { query: string; changed: boolean; domains: string[] } {
  const raw = String(q || "");
  const domains: string[] = [];
  let s = raw.replace(/\bsite:\s*([a-z0-9.-]+\.[a-z]{2,})\S*/gi, (_m, d: string) => { domains.push(d.toLowerCase()); return ` ${d.replace(/^www\./, "")} `; });
  s = s
    .replace(/\b(?:filetype|inurl|intitle|intext|ext):\s*\S+/gi, " ")
    .replace(OPS, " ")
    .replace(/["“”'`()[\]{}|]/g, " ")
    .replace(/(^|\s)[-+](?=\w)/g, "$1") // -word / +word operators
    .replace(/\s+/g, " ")
    .trim();
  // domain moja inatosha (nyingi zinachanganya engines)
  if (domains.length > 1) {
    for (const d of domains.slice(1)) s = s.replace(new RegExp(`\\b${d.replace(/^www\./, "").replace(/\./g, "\\.")}\\b`, "i"), " ");
    s = s.replace(/\s+/g, " ").trim();
  }
  return { query: s || raw.trim(), changed: s !== raw.trim(), domains };
}

/** Maneno ya maana ya query (kwa kuchuja). "M-Pesa" → "m-pesa" + "mpesa" + "pesa". */
export function queryTerms(q: string): string[] {
  const out = new Set<string>();
  for (const w of String(q || "").toLowerCase().match(/[a-z0-9][a-z0-9.-]*[a-z0-9]/g) || []) {
    if (w.length < 3 || STOP.has(w) || /^\d+$/.test(w)) continue;
    out.add(w);
    if (w.includes("-")) { out.add(w.replace(/-/g, "")); for (const p of w.split("-")) if (p.length >= 4 && !STOP.has(p)) out.add(p); }
    if (w.includes(".")) { const base = w.split(".")[0]; if (base.length >= 4) out.add(base); }
  }
  return [...out];
}

export interface Hit { title: string; url: string; content: string }

/** Ondoa matokeo yasiyo na neno lolote la maana la query (title+snippet+url). Haiondoi yote kamwe. */
export function dropOffTopic<T extends Hit>(results: T[], query: string): { kept: T[]; dropped: T[] } {
  const terms = queryTerms(query);
  if (terms.length < 2 || !results.length) return { kept: results, dropped: [] };
  const need = terms.length >= 6 ? 2 : 1;
  const kept: T[] = [];
  const dropped: T[] = [];
  for (const r of results) {
    const hay = `${r.title} ${r.content} ${r.url}`.toLowerCase();
    const hits = terms.filter((t) => hay.includes(t)).length;
    (hits >= need ? kept : dropped).push(r);
  }
  // kama kila kitu kingeondolewa, rudisha vilivyo na angalau neno 1 (au vyote) — uamuzi ni wa agent
  if (!kept.length) {
    const soft = results.filter((r) => terms.some((t) => `${r.title} ${r.content} ${r.url}`.toLowerCase().includes(t)));
    return soft.length ? { kept: soft, dropped: results.filter((r) => !soft.includes(r)) } : { kept: results, dropped: [] };
  }
  return { kept, dropped };
}

/** Ondoa nakala (URL ileile) — ufunguo wa kipekee kwa UI na prompts. */
export function uniqueByUrl<T extends { url: string }>(arr: T[]): T[] {
  const seen = new Set<string>();
  return arr.filter((r) => {
    const k = String(r.url || "").replace(/[#?].*$/, "").replace(/\/$/, "").toLowerCase();
    if (!k || seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
