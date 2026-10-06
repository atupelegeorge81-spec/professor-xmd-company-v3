import { startRun, streamRunner } from "@/lib/boardRunner";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const project = typeof body.project === "string" ? body.project.trim() : "";
  if (!project) return Response.json({ error: "Missing project" }, { status: 400 });
  // R32.1: force = kazi mpya lazima ifungue session mpya (mjadala unaoendelea unapuuzwa/paused na server)
  const runner = startRun(project, { force: body.force === true });
  return streamRunner(runner);
}
