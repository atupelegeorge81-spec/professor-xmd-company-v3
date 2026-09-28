import { pauseRun } from "@/lib/boardRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R16.1 — Detach: simamisha mjadala KABISA (zamu inayoendelea inakatwa, hakuna agent anayeendelea background).
// Resume (/api/boardroom/resume) inaendelea pale pale ulipoishia.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });
  const r = pauseRun(id);
  if (!r) return Response.json({ ok: false, error: "Hakuna mjadala unaoendelea wa id hii." }, { status: 404 });
  return Response.json({ ok: true, id: r.id, sessionId: r.sessionId || null, status: r.status });
}
