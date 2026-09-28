// src/lib/brain/memory/store.ts — Appwrite `agent_memory` (ID 6ab4f030002f1cf234b8, hardcoded kama agent chats).
// Rekodi MOJA kwa agent: $id = persona id (optimus, ultron, vextron, megatron, cybertron).
// Columns: agent_id, self_memory, board_memory, self_updated_at, board_updated_at, last_project.
import { appwriteConfigured, databases, DB } from "@/lib/server/appwrite";
import type { Persona } from "../ids";

export const AGENT_MEMORY_COL = "6ab4f030002f1cf234b8";
/** R18: memory MOJA ya Board ya kampuni nzima — doc `company` (board_memory), inaandikwa na Optimus, wote wanaisoma */
export const COMPANY_DOC = "company" as const;
export type MemDoc = Persona | typeof COMPANY_DOC;

export interface AgentMemory { agent_id: MemDoc; self_memory: string; board_memory: string; self_updated_at?: string; board_updated_at?: string; last_project?: string }

const TTL = 60_000;
const g = globalThis as unknown as { __xmdMemCache?: Map<string, { at: number; doc: AgentMemory | null }> };
const cache: Map<string, { at: number; doc: AgentMemory | null }> = (g.__xmdMemCache ||= new Map());

/** R18: 404 ya Appwrite inatambuliwa kwa code/type (ujumbe wake ni "…could not be found." — regex ya zamani haikuukamata) */
export function isNotFound(e: any): boolean {
  return e?.code === 404 || e?.response?.code === 404 || e?.type === "document_not_found" || /could not be found|not.?found|\b404\b/i.test(String(e?.message || ""));
}

export async function readMemory(p: MemDoc): Promise<AgentMemory | null> {
  const hit = cache.get(p);
  if (hit && Date.now() - hit.at < TTL) return hit.doc;
  if (!appwriteConfigured) return null;
  try {
    const d = (await databases.getDocument(DB, AGENT_MEMORY_COL, p)) as unknown as AgentMemory;
    const doc: AgentMemory = { agent_id: p, self_memory: d.self_memory || "", board_memory: d.board_memory || "", self_updated_at: d.self_updated_at, board_updated_at: d.board_updated_at, last_project: d.last_project };
    cache.set(p, { at: Date.now(), doc });
    return doc;
  } catch (err: any) {
    // 404 = agent bado hana memory (si kosa)
    if (!isNotFound(err)) console.warn(`⚠️ [memory] readMemory(${p}):`, err?.message || err);
    cache.set(p, { at: Date.now(), doc: null });
    return null;
  }
}

export async function writeMemory(p: MemDoc, patch: Partial<Omit<AgentMemory, "agent_id">>): Promise<boolean> {
  if (!appwriteConfigured) return false;
  const now = new Date().toISOString();
  const data: Record<string, unknown> = { agent_id: p };
  if (patch.self_memory !== undefined) { data.self_memory = patch.self_memory.slice(0, 6000); data.self_updated_at = now; }
  if (patch.board_memory !== undefined) { data.board_memory = patch.board_memory.slice(0, 6000); data.board_updated_at = now; }
  if (patch.last_project) data.last_project = patch.last_project.slice(0, 250);
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      try {
        await databases.updateDocument(DB, AGENT_MEMORY_COL, p, data);
      } catch (e: any) {
        if (!isNotFound(e)) throw e;
        // create: columns ZOTE 6 ni required kwenye collection → jaza zilizokosekana (string tupu inakubalika)
        await databases.createDocument(DB, AGENT_MEMORY_COL, p, {
          agent_id: p, self_memory: "", board_memory: "", last_project: "", self_updated_at: now, board_updated_at: now, ...data,
        });
      }
      cache.delete(p);
      return true;
    } catch (err: any) {
      console.warn(`⚠️ [memory] writeMemory(${p}) ${attempt}/3:`, err?.message || err);
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 700));
    }
  }
  return false;
}
