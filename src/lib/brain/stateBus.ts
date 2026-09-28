// src/lib/brain/stateBus.ts — hali HALISI ya Board Room (inaandikwa na boardRunner, Runtime inasoma tu).
// Inaishi kwenye globalThis ili isipotee kwenye HMR; ni ya process hii tu (si Appwrite).

export interface BoardSnapshot {
  sessionId: string;
  project: string;
  status: "running" | "paused" | "done" | "halted";
  startedAt: number;
  updatedAt: number;
  phase: string;
  agendaTotal: number;
  agendaIndex: number;
  agendaItem: string;
  owners: string[];
  observers: string[];
  locked: { index: number; item: string; decision: string; status: string }[];
  objections: { index: number; by: string; outcome: string }[];
  reportSaved?: boolean;
  /** R12: matumizi HALISI ya tokens ya Board hii (kutoka recordUsage — exact ya provider au tokenizer) */
  usage?: { total: number; requests: number; byAgent: Record<string, { tokens: number; requests: number }> };
  /** tokens za Board mwanzoni mwa agenda ya sasa (tofauti = matumizi ya agenda hii) */
  agendaStartTokens?: number;
  /** hali ya mjadala wa owners wa agenda ya sasa (deliberation.ts) */
  delib?: { turn: number; cap: number; stall: number; mode: string; research: Record<string, number>; researchCap: number; queries: number; docsRead: number };
}

const g = globalThis as unknown as { __xmdBoardBus?: Map<string, BoardSnapshot> };
const bus: Map<string, BoardSnapshot> = (g.__xmdBoardBus ||= new Map());

export const stateBus = {
  update(sessionId: string, patch: Partial<BoardSnapshot>) {
    if (!sessionId) return;
    const prev = bus.get(sessionId);
    const base: BoardSnapshot = prev || {
      sessionId, project: "", status: "running", startedAt: Date.now(), updatedAt: Date.now(), phase: "starting",
      agendaTotal: 0, agendaIndex: 0, agendaItem: "", owners: [], observers: [], locked: [], objections: [],
    };
    bus.set(sessionId, { ...base, ...patch, updatedAt: Date.now() });
    // weka 6 za mwisho tu
    if (bus.size > 6) {
      const oldest = [...bus.values()].sort((a, b) => a.updatedAt - b.updatedAt)[0];
      if (oldest) bus.delete(oldest.sessionId);
    }
  },
  lock(sessionId: string, e: { index: number; item: string; decision: string; status: string }) {
    const s = bus.get(sessionId);
    if (!s) return;
    const locked = s.locked.filter((x) => x.index !== e.index).concat(e).sort((a, b) => a.index - b.index);
    this.update(sessionId, { locked });
  },
  objection(sessionId: string, o: { index: number; by: string; outcome: string }) {
    const s = bus.get(sessionId);
    if (s) this.update(sessionId, { objections: [...s.objections, o] });
  },
  get: (sessionId: string) => bus.get(sessionId),
  all: () => [...bus.values()].sort((a, b) => b.updatedAt - a.updatedAt),
};
