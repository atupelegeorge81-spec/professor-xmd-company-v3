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

// ============ SESSIONS (R42: Supabase — Discussion na Computer ZIMETENGANISHWA) ============
// boardroom_sessions: meta tu (project/title/status) — column "items" ni ya sessions za ZAMANI (Appwrite) tu.
// board_items: kila item ya DISCUSSION = row (session_id, seq) — conversation ndefu haipati kikomo tena.
// cu_events: kila event ya XMD Computer = row zake — sep kabisa kama alivyopendekeza Mkuu.
// cu_state: chip ya CU (sandbox/token/maxI/snapshot) — row moja inayoupdate kila persist.
// Delta persist: rows mpya (seq > lastSeq) pekee + chip — si rewrite ya kila kitu (iliokuwa inaua bandwidth).

import { isHiddenCuChip, CU_PREFIX, CU_CHIP_ID, cuChipItem } from "@/lib/cu/engine";

const lastSeqSent = new Map<string, number>(); // sessionId → seq ya mwisho iliyoandikwa (append-only delta)
const RESUME_PREFIX = "__PROFESSOR_XMD_RESUME_STATE__:";

async function persistRows(sessionId: string, items: SessionItem[]): Promise<void> {
  const board: { session_id: string; seq: number; item: unknown }[] = [];
  const cu: { session_id: string; seq: number; ev: unknown }[] = [];
  let chipState: unknown = null;
  items.forEach((it: any, i) => {
    if (isHiddenCuChip(it)) {
      try { chipState = JSON.parse(String(it.text).slice(CU_PREFIX.length)); } catch { /* chip bovu — ruka */ }
      return;
    }
    if (it?.kind === "cu") cu.push({ session_id: sessionId, seq: i, ev: it });
    else board.push({ session_id: sessionId, seq: i, item: it });
  });
  const last = lastSeqSent.get(sessionId) ?? -1;
  const boardRows = board.filter((r) => r.seq > last);
  const cuRows = cu.filter((r) => r.seq > last);
  const { supabase } = await import("./server/supabase");
  if (boardRows.length) await supabase.from("board_items").upsert(boardRows, { onConflict: "session_id,seq" });
  if (cuRows.length) await supabase.from("cu_events").upsert(cuRows, { onConflict: "session_id,seq" });
  if (chipState) await supabase.from("cu_state").upsert({ session_id: sessionId, chip: chipState, updated_at: new Date().toISOString() }, { onConflict: "session_id" });
  if (items.length) lastSeqSent.set(sessionId, items.length - 1);
}

/** Items kamili za session (discussion + cu + chips) — kutoka rows; back-compat: packed ya zamani.
 *  CU chip ina-inject mwishoni kama ilivyokuwa kwenye runtime → readCuChip/readResumeState zinaendelea kuifanya kazi. */
export async function loadSessionItems(sessionId: string, legacyPacked?: string | null): Promise<SessionItem[]> {
  if (legacyPacked) {
    try { return JSON.parse(unpack(legacyPacked) || "[]"); } catch { return []; }
  }
  const { supabase } = await import("./server/supabase");
  const [b, c, s] = await Promise.all([
    supabase.from("board_items").select("item").eq("session_id", sessionId).order("seq", { ascending: true }).limit(5000),
    supabase.from("cu_events").select("ev").eq("session_id", sessionId).order("seq", { ascending: true }).limit(5000),
    supabase.from("cu_state").select("chip").eq("session_id", sessionId).maybeSingle(),
  ]);
  if (b.error || c.error) throw new Error(`loadSessionItems: ${b.error?.message || c.error?.message}`);
  const boardItems = (b.data || []).map((r: { item: unknown }) => r.item as SessionItem);
  const cuItems = (c.data || []).map((r: { ev: unknown }) => r.ev as SessionItem);
  const chip = (s.data as { chip?: unknown } | null)?.chip;
  return chip ? [...boardItems, ...cuItems, cuChipItem(chip as any) as unknown as SessionItem] : [...boardItems, ...cuItems];
}

export async function saveSession(project: string, items: SessionItem[], status: string, title?: string): Promise<string | null> {
  try {
    const doc = await databases.createDocument(DB, SESSIONS_COL, "unique()", {
      project: project.slice(0, 500),
      status,
      title: (title || "").slice(0, 200),
      created_at: new Date().toISOString(),
    });
    const id = String(doc.$id);
    lastSeqSent.delete(id); // mpya — full persist
    await persistRows(id, items);
    lastSaveError.session = null;
    return id;
  } catch (e) { lastSaveError.session = errText(e); console.error("❌ Session save error:", e); return null; }
}

export async function updateSessionItems(sessionId: string, items: SessionItem[], status: string, title?: string): Promise<boolean> {
  try {
    const upd: any = { status, updated_at: new Date().toISOString() };
    if (title !== undefined) upd.title = title.slice(0, 200);
    await databases.updateDocument(DB, SESSIONS_COL, sessionId, upd);
    await persistRows(sessionId, items); // delta: rows mpya + chip pekee
    lastSaveError.session = null;
    return true;
  } catch (e) { lastSaveError.session = errText(e); console.error("❌ Session update error:", e); return false; }
}

export async function listConversations(): Promise<ConversationDoc[]> {
  try {
    const res = await databases.listDocuments(DB, SESSIONS_COL, [Query.limit(30), Query.orderDesc("$createdAt")]);
    const { supabase } = await import("./server/supabase");
    return await Promise.all(res.documents.map(async (d: any) => {
      let count = 0;
      if (d.items) { try { count = JSON.parse(unpack(d.items) || "[]").length; } catch { count = 0; } }
      else {
        const [b, c] = await Promise.all([
          supabase.from("board_items").select("seq", { count: "exact", head: true }).eq("session_id", d.$id),
          supabase.from("cu_events").select("seq", { count: "exact", head: true }).eq("session_id", d.$id),
        ]);
        count = (b.count || 0) + (c.count || 0);
      }
      return {
        id: d.$id,
        title: d.title || "Untitled Conversation",
        project: d.project || "",
        status: d.status || "in_progress",
        created_at: d.created_at || "",
        items_count: count,
      };
    }));
  } catch (e) { console.error("❌ List conversations error:", e); return []; }
}

export async function getConversation(id: string): Promise<{ id: string; title: string; project: string; status: string; items: SessionItem[]; created_at: string } | null> {
  try {
    const d: any = await databases.getDocument(DB, SESSIONS_COL, id);
    const items = await loadSessionItems(id, d.items || null);
    return { id: d.$id, title: d.title || "Untitled", project: d.project, status: d.status || "in_progress", items, created_at: d.created_at };
  } catch (e) { console.error("❌ Get conversation error:", e); return null; }
}

export async function deleteConversation(id: string): Promise<boolean> {
  try {
    const { supabase } = await import("./server/supabase");
    await Promise.all([
      supabase.from("board_items").delete().eq("session_id", id),
      supabase.from("cu_events").delete().eq("session_id", id),
      supabase.from("cu_state").delete().eq("session_id", id),
    ]);
    await databases.deleteDocument(DB, SESSIONS_COL, id);
    return true;
  } catch { return false; }
}

export async function getLatestSession(): Promise<any> {
  const list = await listConversations();
  return list.length > 0 ? list[0] : null;
}

// [PATCH-XMD-V2] applied
