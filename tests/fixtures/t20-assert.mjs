#!/usr/bin/env node
// TASK 20 (maelezo20) — assertions za T1/T2/T4/T5 juu ya matokeo HALISI ya cu/xmd-evidence.mjs.
//   node t20-assert.mjs <evidenceDir> <fixturesDir>
// evidenceDir = .xmd/evidence/M1/R0 (manifest.json + S-nnn.dom.json). T4 inazindua server yake (port 4174) + Playwright
// ya pili (boundingBox) kupima elements 3 kwa njia huru. Exit 0 = zote PASS.
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";

const [dir, fixtures] = process.argv.slice(2);
const man = JSON.parse(fs.readFileSync(path.join(dir, "manifest.json"), "utf8"));
const dom = (route, vp) => {
  const s = man.screenshots.find((x) => x.route === route && x.viewport === vp && x.state === "default");
  if (!s) throw new Error(`no screenshot for ${route} @${vp}`);
  const d = man.domMetrics.find((x) => x.screenshotId === s.id);
  if (!d) throw new Error(`no domMetrics entry for ${s.id}`);
  return { id: s.id, entry: d, json: JSON.parse(fs.readFileSync(path.join(dir, `${s.id}.dom.json`), "utf8")) };
};
const results = [];
const check = (test, name, ok, got) => { results.push({ test, name, ok: !!ok }); console.log(`${ok ? "PASS" : "FAIL"} ${test} · ${name} — ${got}`); };
const el = (d, s) => d.json.elements.find((e) => e.selector === s);

// ── T1: evil fixture @375 — kila kasoro ionekane
{
  const d = dom("/evil.html", "375x667");
  const p = d.json.page;
  check("T1", `${d.id} horizontal overflow 3px`, p.hasHorizontalOverflow === true && p.overflowPx === 3, `hasHorizontalOverflow=${p.hasHorizontalOverflow} overflowPx=${p.overflowPx} scrollWidth=${p.scrollWidth} innerWidth=${p.innerWidth}`);
  const t = el(d, "#tiny");
  check("T1", "20×20 button tooSmall", t && t.tooSmall === true && t.touchTarget.w === 20 && t.touchTarget.h === 20, `#tiny touchTarget=${JSON.stringify(t?.touchTarget)} tooSmall=${t?.tooSmall}`);
  const f = el(d, "#faint");
  check("T1", "contrast ≈ 2:1 flagged", f && f.contrastRatio >= 1.9 && f.contrastRatio <= 2.1 && f.lowContrast === true, `#faint color=${f?.color} bg=${f?.backgroundColor} contrastRatio=${f?.contrastRatio} lowContrast=${f?.lowContrast}`);
  const m = el(d, "#mono");
  check("T1", "uppercase + monospace", m && m.textTransform === "uppercase" && /monospace/.test(m.fontFamily), `#mono textTransform=${m?.textTransform} fontFamily=${m?.fontFamily}`);
  check("T1", "img without alt", p.imagesWithoutAlt.some((i) => i.selector === "#noalt"), `imagesWithoutAlt=${JSON.stringify(p.imagesWithoutAlt.map((i) => i.selector))}`);
  check("T1", "h1 after h3", p.headingOrderProblems.some((x) => /h1 .* comes after h3/.test(x)), `headingOrderProblems=${JSON.stringify(p.headingOrderProblems)}`);
  check("T1", "manifest summary mirrors the defects", d.entry.summary.hasHorizontalOverflow && d.entry.summary.tooSmall >= 1 && d.entry.summary.lowContrast >= 1 && d.entry.summary.imagesWithoutAlt === 1 && d.entry.summary.headingOrderProblems >= 1, JSON.stringify(d.entry.summary));
  check("T1", "keySelector problem reported (.does-not-exist)", d.json.problems.some((x) => x.includes(".does-not-exist")), JSON.stringify(d.json.problems));
}

// ── T2: good fixture — hakuna overflow, hakuna tooSmall, contrast ≥ 4.5
for (const vp of ["375x667", "1280x800"]) {
  const d = dom("/good.html", vp);
  const p = d.json.page;
  const vis = d.json.elements.filter((e) => e.visible);
  const small = vis.filter((e) => e.tooSmall);
  const lowText = vis.filter((e) => e.hasText && e.contrastRatio < 4.5);
  const minC = Math.min(...vis.filter((e) => e.hasText).map((e) => e.contrastRatio));
  check("T2", `${d.id} @${vp} no overflow`, !p.hasHorizontalOverflow && p.overflowPx === 0, `scrollWidth=${p.scrollWidth} clientWidth=${p.clientWidth}`);
  check("T2", `${d.id} @${vp} no tooSmall`, small.length === 0, `interactive=${vis.filter((e) => e.interactive).length} tooSmall=${small.map((e) => e.selector)}`);
  check("T2", `${d.id} @${vp} text contrast ≥ 4.5`, lowText.length === 0, `text elements=${vis.filter((e) => e.hasText).length} min contrast=${minC}`);
  check("T2", `${d.id} @${vp} no alt/heading problems`, p.imagesWithoutAlt.length === 0 && p.headingOrderProblems.length === 0, `imagesWithoutAlt=${p.imagesWithoutAlt.length} headingOrderProblems=${p.headingOrderProblems.length}`);
}

// ── T5: kikomo cha 150 — kila dom.json, na big.html imekatwa ikiweka vinavyoonekana
{
  const all = man.domMetrics.map((x) => JSON.parse(fs.readFileSync(path.join(dir, `${x.screenshotId}.dom.json`), "utf8")));
  check("T5", "every dom.json ≤ 150 elements", all.every((j) => j.elements.length <= 150), all.map((j) => `${j.screenshotId}:${j.elements.length}/${j.totalCandidates}`).join(" "));
  const d = dom("/big.html", "375x667");
  const e = d.json.elements;
  check("T5", `${d.id} big: capped at exactly 150 of ${d.json.totalCandidates}`, e.length === 150 && d.json.totalCandidates > 150 && d.json.truncated === true, `elements=${e.length} totalCandidates=${d.json.totalCandidates} truncated=${d.json.truncated}`);
  check("T5", "hidden buttons dropped first (all kept are visible)", e.every((x) => x.visible) && !e.some((x) => /^H\d+/.test(x.text)), `visible=${e.filter((x) => x.visible).length} hiddenKept=${e.filter((x) => !x.visible).length}`);
  check("T5", "large landmarks kept (header, main, h1)", ["header", "main", "h1"].every((t) => e.some((x) => x.tag === t)), e.filter((x) => ["header", "main", "h1"].includes(x.tag)).map((x) => x.selector).join(", "));
}

// ── T4: namba ni sahihi — box vs boundingBox() ya Playwright huru (± 1px)
{
  let pw;
  try { pw = await import("playwright"); } catch { pw = createRequire(path.join(execSync("npm root -g", { encoding: "utf8" }).trim(), "noop.js"))("playwright"); }
  const srv = spawn("python3", ["-m", "http.server", "4174", "--bind", "127.0.0.1"], { cwd: fixtures, stdio: "ignore", detached: true });
  try {
    for (let i = 0; i < 40; i++) { try { if ((await fetch("http://127.0.0.1:4174/evil.html")).ok) break; } catch { /* bado */ } await new Promise((r) => setTimeout(r, 250)); }
    const b = await pw.chromium.launch({ headless: true, args: ["--no-sandbox"] });
    const page = await (await b.newContext({ viewport: { width: 375, height: 667 }, deviceScaleFactor: 1 })).newPage();
    await page.goto("http://127.0.0.1:4174/evil.html", { waitUntil: "networkidle" });
    const d = dom("/evil.html", "375x667");
    for (const s of ["#tiny", "#title", "#noalt"]) {
      const bb = await page.locator(s).boundingBox();
      const sc = await page.evaluate(() => [window.scrollX, window.scrollY]);
      const ind = { x: bb.x + sc[0], y: bb.y + sc[1], w: bb.width, h: bb.height };
      const got = el(d, s).box;
      const diff = Math.max(Math.abs(ind.x - got.x), Math.abs(ind.y - got.y), Math.abs(ind.w - got.w), Math.abs(ind.h - got.h));
      check("T4", `${s} box within 1px`, diff <= 1, `dom.json=${JSON.stringify(got)} boundingBox=${JSON.stringify({ x: +ind.x.toFixed(2), y: +ind.y.toFixed(2), w: +ind.w.toFixed(2), h: +ind.h.toFixed(2) })} maxDiff=${diff.toFixed(3)}px`);
    }
    await b.close();
  } finally { try { process.kill(-srv.pid, "SIGKILL"); } catch { /* */ } }
}

const failed = results.filter((r) => !r.ok);
console.log(`\nT20 assertions: ${results.length - failed.length}/${results.length} PASS`);
process.exit(failed.length ? 1 : 0);
