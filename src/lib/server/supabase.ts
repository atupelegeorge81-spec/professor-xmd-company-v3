// src/lib/server/supabase.ts — R42: Supabase ndiyo hifadhi (Appwrite imeondolewa).
// Client mmoja (service key — inapita RLS) + config ya tables (columns halisi vs JSONB data).
// Shim ya "Appwrite-compatible" ipo appwrite.ts (signature ileile — files 30 hazibadilishwi).

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 haina native WebSocket — realtime ya supabase-js inahitaji transport

export const SUPABASE_URL = (process.env.SUPABASE_URL || "https://pgxjepplhmyurkgohngn.supabase.co").replace(/\/$/, "");
export const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_KEY || "";

export const supabaseConfigured = !!(SUPABASE_URL && SUPABASE_KEY);

// Client lazily-safe: kama key haipo (mf. tests), placeholder inaruhusu module-load bila crash —
// calls zote halisi zinalindwa na appwriteConfigured (= supabaseConfigured).
const OPTS: Record<string, unknown> = { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws } };
export const supabase: SupabaseClient = supabaseConfigured
  ? createClient(SUPABASE_URL, SUPABASE_KEY, OPTS)
  : (createClient("https://placeholder.supabase.co", "placeholder-anon-key", OPTS) as SupabaseClient);

/** Bucket ya files (screenshots + ws-snapshots) — public read (E2B restore inahitaji URL wazi). */
export const SUPABASE_BUCKET = process.env.CU_SCREENSHOTS_BUCKET || "professor-xmd-files";

/** URL ya umma ya file ya bucket (kama ile ya Appwrite /view?project=... — bila key). */
export const publicFileUrl = (bucket: string, fileId: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${fileId}`;

/* ---------------------------------------------------------- config ya tables */

/**
 * Kila "collection" → table ya Postgres.
 *  - cols: columns halisi (zinazofiltered/sorted/updated moja kwa moja)
 *  - jsonb: column ya JSONB inayobeba fields zote za doc (flatten kwenye read, merge kwenye write)
 *    (null = table ya columns halisi tu — mf. agent_conversations)
 */
export interface TableCfg { table: string; cols: string[]; jsonb: string | null; idCol?: string }

export const TABLES: Record<string, TableCfg> = {
  boardroom_sessions: { table: "boardroom_sessions", cols: ["project", "title", "status", "mode", "items", "created_at", "updated_at"], jsonb: null },
  reports: { table: "reports", cols: ["session_id", "created_at"], jsonb: "data" },
  project_plans: { table: "project_plans", cols: ["session_id", "created_at", "updated_at"], jsonb: "data" },
  mini_reports: { table: "mini_reports", cols: ["session_id", "created_at"], jsonb: "data" },
  agent_conversations: { table: "agent_conversations", cols: ["agent_id", "thread_id", "seq", "role", "content", "thinking", "search_query", "sources", "status", "seconds", "feedback", "model", "prompt_tokens", "completion_tokens", "total_tokens", "tokens_exact", "requests", "created_at"], jsonb: null },
  agent_memory: { table: "agent_memory", cols: ["agent_id", "updated_at"], jsonb: "data", idCol: "agent_id" },
  memory_events: { table: "memory_events", cols: ["agent_id", "created_at"], jsonb: "data" },
  board_ledger: { table: "board_ledger", cols: ["status", "created_at"], jsonb: "data" },
  search_cache: { table: "search_cache", cols: ["space", "query", "vector", "results", "hits", "dims", "created_at"], jsonb: null },
};

export const tableOf = (collectionId: string): TableCfg =>
  TABLES[collectionId] || { table: collectionId, cols: ["session_id", "created_at"], jsonb: "data" };
