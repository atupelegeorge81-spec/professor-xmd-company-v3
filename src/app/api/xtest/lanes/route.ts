// TASK-30 (maelezo30 #6 + uamuzi wa CEO): weka/ondoa test hooks za lanes WAKATI process inaendelea — KWA MAJARIBIO TU.
// Inafunguka TU XMD_TEST_HOOKS=1 NA header `x-xmd-test` = $XMD_TEST_SECRET (vinginevyo 404).
//   POST {"down":"gemini-flash,xkiro","novision":"xkiro"}  → XMD_TEST_LANES_DOWN / XMD_TEST_LANES_NOVISION ("" = ondoa)
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
const CLASSES = /^(gemini-flash|gemini-flash-lite|xkiro|groq|openrouter|unorouter)(,(gemini-flash|gemini-flash-lite|xkiro|groq|openrouter|unorouter))*$/;

export async function POST(req: Request) {
  if (process.env.XMD_TEST_HOOKS !== "1") return NextResponse.json({ error: "not found" }, { status: 404 });
  const secret = process.env.XMD_TEST_SECRET || "";
  if (!secret || req.headers.get("x-xmd-test") !== secret) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  for (const [k, env] of [["down", "XMD_TEST_LANES_DOWN"], ["novision", "XMD_TEST_LANES_NOVISION"]] as const) {
    if (body[k] === undefined) continue;
    const v = String(body[k] || "").replace(/\s+/g, "");
    if (v && !CLASSES.test(v)) return NextResponse.json({ ok: false, error: `${k}: unknown lane class` }, { status: 400 });
    if (v) process.env[env] = v; else delete process.env[env];
  }
  return NextResponse.json({ ok: true, down: process.env.XMD_TEST_LANES_DOWN || "", novision: process.env.XMD_TEST_LANES_NOVISION || "" });
}
