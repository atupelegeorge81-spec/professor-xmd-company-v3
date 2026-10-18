#!/usr/bin/env node
// cu/xmd-evidence.mjs — TASK 19 (maelezo19): screenshot runner ya HARNESS (code, si agent).
// Inaendeshwa NDANI ya sandbox ya XMD Computer (Playwright + Chromium vipo kwenye template) na harness:
//   node .xmd/tools/xmd-evidence.mjs --config .xmd/tools/evidence-M1-R0.json [--base https://site] [--out dir]
// config: { milestoneId, round, startCommand?, port?, cwd?, outDir?, startTimeoutMs?,
//           routes: [{ route, viewports: ["375x667", ...], states: [{ name, actions: [{ do: "click"|"hover", selector }] }] }] }
// Matokeo: <outDir>/S-001.png ... + <outDir>/manifest.json (EvidencePack ya task 9: screenshots/consoleErrors/errors/commands).
// Manifest INAANDIKWA KILA WAKATI (hata server ikishindwa / crash). Exit: 0 = safi · 1 = kuna errors · 2 = crash.
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";

const DEFAULT_VIEWPORTS = ["375x667", "768x1024", "1280x800"];

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function loadPlaywright() {
  try { return await import("playwright"); } catch { /* global install (template: npm -g playwright) */ }
  const root = execSync("npm root -g", { encoding: "utf8" }).trim();
  return createRequire(path.join(root, "noop.js"))("playwright");
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function waitHttp200(url, timeoutMs, isDead = () => false) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    if (isDead()) return { ok: false, ms: Date.now() - t0, last: last || "server process exited" };
    try {
      const r = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(5000) });
      if (r.status === 200) return { ok: true, ms: Date.now() - t0 };
      last = `HTTP ${r.status}`;
    } catch (e) { last = String(e?.cause?.code || e?.message || e); }
    await sleep(1000);
  }
  return { ok: false, ms: Date.now() - t0, last };
}

function parseViewport(v) {
  const m = /^(\d{3,4})x(\d{3,4})$/.exec(String(v).trim());
  return m ? { width: +m[1], height: +m[2] } : null;
}

async function main() {
  const cfgPath = arg("config");
  const cfg = cfgPath ? JSON.parse(fs.readFileSync(cfgPath, "utf8")) : {};
  const milestoneId = String(cfg.milestoneId || "M0");
  const round = Number.isInteger(cfg.round) ? cfg.round : 0;
  const cwd = cfg.cwd || process.cwd();
  const outRel = arg("out") || cfg.outDir || `.xmd/evidence/${milestoneId}/R${round}`;
  const outDir = path.resolve(cwd, outRel);
  const base = (arg("base") || cfg.base || "").replace(/\/+$/, "");
  const port = Number(cfg.port || 4173);
  const target = base || `http://127.0.0.1:${port}`;
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    milestoneId, round, base: target, mode: base ? "deployed" : "local",
    screenshots: [], domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [],
    consoleErrors: [], errors: [], generatedAt: new Date().toISOString(),
  };
  const writeManifest = () => fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  let server = null;
  let browser = null;
  let code = 0;
  try {
    // 1) server (local mode tu)
    if (!base) {
      const sc = String(cfg.startCommand || "").trim();
      if (!sc) {
        manifest.errors.push({ kind: "server", detail: "no startCommand in the plan — the harness cannot start the app" });
        return;
      }
      const logPath = path.join(outDir, "server.log");
      const log = fs.openSync(logPath, "w");
      server = spawn("bash", ["-lc", sc], { cwd, detached: true, stdio: ["ignore", log, log], env: { ...process.env, PORT: String(port) } });
      let exited = null;
      server.on("exit", (c) => { exited = c; });
      const w = await waitHttp200(`${target}/`, Number(cfg.startTimeoutMs || 120_000), () => exited !== null);
      manifest.commands.push({ cmd: sc, exit: exited ?? (w.ok ? 0 : -1), logPath: path.relative(cwd, logPath) });
      if (!w.ok) {
        const tail = fs.readFileSync(logPath, "utf8").slice(-600);
        manifest.errors.push({ kind: "server", detail: `server did not answer HTTP 200 on ${target}/ within ${Math.round(w.ms / 1000)}s (last: ${w.last}; exit ${exited ?? "running"}) — ${tail}` });
        return;
      }
    }

    // 2) screenshots: route × viewport × state
    const pw = await loadPlaywright();
    browser = await pw.chromium.launch({ headless: true, args: ["--no-sandbox"] });
    let n = 0;
    for (const r of cfg.routes || []) {
      const route = String(r.route || "/");
      const viewports = (r.viewports && r.viewports.length ? r.viewports : DEFAULT_VIEWPORTS);
      const states = [{ name: "default", actions: [] }, ...((r.states || []).filter((s) => s && s.name && s.name !== "default"))];
      let routeDead = false;
      for (const vpName of viewports) {
        if (routeDead) break;
        const vp = parseViewport(vpName);
        if (!vp) { manifest.errors.push({ kind: "viewport", route, viewport: String(vpName), detail: "bad viewport (use WIDTHxHEIGHT)" }); continue; }
        for (const st of states) {
          const tag = `${route} @${vpName} [${st.name}]`;
          const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
          const page = await ctx.newPage();
          page.on("console", (m) => { if (m.type() === "error") manifest.consoleErrors.push(`${tag} console: ${m.text().slice(0, 300)}`); });
          page.on("pageerror", (e) => manifest.consoleErrors.push(`${tag} pageerror: ${String(e?.message || e).slice(0, 300)}`));
          page.on("requestfailed", (q) => {
            const why = q.failure()?.errorText || "failed";
            // ERR_ABORTED = browser yenyewe iliacha ombi (prefetch/navigation iliyoghairiwa, context kufungwa) — si kosa la site
            if (/ERR_ABORTED/i.test(why)) return;
            manifest.consoleErrors.push(`${tag} failed request: ${q.url().slice(0, 200)} — ${why}`);
          });
          page.on("response", (s) => { if (s.status() >= 400 && s.request().resourceType() !== "document") manifest.consoleErrors.push(`${tag} HTTP ${s.status()}: ${s.url().slice(0, 200)}`); });
          try {
            const resp = await page.goto(target + route, { waitUntil: "networkidle", timeout: 45_000 });
            const status = resp ? resp.status() : 0;
            if (status >= 400 || status === 0) {
              manifest.errors.push({ kind: "http", route, viewport: vpName, state: st.name, status, detail: `route ${route} answered HTTP ${status}` });
              routeDead = true;
              break;
            }
            await page.evaluate(() => document.fonts ? document.fonts.ready.then(() => true) : true);
            let actionErr = "";
            for (const a of st.actions || []) {
              try {
                if (a.do === "click") await page.click(a.selector, { timeout: 5000 });
                else if (a.do === "hover") await page.hover(a.selector, { timeout: 5000 });
                else throw new Error(`unknown action ${a.do}`);
              } catch (e) { actionErr = `${a.do} ${a.selector}: ${String(e?.message || e).split("\n")[0].slice(0, 200)}`; break; }
            }
            if (actionErr) { manifest.errors.push({ kind: "state", route, viewport: vpName, state: st.name, detail: actionErr }); continue; }
            if ((st.actions || []).length) { await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {}); await sleep(400); }
            const id = `S-${String(++n).padStart(3, "0")}`;
            const file = path.join(outDir, `${id}.png`);
            await page.screenshot({ path: file, fullPage: true });
            manifest.screenshots.push({ id, route, viewport: vpName, state: st.name, path: path.relative(cwd, file), url: "" });
          } catch (e) {
            manifest.errors.push({ kind: "page", route, viewport: vpName, state: st.name, detail: String(e?.message || e).split("\n")[0].slice(0, 300) });
          } finally {
            await ctx.close().catch(() => {});
          }
        }
      }
    }
  } catch (e) {
    manifest.errors.push({ kind: "crash", detail: String(e?.stack || e).slice(0, 800) });
    code = 2;
  } finally {
    if (browser) await browser.close().catch(() => {});
    if (server && server.pid) { try { process.kill(-server.pid, "SIGKILL"); } catch { /* imeshakufa */ } }
    if (!code && manifest.errors.length) code = 1;
    manifest.exitCode = code;
    writeManifest();
    console.log(`xmd-evidence: ${manifest.screenshots.length} screenshots · errors ${manifest.errors.length} · console ${manifest.consoleErrors.length} → ${path.relative(cwd, outDir)}/manifest.json`);
    process.exit(code);
  }
}

main();
