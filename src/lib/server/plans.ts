// src/lib/server/plans.ts — R30: MPANGO KAZI WA AGENT (project_plans).
//
// Doc moja kwa session (upsert kwa session_id): plan_content (packed, Kiingereza, hatua 8-15) inayosomwa
// na computer-use agent kupitia /api/plans. official_data + constraints = Fact Sheet (code, si LLM).
// Collection ilikuwa imeundwa mapema (attrs 11) ila haikutumika — sasa ndiyo makao halisi.

import { Query, DatabasesIndexType } from "node-appwrite";
import { databases, DB, appwriteConfigured } from "./appwrite";
import { pack, unpack } from "./packed";

export const PROJECT_PLANS_COL = "project_plans";

export interface ProjectPlanDoc {
  id: string;
  project_id: string;
  session_id: string;
  title: string;
  objective: string;
  status: string;
  constraints: string;
  official_data: string;
  plan_content: string;
  total_steps: number;
  created_at: string;
  updated_at: string;
}

/* ---------------- self-bootstrap (indexes) ---------------- */

let ensured: Promise<void> | null = null;

async function ensureIndexes(): Promise<void> {
  if (!appwriteConfigured) return;
  const wanted: { key: string; attributes: string[] }[] = [
    { key: "idx_session", attributes: ["session_id"] },
    { key: "idx_project", attributes: ["project_id"] },
  ];
  for (const w of wanted) {
    try {
      await databases.createIndex(DB, PROJECT_PLANS_COL, w.key, DatabasesIndexType.Key, w.attributes);
      console.log(`✅ [plans] index ${w.key} imeundwa`);
    } catch (e: any) {
      const m = String(e?.message || "");
      if (!/already exists|duplicate/i.test(m)) console.warn(`⚠️ [plans] index ${w.key} haikuundwa (${m.slice(0, 120)}) — app bado inafanya kazi.`);
    }
  }
}

export function ensurePlans(): Promise<void> {
  if (!ensured) ensured = ensureIndexes().catch(() => {});
  return ensured;
}

/* ---------------- read / write ---------------- */

const toDoc = (d: any): ProjectPlanDoc => ({
  id: d.$id,
  project_id: String(d.project_id || ""),
  session_id: String(d.session_id || ""),
  title: String(d.title || ""),
  objective: String(d.objective || ""),
  status: String(d.status || ""),
  constraints: unpack(d.constraints) || "",
  official_data: unpack(d.official_data) || "",
  plan_content: unpack(d.plan_content),
  total_steps: Number(d.total_steps) || 0,
  created_at: String(d.created_at || d.$createdAt || ""),
  updated_at: String(d.updated_at || d.$updatedAt || ""),
});

export interface PlanSave {
  projectId: string;
  sessionId: string;
  title: string;
  objective: string;
  status: string;
  constraints?: string;
  officialData?: string;
  planContent: string;
  totalSteps: number;
}

/** Upsert kwa session_id: resume/repair inasasisha doc ileile (si mpya kila mara). */
export async function saveProjectPlan(s: PlanSave, maxRetries = 3): Promise<string | null> {
  if (!appwriteConfigured || !s.sessionId) return null;
  await ensurePlans();
  const payload: Record<string, unknown> = {
    project_id: String(s.projectId || s.sessionId).slice(0, 700),
    session_id: String(s.sessionId).slice(0, 64),
    title: String(s.title || "Agent Work Plan").slice(0, 255),
    objective: String(s.objective || "").slice(0, 10_000),
    status: String(s.status || "active").slice(0, 40),
    constraints: pack(String(s.constraints || "").slice(0, 50_000), 12_000),
    official_data: pack(String(s.officialData || "").slice(0, 50_000), 12_000),
    plan_content: pack(String(s.planContent || "").slice(0, 900_000), 16_000),
    total_steps: Number(s.totalSteps) || 0,
    updated_at: new Date().toISOString(),
  };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let docId: string | undefined;
      try {
        const found = await databases.listDocuments(DB, PROJECT_PLANS_COL, [
          Query.equal("session_id", String(s.sessionId).slice(0, 64)),
          Query.limit(1),
        ]);
        docId = found.documents[0]?.$id;
      } catch (e: any) {
        if (!/index|scope/i.test(String(e?.message || ""))) throw e;
      }
      if (docId) {
        await databases.updateDocument(DB, PROJECT_PLANS_COL, docId, payload);
        console.log(`✅ [plans] Mpango Kazi umesasishwa (hatua ${payload.total_steps}) · doc ${docId.slice(0, 8)}…`);
        return docId;
      }
      const doc = await databases.createDocument(DB, PROJECT_PLANS_COL, "unique()", { ...payload, created_at: new Date().toISOString() });
      console.log(`✅ [plans] Mpango Kazi umehifadhiwa (hatua ${payload.total_steps}) · doc ${doc.$id.slice(0, 8)}…`);
      return doc.$id;
    } catch (err: any) {
      console.warn(`⚠️ [plans] Jaribio ${attempt}/${maxRetries} limeshindwa: ${String(err?.message || err).slice(0, 160)}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  console.error("❌ [plans] Mpango Kazi haukuhifadhiwa baada ya majaribio yote.");
  return null;
}

export async function getPlanBySession(sessionId: string): Promise<ProjectPlanDoc | null> {
  if (!appwriteConfigured || !sessionId) return null;
  await ensurePlans();
  try {
    const res = await databases.listDocuments(DB, PROJECT_PLANS_COL, [
      Query.equal("session_id", String(sessionId).slice(0, 64)),
      Query.limit(1),
    ]);
    return res.documents[0] ? toDoc(res.documents[0]) : null;
  } catch (e: any) {
    console.warn(`⚠️ [plans] getPlan ilishindwa: ${String(e?.message || e).slice(0, 120)}`);
    return null;
  }
}

export async function getPlanByProject(projectId: string): Promise<ProjectPlanDoc | null> {
  if (!appwriteConfigured || !projectId) return null;
  await ensurePlans();
  try {
    const res = await databases.listDocuments(DB, PROJECT_PLANS_COL, [
      Query.equal("project_id", String(projectId).slice(0, 700)),
      Query.orderDesc("$updatedAt"),
      Query.limit(1),
    ]);
    return res.documents[0] ? toDoc(res.documents[0]) : null;
  } catch (e: any) {
    console.warn(`⚠️ [plans] getPlanByProject ilishindwa: ${String(e?.message || e).slice(0, 120)}`);
    return null;
  }
}
