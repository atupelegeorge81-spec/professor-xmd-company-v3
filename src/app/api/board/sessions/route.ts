import { listSessionMeta } from "@/lib/server/sessionIndex";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Sessions halisi kutoka Appwrite + hali (complete / live / stopped), tokens, agenda na maamuzi. */
export async function GET() {
  const sessions = await listSessionMeta();
  return Response.json({ sessions });
}
