// TASK 19 (maelezo19) — harness ya ushahidi: inapakia cu/xmd-evidence.mjs kwenye `.xmd/tools/` ya sandbox,
// inaiendesha (sbx.commands.run), inasoma manifest, inapakia kila PNG kwenye storage (bucket ya CU files — FLOW-MAP D)
// na kujaza `url`. Picha HAZIBAKI kama base64 kwenye context ya LLM — manifest ina paths + URLs tu.
import {
  EVIDENCE_SCRIPT, evidenceConfigPath, evidenceDir, evidenceRunConfig, planEvidenceSpec,
} from "@/lib/milestone/evidence";
import { validateEvidencePack } from "@/lib/milestone/schemas";
import type { EvidenceError, EvidencePack } from "@/lib/milestone/types";

/** Sehemu ya Sandbox ya E2B tunayoitumia (rahisi kuiga kwenye vitest). */
export interface EvidenceSandbox {
  files: { write(path: string, data: string | ArrayBuffer | Uint8Array): Promise<unknown>; read(path: string, opts?: { format?: "text" | "bytes" }): Promise<any> };
  commands: { run(cmd: string, opts?: { timeoutMs?: number }): Promise<{ stdout?: string; stderr?: string; exitCode?: number }> };
}
/** Inapakia bytes → inarudisha URL ya umma. */
export type EvidenceUploader = (bytes: Uint8Array, name: string) => Promise<string>;

export interface CaptureEvidenceInput {
  milestoneId: string;
  round: number;
  planMarkdown: string;
  /** maandishi ya cu/xmd-evidence.mjs (engine inayasoma kwa readCuFile) */
  script: string;
  sessionId?: string;
  /** deployed mode: URL ya site hai badala ya kuanzisha app */
  base?: string;
  ws?: string;
  startTimeoutMs?: number;
}
export interface CaptureEvidenceResult {
  pack: EvidencePack;
  /** exit ya script: 0 safi · 1 kuna errors · 2 crash · -1 haikuendeshwa/haijulikani */
  exit: number;
  /** makosa ya validateEvidencePack (requireUrls) — tupu = manifest sahihi */
  invalid: string[];
  /** PNG + dom.json zilizopakiwa */
  uploaded: number;
  ms: number;
}

const EXIT_TAG = "__XMD_EVIDENCE_EXIT=";

function emptyPack(milestoneId: string, round: number, base: string | undefined, errors: EvidenceError[]): EvidencePack {
  return {
    milestoneId, round, screenshots: [], domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [],
    consoleErrors: [], errors, ...(base ? { base, mode: "deployed" as const } : {}),
  };
}

export async function captureEvidence(sbx: EvidenceSandbox, input: CaptureEvidenceInput, upload: EvidenceUploader): Promise<CaptureEvidenceResult> {
  const t0 = Date.now();
  const ws = input.ws || "/home/user/ws";
  const { milestoneId: mk, round } = input;
  const spec = planEvidenceSpec(input.planMarkdown);
  const cfg = evidenceRunConfig(spec, mk, round, { cwd: ws, base: input.base, startTimeoutMs: input.startTimeoutMs });
  const cfgRel = evidenceConfigPath(mk, round);
  const outRel = evidenceDir(mk, round);
  let exit = -1;
  let pack: EvidencePack;
  try {
    await sbx.commands.run(`mkdir -p ${ws}/.xmd/tools && rm -rf ${ws}/${outRel}`, { timeoutMs: 30_000 });
    await sbx.files.write(`${ws}/${EVIDENCE_SCRIPT}`, input.script);
    await sbx.files.write(`${ws}/${cfgRel}`, JSON.stringify(cfg, null, 2));
    const r = await sbx.commands.run(
      `cd ${ws} && node ${EVIDENCE_SCRIPT} --config ${cfgRel}${input.base ? ` --base '${input.base.replace(/'/g, "")}'` : ""} 2>&1 | tail -c 4000; echo "${EXIT_TAG}\${PIPESTATUS[0]}"`,
      { timeoutMs: 15 * 60_000 },
    );
    const m = new RegExp(`${EXIT_TAG}(-?\\d+)`).exec(String(r?.stdout || ""));
    exit = m ? Number(m[1]) : -1;
    const raw = await sbx.files.read(`${ws}/${outRel}/manifest.json`).catch(() => "");
    pack = raw ? (JSON.parse(String(raw)) as EvidencePack) : emptyPack(mk, round, input.base, [{ kind: "harness", detail: `manifest.json was not written (exit ${exit}): ${String(r?.stdout || "").slice(-400)}` }]);
  } catch (e: any) {
    pack = emptyPack(mk, round, input.base, [{ kind: "harness", detail: `evidence runner failed: ${String(e?.message || e).slice(0, 300)}` }]);
  }
  if (!Array.isArray(pack.errors)) pack.errors = [];
  for (const p of spec.problems) pack.errors.push({ kind: "harness", detail: `plan screenshots: ${p}` });
  if (!spec.routes.length && !input.base) pack.errors.push({ kind: "harness", detail: "the plan has no Screenshots route lines" });

  // PNG → storage (URL) — mfululizo (picha chache; hakuna mzigo wa RAM)
  let uploaded = 0;
  const sid8 = String(input.sessionId || "xmd").slice(0, 8);
  for (const s of pack.screenshots || []) {
    try {
      const bytes: any = await sbx.files.read(`${ws}/${s.path}`, { format: "bytes" });
      const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
      if (!u8.length) throw new Error("empty PNG");
      s.url = await upload(u8, `xmd-ev-${sid8}-${mk}-R${round}-${s.id}.png`);
      uploaded++;
    } catch (e: any) {
      pack.errors.push({ kind: "upload", detail: `${s.id} (${s.path}): ${String(e?.message || e).slice(0, 200)}` });
    }
  }
  // TASK-20: S-nnn.dom.json → storage (reviewers wanasoma namba hata sandbox ikifa)
  if (!Array.isArray(pack.domMetrics)) pack.domMetrics = [];
  for (const d of pack.domMetrics) {
    try {
      const raw: any = await sbx.files.read(`${ws}/${d.path}`, { format: "bytes" });
      const u8 = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
      if (!u8.length) throw new Error("empty dom.json");
      d.url = await upload(u8, `xmd-ev-${sid8}-${mk}-R${round}-${d.screenshotId}.dom.json`);
      uploaded++;
    } catch (e: any) {
      pack.errors.push({ kind: "upload", detail: `${d.screenshotId} dom (${d.path}): ${String(e?.message || e).slice(0, 200)}` });
    }
  }
  const v = validateEvidencePack(pack, { requireUrls: true });
  return { pack, exit, invalid: v.ok ? [] : v.errors, uploaded, ms: Date.now() - t0 };
}

/** Muhtasari mfupi (chip/log). */
export function evidenceSummary(r: CaptureEvidenceResult): string {
  const p = r.pack;
  return `${p.screenshots.length} screenshots · dom ${(p.domMetrics || []).length} · uploaded ${r.uploaded} · errors ${p.errors.length} · console ${p.consoleErrors.length}${r.invalid.length ? ` · manifest invalid ${r.invalid.length}` : ""}`;
}
