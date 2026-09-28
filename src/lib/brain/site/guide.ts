// src/lib/brain/site/guide.ts — MWONGOZO WA WEBSITE (R15).
// Haupakiwi kwenye prompt. Agent anausoma sehemu anayoihitaji tu kwa `SITE: guide <sehemu>` (just-in-time context).
// Kanuni: maandishi mafupi, ukweli tu kuhusu kile kilichopo kwenye UI hii (hakuna ahadi za vitu visivyokuwepo).

export const GUIDE: Record<string, { title: string; body: string }> = {
  overview: {
    title: "Overview page (/) — home",
    body: `- Greeting "Karibu tena, Mkuu" + today's date (app timezone).
- Hero composer "Eleza project yako hapa…" + button "Convene board": typing a project and sending it STARTS a new Board Room session with that brief.
- Pulse cards: "Decisions locked" (LOCKED decisions across all sessions + sparkline), "Sources verified" (web sources used by the Board), then a full-width "Today's tokens" card below them (big total + 8 rings: XKiro 1/2, Groq 1/2, OpenRouter 1/2, Uno 1/2 — each ring = that account's real % of its OWN limit: tokens for XKiro/Groq, requests x/50 for OpenRouter, learned daily budget for Uno ("—" until known); tokens are shown under every ring).
- "Your board": 5 agent cards (tap one → that agent's private chat room). "Latest report": newest Swahili report. "Live activity": engine logs while a Board runs.`,
  },
  board: {
    title: "Board Room (/board)",
    body: `- Multi-agent discussion of ONE project. Only Mkuu starts it (composer on /board or Overview, or the "Anzisha Board" card an agent offers in chat after Mkuu confirms).
- Flow: Optimus builds the agenda → per agenda item the OWNERS discuss (evidence search, READ_SOURCE, PROPOSED DECISION / AGREE) → observers may object → decision LOCKED or left OPEN → mini-report → next item → Optimus writes the final Swahili report (saved to Reports).
- Only one Board can run at a time. A stopped Board can be resumed from Sessions ("Endeleza pale ilipoishia"). URL ?session=<id> replays a past session.
- Mkuu is NOT inside the Board while it runs; he reads the stage and the final report.`,
  },
  chat: {
    title: "Agent private chat rooms (/agents/<name>)",
    body: `- Each agent has a private 1:1 room with Mkuu. Messages are stored in Appwrite (badge "Appwrite") or the browser if Appwrite is off.
- Composer at the bottom (send button; on phones the keyboard Enter adds a new line). Under each reply: Copy, 👍, 👎, seconds, Regenerate (circular arrow) on the last reply.
- Header: token chip (tokens of this thread), Clear (asks "Are you sure…?" then deletes the whole thread).
- Side panel: agent profile, stats, skills, the model the agent is using right now.
- From a chat room an agent can: answer, search the web, read website data (SITE:), and OFFER to start a Board (Mkuu must press "Anzisha"). An agent in chat is NOT in the Board Room.`,
  },
  agents: {
    title: "Agents page (/agents) + the team",
    body: `- Optimus — Project Manager (consensus chair, writes the final report).
- Ultron — UI/UX Designer. Vextron — Frontend Engineer. Megatron — Backend & DB Engineer. Cybertron — QA & DevOps.
- Every agent has its own API keys for XKiro (Key 1 / Key 2) and Groq (Key 1 / Key 2); OpenRouter (1/2) and UnoRouter (1/2) keys are shared by all agents.
- Routing: the Capacity Broker picks, for every call, the free lane that really has room for it (tokens/minute, daily quota, request slots). Big jobs (reports, >30K context) → UnoRouter then OpenRouter; board turns and chat → XKiro; small decisions → Groq; background (memory) → Groq then UnoRouter. If all are briefly full the agent shows "anasubiri nafasi" for a few seconds. Used-up accounts are set aside until they reset.`,
  },
  reports: {
    title: "Reports (/reports)",
    body: `- Every finished Board saves one Swahili report (title, project, agents, full markdown with code in ScriptBoxes, diagrams). Reports can be opened and read; the sidebar shows the count.`,
  },
  sessions: {
    title: "Sessions (/sessions)",
    body: `- List of all Board sessions (Appwrite "conversations"): title, date, state (complete / live / stopped), agenda progress, tokens. Actions: open/replay, resume a stopped one, delete ("Futa session"). The sidebar shows the count.`,
  },
  usage: {
    title: "Tokens & limits (all FREE tiers)",
    body: `- XKiro: 500,000 tokens/day per ACCOUNT (Key 1 = one account shared by the 5 agents' _1 keys, Key 2 = another). Real numbers from XKiro /v1/usage; reset detected when the counter drops.
- Groq: per ACCOUNT per MODEL 200,000 tokens/day → qwen/qwen3.8-27b 200K + openai/gpt-oss-120b 200K = 400K per key-account (Key 1, Key 2). Refills continuously over 24h. First model runs out → second model.
- Groq also has 8,000 tokens per MINUTE per model, counted as prompt + max output — so big prompts never go to Groq.
- OpenRouter (nvidia/nemotron-3-ultra-550b-a55b:free): 50 free requests per UTC day per account (Key 1, Key 2 = 100/day), 20/minute; resets 03:00 Dar es Salaam. 1M context. Its % is by requests; its tokens are still counted.
- UnoRouter (space-bunny-alpha:free, nemotron-3-ultra-550b-a55b:free): 1 request per minute per model per account; daily token budget is not published (learned when hit); resets 03:00 Dar. 1M context, long outputs.
- Sidebar "Today's usage": 8 coloured segments (one per account); the bar is full only when every account is exhausted.`,
  },
  menu: {
    title: "Sidebar / menu",
    body: `- Links: Overview, Board Room, Agents, Reports (count), Sessions (count). Team list with status dots. "Today's usage" card. Mkuu profile with the System panel (config, models).
- Topbar: page title, "New session" button (opens a fresh Board Room). Mobile: bottom navigation (Overview, Board, Agents, Reports) and a menu button.`,
  },
};

export const GUIDE_KEYS = Object.keys(GUIDE);

export function guideText(key?: string): string {
  const k = String(key || "").toLowerCase().trim();
  if (!k || !GUIDE[k]) {
    return `WEBSITE GUIDE — sections: ${GUIDE_KEYS.join(", ")}. Ask one with SITE: guide <section>.\n${GUIDE_KEYS.map((x) => `- ${x}: ${GUIDE[x].title}`).join("\n")}`;
  }
  return `WEBSITE GUIDE · ${GUIDE[k].title}\n${GUIDE[k].body}`;
}
