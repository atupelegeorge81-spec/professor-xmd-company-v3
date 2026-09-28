import { appTimezone, dayKey, listReportMeta, listSessionMeta } from "@/lib/server/sessionIndex";
import { chatUsageSince } from "@/lib/server/agentChats";

/** Mwanzo wa leo (saa 00:00 kwenye timezone ya app) kama ISO ya UTC. */
function startOfTodayIso(tz: string): string {
  const now = new Date();
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" })
      .formatToParts(now).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value) % 24]),
  ) as Record<string, number>;
  return new Date(now.getTime() - ((p.hour * 60 + p.minute) * 60 + p.second) * 1000 - now.getMilliseconds()).toISOString();
}
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Takwimu halisi za dashboard: zote zinatokana na sessions + reports za Appwrite. */
export async function GET() {
  const tz = appTimezone();
  const [sessions, reports, chatToday] = await Promise.all([listSessionMeta(), listReportMeta(100), chatUsageSince(startOfTodayIso(tz))]);
  const today = dayKey(new Date(), tz);

  const perAgent: Record<string, { requests: number; tokens: number }> = {};
  // Leo, BILA session inayoendelea sasa (UI inaongeza usage yake live kutoka stream).
  const perAgentToday: Record<string, { requests: number; tokens: number }> = {};
  const liveSession = sessions.find((s) => s.state === "live");
  let tokens = 0;
  let tokensToday = 0;
  for (const s of sessions) {
    tokens += s.tokens;
    const isToday = dayKey(s.createdAt, tz) === today;
    if (isToday) tokensToday += s.tokens;
    for (const [id, u] of Object.entries(s.usage)) {
      const p = (perAgent[id] ||= { requests: 0, tokens: 0 });
      p.requests += u.requests;
      p.tokens += u.tokens;
      if (isToday && s !== liveSession) {
        const t = (perAgentToday[id] ||= { requests: 0, tokens: 0 });
        t.requests += u.requests;
        t.tokens += u.tokens;
      }
    }
  }
  // Ushiriki wa kila agent: sessions alizoshiriki + michango yake.
  const perAgentActivity: Record<string, { sessions: number; messages: number; sources: number }> = {};
  for (const s of sessions) {
    for (const id of s.agents) (perAgentActivity[id] ||= { sessions: 0, messages: 0, sources: 0 }).sessions++;
    for (const [id, n] of Object.entries(s.agentMessages)) (perAgentActivity[id] ||= { sessions: 0, messages: 0, sources: 0 }).messages += n;
    for (const [id, n] of Object.entries(s.agentSources)) (perAgentActivity[id] ||= { sessions: 0, messages: 0, sources: 0 }).sources += n;
  }

  // Siku 12 za mwisho (timezone ya app): sessions, tokens na maamuzi yaliyofungwa kwa siku.
  const days: { day: string; sessions: number; tokens: number; locked: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const k = dayKey(new Date(Date.now() - i * 86400000), tz);
    days.push({ day: k, sessions: 0, tokens: 0, locked: 0 });
  }
  for (const s of sessions) {
    const d = days.find((x) => x.day === dayKey(s.createdAt, tz));
    if (d) {
      d.sessions++;
      d.tokens += s.tokens;
      d.locked += s.locked;
    }
  }

  return Response.json({
    timezone: tz,
    today,
    totals: {
      sessions: sessions.length,
      complete: sessions.filter((s) => s.state === "complete").length,
      live: sessions.filter((s) => s.state === "live").length,
      stopped: sessions.filter((s) => s.state === "stopped").length,
      locked: sessions.reduce((n, s) => n + s.locked, 0),
      open: sessions.reduce((n, s) => n + s.open, 0),
      reports: reports.length,
      sources: sessions.reduce((n, s) => n + s.sources, 0),
      tokens,
      tokensToday,
      sessionsToday: sessions.filter((s) => dayKey(s.createdAt, tz) === today).length,
      reportsToday: reports.filter((r) => dayKey(r.createdAt, tz) === today).length,
    },
    perAgent,
    perAgentToday,
    perAgentActivity,
    // Tokens za agent chat za leo kutoka Appwrite (key = id ya UI: ultron…). null = chat haziko Appwrite → UI inatumia hesabu ya kivinjari.
    chatToday,
    liveSessionId: liveSession?.id || null,
    days,
  });
}
