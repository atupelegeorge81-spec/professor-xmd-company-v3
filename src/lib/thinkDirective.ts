// src/lib/thinkDirective.ts
// Board Room haikuonyesha "Thought" kwa model ile ile inayoonyesha kwenye agent chat.
//
// Chanzo (kimethibitishwa kwa XKiro halisi, qwen/qwen3.8-max:free):
//  · model HAINA reasoning channel — delta ina `content` + `role` tu (hakuna reasoning_content);
//    mawazo yanaonekana tu model ikiandika <think>…</think> ndani ya content.
//  · system prompt ya board (agents.ts → basePrompt) inasema "do not emit <think> tags in visible text".
//    Agizo la <think> likiwa kwenye ujumbe wa user tu, model inafuata SYSTEM na kupuuza agizo
//    (jaribio: 0/1 <think>). Sentensi ile ikibadilishwa kwenye system → <think> inakuja (1/1).
//
// Suluhisho (flow ya engine haiguswi): kwa calls za mjadala tu —
//  1) sentensi ya "do not emit <think>" kwenye system inabadilishwa kuwa agizo la <think> fupi;
//  2) agizo fupi linaongezwa mwishoni mwa ujumbe wa user.
// Ripoti (REPORT MODE / REPORT REPAIR / "Do not emit <think>") haziguswi kabisa — basePrompt ya
// agents.ts inabaki vile vile kwa ripoti.

// R20 — directive inatumwa KWA LANE tu, si kwa kila provider (imethibitishwa 27 Sep):
//  · XKiro (qwen, hakuna reasoning channel) + Gemini (OpenAI-compat haitoi mawazo) → <think> inarudi safi ndani ya content.
//  · Uno nemotron/space-bunny, OpenRouter, Groq wana reasoning channel yao; Uno ikiambiwa iandike <think>, parser yake
//    inakata mpaka vibaya → content ilianza " tags (under 80 words)…" / ".POSED DECISION" (A6 ya Mama Lishe haikufungwa).
type Msg = Record<string, unknown>;

/** providers wanaopewa agizo la <think> (wengine wanatumia reasoning channel yao) */
export function wantsThinkTags(provider: string): boolean {
  return provider === "xkiro" || provider === "gemini";
}

const DIRECTIVE =
  "\n\n=== THINKING ===\n" +
  "First reason briefly inside <think>...</think> tags (under 80 words — the Board Room UI shows this separately as your Thought, never inside your answer). " +
  "After </think>, write ONLY your visible answer in the exact format requested above.";

// Sentensi ya agents.ts inayozuia <think> (inalinganishwa kwa regex ili mabadiliko madogo ya maneno yasivunje)
const NO_THINK_RULE =
  /Keep private chain-of-thought out of the visible answer;\s*do not emit <think> tags in visible text\.(?:\s*If the provider supplies a native reasoning channel,[^\n.]*\.)?/i;
const THINK_RULE =
  "Before answering, reason briefly inside <think>...</think> tags (under 80 words). The Board Room UI shows that block separately as your \"Thought\" — never inside the answer. After </think>, write only the visible answer; never put reasoning outside the tags.";

// Ripoti zina THINK_CAP yao ("Do not emit <think> tags in the visible report") — haziguswi.
const SKIP = /REPORT MODE|REPORT REPAIR|Do not emit <think>/;

export function withThinkDirective(messages: Msg[]): Msg[] {
  let last = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i]?.role === "user" && typeof messages[i]?.content === "string") { last = i; break; }
  }
  if (last < 0) return messages;
  const content = messages[last].content as string;
  if (SKIP.test(content) || content.includes("=== THINKING ===")) return messages;

  const out = messages.map((m) => {
    if (m?.role !== "system" || typeof m.content !== "string") return m;
    const sys = m.content as string;
    if (SKIP.test(sys) || !NO_THINK_RULE.test(sys)) return m;
    return { ...m, content: sys.replace(NO_THINK_RULE, THINK_RULE) };
  });
  out[last] = { ...out[last], content: content + DIRECTIVE };
  return out;
}
