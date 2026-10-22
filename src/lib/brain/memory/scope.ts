// src/lib/brain/memory/scope.ts — T36: MIPAKA YA KUMBUKUMBU (memory scope gate).
// Tatizo (CEO 2026-10-22): kila mazungumzo mapya agents walirudia design/mifumo ileile ya miradi iliyopita, kwa sababu
// mistari ya SELF/BOARD ya miradi mingine iliingia prompt kama "lessons" ikiwa na NENO MOJA tu linalofanana
// (recall.ts R30.1) — na maskPastValues iliondoa hex/px tu, ikaacha "editorial · zero-radius · hairline · Next.js +
// Supabase + Zod".
// Utafiti: kumbukumbu ni FUNZO si nakala (Reflexion) · kumbukumbu za mradi zibaki kwenye mradi wake (namespaces /
// ChatGPT project-only memory) · upendeleo wa mtumiaji uhifadhiwe TU ukitamkwa naye (OpenAI cookbook) · model
// inapendekeza, SHERIA za code zinaamua.
// Sheria (hakuna kufuta — mistari yote inabaki kwenye mradi wake; hapa ni lango la KUVUKA mradi tu):
//   design   → haivuki kamwe (rangi, fonts, layout/mtindo, motion, mandhari) — kila mradi unaamua upya kutoka brief yake
//   pref     → "Mkuu anapendelea…" iliyokisiwa kwenye Board haivuki (Mkuu hakuitamka); ya Chat (maneno yake) inavuka
//   tech     → mstari unaotaja teknolojia mahususi unavuka TU kama teknolojia ZOTE hizo zimo kwenye kazi ya sasa
//   lesson   → funzo la utaratibu; linavuka likiwa na maneno 2+ ya uhusiano na kazi ya sasa

export type LineKind = "design" | "pref" | "tech" | "lesson";

const DESIGN: RegExp[] = [
  /#[0-9a-f]{3,8}\b|#…/i,
  /\b(palettes?|colou?r(?:s|ways?)?|hues?|tones?|tints?|accents?|swatch\w*|gradients?|glass\w*|neumorph\w*|shadows?)\b/i,
  /\b(fonts?|typefaces?|typograph\w*|serifs?|sans|grotesk|plex|fraunces|inter(?!-)|geist|satoshi|playfair|poppins|manrope|outfit|montserrat|roboto|lora|garamond|tracking\s*-?\d|letter-?spacing|kerning|line-?lengths?)\b/i,
  /\b\d+(?:\.\d+)?\s?ch\b|…ch\b/i,
  /\b(border-?radius|radius|rounded(?:-\w+)?|hair-?lines?|dividers?|editorial|brutalis\w*|minimalis\w*|broadsheet|bento|asymmetr\w*|aesthetic\w*|obsidian|monochrome|vibe|look and feel|visual (?:identity|language|noise|system|style)|design (?:system|language|tokens?)|brand (?:pillar|identity|feel)|premium|elegan\w*|bespoke|sharp(?:ness)?)\b/i,
  /\b(dark|light)[- ](?:mode|theme\w*|base|ui|palette|backgrounds?)\b|\bdark-themed\b/i,
  /\b(zero[- ]transitions?|css transitions?|smooth transitions?|transition (?:policy|durations?)|animations?|motion|easing|micro-?interactions?|hover effects?)\b/i,
  /\b(hero (?:layout|section|grid|image)|layouts? like|split layouts?|\d+\/\d+ splits?|bottom-border\w*|border-only|(?:light|dark) surfaces?)\b/i,
  // Kiswahili (company memory ya Optimus imeandikwa kwa Kiswahili)
  /\b(rangi|fonti|uchapaji|mandhari|mtindo|mitindo|urembo|asimetr\w*|mistari safi|giza|gridi|mwonekano|vivuli)\b/i,
];

const PREF = /\b(mkuu|ceo|the client|client)\b[^.\n]{0,40}\b(prefers?|preferred|likes?|loves?|wants?|approved|dislikes?|hates?)\b|\bmkuu\b[^.\n]{0,40}\b(anapenda|anapendelea|hapendi|ameidhinisha)\b|\bapproved aesthetic\b/i;

/** teknolojia mahususi (stack picks) — mstari unaozitaja ni wa mradi wenye teknolojia hizo tu */
const TECH: [string, RegExp][] = [
  ["next.js", /\bnext\.?js\b|\bnext\s+1[2-9]\b|\bserver actions?\b|\buseActionState\b|\bnext-intl\b|\bapp router\b/i],
  ["react", /\breact\b/i], ["vue", /\bvue\b/i], ["svelte", /\bsvelte\w*\b/i], ["astro", /\bastro\b/i], ["hugo", /\bhugo\b/i],
  ["remix", /\bremix\b/i], ["nuxt", /\bnuxt\b/i], ["angular", /\bangular\b/i], ["tailwind", /\btailwind\w*\b/i],
  ["supabase", /\bsupabase\b|\brls\b|row level security/i], ["firebase", /\bfirebase\b/i], ["postgres", /\bpostgres\w*\b|\bpgtap\b/i],
  ["mysql", /\bmysql\b/i], ["mongodb", /\bmongo\w*\b/i], ["prisma", /\bprisma\b/i], ["drizzle", /\bdrizzle\b/i], ["zod", /\bzod\b/i],
  ["vercel", /\bvercel\b/i], ["netlify", /\bnetlify\b/i], ["cloudflare", /\bcloudflare\b/i], ["docker", /\bdocker\w*\b/i],
  ["pnpm", /\bpnpm\b/i], ["playwright", /\bplaywright\b/i], ["cypress", /\bcypress\b/i], ["jest", /\bjest\b/i], ["vitest", /\bvitest\b/i],
  ["axe-core", /\baxe(?:-core)?\b/i], ["github actions", /\bgithub actions\b/i], ["shadcn", /\bshadcn\b/i], ["radix", /\bradix\b/i],
  ["zustand", /\bzustand\b/i], ["redux", /\bredux\b/i], ["openapi", /\bopenapi\b/i], ["graphql", /\bgraphql\b/i], ["trpc", /\btrpc\b/i],
  ["express", /\bexpress(?:\.js)?\b(?=[^.\n]{0,40}\b(?:server|api|route|middleware)s?\b)/i], ["django", /\bdjango\b/i], ["laravel", /\blaravel\b/i],
  ["indexeddb", /\bindexeddb\b/i], ["pwa", /\bpwa\b|service workers?/i], ["stripe", /\bstripe\b/i], ["i18next", /\bi18next\b/i],
];

export function techTerms(text: string): string[] {
  const t = String(text || "");
  return TECH.filter(([, re]) => re.test(t)).map(([name]) => name);
}

/** Aina ya mstari. `fromChat` = mstari wa Chat (maneno ya Mkuu mwenyewe) — upendeleo wake si "kukisia". */
export function classifyLine(text: string, fromChat = false): LineKind {
  const t = String(text || "");
  if (DESIGN.some((re) => re.test(t))) return "design";
  if (!fromChat && PREF.test(t)) return "pref";
  if (techTerms(t).length) return "tech";
  return "lesson";
}

export interface CrossVerdict { ok: boolean; kind: LineKind; why?: string }

/**
 * Je, mstari wa mradi MWINGINE unaweza kuingia prompt ya kazi hii?
 * `context` = brief/agenda/kazi ya sasa (kwa ukaguzi wa teknolojia) · `relHits` = maneno ya uhusiano yaliyopatikana.
 */
export function crossProjectVerdict(line: { project: string; text: string }, context: string, relHits: number): CrossVerdict {
  const fromChat = /^chat$/i.test(String(line.project || "").trim());
  const kind = classifyLine(line.text, fromChat);
  if (kind === "design") return { ok: false, kind, why: "design ya mradi mwingine" };
  if (kind === "pref") return { ok: false, kind, why: "upendeleo uliokisiwa (Mkuu hakuutamka)" };
  if (kind === "tech") {
    const need = techTerms(line.text);
    const have = new Set(techTerms(context));
    const missing = need.filter((x) => !have.has(x));
    if (missing.length) return { ok: false, kind, why: `teknolojia ${missing.join("/")} haimo kwenye kazi hii` };
  }
  if (relHits < 2) return { ok: false, kind, why: "uhusiano mdogo" };
  return { ok: true, kind };
}

/** kitambulisho kifupi cha mstari (kwa trace ya logs — si maudhui) */
export function lineId(text: string): string {
  let h = 2166136261;
  const s = String(text || "");
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return `M${(h >>> 0).toString(36).slice(0, 5)}`;
}
