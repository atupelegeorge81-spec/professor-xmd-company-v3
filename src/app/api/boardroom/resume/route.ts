import { resumeRun, streamRunner } from "@/lib/boardRunner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// R16.1: `id` = runner id AU session id. Mjadala uliosimamishwa (Detach) unaendelea PALE PALE.
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) return Response.json({ error: "Missing id" }, { status: 400 });

  const runner = await resumeRun(id);
  if (runner === "busy") {
    return Response.json(
      { error: "Kuna mjadala mwingine unaoendelea sasa hivi — usimamishe kwanza (Detach), kisha Resume huu." },
      { status: 409 },
    );
  }
  if (runner === "pausing") {
    // R38-RC5: snapshot ya XMD Computer bado inapangwa (sekunde chache) — si kosa, ni subiri
    return Response.json(
      { error: "XMD Computer bado inahifadhi hali yake (workspace → snapshot). Subiri sekunde chache, kisha Resume tena." },
      { status: 409 },
    );
  }
  if (!runner) {
    return Response.json(
      { error: "Haiwezekani kuendelea — mjadala haupo tena kwenye kumbukumbu ya server, au tayari umekamilika." },
      { status: 404 },
    );
  }
  return streamRunner(runner);
}
