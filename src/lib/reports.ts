import { Query } from "node-appwrite";
import type { ReportDoc, ConversationDoc } from "./types";
import { databases, DB, REPORTS_COL, SESSIONS_COL } from "./server/appwrite";
import { pack, unpack } from "./server/packed";

/** R18: sababu ya mwisho ya kushindwa kuhifadhi (kwa onyo linaloonekana kwenye Board — si kimya tena). */
export const lastSaveError: { session: string | null; report: string | null } = { session: null, report: null };
const errText = (e: unknown) => String((e as { message?: string })?.message || e).slice(0, 180);

// ============ REPORTS ============
export async function saveReport(data: { title: string; project: string; agents: string; content: string }): Promise<string | null> {
  // [PATCH-XMD-V2] Retry mara 3 — ripoti kuu isipotee kwa hitilafu ya mtandao.
  const payload = {
    title: data.title.slice(0, 250),
    project: (data.project || "").slice(0, 250),
    agents: data.agents.slice(0, 250),
    content: pack(data.content), // R18: ripoti ndefu zinabanwa (gzip+base64)
    created_at: new Date().toISOString(),
  };
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const doc = await databases.createDocument(DB, REPORTS_COL, "unique()", payload);
      lastSaveError.report = null;
      return doc.$id;
    } catch (e) {
      lastSaveError.report = errText(e);
      console.error(`❌ Report save error (jaribio ${attempt}/3):`, e);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return null;
}

export async function listReports(): Promise<ReportDoc[]> {
  try {
    const res = await databases.listDocuments(DB, REPORTS_COL, [Query.limit(50), Query.orderDesc("$createdAt")]);
    return res.documents.map((d: any) => ({ id: d.$id, title: d.title, content: unpack(d.content), agents: d.agents || "", project: d.project || "", created_at: d.created_at || "" }));
  } catch (e) { console.error("❌ Report list error:", e); return []; }
}

// ============ BOARD ROOM SESSIONS / CONVERSATIONS ============
export interface SessionItem {
  kind: "msg" | "chip" | "round" | "title" | "cu";
  id: string;
  agentId?: string;
  thinking?: string;
  content?: string;
  sources?: any[];
  query?: string;
  done?: boolean;
  text?: string;
  round?: number;
  total?: number;
  failed?: boolean;
  error?: string;
  /** R31 · XMD Computer: aina ya tukio (run_start/think/text/exec/shot/github/deploy/report/error/run_end/divider) */
  cu?: string;
  i?: number;
  step?: number;
  execId?: string;
  tool?: string;
  kindX?: string;
  command?: string;
  path?: string;
  preview?: string;
  lines?: number;
  exit?: number;
  ms?: number;
  chars?: number;
  summary?: string;
  output?: string;
  fileId?: string;
  bucketId?: string;
  label?: string;
  url?: string;
  message?: string;
  status?: string;
  live?: string;
  github?: string;
  tokens?: number;
  requests?: number;
  budget?: unknown;
  model?: string;
  task?: string;
  partial?: boolean;
}

export async function saveSession(project: string, items: SessionItem[], status: string, title?: string): Promise<string | null> {
  try {
    const doc = await databases.createDocument(DB, SESSIONS_COL, "unique()", {
      project: project.slice(0, 500),
      items: pack(JSON.stringify(items)),
      status,
      title: (title || "").slice(0, 200),
      created_at: new Date().toISOString(),
    });
    lastSaveError.session = null;
    return doc.$id;
  } catch (e) { lastSaveError.session = errText(e); console.error("❌ Session save error:", e); return null; }
}

export async function updateSessionItems(sessionId: string, items: SessionItem[], status: string, title?: string): Promise<boolean> {
  try {
    const upd: any = { items: pack(JSON.stringify(items)), status };
    if (title !== undefined) upd.title = title.slice(0, 200);
    await databases.updateDocument(DB, SESSIONS_COL, sessionId, upd);
    lastSaveError.session = null;
    return true;
  } catch (e) { lastSaveError.session = errText(e); console.error("❌ Session update error:", e); return false; }
}

export async function listConversations(): Promise<ConversationDoc[]> {
  try {
    const res = await databases.listDocuments(DB, SESSIONS_COL, [Query.limit(30), Query.orderDesc("$createdAt")]);
    return res.documents.map((d: any) => ({
      id: d.$id,
      title: d.title || "Untitled Conversation",
      project: d.project || "",
      status: d.status || "in_progress",
      created_at: d.created_at || "",
      items_count: (() => { try { return JSON.parse(unpack(d.items) || "[]").length; } catch { return 0; } })(),
    }));
  } catch (e) { console.error("❌ List conversations error:", e); return []; }
}

export async function getConversation(id: string): Promise<{ id: string; title: string; project: string; status: string; items: SessionItem[]; created_at: string } | null> {
  try {
    const d: any = await databases.getDocument(DB, SESSIONS_COL, id);
    return { id: d.$id, title: d.title || "Untitled", project: d.project, status: d.status || "in_progress", items: JSON.parse(unpack(d.items) || "[]"), created_at: d.created_at };
  } catch (e) { console.error("❌ Get conversation error:", e); return null; }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try { await databases.deleteDocument(DB, SESSIONS_COL, id); return true; } catch { return false; }
}

export async function getLatestSession(): Promise<any> {
  const list = await listConversations();
  return list.length > 0 ? list[0] : null;
}

// [PATCH-XMD-V2] applied
