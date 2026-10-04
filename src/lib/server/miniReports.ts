// src/lib/server/miniReports.ts — R30: MINI-REPORTS za Optimus kwenye collection YAKE (mini_reports).
//
// KANUNI MPYA YA MKUU (R30): "mini report ni ya Optimus; ledger ni ya kila agent."
//   · board_ledger   = uamuzi RASMI wa agents wote (status, decision_summary, owners, objections, masharti).
//   · mini_reports   = tafsiri ya KINA ya Optimus (detail + carried_constraints) — doc moja kwa kila agenda.
//
// Collection ilikuwa imeundwa mapema (attrs 10, Appwrite) ila haikutumika — sasa ndiyo makao halisi.
// Self-bootstrap ya indexes inafuata mfano wa agentChats: mara ya kwanza inaitwa, indexes zinazokosekana zinaundwa.
// Sessions za ZAMANI (R16-R29) zinaendelea kusomeka: readers wanafallback kwa ledger.decision_detail.

import { Query, DatabasesIndexType } from "node-appwrite";
import { databases, DB, appwriteConfigured } from "./appwrite";
import { pack, unpack } from "./packed";

export const MINI_REPORTS_COL = "mini_reports";

export interface MiniReportDoc {
  id: string;
  project_id: string;
  session_id: string;
  agenda_index: number;
  agenda_item: string;
  status: string;
  decision_summary: string;
  detail: string;
  carried_constraints: string;
  created_at: string;
  updated_at: string;
}

/** Alama ya kwamba mini-report halisi ipo kwenye collection (ledger ina pointer tu). */
export const MINI_LEDGER_POINTER = "[Mini-report kamili iko kwenye collection `mini_reports` — ya Optimus, si ya Ledger]";
export const isMiniPointer = (v: unknown) => String(v || "").includes("mini_reports");

/* ---------------- self-bootstrap (indexes) ---------------- */

let ensured: Promise<void> | null = null;

async function ensureIndexes(): Promise<void> {
  if (!appwriteConfigured) return;
  const wanted: { key: string; attributes: string[] }[] = [
    { key: "idx_project_agenda", attributes: ["project_id", "agenda_index"] },
    { key: "idx_session", attributes: ["session_id"] },
  ];
  for (const w of wanted) {
    try {
      await databases.createIndex(DB, MINI_REPORTS_COL, w.key, DatabasesIndexType.Key, w.attributes);
      console.log(`✅ [mini-reports] index ${w.key} imeundwa`);
    } catch (e: any) {
      const m = String(e?.message || "");
      if (!/already exists|duplicate/i.test(m)) console.warn(`⚠️ [mini-reports] index ${w.key} haikuundwa (${m.slice(0, 120)}) — app bado inafanya kazi.`);
    }
  }
}

export function ensureMiniReports(): Promise<void> {
  if (!ensured) ensured = ensureIndexes().catch(() => {});
  return ensured;
}

/* ---------------- read / write ---------------- */

const toDoc = (d: any): MiniReportDoc => ({
  id: d.$id,
  project_id: String(d.project_id || ""),
  session_id: String(d.session_id || ""),
  agenda_index: Number(d.agenda_index) || 0,
  agenda_item: String(d.agenda_item || ""),
  status: String(d.status || ""),
  decision_summary: unpack(d.decision_summary) || String(d.decision_summary || ""),
  detail: unpack(d.detail),
  carried_constraints: unpack(d.carried_constraints) || "",
  created_at: String(d.created_at || d.$createdAt || ""),
  updated_at: String(d.updated_at || d.$updatedAt || ""),
});

/** Mini-reports zote za mradi (project_id = runner id), zimepangwa kwa agenda. */
export async function listMiniReports(projectId: string): Promise<MiniReportDoc[]> {
  if (!appwriteConfigured || !projectId) return [];
  await ensureMiniReports();
  try {
    const res = await databases.listDocuments(DB, MINI_REPORTS_COL, [
      Query.equal("project_id", projectId),
      Query.orderAsc("agenda_index"),
      Query.limit(100),
    ]);
    return res.documents.map(toDoc);
  } catch (e: any) {
    console.warn(`⚠️ [mini-reports] list ilishindwa (${String(e?.message || e).slice(0, 120)}) — inaendelea bila zake.`);
    return [];
  }
}

/** Map ya agenda_index → detail (chanzo kikuu cha ripoti/plan; fallback = ledger ya zamani). */
export async function miniDetailsMap(projectId: string): Promise<Map<number, MiniReportDoc>> {
  const out = new Map<number, MiniReportDoc>();
  for (const d of await listMiniReports(projectId)) {
    const prev = out.get(d.agenda_index);
    if (!prev || new Date(d.updated_at || 0).getTime() >= new Date(prev.updated_at || 0).getTime()) out.set(d.agenda_index, d);
  }
  return out;
}

export interface MiniReportSave {
  projectId: string;
  sessionId: string;
  agendaIndex: number;
  agendaItem: string;
  status: string;
  decisionSummary: string;
  detail: string;
  carriedConstraints?: string;
}

/** Upsert: doc moja kwa (project_id, agenda_index) — LOCK mpya/re-lock inasasisha doc ileile. */
export async function saveMiniReport(s: MiniReportSave, maxRetries = 3): Promise<string | null> {
  if (!appwriteConfigured || !s.projectId) return null;
  await ensureMiniReports();
  const payload = {
    session_id: String(s.sessionId || s.projectId).slice(0, 64),
    project_id: s.projectId.slice(0, 700),
    agenda_index: Number(s.agendaIndex) || 0,
    agenda_item: String(s.agendaItem || "").slice(0, 255),
    status: String(s.status || "LOCKED").slice(0, 32),
    decision_summary: pack(String(s.decisionSummary || "").slice(0, 4000), 12_000),
    detail: pack(String(s.detail || "").slice(0, 100_000)),
    carried_constraints: pack(String(s.carriedConstraints || "").slice(0, 10_000), 12_000),
    updated_at: new Date().toISOString(),
  };
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      let docId: string | undefined;
      try {
        const found = await databases.listDocuments(DB, MINI_REPORTS_COL, [
          Query.equal("project_id", s.projectId),
          Query.equal("agenda_index", Number(s.agendaIndex) || 0),
          Query.limit(1),
        ]);
        docId = found.documents[0]?.$id;
      } catch (e: any) {
        if (!/index|scope/i.test(String(e?.message || ""))) throw e; // index bado haipo → create mpya
      }
      if (docId) {
        await databases.updateDocument(DB, MINI_REPORTS_COL, docId, payload);
        console.log(`✅ [mini-reports] Agenda ${s.agendaIndex} imesasishwa (${payload.detail.length > 400 ? "kamili" : "ya muda"}) · doc ${docId.slice(0, 8)}…`);
        return docId;
      }
      const doc = await databases.createDocument(DB, MINI_REPORTS_COL, "unique()", { ...payload, created_at: new Date().toISOString() });
      console.log(`✅ [mini-reports] Agenda ${s.agendaIndex} imehifadhiwa · doc ${doc.$id.slice(0, 8)}…`);
      return doc.$id;
    } catch (err: any) {
      console.warn(`⚠️ [mini-reports] Jaribio ${attempt}/${maxRetries} (A${s.agendaIndex}) limeshindwa: ${String(err?.message || err).slice(0, 160)}`);
      if (attempt < maxRetries) await new Promise((r) => setTimeout(r, attempt * 800));
    }
  }
  console.error(`❌ [mini-reports] Agenda ${s.agendaIndex} haikuhifadhiwa baada ya majaribio yote — Ledger inabaki na pointer.`);
  return null;
}
