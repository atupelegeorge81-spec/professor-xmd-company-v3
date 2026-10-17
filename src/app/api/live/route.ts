// TASK-7: liveness BILA DB — kwa health check ya Koyeb + keep-alive. Haitegemei code yoyote ya mradi (graph ndogo).
// /api/health inabaki deep check (DB) kwa binadamu.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export function GET() {
  return Response.json({ ok: true, t: Date.now() }, { status: 200, headers: { "Cache-Control": "no-store" } });
}
