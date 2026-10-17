// src/lib/milestone/map.ts — TASK 12 (maelezo12): ramani ya milestones inaandikwa na Optimus (Gemini Flash lane kupitia
// broker iliyopo), inakaguliwa kwa validateMilestoneMap (Task 9); ikishindwa mara 3 → fallback ya code.
// Inatumika na boardRunner TU XMD_MILESTONES=1 ikiwa imewashwa.

import { AGENTS } from "@/lib/agents";
import { brokerComplete } from "@/lib/broker";
import { validateMilestoneMap } from "./schemas";
import type { Milestone, MilestoneMap } from "./types";

export const MAP_MAX_ATTEMPTS = 3;

/** Ids za roster kwenye ramani = majina halisi ya agents kwa herufi ndogo (optimus, ultron, …). */
export const MAP_AGENT_IDS: readonly string[] = AGENTS.map((a) => a.name.toLowerCase());

export const MAP_SYSTEM_PROMPT =
  "You are Optimus. Split the agenda list into milestones. Each milestone is a contiguous range of agendas that can be built AND verified (seen or measured). The FIRST milestone must be foundation/design (design tokens, base layout, base components) if the project has a UI. Dependent agendas go together or in order. The LAST milestone must be quality + deploy and include the last agenda. For each milestone give id, title, agendas{from,to}, phase, reviewMode(visual|technical|mixed), roster (agent ids relevant to this milestone only; always include optimus), rationale. Output JSON only.";

export type MapAgenda = string | { item: string };
export type MapLog = (level: "info" | "success" | "warning", text: string) => void;
export type MapComplete = (messages: { role: "system" | "user" | "assistant"; content: string }[]) => Promise<{ text: string; lane: string }>;

export interface MapInput {
  brief: string;
  agendas: MapAgenda[];
  hasUI: boolean;
  /** lazima: validator inahitaji map.sessionId isiyo tupu */
  sessionId: string;
  signal?: AbortSignal;
  log?: MapLog;
  /** sindano kwa tests za unit pekee; default = brokerComplete (Gemini, cls heavy → Flash tier) */
  complete?: MapComplete;
  env?: Record<string, string | undefined>;
}

export interface MapResult {
  map: MilestoneMap;
  usedFallback: boolean;
  attempts: number;
  /** retries zilizotumika = attempts - 1 (au 3 fallback ikitumika) */
  retries: number;
  errors: string[][];
  lanes: string[];
}

const titleOf = (a: MapAgenda) => (typeof a === "string" ? a : a.item).trim();

/** UI ipo? Kwa code: brief ikikanusha UI wazi → hapana; vinginevyo owners wa agenda wana designer/frontend, au brief inataja kitu kinachoonekana. */
export function detectHasUI(brief: string, agendas: { owners?: string[] }[]): boolean {
  if (/\b(hakuna|bila|no|without)\s+(ui|ux|frontend|website|tovuti|ukurasa|kurasa)\b/i.test(brief)) return false;
  if (agendas.some((a) => (a.owners || []).some((o) => o === "designer" || o === "frontend"))) return true;
  return /\b(ui|ux|website|web ?site|web ?app|landing|page|pages|frontend|screen|dashboard|tovuti|ukurasa|kurasa|muonekano)\b/i.test(brief);
}

export function mapUserPrompt(brief: string, agendas: MapAgenda[], hasUI: boolean): string {
  const team = AGENTS.map((a) => `- ${a.name.toLowerCase()}: ${a.name}, ${a.role}${a.id === "pm" ? " (lead; always in the roster)" : ""}`).join("\n");
  const list = agendas.map((a, i) => `${i + 1}. ${titleOf(a)}`).join("\n");
  return [
    `PROJECT BRIEF:\n${brief.slice(0, 6000)}`,
    `HAS UI: ${hasUI ? "yes" : "no"}`,
    `AGENTS (use these ids in roster):\n${team}`,
    `AGENDAS (${agendas.length}, numbered):\n${list}`,
    `Allowed phase values: foundation | core | secondary | quality_deploy. Ids are M1, M2, … in order. Agenda ranges must cover 1..${agendas.length} with no gap and no overlap.`,
    `Output: {"milestones":[{"id":"M1","title":"...","agendas":{"from":1,"to":3},"phase":"foundation","reviewMode":"visual","roster":["optimus","ultron"],"rationale":"..."}]}`,
  ].join("\n\n");
}

/** Hutoa JSON ya kwanza kwenye jibu ({…} au […]); haiongezi wala kurekebisha sehemu za milestone isipokuwa herufi za roster. */
export function parseMapText(text: string): { milestones: unknown } | null {
  const t = text.replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/```(?:json)?/gi, "").trim();
  const objAt = t.indexOf("{"), arrAt = t.indexOf("[");
  const isArr = arrAt >= 0 && (objAt < 0 || arrAt < objAt);
  const start = isArr ? arrAt : objAt;
  const end = t.lastIndexOf(isArr ? "]" : "}");
  if (start < 0 || end <= start) return null;
  try {
    const v = JSON.parse(t.slice(start, end + 1));
    const milestones = Array.isArray(v) ? v : v && typeof v === "object" ? (v as Record<string, unknown>).milestones : undefined;
    if (!Array.isArray(milestones)) return { milestones };
    return {
      milestones: milestones.map((m) => (m && typeof m === "object" && Array.isArray((m as Milestone).roster)
        ? { ...(m as Milestone), roster: (m as Milestone).roster.map((r) => (typeof r === "string" ? r.trim().toLowerCase() : r)) }
        : m)),
    };
  } catch {
    return null;
  }
}

/** Fallback ya code: milestones za ukubwa ceil(N/4) kwa mpangilio; ya kwanza foundation (hasUI), ya mwisho quality_deploy. */
export function fallbackMap(agendas: MapAgenda[], hasUI: boolean, sessionId = ""): MilestoneMap {
  const N = agendas.length;
  const size = Math.max(1, Math.ceil(N / 4));
  const milestones: Milestone[] = [];
  for (let from = 1, i = 0; from <= N; from += size, i++) {
    const to = Math.min(N, from + size - 1);
    const last = to === N;
    const phase = last ? "quality_deploy" : i === 0 && hasUI ? "foundation" : "core";
    const first = titleOf(agendas[from - 1]).slice(0, 60);
    milestones.push({
      id: `M${i + 1}`,
      title: phase === "foundation" ? `Foundation and design: ${first}` : phase === "quality_deploy" ? `Quality and deploy: ${first}` : `Agendas ${from}–${to}: ${first}`,
      agendas: { from, to },
      phase,
      reviewMode: "mixed",
      roster: [...MAP_AGENT_IDS],
      rationale: `code fallback: ${size} agenda(s) per milestone in order (ceil(${N}/4))`,
    });
  }
  return { version: 1, sessionId, totalAgendas: N, generatedBy: "code-fallback", usedFallback: true, milestones };
}

/** Test hook (XMD_TEST_HOOKS=1 + XMD_TEST_MAP_INVALID=1 PEKEE): jibu halisi la LLM linaharibiwa → validator inakataa. */
export function maybeBreakMapOutput(text: string, env: Record<string, string | undefined> = process.env): string {
  if (env.XMD_TEST_HOOKS !== "1" || env.XMD_TEST_MAP_INVALID !== "1") return text;
  return JSON.stringify({ milestones: [{ id: "M1", title: "xmdtest broken", agendas: { from: 2, to: 1 }, phase: "nope", reviewMode: "visual", roster: ["ghost"], rationale: "" }] });
}

/**
 * Test hook (XMD_TEST_HOOKS=1 + XMD_TEST_MAP_FORCE PEKEE): ramani inalazimishwa bila LLM.
 * Muundo: JSON [{"to": <namba>|"N", "roster": [...], "reviewMode"?: ...}, ...] — from = to ya iliyotangulia + 1.
 */
export function forcedMapFromEnv(env: Record<string, string | undefined>, N: number, hasUI: boolean, sessionId: string): MilestoneMap | null {
  if (env.XMD_TEST_HOOKS !== "1" || !env.XMD_TEST_MAP_FORCE) return null;
  let spec: { to: number | "N"; roster: string[]; reviewMode?: Milestone["reviewMode"]; title?: string }[];
  try { spec = JSON.parse(env.XMD_TEST_MAP_FORCE); } catch { return null; }
  if (!Array.isArray(spec) || !spec.length) return null;
  const milestones: Milestone[] = [];
  let from = 1;
  for (const s of spec) {
    if (from > N) break;
    const to = s.to === "N" ? N : Math.min(N, Math.max(from, Number(s.to)));
    milestones.push({ id: `M${milestones.length + 1}`, title: s.title || `xmdtest forced ${from}–${to}`, agendas: { from, to }, phase: "core", reviewMode: s.reviewMode || "mixed", roster: s.roster, rationale: "XMD_TEST_MAP_FORCE (test hook)" });
    from = to + 1;
  }
  if (!milestones.length) return null;
  if (from <= N) milestones[milestones.length - 1].agendas.to = N; // agenda zilizobaki → milestone ya mwisho
  if (hasUI) milestones[0].phase = "foundation";
  milestones[milestones.length - 1].phase = "quality_deploy";
  return { version: 1, sessionId, totalAgendas: N, generatedBy: "xmdtest-forced", usedFallback: false, milestones };
}

const defaultComplete = (signal?: AbortSignal): MapComplete => async (messages) => {
  const r = await brokerComplete({ agentId: "pm", purpose: "milestone-map", cls: "heavy", priority: "live", allow: ["gemini"], maxOut: 4000, temperature: 0.2, messages, signal });
  return { text: r.text, lane: `${r.lane.label} (tier ${r.lane.tier ?? "?"})` };
};

export async function generateMilestoneMap(input: MapInput): Promise<MapResult> {
  const { brief, agendas, hasUI, sessionId, signal } = input;
  const log: MapLog = input.log || ((lvl, t) => (lvl === "warning" ? console.warn(t) : console.log(t)));
  const complete = input.complete || defaultComplete(signal);
  const env = input.env || process.env;
  const N = agendas.length;
  const messages: { role: "system" | "user" | "assistant"; content: string }[] = [
    { role: "system", content: MAP_SYSTEM_PROMPT },
    { role: "user", content: mapUserPrompt(brief, agendas, hasUI) },
  ];
  const errors: string[][] = [];
  const lanes: string[] = [];

  const forced = forcedMapFromEnv(env, N, hasUI, sessionId);
  if (forced) {
    const fv = validateMilestoneMap(forced, N, MAP_AGENT_IDS, { hasUI });
    if (fv.ok) {
      log("info", `🧪 Milestone map: test hook XMD_TEST_MAP_FORCE — ${forced.milestones.map((m) => `${m.id} ${m.agendas.from}–${m.agendas.to} [${m.roster.join(", ")}]`).join(" · ")}`);
      return { map: fv.value, usedFallback: false, attempts: 0, retries: 0, errors, lanes };
    }
    log("warning", `🧪 XMD_TEST_MAP_FORCE si sahihi (${fv.errors.slice(0, 2).join(" | ")}) — LLM inatumika.`);
  }

  for (let attempt = 1; attempt <= MAP_MAX_ATTEMPTS; attempt++) {
    let text = "";
    try {
      const r = await complete(messages);
      lanes.push(r.lane);
      text = maybeBreakMapOutput(r.text, env);
    } catch (e: any) {
      if (signal?.aborted || e?.name === "AbortError") throw e;
      errors.push([`llm: ${String(e?.message || e).slice(0, 200)}`]);
      log("warning", `🗺️ Milestone map: jaribio ${attempt}/${MAP_MAX_ATTEMPTS} — LLM ilishindwa: ${String(e?.message || e).slice(0, 120)}`);
      continue;
    }
    const parsed = parseMapText(text);
    const candidate = parsed && { version: 1, sessionId, totalAgendas: N, generatedBy: `optimus@${lanes[lanes.length - 1] || "llm"}`, usedFallback: false, milestones: parsed.milestones };
    const v = candidate ? validateMilestoneMap(candidate, N, MAP_AGENT_IDS, { hasUI }) : { ok: false as const, errors: ["output: not valid JSON (expected {\"milestones\":[...]})"] };
    if (v.ok) {
      log("success", `🗺️ Milestone map: Optimus ameandika milestones ${v.value.milestones.length} kwa agenda ${N} (jaribio ${attempt}/${MAP_MAX_ATTEMPTS}).`);
      return { map: v.value, usedFallback: false, attempts: attempt, retries: attempt - 1, errors, lanes };
    }
    errors.push(v.errors);
    log("warning", `🗺️ Milestone map: jaribio ${attempt}/${MAP_MAX_ATTEMPTS} limekataliwa (${v.errors.length} makosa): ${v.errors.slice(0, 3).join(" | ").slice(0, 300)}`);
    messages.push(
      { role: "assistant", content: text.slice(0, 8000) },
      { role: "user", content: `Your map is invalid. Errors:\n${v.errors.map((x) => `- ${x}`).join("\n")}\nReturn the corrected complete JSON only.` },
    );
  }

  const map = fallbackMap(agendas, hasUI, sessionId);
  log("warning", `⚠️ Milestone map: Optimus ameshindwa mara ${MAP_MAX_ATTEMPTS} — fallback ya code imetumika (usedFallback=true): milestones ${map.milestones.length} za agenda ≤${Math.ceil(N / 4)} kila moja.`);
  return { map, usedFallback: true, attempts: MAP_MAX_ATTEMPTS, retries: MAP_MAX_ATTEMPTS, errors, lanes };
}
