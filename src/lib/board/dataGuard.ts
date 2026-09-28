import { parseBlocks } from "./codeBlocks";
// src/lib/board/dataGuard.ts — R26 (Awamu 2): DATA GUARD — ukaguzi wa KIDETERMINISTIC wa data rasmi ndani ya code.
//
// Inaendeshwa KABLA ya mkaguzi wa LLM (na kwenye script ya mwisho + ripoti). Hakuna LLM → haiwezi "kukubali" kwa makosa.
// Inakamata kasoro za R24: bei/huduma za kubuni (A4), saa za Kiswahili zisizo sahihi (A5), simu 255700000000 (A3),
// barua pepe iliyokatazwa, anwani iliyobadilishwa. Chanzo cha wazo: MARCH (checker blinded to solver) + pith (parser oracle).
// PURE — hakuna I/O.

import { normFact, type FactSheet } from "./factSheet";
import { codeText } from "./codeBlocks";

export type GuardKind = "bei" | "huduma" | "huduma-haipo" | "simu" | "barua-pepe" | "saa" | "saa-kiswahili" | "anwani" | "maelezo" | "marufuku" | "sehemu";
export interface GuardHit { kind: GuardKind; found: string; expected: string }
export interface GuardOpts {
  /** Board ILIFUNGA uamuzi wa kuongeza saa za Kiswahili (bado 24h rasmi lazima ziwepo) */
  swahiliHoursLocked?: boolean;
  /** maandishi si code (mf. ripoti) — hakuna kukata fences */
  prose?: boolean;
}

const digits = (s: string) => String(s || "").replace(/[^\dX]/gi, "").toUpperCase();
const amountOf = (s: string) => Number(String(s || "").replace(/[^\d]/g, "")) || 0;
const uniqPush = (arr: GuardHit[], h: GuardHit) => { if (!arr.some((x) => x.kind === h.kind && x.found === h.found)) arr.push(h); };

/** Swahili-time label ("Saa 2:00 Asubuhi", "saa mbili asubuhi") → true */
const SWAHILI_TIME = /\bsaa\s+(?:\d{1,2}(?::\d{2})?|moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi(?:\s+na\s+(?:moja|mbili))?)\s*(?:kamili\s*)?(?:asubuhi|mchana|jioni|usiku|alasiri)\b/i;

export function guardText(text: string, f: FactSheet | null | undefined, o: GuardOpts = {}): GuardHit[] {
  if (!f) return [];
  const hits: GuardHit[] = [];
  const code = o.prose ? String(text || "") : codeText(text);
  if (!code.trim()) return hits;
  const nCode = normFact(code);

  // ---- 1. SIMU / WHATSAPP ----
  if (f.phone) {
    const want = digits(f.phone.value);
    const re = /(?<![\w\d])(\+?255[\s-]?[\dX]{3}[\s-]?[\dX]{3}[\s-]?[\dX]{3}|\b0[67]\d{2}[\s-]?\d{3}[\s-]?\d{3})(?![\w\d])/gi;
    for (const m of code.matchAll(re)) {
      if (digits(m[1]) === want) continue;
      // R27: kiolezo cha X tupu ("255XXXXXXXXX" — maelezo ya muundo wa E.164 kwenye ujumbe wa test) si namba;
      //      kinakamatwa tu kikitumika KAMA thamani ya simu (whatsapp: "…", phone = "…", tel:, wa.me/)
      const mask = /^\+?255[\s-]?X{3}[\s-]?X{3}[\s-]?X{3}$/i.test(m[1]);
      if (mask) {
        const before = code.slice(Math.max(0, (m.index ?? 0) - 48), m.index ?? 0);
        const asValue = /(?:whats\s*app|phone|simu|namba|number|tel)\w*["'`]?\s*[:=]\s*["'`]?\s*$|(?:tel:|wa\.me\/)\s*$/i.test(before);
        if (!asValue) continue;
      }
      uniqPush(hits, { kind: "simu", found: m[1], expected: f.phone.value });
    }
    for (const m of code.matchAll(/wa\.me\/(\+?[\dX]{6,15})/gi)) {
      if (digits(m[1]) !== want) uniqPush(hits, { kind: "simu", found: m[1], expected: f.phone.value });
    }
  }

  // ---- 2. BARUA PEPE ----
  if (f.email) {
    for (const m of code.matchAll(/(?<![\w.+-])[\w.+-]+@[\w-]+\.[a-z]{2,}(?:\.[a-z]{2,})?\b/gi)) {
      if (/^git@|@(?:example|test|localhost)\b/i.test(m[0])) continue;
      if (f.email.forbidden || (f.email.value && m[0].toLowerCase() !== f.email.value.toLowerCase())) {
        uniqPush(hits, { kind: "barua-pepe", found: m[0], expected: f.email.forbidden ? "HAKUNA barua pepe (brief imekataza)" : f.email.value || "" });
      }
    }
  }

  // ---- 3. HUDUMA NA BEI ----
  if (f.services.length) {
    const valid = new Set(f.services.map((s) => s.amount));
    const byName = new Map(f.services.map((s) => [normFact(s.name), s]));
    // (a) jozi name → price ndani ya object moja
    const pairs: { name: string; amount: number }[] = [];
    const pairRe = /["']?(?:name|jina|title|huduma)["']?\s*:\s*["'`]([^"'`\n]{2,80})["'`]\s*,?[^{}]{0,240}?["']?(?:price|bei|amount|cost)["']?\s*:\s*["'`]?\s*(?:TZS|Tsh\.?)?\s*([\d][\d,._]*)/gi;
    for (const m of code.matchAll(pairRe)) pairs.push({ name: m[1].trim(), amount: amountOf(m[2]) });
    for (const p of pairs) {
      const off = byName.get(normFact(p.name));
      if (!off) uniqPush(hits, { kind: "huduma", found: `${p.name} (${p.amount.toLocaleString("en-US")})`, expected: `huduma rasmi tu: ${f.services.map((s) => s.name).join(", ")}` });
      else if (off.amount !== p.amount) uniqPush(hits, { kind: "bei", found: `${p.name}: ${p.amount.toLocaleString("en-US")}`, expected: `${off.name}: ${off.price}` });
    }
    // orodha ya huduma (≥3 jozi) → kila huduma rasmi lazima iwepo
    if (pairs.length >= 3) {
      const have = new Set(pairs.map((p) => normFact(p.name)));
      for (const s of f.services) if (!have.has(normFact(s.name))) uniqPush(hits, { kind: "huduma-haipo", found: `${s.name} (haipo kwenye orodha)`, expected: `${s.name}: ${s.price}` });
    }
    // (b) bei zenye alama ya fedha / key ya price — lazima ziwe bei rasmi
    const moneyRe = /(?:["']?(?:price|bei)["']?\s*[:=]\s*["'`]?\s*|(?:TZS|Tsh\.?|TSh\.?)\s*)(\d{1,3}(?:[,._]\d{3})+|\d{3,})|(\d{1,3}(?:[,._]\d{3})+|\d{4,})\s*(?:\/=|TZS|Tsh\b|TSh\b)/g;
    for (const m of code.matchAll(moneyRe)) {
      const a = amountOf(m[1] || m[2]);
      if (a && !valid.has(a)) uniqPush(hits, { kind: "bei", found: (m[1] || m[2]).trim(), expected: `bei rasmi: ${f.services.map((s) => s.price).join(", ")}` });
    }
    // (b2) jina la huduma rasmi + bei iliyo karibu nalo (HTML <dt>X</dt><dd>…</dd>, ripoti "X — TZS …") → bei ya huduma HIYO
    {
      const lower = code.toLowerCase();
      const spots: { at: number; s: (typeof f.services)[number] }[] = [];
      for (const sv of f.services) {
        const nm = sv.name.toLowerCase();
        for (let i = lower.indexOf(nm); i >= 0; i = lower.indexOf(nm, i + nm.length)) spots.push({ at: i, s: sv });
      }
      spots.sort((a, b) => a.at - b.at);
      spots.forEach((sp, k) => {
        const from = sp.at + sp.s.name.length;
        const to = Math.min(from + 70, k + 1 < spots.length ? spots[k + 1].at : code.length);
        const win = code.slice(from, to);
        const am = win.match(/^[^\n\d]{0,40}?(?:TZS|Tsh\.?|TSh\.?|:|—|–|-|=|\||<\/\w+>\s*<\w+[^>]*>)\s*(?:TZS|Tsh\.?)?\s*(\d{1,3}(?:[,._]\d{3})+|\d{4,})(?![\d:])/);
        if (am && amountOf(am[1]) !== sp.s.amount) uniqPush(hits, { kind: "bei", found: `${sp.s.name}: ${am[1]}`, expected: `${sp.s.name}: ${sp.s.price}` });
      });
    }
    // (c) "Maelezo ya huduma: HAYAJATOLEWA" → hakuna maelezo ya kubuni kwenye orodha ya huduma
    if (f.rules.some((r) => /maelezo[^:]*:\s*.*(hayajatolewa|msiandike|hakuna)/i.test(r) || /descriptions?\s*:\s*.*(not provided|none)/i.test(r)) && pairs.length) {
      for (const m of code.matchAll(/["']?(?:description|maelezo|desc|details)["']?\s*:\s*["'`]([^"'`\n]{6,160})["'`]/gi)) {
        uniqPush(hits, { kind: "maelezo", found: m[1].slice(0, 60), expected: "maelezo ya huduma HAYAJATOLEWA — jina na bei tu" });
      }
    }
  }

  // ---- 4. SAA ZA KAZI ----
  if (f.hours.length) {
    const validT = new Set(f.hours.map((h) => normFact(h.time)));
    for (const m of code.matchAll(/(?<![\d:])(\d{1,2}:\d{2})\s*[\u2010-\u2015\u2212-]\s*(\d{1,2}:\d{2})(?![\d:])/g)) {
      const t = normFact(`${m[1]} - ${m[2]}`);
      if (!validT.has(t)) uniqPush(hits, { kind: "saa", found: m[0].trim(), expected: f.hours.map((h) => `${h.days}: ${h.time}`).join(" · ") });
    }
    if (SWAHILI_TIME.test(code) && !o.swahiliHoursLocked) {
      const m = code.match(SWAHILI_TIME)!;
      uniqPush(hits, { kind: "saa-kiswahili", found: m[0], expected: "saa neno kwa neno kama brief (24h), mf. " + f.hours[0].time + " — Board haikufunga kubadilisha muundo" });
    }
    // siku rasmi zinaonekana kwenye code (data iliyoandikwa kwa mkono) → kila saa rasmi lazima iwepo
    const dayHit = !o.prose && f.hours.some((h) => nCode.includes(normFact(h.days)));
    if (dayHit) {
      for (const h of f.hours) {
        const tn = normFact(h.time);
        const alt = normFact(`${h.open}-${h.close}`);
        if (!nCode.includes(tn) && !nCode.includes(alt) && !(nCode.includes(normFact(h.open)) && nCode.includes(normFact(h.close)))) {
          uniqPush(hits, { kind: "saa", found: `${h.days}: (saa rasmi haipo)`, expected: `${h.days}: ${h.time}` });
        }
      }
    }
  }

  // ---- 5. ANWANI ----
  // R27: kila MAHALI anwani inapotajwa inakaguliwa peke yake —
  //   • sehemu isiyo rasmi ("Sinza" badala ya "Sinza Mori", mtaa mwingine) = kosa popote (imebadilishwa)
  //   • anwani fupi (sehemu sahihi lakini chache) = kosa tu inapowasilishwa KAMA anwani (<address>, "Anwani:", "address":)
  //     — kutaja eneo kwa ufupi ndani ya maelezo/meta description si kubuni (R27 A3: kengele ya uongo)
  if (f.address && !o.prose) {
    const parts = f.address.split(",").map((x) => x.trim()).filter(Boolean);
    const nParts = parts.map((p) => normFact(p));
    if ((nParts[0] || "").length >= 6) {
      const esc = parts[0].replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
      for (const m of code.matchAll(new RegExp(esc, "gi"))) {
        const start = m.index ?? 0;
        let win = code.slice(start, start + 240);
        const cut = win.search(/["'`<>\n|]|\.\s|\.$|\\n/);
        if (cut > 0) win = win.slice(0, cut);
        const segs = win.split(",").map((x) => x.trim()).filter(Boolean);
        // kipande cha MWISHO kinaweza kuendelea na sentensi ("… Dar es Salaam kukuhudumia …") → kata kwenye sehemu rasmi
        if (segs.length) {
          const last = segs[segs.length - 1];
          const hit = parts.find((p) => new RegExp(`^${p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+")}(?![\\w\u00c0-\u024f])`, "i").test(last));
          if (hit && normFact(last) !== normFact(hit)) segs[segs.length - 1] = hit;
        }
        const nSegs = segs.map((x) => normFact(x));
        const before = code.slice(Math.max(0, start - 90), start);
        const asAddress = /<address[^>]*>\s*(?:<[^>]+>\s*)*$|\baddress["'`]?\s*[:=]\s*["'`]?\s*$|\banwani\b\s*(?:\*\*)?\s*[:：]?\s*(?:\*\*)?\s*(?:<[^>]+>\s*)*$|streetAddress["']?\s*:\s*["']?\s*$/i.test(before);
        const bad = segs.filter((x, i) => !nParts.includes(nSegs[i]) && nSegs[i] !== normFact("Tanzania"));
        if (bad.length) {
          uniqPush(hits, { kind: "anwani", found: `anwani imebadilishwa (si rasmi: ${bad.join(", ")})`, expected: f.address });
        } else if (asAddress) {
          const missing = parts.filter((p, i) => !nSegs.includes(nParts[i]));
          if (missing.length) uniqPush(hits, { kind: "anwani", found: `anwani haijakamilika (haipo: ${missing.join(", ")})`, expected: f.address });
        }
      }
    }
  }
  // ---- R28 · MADA ZILIZOKATAZWA ("Dhamana (warranty), punguzo, au ofa: HAZIJATOLEWA. Msiandike yoyote.") ----
  //      Maudhui yanayoonekana tu (.astro/.html/.md/.json, bila comments) — test zinazokagua kutokuwepo kwa neno ni halali.
  if (!o.prose) {
    const terms = forbiddenTerms(f);
    if (terms.length) {
      const visible = parseBlocks(String(text || ""))
        .filter((b) => (b.path ? /\.(astro|html?|mdx?|json)$/i.test(b.path) : /^(astro|html?|md|mdx|json)$/i.test(b.lang)))
        .map((b) => b.body.replace(/<!--[\s\S]*?-->/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/^\s*\/\/.*$/gm, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1"))
        .join("\n");
      for (const t of terms) {
        const m = visible.match(new RegExp(`[^\\n]{0,40}\\b${t}\\b[^\\n]{0,40}`, "i"));
        if (m) uniqPush(hits, { kind: "marufuku", found: m[0].trim().slice(0, 90), expected: `"${t}" — brief: ${forbiddenRule(f)}` });
      }
      if (forbidsYear(f)) {
        const y = visible.match(/[^\n]{0,40}\b(?:tangu|since|mwaka|ilianzishwa|founded|established|est\.?)\s*(?:mwaka\s*)?(19[5-9]\d|20[0-3]\d)\b[^\n]{0,30}/i);
        if (y) uniqPush(hits, { kind: "marufuku", found: y[0].trim().slice(0, 90), expected: `mwaka wa kuanzishwa HAUJATOLEWA — brief: ${forbiddenRule(f)}` });
      }
    }
  }
  return hits;
}

const SYN: Record<string, string[]> = {
  dhamana: ["guarantee"], warranty: ["guarantee"], punguzo: ["discount"], ofa: ["offer", "promo"],
  delivery: ["tunasafirisha", "tunaleta"], "historia ya biashara": ["historia yetu", "ilianzishwa", "tulianzisha", "founded", "established"],
  "mwaka wa kuanzishwa": ["ilianzishwa", "tangu mwaka", "founded in", "established in"],
};
const NOPE = /^[^:]{2,90}:\s*.*(hazijatolewa|hayajatolewa|haijatolewa|msiandike|msibuni|not provided)/i;
/** R29: mistari YOTE ya "X: HAIJATOLEWA / Msibuni" (si ule wa kwanza tu) — bila maelezo/barua pepe/simu (zina ukaguzi wao) */
function forbiddenRules(f: FactSheet): string[] {
  return f.rules.filter((r) => NOPE.test(r) && !/maelezo|description|barua pepe|e-?mail|simu|phone/i.test(r.split(":")[0]));
}
function forbiddenRule(f: FactSheet): string {
  return forbiddenRules(f).join(" | ");
}
/** Maneno ya mada zilizokatazwa kutoka kwenye mistari ya brief (neno kwa neno) + visawe vichache. */
export function forbiddenTerms(f: FactSheet | null | undefined): string[] {
  if (!f) return [];
  const out: string[] = [];
  for (const r of forbiddenRules(f)) {
    const base = r.split(":")[0].toLowerCase().split(/[,()/]|\bau\b|\bor\b|\bna\b|\band\b/).map((x) => x.trim()).filter((x) => /^\p{L}[\p{L} ]{1,30}$/u.test(x));
    for (const t of base) out.push(t, ...(SYN[t] || []));
  }
  return [...new Set(out)];
}
/** R29: historia/mwaka wa kuanzishwa umekatazwa → mwaka wa kubuni ("tangu 2015", "© 2019 … ilianzishwa") */
export function forbidsYear(f: FactSheet | null | undefined): boolean {
  return !!f && forbiddenRules(f).some((r) => /mwaka|historia|year|founded/i.test(r.split(":")[0]));
}

const LABEL: Record<GuardKind, string> = {
  bei: "Bei isiyo rasmi",
  huduma: "Huduma isiyo kwenye DATA RASMI",
  "huduma-haipo": "Huduma rasmi haipo",
  simu: "Namba ya simu isiyo rasmi",
  "barua-pepe": "Barua pepe iliyokatazwa",
  saa: "Saa zisizo rasmi",
  "saa-kiswahili": "Saa zimebadilishwa muundo",
  anwani: "Anwani imebadilishwa",
  maelezo: "Maelezo ya kubuni",
  marufuku: "Mada iliyokatazwa na brief (haijatolewa — isiandikwe kabisa, hata kwa kukanusha)",
  sehemu: "Field isiyokuwepo kwenye faili la data (ukurasa ungeonyesha tupu/undefined)",
};

/** Maelezo ya REJECT kwa fix call (Kiingereza kifupi + thamani sahihi). */
export function guardRejectNote(hits: GuardHit[], max = 20): string {
  return [
    "DATA GUARD (automatic, deterministic — these are FACT errors against DATA RASMI; fix every one exactly):",
    ...hits.slice(0, max).map((h, i) => `${i + 1}. ${LABEL[h.kind]}: "${h.found}" → must be: ${h.expected}`),
    hits.length > max ? `… +${hits.length - max} more` : "",
  ].filter(Boolean).join("\n");
}

/** Mstari mfupi wa log/chip (Kiswahili). */
export function guardSummary(hits: GuardHit[]): string {
  if (!hits.length) return "✅ data rasmi inalingana 100%";
  const by = new Map<string, number>();
  for (const h of hits) by.set(LABEL[h.kind], (by.get(LABEL[h.kind]) || 0) + 1);
  return [...by.entries()].map(([k, n]) => `${k} ×${n}`).join(" · ");
}

/** Sehemu ya ripoti (markdown) — jedwali la ukaguzi. */
export function guardSection(hits: GuardHit[], max = 40): string {
  if (!hits.length) return "✅ **Data Guard:** kila bei, saa, namba, anwani na barua pepe kwenye script inalingana na DATA RASMI ya brief (ukaguzi wa code, si wa LLM).";
  return [
    `⚠️ **Data Guard:** tofauti ${hits.length} dhidi ya DATA RASMI (ukaguzi wa code, si wa LLM):`,
    "",
    "| # | Aina | Iliyopatikana | Inapaswa kuwa |",
    "|---|---|---|---|",
    ...hits.slice(0, max).map((h, i) => `| ${i + 1} | ${LABEL[h.kind]} | ${h.found.replace(/\|/g, "\\|")} | ${h.expected.replace(/\|/g, "\\|").slice(0, 200)} |`),
  ].join("\n");
}

/** Uamuzi uliofungwa unaongeza saa za Kiswahili WAZIWAZI (si "bila saa za Kiswahili"). */
export function swahiliHoursDecided(decision: string): boolean {
  const d = String(decision || "");
  const re = /(saa za kiswahili|swahili[- ]time|swahili[- ]hours|muda wa kiswahili)/i;
  if (!re.test(d)) return false;
  return !/(bila|hakuna|si|usi\w*|msi\w*|no|not|without|avoid|never|don't|do not)\s+(?:\w+\s+){0,4}(saa za kiswahili|swahili[- ]time|swahili[- ]hours|muda wa kiswahili)/i.test(d);
}
