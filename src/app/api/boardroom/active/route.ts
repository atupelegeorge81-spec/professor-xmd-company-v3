import { activeRunner, pausedRunners } from "@/lib/boardRunner";
export const dynamic = "force-dynamic";
export async function GET() {
  // R31-G4: kila ombi linakagua sessions zilizopumzika (quota) — throttle 60s ndani ya check.
  // TASK-5: + orphan sweeper (throttle 60s ndani yake pia)
  void import("@/lib/cu/autoResume").then(async (m) => { await m.sweepOrphans(); return m.checkPausedDue(); }).catch(() => {});

  const r = activeRunner();
  const p = pausedRunners()[0];
  return Response.json({
    active: r ? { id: r.id, status: r.status, project: r.project, sessionId: r.sessionId || null, startedAt: r.startedAt } : null,
    // R16.1: mjadala uliosimamishwa (Detach) — UI inaonyesha "Resume", HAIJIUNGANISHI yenyewe
    paused: p ? { id: p.id, status: p.status, project: p.project, sessionId: p.sessionId || null, pausedAt: p.pausedAt || null } : null,
  });
}
