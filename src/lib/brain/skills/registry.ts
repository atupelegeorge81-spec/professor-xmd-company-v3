// src/lib/brain/skills/registry.ts — metadata ya skills (wamiliki, lini zinapakiwa) kutoka library.generated.ts.
// Kila skill = folder library/<skill>/ : SKILL.md (header/glossary) + modules nyingi (.md) zenye phases/when/priority.
// Maandishi ni toleo la PROFESSOR-XMD la skills halisi za GitHub (asili ziko skills-upstream/).
import { SKILL_PACKS, type SkillModuleDoc, type SkillPackDoc } from "./library.generated";
import type { Persona } from "../ids";

export type SkillId = string;
export type { SkillModuleDoc, SkillPackDoc };

export interface SkillMeta {
  id: SkillId;
  line: string;
  owners: Persona[] | "all";
  /** phases ambazo skill inapakiwa bila trigger */
  always: string[];
  /** phases ambazo skill inapakiwa trigger ikilingana */
  triggered: string[];
  trigger?: RegExp;
  pack: SkillPackDoc;
}

const safeRx = (src: string): RegExp | undefined => {
  if (!src) return undefined;
  try { return new RegExp(src, "i"); } catch { return undefined; }
};

export const SKILLS: SkillMeta[] = Object.values(SKILL_PACKS).map((p) => ({
  id: p.id,
  line: p.line,
  owners: p.owners === "all" ? "all" : (p.owners as Persona[]),
  always: p.always,
  triggered: p.triggered,
  trigger: safeRx(p.trigger),
  pack: p,
}));

const MODULE_RX = new Map<string, RegExp | undefined>();
export function moduleWhen(m: SkillModuleDoc): RegExp | undefined {
  if (!MODULE_RX.has(m.id)) MODULE_RX.set(m.id, safeRx(m.when));
  return MODULE_RX.get(m.id);
}

export const skillMeta = (id: string) => SKILLS.find((s) => s.id === id);
export const skillExists = (id: string): boolean => !!skillMeta(id);
export const ownsSkill = (p: Persona, s: SkillMeta) => s.owners === "all" || s.owners.includes(p);
export const findModule = (id: string): SkillModuleDoc | undefined => skillMeta(id.split("/")[0])?.pack.modules.find((m) => m.id === id);
/** jina fupi la module (bila skill/ na bila -<namba> ya sehemu) */
export const moduleShort = (id: string) => id.split("/")[1] || id;

/**
 * Skill au module iliyoombwa kwa jina lolote → id.
 * "systematic debugging" → "systematic-debugging"; "peer-review/ethics" → "peer-review/ethics-integrity";
 * "critical thinking statistical pitfalls" (bila /) → skill tu.
 */
export function resolveSkill(name: string): string | null {
  const raw = String(name || "").toLowerCase().trim();
  if (!raw) return null;
  const norm = (s: string) => s.replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const [sPart, mPart] = raw.split("/");
  const n = norm(sPart);
  if (!n) return null;
  const hit =
    SKILLS.find((s) => s.id === n) ||
    SKILLS.find((s) => s.id.startsWith(n) || n.startsWith(s.id)) ||
    SKILLS.find((s) => s.id.includes(n) || n.includes(s.id));
  if (!hit) return null;
  if (!mPart) return hit.id;
  const m = norm(mPart);
  if (!m) return hit.id;
  const mods = hit.pack.modules;
  const mod =
    mods.find((x) => moduleShort(x.id) === m) ||
    mods.find((x) => moduleShort(x.id).startsWith(m)) ||
    mods.find((x) => moduleShort(x.id).includes(m));
  return mod ? mod.id : hit.id;
}
