// src/lib/board/sourceDesk.ts — DAWATI LA HATI la agenda moja (R12): READ_SOURCE + usomaji wa moja kwa moja wa chanzo cha msingi.
//   • read(agent, url)  → agent aliomba (READ_SOURCE: <url>) — inaonekana kwenye stage kama tukio la search (📄)
//   • autoRead(agent, results, context) → baada ya search: chanzo cha MSINGI ambacho bado hakijasomwa (PDF/ukurasa wa
//     taasisi inayotajwa kwenye agenda, tovuti ya serikali, au tier "high") kinasomwa chenyewe — max 5 kwa agenda (R37).
//   • block(query) → "DOCUMENTS READ IN FULL" kwa prompt ya owner/chair.
import { readSource, isReadFail, documentsBlock, cleanUrl, type ReadDoc } from "../sourceReader";
import { classifySource } from "../brain/skills/tools/research-lookup";
import { brainLine } from "../brain/brainLog";
import type { SearchResult } from "../search";
import type { BoardEvent } from "../types";

type Blog = (type: "info" | "success" | "warning" | "error" | "api" | "search" | "system", msg: string) => void;

export interface DeskDeps {
  blog: Blog;
  bcast: (e: BoardEvent) => void;
  addMsg: (agentId: string) => string;
  setItemContent: (id: string, raw: string, sources?: SearchResult[]) => void;
}

const AUTO_MAX = 5; // R37 (C): deep-read 5 kwa agenda (zamani 3) — chanzo halisi > snippet; uwanja wa tokens unaruhusu
const GOV = /(^|\.)(go\.[a-z]{2}|gov|gov\.[a-z]{2}|gouv\.[a-z]{2}|gob\.[a-z]{2}|europa\.eu|who\.int|un\.org)$/i;
const AGGREGATOR = /(wikipedia|youtube|facebook|twitter|x\.com|linkedin|reddit|quora|scribd|medium|pinterest|amazon|dailymotion)\./i;

const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/** Je, tokeo hili ni chanzo cha MSINGI kwa muktadha huu? (alama; 0 = hapana) */
export function primaryScore(r: { url: string; title: string; content: string }, context: string): number {
  const host = hostOf(r.url);
  if (!host || AGGREGATOR.test(host)) return 0;
  const ctx = context.toLowerCase();
  const brand = host.split(".")[0];
  let s = 0;
  if (GOV.test(host)) s += 3;
  if (brand.length >= 4 && ctx.includes(brand)) s += 3; // tovuti ya taasisi inayotajwa (mf. vodacom.co.tz kwa "Vodacom")
  try { if (classifySource({ url: r.url, title: r.title, content: r.content } as any).tier === "high") s += 2; } catch { /* heuristic tu */ }
  if (/\.pdf($|\?)/i.test(r.url) || /\[pdf\]/i.test(r.title)) s += 1;
  return s >= 3 ? s : 0;
}

export function createSourceDesk(d: DeskDeps) {
  const docs: ReadDoc[] = [];
  const tried = new Set<string>();
  let autoCount = 0;

  async function read(agent: { id: string; name: string }, rawUrl: string, why: "request" | "auto"): Promise<ReadDoc | null> {
    const url = cleanUrl(rawUrl);
    if (!url) { d.blog("warning", brainLine("source.read", agent.name, [`URL batili/imezuiwa: ${String(rawUrl).slice(0, 80)}`])); return null; }
    const have = docs.find((x) => x.url === url);
    if (have) { d.blog("info", brainLine("source.read", agent.name, [`tayari imesomwa: ${have.title.slice(0, 60)}`])); return have; }
    if (tried.has(url)) return null;
    tried.add(url);
    const sid = d.addMsg(agent.id);
    d.bcast({ type: "search", id: sid, query: `📄 ${why === "auto" ? "auto-read" : "READ_SOURCE"} · ${hostOf(url)}` } as BoardEvent);
    const r = await readSource(url);
    if (isReadFail(r)) {
      d.blog("warning", brainLine("source.read", agent.name, [why, hostOf(url), `FAILED: ${r.error}`], r.ms));
      d.setItemContent(sid, `📄 Haikuweza kusomwa: ${url} (${r.error})`, []);
      d.bcast({ type: "msg_done", id: sid } as BoardEvent);
      return null;
    }
    docs.push(r);
    const src: SearchResult = { title: `📄 ${r.title}`, url: r.url, content: r.text.slice(0, 400) };
    d.bcast({ type: "sources", id: sid, sources: [src] } as BoardEvent);
    d.setItemContent(sid, `📄 Imesomwa kamili: ${r.title} (${r.kind}${r.pages ? `, kurasa ${r.pages}` : ""}, ${r.chars.toLocaleString("en-US")} chars)`, [src]);
    d.bcast({ type: "msg_done", id: sid } as BoardEvent);
    d.blog("success", brainLine("source.read", agent.name, [why, `${r.kind.toUpperCase()} ${hostOf(url)}`, r.pages ? `${r.pages} page(s)` : "", `${r.chars.toLocaleString("en-US")} chars`], r.ms));
    return r;
  }

  return {
    get docs() { return docs; },
    get count() { return docs.length; },
    read: (agent: { id: string; name: string }, url: string) => read(agent, url, "request"),
    /** Soma chenyewe chanzo bora cha msingi ambacho bado hakijasomwa (1 kwa wito). */
    async autoRead(agent: { id: string; name: string }, results: SearchResult[], context: string): Promise<ReadDoc | null> {
      if (autoCount >= AUTO_MAX) return null;
      const best = results
        .map((r) => ({ r, s: primaryScore(r, context) }))
        .filter((x) => x.s > 0 && !tried.has(cleanUrl(x.r.url) || x.r.url))
        .sort((a, b) => b.s - a.s)[0];
      if (!best) return null;
      autoCount++;
      return read(agent, best.r.url, "auto");
    },
    block: (query: string) => documentsBlock(docs, query),
  };
}

export type SourceDesk = ReturnType<typeof createSourceDesk>;
