// src/lib/server/agentChats.ts — mazungumzo ya agent chat (vyumba binafsi) kwenye Appwrite.
// Collection: agent_conversations (ID 6ab6d7990026978d4ba9, ndani ya agentChatsSchema.ts) — row MOJA kwa kila ujumbe.
// Muundo unajikamilisha wenyewe (agentChatsSchema.ts); setup ya mkono: `npm run setup:agent-chats`.
import { ID, Query } from "node-appwrite";
import { appwriteConfigured, databases, DB } from "./appwrite";
import { AGENT_CHATS_COL, AGENT_CHATS_NAME, ensureAgentChatsSchema } from "./agentChatsSchema";

export { AGENT_CHATS_COL };
export const CHAT_AGENTS = ["optimus", "ultron", "vextron", "megatron", "cybertron"] as const;
export type ChatAgent = (typeof CHAT_AGENTS)[number];
export const isChatAgent = (x: unknown): x is ChatAgent => typeof x === "string" && (CHAT_AGENTS as readonly string[]).includes(x);

export interface ChatSource { title: string; url: string; snippet?: string }
export interface ChatDoc {
  id: string;
  agent_id: ChatAgent;
  thread_id: string;
  seq: number;
  role: "user" | "agent";
  content: string;
  thinking?: string;
  search_query?: string;
  sources?: ChatSource[];
  status?: "done" | "stopped" | "error";
  seconds?: number;
  feedback?: "up" | "down" | null;
  model?: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  tokens_exact?: boolean;
  requests?: number;
  created_at?: string;
}

// Ukubwa wa columns (lazima ulingane na scripts/appwrite-agent-chats.mjs)
export const LIMITS = { content: 4_000_000, thinking: 4_000_000, sources: 4_000_000, search_query: 512, model: 128, thread_id: 36 };
const MAX_SOURCES = 12;

/* ---------- hali ya collection: haipo / haijasanidiwa → UI inarudi kwenye localStorage ---------- */
let missingUntil = 0;
let missingReason = "";
export function chatStoreState(): { stored: boolean; reason?: string } {
  if (!appwriteConfigured) return { stored: false, reason: "Appwrite env haijawekwa" };
  if (Date.now() < missingUntil) return { stored: false, reason: missingReason };
  return { stored: true };
}
function noteError(err: unknown, op = "appwrite"): never {
  const e = err as { code?: number; type?: string; message?: string };
  console.error(`[agent-chats] ${op} imeshindwa · ${e?.code ?? "?"} ${e?.type ?? ""} · ${e?.message || err}`);
  if (e?.code === 404 && /collection|table/i.test(`${e.type} ${e.message}`)) {
    missingUntil = Date.now() + 20_000;
    missingReason = `Collection ${AGENT_CHATS_NAME} (ID ${AGENT_CHATS_COL}) haipo kwenye database ${DB} — endesha: npm run setup:agent-chats`;
  }
  throw err;
}
/** Muundo usio kamili (column haipo / aina tofauti) → kamilisha kisha jaribu tena mara moja. */
const badStructure = (err: unknown) => {
  const e = err as { code?: number; type?: string; message?: string };
  return e?.code === 400 && /structure|unknown attribute|attribute not found|column/i.test(`${e.type} ${e.message}`);
};

const clip = (s: unknown, n: number) => (typeof s === "string" ? s.slice(0, n) : "");
const int = (n: unknown) => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.round(n)) : null);

function toPayload(d: ChatDoc) {
  const sources = (d.sources || []).slice(0, MAX_SOURCES).map((x) => ({ title: clip(x.title, 300), url: clip(x.url, 1000), ...(x.snippet ? { snippet: clip(x.snippet, 400) } : {}) }));
  return {
    agent_id: d.agent_id,
    thread_id: clip(d.thread_id, LIMITS.thread_id),
    seq: int(d.seq) ?? 0,
    role: d.role,
    content: clip(d.content, LIMITS.content),
    thinking: d.thinking ? clip(d.thinking, LIMITS.thinking) : null,
    search_query: d.search_query ? clip(d.search_query, LIMITS.search_query) : null,
    sources: sources.length ? JSON.stringify(sources) : null,
    status: d.role === "agent" ? d.status || "done" : null,
    seconds: int(d.seconds),
    feedback: d.feedback === "up" || d.feedback === "down" ? d.feedback : null,
    model: d.model ? clip(d.model, LIMITS.model) : null,
    prompt_tokens: int(d.prompt_tokens),
    completion_tokens: int(d.completion_tokens),
    total_tokens: int(d.total_tokens),
    tokens_exact: typeof d.tokens_exact === "boolean" ? d.tokens_exact : null,
    requests: int(d.requests),
  };
}

function fromDoc(x: Record<string, any>): ChatDoc {
  let sources: ChatSource[] = [];
  try { sources = x.sources ? JSON.parse(x.sources) : []; } catch {}
  return {
    id: x.$id, agent_id: x.agent_id, thread_id: x.thread_id, seq: x.seq ?? 0, role: x.role,
    content: x.content || "", thinking: x.thinking || "", search_query: x.search_query || "", sources,
    status: x.status || undefined, seconds: x.seconds ?? 0, feedback: x.feedback || null, model: x.model || "",
    prompt_tokens: x.prompt_tokens ?? undefined, completion_tokens: x.completion_tokens ?? undefined,
    total_tokens: x.total_tokens ?? undefined, tokens_exact: x.tokens_exact ?? undefined, requests: x.requests ?? undefined,
    created_at: x.$createdAt,
  };
}

/** Thread ya mwisho ya agent + ujumbe wake (kwa mpangilio). */
export async function loadLatestThread(agent: ChatAgent, limit = 200): Promise<{ threadId: string | null; messages: ChatDoc[] }> {
  await ensureAgentChatsSchema();
  try {
    const last = await databases.listDocuments(DB, AGENT_CHATS_COL, [Query.equal("agent_id", agent), Query.orderDesc("$createdAt"), Query.limit(1)]);
    const threadId = (last.documents[0] as any)?.thread_id as string | undefined;
    if (!threadId) return { threadId: null, messages: [] };
    const r = await databases.listDocuments(DB, AGENT_CHATS_COL, [
      Query.equal("agent_id", agent), Query.equal("thread_id", threadId), Query.orderAsc("seq"), Query.orderAsc("$createdAt"), Query.limit(limit),
    ]);
    return { threadId, messages: r.documents.map((d) => fromDoc(d as any)) };
  } catch (err) { noteError(err, "kupakia thread"); }
}

/** Hifadhi ujumbe (id ya ujumbe = id ya document): unda, au sasisha kama upo (feedback / regenerate). */
export async function upsertMessage(d: ChatDoc): Promise<void> {
  const data = toPayload(d);
  const id = /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(d.id) ? d.id : ID.unique();
  await ensureAgentChatsSchema();
  const write = async () => {
    try {
      await databases.createDocument(DB, AGENT_CHATS_COL, id, data);
    } catch (err) {
      if ((err as { code?: number })?.code !== 409) throw err;
      await databases.updateDocument(DB, AGENT_CHATS_COL, id, data);
    }
  };
  try {
    await write();
  } catch (err) {
    if (!badStructure(err)) noteError(err, `kuhifadhi ujumbe ${id}`);
    console.warn(`[agent-chats] muundo haujakamilika (${(err as Error)?.message}) — inakamilisha kisha inajaribu tena`);
    await ensureAgentChatsSchema(true);
    try { await write(); } catch (e2) { noteError(e2, `kuhifadhi ujumbe ${id} (jaribio la 2)`); }
  }
}

export async function setFeedback(id: string, feedback: "up" | "down" | null): Promise<void> {
  try { await databases.updateDocument(DB, AGENT_CHATS_COL, id, { feedback }); } catch (err) { noteError(err, "feedback"); }
}

export async function deleteMessage(id: string): Promise<void> {
  try { await databases.deleteDocument(DB, AGENT_CHATS_COL, id); } catch (err) {
    if ((err as { code?: number })?.code === 404) return;
    noteError(err, "kufuta ujumbe");
  }
}

/** "Clear" — futa ujumbe wote wa thread hii. */
export async function deleteThread(agent: ChatAgent, threadId: string): Promise<number> {
  let n = 0;
  try {
    for (let guard = 0; guard < 50; guard++) {
      const r = await databases.listDocuments(DB, AGENT_CHATS_COL, [Query.equal("agent_id", agent), Query.equal("thread_id", threadId), Query.limit(100), Query.select(["$id"])]);
      if (!r.documents.length) break;
      await Promise.all(r.documents.map((d) => databases.deleteDocument(DB, AGENT_CHATS_COL, d.$id)));
      n += r.documents.length;
      if (r.documents.length < 100) break;
    }
  } catch (err) { noteError(err, "kufuta thread"); }
  return n;
}

/** Tokens za chat za LEO (timezone ya app) kwa kila agent — kwa /api/stats. null = haijahifadhiwa Appwrite. */
export async function chatUsageSince(startIso: string): Promise<Record<string, { requests: number; tokens: number }> | null> {
  if (!chatStoreState().stored) return null;
  const out: Record<string, { requests: number; tokens: number }> = {};
  try {
    let cursor: string | null = null;
    for (let guard = 0; guard < 20; guard++) {
      const q = [
        Query.equal("role", "agent"), Query.greaterThanEqual("$createdAt", startIso),
        Query.select(["$id", "agent_id", "total_tokens", "requests"]), Query.orderAsc("$createdAt"), Query.limit(500),
      ];
      if (cursor) q.push(Query.cursorAfter(cursor));
      const r = await databases.listDocuments(DB, AGENT_CHATS_COL, q);
      for (const d of r.documents as any[]) {
        const row = (out[d.agent_id] ||= { requests: 0, tokens: 0 });
        row.tokens += d.total_tokens || 0;
        row.requests += d.requests || (d.total_tokens ? 1 : 0);
      }
      if (r.documents.length < 500) break;
      cursor = r.documents[r.documents.length - 1].$id;
    }
    return out;
  } catch (err) {
    try { noteError(err, "tokens za leo"); } catch {}
    return null;
  }
}
