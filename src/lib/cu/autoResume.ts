// src/lib/cu/autoResume.ts — R31-G4: auto-resume ya session iliyopumzika (quota ya siku imeisha).
// Njia 3 (belt + suspenders):
//   (1) Timer ya ndani ya engine (instance ikiishi hadi resumeAt)
//   (2) instrumentation: server ikianza (boot) — scan ya paused + interval
//   (3) /api/boardroom/active: kila ombi linalofika (app ikiwahi kufunguliwa/traffic yoyote)
//          → checkPausedDue() ina throttle yake (60s) — haitoi mzigo.

import { Client, Databases, Query } from "node-appwrite";
import { readCuChip, CU_BUCKET } from "./engine";

const inflight = new Set<string>();
let lastCheck = 0;

function appwrite() {
  const endpoint = process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1";
  const projectId = process.env.APPWRITE_PROJECT_ID || "";
  const apiKey = process.env.APPWRITE_API_KEY || "";
  if (!projectId || !apiKey) return null;
  return { client: new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey), db: null as any };
}

function dbOf() {
  const a = appwrite();
  if (!a) return null;
  if (!a.db) a.db = new Databases(a.client);
  return { db: a.db, databaseId: process.env.APPWRITE_DATABASE_ID || "" };
}

/** Endeleza session (runner hai → unpause; Koyeb ililala → rehydrate kutoka Appwrite). */
export async function autoResumeSession(sessionId: string): Promise<boolean> {
  if (!sessionId || inflight.has(sessionId)) return false;
  inflight.add(sessionId);
  try {
    const { resumeRun, streamRunner } = await import("@/lib/boardRunner");
    const runner = await resumeRun(sessionId);
    if (!runner || runner === "busy") return false;
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
      const items = Array.isArray((d as any).items) ? (d as any).items : [];
      const chip = readCuChip(items);
      if (!chip || chip.done) continue;
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

/** URL ya kupakua snapshot ya workspace (bucket public read) — kwa bridge --restore-url. */
export function snapshotUrlOf(fileId: string, bucketId?: string): string {
  const endpoint = (process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1").replace(/\/+$/, "");
  return `${endpoint}/storage/buckets/${bucketId || CU_BUCKET}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID || ""}`;
}
