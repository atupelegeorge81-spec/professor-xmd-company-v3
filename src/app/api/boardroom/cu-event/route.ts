// src/app/api/boardroom/cu-event/route.ts — R31 · XMD Computer: events kutoka sandbox (bridge).
//
// Njia LIVE ya matukio: bridge (ndani ya E2B) ina-POST kila tukio hapa na token ya run.
//   • Runner yupo (kawaida): dedupe → shot→bucket → usage→meters → items → SSE broadcast.
//   • Runner HAYUPO (Koyeb ilianza upya): tukio linahifadhiwa moja kwa moja Appwrite (items)
//     + meters — ili hakuna kitu kinachopotea; Endeleja inareplay baadaye kutoka events.jsonl.
// Kimya kimya: kosa la hapa halivurugi run — events.jsonl ya sandbox ndiyo source of truth.
import { findRunner } from "@/lib/boardRunner";
import { handleCuEvent, ensureCuState, noteProviderUsage, type CuEvent } from "@/lib/cu/engine";
import { appwriteConfigured } from "@/lib/server/appwrite";
import { getConversation, updateSessionItems } from "@/lib/reports";
import { readUsageChip, isHiddenChip } from "@/lib/usageChip";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  if (!body || typeof body.i !== "number" || typeof body.type !== "string") {
    return Response.json({ ok: false, error: "bad shape" }, { status: 400 });
  }

  // shots hazipitishwi mara mbili: data kubwa inatupwa kama tayari tumeshapokea
  const runner = findRunner(String(body.session || ""));
  const auth = req.headers.get("authorization") || "";

  if (runner && runner.cu) {
    if (auth !== `Bearer ${runner.cu.token}`) {
      return Response.json({ ok: false, error: "token" }, { status: 401 });
    }
    handleCuEvent(runner, runner.cuHooks || null, body as CuEvent);
    return Response.json({ ok: true });
  }

  if (runner && !runner.cu && runner.computerPlanned) {
    // phase bado haijaanza rasmi (run() bado finale) — tokens za run token hazipo; hifadhi orphan
    return Response.json(await orphanPersist(body));
  }

  // hakuna runner kabisa — Koyeb ilipotea. Hifadhi direct (usiache potea).
  return Response.json(await orphanPersist(body));
}

/** Hifadhi tukio moja kwa moja kwenye session doc (bila runner) — meters pia. */
async function orphanPersist(ev: CuEvent): Promise<{ ok: boolean; orphan: boolean }> {
  try {
    noteProviderUsage(ev, Boolean(ev.ok));
  } catch { /* meters si kizuizi */ }
  if (!appwriteConfigured || !ev.session) return { ok: false, orphan: true };
  try {
    const sid = String(ev.session);
    const saved = await getConversation(sid);
    if (!saved) return { ok: false, orphan: true };
    const items = (saved.items || []).filter((it: any) => !isHiddenChip(it));
    // tukio la shot lenye data halipatikani bila bucket hapa (runner ndiye anapakia) — ruuka data
    const clean: any = { ...ev, data: undefined };
    items.push({ kind: "cu", id: `cu_${ev.type}_${ev.i}`, i: ev.i, ...shapeItem(ev) } as any);
    await updateSessionItems(sid, items, saved.status || "running", undefined);
    return { ok: true, orphan: true };
  } catch {
    return { ok: false, orphan: true };
  }
}

/** Tukio la bridge → item ya session (muundo uleule wa engine.handleCuEvent — kwa resume ya Koyeb). */
function shapeItem(ev: CuEvent): Record<string, unknown> {
  const base: Record<string, unknown> = { cu: String(ev.type) };
  for (const k of ["step", "execId", "tool", "kindX", "command", "path", "preview", "lines", "exit", "ms", "chars", "summary", "output", "text", "label", "url", "message", "status", "tokens", "requests", "model", "task", "partial", "lane", "provider", "account", "total", "ok"]) {
    if (ev[k] !== undefined) base[k] = ev[k];
  }
  return base;
}
