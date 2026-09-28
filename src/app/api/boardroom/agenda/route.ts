import { getRunner } from "@/lib/boardRunner";
import { getConversation } from "@/lib/reports";
import { RESUME_PREFIX } from "@/lib/usageChip";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Agenda kamili (owners + requiresCode) ya runner hai, au ya session iliyohifadhiwa. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id") || "";
  if (!id) return Response.json({ agenda: [] });
  const live = getRunner(id);
  if (live?.agenda?.length) return Response.json({ agenda: live.agenda, runnerId: live.id, sessionId: live.sessionId || null });
  const saved = await getConversation(id);
  const chip = [...(saved?.items || [])].reverse().find((it: any) => it?.kind === "chip" && String(it?.text || "").startsWith(RESUME_PREFIX));
  if (!chip) return Response.json({ agenda: [] });
  try {
    const state = JSON.parse(String(chip.text).slice(RESUME_PREFIX.length));
    return Response.json({ agenda: state.agenda || [], runnerId: state.runnerId || null, sessionId: id });
  } catch {
    return Response.json({ agenda: [] });
  }
}
