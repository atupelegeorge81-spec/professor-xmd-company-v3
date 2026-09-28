import { activeRunner, pausedRunners } from "@/lib/boardRunner";
export const dynamic = "force-dynamic";
export async function GET() {
  const r = activeRunner();
  const p = pausedRunners()[0];
  return Response.json({
    active: r ? { id: r.id, status: r.status, project: r.project, sessionId: r.sessionId || null, startedAt: r.startedAt } : null,
    // R16.1: mjadala uliosimamishwa (Detach) — UI inaonyesha "Resume", HAIJIUNGANISHI yenyewe
    paused: p ? { id: p.id, status: p.status, project: p.project, sessionId: p.sessionId || null, pausedAt: p.pausedAt || null } : null,
  });
}
