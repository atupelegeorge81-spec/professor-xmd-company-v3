// GET /api/usage/xkiro — quota ya bure ya XKiro kwa UI (mantiki iko lib/server/xkiroUsage.ts).
import { getXkiroUsage } from "@/lib/server/xkiroUsage";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getXkiroUsage());
}
