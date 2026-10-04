// src/lib/brain/skills/selector.ts — uchaguzi wa MODULES za skills kwa wito mmoja.
// Hatua: (1) skills za agent huyu zinazohusika na phase hii (always / trigger / SKILL_REQUEST)
//        (2) modules zenye phase hii; module yenye `when` inahitaji maandishi/hitaji kulingana
//        (3) mpangilio kwa priority (1 = juu kabisa) → BRAIN_SKILL_BUDGET: module nzima ya priority ya chini
//            inaachwa (HAIKATWI nusu) na inaandikwa kwenye log.
import { SKILLS, ownsSkill, skillMeta, findModule, moduleWhen, moduleShort, type SkillId, type SkillModuleDoc } from "./registry";
import type { Persona } from "../ids";

export type Surface = "chat" | "board";
export type Phase =
  | "chat" | "discussion" | "code" | "review" | "fix" | "observer" | "objection" | "assembly" | "report" | "memory" | "scope" | "agenda" | "plan";

export interface ModulePick { skill: SkillId; module: SkillModuleDoc; why: string; forced: boolean }
export interface SkillSelection {
  picks: ModulePick[];
  /** skills zilizopakiwa (kwa mpangilio) */
  skills: SkillId[];
  /** modules zilizoachwa kwa sababu ya budget */
  dropped: string[];
  chars: number;
}

/** Budget ya herufi za skills kwa wito mmoja (0 = bila kikomo). Module haikatwi — inaachwa nzima. */
export const SKILL_BUDGET = (() => {
  const v = Number(process.env.BRAIN_SKILL_BUDGET);
  return Number.isFinite(v) && v >= 0 && process.env.BRAIN_SKILL_BUDGET !== undefined ? v : 0; // default: bila kikomo (Mkuu: "usiwaze tokens")
})();

// maombi ya SKILL_REQUEST — yanaingia kwenye wito UNAOFUATA wa agent huyo (per process)
const g = globalThis as unknown as { __xmdSkillReq?: Map<string, Set<string>> };
const pending: Map<string, Set<string>> = (g.__xmdSkillReq ||= new Map());
const key = (scope: string, p: Persona) => `${scope}:${p}`;

/** id = "skill" au "skill/module" */
export function requestSkill(scope: string, p: Persona, id: string) {
  const k = key(scope, p);
  if (!pending.has(k)) pending.set(k, new Set());
  pending.get(k)!.add(id);
}
function takeRequests(scope: string, p: Persona): string[] {
  const k = key(scope, p);
  const s = pending.get(k);
  if (!s) return [];
  pending.delete(k);
  return [...s];
}

const NEED_RESEARCH = /research|evidence (missing|haitoshi|insufficient)|search (failed|imeshindwa)|RESEARCH_REQUEST/i;

export function selectSkills(o: { persona: Persona; surface: Surface; phase: Phase; text: string; need?: string; scope: string }): SkillSelection {
  const out: SkillSelection = { picks: [], skills: [], dropped: [], chars: 0 };
  if (o.phase === "memory") return out;
  const hay = `${o.text || ""}\n${o.need || ""}`;
  // hitaji la "evidence missing / search failed" linaamsha research-lookup tu (si kila skill yenye neno "evidence")
  const trigHay = `${o.text || ""}\n${(o.need || "").replace(new RegExp(NEED_RESEARCH.source, "gi"), " ")}`;
  const requests = takeRequests(o.scope, o.persona);
  const reqSkills = new Set(requests.filter((r) => !r.includes("/")));
  const reqModules = new Set(requests.filter((r) => r.includes("/")));
  for (const m of reqModules) reqSkills.delete(m.split("/")[0]);

  // (1) skills zinazohusika
  const active: { id: SkillId; why: string; forced: boolean }[] = [];
  for (const s of SKILLS) {
    const mine = ownsSkill(o.persona, s);
    const forced = reqSkills.has(s.id);
    if (!mine && !forced) continue;
    let why = "";
    if (forced) why = "SKILL_REQUEST";
    else if (s.always.includes(o.phase)) why = `${o.phase} phase`;
    else if (s.triggered.includes(o.phase) && s.trigger?.test(trigHay)) why = "trigger";
    else if (s.id === "research-lookup" && NEED_RESEARCH.test(o.need || "")) why = "need: research";
    if (why) active.push({ id: s.id, why, forced });
  }

  // (2) modules
  const cands: ModulePick[] = [];
  for (const a of active) {
    const s = skillMeta(a.id)!;
    for (const m of s.pack.modules) {
      if (a.forced) { cands.push({ skill: a.id, module: m, why: a.why, forced: true }); continue; }
      if (!m.phases.includes(o.phase)) continue;
      const rx = moduleWhen(m);
      const whenApplies = !!rx && (!m.whenIn.length || m.whenIn.includes(o.phase));
      if (whenApplies && !rx!.test(hay)) continue;
      cands.push({ skill: a.id, module: m, why: a.why, forced: false });
    }
  }
  for (const id of reqModules) {
    const m = findModule(id);
    if (m && !cands.some((c) => c.module.id === id)) cands.push({ skill: id.split("/")[0], module: m, why: "SKILL_REQUEST", forced: true });
  }

  // (3) mpangilio + budget (header ya skill inahesabiwa mara moja)
  const order = new Map(SKILLS.map((s, i) => [s.id, i]));
  cands.sort((x, y) =>
    Number(y.forced) - Number(x.forced) ||
    x.module.priority - y.module.priority ||
    (order.get(x.skill)! - order.get(y.skill)!) ||
    0,
  );
  const headerDone = new Set<string>();
  for (const c of cands) {
    const header = headerDone.has(c.skill) ? 0 : (skillMeta(c.skill)?.pack.header.length || 0) + 80;
    const cost = c.module.body.length + header + 60;
    if (!c.forced && SKILL_BUDGET > 0 && out.chars + cost > SKILL_BUDGET) { out.dropped.push(c.module.id); continue; }
    out.picks.push(c);
    out.chars += cost;
    headerDone.add(c.skill);
  }
  // modules za skill moja zikae pamoja kwa mpangilio wa folder (maandishi yanasomeka kwa mtiririko wa asili)
  const skillOrder = [...new Set(out.picks.map((p) => p.skill))];
  out.picks.sort((x, y) => skillOrder.indexOf(x.skill) - skillOrder.indexOf(y.skill) || moduleIndex(x) - moduleIndex(y));
  out.skills = skillOrder;
  return out;
}
const moduleIndex = (p: ModulePick) => skillMeta(p.skill)!.pack.modules.findIndex((m) => m.id === p.module.id);

/** Maandishi ya skills (header ya kila skill mara moja + modules zake zote, kamili). */
export function renderSkills(sel: SkillSelection): string {
  const blocks: string[] = [];
  for (const sid of sel.skills) {
    const s = skillMeta(sid)!;
    const mods = sel.picks.filter((p) => p.skill === sid);
    blocks.push(
      `=== SKILL: ${sid} (${mods.length}/${s.pack.modules.length} modules for this moment) ===\n${s.pack.header}\n\n` +
        mods.map((p) => `--- MODULE ${p.module.id} — ${p.module.title} ---\n${p.module.body}`).join("\n\n"),
    );
  }
  return blocks.join("\n\n");
}

/** Mstari wa log: writing-plans(3) brainstorming(2) … (+dropped) */
export function selectionTag(sel: SkillSelection): string {
  const parts = sel.skills.map((s) => `${s}(${sel.picks.filter((p) => p.skill === s).length})`);
  return parts.join(" ") + (sel.dropped.length ? ` · budget dropped ${sel.dropped.length}` : "");
}

/** Katalogi fupi (kila wito): skills za agent huyu + majina ya modules zake. */
export function catalogueFor(p: Persona): { id: SkillId; line: string; modules: string[] }[] {
  return SKILLS.filter((s) => ownsSkill(p, s) && s.id !== "report-writing").map((s) => ({
    id: s.id,
    line: s.line,
    modules: [...new Set(s.pack.modules.map((m) => moduleShort(m.id).replace(/-\d+$/, "")))],
  }));
}

/**
 * Skill pack kwa prompts zisizopita brain.prompt (scope / agenda kwenye agenda.ts).
 * Inarudisha maandishi tayari + orodha ya ids (kwa log).
 */
export function skillPack(persona: Persona, phase: Phase, text: string, scope = "agenda"): { text: string; skills: SkillId[]; modules: string[]; tag: string; chars: number } {
  const sel = selectSkills({ persona, surface: "board", phase, text, scope });
  const body = renderSkills(sel);
  return {
    text: body
      ? `=== SKILLS FOR THIS STEP (guidance; the OUTPUT FORMAT rules above always override the length and shape of anything below) ===\n${body}`
      : "",
    skills: sel.skills,
    modules: sel.picks.map((p) => p.module.id),
    tag: selectionTag(sel),
    chars: sel.chars,
  };
}
