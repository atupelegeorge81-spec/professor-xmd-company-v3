#!/usr/bin/env node
// cu/xmd-regression.mjs — TASK 22 (maelezo22): baselines + regression (pixel diff) ya HARNESS (code, si agent).
// Inaendeshwa NDANI ya sandbox (harness inaipakia .xmd/tools/ kama xmd-evidence.mjs):
//   node .xmd/tools/xmd-regression.mjs --config .xmd/tools/regression-M2-R1.json
//   node .xmd/tools/xmd-regression.mjs diff <baseline.png> <current.png> [diff.png] [--threshold 0.1]
// config mode "save": { milestoneId, round, cwd, outDir: ".xmd/baselines/M1", screenshots: [{id,route,viewport,state,path,url}] }
//   → nakala za PNG zilizoidhinishwa: <outDir>/<route>-<viewport>-<state>.png + <outDir>/manifest.json (url hujazwa na harness)
// config mode "diff": { milestoneId, round, cwd, baselinesDir: ".xmd/baselines", outDir, threshold, current: [screenshots] }
//   → kila route/viewport/state yenye baseline (ya karibuni kabisa kati ya milestones) inalinganishwa na screenshot ya sasa;
//     <outDir>/regression.json { results, notCaptured, errors, deps, ms }. Uainishaji (threshold %, Change Orders) = harness.
// pixelmatch + pngjs: zinawekwa kwenye .xmd/tools/node_modules IKIWA HAZIPO TU (repo ya mradi haiguswi).
// Anti-aliasing inarukwa (default ya pixelmatch). Vipimo tofauti → changedPct 100 + note.
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

export const DEPS = { pixelmatch: "7.2.0", pngjs: "7.0.0" };
export const DEFAULT_PIXEL_THRESHOLD = 0.1;
const TOOLS_DIR = path.dirname(fileURLToPath(import.meta.url));

/** Inahakikisha pixelmatch + pngjs zipo (zinasakinishwa kwenye folda ya script ikiwa hazipo). */
export async function ensureDeps(dir = TOOLS_DIR) {
  const has = (n) => fs.existsSync(path.join(dir, "node_modules", n, "package.json"));
  let installed = false;
  const t0 = Date.now();
  if (!has("pixelmatch") || !has("pngjs")) {
    // package.json ya folda ya tools → npm haipandi juu kwenye package.json ya mradi
    const pj = path.join(dir, "package.json");
    if (!fs.existsSync(pj)) fs.writeFileSync(pj, JSON.stringify({ name: "xmd-tools", private: true }, null, 2));
    const specs = Object.entries(DEPS).map(([n, v]) => `${n}@${v}`).join(" ");
    execSync(`npm install --no-save --no-audit --no-fund --no-package-lock --loglevel=error --prefix "${dir}" ${specs}`, { stdio: "pipe", timeout: 180_000 });
    installed = true;
  }
  const pm = await import(pathToFileURL(path.join(dir, "node_modules", "pixelmatch", "index.js")).href);
  const pn = await import(pathToFileURL(path.join(dir, "node_modules", "pngjs", "lib", "png.js")).href);
  return { pixelmatch: pm.default || pm, PNG: pn.PNG || pn.default?.PNG, installed, ms: Date.now() - t0 };
}

/** Upana × urefu kutoka IHDR (bila pngjs). */
export function pngSize(file) {
  const b = fs.readFileSync(file);
  if (b.length < 24 || b.readUInt32BE(0) !== 0x89504e47) throw new Error(`not a PNG: ${file}`);
  return { width: b.readUInt32BE(16), height: b.readUInt32BE(20), bytes: b.length };
}

let depsPromise = null;
/**
 * maelezo22: diffImages(baselinePath, currentPath, threshold) → { changedPct, diffPng }.
 * threshold = unyeti wa pixelmatch kwa kila pixel (0..1, default 0.1). diffPng = path ya picha ya tofauti (au null).
 */
export async function diffImages(baselinePath, currentPath, threshold = DEFAULT_PIXEL_THRESHOLD, diffOut = null) {
  depsPromise ||= ensureDeps();
  const { pixelmatch, PNG } = await depsPromise;
  const a = PNG.sync.read(fs.readFileSync(baselinePath));
  const b = PNG.sync.read(fs.readFileSync(currentPath));
  if (a.width !== b.width || a.height !== b.height) {
    return {
      changedPct: 100, diffPng: null, changedPixels: null, totalPixels: b.width * b.height, width: b.width, height: b.height,
      note: `dimensions differ: baseline ${a.width}x${a.height} vs current ${b.width}x${b.height} — not comparable pixel by pixel`,
    };
  }
  const { width, height } = a;
  const diff = new PNG({ width, height });
  const changedPixels = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: Number(threshold) || DEFAULT_PIXEL_THRESHOLD });
  const totalPixels = width * height;
  let diffPng = null;
  if (diffOut && changedPixels > 0) {
    fs.mkdirSync(path.dirname(diffOut), { recursive: true });
    fs.writeFileSync(diffOut, PNG.sync.write(diff));
    diffPng = diffOut;
  }
  return { changedPct: Math.round((changedPixels / totalPixels) * 100 * 1000) / 1000, diffPng, changedPixels, totalPixels, width, height };
}

// ── majina (lazima yalingane na src/lib/milestone/regression.ts) ────────────
export const normRoute = (r) => {
  let s = String(r || "/").trim().replace(/[?#].*$/, "");
  if (!s.startsWith("/")) s = `/${s}`;
  if (s.length > 1) s = s.replace(/\/+$/, "");
  return s || "/";
};
export const routeSlug = (r) => (normRoute(r) === "/" ? "root" : normRoute(r).slice(1).replace(/[^A-Za-z0-9.]+/g, "_").replace(/^_+|_+$/g, "") || "root");
export const stateSlug = (s) => String(s || "default").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "default";
export const baselineKey = (route, viewport, state) => `${normRoute(route)}|${viewport}|${state || "default"}`;
export const baselineFileName = (route, viewport, state) => `${routeSlug(route)}-${viewport}-${stateSlug(state)}.png`;

/** mode "save": nakala za screenshots zilizoidhinishwa → baselines za milestone. */
export function runSave(cfg) {
  const cwd = cfg.cwd || process.cwd();
  const outRel = cfg.outDir || `.xmd/baselines/${cfg.milestoneId}`;
  const out = path.resolve(cwd, outRel);
  fs.rmSync(out, { recursive: true, force: true }); // baseline mpya ya milestone hii inachukua nafasi ya ya zamani
  fs.mkdirSync(out, { recursive: true });
  const entries = [], errors = [], used = new Set();
  for (const s of cfg.screenshots || []) {
    try {
      const src = path.resolve(cwd, s.path);
      if (!fs.existsSync(src)) throw new Error(`screenshot file missing: ${s.path}`);
      let name = baselineFileName(s.route, s.viewport, s.state);
      for (let i = 2; used.has(name); i++) name = baselineFileName(s.route, s.viewport, `${s.state}_${i}`);
      used.add(name);
      fs.copyFileSync(src, path.join(out, name));
      const { width, height, bytes } = pngSize(src);
      entries.push({
        key: baselineKey(s.route, s.viewport, s.state), route: normRoute(s.route), viewport: s.viewport, state: s.state || "default",
        file: path.posix.join(outRel, name), sourceId: s.id, sourcePath: s.path, width, height, bytes, url: "",
      });
    } catch (e) { errors.push(`${s.id || "?"}: ${String(e?.message || e).slice(0, 200)}`); }
  }
  const manifest = { milestoneId: cfg.milestoneId, round: cfg.round ?? 0, savedAt: new Date().toISOString(), entries };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  return { manifest, errors, manifestPath: path.posix.join(outRel, "manifest.json") };
}

/** Baselines zote za workspace — ya karibuni (savedAt) inashinda kwa kila key. */
export function loadBaselines(cwd, baselinesDir = ".xmd/baselines") {
  const root = path.resolve(cwd, baselinesDir);
  const manifests = [];
  const errors = [];
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root, { withFileTypes: true })) {
      if (!d.isDirectory()) continue;
      const f = path.join(root, d.name, "manifest.json");
      if (!fs.existsSync(f)) continue;
      try { manifests.push(JSON.parse(fs.readFileSync(f, "utf8"))); } catch (e) { errors.push(`baseline manifest ${d.name}: ${String(e?.message || e).slice(0, 160)}`); }
    }
  }
  manifests.sort((a, b) => String(a.savedAt || "").localeCompare(String(b.savedAt || "")));
  const byKey = new Map();
  for (const m of manifests) for (const e of m.entries || []) byKey.set(e.key, { ...e, milestoneId: m.milestoneId });
  return { byKey, manifests: manifests.length, errors };
}

/** mode "diff": kila baseline yenye screenshot ya sasa → changedPct + diff PNG. */
export async function runDiff(cfg) {
  const t0 = Date.now();
  const cwd = cfg.cwd || process.cwd();
  const outRel = cfg.outDir || `.xmd/evidence/${cfg.milestoneId}/R${cfg.round ?? 0}/regression`;
  const { byKey, manifests, errors } = loadBaselines(cwd, cfg.baselinesDir);
  const current = new Map((cfg.current || []).map((s) => [baselineKey(s.route, s.viewport, s.state), s]));
  const results = [], notCaptured = [];
  let deps = { installed: false, ms: 0, skipped: true };
  const pairs = [...byKey.values()].filter((b) => { if (current.has(b.key)) return true; notCaptured.push(b.key); return false; });
  if (pairs.length) {
    try {
      depsPromise ||= ensureDeps();
      const d = await depsPromise;
      deps = { installed: d.installed, ms: d.ms, skipped: false };
    } catch (e) {
      errors.push(`pixelmatch/pngjs unavailable: ${String(e?.stderr || e?.message || e).slice(0, 300)}`);
      return { results, notCaptured, errors, deps, manifests, ms: Date.now() - t0 };
    }
  }
  for (const b of pairs) {
    const s = current.get(b.key);
    const row = {
      key: b.key, route: b.route, viewport: b.viewport, state: b.state, baselineMilestone: b.milestoneId,
      baselinePath: b.file, baselineUrl: b.url || "", currentId: s.id, currentPath: s.path, currentUrl: s.url || "",
    };
    try {
      const bAbs = path.resolve(cwd, b.file);
      if (!fs.existsSync(bAbs)) { // workspace mpya (sandbox imerudishwa) → baseline kutoka storage
        if (!b.url) throw new Error(`baseline file missing and no storage url: ${b.file}`);
        const r = await fetch(b.url);
        if (!r.ok) throw new Error(`baseline download HTTP ${r.status}`);
        fs.mkdirSync(path.dirname(bAbs), { recursive: true });
        fs.writeFileSync(bAbs, Buffer.from(await r.arrayBuffer()));
        row.restored = true;
      }
      const diffRel = path.posix.join(outRel, `${baselineFileName(b.route, b.viewport, b.state).replace(/\.png$/, "")}.diff.png`);
      const d = await diffImages(bAbs, path.resolve(cwd, s.path), cfg.threshold ?? DEFAULT_PIXEL_THRESHOLD, path.resolve(cwd, diffRel));
      Object.assign(row, { changedPct: d.changedPct, changedPixels: d.changedPixels, totalPixels: d.totalPixels, diffPath: d.diffPng ? diffRel : "", ...(d.note ? { note: d.note } : {}) });
      results.push(row);
    } catch (e) {
      errors.push(`${b.key}: ${String(e?.message || e).slice(0, 200)}`);
    }
  }
  return { results, notCaptured, errors, deps, manifests, ms: Date.now() - t0 };
}

async function main(argv) {
  if (argv[0] === "diff") {
    const pos = argv.slice(1).filter((x, i, a) => !x.startsWith("--") && a[i - 1] !== "--threshold");
    const ti = argv.indexOf("--threshold");
    const r = await diffImages(pos[0], pos[1], ti > 0 ? Number(argv[ti + 1]) : DEFAULT_PIXEL_THRESHOLD, pos[2] || null);
    console.log(JSON.stringify(r));
    return 0;
  }
  const ci = argv.indexOf("--config");
  if (ci < 0) { console.error("usage: --config <file> | diff <a.png> <b.png> [out.png]"); return 2; }
  const cfg = JSON.parse(fs.readFileSync(argv[ci + 1], "utf8"));
  const cwd = cfg.cwd || process.cwd();
  if (cfg.mode === "save") {
    const r = runSave(cfg);
    console.log(`baselines ${cfg.milestoneId}: ${r.manifest.entries.length} saved · errors ${r.errors.length}`);
    fs.writeFileSync(path.resolve(cwd, path.dirname(r.manifestPath), "save-result.json"), JSON.stringify({ errors: r.errors }, null, 2));
    return r.errors.length ? 1 : 0;
  }
  const r = await runDiff(cfg);
  const outRel = cfg.outDir || `.xmd/evidence/${cfg.milestoneId}/R${cfg.round ?? 0}/regression`;
  fs.mkdirSync(path.resolve(cwd, outRel), { recursive: true });
  fs.writeFileSync(path.resolve(cwd, outRel, "regression.json"), JSON.stringify(r, null, 2));
  console.log(`regression ${cfg.milestoneId} R${cfg.round ?? 0}: compared ${r.results.length} · notCaptured ${r.notCaptured.length} · errors ${r.errors.length} · deps ${r.deps.skipped ? "skipped" : r.deps.installed ? `installed ${r.deps.ms}ms` : "present"} · ${r.ms}ms`);
  return r.errors.length ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c), (e) => { console.error(`xmd-regression crash: ${e?.stack || e}`); process.exit(2); });
}
