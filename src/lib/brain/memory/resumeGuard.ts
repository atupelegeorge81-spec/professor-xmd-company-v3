// src/lib/brain/memory/resumeGuard.ts — checkpoints salama wakati wa RESUME.
//   1) skip: agent ambaye tayari ana checkpoint ya (session, agenda) hii haandiki tena (hakuna nakala mbili)
//   2) backfill: Board ikikatika KATIKATI ya checkpoints (mini-report tayari kwenye Ledger), resume inaruka agenda
//      hiyo — hivyo checkpoints zilizokosekana zinaandikwa kutoka mini-report ya Ledger.
//      Gharama ina mipaka: agenda ya MWISHO iliyotatuliwa + agenda zozote zenye checkpoints nusu tu.
import { listSessionEvents, type MemoryEvent } from "./events";
import type { Persona } from "../ids";

export interface Existing { byAgenda: Map<number, Set<Persona>>; all: MemoryEvent[] }

export async function existingCheckpoints(sessionId: string, local: MemoryEvent[] = []): Promise<Existing> {
  const evs = [...(await listSessionEvents(sessionId, ["checkpoint"]).catch(() => [] as MemoryEvent[])), ...local];
  const byAgenda = new Map<number, Set<Persona>>();
  for (const e of evs) {
    if (e.agenda_index == null || e.status === "failed") continue;
    if (!byAgenda.has(e.agenda_index)) byAgenda.set(e.agenda_index, new Set());
    byAgenda.get(e.agenda_index)!.add(e.agent_id);
  }
  return { byAgenda, all: evs };
}

export const hasCheckpoint = (ex: Existing, agenda: number, p: Persona) => !!ex.byAgenda.get(agenda)?.has(p);

/**
 * Agenda zipi zinahitaji backfill? resolved = agenda zilizorukwa kwenye resume (index → owners).
 * Mwisho iliyotatuliwa (ilikuwa ikiandika checkpoints ilipokatika) + zenye checkpoints nusu.
 */
export function backfillPlan(ex: Existing, resolved: { index: number; owners: Persona[] }[]): { index: number; missing: Persona[] }[] {
  if (!resolved.length) return [];
  const last = Math.max(...resolved.map((r) => r.index));
  const out: { index: number; missing: Persona[] }[] = [];
  for (const r of resolved) {
    const have = ex.byAgenda.get(r.index);
    const partial = !!have && have.size > 0;
    if (r.index !== last && !partial) continue;
    const missing = r.owners.filter((p) => !have?.has(p));
    if (missing.length) out.push({ index: r.index, missing });
  }
  return out;
}
