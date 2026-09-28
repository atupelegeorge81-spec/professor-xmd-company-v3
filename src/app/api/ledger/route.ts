import { listLedger } from "@/lib/ledger";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Ledger entries za runner (project_id = runner id). approved_code haitumwi — ni nzito. */
export async function GET(req: Request) {
  const runner = new URL(req.url).searchParams.get("runner") || "";
  if (!runner) return Response.json({ entries: [] });
  const entries = await listLedger(runner, 1).catch(() => []);
  return Response.json({
    entries: entries.map(({ approved_code, ...e }) => ({ ...e, hasCode: !!approved_code })),
  });
}
