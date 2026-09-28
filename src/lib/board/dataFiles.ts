// src/lib/board/dataFiles.ts — R26 (Awamu 2): faili za data zinaandikwa na MFUMO kutoka Fact Sheet — si na LLM.
//
// R24: Megatron aliandika services.json yenye huduma 8 za KUBUNI (Steaming, Facial…) na bei tofauti, na ikapita.
// Sasa: services.json / hours.json / config.json zinazalishwa kwa code (bei ZILE ZILE, saa ZILE ZILE, placeholder ile ile).
// Agent akiandika faili hizo, block yake inabadilishwa na toleo la mfumo (enforceDataFiles). PURE — hakuna I/O.

import type { FactSheet } from "./factSheet";
import { parseBlocks, pathFromComment } from "./codeBlocks";

export interface DataFile { path: string; lang: "json"; content: string; what: string }

const pathIn = (brief: string, name: string, dflt: string) => {
  const m = String(brief || "").match(new RegExp("`((?:[\\w.-]+/)*" + name.replace(".", "\\.") + ")`"));
  return m ? m[1] : dflt;
};

/** R29: brief inaweza kutaja jina lingine la faili la orodha ya bei ("data iwe kwenye `src/data/menu.json`") —
 *  faili la mfumo liwe na jina HILO, vinginevyo agents wanaandika menu.json na kinga ya thamani haiioni kabisa. */
function servicesPath(brief: string): string {
  const exact = pathIn(brief, "services.json", "");
  if (exact) return exact;
  for (const line of String(brief || "").split("\n")) {
    if (!/menyu|menu|bei|huduma|bidhaa|prices?|services|products/i.test(line)) continue;
    const m = line.match(/`((?:[\w.-]+\/)*[\w.-]+\.json)`/);
    if (m && !/config|hours|saa/i.test(m[1])) return m[1];
  }
  return "src/data/services.json";
}

/** Fact Sheet → faili za data (tu zile ambazo data yake ipo). */
export function systemDataFiles(f: FactSheet | null | undefined, brief = ""): DataFile[] {
  if (!f) return [];
  const out: DataFile[] = [];
  if (f.services.length) {
    out.push({
      path: servicesPath(brief),
      lang: "json",
      what: `huduma ${f.services.length} na bei zake`,
      content: JSON.stringify(f.services.map((s) => ({ name: s.name, price: s.amount })), null, 2),
    });
  }
  if (f.hours.length) {
    out.push({
      path: pathIn(brief, "hours.json", "src/data/hours.json"),
      lang: "json",
      what: `saa ${f.hours.length} za kazi`,
      content: JSON.stringify({ hours: [
        ...f.hours.map((h) => ({ days: h.days, time: h.time, open: h.open, close: h.close })),
        ...(f.closed || []).map((d) => ({ days: d, closed: true })), // R28: "Jumapili: IMEFUNGWA" — ipo kwenye faili, si kwenye component
      ] }, null, 2),
    });
  }
  if (f.name || f.address || f.phone) {
    const cfg: Record<string, unknown> = {};
    if (f.name) cfg.name = f.name;
    if (f.address) cfg.address = f.address;
    if (f.phone) { cfg.whatsappNumber = f.phone.value; cfg.phone = f.phone.value; }
    if (f.currency) cfg.currency = f.currency;
    if (f.email && !f.email.forbidden && f.email.value) cfg.email = f.email.value;
    out.push({ path: f.phone?.file && /\.json$/i.test(f.phone.file) ? f.phone.file : pathIn(brief, "config.json", "src/data/config.json"), lang: "json", what: "jina, anwani na namba", content: JSON.stringify(cfg, null, 2) });
  }
  return out;
}

/** Block ya prompt: faili hizi TAYARI zipo — zi-import, usiandike thamani zake upya. */
export function dataFilesBlock(files: DataFile[]): string {
  if (!files.length) return "";
  return [
    "=== SYSTEM DATA FILES (built by the system from DATA RASMI — import/read them; if your task includes one of these files you MAY use your own field names/structure (e.g. the schema the Board locked), but every value — names, prices, times, phone — must be EXACTLY these, with nothing added. Code verifies this; a file with wrong, missing or extra values is replaced by the version below) ===",
    ...files.map((d) => `// ${d.path}\n${d.content}`),
  ].join("\n");
}

const baseName = (p: string) => p.split("/").pop()!.toLowerCase();

/**
 * Block ya agent yenye njia ya faili la mfumo (au JSON ya huduma isiyo na njia) → inabadilishwa na toleo la mfumo.
 * Hurudisha maandishi mapya + faili zilizobadilishwa.
 */
export function enforceDataFiles(text: string, files: DataFile[]): { text: string; replaced: string[]; kept: { path: string; content: string }[] } {
  if (!files.length || !/```/.test(text || "")) return { text, replaced: [], kept: [] };
  const replaced: string[] = [];
  const kept: { path: string; content: string }[] = [];
  const blocks = parseBlocks(text);
  let out = String(text);
  for (const b of blocks) {
    const p = b.path ? baseName(b.path) : null;
    let target = p ? files.find((d) => baseName(d.path) === p) : undefined;
    if (!target && !b.path && b.lang === "json") {
      // JSON bila njia: ni orodha ya huduma kama ina name+price
      if (/"name"\s*:/.test(b.body) && /"price"\s*:/.test(b.body)) target = files.find((d) => /services\.json$/i.test(d.path));
    }
    if (!target) continue;
    if (target.lang === "json" && agentVersionOk(b.body, target.content)) { // R28: muundo wa agent unaheshimiwa — thamani zimehakikiwa kwa code
      const j = parseJsonBody(b.body);
      if (j !== undefined) kept.push({ path: target.path, content: JSON.stringify(j, null, 2) });
      continue;
    }
    const first = b.body.split("\n")[0];
    const keepHead = pathFromComment(first) && target.lang !== "json" ? `${first}\n` : "";
    const next = `${keepHead}${target.content}`;
    if (b.body.trim() === next.trim()) continue;
    const idx = out.indexOf(b.body);
    if (idx < 0) continue;
    out = out.slice(0, idx) + next + out.slice(idx + b.body.length);
    replaced.push(target.path);
  }
  return { text: out, replaced: [...new Set(replaced)], kept };
}

// ─── R28: uhakiki wa THAMANI (si muundo) ───────────────────────────────────────────────
// Run ya R28: Board ililock schema {id,name,priceTZS,description,priceNote}, mfumo ukaibadilisha kuwa {name,price}
// → reviewer akakataa (haiendani na uamuzi) na huduma.astro ingesoma `priceTZS` isiyokuwepo (bei zisingeonekana).
// Sasa: toleo la agent LINABAKI kama kila thamani rasmi ipo, imeoanishwa sahihi (bei ↔ huduma), na hakuna ya kubuni.

type Atoms = { words: Set<string>; codes: Set<string> };
const PHONE = /\+?\d[\dX]{6,}X[\dX]*|\+?\d{9,}/gi;           // 2557XXXXXXXX · 255712345678
const TIME = /\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/g;
const MONEY = /\b\d{1,3}(?:[,.\s]\d{3})+\b|\b\d{4,}\b/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.]+/;

function leavesOf(v: unknown, out: string[] = []): string[] {
  if (v == null) return out;
  if (typeof v === "string" || typeof v === "number") out.push(String(v));
  else if (Array.isArray(v)) v.forEach((x) => leavesOf(x, out));
  else if (typeof v === "object") Object.values(v as Record<string, unknown>).forEach((x) => leavesOf(x, out));
  return out;
}
function atomsOf(v: unknown): Atoms {
  const words = new Set<string>(), codes = new Set<string>();
  for (let s of leavesOf(v)) {
    s = s.replace(PHONE, (m) => { codes.add("p:" + m.replace(/^\+/, "").toUpperCase()); return " "; });
    s = s.replace(TIME, (_m, h, mi) => { codes.add(`t:${h.padStart(2, "0")}:${mi}`); return " "; });
    s = s.replace(MONEY, (m) => { codes.add("m:" + m.replace(/\D/g, "")); return " "; });
    for (const w of s.toLowerCase().match(/\p{L}{3,}/gu) || []) words.add(w);
  }
  return { words, codes };
}
const sub = <T>(a: Set<T>, b: Set<T>) => [...a].every((x) => b.has(x));
const arrOf = (v: unknown): unknown[] | null =>
  Array.isArray(v) ? v : v && typeof v === "object" ? ((Object.values(v as object).find(Array.isArray) as unknown[]) || null) : null;

// R29 (Bakery A2): Board ililock menu.json iliyopangwa kwa makundi — {categories:[{title, note, items:[{name, priceTZS}]}]}.
// arrOf ilichukua `categories` (2) ≠ bidhaa 8 → toleo sahihi likabadilishwa na orodha tupu → code isingeweza kufuata uamuzi.
// Sasa: vipengele vya ndani (leaf items) vinakusanywa kutoka kila kundi; thamani zinakaguliwa vile vile.
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);
function leafItems(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.flatMap((x) => (isObj(x) || Array.isArray(x) ? leafItems(x) : [x]));
  if (!isObj(v)) return [v];
  const nested = Object.values(v).filter((x) => Array.isArray(x) && x.some((y) => isObj(y) || Array.isArray(y)));
  return nested.length ? nested.flatMap((x) => leafItems(x)) : [v];
}

function parseJsonBody(body: string): unknown {
  const t = String(body || "").split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n").trim();
  try { return JSON.parse(t); } catch { return undefined; }
}

/** Toleo la agent linakubalika? (JSON halali · thamani zote rasmi zipo · jozi sahihi · hakuna bei/saa/namba/barua pepe ya kubuni) */
export function agentVersionOk(agentBody: string, systemContent: string): boolean {
  const ag = parseJsonBody(agentBody);
  let sys: unknown;
  try { sys = JSON.parse(systemContent); } catch { return false; }
  if (ag === undefined || ag === null || typeof ag !== "object") return false;
  if (EMAIL.test(leavesOf(ag).join(" ")) && !EMAIL.test(leavesOf(sys).join(" "))) return false;
  const A = atomsOf(ag), S = atomsOf(sys);
  if (!sub(A.codes, S.codes) || !sub(S.codes, A.codes)) return false;   // hakuna ya kubuni, hakuna inayokosekana
  if (!sub(S.words, A.words)) return false;                             // majina/anwani/siku zote zipo
  const sa = arrOf(sys);
  if (sa) {
    const top = arrOf(ag);
    const aa = top ? leafItems(ag) : null;
    if (!aa || aa.length < sa.length) return false;
    const priced = sa.some((o) => [...atomsOf(o).codes].some((c) => c.startsWith("m:")));
    if (priced && aa.length !== sa.length) return false;                // huduma: idadi ile ile (hakuna ya ziada)
    const used = new Set<number>();
    for (const o of sa) {
      const O = atomsOf(o);
      const i = aa.findIndex((a, k) => {
        if (used.has(k)) return false;
        const X = atomsOf(a);
        return sub(O.words, X.words) && sub(O.codes, X.codes) && sub(X.codes, O.codes);
      });
      if (i < 0) return false;                                          // bei imehamishiwa huduma nyingine, au kitu kimekosekana
      used.add(i);
    }
    // saa: kipengele cha ziada (mf. "Jumapili: imefungwa") kinaruhusiwa tu kikiwa HAKINA saa/bei/namba yoyote
    if (aa.some((a, k) => !used.has(k) && atomsOf(a).codes.size > 0)) return false;
  }
  return true;
}

// ─── R28: marejeo ya field kwenye faili za data ─────────────────────────────────────────
// Run ya R28 (Agenda 4): reviewer alilazimisha "saa kutoka config.json" → code ikawa `configData.hours.map(…)`,
// lakini config.json HAINA `hours` → saa zisingeonekana. Sasa: kila `X.key` (X = import ya faili la data) na
// `item.key` ndani ya X.map(item => …) vinakaguliwa dhidi ya keys halisi za faili (bila LLM).
export interface DataRefHit { file: string; ref: string; keys: string[] }
const ARR_M = new Set(["map", "filter", "forEach", "find", "findIndex", "some", "every", "reduce", "slice", "length", "sort", "flatMap", "includes", "indexOf", "at", "concat", "join", "entries", "keys", "values", "toSorted"]);
const OBJ_M = new Set(["hasOwnProperty", "toString", "valueOf"]);

export function dataRefHits(text: string, files: DataFile[]): DataRefHit[] {
  const hits: DataRefHit[] = [];
  const src = String(text || "");
  const push = (h: DataRefHit) => { if (!hits.some((x) => x.ref === h.ref && x.file === h.file)) hits.push(h); };
  for (const m of src.matchAll(/import\s+(\w+)\s+from\s+['"][^'"]*?([\w.-]+\.json)['"]/g)) {
    const v = m[1], fname = m[2].toLowerCase();
    const f = files.find((d) => baseName(d.path) === fname);
    if (!f) continue;
    let data: unknown;
    try { data = JSON.parse(f.content); } catch { continue; }
    const topKeys = Array.isArray(data) ? [] : Object.keys((data as object) || {});
    const itemKeys = (arr: unknown): string[] | null => Array.isArray(arr) && arr.length && arr.every((x) => x && typeof x === "object" && !Array.isArray(x))
      ? [...new Set(arr.flatMap((x) => Object.keys(x as object)))] : null;
    // (a) X.key
    for (const r of src.matchAll(new RegExp(`(?<![\\w.$/'"\\-])${v}\\.(\\w+)`, "g"))) {
      const k = r[1];
      if (k === "json" || k === "ts" || k === "js") continue; // "config.json" ndani ya maandishi/njia — si rejeo
      if (Array.isArray(data) ? ARR_M.has(k) : topKeys.includes(k) || OBJ_M.has(k)) continue;
      push({ file: f.path, ref: `${v}.${k}`, keys: Array.isArray(data) ? ["(orodha — tumia " + v + ".map(…))"] : topKeys });
    }
    // (b) X.map(item => item.key) / X.k.map(item => item.key) / for (const item of X[.k])
    const loops = [
      ...src.matchAll(new RegExp(`(?<![\\w.$])${v}(?:\\.(\\w+))?\\.(?:map|forEach|filter|find|some|every|flatMap)\\(\\s*\\(?\\s*(\\w+)`, "g")),
      ...src.matchAll(new RegExp(`for\\s*\\(\\s*(?:const|let|var)\\s+(\\w+)\\s+of\\s+${v}(?:\\.(\\w+))?`, "g")),
    ];
    for (const L of loops) {
      const isFor = L[0].startsWith("for");
      const sub = isFor ? L[2] : L[1];
      const p = isFor ? L[1] : L[2];
      const arr = sub ? (Array.isArray(data) ? undefined : (data as Record<string, unknown>)[sub]) : data;
      const ik = itemKeys(arr);
      if (!ik) continue;
      const win = src.slice((L.index ?? 0) + L[0].length, (L.index ?? 0) + L[0].length + 500);
      for (const r of win.matchAll(new RegExp(`(?<![\\w.$])${p}\\.(\\w+)`, "g"))) {
        if (ik.includes(r[1])) continue;
        push({ file: f.path, ref: `${p}.${r[1]}`, keys: ik });
      }
    }
  }
  return hits;
}
