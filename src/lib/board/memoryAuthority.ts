// src/lib/board/memoryAuthority.ts — R27: memory ya vikao/miradi MINGINE si mamlaka ya kikao hiki.
// Tatizo halisi (R27, Agenda 1): Ultron alisema "the previous Saluni Nuru project … chose champagne gold … That decision was
// locked" na Board ikafunga "Adopt the verified Saluni Nuru token set" — thamani zilitoka memory ya kikao cha R24 (jina lile
// lile), si mjadala wa kikao hiki. Suluhisho (pure, bila LLM):
//   1. sessionLabel — lebo ya memory ni ya KIKAO (jina + kitambulisho), si jina tu (vikao viwili vya brief moja vina jina moja)
//   2. maskPastValues — mistari ya vikao vingine inabaki kama somo, bila thamani za kunakili (hex, vipimo)
//   3. pastAuthorityHits — pendekezo linalotegemea "previous project / verified before / continuity" halifungwi

/** Lebo ya memory ya kikao: jina + #kitambulisho (≤56 herufi — renderLine inakata kwenye 60). */
export function sessionLabel(title: string, sessionKey: string | null | undefined): string {
  const t = String(title || "").replace(/[\[\]]/g, "").replace(/\s+/g, " ").trim();
  const k = String(sessionKey || "").replace(/[^a-z0-9]/gi, "").slice(-6);
  if (!k) return t.slice(0, 60);
  return `${t.slice(0, 48).trim()} #${k}`;
}

/** Mstari wa kikao kingine → somo: thamani halisi za kunakili zinaondolewa (rangi, vipimo, ukubwa). */
export function maskPastValues(text: string): string {
  return String(text || "")
    .replace(/#[0-9a-f]{8}\b|#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/gi, "#…")
    .replace(/\b\d+(?:\.\d+)?\s?(?:px|rem|em|ch|vh|vw|%)(?![a-z])/gi, "…")
    .replace(/\b\d+(?:\.\d+)?\s?:\s?1\b/g, "…:1");
}

const PATTERNS: RegExp[] = [
  // "the previous Saluni Nuru project", "our last session", "the earlier board"
  /\b(?:previous|prior|earlier|past|last|old|original)\s+(?:[\w'’-]+\s+){0,3}?(?:project|session|run|board|build|iteration)s?\b/i,
  // "brand continuity", "design continuity"
  /\b(?:brand|design|visual|token)\s+continuity\b/i,
  // "was locked before", "already verified in the previous …", "was decided earlier"
  /\b(?:was|were|been|already)\s+(?:\w+\s+){0,2}?(?:locked|verified|validated|approved|decided|chosen|agreed)\s+(?:\w+\s+){0,3}?(?:before|previously|last time|in (?:a|the|our) (?:previous|past|prior|earlier|last))\b/i,
  // "adopt the verified … token set" (hakuna uthibitisho kwenye kikao hiki)
  /\b(?:re-?use|reusing|adopt|adopting|keep|keeping|restore)\s+(?:the\s+|our\s+)?(?:verified|proven|previously[-\s]\w+)\s+(?:[\w-]+\s+){0,3}?(?:tokens?|palette|set|design|decisions?|values)\b/i,
  // "which I've previously defended for this brand", "previously chosen for this client"
  /\bpreviously\s+(?:defended|chose|chosen|picked|locked|verified|validated|approved|decided|used|established|agreed)\b[^.\n]{0,40}?\b(?:brand|project|client|salon|saluni|site|company)\b/i,
  // Kiswahili: "mradi uliopita", "kikao kilichopita", "mradi wa zamani"
  /\b(?:mradi|kikao|mjadala|board)\s+(?:uliopita|kilichopita|uliotangulia|wa\s+zamani|wa\s+awali|wa\s+nyuma)\b/i,
];

// R28 (Gereji A1): Vextron aliandika "meets <50KB gzipped budget (proven on Mama Lishe Bora)" — jina la mradi wa zamani
// kama ushahidi. Majina ya miradi ya vikao vingine yanakusanywa pale memory inapoyaleta (recall → rememberPastProject).
const GENERIC = /\b(?:website|web|site|project|plan|planning|development|dev|build|redesign|landing|page|app|tovuti|mradi|mpango|ya|wa|la|the|for|and|optimus|ultron|vextron|megatron|cybertron)\b/gi;
/** Kiini cha jina la mradi: "Mama Lishe Bora Website Project Plan #d1a1ad" → "mama lishe bora" */
export function projectCore(label: string): string {
  return String(label || "").replace(/#[a-z0-9]{3,}\b/gi, "").replace(GENERIC, " ").replace(/[^\p{L}\p{N}\s'’-]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
}
const PAST_KEY = "__xmdPastProjects";
function pastSet(): Set<string> {
  const g = globalThis as unknown as Record<string, Set<string>>;
  return (g[PAST_KEY] ||= new Set<string>());
}
/** memory ya mradi MWINGINE imeletwa kwenye prompt → jina lake linakumbukwa (kwa gate ya pendekezo) */
export function rememberPastProject(label: string) {
  const c = projectCore(label);
  if (c.length >= 6 && c.split(" ").length <= 5) pastSet().add(c);
}
/** majina ya miradi ya zamani, bila mradi wa sasa (jina lile lile = haiwezekani kutofautisha kwa jina).
 *  R29: `brief` → jina (au neno lake la kwanza) linaloonekana kwenye brief ya sasa haliwi "mradi wa zamani". */
export function pastProjectNames(currentTitle: string, brief = ""): string[] {
  const cur = projectCore(currentTitle);
  const b = String(brief || "").toLowerCase();
  return [...pastSet()].filter((c) => c !== cur && !cur.includes(c) && !c.includes(cur || "\u0000") && !(b && (b.includes(c) || b.includes(c.split(" ")[0]))));
}

/** Vipande vya maandishi vinavyodai mamlaka ya kikao/mradi mwingine. Rejea za Ledger ya kikao hiki hazihesabiwi. */
export function pastAuthorityHits(text: string, pastNames: string[] = []): string[] {
  const out: string[] = [];
  const low = String(text || "").toLowerCase().replace(/\s+/g, " ");
  for (const n of pastNames) {
    if (n.length >= 6 && new RegExp(`(^|[^\\p{L}])${n.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}])`, "u").test(low)) out.push(`past project: ${n}`);
  }
  // R29 (Bakery A5 review): "locked Ledger (Gereji/Saluni) … require 48x48px" — neno la kwanza la jina la mradi wa zamani
  // (≥5 herufi) kwenye sentensi ya MAMLAKA (ledger/locked/required/per/decided) = dai la mamlaka ya kikao kingine.
  const COMMON = /^(?:restaurant|login|modern|create|build|responsive|website|company|business|online|simple|digital|personal|mobile|landing|professor|design|visual|brand|clean|dashboard|portfolio|store|shop|school|hotel|clinic)$/;
  const heads = [...new Set(pastNames.map((n) => n.split(" ")[0]).filter((h) => h.length >= 5 && !COMMON.test(h)))];
  if (heads.length) {
    for (const sentence of String(text || "").split(/(?<=[.!?])\s+|\n+/)) {
      if (!/\b(?:ledger|locked|lock|required?|requires|mandated?|per|decided|decision|agreed|standard|imefungwa|uamuzi)\b/i.test(sentence)) continue;
      const low2 = sentence.toLowerCase();
      const h = heads.find((x) => new RegExp(`(^|[^\\p{L}])${x}(?![\\p{L}])`, "u").test(low2));
      if (h) out.push(`past project: ${h}`);
    }
  }
  for (const sentence of String(text || "").split(/(?<=[.!?])\s+|\n+/)) {
    // "as locked in Agenda 1" / "LOCKED LEDGER" = kikao hiki → halali
    if (/\bagenda\s*\d|\bledger\b|\bajenda\s*\d/i.test(sentence) && !/\b(?:previous|prior|past|earlier)\s+(?:[\w'’-]+\s+){0,3}?(?:project|session)/i.test(sentence)) continue;
    for (const re of PATTERNS) {
      const m = sentence.match(re);
      if (m) { out.push(m[0]); break; }
    }
  }
  return [...new Set(out)].slice(0, 4);
}

/** Maelekezo ya zamu ijayo baada ya pendekezo kukataliwa (Kiingereza — mjadala wa Board ni kwa Kiingereza). */
export function pastAuthorityNote(hits: string[], by: string): string {
  return `SYSTEM CHECK (automatic): ${by}'s last proposal was NOT accepted because it relied on a past project/session (${hits.map((h) => `"${h}"`).join(", ")}). A past session is never evidence or a decision for THIS session — even if it had the same name or client. Do not claim anything was "verified", "locked" or "chosen before", and do not argue continuity. Propose from this brief, DATA RASMI, this session's discussion and the evidence listed above.`;
}

/** R29: majina ya vikao vingine kutoka Appwrite (si tu yale memory ilileta) → gate ya mamlaka ina orodha kamili. */
export function rememberPastTitles(titles: string[], currentTitle: string) {
  const cur = projectCore(currentTitle);
  for (const t of titles) if (t && projectCore(t) !== cur) rememberPastProject(t);
}

/** R29: ondoa hoja za review zinazotegemea mradi wa zamani (mstari/bullet wenye hit) — mwandishi wa code asizifukuzie. */
export function stripPastAuthority(review: string, pastNames: string[]): { text: string; removed: string[] } {
  const removed: string[] = [];
  const keep: string[] = [];
  const parts = String(review || "").split(/\n(?=\s*(?:[-*•]|\d+[.)])\s)/);
  for (const p of parts) {
    const h = pastAuthorityHits(p, pastNames);
    if (!h.length) { keep.push(p); continue; }
    removed.push(...h);
    if (!/^\s*(?:REJECT|APPROVE)\b/i.test(p.trim().split("\n")[0] || "")) continue;
    // kichwa "REJECT: 1. … 3. … (Gereji) …" → ondoa hoja/sentensi yenye hit tu, kichwa kinabaki
    const segs = p.split(/(?=\s\d+[.)]\s)|(?<=[.!?])\s+/);
    keep.push(segs.filter((x) => !pastAuthorityHits(x, pastNames).length).join(" ").replace(/\s\d+[.)]\s*(?=\s\d+[.)]\s|$)/g, "").replace(/\s{2,}/g, " ").trim());
  }
  return { text: keep.join("\n"), removed: [...new Set(removed)] };
}
