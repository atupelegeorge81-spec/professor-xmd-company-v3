// src/lib/brain/memory/chat.ts — Chat → memory (Swali 9.2): agent MWENYEWE anaandika Self Memory yake
// mwisho wa thread (Clear) au kila baada ya ~20 messages. Maudhui hayaonyeshwi kwenye chat — shimmer tu.
import { identityBlock, personaName } from "../identity";
import { readMemory, writeMemory } from "./store";
import { saveEvent } from "./events";
import { compactTranscript } from "./transcript";
import { parseLines, linesFromNote, mergeLines, COLUMN_MAX, today } from "./format";
import { stripThink, type LlmFn } from "../llm";
import { brainLine, type BlogFn } from "../brainLog";
import { engineOf, type Persona } from "../ids";

export const CHAT_MEMORY_EVERY = 20;

/** Je, jibu hili limevuka kizingiti cha messages 20, 40, 60…? (count = messages zote baada ya jibu hili) */
export const chatMemoryDue = (count: number) => count >= CHAT_MEMORY_EVERY && Math.floor(count / CHAT_MEMORY_EVERY) > Math.floor((count - 2) / CHAT_MEMORY_EVERY);

export async function writeChatMemory(
  llm: LlmFn,
  blog: BlogFn,
  c: { persona: Persona; messages: { role: "user" | "assistant"; content: string }[]; threadId?: string; reason: "threshold" | "thread_end" },
): Promise<"saved" | "none" | "fail"> {
  const t0 = Date.now();
  const who = personaName(c.persona);
  try {
    const old = await readMemory(c.persona);
    const oldSelf = old?.self_memory || "";
    const convo = compactTranscript(
      c.messages.slice(-24).map((m) => ({ name: m.role === "user" ? "Mkuu" : who, text: m.content })),
      12000,
    );
    const raw = await llm(
      engineOf(c.persona),
      [
        { role: "system", content: `${identityBlock(c.persona)}\n\n=== TASK: UPDATE YOUR SELF MEMORY (private) ===\nYou maintain your own long-term Self Memory from your private chats with Mkuu. Output only the requested format.` },
        {
          role: "user",
          content: `TODAY: ${today()}

YOUR CURRENT SELF_MEMORY:
${oldSelf || "(empty)"}

RECENT PRIVATE CHAT WITH MKUU:
${convo}

Keep what is durable and useful for future conversations: Mkuu's preferences, decisions he told you, corrections he made to you, facts about his projects, lessons for yourself. Ignore small talk. Merge duplicates, drop stale lines, never invent.
Return your COMPLETE updated Self Memory (old lines you keep + new ones) as:
SELF_MEMORY:
- [YYYY-MM-DD][imp:1-5][Chat] text
(total under ${COLUMN_MAX} characters)
If nothing new is worth remembering, output only: NO_MEMORY`,
        },
      ],
      1800,
    );
    const src = stripThink(raw);
    if (/^\s*NO_MEMORY\s*$/im.test(src) && !/SELF_MEMORY\s*:/i.test(src)) {
      await saveEvent({ agent_id: c.persona, session_id: `chat:${c.threadId || "thread"}`.slice(0, 64), project: "Chat", kind: "checkpoint", agenda_item: `chat (${c.reason})`, status: "no_memory", ms: Date.now() - t0 });
      blog("info", brainLine("memory.chat", who, [c.reason, "NO_MEMORY"], Date.now() - t0));
      return "none";
    }
    const body = src.replace(/^[\s\S]*?SELF_MEMORY\s*:\s*/i, "");
    let lines = parseLines(body);
    if (!lines.length) lines = linesFromNote(body, "Chat");
    // mlinzi: chat inaandika upya mistari ya "Chat" TU. Mistari ya miradi ya Board (Optimus ndiye anaiunganisha)
    // inalindwa daima; na kama jibu ni fupi mno kuliko mistari ya Chat iliyokuwepo, tunaongeza badala ya kubadilisha.
    const prevLines = parseLines(oldSelf);
    const oldChat = prevLines.filter((l) => l.project === "Chat");
    const keepBoard = prevLines.filter((l) => l.project !== "Chat");
    const merged = lines.length >= Math.ceil(oldChat.length * 0.5) ? mergeLines(keepBoard, lines) : mergeLines(prevLines, lines);
    const ok = await writeMemory(c.persona, { self_memory: merged });
    await saveEvent({ agent_id: c.persona, session_id: `chat:${c.threadId || "thread"}`.slice(0, 64), project: "Chat", kind: "checkpoint", agenda_item: `chat (${c.reason})`, self_note: merged, status: ok ? "memory" : "failed", ms: Date.now() - t0 });
    blog(ok ? "success" : "warning", brainLine("memory.chat", who, [c.reason, `SELF ${parseLines(merged).length} lines`, ok ? "agent_memory ✓" : "agent_memory FAILED"], Date.now() - t0));
    return ok ? "saved" : "fail";
  } catch (err: any) {
    blog("warning", brainLine("memory.chat", who, [c.reason, `FAILED: ${String(err?.message || err).slice(0, 100)}`], Date.now() - t0));
    return "fail";
  }
}
