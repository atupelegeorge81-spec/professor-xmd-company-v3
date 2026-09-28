// scripts/skill-lib.mjs — parser + validator ya pamoja ya skills (library/<skill>/*.md).
// Validator imeportiwa kutoka anthropics/skills skill-creator/scripts/quick_validate.py
// (kanuni zile zile: SKILL.md lazima iwepo, frontmatter halali, keys zinazoruhusiwa, name kebab-case ≤64,
//  maelezo bila < > na ≤1024) + ukaguzi wa ziada wa moduli za PROFESSOR-XMD.
import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join } from "node:path";

export const PHASES = ["chat", "discussion", "code", "review", "fix", "observer", "objection", "assembly", "report", "memory", "scope", "agenda"];
export const PERSONAS = ["optimus", "ultron", "vextron", "megatron", "cybertron"];
const SKILL_KEYS = new Set(["id", "name", "owners", "line", "always", "trigger", "triggered", "upstream", "license"]);
const MODULE_KEYS = new Set(["id", "title", "phases", "priority", "when", "when_in", "upstream"]);
// thinkDirective inaruka prompt zenye maneno haya — skill isiyazae kwa bahati mbaya
const FORBIDDEN = [/REPORT MODE/, /REPORT REPAIR/, /Do not emit <think>/];

export function parseFront(raw) {
  const text = raw.replace(/\r\n/g, "\n");
  if (!text.startsWith("---")) return { error: "No YAML frontmatter found" };
  const m = text.match(/^---\n([\s\S]*?)\n---\n?/);
  if (!m) return { error: "Invalid frontmatter format" };
  const front = {};
  for (const line of m[1].split("\n")) {
    if (!line.trim()) continue;
    const kv = line.match(/^([a-z_-]+):\s?(.*)$/);
    if (!kv) return { error: `Invalid frontmatter line: ${line.slice(0, 60)}` };
    if (kv[1] in front) return { error: `Duplicate key: ${kv[1]}` };
    front[kv[1]] = kv[2].trim();
  }
  return { front, body: text.slice(m[0].length).trim() };
}
const list = (s) => String(s || "").split(",").map((x) => x.trim()).filter(Boolean);
function regexOk(src) {
  try { new RegExp(src, "i"); return null; } catch (e) { return String(e.message || e); }
}

/** Soma skill moja. Inarudisha { pack, errors[] } */
export function loadSkill(dir, folder) {
  const errors = [];
  const path = join(dir, folder);
  const skillMd = join(path, "SKILL.md");
  if (!existsSync(skillMd)) return { pack: null, errors: [`${folder}: SKILL.md not found`] };
  const p = parseFront(readFileSync(skillMd, "utf8"));
  if (p.error) return { pack: null, errors: [`${folder}/SKILL.md: ${p.error}`] };
  const f = p.front;
  const bad = Object.keys(f).filter((k) => !SKILL_KEYS.has(k));
  if (bad.length) errors.push(`${folder}/SKILL.md: Unexpected key(s): ${bad.sort().join(", ")}. Allowed: ${[...SKILL_KEYS].sort().join(", ")}`);
  for (const k of ["name", "line", "owners"]) if (!f[k]) errors.push(`${folder}/SKILL.md: Missing '${k}' in frontmatter`);
  const name = f.name || "";
  if (name) {
    if (!/^[a-z0-9-]+$/.test(name)) errors.push(`${folder}: Name '${name}' should be kebab-case (lowercase letters, digits, and hyphens only)`);
    if (name.startsWith("-") || name.endsWith("-") || name.includes("--")) errors.push(`${folder}: Name '${name}' cannot start/end with hyphen or contain consecutive hyphens`);
    if (name.length > 64) errors.push(`${folder}: Name is too long (${name.length} characters). Maximum is 64 characters.`);
    if (name !== folder) errors.push(`${folder}: name '${name}' must equal the folder name`);
  }
  if (f.id && f.id !== folder) errors.push(`${folder}: id '${f.id}' must equal the folder name`);
  const line = f.line || "";
  if (/[<>]/.test(line)) errors.push(`${folder}: Description (line) cannot contain angle brackets (< or >)`);
  if (line.length > 1024) errors.push(`${folder}: Description (line) is too long (${line.length}). Maximum is 1024 characters.`);
  const owners = f.owners === "all" ? "all" : list(f.owners);
  if (owners !== "all") for (const o of owners) if (!PERSONAS.includes(o)) errors.push(`${folder}: unknown owner '${o}'`);
  const always = list(f.always), triggered = list(f.triggered);
  for (const ph of [...always, ...triggered]) if (!PHASES.includes(ph)) errors.push(`${folder}: unknown phase '${ph}'`);
  if (f.trigger) { const e = regexOk(f.trigger); if (e) errors.push(`${folder}: trigger regex invalid: ${e}`); }
  if (triggered.length && !f.trigger) errors.push(`${folder}: 'triggered' phases need a 'trigger' regex`);

  const modules = [];
  const ids = new Set();
  for (const file of readdirSync(path).filter((x) => x.endsWith(".md") && x !== "SKILL.md").sort()) {
    const mp = parseFront(readFileSync(join(path, file), "utf8"));
    const where = `${folder}/${file}`;
    if (mp.error) { errors.push(`${where}: ${mp.error}`); continue; }
    const mf = mp.front;
    const badK = Object.keys(mf).filter((k) => !MODULE_KEYS.has(k));
    if (badK.length) errors.push(`${where}: Unexpected key(s): ${badK.join(", ")}`);
    const expect = `${folder}/${file.replace(/\.md$/, "")}`;
    if (mf.id !== expect) errors.push(`${where}: id must be '${expect}' (got '${mf.id}')`);
    if (ids.has(mf.id)) errors.push(`${where}: duplicate id`);
    ids.add(mf.id);
    if (!mf.title) errors.push(`${where}: missing title`);
    const phases = list(mf.phases);
    if (!phases.length) errors.push(`${where}: missing phases`);
    for (const ph of phases) if (!PHASES.includes(ph)) errors.push(`${where}: unknown phase '${ph}'`);
    const whenIn = list(mf.when_in);
    for (const ph of whenIn) if (!phases.includes(ph)) errors.push(`${where}: when_in phase '${ph}' not in phases`);
    if (whenIn.length && !mf.when) errors.push(`${where}: when_in without when`);
    const pr = Number(mf.priority);
    if (!Number.isInteger(pr) || pr < 1 || pr > 9) errors.push(`${where}: priority must be an integer 1..9`);
    if (mf.when) { const e = regexOk(mf.when); if (e) errors.push(`${where}: when regex invalid: ${e}`); }
    if (!mp.body || mp.body.length < 40) errors.push(`${where}: body is empty`);
    for (const rx of FORBIDDEN) if (rx.test(mp.body)) errors.push(`${where}: body contains forbidden marker ${rx}`);
    modules.push({ id: mf.id, title: mf.title || "", phases, priority: pr || 5, when: mf.when || "", whenIn, upstream: mf.upstream || "", body: mp.body });
  }
  if (!modules.length) errors.push(`${folder}: no modules`);
  for (const rx of FORBIDDEN) if (rx.test(p.body)) errors.push(`${folder}/SKILL.md: body contains forbidden marker ${rx}`);
  const pack = { id: folder, name, owners, line, always, trigger: f.trigger || "", triggered, upstream: f.upstream || "", license: f.license || "", header: p.body, modules };
  return { pack, errors };
}

/** Folders zote za skills (zinazoanza na _ zinarukwa; skill-creator = Skill Manager ya baadaye) */
export function skillFolders(dir, skip = new Set(["skill-creator"])) {
  return readdirSync(dir).filter((x) => !x.startsWith("_") && !skip.has(x) && statSync(join(dir, x)).isDirectory()).sort();
}
