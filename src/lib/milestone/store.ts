// src/lib/milestone/store.ts — TASK 10: persist/load ya MilestoneMap + MilestoneState za session.
//
// Inatumia persistence ILIYOPO tu: table `boardroom_sessions`, column `items` (pack/unpack ya gz1),
// na hidden chips (muundo wa CuChip / __PROFESSOR_XMD_RESUME_STATE__). Hakuna table wala column mpya.
//   • Kila rekodi ni chip moja: id `__professor_xmd_ms__<key>`, text `__PROFESSOR_XMD_MILESTONE__:{key,version,data}`.
//     key = "map" au "state:M1".
//   • Compare-and-set: (1) kiwango cha rekodi — expectedVersion lazima ilingane na version iliyopo, vinginevyo
//     MilestoneConflictError; (2) kiwango cha row — update ina sharti `updated_at = thamani iliyosomwa`, kwa hiyo
//     writer mwingine akiandika katikati hakuna update inayopotea (tunasoma upya na kukagua version tena).
//   • Inert bila XMD_MILESTONES: kila function inakataa (hakuna read/write).

import { supabase, SESSIONS_COL } from "@/lib/server/appwrite";
import { pack, unpack } from "@/lib/server/packed";
import { milestonesEnabled } from "./flag";
import { validateMilestoneState } from "./schemas";
import type { MilestoneMap, MilestoneState } from "./types";

export const MS_PREFIX = "__PROFESSOR_XMD_MILESTONE__:";
const chipIdOf = (key: string) => `__professor_xmd_ms__${key}`;
/** Chip iliyofichwa ya rekodi (umbo moja na la putRecord) — runner hai huiweka kwenye runner.items ili persist isiifute. */
export const msChip = (key: string, version: number, data: unknown) => ({ kind: "chip" as const, id: chipIdOf(key), text: MS_PREFIX + JSON.stringify({ key, version, data }) });
export const stateKey = (milestoneId: string) => `state:${milestoneId}`;
export const MAP_KEY = "map";

export interface Versioned<T> {
  version: number;
  data: T;
}

export class MilestoneConflictError extends Error {
  readonly code = "VERSION_CONFLICT";
  constructor(readonly sessionId: string, readonly key: string, readonly expected: number, readonly found: number) {
    super(`version conflict on ${key} (session ${sessionId.slice(0, 8)}): expected version ${expected}, found ${found} — re-read and retry`);
    this.name = "MilestoneConflictError";
  }
}

function assertEnabled(): void {
  if (!milestonesEnabled()) throw new Error("milestone store is disabled (XMD_MILESTONES is off)");
}

interface Doc {
  items: any[];
  updatedAt: string | null;
}

async function readDoc(sessionId: string): Promise<Doc> {
  const { data, error } = await supabase.from(SESSIONS_COL).select("items,updated_at").eq("id", sessionId).maybeSingle();
  if (error) throw new Error(`[milestone/store] read ${sessionId.slice(0, 8)}: ${error.message}`);
  if (!data) throw new Error(`[milestone/store] session not found: ${sessionId}`);
  let items: any[] = [];
  try {
    const v = JSON.parse(unpack((data as any).items) || "[]");
    if (Array.isArray(v)) items = v;
  } catch {
    throw new Error(`[milestone/store] items of ${sessionId.slice(0, 8)} are not valid JSON`);
  }
  return { items, updatedAt: (data as any).updated_at ?? null };
}

function recordOf<T>(items: any[], key: string): Versioned<T> | null {
  const it = items.find((x) => x?.kind === "chip" && x?.id === chipIdOf(key) && typeof x?.text === "string" && x.text.startsWith(MS_PREFIX));
  if (!it) return null;
  try {
    const r = JSON.parse(it.text.slice(MS_PREFIX.length));
    return Number.isInteger(r?.version) ? { version: r.version, data: r.data as T } : null;
  } catch {
    return null;
  }
}

/** Kanuni za uadilifu kati ya toleo la zamani na jipya (lane log append-only; step DONE haibadiliki). */
function integrityErrors(key: string, prev: unknown, next: unknown): string[] {
  if (!key.startsWith("state:")) return [];
  const v = validateMilestoneState(next);
  const errs = v.ok ? [] : [...v.errors];
  const p = prev as MilestoneState | null;
  const n = next as MilestoneState;
  if (`state:${n?.id}` !== key) errs.push(`state.id: must match key ${key} (got ${JSON.stringify(n?.id)})`);
  if (p && n && Array.isArray(n.lanesUsed)) {
    const a = JSON.stringify(p.lanesUsed || []);
    const b = JSON.stringify((n.lanesUsed || []).slice(0, (p.lanesUsed || []).length));
    if (a !== b || n.lanesUsed.length < (p.lanesUsed || []).length) errs.push("state.lanesUsed: append-only — existing entries were changed or removed");
  }
  if (p && n) for (const s of p.steps || []) {
    if (s.status !== "DONE") continue;
    const now = (n.steps || []).find((x) => x.stepId === s.stepId);
    if (!now || now.status !== "DONE") errs.push(`state.steps: ${s.stepId} was DONE and must stay DONE`);
  }
  return errs;
}

const nextTs = (prev: string | null): string => {
  const p = prev ? Date.parse(prev) : 0;
  return new Date(Math.max(Date.now(), (Number.isNaN(p) ? 0 : p) + 1)).toISOString();
};

/** Soma rekodi moja (null kama haipo). */
/** TASK-13: ramani kutoka items zilizohifadhiwa (resume) — bila kugusa DB; null ikiwa haipo/mbovu. */
export function readMsMap(items: unknown): MilestoneMap | null {
  try { return recordOf<MilestoneMap>(Array.isArray(items) ? items : [], MAP_KEY)?.data ?? null; } catch { return null; }
}

export async function getRecord<T>(sessionId: string, key: string): Promise<Versioned<T> | null> {
  assertEnabled();
  return recordOf<T>((await readDoc(sessionId)).items, key);
}

/** Pakia map + states zote za session. */
export async function loadMilestones(sessionId: string): Promise<{ map: Versioned<MilestoneMap> | null; states: Record<string, Versioned<MilestoneState>> }> {
  assertEnabled();
  const { items } = await readDoc(sessionId);
  const states: Record<string, Versioned<MilestoneState>> = {};
  for (const it of items) {
    if (it?.kind !== "chip" || typeof it?.text !== "string" || !it.text.startsWith(MS_PREFIX) || !String(it.id).startsWith(chipIdOf("state:"))) continue;
    const key = String(it.id).slice(chipIdOf("").length);
    const r = recordOf<MilestoneState>(items, key);
    if (r) states[key.slice("state:".length)] = r;
  }
  return { map: recordOf<MilestoneMap>(items, MAP_KEY), states };
}

/**
 * Compare-and-set: andika `data` kama version expectedVersion+1. expectedVersion 0 = rekodi mpya (lazima isiwepo).
 * Version ikiwa tofauti → MilestoneConflictError. Row ikibadilishwa na mwingine katikati → soma upya, kagua tena.
 */
export async function putRecord<T>(sessionId: string, key: string, data: T, expectedVersion: number): Promise<Versioned<T>> {
  assertEnabled();
  for (let attempt = 0; attempt < 25; attempt++) {
    const doc = await readDoc(sessionId);
    const cur = recordOf<T>(doc.items, key);
    const found = cur?.version ?? 0;
    if (found !== expectedVersion) throw new MilestoneConflictError(sessionId, key, expectedVersion, found);
    const errs = integrityErrors(key, cur?.data ?? null, data);
    if (errs.length) throw new Error(`[milestone/store] invalid ${key}: ${errs.join("; ")}`);

    const version = expectedVersion + 1;
    const chip = msChip(key, version, data);
    const idx = doc.items.findIndex((x) => x?.kind === "chip" && x?.id === chip.id);
    const items = [...doc.items];
    if (idx >= 0) items[idx] = chip; else items.push(chip);

    let q = supabase.from(SESSIONS_COL).update({ items: pack(JSON.stringify(items)), updated_at: nextTs(doc.updatedAt) }).eq("id", sessionId);
    q = doc.updatedAt === null ? q.is("updated_at", null) : q.eq("updated_at", doc.updatedAt);
    const { data: rows, error } = await q.select("id");
    if (error) throw new Error(`[milestone/store] write ${key}: ${error.message}`);
    if (rows && rows.length === 1) return { version, data };
    // row ilibadilika (writer mwingine) → rudia: tukikuta version mpya ya rekodi hii → conflict ya wazi
    await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 20)));
  }
  throw new Error(`[milestone/store] write ${key}: row kept changing (25 attempts)`);
}

/** Read → mutate → CAS, ukirudia kwenye conflict (writers wengi). mutate inapokea data ya sasa (au null). */
export async function updateRecord<T>(sessionId: string, key: string, mutate: (cur: T | null, version: number) => T, opts: { maxRetries?: number } = {}): Promise<Versioned<T>> {
  assertEnabled();
  const max = opts.maxRetries ?? 100;
  for (let i = 0; ; i++) {
    const cur = await getRecord<T>(sessionId, key);
    try {
      return await putRecord(sessionId, key, mutate(cur?.data ?? null, cur?.version ?? 0), cur?.version ?? 0);
    } catch (e) {
      if (!(e instanceof MilestoneConflictError) || i >= max) throw e;
      await new Promise((r) => setTimeout(r, 5 + Math.floor(Math.random() * 30)));
    }
  }
}
