// src/lib/brain/memory/openMark.ts — R21: checkpoints za agenda iliyobaki OPEN zinawekewa alama ya wazi kabla ya
// reflection/collector/company memory. Chanzo: Mama Lishe A6 — checkpoints zilisema "locked" na company memory
// ikaiunganisha A6 (haijafungwa) na A3 (imefungwa) kana kwamba zote zimefungwa.
import { openSafe } from "./checkpoint";
import type { MemoryEvent } from "./events";

export const OPEN_TAG = (i: number) => `(Agenda ${i} stayed OPEN — NOT locked)`;

export function markOpenCheckpoints(events: MemoryEvent[], openIdx: number[]): MemoryEvent[] {
  if (!openIdx.length) return events;
  const open = new Set(openIdx);
  return events.map((e) => {
    if (e.kind !== "checkpoint" || e.agenda_index == null || !open.has(e.agenda_index)) return e;
    const n = openSafe({ self: e.self_note || "", board: e.board_note || "" });
    const tag = (s: string) =>
      s
        ? s
            .split("\n")
            .map((l) => (l.trim() && !l.includes(OPEN_TAG(e.agenda_index as number)) ? l.replace(/^(\s*-\s*(?:\[imp:\d\]\s*)?)?/, (m) => `${m}${OPEN_TAG(e.agenda_index as number)} `) : l))
            .join("\n")
        : s;
    return { ...e, self_note: n.self, board_note: tag(n.board) };
  });
}
