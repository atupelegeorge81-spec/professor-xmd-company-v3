// src/lib/cu/autoResume.ts — R31-G4: auto-resume ya session iliyopumzika (quota ya siku imeisha).
// Njia 3 (belt + suspenders):
//   (1) Timer ya ndani ya engine (instance ikiishi hadi resumeAt)
//   (2) instrumentation: server ikianza (boot) — scan ya paused + interval
//   (3) /api/boardroom/active: kila ombi linalofika (app ikiwahi kufunguliwa/traffic yoyote)
//          → checkPausedDue() ina throttle yake (60s) — haitoi mzigo.

import { Query } from "node-appwrite"; // helpers tu — R42.1: client ya Appwrite imeondolewa
import { readCuChip, cuChipItem, isHiddenCuChip, CU_BUCKET } from "./engine";
import { databases, DB, appwriteConfigured } from "@/lib/server/appwrite"; // Supabase façade
import { publicFileUrl } from "@/lib/server/supabase";
import { unpack } from "@/lib/server/packed";
import { RESUME_PREFIX } from "@/lib/usageChip";

const inflight = new Set<string>();
let lastCheck = 0;

// R42.1: Supabase façade — hakuna client ya Appwrite tena (logic ileile ya R40)
function dbOf() {
  return appwriteConfigured ? { db: databases, databaseId: DB } : null;
}

/** Endeleza session (runner hai → unpause; Koyeb ililala → rehydrate kutoka Appwrite). */
export async function autoResumeSession(sessionId: string): Promise<boolean> {
  if (!sessionId || inflight.has(sessionId)) return false;
  inflight.add(sessionId);
  try {
    const { resumeRun, streamRunner } = await import("@/lib/boardRunner");
    const runner = await resumeRun(sessionId, "system"); // TASK-1: auto-recovery = system
    if (!runner || runner === "busy" || runner === "pausing" || runner === "user_paused") return false; // R38-RC5: "pausing" = snapshot bado inapangwa — tick ijayo itajaribu; TASK-1: "user_paused" = user-Detach, KIMYA usiguse
    // stream isifungwe bila msomaji — tuna-drain kama "client" wa kimya (kazi inaendelea server-side)
    const res = streamRunner(runner) as unknown as Response;
    if (res?.body) {
      const rd = res.body.getReader();
      void (async () => {
        try {
          for (;;) {
            const { done } = await rd.read();
            if (done) break;
          }
        } catch { /* kimya */ }
        finally { inflight.delete(sessionId); }
      })();
    } else {
      inflight.delete(sessionId);
    }
    console.log(`[cu/autoResume] ♻️ ${sessionId.slice(0, 8)}… imeanza tena (auto-resume).`);
    return true;
  } catch (e) {
    inflight.delete(sessionId);
    console.warn(`[cu/autoResume] ✗ ${sessionId.slice(0, 8)}…: ${String(e).slice(0, 160)}`);
    return false;
  }
}

/** Scan ya sessions zilizo "paused" — zile ambazo resumeAt imepita zinaendelea YENYEWE. */
export async function checkPausedDue(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastCheck < 60_000) return 0;
  lastCheck = now;
  const a = dbOf();
  if (!a) return 0;
  try {
    const docs = await a.db.listDocuments(a.databaseId, "boardroom_sessions", [Query.equal("status", "paused"), Query.limit(10)]);
    let resumed = 0;
    for (const d of docs.documents || []) {
      const items = itemsOfDoc(d); // TASK-5: items huhifadhiwa zimebanwa (gz1:) — zamani Array.isArray ilikosa kila mara
      const chip = pauseMetaOf(items); // TASK-5: CU chip hai, au resume state (pause ya awamu ya mjadala)
      if (!chip) continue;
      // TASK-1 (hatua 4): chip yenye origin "user" au bila resumeAt — haigusiwi kabisa
      if (chip.pauseOrigin === "user") continue;
      const resumeAt = Number(chip.resumeAt) || 0;
      if (!resumeAt) continue; // pause ya mwandamizi (manual) — haigusiwi
      if (resumeAt <= now) {
        if (await autoResumeSession(d.$id)) resumed += 1;
      }
    }
    if (resumed) console.log(`[cu/autoResume] ♻️ ${resumed} session(s) zimeendelezwa (quota ilirudi).`);
    return resumed;
  } catch (e) {
    console.warn(`[cu/autoResume] check imekufa: ${String(e).slice(0, 140)}`);
    return 0;
  }
}

/* ================= TASK-5 (maelezo5): ORPHAN SWEEPER =================
 * Process ikifa ghafla (SIGKILL/OOM/crash/deploy) session inabaki "inaendelea" kwenye DB bila runner hai.
 * Sweeper inaigeuza kuwa SYSTEM pause (resumeAt = sasa + 60s) — kisha checkPausedDue (njia iliyopo) inaiendeleza.
 * Sweeper YENYEWE haiendelezi session.
 * Status zinazohesabiwa (uamuzi wa CEO, option A): "running" + status zote za kazi inayoendelea (allowlist).
 * + (uamuzi wa CEO, pengo la SIGTERM): "paused" ya SYSTEM bila resumeAt — timer ya kurudisha ilikufa na process
 *   (watchdog/SIGTERM ya awamu ya mjadala). Pause ya user (Detach) au yenye resumeAt HAIGUSWI.
 * HAZIGUSWI kamwe: completed · error · finale_incomplete · stopped · user-paused · status yoyote isiyojulikana.
 * DHANA: instance MOJA tu (Koyeb). Instance mbili → moja ingeweza kuiba session ya nyingine
 * (runner hai + staleness vinapunguza hatari, havitoi kabisa) — PROGRESS.md.
 */
export const ORPHAN_STALE_MS = 10 * 60_000;
export const ORPHAN_RESUME_DELAY_MS = 60_000;
export const ORPHAN_CHIP_TEXT = "♻️ Recovered after crash — auto-resume in 60 s";
const IN_PROGRESS = /^(running|title_created|agenda_created|facts_locked|report_saved|plan_saved|agenda_\d+_(locked|open|mini|mini_resume)|report_part_[\w-]+|plan_part_[\w-]+)$/;
const TERMINAL = ["completed", "error", "finale_incomplete", "stopped"];

/** Kizingiti cha staleness — XMD_TEST_ORPHAN_STALE_MS inafanya kazi TU na XMD_TEST_HOOKS=1. */
export function orphanStaleMs(env: Record<string, string | undefined> = process.env): number {
  if (env.XMD_TEST_HOOKS === "1") {
    const v = Number(env.XMD_TEST_ORPHAN_STALE_MS);
    if (Number.isFinite(v) && v > 0) return v;
  }
  return ORPHAN_STALE_MS;
}

export const isInProgressStatus = (s: unknown): boolean => IN_PROGRESS.test(String(s || ""));

/** items za doc ya session (array, JSON, au gz1: iliyobanwa). */
export function itemsOfDoc(d: any): any[] {
  const raw = d?.items;
  if (Array.isArray(raw)) return raw;
  if (raw == null || raw === "") return [];
  try {
    const v = JSON.parse(unpack(raw) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function resumeStateIndex(items: any[]): number {
  for (let i = items.length - 1; i >= 0; i--) {
    const it = items[i];
    if (it?.kind === "chip" && typeof it?.text === "string" && it.text.startsWith(RESUME_PREFIX)) return i;
  }
  return -1;
}
function resumeStateOf(items: any[]): any | null {
  const i = resumeStateIndex(items);
  if (i < 0) return null;
  try {
    const st = JSON.parse(items[i].text.slice(RESUME_PREFIX.length));
    return st && Array.isArray(st.agenda) && st.agenda.length && typeof st.runnerId === "string" ? st : null;
  } catch {
    return null;
  }
}

/** Meta ya pause: CU chip ambayo haijaisha (awamu ya Computer), vinginevyo resume state (awamu ya mjadala). */
export function pauseMetaOf(items: any[]): { resumeAt?: number; pauseOrigin?: string; source: "cu" | "resume_state" } | null {
  const chip = readCuChip(items);
  if (chip && !chip.done) return { resumeAt: chip.resumeAt, pauseOrigin: (chip as any).pauseOrigin, source: "cu" };
  if (chip && chip.done) return null; // Computer imeisha — haiendelezwi
  const st = resumeStateOf(items);
  return st ? { resumeAt: st.resumeAt, pauseOrigin: st.pauseOrigin, source: "resume_state" } : null;
}

export interface OrphanInput { status: string; updatedAtMs: number; items: any[]; liveRunner: boolean; now: number; staleMs: number }
export type OrphanDecision = { orphan: true; staleMin: number } | { orphan: false; staleMin: number; reason: string; becomesStaleInMs?: number };

/** Uamuzi safi (pure) — orphan TU kama masharti YOTE yametimia. */
export function decideOrphan(x: OrphanInput): OrphanDecision {
  const age = x.updatedAtMs > 0 ? x.now - x.updatedAtMs : Number.POSITIVE_INFINITY;
  const staleMin = Number.isFinite(age) ? Math.max(0, Math.round(age / 6_000) / 10) : -1;
  const paused = x.status === "paused";
  if (!paused && !isInProgressStatus(x.status)) return { orphan: false, staleMin, reason: `status ${x.status || "?"}` };
  if (x.liveRunner) return { orphan: false, staleMin, reason: "live runner" };
  const cu = readCuChip(x.items);
  const st = resumeStateOf(x.items);
  if (st?.pauseOrigin === "user" || (cu as any)?.pauseOrigin === "user") return { orphan: false, staleMin, reason: "user paused" };
  if (paused) {
    const meta = pauseMetaOf(x.items);
    if (meta?.resumeAt) return { orphan: false, staleMin, reason: "paused with resumeAt (checkPausedDue)" };
    if (st?.pauseOrigin !== "system") return { orphan: false, staleMin, reason: "paused (not system)" };
  }
  if (cu?.done) return { orphan: false, staleMin, reason: "computer done" };
  const cuResumable = !!(cu && (cu.sandboxId || cu.snapshot));
  if (!st && !cuResumable) return { orphan: false, staleMin, reason: "no resume state" };
  if (age < x.staleMs) return { orphan: false, staleMin, reason: "fresh", becomesStaleInMs: x.staleMs - age };
  return { orphan: true, staleMin };
}

/** items mpya: pause ya SYSTEM (resumeAt) kwenye chip husika + chip inayoonekana. */
export function markRecovered(items: any[], now: number): any[] {
  const out = items.slice();
  const resumeAt = now + ORPHAN_RESUME_DELAY_MS;
  const cu = readCuChip(out);
  if (cu && !cu.done) {
    const i = out.map((x) => isHiddenCuChip(x)).lastIndexOf(true);
    out[i] = { ...out[i], ...cuChipItem({ ...cu, resumeAt, pauseOrigin: "system" }) };
  } else {
    const i = resumeStateIndex(out);
    const st = JSON.parse(out[i].text.slice(RESUME_PREFIX.length));
    out[i] = { ...out[i], text: RESUME_PREFIX + JSON.stringify({ ...st, resumeAt, pauseOrigin: "system" }) };
  }
  out.push({ kind: "chip", id: `orphan-${now.toString(36)}`, text: ORPHAN_CHIP_TEXT });
  return out;
}

let lastSweep = 0;
let resweepTimer: ReturnType<typeof setTimeout> | null = null;
let resumeTimer: ReturnType<typeof setTimeout> | null = null;

/** Scan ya orphans (boot + tick + /api/boardroom/active; throttle 60s). Inarudisha idadi iliyorecoveriwa. */
export async function sweepOrphans(force = false): Promise<number> {
  const now = Date.now();
  if (!force && now - lastSweep < 60_000) return 0;
  lastSweep = now;
  const a = dbOf();
  if (!a) return 0;
  const staleMs = orphanStaleMs();
  try {
    const q = [...TERMINAL.map((t) => Query.notEqual("status", t)), Query.orderDesc("$updatedAt"), Query.limit(10)];
    const docs = await a.db.listDocuments(a.databaseId, "boardroom_sessions", q);
    const br = await import("@/lib/boardRunner");
    const { updateSessionItems } = await import("@/lib/reports");
    let recovered = 0;
    let nextStaleIn = Number.POSITIVE_INFINITY;
    for (const d of docs.documents || []) {
      const id = String(d.$id);
      const items = itemsOfDoc(d);
      const st = resumeStateOf(items);
      const liveRunner = !!(br.findRunner(id) || (st?.runnerId && br.findRunner(st.runnerId)));
      const updatedAtMs = Date.parse(String((d as any).updated_at || (d as any).$updatedAt || "")) || 0;
      const dec = decideOrphan({ status: String((d as any).status || ""), updatedAtMs, items, liveRunner, now, staleMs });
      if (!dec.orphan) {
        if (dec.becomesStaleInMs !== undefined) nextStaleIn = Math.min(nextStaleIn, dec.becomesStaleInMs);
        console.log(`[orphan] ${id.slice(0, 8)} stale ${dec.staleMin}min -> skipped (${dec.reason})`);
        continue;
      }
      const ok = await updateSessionItems(id, markRecovered(items, now) as any, "paused");
      console.log(`[orphan] ${id.slice(0, 8)} stale ${dec.staleMin}min -> ${ok ? "recovered" : "skipped (persist failed)"}`);
      if (ok) recovered += 1;
    }
    // resumeAt ikifika → njia iliyopo (checkPausedDue) inaendeleza; bila hii ingesubiri tick ya dk 10 / ombi la UI
    if (recovered && !resumeTimer) {
      resumeTimer = setTimeout(() => { resumeTimer = null; void checkPausedDue(true); }, ORPHAN_RESUME_DELAY_MS + 2_000);
      resumeTimer.unref?.();
    }
    // session bila runner ambayo bado ni "fresh" → angalia tena itakapopitwa na muda (si kusubiri tick ya dk 10)
    if (Number.isFinite(nextStaleIn) && !resweepTimer) {
      resweepTimer = setTimeout(() => { resweepTimer = null; void sweepOrphans(true); }, Math.min(nextStaleIn + 2_000, 10 * 60_000));
      resweepTimer.unref?.();
    }
    return recovered;
  } catch (e) {
    console.warn(`[orphan] sweep imekufa: ${String(e).slice(0, 140)}`);
    return 0;
  }
}

/** URL ya kupakua snapshot ya workspace (bucket public read) — kwa bridge --restore-url. */
export function snapshotUrlOf(fileId: string, bucketId?: string): string {
  return publicFileUrl(bucketId || CU_BUCKET, fileId); // R42.1: Supabase public URL
}
