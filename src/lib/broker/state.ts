// src/lib/broker/state.ts — hali ya broker iliyo KUMBUKUMBU TU (globalThis; inaishi process nzima).
// Tokens/requests halisi zinaandikwa na usageTap → usageLedger (chanzo kimoja). Hapa ni:
//   reservations (leases zinazoendelea), afya ya kila lane (circuit), kupumzika (busyUntil), lanes zilizozimwa,
//   sticky (agent alitumia lane gani mara ya mwisho), timestamps za RPM ya OpenRouter, na wanaosubiri.

export interface Reservation { id: string; laneId: string; account: string; agentId: string; tokens: number; start: number; end?: number }
export interface Health { outcomes: boolean[]; fails: number; openUntil: number; ewmaMs: number | null }

export interface BrokerState {
  seq: number;
  leases: Map<string, Reservation>;
  recent: Reservation[]; // leases zilizokwisha (dakika 1 iliyopita) — kwa TPM ya Groq kabla header haijafika
  health: Map<string, Health>;
  busyUntil: Map<string, number>;
  disabled: Map<string, { until: number; reason: string }>;
  sticky: Map<string, { laneId: string; at: number }>;
  orMinute: Map<string, number[]>; // akaunti → timestamps za dispatch
  waiters: Set<() => void>;
  waiting: Map<string, { agentId: string; since: number; until: number | null; purpose: string }>;
}

const g = globalThis as unknown as { __xmdBroker?: BrokerState };

export function bstate(): BrokerState {
  return (g.__xmdBroker ||= {
    seq: 0, leases: new Map(), recent: [], health: new Map(), busyUntil: new Map(), disabled: new Map(),
    sticky: new Map(), orMinute: new Map(), waiters: new Set(), waiting: new Map(),
  });
}

export function health(laneId: string): Health {
  const S = bstate();
  let h = S.health.get(laneId);
  if (!h) S.health.set(laneId, (h = { outcomes: [], fails: 0, openUntil: 0, ewmaMs: null }));
  return h;
}

export function recordOutcome(laneId: string, ok: boolean, ms?: number): void {
  const h = health(laneId);
  h.outcomes.push(ok);
  if (h.outcomes.length > 20) h.outcomes.shift();
  if (ok) {
    h.fails = 0;
    h.openUntil = 0;
    if (ms != null) h.ewmaMs = h.ewmaMs == null ? ms : h.ewmaMs * 0.7 + ms * 0.3;
  } else if (++h.fails >= 3) {
    h.openUntil = Date.now() + 60_000 * Math.min(4, h.fails - 2); // circuit wazi: 1–4 dakika
  }
}

/** Afya 0.2..1 (asilimia ya mafanikio ya majaribio 20 ya mwisho). */
export function healthScore(laneId: string): number {
  const h = health(laneId);
  if (!h.outcomes.length) return 1;
  const ok = h.outcomes.filter(Boolean).length / h.outcomes.length;
  return Math.max(0.2, ok);
}

/** Amsha wote wanaosubiri (lease imeisha / lane imefunguka). */
export function wakeAll(): void {
  const S = bstate();
  const list = [...S.waiters];
  S.waiters.clear();
  for (const w of list) { try { w(); } catch { /* */ } }
}

export function pruneRecent(now = Date.now()): void {
  const S = bstate();
  S.recent = S.recent.filter((r) => (r.end ?? now) > now - 65_000);
  for (const [k, ts] of S.orMinute) S.orMinute.set(k, ts.filter((t) => t > now - 60_000));
}
