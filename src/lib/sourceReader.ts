// src/lib/sourceReader.ts — READ_SOURCE: soma MAANDISHI KAMILI ya ukurasa wa web au PDF (si snippet ya search tu).
// R12: Board ilikwama zamu 40 kwa sababu agents waliona PDF rasmi ya Vodacom kwenye matokeo lakini hawakuweza kuisoma.
//   • HTML → cheerio (scripts/nav/footer zinaondolewa) · PDF → unpdf (ndani ya server, bila huduma ya nje)
//   • kinga ya SSRF: http(s) tu, hakuna localhost/IP za ndani · kikomo 8MB · timeout 20s · cache ya dakika 30
//   • excerpt: aya zinazohusiana zaidi na swali la agenda (au hati nzima ikiwa fupi)
import * as cheerio from "cheerio";

export interface ReadDoc { url: string; title: string; kind: "pdf" | "html" | "text"; text: string; chars: number; pages?: number; ms: number }
export interface ReadFail { url: string; error: string; ms: number }

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const TTL_MS = 30 * 60_000;
const MAX_TEXT = 60_000;

const g = globalThis as unknown as { __xmdReadCache?: Map<string, { at: number; doc: ReadDoc }> };
const cache: Map<string, { at: number; doc: ReadDoc }> = (g.__xmdReadCache ||= new Map());

export function cleanUrl(raw: string): string | null {
  const s = String(raw || "").trim().replace(/^<|>$/g, "").replace(/[)\].,;'"]+$/, "");
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase();
  // SOURCE_READER_ALLOW_PRIVATE=1 → kwa majaribio ya ndani (mock) TU; default imezimwa
  if (process.env.SOURCE_READER_ALLOW_PRIVATE === "1") { u.hash = ""; return u.toString(); }
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || /^(127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(h) || h === "::1" || h === "[::1]") return null;
  u.hash = "";
  return u.toString();
}

function htmlToText(html: string): { title: string; text: string } {
  const $ = cheerio.load(html);
  const title = ($("title").first().text() || $("h1").first().text() || "").replace(/\s+/g, " ").trim();
  $("script,style,noscript,svg,iframe,nav,footer,header,form,aside,[role=navigation],[aria-hidden=true]").remove();
  const root = $("main").length ? $("main") : $("article").length ? $("article") : $("body");
  const blocks: string[] = [];
  root.find("h1,h2,h3,h4,p,li,td,th,pre,blockquote,dt,dd").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > 1) blocks.push(el.tagName && /^h\d$/i.test(el.tagName) ? `## ${t}` : t);
  });
  let text = blocks.join("\n");
  if (text.length < 200) text = root.text().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
  return { title, text };
}

async function pdfToText(buf: Uint8Array): Promise<{ text: string; pages: number }> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(buf);
  const { totalPages, text } = await extractText(pdf, { mergePages: true });
  return { text: String(text || ""), pages: totalPages };
}

/** Soma URL moja (HTML/PDF/text). Haitupi — inarudisha ReadFail ikishindwa. */
export async function readSource(rawUrl: string): Promise<ReadDoc | ReadFail> {
  const t0 = Date.now();
  const url = cleanUrl(rawUrl);
  if (!url) return { url: String(rawUrl).slice(0, 200), error: "invalid or blocked URL", ms: 0 };
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.doc, ms: 0 };
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf;q=0.9,text/plain;q=0.8,*/*;q=0.5", "Accept-Language": "en-US,en;q=0.9,sw;q=0.8" },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    if (!res.ok) return { url, error: `HTTP ${res.status}`, ms: Date.now() - t0 };
    const len = Number(res.headers.get("content-length") || 0);
    if (len > MAX_BYTES) return { url, error: `too large (${Math.round(len / 1e6)}MB)`, ms: Date.now() - t0 };
    const ctype = (res.headers.get("content-type") || "").toLowerCase();
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return { url, error: "too large", ms: Date.now() - t0 };
    const isPdf = ctype.includes("pdf") || (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46); // %PDF
    let doc: ReadDoc;
    if (isPdf) {
      const { text, pages } = await pdfToText(buf);
      const name = decodeURIComponent(new URL(url).pathname.split("/").pop() || "document.pdf");
      doc = { url, title: name, kind: "pdf", text: text.slice(0, MAX_TEXT), chars: text.length, pages, ms: Date.now() - t0 };
    } else if (ctype.includes("html") || ctype.includes("xml") || !ctype) {
      const { title, text } = htmlToText(new TextDecoder("utf-8").decode(buf));
      doc = { url, title: title || new URL(url).hostname, kind: "html", text: text.slice(0, MAX_TEXT), chars: text.length, ms: Date.now() - t0 };
    } else if (ctype.startsWith("text/") || ctype.includes("json")) {
      const text = new TextDecoder("utf-8").decode(buf);
      doc = { url, title: new URL(url).pathname.split("/").pop() || url, kind: "text", text: text.slice(0, MAX_TEXT), chars: text.length, ms: Date.now() - t0 };
    } else {
      return { url, error: `unsupported content-type ${ctype.split(";")[0]}`, ms: Date.now() - t0 };
    }
    if (doc.text.trim().length < 40) return { url, error: "no readable text (scanned image or script-rendered page)", ms: Date.now() - t0 };
    cache.set(url, { at: Date.now(), doc });
    if (cache.size > 60) cache.delete(cache.keys().next().value as string);
    return doc;
  } catch (e: any) {
    return { url, error: e?.name === "TimeoutError" ? "timeout" : String(e?.message || e).slice(0, 120), ms: Date.now() - t0 };
  }
}

export const isReadFail = (r: ReadDoc | ReadFail): r is ReadFail => "error" in r;

/**
 * Excerpt ya kuingiza kwenye prompt: hati fupi → yote; ndefu → vipande vinavyohusiana zaidi na query
 * (vipande vya mistari ~12, vilivyopangwa kwa mpangilio wa asili ndani ya hati).
 */
export function excerptFor(doc: ReadDoc, query: string, maxChars = 7000): string {
  const text = doc.text.replace(/\n{3,}/g, "\n\n").trim();
  if (text.length <= maxChars) return text;
  const q = new Set((query.toLowerCase().match(/[a-z0-9][a-z0-9-]{2,}/g) || []));
  const lines = text.split("\n");
  const chunks: { i: number; t: string; s: number }[] = [];
  for (let i = 0; i < lines.length; i += 12) {
    const t = lines.slice(i, i + 12).join("\n");
    const low = t.toLowerCase();
    let s = 0;
    for (const w of q) if (low.includes(w)) s += 2;
    s += Math.min(6, (t.match(/\d[\d,.]*/g) || []).length / 4); // majedwali ya namba ni muhimu
    chunks.push({ i, t, s });
  }
  const keep = new Set<number>([0]); // mwanzo wa hati (kichwa/muktadha)
  let used = chunks[0]?.t.length || 0;
  for (const c of [...chunks].sort((a, b) => b.s - a.s)) {
    if (used + c.t.length > maxChars) continue;
    keep.add(c.i); used += c.t.length;
  }
  return chunks.filter((c) => keep.has(c.i)).map((c) => c.t).join("\n[…]\n");
}

/** Block ya prompt ya hati zilizosomwa kwa agenda hii. */
export function documentsBlock(docs: ReadDoc[], query: string, perDoc = 7000): string {
  if (!docs.length) return "";
  return `=== DOCUMENTS READ IN FULL FOR THIS ITEM (primary text — prefer these over search snippets; cite the URL) ===\n${docs
    .map((d) => `--- ${d.title} (${d.kind}${d.pages ? `, ${d.pages} page(s)` : ""}) · ${d.url}\n${excerptFor(d, query, perDoc)}`)
    .join("\n\n")}`;
}
