// src/lib/cu/mirror.ts — R44-A: KIOVU CHA FAILI (agizo la Mkuu):
// kila faili anayoandika/sahihisha agent (write/edit) inaingia Supabase `cu_files` MARA MOJA.
// node_modules/deps za install ZINARUKIWA. Kifo cha sandbox hakipotezi kazi ya mikono ya agent.
// Restore: faili zote za session zinaandikwa kwenye sandbox mpya kabla bridge haijaanza.
import { supabase } from "@/lib/server/supabase";

/** paths zisizohifadhiwa (installs/jenga — si kazi ya mikono ya agent) */
const SKIP = [
  /^node_modules\//, /^\.git\//, /^dist\//, /^build\//, /^\.cache\//, /^\.next\//,
  /^coverage\//, /^playwright-report\//, /^\.turbo\//, /^target\//,
  /package-lock\.json$/, /pnpm-lock\.yaml$/, /yarn\.lock$/, /bun\.lockb?$/,
];

/** "/home/user/ws/src/a.ts" → "src/a.ts" · nje ya ws / hatari → null */
export function mirrorPathOf(p: unknown): string | null {
  if (typeof p !== "string" || !p) return null;
  let rel: string;
  if (p.startsWith("/home/user/ws/")) rel = p.slice("/home/user/ws/".length);
  else if (p.startsWith("/home/user/")) return null; // faili za engine (brain/bridge/config) — si za agent
  else if (p.startsWith("/")) return null;
  else rel = p;
  if (!rel || rel.split("/").includes("..")) return null; // traversal haiyoruhusiwi
  if (SKIP.some((r) => r.test(rel))) return null;
  return rel;
}

/**
 * Event moja ya exec_start (write/edit) → row ya kiovu.
 * - Write kamili: preview/content imejaa → badilisha yote.
 * - Edit (old_str/new_str): apply kwenye yaliyopo — hakikisha old_str ipo (siyo infera).
 * Pure — inapokea Map (hali ya session) na kurudisha row au null.
 */
export function applyMirrorEvent(map: Map<string, string>, ev: any): { path: string; content: string } | null {
  if (!ev || ev.type !== "exec_start") return null;
  const rel = mirrorPathOf(ev.path);
  if (!rel) return null;
  const oldStr = typeof ev.old_str === "string" && ev.old_str.length > 0 ? ev.old_str : null;
  const hasNew = typeof ev.new_str === "string";
  const full = typeof ev.preview === "string" && ev.preview.length ? ev.preview : typeof ev.content === "string" && ev.content.length ? ev.content : null;
  if (oldStr !== null && hasNew) {
    const cur = map.get(rel);
    if (cur == null || !cur.includes(oldStr)) return null; // hatujui msingi — tar ya dakika 10 itafunika
    const next = cur.replace(oldStr, ev.new_str as string);
    map.set(rel, next);
    return { path: rel, content: next };
  }
  if (full) {
    map.set(rel, full);
    return { path: rel, content: full };
  }
  return null;
}

/** Upersist row moja kwenye cu_files (fire-and-forget — kamwe isivunje mtiririko wa events). */
export async function persistMirrorRow(sessionId: string, path: string, content: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("cu_files")
      .upsert({ session_id: sessionId, path, content, bytes: content.length }, { onConflict: "session_id,path" });
    if (error) throw error;
    return true;
  } catch (e) {
    console.warn(`[mirror] upsert ${sessionId.slice(0, 8)}/${path}: ${String(e).slice(0, 100)}`);
    return false;
  }
}

/** Hook ya engine: event + map → upsert. Inaitwa kutoka handleCuEvent. */
export function mirrorEvent(sessionId: string, map: Map<string, string>, ev: any): void {
  const row = applyMirrorEvent(map, ev);
  if (!row) return;
  void persistMirrorRow(sessionId, row.path, row.content);
}

/** Restore: andika faili ZOTE za session ndani ya sandbox mpya. Inarudisha idadi. */
export async function restoreFromMirror(sessionId: string, sbx: any): Promise<number> {
  let rows: any[] = [];
  try {
    const { data, error } = await supabase.from("cu_files").select("path,content").eq("session_id", sessionId).order("path");
    if (error) throw error;
    rows = data || [];
  } catch (e) {
    console.warn(`[mirror] read ${sessionId.slice(0, 8)}: ${String(e).slice(0, 100)}`);
    return 0;
  }
  let n = 0;
  for (const r of rows) {
    if (typeof r?.path !== "string" || typeof r?.content !== "string") continue;
    try {
      await sbx.files.write(`/home/user/ws/${r.path}`, r.content);
      n += 1;
    } catch { /* faili moja isivunje zote */ }
  }
  return n;
}

/** R44-C: sandbox ipumzi? Ping ya haraka (echo) — maiti isirudishwe tena na getSandbox. */
/** TASK-32 (E2E halisi): mpango wa E2B una kikomo cha session cha SAA 1 — `setTimeout` haikivuki; sandbox
 *  (lifecycle onTimeout:"pause") INAPAUZWA, si kufa. Ping ikishindwa: connect (= resume ya iliyopauzwa, memory
 *  na bridge vinaendelea) kisha ping tena. Run 5: M2/M3 zilikufa baada ya dk 62.8 kila moja kwa sababu hii. */
export async function resumeIfPaused(
  sbx: any,
  connect: (id: string) => Promise<unknown> = async (id) => {
    const { Sandbox } = await import("@e2b/code-interpreter");
    return Sandbox.connect(id, { apiKey: process.env.E2B_API_KEY!, timeoutMs: 60 * 60_000 } as any);
  },
): Promise<boolean> {
  const id = sbx?.sandboxId;
  if (!id) return false;
  try {
    await Promise.race([
      connect(id),
      new Promise((_, rej) => setTimeout(() => rej(new Error("E2B connect timeout (25s)")), 25_000).unref?.()),
    ]);
  } catch {
    return false;
  }
  return sandboxAlive(sbx);
}

/** TASK-32 (E2E run 6, M2 R5): ping ya `echo 1` (9s) ilishindwa mara 2 sandbox ikiwa na mzigo (next build + evidence, RAM ya
 *  server 80%+) → "sandbox imekufa" ya UONGO (sandbox ilikuwa hai, M3 iliitumia baadaye). Kabla ya hukumu ya kifo: uliza
 *  E2B API — `state: "running"` = hai (ina shughuli tu); liveness (CU_LIVENESS_MS) bado inalinda ikikwama kweli. */
export async function e2bSaysRunning(
  sbx: any,
  getInfo: (id: string) => Promise<{ state?: string }> = async (id) => {
    const { Sandbox } = await import("@e2b/code-interpreter");
    return Sandbox.getInfo(id, { apiKey: process.env.E2B_API_KEY! } as any) as Promise<{ state?: string }>;
  },
): Promise<boolean> {
  const id = sbx?.sandboxId;
  if (!id) return false;
  try {
    const info = await Promise.race([
      getInfo(id),
      new Promise<never>((_, rej) => setTimeout(() => rej(new Error("E2B getInfo timeout (20s)")), 20_000).unref?.()),
    ]);
    return info?.state === "running";
  } catch {
    return false;
  }
}

export async function sandboxAlive(sbx: any): Promise<boolean> {
  if (!sbx) return false;
  try {
    await Promise.race([
      sbx.commands.run("echo 1", { timeoutMs: 8_000 }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("ping timeout")), 9_000).unref?.()),
    ]);
    return true;
  } catch {
    return false;
  }
}

/** Map ya session (kwenye cu object — globalThis haipaswi kujaa). */
export function mirrorMapOf(cu: any): Map<string, string> {
  if (!cu) return new Map();
  cu.mirror ??= new Map<string, string>();
  return cu.mirror as Map<string, string>;
}
