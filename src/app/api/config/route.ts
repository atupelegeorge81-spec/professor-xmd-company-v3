import { AGENTS } from "@/lib/agents";
import { DEFAULT_MODEL } from "@/lib/env";
import { allLanes } from "@/lib/broker";
import { appwriteConfigured } from "@/lib/server/appwrite";
import { appTimezone } from "@/lib/server/sessionIndex";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Models halisi + lanes za broker zilizosanidiwa (booleans/majina tu — hakuna siri inayotoka). */
export async function GET() {
  const lanes = allLanes();
  return Response.json({
    timezone: appTimezone(),
    appwrite: appwriteConfigured,
    searxng: process.env.SEARXNG_URL ? "custom" : "default",
    primaryModel: DEFAULT_MODEL,
    lanes: lanes.map((l) => ({ id: l.id, account: l.account, provider: l.provider, label: l.label, model: l.model })),
    agents: AGENTS.map((a) => ({ id: a.id, name: a.name, role: a.role, model: a.model })),
  });
}
