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
    await handleCuEvent(runner, runner.cuHooks || null, body as CuEvent);
    return Response.json({ ok: true });
  }

  if (runner && !runner.cu && runner.computerPlanned) {
    // phase bado haijaanza rasmi (run() bado finale) — tokens za run token hazipo; hifadhi orphan
    return Response.json(await orphanPersist(body));
  }

  // hakuna runner kabisa — Koyeb ilipotea. Hifadhi direct (usiache potea).
  return Response.json(await orphanPersist(body));
}

/** Events za kupersist bila runner — muhimu tu (think/text/usage ni nyingi mno;
 *  shots hazina fileId bila runner; snapshot (base64 ~MB nyingi) haipiti hapa —
 *  data yake ipo POST pekee; yote yako events.jsonl kwa replay ya Endeleza). */
const ORPHAN_KEEP = new Set(["run_start", "exec", "github", "deploy", "finish", "error", "run_end", "files"]);

/** Hifadhi tukio moja kwa moja kwenye session doc (bila runner) — meters pia. */
async function orphanPersist(ev: CuEvent): Promise<{ ok: boolean; orphan: boolean }> {
  try {
    noteProviderUsage(ev, Boolean(ev.ok));
  } catch { /* meters si kizuizi */ }
  if (!appwriteConfigured || !ev.session) return { ok: false, orphan: true };
  if (!ORPHAN_KEEP.has(String(ev.type)) || String(ev.type) === "snapshot") {
    return { ok: true, orphan: true }; // meters tu — kimya (snapshot: base64 haipaswi kuingia doc)
  }
  try {
    const sid = String(ev.session);
    const saved = await getConversation(sid);
    if (!saved) return { ok: false, orphan: true };
    const items = (saved.items || []).filter((it: any) => !isHiddenChip(it));
    if (String(ev.type) === "files") {
      // R31-G4: files → item MOJA "cu_files_tree" inayosasishwa (kosa la G: append ya kila bucket
      // iliwahi kubakiza snapshot ya kwanza tupu kwenye session ndogo)
      const idx = items.findIndex((it: any) => it?.id === "cu_files_tree");
      if (idx >= 0) items[idx] = { ...items[idx], i: ev.i, ...shapeItem(ev) };
      else items.push({ kind: "cu", id: "cu_files_tree", i: ev.i, ...shapeItem(ev) } as any);
    } else {
      // dedupe rahisi (orphan hauna seen-set): tukio lilelile halirudiwi
      const key = `cu_${ev.type}_${ev.i}`;
      if (items.some((it: any) => it?.id === key)) return { ok: true, orphan: true };
      items.push({ kind: "cu", id: key, i: ev.i, ...shapeItem(ev) } as any);
    }
    await updateSessionItems(sid, items, saved.status || "running", undefined);
    return { ok: true, orphan: true };
  } catch {
    return { ok: false, orphan: true };
  }
}

/** Tukio la bridge → item ya session (muundo uleule wa engine.handleCuEvent — kwa resume ya Koyeb). */
function shapeItem(ev: CuEvent): Record<string, unknown> {
  const base: Record<string, unknown> = { cu: String(ev.type) };
  for (const k of ["step", "execId", "tool", "kindX", "command", "path", "preview", "lines", "exit", "ms", "chars", "summary", "output", "text", "label", "url", "message", "status", "tokens", "requests", "model", "task", "partial", "lane", "provider", "account", "total", "ok", "tree", "filesCount", "resume_at", "steps", "fatal"]) {
    if (ev[k] !== undefined) base[k] = ev[k];
  }
  return base;
}
