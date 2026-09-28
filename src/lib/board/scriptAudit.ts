// src/lib/board/scriptAudit.ts — R21: ukaguzi wa KIDETERMINISTIC (bila LLM) wa script ya mwisho iliyounganishwa na Optimus.
// Kila namba / URL / maandishi (text ya HTML, string zenye maneno) yaliyomo kwenye script lakini HAYAMO kwenye code
// iliyoidhinishwa wala maamuzi ya Ledger yanaorodheshwa kwenye ripoti (10.2) — kilichoongezwa wakati wa kuunganisha
// hakifichwi. Chanzo: Mama Lishe — maelezo ya vyakula yalibuniwa, "Ndizi Nyama" 9,000 → 4000, URL mpya ya ramani.

export interface AuditHit { kind: "namba" | "url" | "maandishi"; value: string }

/** maandishi → umbo la kulinganisha: bila escapes za JSON, herufi ndogo, nafasi moja */
function norm(s: string): string {
  return String(s || "")
    .replace(/\\[nrt]/g, " ")
    .replace(/\\(["'\\/])/g, "$1")
    .replace(/&nbsp;|&rarr;|&amp;/g, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

const digits = (s: string) => s.replace(/[,\s]/g, "");

function stripComments(code: string): string {
  return code
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, "$1 ")
    .replace(/(^|\n)\s*#(?!!)[^\n]*/g, "$1");
}

/** code ndani ya fenced blocks (au maandishi yote kama hakuna fence) */
function codeOnly(md: string): string {
  const blocks = [...String(md || "").matchAll(/```[^\n]*\n([\s\S]*?)```/g)].map((m) => m[1]);
  return blocks.length ? blocks.join("\n") : String(md || "");
}

export function auditScript(script: string, sources: string[]): AuditHit[] {
  const code = stripComments(codeOnly(script));
  const src = norm(sources.join("\n"));
  const srcDigits = new Set([...src.matchAll(/\d[\d,]*\d|\d/g)].map((m) => digits(m[0])));
  const srcWords = new Set(src.split(/[^a-z0-9\u00C0-\u024F'-]+/).filter(Boolean));
  const out: AuditHit[] = [];
  const seen = new Set<string>();
  const push = (kind: AuditHit["kind"], value: string) => {
    const v = value.replace(/\s+/g, " ").trim();
    const key = `${kind}|${v.toLowerCase()}`;
    if (!v || seen.has(key)) return;
    seen.add(key);
    out.push({ kind, value: v });
  };

  // 1) URL
  for (const m of code.matchAll(/https?:\/\/[^\s"'`<>)\\]+/g)) {
    const u = m[0].replace(/[.,;]+$/, "");
    if (!src.includes(norm(u))) push("url", u);
  }
  // 2) namba zenye tarakimu 3+ (bei, bandari, ukubwa) — "3,500/=" na 3500 ni sawa
  for (const m of code.matchAll(/(?<![\w#.-])\d{1,3}(?:,\d{3})+(?![\w-])|(?<![\w#.-])\d{3,}(?![\w-])/g)) {
    if (!srcDigits.has(digits(m[0]))) push("namba", m[0]);
  }
  // 3) maandishi: text ya HTML kati ya tags, na string zenye maneno 2+ (maelezo, anwani, ujumbe)
  const texts: string[] = [];
  for (const m of code.matchAll(/>([^<>{}]{6,240})</g)) texts.push(m[1]);
  for (const m of code.matchAll(/"([^"\n]{6,240})"|'([^'\n]{6,240})'/g)) texts.push(m[1] || m[2]);
  for (const raw of texts) {
    const t = raw.replace(/\s+/g, " ").trim();
    if (!/[A-Za-z\u00C0-\u024F]{2,}\s+[A-Za-z\u00C0-\u024F]{2,}/.test(t)) continue; // maneno 2+ tu (si class/identifier moja)
    if (/^[\w\s.:#-]+$/.test(t) && !/\s[a-z]+\s/i.test(` ${t} `)) continue;
    if (/[{}$;=]|=>|\(\)/.test(t)) continue; // code, si maandishi
    const n = norm(t);
    if (src.includes(n)) continue;
    // sentensi ndefu: kama vipande vyake vikuu vipo (maandishi yamegawanywa na tags), si nyongeza
    const words = n.split(/[^a-z0-9\u00C0-\u024F'-]+/).filter((w) => w.length > 2);
    const found = words.filter((w) => srcWords.has(w)).length;
    if (words.length >= 4 && found / words.length >= 0.95) continue;
    push("maandishi", t.length > 160 ? `${t.slice(0, 157)}…` : t);
  }
  return out;
}

/** sehemu ya ripoti (10.2) — uwazi: kilichoongezwa wakati wa kuunganisha */
export function auditSection(hits: AuditHit[], max = 60): string {
  const head = "### 10.2 Ukaguzi wa Script ya Mwisho (kiotomatiki, bila LLM)\n\n";
  if (!hits.length) return `${head}✅ Kila namba, URL na maandishi kwenye script ya mwisho yamo kwenye code iliyoidhinishwa au maamuzi ya Ledger — hakuna kilichoongezwa wakati wa kuunganisha.`;
  const label = { namba: "Namba", url: "URL", maandishi: "Maandishi" } as const;
  const rows = hits.slice(0, max).map((h) => `| ${label[h.kind]} | \`${h.value.replace(/\|/g, "\\|").replace(/`/g, "'")}\` |`);
  return (
    `${head}> ⚠️ ONYO: Vitu ${hits.length} vifuatavyo vimo kwenye script ya mwisho lakini **havimo** kwenye code iliyoidhinishwa (approved_code) wala maamuzi ya Ledger — viliongezwa au kubadilishwa wakati wa kuunganisha. Vithibitishe kabla ya kutumia.\n\n` +
    `| Aina | Thamani |\n| :--- | :--- |\n${rows.join("\n")}` +
    (hits.length > max ? `\n\n_(+${hits.length - max} zaidi)_` : "")
  );
}
