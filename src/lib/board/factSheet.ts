// src/lib/board/factSheet.ts — R26 (Awamu 1): FACT SHEET = chanzo kimoja cha ukweli (single source of truth).
//
// Data rasmi (bei, saa, anwani, simu, barua pepe) inasomwa KIDETERMINISTIC kutoka brief ya Mkuu — bila LLM.
// Kila hatua inayofuata (code writer, reviewer, fix, script ya mwisho, ripoti, Data Guard) inalinganisha na hii.
// Chanzo cha wazo: "deterministic parser as trusted oracle" + "backend-is-truth" (StateGen) — LLM haiamui thamani.
//
// Moduli hii ni PURE (hakuna I/O) → inajaribiwa na unit tests moja kwa moja.

export interface FactService { name: string; price: string; amount: number }
export interface FactHours { days: string; time: string; open: string; close: string }
export interface FactSheet {
  version: 1;
  name: string | null;
  address: string | null;
  hours: FactHours[];
  services: FactService[];
  currency: string | null;
  phone: { value: string; placeholder: boolean; file: string | null } | null;
  email: { value: string | null; forbidden: boolean } | null;
  /** R28: siku zilizofungwa ("Jumapili: IMEFUNGWA") — neno kwa neno */
  closed?: string[];
  /** mistari mingine ya DATA RASMI (makatazo/maelezo) — neno kwa neno */
  rules: string[];
  /** MASHARTI ya brief — neno kwa neno */
  constraints: string[];
  source: "parser" | "parser+llm";
}

export const FACTS_PREFIX = "__PROFESSOR_XMD_FACTS__:";
export const BRIEF_PREFIX = "__PROFESSOR_XMD_BRIEF__:";

/** Ulinganisho wa thamani: herufi ndogo, dash zote → "-", nafasi zimebanwa (\"08:00 – 20:00\" == \"08:00-20:00\"). */
export const normFact = (s: string) =>
  String(s || "")
    .toLowerCase()
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .replace(/\s*([-,:/])\s*/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

const digitsOf = (s: string) => String(s || "").replace(/[^\dX]/gi, "").toUpperCase();

const DATA_HEAD = /^\s*#{0,4}\s*\**\s*(DATA\s+RASMI|OFFICIAL\s+DATA|TAARIFA\s+RASMI|DATA\s+YA\s+(?:BIASHARA|MRADI)|BUSINESS\s+DATA)\b/i;
const RULE_HEAD = /^\s*#{0,4}\s*\**\s*(MASHARTI|CONSTRAINTS|VIKWAZO|REQUIREMENTS)\b/i;
/** kichwa kipya cha sehemu: mstari usio bullet/jedwali unaoanza kwa neno la HERUFI KUBWA (≥4) */
const ANY_HEAD = /^\s*#{0,4}\s*\**\s*[A-Z][A-Z0-9]{3,}(?:\s+[A-Z0-9]{2,})*\b/;
const isBody = (l: string) => /^\s*([-*•|]|\d+[.)]\s)/.test(l) || /^\s{2,}\S/.test(l);

function block(lines: string[], head: RegExp): { start: number; body: string[] } | null {
  const i = lines.findIndex((l) => head.test(l));
  if (i < 0) return null;
  const body: string[] = [];
  const first = lines[i].replace(head, "").replace(/^[\s*:()—–-]+/, "");
  if (/\S/.test(first) && !/^[^:]*\)\s*:?\s*$/.test(first) && !/^\(?[A-Z\s—–-]*\)?:?$/.test(first)) body.push(first);
  for (let k = i + 1; k < lines.length; k++) {
    const l = lines[k];
    if (!l.trim()) { if (body.length && k + 1 < lines.length && !isBody(lines[k + 1]) && lines[k + 1].trim()) break; continue; }
    if (!isBody(l) && ANY_HEAD.test(l)) break;
    body.push(l);
  }
  return { start: i, body };
}

const bulletText = (l: string) => l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, "").trim();
const HOURS = /^(.+?)\s*:\s*(\d{1,2}:\d{2})\s*[\u2010-\u2015\u2212-]\s*(\d{1,2}:\d{2})\s*\.?$/;
const PRICE = /^\s*(?:TZS|Tsh\.?|TSh\.?|KES|KSh\.?|USD|\$)?\s*(\d{1,3}(?:[,.]\d{3})+|\d{3,})\s*(?:\/=|TZS|Tsh|TSh|KES)?\s*$/;

/** Brief → Fact Sheet. Hurudisha null kama brief haina data rasmi yoyote inayotambulika. */
export function extractFactSheet(brief: string): FactSheet | null {
  const lines = String(brief || "").replace(/\r/g, "").split("\n");
  const data = block(lines, DATA_HEAD);
  const scope = data ? data.body : lines; // bila kichwa cha DATA RASMI: miundo kamili tu (jedwali/saa) inasomwa
  const f: FactSheet = { version: 1, name: null, address: null, hours: [], services: [], currency: null, phone: null, email: null, rules: [], constraints: [], source: "parser" };

  let tableHeaderSeen = false;
  for (const raw of scope) {
    const l = raw.trim();
    if (!l) continue;
    // jedwali la markdown: | Huduma | Bei |
    if (/^\|.*\|$/.test(l)) {
      if (/^\|[\s|:-]+\|$/.test(l)) continue; // mstari wa kutenganisha
      const cells = l.slice(1, -1).split("|").map((c) => c.trim());
      if (cells.length < 2) continue;
      const pm = cells[cells.length - 1].match(PRICE);
      if (!pm) { tableHeaderSeen = true; continue; }
      const name = cells.slice(0, -1).join(" ").trim();
      if (name) f.services.push({ name, price: cells[cells.length - 1].trim(), amount: Number(pm[1].replace(/[,.]/g, "")) });
      continue;
    }
    const t = bulletText(l);
    const h = t.match(HOURS);
    if (h) { f.hours.push({ days: h[1].trim(), time: `${h[2]} – ${h[3]}`, open: h[2], close: h[3] }); continue; }
    if (!data) continue; // nje ya DATA RASMI: majedwali na saa tu (hakuna kubahatisha)
    const kv = t.match(/^([^:]{2,40}):\s*(.*)$/);
    const key = kv ? kv[1].trim() : "";
    const val = kv ? kv[2].trim() : t;
    if (/^(jina|name|jina la biashara|business name)$/i.test(key) && val) { f.name = val.replace(/\.$/, ""); continue; }
    if (/^(anwani|address|mahali|location)$/i.test(key) && val) { f.address = val.replace(/\.$/, ""); continue; }
    if (/simu|whatsapp|phone|namba ya/i.test(key || t)) {
      const tick = [...t.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
      const num = tick.find((x) => /^\+?[\dX\s-]{9,16}$/i.test(x)) || (t.match(/\+?255[\dX]{9}|\b0[67][\dX]{8}\b/i) || [])[0];
      const file = tick.find((x) => /\//.test(x) || /\.json$/i.test(x)) || null;
      if (num) f.phone = { value: num.trim(), placeholder: /X/i.test(num) || /placeholder/i.test(t), file };
      else f.rules.push(t);
      continue;
    }
    if (/barua pepe|e-?mail/i.test(key || t)) {
      const em = t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/);
      const forbidden = !em && /haijatolewa|hakuna|msiweke|usiweke|not provided|none|no email|do not/i.test(t);
      f.email = { value: em ? em[0] : null, forbidden };
      continue;
    }
    if (/huduma|bei|services|prices?/i.test(key) && !val) { const c = t.match(/\((TZS|KES|USD|Tsh)\)/i); if (c) f.currency = c[1].toUpperCase(); continue; }
    if (/huduma|bei|services|prices?/i.test(key)) { const c = key.match(/\((TZS|KES|USD|Tsh)\)/i); if (c) f.currency = c[1].toUpperCase(); }
    if (/^(saa za kazi|saa|hours|opening hours|masaa)$/i.test(key) && !val) continue;
    // R28: siku iliyofungwa — "Jumapili: IMEFUNGWA (hakuna huduma)" (bado inabaki kwenye rules, neno kwa neno)
    if (kv && /^(jumatatu|jumanne|jumatano|alhamisi|ijumaa|jumamosi|jumapili|monday|tuesday|wednesday|thursday|friday|saturday|sunday)s?$/i.test(key)
        && /imefungwa|tumefunga|closed|hakuna huduma/i.test(val) && !/\d{1,2}[:.]\d{2}/.test(val)) {
      (f.closed ||= []).push(key);
    }
    // bullet ya bei: "- Chai: 1,000"
    if (kv && PRICE.test(val) && !/:\d/.test(val)) {
      const pm = val.match(PRICE)!;
      f.services.push({ name: key, price: val, amount: Number(pm[1].replace(/[,.]/g, "")) });
      continue;
    }
    if (/^\s*[-*•]/.test(raw) || kv) f.rules.push(t);
  }
  if (!f.currency && f.services.length) { const c = String(brief).match(/\((TZS|KES|USD)\)/); if (c) f.currency = c[1]; }
  void tableHeaderSeen;

  const rb = block(lines, RULE_HEAD);
  if (rb) f.constraints = rb.body.map(bulletText).filter((x) => x.length > 2);

  if (!f.services.length && !f.hours.length && !f.address && !f.phone && !f.email && !f.name) return null;
  return f;
}

/** Idadi fupi kwa chip/log. */
export function factSummary(f: FactSheet): string {
  const parts = [
    f.services.length ? `huduma ${f.services.length}` : "",
    f.hours.length ? `saa ${f.hours.length}` : "",
    f.address ? "anwani ✓" : "",
    f.phone ? `simu ${f.phone.placeholder ? "(placeholder)" : "✓"}` : "",
    f.email ? (f.email.forbidden ? "barua pepe: hakuna" : "barua pepe ✓") : "",
  ].filter(Boolean);
  return parts.join(" · ");
}

/** Block ya prompt — fupi, kamili, neno kwa neno. Inawekwa MWANZO wa prompt za code/review/fix/assembly/report. */
export function factSheetBlock(f: FactSheet | null | undefined, o: { swahiliHoursLocked?: boolean } = {}): string {
  if (!f) return "";
  const out: string[] = ["=== DATA RASMI · FACT SHEET (authoritative — parsed by code from the brief). Copy values EXACTLY; never invent, round, rename or convert them ==="];
  if (f.name) out.push(`Name: ${f.name}`);
  if (f.address) out.push(`Address (verbatim): ${f.address}`);
  if (f.hours.length) {
    out.push(`Hours (verbatim${o.swahiliHoursLocked ? "; the Board LOCKED an extra Swahili-time label — keep these 24h values too" : "; do NOT convert to Swahili time or any other format"}):`);
    for (const h of f.hours) out.push(`- ${h.days}: ${h.time}`);
  }
  if (f.services.length) {
    out.push(`Services & prices${f.currency ? ` (${f.currency})` : ""} — the ONLY valid services and prices (no extra services, no other prices):`);
    for (const s of f.services) out.push(`- ${s.name}: ${s.price}`);
  }
  if (f.phone) out.push(`Phone/WhatsApp: ${f.phone.value}${f.phone.placeholder ? " (PLACEHOLDER — keep exactly this; never write any other number)" : ""}${f.phone.file ? ` · stored in ${f.phone.file}` : ""}`);
  if (f.email) out.push(f.email.forbidden ? "Email: NONE — do not add any email address anywhere." : `Email: ${f.email.value}`);
  if (f.rules.length) out.push(`Rules: ${f.rules.join(" | ")}`);
  if (f.closed?.length) out.push(`Closed (no hours at all): ${f.closed.join(", ")}`);
  // R28: "Dhamana (warranty), punguzo, au ofa: HAZIJATOLEWA" — maana yake HATUJUI, si "hakuna" → zisitajwe kabisa
  // R29: mistari YOTE ya makatazo (delivery/punguzo … NA historia/mwaka/wafanyakazi)
  const nope = f.rules.filter((r) => /^[^:]{2,90}:\s*.*(hazijatolewa|hayajatolewa|haijatolewa|msiandike|msibuni|not provided)/i.test(r) && !/maelezo|description|barua pepe|e-?mail|simu|phone/i.test(r.split(":")[0]));
  if (nope.length) out.push(`NOT PROVIDED → never mention or invent anywhere (not even to deny, e.g. no FAQ "Is there delivery? No"): ${nope.map((r) => r.split(":")[0].trim()).join(" · ")}`);
  if (f.constraints.length) out.push(`Constraints: ${f.constraints.join(" | ")}`);
  return out.join("\n");
}

/** R26: thamani ya LLM inakubaliwa TU ikiwa inaonekana neno kwa neno kwenye brief (anti-hallucination). */
export function mergeLlmFacts(base: FactSheet | null, llm: any, brief: string): FactSheet | null {
  if (!llm || typeof llm !== "object") return base;
  const nb = normFact(brief);
  const inBrief = (v: unknown) => typeof v === "string" && v.trim().length > 1 && nb.includes(normFact(v));
  const f: FactSheet = base ? JSON.parse(JSON.stringify(base)) : { version: 1, name: null, address: null, hours: [], services: [], currency: null, phone: null, email: null, rules: [], constraints: [], source: "parser" };
  let added = false;
  if (!f.name && inBrief(llm.name)) { f.name = String(llm.name).trim(); added = true; }
  if (!f.address && inBrief(llm.address)) { f.address = String(llm.address).trim(); added = true; }
  if (!f.hours.length && Array.isArray(llm.hours)) {
    for (const h of llm.hours) {
      const m = String(h?.time || "").match(/(\d{1,2}:\d{2})\s*[\u2010-\u2015\u2212-]\s*(\d{1,2}:\d{2})/);
      if (m && inBrief(h?.days) && nb.includes(normFact(m[1])) && nb.includes(normFact(m[2]))) { f.hours.push({ days: String(h.days).trim(), time: `${m[1]} – ${m[2]}`, open: m[1], close: m[2] }); added = true; }
    }
  }
  if (!f.services.length && Array.isArray(llm.services)) {
    const bd = String(brief).replace(/[,.](?=\d{3}\b)/g, "");
    for (const s of llm.services) {
      const amt = Number(String(s?.price ?? "").replace(/[^\d]/g, ""));
      if (inBrief(s?.name) && amt >= 1 && new RegExp(`(^|\\D)${amt}(\\D|$)`).test(bd)) { f.services.push({ name: String(s.name).trim(), price: String(s.price).trim(), amount: amt }); added = true; }
    }
  }
  if (!f.phone && typeof llm.phone === "string" && digitsOf(llm.phone).length >= 9 && digitsOf(brief).includes(digitsOf(llm.phone))) {
    f.phone = { value: llm.phone.trim(), placeholder: /X/i.test(llm.phone), file: null }; added = true;
  }
  if (!added) return base;
  f.source = "parser+llm";
  return f;
}

export function factsChipText(f: FactSheet): string { return FACTS_PREFIX + JSON.stringify(f); }
export function readFactsChip(items: any[] | undefined): FactSheet | null {
  const it = [...(items || [])].reverse().find((x) => x?.kind === "chip" && typeof x?.text === "string" && x.text.startsWith(FACTS_PREFIX));
  if (!it) return null;
  try { const f = JSON.parse(it.text.slice(FACTS_PREFIX.length)); return f && f.version === 1 ? f : null; } catch { return null; }
}
export function readBriefChip(items: any[] | undefined): string | null {
  const it = [...(items || [])].reverse().find((x) => x?.kind === "chip" && typeof x?.text === "string" && x.text.startsWith(BRIEF_PREFIX));
  return it ? it.text.slice(BRIEF_PREFIX.length) : null;
}
