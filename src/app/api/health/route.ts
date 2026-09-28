import { Query } from "node-appwrite";
import { appwriteConfigured, databases, DB, SESSIONS_COL } from "@/lib/server/appwrite";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Afya ya mfumo: Appwrite (hifadhi ya sessions/reports/ledger). */
export async function GET() {
  if (!appwriteConfigured) return Response.json({ ok: false, appwrite: "not_configured" }, { status: 503 });
  try {
    await databases.listDocuments(DB, SESSIONS_COL, [Query.limit(1)]);
    return Response.json({ ok: true, appwrite: "ok" });
  } catch {
    return Response.json({ ok: false, appwrite: "unreachable" }, { status: 503 });
  }
}
