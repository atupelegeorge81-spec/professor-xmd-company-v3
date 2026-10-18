// TASK 22 (maelezo22) — Baselines + regression (pixel diff). CODE inapima; LLM haiamui.
//  · saveBaselines (sign-off — task 28 itaiita): screenshots zilizoidhinishwa → `.xmd/baselines/<Mk>/<route>-<viewport>-<state>.png`
//    + manifest.json ndani ya sandbox, na kila PNG + manifest → storage (URL; workspace ikipotea baseline inarudishwa kutoka storage).
//  · checkRegression (kila raundi): kila route/viewport/state yenye baseline → changedPct (pixelmatch ndani ya sandbox,
//    cu/xmd-regression.mjs). > REGRESSION_THRESHOLD_PCT (default 2) → EvidencePack.regression[] + link ya diff PNG.
//    Route iliyoguswa na Change Order ya raundi hii (location.route) → "expected_change", si regression.
import type { EvidenceSandbox, EvidenceUploader } from "@/lib/cu/evidence";
import { shq, sbxShell } from "./checks";
import { EVIDENCE_TOOLS_DIR, evidenceDir } from "./evidence";
import type { ChangeOrder, EvidencePack, EvidenceScreenshot, RegressionEntry } from "./types";

export const REGRESSION_SCRIPT = `${EVIDENCE_TOOLS_DIR}/xmd-regression.mjs`;
export const BASELINES_DIR = ".xmd/baselines";
export const DEFAULT_REGRESSION_THRESHOLD_PCT = 2;
/** unyeti wa pixelmatch kwa kila pixel (default ya pixelmatch) — tofauti na threshold ya % */
export const PIXEL_THRESHOLD = 0.1;

export const baselineDir = (milestoneId: string) => `${BASELINES_DIR}/${milestoneId}`;
export const regressionDir = (milestoneId: string, round: number) => `${evidenceDir(milestoneId, round)}/regression`;
export const regressionConfigPath = (milestoneId: string, round: number, mode: "save" | "diff") => `${EVIDENCE_TOOLS_DIR}/regression-${mode}-${milestoneId}-R${round}.json`;

// ── majina (sawa na cu/xmd-regression.mjs) ───────────────────────────────────
export const normRoute = (r: string | undefined): string => {
  let s = String(r || "/").trim().replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
};
export const routeSlug = (r: string) => (normRoute(r) === "/" ? "root" : normRoute(r).slice(1).replace(/[^A-Za-z0-9.]+/g, "_").replace(/^_+|_+$/g, "") || "root");
export const stateSlug = (s: string | undefined) => String(s || "default").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "default";
export const baselineKey = (route: string, viewport: string, state?: string) => `${normRoute(route)}|${viewport}|${state || "default"}`;
/** maelezo22: `<route>-<viewport>-<state>.png` ("/" → root) */
export const baselineFileName = (route: string, viewport: string, state?: string) => `${routeSlug(route)}-${viewport}-${stateSlug(state)}.png`;

/** REGRESSION_THRESHOLD_PCT (env) → % (0..100); thamani mbaya → default 2. */
export function regressionThresholdPct(env: Record<string, string | undefined> = process.env): number {
  const raw = env.REGRESSION_THRESHOLD_PCT;
  const n = raw === undefined || String(raw).trim() === "" ? NaN : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : DEFAULT_REGRESSION_THRESHOLD_PCT;
}

export interface BaselineEntry {
  key: string;
  route: string;
  viewport: string;
  state: string;
  /** path ndani ya workspace (`.xmd/baselines/M1/root-375x667-default.png`) */
  file: string;
  sourceId: string;
  sourcePath: string;
  width: number;
  height: number;
  bytes: number;
  url: string;
}
export interface BaselineManifest {
  milestoneId: string;
  round: number;
  savedAt: string;
  entries: BaselineEntry[];
  manifestUrl?: string;
}
/** Safu moja ya cu/xmd-regression.mjs (mode diff). */
export interface RegressionDiffRow {
  key: string;
  route: string;
  viewport: string;
  state: string;
  baselineMilestone: string;
  baselinePath: string;
  baselineUrl: string;
  currentId: string;
  currentPath: string;
  currentUrl: string;
  changedPct: number;
  changedPixels: number | null;
  totalPixels: number;
  diffPath: string;
  note?: string;
  restored?: boolean;
}
export interface RegressionScriptOutput {
  results: RegressionDiffRow[];
  notCaptured: string[];
  errors: string[];
  deps: { installed: boolean; ms: number; skipped: boolean };
  manifests: number;
  ms: number;
}

/** Routes zilizoguswa na Change Orders za raundi hii → ids zake. */
export function changedRoutes(changeOrders: Pick<ChangeOrder, "id" | "location">[] | undefined): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const co of changeOrders || []) {
    const r = co?.location?.route;
    if (!r) continue;
    const k = normRoute(r);
    m.set(k, [...(m.get(k) || []), String(co.id || "CO-?")]);
  }
  return m;
}

/** Safu > threshold → RegressionEntry (regression au expected_change). Pure — majaribio ya unit. */
export function classifyRegression(rows: RegressionDiffRow[], opts: { thresholdPct: number; changeOrders?: Pick<ChangeOrder, "id" | "location">[] }): RegressionEntry[] {
  const touched = changedRoutes(opts.changeOrders);
  const out: RegressionEntry[] = [];
  for (const r of rows) {
    if (!(r.changedPct > opts.thresholdPct)) continue;
    const cos = touched.get(normRoute(r.route));
    out.push({
      kind: cos ? "expected_change" : "regression",
      route: normRoute(r.route), viewport: r.viewport, state: r.state || "default",
      changedPct: r.changedPct, thresholdPct: opts.thresholdPct,
      baselineMilestone: r.baselineMilestone || "", baselineUrl: r.baselineUrl || "", currentUrl: r.currentUrl || "",
      diffUrl: "", diffPath: r.diffPath || "",
      ...(r.note ? { note: r.note } : {}),
      ...(cos ? { changeOrderIds: cos } : {}),
    });
  }
  // regressions kwanza, kisha kubwa zaidi
  return out.sort((a, b) => (a.kind === b.kind ? b.changedPct - a.changedPct : a.kind === "regression" ? -1 : 1));
}

async function runScript(sbx: EvidenceSandbox, ws: string, script: string, cfgRel: string, cfg: object): Promise<{ exit: number; out: string }> {
  await sbx.commands.run(`mkdir -p ${shq(`${ws}/${EVIDENCE_TOOLS_DIR}`)}`, { timeoutMs: 30_000 });
  await sbx.files.write(`${ws}/${REGRESSION_SCRIPT}`, script);
  await sbx.files.write(`${ws}/${cfgRel}`, JSON.stringify(cfg, null, 2));
  return sbxShell({ sbx, ws }, `node ${REGRESSION_SCRIPT} --config ${cfgRel}`, 6 * 60_000);
}

const sid8 = (s?: string) => String(s || "nosession").replace(/[^A-Za-z0-9]/g, "").slice(0, 8) || "nosessio";

export interface SaveBaselinesInput {
  milestoneId: string;
  /** raundi iliyoidhinishwa */
  round: number;
  /** EvidencePack ya raundi iliyoidhinishwa (screenshots + paths ndani ya sandbox) */
  pack: Pick<EvidencePack, "screenshots">;
  /** maandishi ya cu/xmd-regression.mjs */
  script: string;
  ws?: string;
  sessionId?: string;
}
export interface SaveBaselinesResult {
  manifest: BaselineManifest | null;
  uploaded: number;
  errors: string[];
  ms: number;
}

/** maelezo22 #1 — kwenye SIGN-OFF: screenshots zilizoidhinishwa → baselines (sandbox + storage). */
export async function saveBaselines(sbx: EvidenceSandbox, input: SaveBaselinesInput, upload: EvidenceUploader): Promise<SaveBaselinesResult> {
  const t0 = Date.now();
  const ws = input.ws || "/home/user/ws";
  const mk = input.milestoneId;
  const errors: string[] = [];
  const shots = (input.pack?.screenshots || []).filter((s) => s && s.path);
  if (!shots.length) return { manifest: null, uploaded: 0, errors: ["no approved screenshots to save as baselines"], ms: Date.now() - t0 };
  const dir = baselineDir(mk);
  let manifest: BaselineManifest | null = null;
  try {
    const cfg = { mode: "save", milestoneId: mk, round: input.round, cwd: ws, outDir: dir, screenshots: shots.map(({ id, route, viewport, state, path }) => ({ id, route, viewport, state, path })) };
    const r = await runScript(sbx, ws, input.script, regressionConfigPath(mk, input.round, "save"), cfg);
    const raw = await sbx.files.read(`${ws}/${dir}/manifest.json`).catch(() => "");
    if (!raw) return { manifest: null, uploaded: 0, errors: [`baseline manifest was not written (exit ${r.exit}): ${r.out.slice(-300)}`], ms: Date.now() - t0 };
    manifest = JSON.parse(String(raw)) as BaselineManifest;
    const sr = await sbx.files.read(`${ws}/${dir}/save-result.json`).catch(() => "");
    if (sr) errors.push(...((JSON.parse(String(sr)).errors || []) as string[]));
  } catch (e: any) {
    return { manifest: null, uploaded: 0, errors: [`baseline save failed: ${String(e?.message || e).slice(0, 300)}`], ms: Date.now() - t0 };
  }
  let uploaded = 0;
  for (const b of manifest.entries) {
    try {
      const bytes = await sbx.files.read(`${ws}/${b.file}`, { format: "bytes" });
      b.url = await upload(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), `xmd-bl-${sid8(input.sessionId)}-${mk}-${b.file.split("/").pop()}`);
      uploaded++;
    } catch (e: any) {
      errors.push(`upload ${b.file}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  try {
    const json = JSON.stringify(manifest, null, 2);
    manifest.manifestUrl = await upload(new TextEncoder().encode(json), `xmd-bl-${sid8(input.sessionId)}-${mk}-manifest.json`);
    uploaded++;
  } catch (e: any) {
    errors.push(`upload manifest: ${String(e?.message || e).slice(0, 200)}`);
  }
  // manifest yenye URLs → sandbox (raundi zijazo zinaweza kurudisha PNG kutoka storage)
  await sbx.files.write(`${ws}/${dir}/manifest.json`, JSON.stringify(manifest, null, 2)).catch((e: any) => errors.push(`manifest rewrite: ${String(e?.message || e).slice(0, 160)}`));
  return { manifest, uploaded, errors, ms: Date.now() - t0 };
}

export interface CheckRegressionInput {
  milestoneId: string;
  round: number;
  /** EvidencePack ya raundi hii — `regression` inajazwa hapa */
  pack: EvidencePack;
  /** Change Orders za raundi hii (location.route → expected change) */
  changeOrders?: Pick<ChangeOrder, "id" | "location">[];
  script: string;
  ws?: string;
  sessionId?: string;
  /** default: regressionThresholdPct(process.env) */
  thresholdPct?: number;
}
export interface CheckRegressionResult {
  entries: RegressionEntry[];
  /** jozi zote zilizolinganishwa (hata chini ya threshold) */
  rows: RegressionDiffRow[];
  notCaptured: string[];
  errors: string[];
  thresholdPct: number;
  depsInstalled: boolean;
  uploaded: number;
  ms: number;
}

/** maelezo22 #3–4 — kila raundi: linganisha na baselines, jaza pack.regression (regression / expected_change). */
export async function checkRegression(sbx: EvidenceSandbox, input: CheckRegressionInput, upload: EvidenceUploader): Promise<CheckRegressionResult> {
  const t0 = Date.now();
  const ws = input.ws || "/home/user/ws";
  const { milestoneId: mk, round, pack } = input;
  const thresholdPct = input.thresholdPct ?? regressionThresholdPct();
  const outRel = regressionDir(mk, round);
  const base: CheckRegressionResult = { entries: [], rows: [], notCaptured: [], errors: [], thresholdPct, depsInstalled: false, uploaded: 0, ms: 0 };
  const current: EvidenceScreenshot[] = (pack.screenshots || []).filter((s) => s && s.path);
  let out: RegressionScriptOutput;
  try {
    const cfg = { mode: "diff", milestoneId: mk, round, cwd: ws, baselinesDir: BASELINES_DIR, outDir: outRel, threshold: PIXEL_THRESHOLD, current };
    const r = await runScript(sbx, ws, input.script, regressionConfigPath(mk, round, "diff"), cfg);
    const raw = await sbx.files.read(`${ws}/${outRel}/regression.json`).catch(() => "");
    if (!raw) throw new Error(`regression.json was not written (exit ${r.exit}): ${r.out.slice(-300)}`);
    out = JSON.parse(String(raw)) as RegressionScriptOutput;
  } catch (e: any) {
    const msg = `regression: ${String(e?.message || e).slice(0, 300)}`;
    pack.errors = [...(pack.errors || []), { kind: "harness", detail: msg }];
    return { ...base, errors: [msg], ms: Date.now() - t0 };
  }
  const entries = classifyRegression(out.results || [], { thresholdPct, changeOrders: input.changeOrders });
  const errors = (out.errors || []).map((x) => `regression: ${x}`);
  let uploaded = 0;
  for (const en of entries) {
    if (!en.diffPath) continue; // vipimo tofauti → hakuna diff (note inaeleza)
    try {
      const bytes = await sbx.files.read(`${ws}/${en.diffPath}`, { format: "bytes" });
      en.diffUrl = await upload(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes), `xmd-rg-${sid8(input.sessionId)}-${mk}-R${round}-${en.diffPath.split("/").pop()}`);
      uploaded++;
    } catch (e: any) {
      errors.push(`regression: upload ${en.diffPath}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  pack.regression = entries;
  if (errors.length) pack.errors = [...(pack.errors || []), ...errors.map((detail) => ({ kind: "harness" as const, detail }))];
  return { entries, rows: out.results || [], notCaptured: out.notCaptured || [], errors, thresholdPct, depsInstalled: !!out.deps?.installed, uploaded, ms: Date.now() - t0 };
}

/** Mstari mmoja wa log (kwa blog ya harness). */
export function regressionSummary(r: CheckRegressionResult): string {
  const reg = r.entries.filter((e) => e.kind === "regression");
  const exp = r.entries.filter((e) => e.kind === "expected_change");
  return `compared ${r.rows.length} · regressions ${reg.length}${reg.length ? ` (${reg.slice(0, 3).map((e) => `${e.route}@${e.viewport} ${e.changedPct}%`).join(", ")})` : ""} · expected ${exp.length} · threshold ${r.thresholdPct}% · errors ${r.errors.length}`;
}
