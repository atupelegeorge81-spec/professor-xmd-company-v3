import { runAgentStream } from "@/lib/groq";
import { getAgent } from "@/lib/agents";
import { buildAgentPrompt } from "@/lib/brain/runtime";
import { chatMemoryDue, writeChatMemory } from "@/lib/brain/memory/chat";
import { standaloneLlm } from "@/lib/brain/llm";
import { personaOf } from "@/lib/brain/ids";
import { rollingContext } from "@/lib/brain/memory/rolling";
import { memoryOn, memoryOffNote } from "@/lib/brain/memory/switch";
import { siteQuery } from "@/lib/brain/site/query";
import type { AgentEvent } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nid = () => Math.random().toString(36).slice(2, 10);
/** R15: Mkuu anaomba Board waziwazi ("anzisha board", "nenda board room", "start/convene the board"). */
const BOARD_INTENT = /\b(anzisha|fungua|anza|start|convene|launch)\b[^.\n]{0,40}\b(board|bodi)\b|\b(nenda|ingia|go\s+to)\s+(kwenye\s+|to\s+|the\s+)?(board|bodi)\b/i;
type Msg = { role: "user" | "assistant"; content: string };

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const agentId = typeof body.agentId === "string" ? body.agentId : undefined;
  const prompt = typeof body.prompt === "string" ? (body.prompt as string).trim() : "";
  const rawHistory = Array.isArray(body.messages) ? body.messages : [];
  const agent = agentId ? getAgent(agentId) : undefined;
  if (!agent || !prompt) return Response.json({ error: "Missing agent or prompt" }, { status: 400 });

  const all: Msg[] = rawHistory.map((m) => {
    const msg = m as { role?: string; content?: string };
    const role = msg.role === "assistant" ? ("assistant" as const) : ("user" as const);
    return { role, content: msg.content || "" };
  }).filter((m) => m.content.trim().length > 0);
  // messages 14 za karibuni → verbatim; za zamani zaidi → ROLLING CHECKPOINT ya thread (memory/rolling.ts)
  // offset = messages za thread zilizo kabla ya dirisha lililotumwa (mteja anatuma 60 za mwisho)
  const offset = typeof body.offset === "number" && body.offset > 0 ? Math.floor(body.offset) : 0;
  // idadi ya messages zote za thread BAADA ya jibu hili (kwa memory ya chat, kila 20)
  const count = typeof body.count === "number" ? body.count : all.length + 2;
  const threadId = typeof body.threadId === "string" ? body.threadId.slice(0, 40) : undefined;

  const date = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: process.env.APP_TIMEZONE || process.env.NEXT_PUBLIC_APP_TIMEZONE || "Africa/Dar_es_Salaam" });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: AgentEvent) => { try { controller.enqueue(encoder.encode(JSON.stringify(e) + "\n")); } catch {} };
      const blog = (type: "info" | "success" | "warning" | "error" | "api" | "search" | "system", message: string) =>
        send({ type: "log", entry: { id: nid(), timestamp: new Date().toLocaleTimeString("en-GB"), at: Date.now(), type, message } });

      (async () => {
        let answer = "";
        let failed = false;
        let history: Msg[] = all.slice(-14);
        try {
          blog("system", `🎭 ${agent.emoji} ${agent.name} (${agent.role}) ameamshwa.`);
          blog("info", `📝 Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`);
          const roll = await rollingContext({ persona: personaOf(agent.id), threadId, all, offset, llm: standaloneLlm, blog: (t, m) => blog(t, m) });
          history = roll.history;
          if (history.length > 0) blog("info", `💬 History: ${history.length} messages${roll.older ? ` + ${roll.older} za zamani (rolling checkpoint)` : ""}`);

          // AGENT RUNTIME: identity + live context + understanding + memory + rolling + skills + date
          const built = await buildAgentPrompt({ agentId: agent.id, surface: "chat", phase: "chat", task: prompt, chatMessages: count, date, rolling: roll.block, blog });

          await runAgentStream({
            agentId: agent.id,
            systemPrompt: built.system,
            liteSystemPrompt: built.lite,
            site: (q) => siteQuery(q, { agentId: agent.id, surface: "chat" }),
            boardIntent: BOARD_INTENT.test(prompt),
            history,
            userPrompt: prompt,
            onEvent: (e) => { if (e.type === "token") answer += e.text; if (e.type === "error") failed = true; send(e); },
          });
          send({ type: "done" });
        } catch (err) {
          failed = true;
          send({ type: "error", message: (err as Error)?.message || "Unexpected error" });
          blog("error", `❌ Critical: ${(err as Error)?.message}`);
        }

        // MEMORY YA CHAT (Swali 9.2): kila baada ya messages ~20 agent anaandika Self Memory yake.
        // Background tu: UI inaonyesha shimmer ("anaandika kumbukumbu…"), maudhui hayaonyeshwi.
        if (!failed && answer.trim() && chatMemoryDue(count) && !memoryOn()) memoryOffNote((t, m) => blog(t, m));
        else if (!failed && answer.trim() && chatMemoryDue(count)) {
          const p = personaOf(agent.id);
          send({ type: "memory", state: "start" });
          const st = await writeChatMemory(standaloneLlm, (t, m) => blog(t, m), {
            persona: p, threadId, reason: "threshold",
            messages: [...all, { role: "user", content: prompt }, { role: "assistant", content: answer }],
          });
          send({ type: "memory", state: st === "saved" ? "saved" : st === "none" ? "none" : "fail" });
        }
        try { controller.close(); } catch {}
      })();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" } });
}
