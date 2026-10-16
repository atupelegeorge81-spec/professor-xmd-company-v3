// POST /api/boardroom/cu-quota — Adaptive Brain §6: sandbox ya CU husoma quota ya ledger ya server
// (matumizi ya Board + CU) wakati wa run. Auth: Bearer token ya run (pattern ya cu-search/cu-event).
import { findRunner } from "@/lib/boardRunner";
import { cuQuotaSnapshot } from "@/lib/cu/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const runner = findRunner(String(body?.session || ""));
  const auth = req.headers.get("authorization") || "";
  if (!runner?.cu || auth !== `Bearer ${runner.cu.token}`) {
    return Response.json({ ok: false, error: "token" }, { status: 401 });
  }
  return Response.json({ ok: true, ...cuQuotaSnapshot() });
}
