// GET /api/usage/models — model ambayo kila agent anatumia SASA (lib/server/liveModels.ts). Hakuna key inayorudishwa.
import { liveModels } from "@/lib/server/liveModels";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({ models: await liveModels(), at: Date.now() });
}
