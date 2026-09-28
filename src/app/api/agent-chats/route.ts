// /api/agent-chats — historia ya vyumba binafsi vya agents (Appwrite: agent_conversations).
//  GET    ?agent=ultron                → { stored, reason?, threadId, messages }
//  POST   { message: ChatDoc }         → hifadhi / sasisha ujumbe mmoja
//  PATCH  { id, feedback }             → 👍 / 👎 / null
//  DELETE ?id=…                        → futa ujumbe mmoja (regenerate)
//  DELETE ?agent=…&thread=…            → futa thread nzima (Clear)
// Collection ikikosekana → { stored:false } na UI inatumia localStorage (hakuna kinachovunjika).
import {
  chatStoreState, deleteMessage, deleteThread, isChatAgent, loadLatestThread, setFeedback, upsertMessage, type ChatDoc,
} from "@/lib/server/agentChats";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const off = (reason?: string) => Response.json({ stored: false, reason, threadId: null, messages: [] });
const safeId = (s: unknown) => typeof s === "string" && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,35}$/.test(s);

export async function GET(req: Request) {
  const agent = new URL(req.url).searchParams.get("agent");
  if (!isChatAgent(agent)) return Response.json({ error: "agent si sahihi" }, { status: 400 });
  const st = chatStoreState();
  if (!st.stored) return off(st.reason);
  try {
    const r = await loadLatestThread(agent);
    return Response.json({ stored: true, ...r });
  } catch (err) {
    const st2 = chatStoreState();
    return off(st2.reason || `Appwrite: ${(err as Error)?.message || err}`);
  }
}

export async function POST(req: Request) {
  const st = chatStoreState();
  if (!st.stored) return Response.json({ ok: false, stored: false, reason: st.reason });
  const body = (await req.json().catch(() => null)) as { message?: ChatDoc } | null;
  const m = body?.message;
  if (!m || !isChatAgent(m.agent_id) || !safeId(m.id) || !safeId(m.thread_id) || (m.role !== "user" && m.role !== "agent")) {
    return Response.json({ error: "ujumbe si sahihi" }, { status: 400 });
  }
  try {
    await upsertMessage(m);
    return Response.json({ ok: true, stored: true });
  } catch (err) {
    const st2 = chatStoreState();
    return Response.json({ ok: false, stored: st2.stored, reason: st2.reason || (err as Error)?.message }, { status: st2.stored ? 502 : 200 });
  }
}

export async function PATCH(req: Request) {
  const st = chatStoreState();
  if (!st.stored) return Response.json({ ok: false, stored: false, reason: st.reason });
  const body = (await req.json().catch(() => null)) as { id?: string; feedback?: "up" | "down" | null } | null;
  if (!body || !safeId(body.id) || !(body.feedback === "up" || body.feedback === "down" || body.feedback === null)) {
    return Response.json({ error: "ombi si sahihi" }, { status: 400 });
  }
  try {
    await setFeedback(body.id!, body.feedback);
    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ ok: false, reason: (err as Error)?.message }, { status: 502 });
  }
}

export async function DELETE(req: Request) {
  const st = chatStoreState();
  if (!st.stored) return Response.json({ ok: false, stored: false, reason: st.reason });
  const q = new URL(req.url).searchParams;
  const id = q.get("id");
  const agent = q.get("agent");
  const thread = q.get("thread");
  try {
    if (id && safeId(id)) { await deleteMessage(id); return Response.json({ ok: true, deleted: 1 }); }
    if (isChatAgent(agent) && safeId(thread)) return Response.json({ ok: true, deleted: await deleteThread(agent, thread!) });
    return Response.json({ error: "id au agent+thread vinahitajika" }, { status: 400 });
  } catch (err) {
    return Response.json({ ok: false, reason: (err as Error)?.message }, { status: 502 });
  }
}
