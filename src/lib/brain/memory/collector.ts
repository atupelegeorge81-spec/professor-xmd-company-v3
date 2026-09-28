// src/lib/brain/memory/collector.ts — ANAKUSANYA TU (si judge, hachuji).
// Submissions za kila agent: checkpoints za session (Appwrite + za process hii) + reflection.
import type { MemoryEvent } from "./events";
import type { Persona } from "../ids";

export interface Submission { persona: Persona; self: string[]; board: string[] }

export function collect(personas: Persona[], events: MemoryEvent[]): Submission[] {
  return personas.map((p) => {
    const mine = events.filter((e) => e.agent_id === p && e.status === "memory");
    return {
      persona: p,
      self: mine.map((e) => e.self_note || "").filter(Boolean),
      board: mine.map((e) => e.board_note || "").filter(Boolean),
    };
  });
}

/** Ondoa nakala (matukio yale yale kutoka Appwrite na kutoka process hii). */
export function dedupeEvents(list: MemoryEvent[]): MemoryEvent[] {
  const seen = new Set<string>();
  return list.filter((e) => {
    const k = `${e.agent_id}|${e.kind}|${e.agenda_index ?? "-"}|${(e.self_note || "").slice(0, 60)}|${(e.board_note || "").slice(0, 60)}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}
