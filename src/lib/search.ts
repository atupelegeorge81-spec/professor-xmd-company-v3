import * as cheerio from "cheerio";
import { ID, Query } from "node-appwrite"; // helpers tu — R42.1: client ya Appwrite imeondolewa
import { databases, DB } from "./server/appwrite"; // Supabase façade (signature ileile)
import type { AgentEvent } from "./types";
import { MAX_SEARCH_RETRIES_DEFAULT } from "./brain/searchPolicy";
import { cleanQuery, dropOffTopic, uniqueByUrl } from "./searchHygiene";
import { GEMINI_EMBED_MODELS, GEMINI_NATIVE_URL } from "./env";
import { GEM_ACCOUNTS, type GemAccountId } from "./usage/accounts";
import { slotKeys } from "./server/usageKeys";
import { gemState, noteGemError, noteGemResult } from "./server/usageLedger";

export interface SearchResult { title: string; url: string; content: string; }

const CACHE_COLLECTION = process.env.SEARCH_CACHE_COLLECTION || "search_cache"; // R42.1: Supabase table
// R18: cache ya siku 7 (ilikuwa dakika 15 → docs zote zilikuwa zimekwisha muda = 0% hits)
const CACHE_TTL_SECONDS = Math.round((Number(process.env.SEARCH_CACHE_TTL_DAYS) || 7) * 86_400);
// R18 · Embeddings = Gemini TU (HuggingFace na UnoRouter zimeondolewa). Vector ya SWALI inalinganishwa na vector ya SWALI
// la zamani (taskType SEMANTIC_SIMILARITY, 768 dims). Kila model ni "space" yake — vectors za models tofauti HAZILINGANISHWI.
// Threshold kutoka jaribio halisi (jozi 8 EN/SW): 001 → zinazofanana ≥0.924 · zisizohusiana ≤0.827 ⇒ 0.88
//                                              embedding-2 → ≥0.830 · ≤0.758 ⇒ 0.80
const EMBED_DIMS = 768;
const THRESHOLDS: Record<string, number> = {
  "gemini-embedding-001": Number(process.env.SEARCH_CACHE_THRESHOLD_001) || 0.88,
  "gemini-embedding-2": Number(process.env.SEARCH_CACHE_THRESHOLD_2) || 0.8,
};
const thresholdOf = (model: string) => THRESHOLDS[model] ?? 0.85;
const spaceOf = (model: string) => `${model}@${EMBED_DIMS}`;
const shortEmbed = (model: string) => model.replace(/^gemini-/, "");
/** docs mpya kabisa za space hii zinazosomwa kwa kila ukaguzi (vector tu — results zinasomwa kwa hit pekee) */
const CACHE_SCAN_LIMIT = 300;
const SEARXNG_URL = process.env.SEARXNG_URL || "https://searxng-northflank.onrender.com";

// Engines ambazo agent atatumia moja kwa moja.
// ! syntax inaiambia SearXNG engines hizi zitumike.
const SEARXNG_ENGINES =
  "!bing !google !yandex !naver !seznam !github !stackoverflow";
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
// R10 search-first: retries kutoka env (default 10 — brain/searchPolicy.ts), backoff inayoongezeka (max 8s)
const MAX_SEARCH_RETRIES = Number(process.env.MAX_SEARCH_RETRIES) || MAX_SEARCH_RETRIES_DEFAULT;
const SEARCH_RETRY_DELAY_MS = 2000;
const MAX_SEARCH_QUERY_CHARS = 160;
const MAX_SEARCH_TERMS = 12;

function normalizeSearchQuery(input: string): string {
  // R12: OR/AND/filetype:/nukuu/site: nyingi zinavunja engines → zinasafishwa kwanza
  let q = cleanQuery(String(input || "")).query
    .replace(/\[SEARCH\]/gi, " ")
    .replace(/\[\/SEARCH\]/gi, " ")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Remove obvious prompt/instruction tails that are not search terms.
  q = q
    .replace(
      /\b(current|latest|best|official)\s+(technical\s+)?documentation\s+best\s+practices\b.*$/i,
      ""
    )
    .replace(/\bfor\s+(the\s+)?(project|agent|optimus|board\s*room)\b.*$/i, "")
    .trim();

  // If an agent accidentally sends a whole sentence/question,
  // keep the informative front portion instead of shipping the essay.
  if (q.length > MAX_SEARCH_QUERY_CHARS) {
    q = q
      .replace(/[?!.]+/g, " ")
      .replace(
        /\b(please|discuss|decide|create|give me|tell me|explain|describe|after your discussion|the ceo request|original request)\b/gi,
        " "
      )
      .replace(/\s+/g, " ")
      .trim();
  }

  // Search queries should be terms, not prose.
  const tokens = q
    .split(/\s+/)
    .map((x) => x.trim())
    .filter(Boolean)
    .slice(0, MAX_SEARCH_TERMS);

  q = tokens.join(" ").slice(0, MAX_SEARCH_QUERY_CHARS).trim();

  return q;
}


function emitLog(onEvent: ((e: AgentEvent) => void) | undefined, type: "info" | "success" | "warning" | "error" | "search", message: string) {
  if (onEvent) onEvent({ type: "log", entry: { id: Math.random().toString(36).slice(2, 9), timestamp: new Date().toLocaleTimeString("en-GB"), at: Date.now(), type, message } });
}

function cosineSimilarity(vecA: number[], vecB: number[]): number {
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < vecA.length; i++) { dotProduct += vecA[i] * vecB[i]; normA += vecA[i] * vecA[i]; normB += vecB[i] * vecB[i]; }
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

interface Embedded { vector: number[]; model: string; space: string; ms: number; account?: GemAccountId }

const unit = (v: number[]) => {
  let n = 0;
  for (const x of v) n += x * x;
  n = Math.sqrt(n) || 1;
  return v.map((x) => Math.round((x / n) * 1e6) / 1e6); // 6 decimals → ~7K chars kwa vector ya 768
};

/**
 * Gemini embedContent: (model, akaunti) ya kwanza iliyo tayari. Mpangilio: 001·key1 → 001·key2 → embedding-2·key1 →
 * embedding-2·key2 — model ileile kwenye project nyingine inabaki kwenye vector space ileile (`<model>@768`), kwa hiyo
 * cache inaendelea kulinganishwa. Kila ombi linahesabiwa kwenye ledger ya akaunti yake (embeddings PEKE YAKE, siku ya
 * Pacific). 429 ya dakika → (model, akaunti) inapumzika retryDelay; 429 ya siku → mpaka 10:00 Dar; 503 → 30s.
 */
export async function getEmbedding(text: string): Promise<Embedded> {
  const accts = GEM_ACCOUNTS.map((acct) => ({ acct, key: slotKeys(acct)[0] })).filter((a) => a.key);
  if (!accts.length) throw new Error("GEMINI_API_KEY_1 haipo");
  const multi = accts.length > 1;
  const errors: string[] = [];
  for (const model of GEMINI_EMBED_MODELS) {
    for (const { acct, key } of accts) {
      const tag = `${shortEmbed(model)}${multi ? `·k${acct.split("-")[1]}` : ""}`; // R41: k1..k4
      const now = Date.now();
      const st = gemState(acct).embed[model];
      if (st?.exhaustedUntil && st.exhaustedUntil > now) { errors.push(`${tag} imekwisha leo`); continue; }
      if (Math.max(st?.retryAt ?? 0, st?.busyUntil ?? 0) > now) { errors.push(`${tag} inapumzika`); continue; }
      const t0 = Date.now();
      try {
        const res = await fetch(`${GEMINI_NATIVE_URL}/models/${model}:embedContent`, {
          method: "POST",
          headers: { "x-goog-api-key": key, "Content-Type": "application/json" },
          body: JSON.stringify({ model: `models/${model}`, content: { parts: [{ text: text.slice(0, 6000) }] }, taskType: "SEMANTIC_SIMILARITY", outputDimensionality: EMBED_DIMS }),
          signal: AbortSignal.timeout(15_000),
          cache: "no-store",
        });
        const body = await res.text();
        if (!res.ok) {
          noteGemError("embed", model, res.status, body, acct);
          errors.push(`${tag} HTTP ${res.status}`);
          continue;
        }
        const values = JSON.parse(body)?.embedding?.values;
        if (!Array.isArray(values) || !values.length) { errors.push(`${tag} jibu tupu`); continue; }
        noteGemResult("embed", model, true, null, acct);
        return { vector: unit(values.map(Number)), model, space: spaceOf(model), ms: Date.now() - t0, account: acct };
      } catch (e) {
        errors.push(`${tag} ${String((e as Error)?.message || e).slice(0, 60)}`);
      }
    }
  }
  throw new Error(errors.join(" · ") || "hakuna model ya embedding");
}

export async function searchWeb(query: string, onEvent?: (e: AgentEvent) => void, agentName = "Agent"): Promise<SearchResult[]> {
  const searchQuery = normalizeSearchQuery(query);
  const normalizedQuery = searchQuery.trim().toLowerCase();
  emitLog(onEvent, "info", `🔍 ${agentName} anakagua Appwrite cache kwanza (Semantic Search)...`);
  const { hit: cachedMatch, emb } = await getCachedResultsSemantic(normalizedQuery, onEvent, agentName);
  if (cachedMatch) {
    emitLog(onEvent, "success", `✅ ${agentName} KAPATA kwenye Appwrite! Similarity: ${(cachedMatch.similarity * 100).toFixed(1)}% — data za zamani zinatosha, HAKUNA search mpya.`);
    emitLog(onEvent, "info", `📄 ${agentName}: swali la zamani lililomatch: "${cachedMatch.matchedQuery}"`);
    await incrementCacheHits(cachedMatch.docId, cachedMatch.currentHits);
    const { kept, dropped } = dropOffTopic(uniqueByUrl(cachedMatch.results), searchQuery);
    if (dropped.length) emitLog(onEvent, "info", `🧹 ${agentName}: matokeo ${dropped.length} ya cache hayahusiani na query — yameondolewa.`);
    return kept;
  }
  // R18: vector ya swali iliyokwisha kutengenezwa inatumika tena kuhifadhi (embedding 1 kwa search, si 2)
  return await doFreshSearch(searchQuery, normalizedQuery, onEvent, agentName, emb);
}

export async function searchWebDirect(query: string, onEvent?: (e: AgentEvent) => void, agentName = "Agent"): Promise<SearchResult[]> {
  emitLog(onEvent, "info", `🔄 [VERIFY] ${agentName} anarudi SearXNG MOJA KWA MOJA (hakuna Appwrite check — memory ya mjadala inatosha).`);
  const searchQuery = normalizeSearchQuery(query);
  return await doFreshSearch(searchQuery, searchQuery.trim().toLowerCase(), onEvent, agentName);
}

async function doFreshSearch(
  query: string,
  normalizedQuery: string,
  onEvent?: (e: AgentEvent) => void,
  agentName = "Agent",
  emb: Embedded | null = null,
): Promise<SearchResult[]> {
  const base = SEARXNG_URL.replace(/\/+$/, "");
  const searchQuery = `${SEARXNG_ENGINES} ${query}`;
    const url = `${base}/search?q=${encodeURIComponent(searchQuery)}`;

  let lastError: Error | null = null;

  for (let retry = 0; retry <= MAX_SEARCH_RETRIES; retry++) {
    const attempt = retry + 1;

    emitLog(
      onEvent,
      "search",
      `🌐 ${agentName} anawasha SearXNG engine... (attempt ${attempt}/${MAX_SEARCH_RETRIES + 1})`
    );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);

    try {
      const res = await fetch(url, {
        headers: {
          "User-Agent": BROWSER_UA,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-US,en;q=0.9",
        },
        signal: controller.signal,
        cache: "no-store",
      });

      if (!res.ok) {
        throw new Error(`Search request failed (HTTP ${res.status})`);
      }

      const html = await res.text();
      // R12: nakala + matokeo yasiyohusiana (mf. "The Letter M" kwa query ya M-Pesa) yanaondolewa KABLA ya cache
      const parsed = uniqueByUrl(parseHtml(html));
      const { kept: results, dropped } = dropOffTopic(parsed, query);
      if (dropped.length) {
        emitLog(onEvent, "info", `🧹 ${agentName}: matokeo ${dropped.length}/${parsed.length} hayahusiani na query — yameondolewa (${dropped.slice(0, 3).map((d) => d.title.slice(0, 40)).join(" · ")}).`);
      }

      emitLog(
        onEvent,
        "success",
        `📥 ${agentName}: matokeo ${results.length} KUTOKA SEARCH ENGINE.`
      );

      // R18: embedding ya swali ilishindikana kwenye ukaguzi wa cache → HAKUNA jaribio la pili (lingetumia quota bure)
      if (emb) emitLog(
        onEvent,
        "info",
        `💾 ${agentName} anasave vector + results kwenye Appwrite...`
      );

      if (emb) await saveToCacheSemantic(
        normalizedQuery,
        results,
        emb,
        onEvent,
        agentName
      );

      return results;
    } catch (error) {
      lastError = error instanceof Error
        ? error
        : new Error(String(error));

      emitLog(
        onEvent,
        "warning",
        `⚠️ ${agentName}: SearXNG attempt ${attempt}/${MAX_SEARCH_RETRIES + 1} imefeli — ${lastError.message.slice(0, 120)}`
      );

      if (retry < MAX_SEARCH_RETRIES) {
        emitLog(
          onEvent,
          "info",
          `⏳ ${agentName}: inasubiri ${Math.min(SEARCH_RETRY_DELAY_MS * (retry + 1), 8000) / 1000}s kabla ya retry #${retry + 1}...`
        );

        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(SEARCH_RETRY_DELAY_MS * (retry + 1), 8000))
        );
      }
    } finally {
      clearTimeout(timer);
    }
  }

  emitLog(
    onEvent,
    "error",
    `❌ ${agentName}: SearXNG imeshindwa baada ya retries ${MAX_SEARCH_RETRIES}.`
  );

  throw lastError || new Error("Search failed after retries");
}

type CacheHit = { results: SearchResult[]; docId: string; matchedQuery: string; currentHits: number; similarity: number };

async function getCachedResultsSemantic(query: string, onEvent?: (e: AgentEvent) => void, agentName = "Agent"): Promise<{ hit: CacheHit | null; emb: Embedded | null }> {
  if (!CACHE_COLLECTION) return { hit: null, emb: null };
  let emb: Embedded;
  try {
    emitLog(onEvent, "search", `🧠 ${agentName} anatuma swali kwenye Embedding Engine (Gemini)...`);
    emb = await getEmbedding(query);
    emitLog(onEvent, "info", `🧠 ${agentName} → Embedding: ${emb.account ? `Gemini ${emb.account.split("-")[1]}` : "Gemini"} · ${shortEmbed(emb.model)} · ${emb.vector.length} dims · ${emb.ms}ms`);
  } catch (error) {
    // hakuna embedding = hakuna ulinganisho wa cache → SearXNG moja kwa moja (si kosa la mtumiaji)
    emitLog(onEvent, "warning", `⚠️ ${agentName}: Embedding Engine haipatikani sasa (${String((error as Error)?.message || error).slice(0, 120)}) — cache inarukwa, SearXNG moja kwa moja.`);
    return { hit: null, emb: null };
  }
  try {
    const db = DB; // R42.1: Supabase
    const since = new Date(Date.now() - CACHE_TTL_SECONDS * 1000).toISOString();
    // R18 (bug ya 0%): zamani → docs 100 za ZAMANI kabisa (bila mpangilio) + TTL 15 min = zote zinarukwa.
    // Sasa: space ileile tu · bado hai (siku 7) · mpya kwanza · vector tu (results zinasomwa kwa hit pekee).
    const response = await databases.listDocuments(db, CACHE_COLLECTION, [
      Query.equal("space", emb.space),
      Query.greaterThan("created_at", since),
      Query.orderDesc("created_at"),
      Query.select(["$id", "query", "vector", "hits", "dims"]),
      Query.limit(CACHE_SCAN_LIMIT),
    ]);
    let best: any = null;
    let highest = 0;
    for (const doc of response.documents) {
      const d = doc as any;
      if (d.dims && Number(d.dims) !== emb.vector.length) continue;
      let v: number[];
      try { v = JSON.parse(d.vector); } catch { continue; }
      if (!Array.isArray(v) || v.length !== emb.vector.length) continue;
      const sim = cosineSimilarity(emb.vector, v);
      if (sim > highest) { highest = sim; best = d; }
    }
    const thr = thresholdOf(emb.model);
    if (best && highest >= thr) {
      const full = (await databases.getDocument(db, CACHE_COLLECTION, best.$id)) as any;
      return { hit: { results: JSON.parse(full.results), docId: best.$id, matchedQuery: best.query, currentHits: Number(best.hits) || 1, similarity: highest }, emb };
    }
    emitLog(onEvent, "warning", `❌ ${agentName} KAKOSA kwenye Appwrite — similarity ya juu: ${(highest * 100).toFixed(1)}% (threshold ${Math.round(thr * 100)}% · maswali ${response.documents.length} ya ${shortEmbed(emb.model)} ndani ya siku ${Math.round(CACHE_TTL_SECONDS / 86_400)}). Analazimika kuwasha engine.`);
    return { hit: null, emb };
  } catch (error) {
    console.error("❌ Appwrite Cache Error:", error);
    emitLog(onEvent, "error", `❌ ${agentName}: Appwrite cache error — ${String(error).slice(0, 120)}`);
    return { hit: null, emb };
  }
}

/** results ≤ 65,535 (attribute ya Appwrite): maelezo marefu yanafupishwa, orodha haikatwi katikati ya JSON. */
function resultsJson(results: SearchResult[]): string {
  let cap = 1200;
  let out = JSON.stringify(results);
  while (out.length > 65_000 && cap > 80) {
    cap = Math.floor(cap * 0.7);
    out = JSON.stringify(results.map((r) => ({ ...r, content: r.content.slice(0, cap) })));
  }
  return out;
}

async function saveToCacheSemantic(query: string, results: SearchResult[], emb: Embedded | null, onEvent?: (e: AgentEvent) => void, agentName = "Agent"): Promise<void> {
  if (!CACHE_COLLECTION || results.length === 0) return;
  try {
    let e: Embedded;
    try {
      e = emb ?? (await getEmbedding(query)); // searchWebDirect: hakuna vector bado
    } catch (embErr) {
      // R18: kosa la EMBEDDING (si la Appwrite) → onyo sahihi; search yenyewe imeshafanikiwa
      console.warn("⚠️ Cache save skipped (embedding):", String((embErr as Error)?.message || embErr).slice(0, 160));
      emitLog(onEvent, "warning", `⚠️ ${agentName}: Embedding Engine haipatikani sasa — matokeo hayakuhifadhiwa kwenye cache (${String((embErr as Error)?.message || embErr).slice(0, 90)})`);
      return;
    }
    const db = DB; // R42.1: Supabase
    const now = new Date().toISOString();
    const q = query.slice(0, 255);
    const data = {
      query: q, results: resultsJson(results), vector: JSON.stringify(e.vector), space: e.space, dims: e.vector.length,
      created_at: now, updated_at: now, hits: 1, ttl: CACHE_TTL_SECONDS,
    };
    try {
      await databases.createDocument(db, CACHE_COLLECTION, ID.unique(), data);
    } catch (err: any) {
      // index ya unique kwenye `query`: swali lilelile (lililokwisha muda / la model nyingine) → sasisha document iliyopo
      if (!(err?.code === 409 || /already exists|unique/i.test(String(err?.message)))) throw err;
      const ex = await databases.listDocuments(db, CACHE_COLLECTION, [Query.equal("query", q), Query.select(["$id"]), Query.limit(1)]);
      if (!ex.documents[0]) throw err;
      await databases.updateDocument(db, CACHE_COLLECTION, ex.documents[0].$id, data);
    }
    emitLog(onEvent, "success", `✅ ${agentName}: SAVE SUCCESS — vector (Gemini · ${shortEmbed(e.model)} · ${e.vector.length} dims) + results zimehifadhiwa Appwrite.`);
  } catch (error) {
    console.error("❌ Appwrite Save Error:", error);
    emitLog(onEvent, "error", `❌ ${agentName}: Appwrite save error — ${String((error as Error)?.message || error).slice(0, 120)}`);
  }
}

async function incrementCacheHits(docId: string, currentHits: number): Promise<void> {
  if (!CACHE_COLLECTION) return;
  try {
    await databases.updateDocument(DB, CACHE_COLLECTION, docId, { hits: currentHits + 1, updated_at: new Date().toISOString() });
  } catch (error) { console.error("❌ Cache Increment Error:", error); }
}

function parseHtml(html: string): SearchResult[] {
  const $ = cheerio.load(html);
  const results: SearchResult[] = [];
  const seen = new Set<string>();
  $("article.result").each((_, el) => {
    const link = $(el).find("h3 a").first();
    let url = (link.attr("href") || "").trim();
    if (!url) return;
    if (url.startsWith("//")) url = "https:" + url;
    else if (url.startsWith("/")) url = SEARXNG_URL.replace(/\/+$/, "") + url;
    if (!/^https?:\/\//i.test(url)) return;
    if (seen.has(url)) return;
    seen.add(url);
    const title = $(el).find("h3 a").first().text().replace(/\s+/g, " ").trim();
    let content = $(el).find("p.content").first().text().replace(/\s+/g, " ").trim();
    if (!content) content = $(el).find(".content").first().text().replace(/\s+/g, " ").trim();
    results.push({ title: title || url, url, content });
  });
  // R37 (C) → R38-RC2: kikomo kinarudi 10 (kilikuwa 12 tangu R37-C) — Board ilipunguza matumizi
  // ya tokens (dirisha la evidence 16→12 pia); ukurasa wa 1 wa SearXNG una matokeo mazuri ~10.
  return results.slice(0, 10);
}
