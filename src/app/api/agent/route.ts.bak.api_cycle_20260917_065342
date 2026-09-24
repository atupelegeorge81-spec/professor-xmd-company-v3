import { runAgentStream } from "@/lib/groq";
import { groqKeyFor, AGENT_MODELS } from "@/lib/env";
import { getAgent } from "@/lib/agents";
import type { AgentEvent } from "@/lib/types";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const nid = () => Math.random().toString(36).slice(2, 10);

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const agentId = typeof body.agentId === "string" ? body.agentId : undefined;
  const prompt = typeof body.prompt === "string" ? (body.prompt as string).trim() : "";
  const rawHistory = Array.isArray(body.messages) ? body.messages : [];
  const agent = agentId ? getAgent(agentId) : undefined;
  if (!agent || !prompt) return Response.json({ error: "Missing agent or prompt" }, { status: 400 });

  const history = rawHistory.slice(-14).map((m) => {
    const msg = m as { role?: string; content?: string };
    const role = msg.role === "assistant" ? ("assistant" as const) : ("user" as const);
    return { role, content: msg.content || "" };
  }).filter((m) => m.content.trim().length > 0);

  const date = new Date().toLocaleString("en-GB", { dateStyle: "full", timeStyle: "short", timeZone: "UTC" });
  const systemPrompt = agent.systemPrompt({ date });

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (e: AgentEvent) => { try { controller.enqueue(encoder.encode(JSON.stringify(e) + "\n")); } catch {} };
      const blog = (type: "info" | "success" | "warning" | "error" | "api" | "search" | "system", message: string) =>
        send({ type: "log", entry: { id: nid(), timestamp: new Date().toLocaleTimeString("en-GB"), type, message } });

      (async () => {
        try {
          blog("system", `🎭 ${agent.emoji} ${agent.name} (${agent.role}) ameamshwa.`);
          blog("info", `📝 Prompt: "${prompt.slice(0, 80)}${prompt.length > 80 ? "…" : ""}"`);
          if (history.length > 0) blog("info", `💬 History: ${history.length} messages`);

          await runAgentStream({systemPrompt, history, userPrompt: prompt, onEvent: send, apiKey: groqKeyFor(agent.id), modelChain: AGENT_MODELS[agent.id] });
          send({ type: "done" });
        } catch (err) {
          send({ type: "error", message: (err as Error)?.message || "Unexpected error" });
          blog("error", `❌ Critical: ${(err as Error)?.message}`);
        } finally { try { controller.close(); } catch {} }
      })();
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" } });
}
