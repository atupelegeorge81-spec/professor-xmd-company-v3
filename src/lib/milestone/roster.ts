// src/lib/milestone/roster.ts — TASK 13 (maelezo13): washiriki wa agenda = roster ya milestone yenye agenda hiyo.
// Flag OFF au hakuna ramani → agents WOTE (tabia ya zamani, neno kwa neno).

import { AGENTS } from "@/lib/agents";
import { milestonesEnabled } from "./flag";
import type { Milestone, MilestoneMap } from "./types";

const ALL_IDS: string[] = AGENTS.map((a) => a.id);
/** roster ya ramani hutumia majina kwa herufi ndogo (optimus, ultron…) → agent id (pm, designer…) */
export const AGENT_ID_BY_ROSTER: Record<string, string> = Object.fromEntries(AGENTS.map((a) => [a.name.toLowerCase(), a.id]));

export function milestoneOf(map: MilestoneMap | null | undefined, agendaIndex: number): Milestone | null {
  return map?.milestones.find((m) => agendaIndex >= m.agendas.from && agendaIndex <= m.agendas.to) || null;
}

/** Agents (ids, mpangilio wa AGENTS) wanaoshiriki agenda hii. Optimus yupo daima. */
export function activeAgentsFor(runner: { msMap?: MilestoneMap | null }, agendaIndex: number, enabled = milestonesEnabled()): string[] {
  if (!enabled || !runner.msMap) return [...ALL_IDS];
  const m = milestoneOf(runner.msMap, agendaIndex);
  if (!m) return [...ALL_IDS];
  const ids = new Set(m.roster.map((r) => AGENT_ID_BY_ROSTER[String(r).toLowerCase()]).filter(Boolean));
  ids.add("pm");
  return ALL_IDS.filter((id) => ids.has(id));
}

/** Owners wa agenda ndani ya roster. Wote wakiwa nje: agents wa roster (si Optimus, hadi 2), vinginevyo Optimus peke yake. */
export function rosterOwners(owners: string[], active: string[]): string[] {
  if (ALL_IDS.every((id) => active.includes(id))) return owners; // hakuna kuchuja → sawa kabisa na zamani
  const kept = owners.filter((o) => active.includes(o));
  if (kept.length) return kept;
  const others = active.filter((id) => id !== "pm").slice(0, 2);
  return others.length ? others : ["pm"];
}

/** Majina yanayoonekana: "Optimus, Ultron, Vextron" */
export function participantNames(active: string[]): string {
  return active.map((id) => AGENTS.find((a) => a.id === id)?.name || id).join(", ");
}
