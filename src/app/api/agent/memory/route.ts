// POST /api/agent/memory — mwisho wa thread (Mkuu amebonyeza Clear): agent anaandika Self Memory yake.
// Body: { agentId, threadId?, messages: [{role, content}] }. Jibu: { status: "saved" | "none" | "fail" | "skipped" }.
import { getAgent } from "@/lib/agents";
import { writeChatMemory } from "@/lib/brain/memory/chat";
import { standaloneLlm } from "@/lib/brain/llm";
import { consoleBlog } from "@/lib/brain/brainLog";
import { personaOf } from "@/lib/brain/ids";
import { memoryOn, memoryOffNote } from "@/lib/brain/memory/switch";
import { clearRolling } from "@/lib/brain/memory/rolling";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }
  const agent = typeof body.agentId === "string" ? getAgent(body.agentId) : undefined;
  if (!agent) return Response.json({ error: "Missing agent" }, { status: 400 });
  const messages = (Array.isArray(body.messages) ? body.messages : [])
    .map((m) => ({ role: (m as { role?: string }).role === "assistant" ? ("assistant" as const) : ("user" as const), content: String((m as { content?: string }).content || "") }))
    .filter((m) => m.content.trim());
  const threadId = typeof body.threadId === "string" ? body.threadId.slice(0, 40) : undefined;
  // thread imeisha → muhtasari wa rolling wa thread hii hauhitajiki tena kwenye process
  if (threadId) clearRolling(personaOf(agent.id), threadId);
  if (!memoryOn()) { memoryOffNote(consoleBlog); return Response.json({ status: "skipped" }); }
  // thread fupi mno haina cha kukumbuka
  if (messages.length < 4) return Response.json({ status: "skipped" });
  const status = await writeChatMemory(standaloneLlm, consoleBlog, {
    persona: personaOf(agent.id),
    threadId,
    messages,
    reason: "thread_end",
  });
  return Response.json({ status });
}
