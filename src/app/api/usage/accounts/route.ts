// GET /api/usage/accounts — hali HALISI ya akaunti 10 za API (XKiro · Groq · OpenRouter · UnoRouter · Gemini 1/2 kila moja) + embeddings kwa Pulse + Sidebar.
// Mantiki iko lib/server/usageSnapshot.ts. Hakuna key wala email inayorudishwa.
import { getUsageSnapshot } from "@/lib/server/usageSnapshot";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(await getUsageSnapshot());
}
