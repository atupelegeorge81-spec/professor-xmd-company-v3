import { Client, Databases, Query } from "node-appwrite";
import type { ReportDoc, ConversationDoc } from "./types";

const client = new Client();
if (process.env.APPWRITE_ENDPOINT && process.env.APPWRITE_PROJECT_ID && process.env.APPWRITE_API_KEY) {
  client.setEndpoint(process.env.APPWRITE_ENDPOINT).setProject(process.env.APPWRITE_PROJECT_ID).setKey(process.env.APPWRITE_API_KEY);
}
const databases = new Databases(client);
const DB = process.env.APPWRITE_DATABASE_ID!;
const REPORTS_COL = process.env.REPORTS_COLLECTION_ID || "reports";
const SESSIONS_COL = "boardroom_sessions";

// ============ REPORTS ============
export async function saveReport(data: { title: string; project: string; agents: string; content: string }): Promise<string | null> {
  try {
    const doc = await databases.createDocument(DB, REPORTS_COL, "unique()", {
      title: data.title.slice(0, 250),
      project: (data.project || "").slice(0, 250),
      agents: data.agents.slice(0, 250),
      content: data.content,
      created_at: new Date().toISOString(),
    });
    return doc.$id;
  } catch (e) { console.error("❌ Report save error:", e); return null; }
}

export async function listReports(): Promise<ReportDoc[]> {
  try {
    const res = await databases.listDocuments(DB, REPORTS_COL, [Query.limit(50), Query.orderDesc("$createdAt")]);
    return res.documents.map((d: any) => ({ id: d.$id, title: d.title, content: d.content, agents: d.agents || "", project: d.project || "", created_at: d.created_at || "" }));
  } catch (e) { console.error("❌ Report list error:", e); return []; }
}

// ============ BOARD ROOM SESSIONS / CONVERSATIONS ============
export interface SessionItem {
  kind: "msg" | "chip" | "round" | "title";
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
}

export async function saveSession(project: string, items: SessionItem[], status: string, title?: string): Promise<string | null> {
  try {
    const doc = await databases.createDocument(DB, SESSIONS_COL, "unique()", {
      project: project.slice(0, 500),
      items: JSON.stringify(items),
      status,
      title: (title || "").slice(0, 200),
      created_at: new Date().toISOString(),
    });
    return doc.$id;
  } catch (e) { console.error("❌ Session save error:", e); return null; }
}

export async function updateSessionItems(sessionId: string, items: SessionItem[], status: string, title?: string): Promise<boolean> {
  try {
    const upd: any = { items: JSON.stringify(items), status };
    if (title !== undefined) upd.title = title.slice(0, 200);
    await databases.updateDocument(DB, SESSIONS_COL, sessionId, upd);
    return true;
  } catch (e) { console.error("❌ Session update error:", e); return false; }
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
      items_count: (() => { try { return JSON.parse(d.items || "[]").length; } catch { return 0; } })(),
    }));
  } catch (e) { console.error("❌ List conversations error:", e); return []; }
}

export async function getConversation(id: string): Promise<{ id: string; title: string; project: string; status: string; items: SessionItem[]; created_at: string } | null> {
  try {
    const d: any = await databases.getDocument(DB, SESSIONS_COL, id);
    return { id: d.$id, title: d.title || "Untitled", project: d.project, status: d.status || "in_progress", items: JSON.parse(d.items || "[]"), created_at: d.created_at };
  } catch (e) { console.error("❌ Get conversation error:", e); return null; }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try { await databases.deleteDocument(DB, SESSIONS_COL, id); return true; } catch { return false; }
}

export async function getLatestSession(): Promise<any> {
  const list = await listConversations();
  return list.length > 0 ? list[0] : null;
}
