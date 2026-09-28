// src/lib/brain/llm.ts — wito wa LLM wa background (memory, reflection, consolidation, checkpoints).
// R16: unapitia Capacity Broker (darasa BACKGROUND: Uno → Groq → XKiro · anaweza kusubiri slot hadi 65s).
// Board inapitisha auxChatWithRotation yake (usage meter ya session). Chat inatumia standaloneLlm.
import { brokerComplete, type WorkClass } from "@/lib/broker";

export interface LlmOpts {
  cls?: WorkClass;
  purpose?: string;
  /** R20: lane halisi + tokens za wito (kwa rekodi za memory — badala ya "rotation"/null) */
  onMeta?: (m: { model: string; tokens: number | null }) => void;
}
export type LlmFn = (agentId: string, messages: Record<string, unknown>[], maxTokens: number, opts?: LlmOpts) => Promise<string>;

export const standaloneLlm: LlmFn = async (agentId, messages, maxTokens, opts) => {
  const r = await brokerComplete({
    agentId, purpose: opts?.purpose || "background", cls: opts?.cls || "background", priority: "background",
    messages: messages as never, maxOut: maxTokens, temperature: 0.2,
  });
  const u = r.usage?.total_tokens;
  if (u) console.log(`🧠 [llm] ${agentId} · ${r.lane.label} · ${u} tokens`);
  try { opts?.onMeta?.({ model: r.lane.label, tokens: u ?? null }); } catch {}
  return r.text;
};

export const stripThink = (s: string) => String(s || "").replace(/<think>[\s\S]*?<\/think>/gi, "").replace(/^[\s\S]*?<\/think>/i, "").trim();
