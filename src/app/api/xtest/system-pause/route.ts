// TASK-1 (maelezo1, hatua 7): Test hook ya system-pause — KWA MAJARIBIO TU.
// Inafunguka TUUKIWA XMD_TEST_HOOKS=1 NA header `x-xmd-test` sio sawa na $XMD_TEST_SECRET → 404.
// Matumizi: majaribio T3/T4/T5 (system pause → chip status, timers, upgrade).
import { NextResponse } from "next/server";
import { runSystemPauseForTest } from "@/lib/server/watchdog";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (process.env.XMD_TEST_HOOKS !== "1") return NextResponse.json({ error: "not found" }, { status: 404 });
  const secret = process.env.XMD_TEST_SECRET || "";
  if (!secret || req.headers.get("x-xmd-test") !== secret) return NextResponse.json({ error: "not found" }, { status: 404 });
  try {
    const body = await req.json().catch(() => ({}));
    const reason = typeof body.reason === "string" && body.reason.trim() ? body.reason.trim().slice(0, 160) : "xmdtest system pause";
    const resumeMs = Math.max(1_000, Math.min(Number(body.resumeMs) || 60_000, 10 * 60_000));
    await runSystemPauseForTest(reason, resumeMs);
    return NextResponse.json({ ok: true, reason, resumeMs });
  } catch (e) {
    return NextResponse.json({ ok: false, error: String(e).slice(0, 160) }, { status: 500 });
  }
}
