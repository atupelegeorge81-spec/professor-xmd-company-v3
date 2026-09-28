#!/usr/bin/env node
// scripts/gen-skills.mjs — hujenga src/lib/brain/skills/library.generated.ts kutoka library/<skill>/*.md
// (SKILL.md = header/glossary ya skill; kila .md nyingine = module moja inayopakiwa kwa phase/hali yake).
// Skills zinabundle-iwa ndani ya server code; hakuna fs read wakati wa run.
// Endesha: `npm run gen:skills` baada ya kubadilisha chochote ndani ya library/.
import { writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill, skillFolders } from "./skill-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const dir = join(root, "src/lib/brain/skills/library");

const packs = {};
const errors = [];
for (const folder of skillFolders(dir)) {
  const r = loadSkill(dir, folder);
  errors.push(...r.errors);
  if (r.pack) packs[folder] = r.pack;
}
if (errors.length) {
  console.error(`gen:skills — ${errors.length} validation error(s):\n  ${errors.join("\n  ")}`);
  process.exit(1);
}
const out =
  "// AUTO-GENERATED na scripts/gen-skills.mjs — USIHARIRI kwa mkono. Chanzo: src/lib/brain/skills/library/<skill>/*.md\n" +
  "export interface SkillModuleDoc { id: string; title: string; phases: string[]; priority: number; when: string; whenIn: string[]; upstream: string; body: string }\n" +
  "export interface SkillPackDoc { id: string; name: string; owners: string[] | \"all\"; line: string; always: string[]; trigger: string; triggered: string[]; upstream: string; license: string; header: string; modules: SkillModuleDoc[] }\n" +
  `export const SKILL_PACKS: Record<string, SkillPackDoc> = ${JSON.stringify(packs, null, 1)};\n`;
writeFileSync(join(root, "src/lib/brain/skills/library.generated.ts"), out);
const mods = Object.values(packs).reduce((n, p) => n + p.modules.length, 0);
console.log(`skills: ${Object.keys(packs).length} packs, ${mods} modules → library.generated.ts (${out.length} chars)`);
