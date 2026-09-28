// src/lib/brain/memory/events.ts — Appwrite `agent_memory_events` (ID 6ab74616000856116332).
// Working memory: checkpoints, reflections, consolidation audit, skill candidates. Resume-safe.
import { ID, Query } from "node-appwrite";
import { appwriteConfigured, databases, DB } from "@/lib/server/appwrite";
import type { Persona } from "../ids";
import { isNetworkError, waitOnline } from "@/lib/broker/online";

export const MEMORY_EVENTS_COL = "6ab74616000856116332";

export type EventKind = "checkpoint" | "reflection" | "consolidated" | "skill_candidate";
export type EventStatus = "memory" | "no_memory" | "failed";

export interface MemoryEvent {
  id?: string;
  agent_id: Persona;
  session_id: string;
  project?: string;
  kind: EventKind;
  agenda_index?: number;
  agenda_item?: string;
  self_note?: string;
  board_note?: string;
  status: EventStatus;
  model?: string;
  ms?: number;
  tokens?: number;
  created_at?: string;
}

export async function saveEvent(e: MemoryEvent): Promise<string | null> {
  if (!appwriteConfigured) return null;
  const data: Record<string, unknown> = {
    agent_id: e.agent_id,
    session_id: String(e.session_id || "none").slice(0, 64),
    kind: e.kind,
    status: e.status,
  };
  if (e.project) data.project = e.project.slice(0, 250);
  if (e.agenda_index != null) data.agenda_index = Math.round(e.agenda_index);
  if (e.agenda_item) data.agenda_item = e.agenda_item.slice(0, 500);
  if (e.self_note) data.self_note = e.self_note.slice(0, 60000);
  if (e.board_note) data.board_note = e.board_note.slice(0, 60000);
  if (e.model) data.model = e.model.slice(0, 100);
  if (e.ms != null) data.ms = Math.round(e.ms);
  if (e.tokens != null) data.tokens = Math.round(e.tokens);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const doc = await databases.createDocument(DB, MEMORY_EVENTS_COL, ID.unique(), data);
      return doc.$id;
    } catch (err: any) {
      console.warn(`⚠️ [memory] saveEvent(${e.kind}/${e.agent_id}) ${attempt}/3:`, err?.message || err);
      // R20: mtandao umekatika → subiri urudi (jaribio hili halihesabiwi), vinginevyo pumziko fupi
      if (isNetworkError(err) && (await waitOnline())) { attempt--; continue; }
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 700));
    }
  }
  return null;
}

/** Matukio ya session hii (kwa collector — Resume haipotezi checkpoints). */
export async function listSessionEvents(sessionId: string, kinds: EventKind[] = ["checkpoint", "reflection"]): Promise<MemoryEvent[]> {
  if (!appwriteConfigured || !sessionId) return [];
  for (let attempt = 1; ; attempt++) try {
    const res = await databases.listDocuments(DB, MEMORY_EVENTS_COL, [Query.equal("session_id", sessionId.slice(0, 64)), Query.limit(300)]);
    return res.documents
      .map((d: any) => ({
        id: d.$id, agent_id: d.agent_id, session_id: d.session_id, project: d.project, kind: d.kind, agenda_index: d.agenda_index,
        agenda_item: d.agenda_item, self_note: d.self_note, board_note: d.board_note, status: d.status, model: d.model, ms: d.ms, tokens: d.tokens,
        created_at: d.$createdAt,
      }) as MemoryEvent)
      .filter((e) => kinds.includes(e.kind));
  } catch (err: any) {
    console.warn("⚠️ [memory] listSessionEvents:", err?.message || err);
    // R20: mtandao ukikatika, checkpoints HAZICHUKULIWI kama "hazipo" — subiri mtandao urudi kisha soma tena
    if (attempt < 5 && isNetworkError(err) && (await waitOnline())) continue;
    return [];
  }
}
