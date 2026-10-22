// src/lib/imageSearch.ts — T36 (CEO 2026-10-22): agents wakijadili sehemu za kuona (hero, banners, galleries) wanaruhusiwa
// kutafuta PICHA HALISI za mfano mtandaoni. SearXNG yetu haina engines za picha (config: categories general/web/it/repos/q&a
// tu), kwa hiyo tunatumia API za bure zisizohitaji key: Wikimedia Commons (kwanza — picha zenye leseni huru, hotlink
// inaruhusiwa) → Openverse (akiba). Kila tokeo lina IMAGE_URL + ukubwa + leseni + mwandishi (credit) ili Computer
// aweze kuitumia moja kwa moja kwenye build.
import type { SearchResult } from "./search";

const UA = "ProfessorXMD/1.0 (board research; https://github.com/atupelegeorge81-spec)";
const strip = (s: string) => String(s || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();

/** "images: coffee farm" / "picha: ..." → "coffee farm" · vinginevyo null */
export function imageQueryOf(q: string): string | null {
  const m = String(q || "").match(/^\s*(?:images?|photos?|picha)\s*:\s*(.{3,200})$/i);
  return m ? m[1].trim() : null;
}

async function getJson(url: string, ms: number): Promise<any> {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: ctl.signal, cache: "no-store" });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}

export async function commonsImages(query: string, limit = 8): Promise<SearchResult[]> {
  const u = new URL("https://commons.wikimedia.org/w/api.php");
  Object.entries({
    action: "query", format: "json", origin: "*", generator: "search", gsrnamespace: "6", gsrsearch: `${query} filetype:bitmap`,
    gsrlimit: String(Math.min(20, limit * 2)), prop: "imageinfo", iiprop: "url|size|mime|extmetadata", iiurlwidth: "1600",
    iiextmetadatafilter: "LicenseShortName|Artist|ImageDescription",
  }).forEach(([k, v]) => u.searchParams.set(k, v));
  const d = await getJson(u.toString(), 15_000);
  const pages = Object.values(d?.query?.pages || {}) as any[];
  return pages
    .sort((a, b) => (a.index || 0) - (b.index || 0))
    .map((p) => ({ p, ii: p.imageinfo?.[0] }))
    .filter(({ ii }) => ii && /image\/(jpeg|png|webp)/i.test(ii.mime || "") && (ii.width || 0) >= 800)
    .slice(0, limit)
    .map(({ p, ii }) => {
      const md = ii.extmetadata || {};
      const lic = strip(md.LicenseShortName?.value) || "see page";
      const by = strip(md.Artist?.value).slice(0, 80) || "unknown";
      const desc = strip(md.ImageDescription?.value).slice(0, 160);
      const title = String(p.title || "").replace(/^File:/, "").replace(/\.\w+$/, "");
      return {
        title: `🖼️ ${title.slice(0, 90)} — ${ii.width}x${ii.height} · ${lic}`,
        url: ii.descriptionurl || ii.url,
        content: `IMAGE_URL: ${ii.thumburl || ii.url} · size ${ii.width}x${ii.height} · licence ${lic} · credit ${by} · source Wikimedia Commons${desc ? ` · ${desc}` : ""}`,
      };
    });
}

export async function openverseImages(query: string, limit = 8): Promise<SearchResult[]> {
  const u = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(query)}&page_size=${limit}`;
  const d = await getJson(u, 8_000);
  return (d?.results || [])
    .filter((r: any) => r?.url && (r.width || 0) >= 800)
    .map((r: any) => ({
      title: `🖼️ ${String(r.title || "image").slice(0, 90)} — ${r.width}x${r.height} · ${String(r.license || "").toUpperCase()} ${r.license_version || ""}`.trim(),
      url: r.foreign_landing_url || r.url,
      content: `IMAGE_URL: ${r.url} · size ${r.width}x${r.height} · licence ${String(r.license || "").toUpperCase()} ${r.license_version || ""} · credit ${String(r.creator || "unknown").slice(0, 80)} · source ${r.source || "Openverse"}`,
    }));
}

/** Picha za mfano: Commons kwanza; zikiwa chini ya 3 → Openverse. Hakuna cache (kila mradi unapata utafutaji wake). */
export async function searchImages(query: string, log?: (type: "info" | "success" | "warning", msg: string) => void, who = "Agent"): Promise<SearchResult[]> {
  const out: SearchResult[] = [];
  try {
    // Commons inahitaji maneno YOTE yalingane — swali refu likikosa, tunalegeza kwa kupunguza maneno ya mwisho (≥2)
    const words = query.split(/\s+/).filter(Boolean);
    let q = query;
    for (let n = words.length; n >= Math.min(2, words.length) && out.length < 3; n = n > 4 ? 4 : n - 1) {
      q = words.slice(0, n).join(" ");
      const have = new Set(out.map((x) => x.url));
      out.push(...(await commonsImages(q)).filter((x) => !have.has(x.url)));
      if (n <= 2) break;
    }
    log?.("success", `🖼️ ${who}: picha ${out.length} kutoka Wikimedia Commons ("${q.slice(0, 60)}")`);
  } catch (e: any) {
    log?.("warning", `⚠️ ${who}: Wikimedia Commons imeshindwa — ${String(e?.message || e).slice(0, 80)}`);
  }
  if (out.length < 3) {
    try {
      const ov = await openverseImages(query);
      const have = new Set(out.map((x) => x.url));
      out.push(...ov.filter((x: SearchResult) => !have.has(x.url)));
      log?.("info", `🖼️ ${who}: picha ${ov.length} kutoka Openverse`);
    } catch (e: any) {
      log?.("warning", `⚠️ ${who}: Openverse imeshindwa — ${String(e?.message || e).slice(0, 80)}`);
    }
  }
  return out.slice(0, 8);
}
