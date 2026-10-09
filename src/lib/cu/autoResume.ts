// src/lib/cu/autoResume.ts — R31-G4: auto-resume ya session iliyopumzika (quota ya siku imeisha).
// Njia 3 (belt + suspenders):
//   (1) Timer ya ndani ya engine (instance ikiishi hadi resumeAt)
//   (2) instrumentation: server ikianza (boot) — scan ya paused + interval
//   (3) /api/boardroom/active: kila ombi linalofika (app ikiwahi kufunguliwa/traffic yoyote)
//          → checkPausedDue() ina throttle yake (60s) — haitoi mzigo.

// R42: Appwrite client ya moja kwa moja imeondolewa — Supabase (shim ya appwrite.ts + cu_state table).

import { Query } from "node-appwrite";
import { readCuChip, CU_BUCKET } from "./engine";
import { publicFileUrl } from "@/lib/server/supabase";

const inflight = new Set<string>();
let lastCheck = 0;

async function dbOf() {
  const m = await import("@/lib/server/appwrite");
  return m.appwriteConfigured ? { db: m.databases, databaseId: m.DB } : null;
}

/** Endeleza session (runner hai → unpause; Koyeb ililala → rehydrate kutoka Appwrite). */
export async function autoResumeSession(sessionId: string): Promise<boolean> {
  if (!sessionId || inflight.has(sessionId)) return false;
  inflight.add(sessionId);
  try {
    const { resumeRun, streamRunner } = await import("@/lib/boardRunner");
    const runner = await resumeRun(sessionId);
    if (!runner || runner === "busy" || runner === "pausing") return false; // R38-RC5: "pausing" = snapshot bado inapangwa — tick ijayo itajaribu
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
  const a = await dbOf();
  if (!a) return 0;
  try {
    const docs = await a.db.listDocuments(a.databaseId, "boardroom_sessions", [Query.equal("status", "paused"), Query.limit(10)]);
    const { supabase } = await import("@/lib/server/supabase");
    const { unpack } = await import("@/lib/server/packed");
    let resumed = 0;
    for (const d of docs.documents || []) {
      // R42: chip ya CU — cu_state table (mpya) kwanza, kisha legacy packed items (sessions za zamani)
      let chip: any = null;
      const { data: st } = await supabase.from("cu_state").select("chip").eq("session_id", d.$id).maybeSingle();
      chip = (st as any)?.chip;
      if (!chip && (d as any).items) {
        try { chip = readCuChip(JSON.parse(unpack(String((d as any).items)) || "[]")); } catch { chip = null; }
      }
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
  return publicFileUrl(bucketId || CU_BUCKET, fileId); // R42: Supabase public URL
}
