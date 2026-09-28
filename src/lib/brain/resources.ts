// src/lib/brain/resources.ts — UELEWA WA MAZINGIRA (R12): agent anajua rasilimali zake HALISI kwenye kila wito.
//   • model anayotumia sasa + provider + kwamba ni FREE tier (Mkuu hatumii paid tokens)
//   • quota ya bure ya leo (XKiro GET /v1/usage — bure) · iliyotumika · iliyobaki · makadirio ya zamu zilizobaki
//   • tokens za Board hii (jumla, zake yeye, agenda hii) · wastani wa gharama ya zamu yake
//   • hali ya mjadala: zamu x/kikomo, stall, research passes alizotumia/kikomo, hati zilizosomwa
//   • zana alizonazo na asizonazo · Mkuu hayupo kwenye Board
// Namba zote zinatoka stateBus (boardRunner → recordUsage), ledger ya providers na broker; hakuna kinachobuniwa.
import { stateBus } from "./stateBus";
import { DEFAULT_MODEL } from "@/lib/env";
import { peekXkiroUsage } from "@/lib/server/xkiroUsage";
import { buildSnapshot } from "@/lib/server/usageSnapshot";
import { ledger } from "@/lib/server/usageLedger";
import { ensureGroqLimits } from "@/lib/server/groqLimits";
import { accountMeta, type AccountMeta, type AccountView } from "@/lib/usage/accounts";
import { engineOf, personaOf } from "./ids";
import { peekLane } from "@/lib/broker";
import { personaName } from "./identity";

const n = (v: number) => Math.round(v).toLocaleString("en-US");

const TZ = process.env.APP_TIMEZONE || "Africa/Dar_es_Salaam";
const at = (ms: number) => new Date(ms).toLocaleString("en-GB", { timeZone: TZ, weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
const ago = (ms: number) => { const s = Math.max(0, Math.round((Date.now() - ms) / 1000)); return s < 90 ? `${s}s ago` : `${Math.round(s / 60)} min ago`; };

/** Mstari mmoja wa akaunti kwa prompt — namba halisi tu; kisichojulikana kinasemwa wazi. */
function accountLine(a: AccountView, here: boolean): string {
  const tag = here ? " [YOU ARE HERE]" : "";
  if (!a.configured) return `${a.label}${tag}: no key configured.`;
  const st = a.status === "exhausted" ? " · EXHAUSTED" : a.status === "cooling" ? " · cooling down (rate limit)" : a.status === "low" ? " · LOW" : "";
  if (a.provider === "xkiro") {
    if (a.used == null) return `${a.label}${tag}: usage not readable right now${a.note ? ` (${a.note})` : ""} — treat as limited.`;
    return `${a.label}${tag}: ${n(a.used)} / ${n(a.limit || 0)} tokens today (${Math.round(a.pct || 0)}%) · remaining ${n(a.remaining || 0)}${st} · XKiro's own daily window${a.lastResetAt ? `; last real reset seen ${at(a.lastResetAt)}` : ""}.`;
  }
  if (a.provider === "groq") {
    const per = (a.models || []).map((m) => `${m.model} ${n(m.used)}${m.tpd ? `/${n(m.tpd)}` : ""}${m.rpdLimit ? ` (requests ${n(m.rpdUsed ?? 0)}/${n(m.rpdLimit)})` : ""}${m.retryAt ? ` retry at ${at(m.retryAt)}` : ""}`).join(" · ");
    const head = a.limit ? `${n(a.used || 0)} / ${n(a.limit)} tokens (${Math.round(a.pct || 0)}%) · remaining ${n(a.remaining || 0)}` : `${n(a.used || 0)} tokens counted${a.pct != null ? ` (${Math.round(a.pct)}% of daily requests)` : ""}`;
    return `${a.label}${tag}: ${head}${st} in Groq's 24h refilling window${a.resetAt ? `, fully refilled by ${at(a.resetAt)}` : ""}${per ? ` · ${per}` : ""}.`;
  }
  if (a.provider === "openrouter") {
    return `${a.label}${tag}: ${n(a.requests || 0)} / ${n(a.requestLimit || 50)} free requests today (${Math.round(a.pct || 0)}%)${st} · ${n(a.used || 0)} tokens · resets 03:00 Dar (UTC midnight). Big jobs only (1M context).`;
  }
  if (a.provider === "gemini") {
    return `${a.label}${tag}: ${n(a.requests || 0)} / ${n(a.requestLimit || 0)} free requests today (${Math.round(a.pct || 0)}%)${st} · ${a.note || ""} · ${n(a.used || 0)} tokens · each model has its own daily count; resets 10:00 Dar (Pacific midnight). Flash = big jobs (code, mini-reports, final script, report); Flash-Lite = observers/memory/small tasks.`;
  }
  const slot = (a.slots || []).map((x) => `${x.model.replace(/:free$/, "")} ${x.readyAt ? `next slot ${at(x.readyAt)}` : "slot open"}`).join(" · ");
  return `${a.label}${tag}: ${n(a.used || 0)} tokens in ${n(a.requests || 0)} requests today${a.pct != null ? ` (${Math.round(a.pct)}% of learned daily budget)` : ""}${st} · 1 request/min per model${slot ? ` · ${slot}` : ""}. Big jobs (1M context, long output).`;
}

function tierOf(model: string): string {
  return /:free\b/i.test(model) ? "FREE tier" : "free plan key";
}

export interface ResourceOpts { surface: "chat" | "board"; agentId: string; sessionId?: string; phase?: string; full?: boolean }

/** Akaunti + model ambayo agent yuko nayo sasa: lane ya mwisho (dakika 15) au ile broker angechagua sasa. */
function currentLane(engine: string): { acc: AccountMeta; model: string; lastAt?: number; ok?: boolean } {
  const route = ledger().routes[engine];
  if (route && Date.now() - route.at < 15 * 60_000) return { acc: accountMeta(route.account), model: route.model || DEFAULT_MODEL, lastAt: route.at, ok: route.ok };
  const lane = peekLane(engine, "normal");
  return lane ? { acc: accountMeta(lane.account), model: lane.model } : { acc: accountMeta("xkiro-1"), model: DEFAULT_MODEL };
}

const ROUTING = "Capacity Broker (automatic): every call goes to the free lane with real room for it — big jobs → Gemini Flash (fast, 1M context) then UnoRouter/OpenRouter, board turns & chat → XKiro, observers/small decisions/background → Gemini Flash-Lite then Groq. OpenRouter (100 requests/day) is kept for big jobs only. Used-up accounts are set aside until they reset.";

/** Akaunti moja kwa maneno machache (kwa mstari wa muhtasari). */
function shortAcc(a: AccountView): string {
  if (!a.configured) return `${a.label} no key`;
  if (a.provider === "openrouter") return `${a.label} ${a.requests ?? 0}/${a.requestLimit ?? 50} req${a.status === "exhausted" ? " EXHAUSTED" : ""}`;
  if (a.provider === "unorouter") return `${a.label} ${a.used ? `${Math.round(a.used / 1000)}K` : "0"} tok${a.status === "exhausted" ? " EXHAUSTED" : a.status === "cooling" ? " waiting slot" : ""}`;
  if (a.provider === "gemini") return `${a.label} ${a.requests ?? 0}/${a.requestLimit ?? 0} req (${a.note || ""})${a.status === "exhausted" ? " EXHAUSTED" : ""}`;
  if (a.used == null) return `${a.label} unreadable`;
  const left = a.remaining != null ? ` (${a.remaining >= 1000 ? `${Math.round(a.remaining / 1000)}K` : n(a.remaining)} left)` : "";
  return `${a.label} ${Math.round(a.pct || 0)}%${a.status === "exhausted" ? " EXHAUSTED" : a.status === "cooling" ? " cooling" : left}`;
}

/**
 * R15/R16 — MUHTASARI (prompt kuu ya kila wito): lane + model ya sasa, akaunti zote 9 kwa mstari mmoja, bajeti,
 * na (Board) matumizi ya Board + hali ya mjadala. Maelezo kamili ya kila akaunti: SITE: usage (just-in-time).
 */
export async function resourcesBrief(o: ResourceOpts): Promise<string> {
  const engine = engineOf(personaOf(o.agentId));
  const me = personaName(personaOf(o.agentId));
  const s = o.surface === "board" && o.sessionId ? stateBus.get(o.sessionId) : undefined;
  await peekXkiroUsage().catch(() => null);
  void ensureGroqLimits();
  const snap = buildSnapshot();
  const { acc: cur, model: curModel } = currentLane(engine);
  const curView = snap.accounts.find((a) => a.id === cur.id);
  const lines = ["=== YOUR RESOURCES (live; details: SITE: usage) ==="];
  lines.push(`- Now: ${cur.label} · ${curModel}${curView?.remaining != null ? ` · ${n(curView.remaining)} tokens left on it` : ""}. All FREE tiers — wasted tokens = less work today.`);
  lines.push(`- Accounts: ${snap.accounts.map(shortAcc).join(" · ")} · total today ${n(snap.totalToday)} tokens. Routing: Capacity Broker (automatic, by real free room).`);
  const myAvg = s?.usage?.byAgent?.[engine]?.requests ? s.usage.byAgent[engine].tokens / s.usage.byAgent[engine].requests : 0;
  if (myAvg && curView?.remaining != null) lines.push(`- Budget: ≈${n(myAvg)} tokens per call → ≈${n(curView.remaining / myAvg)} more calls on ${cur.label}.${(curView.pct ?? 0) >= 85 ? " LOW — be brief; no repeated research." : ""}`);
  else if (curView && (curView.pct ?? 0) >= 85) lines.push(`- ${cur.label} is at ${Math.round(curView.pct!)}% — be brief; no repeated research.`);
  if (s?.usage) {
    const mine = s.usage.byAgent[engine] || { tokens: 0, requests: 0 };
    const agendaTok = s.agendaStartTokens != null ? s.usage.total - s.agendaStartTokens : 0;
    lines.push(`- This Board: ${n(s.usage.total)} tokens / ${n(s.usage.requests)} calls · you (${me}) ${n(mine.tokens)} in ${mine.requests}${s.agendaIndex ? ` · agenda ${s.agendaIndex}/${s.agendaTotal}: ${n(agendaTok)}` : ""}.`);
  }
  if (s?.delib && o.surface === "board" && s.delib.cap && o.phase === "discussion") {
    const d = s.delib;
    lines.push(`- Discussion: turn ${d.turn}/${d.cap} (hard cap) · stall ${d.stall} (2 = notice, 3 = chair closes) · your research ${d.research[engine] || 0}/${d.researchCap} · docs read ${d.docsRead}${d.mode !== "open" ? ` · MODE ${d.mode.toUpperCase()}` : ""}.`);
  }
  return lines.join("\n");
}

export async function resourcesBlock(o: ResourceOpts): Promise<string> {
  const engine = engineOf(personaOf(o.agentId));
  const me = personaName(personaOf(o.agentId));
  const s = o.surface === "board" && o.sessionId ? stateBus.get(o.sessionId) : undefined;
  const lines: string[] = ["=== YOUR ENVIRONMENT & RESOURCES (live, measured — not estimates you should invent) ==="];

  // R16/R18: akaunti 10 halisi (XKiro 1/2 · Groq 1/2 · OpenRouter 1/2 · Uno 1/2 · Gemini 1/2) — namba kutoka kwa providers wenyewe
  await peekXkiroUsage().catch(() => null); // inasasisha ledger ya XKiro (GET /v1/usage ni bure)
  void ensureGroqLimits();
  const snap = buildSnapshot();
  const { acc: cur, model: curModel, lastAt, ok } = currentLane(engine);
  lines.push(`- You are running on: ${cur.label} · model ${curModel} (${tierOf(curModel)}).${lastAt ? ` Your last real call ${ago(lastAt)}${ok === false ? " FAILED" : ""}.` : ""} Mkuu runs this company on FREE tiers only: nothing is paid; the real limits are the free token quotas below. Wasted tokens = less work possible today.`);
  lines.push("- API accounts (all FREE; live numbers from the providers themselves):");
  for (const a of snap.accounts) lines.push(`  • ${accountLine(a, a.id === cur.id)}`);
  lines.push(`- Total across the ${snap.accounts.length} accounts right now: ${n(snap.totalToday)} tokens (all reset daily — OpenRouter/UnoRouter at 03:00 Dar, Gemini at 10:00 Dar, XKiro on its own day, Groq refills over 24h).`);
  if (snap.embeddings?.configured) lines.push(`- Search cache embeddings (Gemini, counted separately): ${n(snap.embeddings.requests)} / ${n(snap.embeddings.requestLimit)} requests today — the cache is checked before every web search.`);
  lines.push(`- ${ROUTING}`);

  const myAvg = s?.usage?.byAgent?.[engine]?.requests ? s.usage.byAgent[engine].tokens / s.usage.byAgent[engine].requests : 0;
  const curView = snap.accounts.find((a) => a.id === cur.id);
  if (myAvg && curView?.remaining != null) {
    const turns = curView.remaining / myAvg;
    lines.push(`- Budget: your average is ≈${n(myAvg)} tokens per call → ≈${n(turns)} more calls on ${cur.label}.${(curView.pct ?? 0) >= 85 ? " LOW — be brief and decisive; no repeated research." : ""}`);
  } else if (curView && (curView.pct ?? 0) >= 85) {
    lines.push(`- ${cur.label} is at ${Math.round(curView.pct!)}% — be brief and decisive; no repeated research.`);
  }

  if (s?.usage) {
    const mine = s.usage.byAgent[engine] || { tokens: 0, requests: 0 };
    const agendaTok = s.agendaStartTokens != null ? s.usage.total - s.agendaStartTokens : 0;
    const mins = Math.max(1, Math.round((Date.now() - s.startedAt) / 60000));
    lines.push(`- This Board so far: ${n(s.usage.total)} tokens in ${n(s.usage.requests)} LLM calls · ${mins} min. You (${me}): ${n(mine.tokens)} tokens in ${mine.requests} calls${myAvg ? ` (≈${n(myAvg)} per turn)` : ""}.`);
    if (s.agendaIndex) lines.push(`- This agenda item (${s.agendaIndex}/${s.agendaTotal}): ${n(agendaTok)} tokens so far.`);
  }
  if (s?.delib && o.surface === "board" && s.delib.cap && o.phase === "discussion") {
    const d = s.delib;
    const mineR = d.research[engine] || 0;
    lines.push(`- Owner discussion of this item: turn ${d.turn}/${d.cap} (hard cap) · stall ${d.stall} (at 2 you get a notice, at 3 the chair closes the item) · your research passes ${mineR}/${d.researchCap} · documents read ${d.docsRead}${d.mode !== "open" ? ` · MODE: ${d.mode.toUpperCase()}` : ""}.`);
  }

  if (o.full === false) return lines.join("\n");
  if (o.surface === "board") {
    lines.push("- Tools you have: web search (SearXNG — titles/snippets only; write RESEARCH_REQUEST: <query>), READ_SOURCE: <url> (full text of a web page or PDF, e.g. an official tariff sheet), your private memory, and skills loaded for this step. You cannot run code, open a browser, or contact anyone outside the Board.");
    lines.push("- Mkuu (the CEO) is NOT in the Board while it runs. He reads the final report. Never wait for him; put questions for him in the report's open questions.");
  } else {
    lines.push("- Tools you have here: web search (automatic when needed), your private memory, and skills. Mkuu is here with you in this chat.");
  }
  return lines.join("\n");
}
