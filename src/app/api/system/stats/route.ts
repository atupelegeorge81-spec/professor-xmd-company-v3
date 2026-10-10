// src/app/api/system/stats/route.ts — R43: data ya card ya "System" (CPU · RAM · Disk · Storage).
// Public kama endpoints zote za app; namba HALISI za cgroup za container + Supabase (cached 60s).
import { NextResponse } from "next/server";
import { sysSample } from "@/lib/server/sysinfo";
import { watchdogState } from "@/lib/server/watchdog";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const s = await sysSample();
    return NextResponse.json({ ...s, watchdog: watchdogState() }, { headers: { "cache-control": "no-store" } });
  } catch (e) {
    return NextResponse.json({ error: String(e).slice(0, 200) }, { status: 500 });
  }
}
