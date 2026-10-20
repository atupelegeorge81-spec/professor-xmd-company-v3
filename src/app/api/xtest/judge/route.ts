// TASK-30 REAL TESTS T1–T3/T5 — wito HALISI wa broker kwenye Koyeb (S1). KWA MAJARIBIO TU:
// XMD_TEST_HOOKS=1 NA header `x-xmd-test` = $XMD_TEST_SECRET (vinginevyo 404). Hakuna siri kwenye jibu (keyId = herufi 4 za mwisho).
//   POST {"n":10}                         → wito 10 wa judge (T1: mgawanyo wa keys)
//   POST {"n":3,"down":"gemini-flash"}    → hooks za lanes kwa muda wa ombi hili tu (T2)
//   POST {"n":1,"image":true}             → picha halisi 64×64 (nyekundu) — vision rule (lane bila vision → digest)
//   POST {"regular":true}                 → wito wa kawaida wa zamu ya Board (bila judge) — T5
import { NextResponse } from "next/server";
import { deflateSync } from "node:zlib";
import { brokerComplete } from "@/lib/broker";
import { judgeComplete, laneUseOf } from "@/lib/milestone/judge";
import type { LaneUse } from "@/lib/milestone/types";

export const dynamic = "force-dynamic";
export const maxDuration = 800;

function redPng(size = 64): string {
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const x of b) c = crcT[(c ^ x) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 2;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(size * 3, Buffer.from([255, 0, 0]))]);
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array(size).fill(row)))), chunk("IEND", Buffer.alloc(0))]).toString("base64");
}

export async function POST(req: Request) {
  if (process.env.XMD_TEST_HOOKS !== "1") return NextResponse.json({ error: "not found" }, { status: 404 });
  const secret = process.env.XMD_TEST_SECRET || "";
  if (!secret || req.headers.get("x-xmd-test") !== secret) return NextResponse.json({ error: "not found" }, { status: 404 });
  const body = await req.json().catch(() => ({}));
  const n = Math.max(1, Math.min(Number(body.n) || 1, 12));
  const saved = { down: process.env.XMD_TEST_LANES_DOWN, novision: process.env.XMD_TEST_LANES_NOVISION };
  const set = (k: string, v: unknown) => { if (v === undefined) return; const s = String(v || ""); if (s) process.env[k] = s; else delete process.env[k]; };
  set("XMD_TEST_LANES_DOWN", body.down); set("XMD_TEST_LANES_NOVISION", body.novision);
  const out: { i: number; record?: LaneUse; answer?: string; reasoningChars?: number; usage?: unknown; error?: string }[] = [];
  try {
    for (let i = 0; i < n; i++) {
      try {
        if (body.regular) {
          // T5: umbo la zamu ya kawaida ya Board (boardRunner.streamTurn: cls normal · live · reasoning) — BILA judge
          const r = await brokerComplete({ agentId: "frontend", purpose: "board-turn", cls: "normal", priority: "live", reasoning: true, maxOut: 400, temperature: 0.3, messages: [{ role: "user", content: "xmdtest T5: reply with the single word OK." }] });
          out.push({ i, record: laneUseOf(r.call, "board-turn"), answer: r.text.slice(0, 60) });
          continue;
        }
        const content = body.image
          ? [{ type: "text", text: "Image xmdtest-red — route / · viewport 64x64 · state default:" }, { type: "image_url", image_url: { url: `data:image/png;base64,${redPng()}` } }, { type: "text", text: "What colour is the square? Reply with one word." }]
          : `xmdtest judge call ${i + 1}/${n}: is 17 a prime number? Think, then reply with one word: YES or NO.`;
        let rec: LaneUse | undefined;
        const r = await judgeComplete(
          { agentId: "designer", purpose: `xmdtest-judge:${i + 1}`, maxOut: 2000, cls: "heavy", effort: "high", temperature: 0.2, priority: "background", waitMs: 60_000, messages: [{ role: "user", content: content as never }] },
          { digest: body.image ? { "xmdtest-red": "A solid square filled entirely with one bright red colour (#FF0000); no text, no other shapes." } : null, onLane: (x) => { rec = x; } },
        );
        out.push({ i, record: rec, answer: r.text.slice(0, 60), reasoningChars: r.reasoning.length, usage: r.usage }); // usage = namba tu (T3: thinking metadata)
      } catch (e) {
        out.push({ i, error: String((e as Error)?.message || e).slice(0, 200) });
      }
    }
  } finally {
    set("XMD_TEST_LANES_DOWN", saved.down ?? ""); set("XMD_TEST_LANES_NOVISION", saved.novision ?? "");
  }
  return NextResponse.json({ ok: true, hooks: { down: body.down ?? null, novision: body.novision ?? null }, calls: out });
}
