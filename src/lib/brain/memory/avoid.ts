// src/lib/brain/memory/avoid.ts — T36: KUMBUKUMBU KAMA ORODHA YA "USIRUDIE" (avoid-list), si mfano wa kunakili.
// Utafiti: AI zinarudia default zilezile hata bila kumbukumbu (Anthropic "distributional convergence", Artificial
// Hivemind NeurIPS 2025) — "usirudie kati ya vizazi" haifanyi kazi bila kumbukumbu ya kilichofanyika. Sisi TUNAYO:
// mipango ya miradi iliyopita (project_plans). Hapa tunatoa MUHTASARI WA MANENO (familia ya rangi, fonts, mtindo,
// stack) — si hex/vipimo vya kunakili — na tunawaambia agents wasivirudie isipokuwa brief ya SASA ikiviomba.
// Pia: diversityWarning() — baada ya Mpango Kazi kuhifadhiwa, onyo kama mradi mpya unafanana sana na wa karibuni.
import { listRecentPlans, type ProjectPlanDoc } from "@/lib/server/plans";
import { techTerms } from "./scope";
import type { Persona } from "../ids";

export interface Look { title: string; base: string; accents: string[]; fonts: string[]; style: string[]; stack: string[] }

const FONTS = [
  "Inter", "Fraunces", "Playfair Display", "Space Grotesk", "IBM Plex Sans", "IBM Plex Serif", "IBM Plex Mono", "Roboto", "Poppins",
  "DM Sans", "DM Serif Display", "Manrope", "Outfit", "JetBrains Mono", "Geist", "Lora", "Instrument Serif", "Satoshi", "Montserrat",
  "Sora", "Syne", "Clash Display", "General Sans", "Work Sans", "Nunito", "Lato", "Open Sans", "Source Serif", "Merriweather",
  "Cormorant", "EB Garamond", "Archivo", "Bricolage Grotesque", "Unbounded", "Epilogue", "Plus Jakarta Sans", "Figtree",
  "Public Sans", "Libre Baskerville", "Raleway", "Oswald", "Bebas Neue", "Rubik", "Karla", "Barlow", "Urbanist", "Lexend",
];
const STYLE: [string, RegExp][] = [
  ["editorial", /\beditorial\b/i], ["brutalist", /\bbrutalis\w*\b/i], ["hairlines", /\bhair-?lines?\b/i],
  ["zero-radius", /\bzero[- ]?(?:border-)?radius\b|\brounded-none\b|\bborder-radius:\s*0\b/i], ["glassmorphism", /\bglass\w*\b/i],
  ["bento grid", /\bbento\b/i], ["gradients", /\bgradients?\b/i], ["asymmetric layout", /\basymmetr\w*\b/i],
  ["minimalist", /\bminimalis\w*\b/i], ["broadsheet columns", /\bbroadsheet\b/i], ["monospace labels", /\bmonospace\b/i],
  ["zero transitions", /\bzero[- ]transitions?\b/i], ["all-caps eyebrows", /\beyebrows?\b|\ball[- ]caps\b/i],
];

function rgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as [number, number, number];
}
function hsl([r, g, b]: [number, number, number]): [number, number, number] {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2, d = mx - mn;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; if (h < 0) h += 360;
  return [h, s, l];
}
const HUES: [number, string][] = [[15, "red"], [40, "orange"], [55, "amber"], [70, "yellow"], [95, "lime"], [150, "green"], [175, "teal"], [200, "cyan"], [235, "blue"], [260, "indigo"], [290, "purple"], [330, "magenta"], [345, "pink"], [361, "red"]];
const hueName = (h: number) => (HUES.find(([mx]) => h < mx) || HUES[0])[1];

/** Muhtasari wa mwonekano wa mpango mmoja — maneno tu (familia), si thamani za kunakili. */
export function lookOf(title: string, text: string): Look {
  const t = String(text || "");
  const hexes = [...new Set((t.match(/#[0-9a-fA-F]{6}\b/g) || []).map((x) => x.toUpperCase()))].slice(0, 10);
  const cols = hexes.map((h) => hsl(rgb(h)));
  const darks = cols.filter(([, , l]) => l < 0.12).length;
  const lights = cols.filter(([, , l]) => l > 0.9);
  const warmLight = lights.some(([h, s]) => s > 0.15 && h >= 20 && h <= 60);
  const first = cols[0];
  const base = !cols.length ? "" : (first && first[2] < 0.12) || darks >= 2 ? "near-black/dark base" : warmLight ? "cream/warm off-white base" : lights.length ? "white/light base" : "mid-tone base";
  const accents = [...new Set(cols.filter(([, s, l]) => s > 0.35 && l > 0.2 && l < 0.8).map(([h]) => hueName(h)))].slice(0, 3);
  const fonts = FONTS.filter((f) => new RegExp(`\\b${f.replace(/ /g, "\\s+")}\\b`, "i").test(t)).slice(0, 4);
  const style = STYLE.filter(([, re]) => re.test(t)).map(([n]) => n).slice(0, 6);
  const stack = techTerms(t).slice(0, 8);
  return { title: String(title || "").slice(0, 60), base, accents, fonts, style, stack };
}

const lookLine = (l: Look) =>
  [l.base, l.accents.length ? `${l.accents.join("/")} accent` : "", l.fonts.length ? `fonts ${l.fonts.join(" + ")}` : "", l.style.length ? `style: ${l.style.join(", ")}` : ""].filter(Boolean).join(" · ");

const SEES_LOOK: Persona[] = ["ultron", "vextron", "optimus"];
const SEES_STACK: Persona[] = ["vextron", "megatron", "cybertron", "optimus"];

/** Block ya prompt (safi — inajaribiwa bila DB). Inarudisha "" kama hakuna cha kuonyesha. */
export function renderAvoid(p: Persona, looks: Look[]): string {
  const parts: string[] = [];
  if (SEES_LOOK.includes(p)) {
    const ls = looks.map((l) => ({ l, s: lookLine(l) })).filter((x) => x.s);
    if (ls.length) parts.push(`LOOKS THE COMPANY ALREADY SHIPPED (recent projects):\n${ls.map((x) => `- ${x.l.title}: ${x.s}`).join("\n")}\nThis project must get its OWN visual identity from ITS brief. Do NOT reuse these base/accent families, font pairings or style signatures unless THIS brief explicitly asks for them. If your idea is drifting toward one of them, pick a clearly different direction and say why it fits this brief.`);
  }
  if (SEES_STACK.includes(p)) {
    const counts = new Map<string, number>();
    for (const l of looks) for (const t of l.stack) counts.set(t, (counts.get(t) || 0) + 1);
    const top = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t, n]) => `${t} (${n}/${looks.length})`);
    if (top.length) parts.push(`STACK HABITS OF RECENT PROJECTS: ${top.join(", ")}.\nThese are habits, not defaults. Follow the brief when it names a stack. When it does not, choose what fits THIS project's needs, and for each major pick (framework, database, hosting, test tooling) name one real alternative you considered and why this brief favours your choice.`);
  }
  if (!parts.length) return "";
  return `=== FRESH START — DO NOT REPEAT PAST PROJECTS (T36) ===\n${parts.join("\n\n")}`;
}

const TTL = 5 * 60_000;
const g = globalThis as unknown as { __xmdAvoid?: { at: number; plans: ProjectPlanDoc[] } };

async function recentPlans(): Promise<ProjectPlanDoc[]> {
  const hit = g.__xmdAvoid;
  if (hit && Date.now() - hit.at < TTL) return hit.plans;
  const plans = await listRecentPlans(10);
  g.__xmdAvoid = { at: Date.now(), plans };
  return plans;
}

const planText = (d: ProjectPlanDoc) => `${d.objective}\n${d.constraints}\n${d.plan_content}`;

/** Miradi 5 ya karibuni ISIYO kikao hiki. */
export async function recentLooks(excludeSessionId?: string, n = 5): Promise<Look[]> {
  const plans = await recentPlans();
  return plans.filter((d) => !excludeSessionId || d.session_id !== excludeSessionId).slice(0, n).map((d) => lookOf(d.title, planText(d)));
}

/** Board pekee, si kwa ripoti/assembly/memory. Kosa lolote → "" (prompt inaendelea bila block hii). */
export async function avoidBlock(o: { persona: Persona; surface: string; phase: string; sessionId?: string }): Promise<string> {
  if (o.surface !== "board" || ["report", "assembly", "memory"].includes(o.phase)) return "";
  if (!SEES_LOOK.includes(o.persona) && !SEES_STACK.includes(o.persona)) return "";
  try {
    return renderAvoid(o.persona, await recentLooks(o.sessionId));
  } catch {
    return "";
  }
}

/** Ulinganisho wa mwonekano: base sawa + font moja sawa, au base sawa + mitindo 2+ sawa → "inafanana sana". */
export function similarTo(now: Look, past: Look[]): { title: string; shared: string[] } | null {
  for (const p of past) {
    if (!now.base || now.base !== p.base) continue;
    const fonts = now.fonts.filter((f) => p.fonts.includes(f));
    const style = now.style.filter((s) => p.style.includes(s));
    const accents = now.accents.filter((a) => p.accents.includes(a));
    if (fonts.length || style.length >= 2 || (accents.length && style.length)) return { title: p.title, shared: [now.base, ...accents.map((a) => `${a} accent`), ...fonts, ...style] };
  }
  return null;
}

/** Baada ya kuhifadhi Mpango Kazi: onyo (si kizuizi) kama mradi huu unafanana sana na mmoja wa miradi 5 ya karibuni. */
export async function diversityWarning(sessionId: string, title: string, text: string): Promise<string> {
  try {
    const hit = similarTo(lookOf(title, text), await recentLooks(sessionId));
    return hit ? `⚠️ Utofauti (T36): mwonekano wa mradi huu unafanana na "${hit.title}" — ${hit.shared.join(" · ")}. Kama brief haikuomba hivyo, Ultron alipaswa kuchagua mwelekeo mwingine.` : "";
  } catch {
    return "";
  }
}
