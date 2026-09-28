// src/lib/broker/estimate.ts — makadirio ya tokens (kabla ya kutuma) + darasa la kazi.
// Tunakadiria juu kidogo (chars/3.3 + overhead ya kila ujumbe) ili Groq (inayohesabu prompt + max_tokens
// dhidi ya TPM) isirudishe 413 — ni bora kuruka lane kuliko kuonyesha kosa.

export type WorkClass = "heavy" | "normal" | "light" | "background";
export type Priority = "live" | "chat" | "observer" | "background";

type Msg = { role: string; content?: unknown };

export function textOf(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) return content.map((p: any) => (typeof p === "string" ? p : p?.text || "")).join("");
  return content == null ? "" : String(content);
}

export function estimateTokens(messages: Msg[] | string): number {
  if (typeof messages === "string") return Math.ceil(messages.length / 3.3) + 8;
  let chars = 0;
  for (const m of messages) chars += textOf(m.content).length;
  return Math.ceil(chars / 3.3) + messages.length * 6 + 12;
}

/** Darasa kwa ukubwa, kama mwito haukulitaja (plan v2: HEAVY = context >30K au jibu >8K). */
export function classOf(estIn: number, maxOut: number, hint?: WorkClass): WorkClass {
  if (hint) return estIn > 30_000 || maxOut > 8_000 ? "heavy" : hint;
  if (estIn > 30_000 || maxOut > 8_000) return "heavy";
  if (estIn + maxOut <= 3_500) return "light";
  return "normal";
}
