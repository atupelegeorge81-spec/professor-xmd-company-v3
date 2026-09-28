// src/lib/brain/skills/tools/research-lookup.ts
// Port ya K-Dense research-lookup: scripts/manuscript_packet.py (canonicalize_url, normalize_title, extract_doi/pmid/year,
// classify_publication, evidence_quality, deduplicate_sources, reference_score) + scripts/research_lookup.py
// (ACADEMIC_FACETS, _query_with_context, _extract_citations_from_text).
// Imeongezwa: tiers za vyanzo vya software (MDN/W3C/web.dev/OWASP/IETF/NIST/framework docs = high; vendor/engineering
// blogs = moderate; forums/Medium = contextual; visivyojulikana = low). Inaendeshwa AUTOMATIC na mfumo (runTools.ts).

export interface SourceLike { title: string; url: string; content?: string }
export type Tier = "high" | "moderate" | "contextual" | "low" | "exclude";
export interface SourceClass { tier: Tier; kind: string; host: string; preprint: boolean; retracted: boolean; deprecated: boolean; year: string; doi: string; pmid: string; rationale: string }

const DOI_PATTERN = /(?:doi[:\s]*|https?:\/\/(?:dx\.)?doi\.org\/)?(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/i;
const PMID_PATTERN = /(?:pubmed\.ncbi\.nlm\.nih\.gov\/|pmid[:\s]*)(\d{6,9})/i;
const YEAR_PATTERN = /\b(19\d{2}|20\d{2})\b/;

export const SCHOLARLY_DOMAINS = [
  "pubmed.ncbi.nlm.nih.gov", "pmc.ncbi.nlm.nih.gov", "europepmc.org", "crossref.org", "api.crossref.org", "openalex.org",
  "semanticscholar.org", "arxiv.org", "biorxiv.org", "medrxiv.org", "nature.com", "science.org", "cell.com", "pnas.org",
  "nejm.org", "thelancet.com", "jamanetwork.com", "bmj.com", "springer.com", "link.springer.com", "wiley.com",
  "onlinelibrary.wiley.com", "sciencedirect.com", "ieee.org", "ieeexplore.ieee.org", "acm.org", "dl.acm.org", "nih.gov", "who.int",
];
const PREPRINT_DOMAINS = ["arxiv.org", "biorxiv.org", "medrxiv.org"];
// software: viwango na nyaraka rasmi
export const STANDARDS_DOMAINS = [
  "w3.org", "whatwg.org", "ietf.org", "rfc-editor.org", "datatracker.ietf.org", "owasp.org", "nist.gov", "ecma-international.org",
  "tc39.es", "iso.org", "unicode.org", "cheatsheetseries.owasp.org",
];
export const OFFICIAL_DOCS_DOMAINS = [
  "developer.mozilla.org", "web.dev", "developer.chrome.com", "react.dev", "nextjs.org", "nodejs.org", "typescriptlang.org",
  "vuejs.org", "angular.dev", "svelte.dev", "kit.svelte.dev", "python.org", "docs.python.org", "postgresql.org", "sqlite.org",
  "developer.apple.com", "developer.android.com", "learn.microsoft.com", "docs.github.com", "playwright.dev", "tailwindcss.com",
  "appwrite.io", "stripe.com", "vercel.com", "deno.com", "bun.sh", "vitejs.dev", "vite.dev", "expressjs.com", "fastify.dev",
  "prisma.io", "redis.io", "mongodb.com", "docker.com", "docs.docker.com", "kubernetes.io", "m3.material.io", "material.io",
  "caniuse.com", "webkit.org", "firefox-source-docs.mozilla.org", "v8.dev", "jestjs.io", "vitest.dev", "testing-library.com",
  "developer.safaricom.co.ke", "cloud.google.com", "aws.amazon.com", "docs.aws.amazon.com",
];
const RESEARCH_UX_DOMAINS = ["nngroup.com", "baymard.com", "gov.uk", "digital.gov", "a11yproject.com", "webaim.org", "deque.com"];
const MODERATE_DOMAINS = ["smashingmagazine.com", "css-tricks.com", "github.com", "npmjs.com", "infoq.com", "martinfowler.com", "stackoverflow.blog", "engineering.fb.com", "netflixtechblog.com", "blog.cloudflare.com", "github.blog", "joshwcomeau.com", "kentcdodds.com"];
const CONTEXTUAL_DOMAINS = ["stackoverflow.com", "stackexchange.com", "reddit.com", "medium.com", "dev.to", "hashnode.dev", "hashnode.com", "quora.com", "youtube.com", "news.ycombinator.com", "twitter.com", "x.com", "linkedin.com", "freecodecamp.org", "geeksforgeeks.org", "w3schools.com", "tutorialspoint.com", "wikipedia.org"];

const PUBLICATION_TYPES: [string, string[]][] = [
  ["systematic review", ["systematic review"]],
  ["meta-analysis", ["meta-analysis", "meta analysis"]],
  ["randomized controlled trial", ["randomized controlled trial", "randomised controlled trial", " rct "]],
  ["clinical trial", ["clinical trial"]],
  ["cohort study", ["cohort study", "prospective cohort", "retrospective cohort"]],
  ["case-control study", ["case-control", "case control"]],
  ["cross-sectional study", ["cross-sectional", "cross sectional"]],
  ["methods/protocol", ["protocol", "benchmark", "methodology", "methods paper"]],
  ["case report/series", ["case report", "case series"]],
  ["review", ["review"]],
];
const EVIDENCE_WEIGHTS: Record<string, number> = {
  "systematic review": 5, "meta-analysis": 5, "randomized controlled trial": 4, "clinical trial": 4, "cohort study": 3,
  "case-control study": 3, "cross-sectional study": 2, "methods/protocol": 2, review: 2, "case report/series": 1, "primary/other": 2,
};

/** Return a stable URL for deduplication without tracking parameters. */
export function canonicalizeUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url.trim());
    const keep = [...u.searchParams.entries()].filter(([k]) => !k.toLowerCase().startsWith("utm_") && !["ref", "source", "campaign", "fbclid", "gclid"].includes(k.toLowerCase()));
    const q = new URLSearchParams(keep).toString();
    const path = u.pathname.replace(/\/+$/, "") || "/";
    return `${u.protocol.toLowerCase()}//${u.host.toLowerCase()}${path}${q ? `?${q}` : ""}`;
  } catch {
    return url.trim();
  }
}
/** Normalize a title for conservative duplicate detection. */
export const normalizeTitle = (t: string) => String(t || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
export const extractDoi = (text: string) => (String(text || "").match(DOI_PATTERN)?.[1] || "").replace(/[.,;:)\]}]+$/, "").toLowerCase();
export const extractPmid = (text: string) => String(text || "").match(PMID_PATTERN)?.[1] || "";
export const extractYear = (text: string) => String(text || "").match(YEAR_PATTERN)?.[1] || "";
export const hostOf = (url: string) => {
  try { return new URL(url).host.toLowerCase().replace(/^www\./, ""); } catch { return ""; }
};
const inDomains = (host: string, list: string[]) => list.some((d) => host === d || host.endsWith(`.${d}`));

/** Classify publication type from explicit wording. */
export function classifyPublication(text: string): string {
  const lowered = ` ${String(text || "").toLowerCase()} `;
  for (const [type, terms] of PUBLICATION_TYPES) if (terms.some((t) => lowered.includes(t))) return type;
  return "primary/other";
}

/** Tier ya chanzo (transparent heuristic) — evidence_quality ya asili + tiers za software. */
export function classifySource(s: SourceLike): SourceClass {
  const url = canonicalizeUrl(s.url);
  const host = hostOf(url);
  const text = `${s.title || ""}\n${s.content || ""}`;
  const low = text.toLowerCase();
  const retracted = /\b(retracted|retraction notice|withdrawn)\b/.test(low);
  const deprecated = /\b(deprecated|no longer (supported|maintained)|obsolete|end[- ]of[- ]life|archived)\b/.test(low);
  const preprint = inDomains(host, PREPRINT_DOMAINS);
  const base = { host, preprint, retracted, deprecated, year: extractYear(text), doi: extractDoi(`${url}\n${text}`), pmid: extractPmid(`${url}\n${text}`) };
  if (retracted) return { ...base, tier: "exclude", kind: "retracted", rationale: "Source is marked as retracted or withdrawn." };
  let tier: Tier;
  let kind: string;
  let path = "";
  try { path = new URL(url).pathname; } catch { /* url mbovu */ }
  const docsLike = /^docs\./.test(host) || /\/docs?\//.test(path);
  if (inDomains(host, STANDARDS_DOMAINS) || /\/rfc\d{3,5}\b/.test(url)) { tier = "high"; kind = "standard/specification"; }
  else if (inDomains(host, OFFICIAL_DOCS_DOMAINS)) { tier = "high"; kind = "official documentation"; }
  else if (inDomains(host, SCHOLARLY_DOMAINS) || base.doi) {
    kind = classifyPublication(text);
    let w = EVIDENCE_WEIGHTS[kind] ?? 1;
    if (preprint) w = Math.max(1, w - 1);
    tier = w >= 4 ? "high" : w === 3 ? "moderate" : w === 2 ? "contextual" : "low";
    kind = `scholarly: ${kind}`;
  }
  else if (inDomains(host, RESEARCH_UX_DOMAINS)) { tier = "high"; kind = "research/guidance body"; }
  else if (inDomains(host, CONTEXTUAL_DOMAINS)) { tier = "contextual"; kind = "forum/community"; }
  else if (docsLike) { tier = "moderate"; kind = "documentation"; }
  else if (inDomains(host, MODERATE_DOMAINS) || /^(engineering|blog|tech)\./.test(host)) { tier = "moderate"; kind = "engineering/vendor blog"; }
  else { tier = "low"; kind = "unknown site"; }
  if (deprecated && tier !== "low") tier = tier === "high" ? "moderate" : "low";
  const rationale = `Classified as ${kind}${preprint ? "; preprint status lowers confidence pending peer review" : ""}${deprecated ? "; marked deprecated/obsolete" : ""}.`;
  return { ...base, tier, kind, rationale };
}

/** Merge duplicate records by DOI, PMID, canonical URL, or normalized title (≥20 chars). */
export function dedupeSources<T extends SourceLike>(sources: T[]): { unique: T[]; duplicates: number } {
  const merged: T[] = [];
  const keyToIndex = new Map<string, number>();
  let duplicates = 0;
  for (const raw of sources) {
    const url = canonicalizeUrl(raw.url);
    const text = `${raw.title || ""}\n${raw.content || ""}`;
    const doi = extractDoi(`${url}\n${text}`);
    const pmid = extractPmid(`${url}\n${text}`);
    const tk = normalizeTitle(raw.title);
    const keys = [doi && `doi:${doi}`, pmid && `pmid:${pmid}`, url && `url:${url}`, tk.length >= 20 && `title:${tk}`].filter(Boolean) as string[];
    const existing = keys.map((k) => keyToIndex.get(k)).find((x) => x !== undefined);
    if (existing === undefined) {
      merged.push(raw);
      for (const k of keys) keyToIndex.set(k, merged.length - 1);
      continue;
    }
    duplicates++;
    const cur = merged[existing];
    if (!cur.title && raw.title) cur.title = raw.title;
    if ((raw.content || "").length > (cur.content || "").length) cur.content = raw.content;
    for (const k of keys) keyToIndex.set(k, existing);
  }
  return { unique: merged, duplicates };
}

const TIER_SCORE: Record<Tier, number> = { high: 4, moderate: 3, contextual: 2, low: 1, exclude: 0 };
/** Sort by exclusion status, quality tier, and recency (reference_score) — stable. */
export function rankSources<T extends SourceLike>(sources: T[]): { ranked: T[]; classes: SourceClass[] } {
  const rows = sources.map((s, i) => ({ s, c: classifySource(s), i }));
  rows.sort((a, b) =>
    Number(b.c.tier !== "exclude") - Number(a.c.tier !== "exclude") ||
    TIER_SCORE[b.c.tier] - TIER_SCORE[a.c.tier] ||
    (Number(b.c.year) || 0) - (Number(a.c.year) || 0) ||
    a.i - b.i,
  );
  return { ranked: rows.map((r) => r.s), classes: rows.map((r) => r.c) };
}

export function tierSummary(classes: SourceClass[]): string {
  const n = (t: Tier) => classes.filter((c) => c.tier === t).length;
  const parts = [`high ${n("high")}`, `moderate ${n("moderate")}`, `contextual ${n("contextual")}`, `low ${n("low")}`];
  if (n("exclude")) parts.push(`excluded ${n("exclude")}`);
  const dep = classes.filter((c) => c.deprecated).length;
  if (dep) parts.push(`deprecated ${dep}`);
  const pre = classes.filter((c) => c.preprint).length;
  if (pre) parts.push(`preprint ${pre}`);
  return parts.join(" · ");
}

/** The evidence passes (ACADEMIC_FACETS) adapted to the Board: one focused query per facet. */
export const RESEARCH_FACETS: { id: string; objective: string; terms: string[] }[] = [
  { id: "recent-primary", objective: "recent primary sources: official documentation, specifications, peer-reviewed primary studies", terms: ["official documentation", "specification", "2026"] },
  { id: "reviews", objective: "reviews, consensus and standards", terms: ["standard", "guidelines", "best practices consensus"] },
  { id: "seminal", objective: "seminal and foundational publications", terms: ["original paper", "foundational"] },
  { id: "methods", objective: "methods, validation, benchmarks and mechanisms", terms: ["benchmark", "validation", "how it works"] },
  { id: "contradictory", objective: "contradictory, null, negative and limitation evidence", terms: ["limitations", "problems", "criticism"] },
];
/** Facet queries for a topic + optional context (_query_with_context). */
export function researchFacets(topic: string, context: { system?: string } = {}): { id: string; query: string }[] {
  const base = `${String(topic || "").replace(/\s+/g, " ").trim().slice(0, 160)}${context.system ? ` ${context.system}` : ""}`;
  const out = RESEARCH_FACETS.map((f) => ({ id: f.id, query: `${base} ${f.terms[0]}`.trim().slice(0, 200) }));
  out.push({ id: "companion", query: base.slice(0, 200) });
  return out;
}

/** DOIs + URLs cited in free text (_extract_citations_from_text). */
export function extractCitationsFromText(text: string): { type: "doi" | "url"; url: string; doi?: string }[] {
  const out: { type: "doi" | "url"; url: string; doi?: string }[] = [];
  const seen = new Set<string>();
  const doiRx = /(?:doi[:\s]*|https?:\/\/(?:dx\.)?doi\.org\/)(10\.\d{4,9}\/[-._;()/:A-Z0-9]+)/gi;
  for (const m of String(text || "").matchAll(doiRx)) {
    const d = m[1].replace(/[.,;:)\]}]+$/, "").toLowerCase();
    const url = `https://doi.org/${d}`;
    if (!seen.has(url)) { seen.add(url); out.push({ type: "doi", doi: d, url }); }
  }
  for (const m of String(text || "").matchAll(/https?:\/\/[^\s)\]>,"'`]+/gi)) {
    const url = canonicalizeUrl(m[0].replace(/[.,;:]+$/, ""));
    if (url && !seen.has(url)) { seen.add(url); out.push({ type: "url", url }); }
  }
  return out;
}
