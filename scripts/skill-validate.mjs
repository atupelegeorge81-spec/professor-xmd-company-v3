#!/usr/bin/env node
// scripts/skill-validate.mjs — port ya anthropics/skills quick_validate.py kwa muundo wa PROFESSOR-XMD.
// Matumizi: node scripts/skill-validate.mjs [skill-folder ...]   (bila hoja = skills zote)
import { join, dirname, basename, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadSkill, skillFolders } from "./skill-lib.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const lib = join(root, "src/lib/brain/skills/library");
const args = process.argv.slice(2);
const targets = args.length ? args.map((a) => ({ dir: dirname(resolve(a)), folder: basename(resolve(a)) })) : skillFolders(lib).map((f) => ({ dir: lib, folder: f }));
let bad = 0;
for (const t of targets) {
  const r = loadSkill(t.dir, t.folder);
  if (r.errors.length) { bad++; console.log(`✗ ${t.folder}\n  ${r.errors.join("\n  ")}`); }
  else console.log(`✓ ${t.folder}: Skill is valid! (${r.pack.modules.length} modules, ${r.pack.modules.reduce((n, m) => n + m.body.length, 0)} chars)`);
}
process.exit(bad ? 1 : 0);
