#!/usr/bin/env node
// cu/xmd-evidence.mjs — TASK 19 (maelezo19): screenshot runner ya HARNESS (code, si agent).
// Inaendeshwa NDANI ya sandbox ya XMD Computer (Playwright + Chromium vipo kwenye template) na harness:
//   node .xmd/tools/xmd-evidence.mjs --config .xmd/tools/evidence-M1-R0.json [--base https://site] [--out dir]
// config: { milestoneId, round, startCommand?, port?, cwd?, outDir?, startTimeoutMs?,
//           routes: [{ route, viewports: ["375x667", ...], states: [{ name, actions: [{ do: "click"|"hover", selector }] }] }],
//           keySelectors?: [".card", ...], domMaxElements?: 150 }
// TASK 21 (maelezo21): config { mode: "checks", checks: [Check...] } → hakuna screenshots; checks za browser
//   (dom_exists, computed_style, no_horizontal_overflow, console_clean, contrast_min, touch_target_min) zinaendeshwa na
//   matokeo yanaandikwa manifest.checks[{id,type,result:"PASS"|"FAIL"|"ERROR",detail}]. Code inaamua — si LLM.
// Matokeo: <outDir>/S-001.png ... + <outDir>/manifest.json (EvidencePack ya task 9: screenshots/consoleErrors/errors/commands).
// TASK 20 (maelezo20): kila screenshot pia → <outDir>/S-001.dom.json (DOM metrics: box/fonts/rangi/contrast/touch + page-level).
// Manifest INAANDIKWA KILA WAKATI (hata server ikishindwa / crash). Exit: 0 = safi · 1 = kuna errors · 2 = crash.
import fs from "node:fs";
import path from "node:path";
import { spawn, execSync } from "node:child_process";
import { createRequire } from "node:module";

const DEFAULT_VIEWPORTS = ["375x667", "768x1024", "1280x800"];
// TASK 20: elements za kawaida (maelezo20) + keySelectors za plan; kikomo kwa kila screenshot
const DOM_GENERIC_SELECTORS = ["header", "nav", "main", "footer", "h1", "h2", "h3", "button", "a", "input", "img"];
const DOM_MAX_ELEMENTS = 150;

/**
 * TASK 20 — inaendeshwa NDANI ya ukurasa (page.evaluate). Haitumii closure yoyote (Playwright inaituma kama maandishi).
 * Inarudisha { page: {...}, elements: [...], totalCandidates, truncated, problems }.
 */
function collectDomMetrics({ keySelectors, generic, max }) {
  const problems = [];
  const parse = (c) => {
    if (!c || c === "transparent") return [0, 0, 0, 0];
    const m = /rgba?\(([^)]+)\)/.exec(c);
    if (!m) return null; // color(), lab() n.k. — hatuzijui
    const t = m[1].split(/[\s,\/]+/).filter(Boolean);
    const ch = (x) => (x.endsWith("%") ? (parseFloat(x) / 100) * 255 : parseFloat(x));
    const a = t.length > 3 ? (t[3].endsWith("%") ? parseFloat(t[3]) / 100 : parseFloat(t[3])) : 1;
    return [ch(t[0]), ch(t[1]), ch(t[2]), a];
  };
  const over = (top, bot) => { // top juu ya bot (bot ni opaque)
    const a = top[3];
    return [top[0] * a + bot[0] * (1 - a), top[1] * a + bot[1] * (1 - a), top[2] * a + bot[2] * (1 - a), 1];
  };
  const lum = (c) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  };
  const ratio = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
  const css = (c) => `rgb(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])})`;
  // background halisi: tabaka kutoka element hadi <html>; zinachanganywa juu ya canvas nyeupe hadi tabaka la kwanza lisilo wazi
  const bgOf = (el) => {
    const layers = [];
    let img = false;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== "none") img = true;
      const c = parse(cs.backgroundColor);
      if (c && c[3] > 0) { layers.push(c); if (c[3] >= 1) break; }
    }
    let out = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) out = over(layers[i], out);
    return { color: out, hasImage: img, from: layers.length ? "ancestor" : "canvas" };
  };
  const sel = (el) => { // njia thabiti: #id ya kipekee au tag:nth-of-type kutoka kwa ancestor yenye id
    const esc = (x) => (window.CSS && CSS.escape ? CSS.escape(x) : x);
    const parts = [];
    for (let n = el; n && n.nodeType === 1 && n !== document.documentElement; n = n.parentElement) {
      if (n.id && document.querySelectorAll(`#${esc(n.id)}`).length === 1) { parts.unshift(`#${esc(n.id)}`); break; }
      const tag = n.tagName.toLowerCase();
      const sib = n.parentElement ? [...n.parentElement.children].filter((x) => x.tagName === n.tagName) : [n];
      parts.unshift(sib.length > 1 ? `${tag}:nth-of-type(${sib.indexOf(n) + 1})` : tag);
      if (tag === "body") break;
    }
    return parts.join(" > ");
  };
  const INTERACTIVE = 'a[href], button, input:not([type="hidden"]), select, textarea, [role="button"], [role="link"], summary';
  const de = document.documentElement;
  const sx = window.scrollX, sy = window.scrollY;

  // wagombea: keySelectors kwanza (alama ya kipaumbele), kisha generic
  const keyed = new Set();
  const cand = [];
  const seen = new Set();
  for (const k of keySelectors || []) {
    let list = [];
    try { list = [...document.querySelectorAll(k)]; } catch { problems.push(`invalid keySelector "${k}"`); continue; }
    if (!list.length) problems.push(`keySelector "${k}" matched 0 elements`);
    for (const el of list) { keyed.add(el); if (!seen.has(el)) { seen.add(el); cand.push(el); } }
  }
  if (generic && generic.length) for (const el of document.querySelectorAll(generic.join(","))) if (!seen.has(el)) { seen.add(el); cand.push(el); }

  // hatua 1 (nyepesi kwa wagombea wote): kuonekana + ukubwa + interactive → kipaumbele (maelezo20: visible, larger, interactive)
  const ranked = cand.map((el, order) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const visible = r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none" && parseFloat(cs.opacity) > 0
      && (typeof el.checkVisibility !== "function" || el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }));
    const interactive = el.matches(INTERACTIVE);
    // landmarks + headings (header/nav/main/footer/h1–h3) ni wachache na ni muhimu → juu ya vitufe vingi vidogo
    const landmark = /^(HEADER|NAV|MAIN|FOOTER|H1|H2|H3)$/.test(el.tagName);
    const score = (visible ? 1e7 : 0) + (keyed.has(el) ? 5e6 : 0) + (landmark ? 4e6 : 0) + (interactive ? 2e6 : 0) + Math.min(r.width * r.height, 1e6);
    return { el, r, cs, visible, interactive, score, order };
  });
  const total = ranked.length;
  const keep = ranked.sort((a, b) => b.score - a.score).slice(0, max).sort((a, b) => a.order - b.order);

  // hatua 2 (kamili kwa waliobaki tu ≤ max): maandishi, rangi, contrast, selector
  const kept = keep.map(({ el, r, cs, visible, interactive }) => {
    const tag = el.tagName.toLowerCase();
    const raw = tag === "img" ? (el.getAttribute("alt") || "") : tag === "input" ? (el.value || el.getAttribute("placeholder") || el.getAttribute("aria-label") || "") : (el.innerText || el.textContent || el.getAttribute("aria-label") || "");
    const text = raw.slice(0, 400).replace(/\s+/g, " ").trim();
    const fg = parse(cs.color) || [0, 0, 0, 1];
    const bg = bgOf(el);
    const fgOnBg = fg[3] < 1 ? over(fg, bg.color) : fg;
    const size = parseFloat(cs.fontSize) || 0;
    const weight = parseInt(cs.fontWeight, 10) || 400;
    const large = size >= 24 || (size >= 18.66 && weight >= 700); // WCAG "large text"
    const contrast = Math.round(ratio(fgOnBg, bg.color) * 100) / 100;
    const box = { x: Math.round((r.left + sx) * 100) / 100, y: Math.round((r.top + sy) * 100) / 100, w: Math.round(r.width * 100) / 100, h: Math.round(r.height * 100) / 100 };
    const hasText = text.length > 0 && tag !== "img";
    const o = {
      selector: sel(el), tag, text: text.slice(0, 40), box, visible, keySelector: keyed.has(el),
      fontFamily: cs.fontFamily, fontSize: cs.fontSize, fontWeight: cs.fontWeight, letterSpacing: cs.letterSpacing, textTransform: cs.textTransform,
      color: css(fgOnBg), backgroundColor: css(bg.color), backgroundFrom: bg.from, backgroundImage: bg.hasImage,
      contrastRatio: contrast, hasText, largeText: large, contrastMin: large ? 3 : 4.5,
      lowContrast: hasText && visible && contrast < (large ? 3 : 4.5),
      interactive,
    };
    if (interactive) { o.touchTarget = { w: box.w, h: box.h }; o.tooSmall = visible && (box.w < 44 || box.h < 44); }
    // TASK-26: imefunikwa? (elementi nyingine iko juu ya katikati yake ndani ya viewport) — harness inalinganisha raundi kwa raundi
    if (hasText && visible) {
      const cx = r.left + r.width / 2, cy = r.top + Math.min(r.height / 2, 12);
      if (cx >= 0 && cy >= 0 && cx < window.innerWidth && cy < window.innerHeight) {
        const top = document.elementFromPoint(cx, cy);
        o.occluded = !!top && top !== el && !el.contains(top) && !top.contains(el);
        if (o.occluded) o.occludedBy = sel(top);
      }
    }
    return o;
  });

  // page-level
  const heads = [...document.querySelectorAll("h1,h2,h3,h4,h5,h6")];
  const hp = [];
  let prev = 0, h1s = 0;
  heads.forEach((h, i) => {
    const lv = +h.tagName[1];
    const t = h.textContent.replace(/\s+/g, " ").trim().slice(0, 40);
    if (i === 0 && lv !== 1) hp.push(`first heading is h${lv} ("${t}"), expected h1`);
    if (lv === 1 && ++h1s > 1) hp.push(`more than one h1 ("${t}")`);
    if (lv === 1 && prev > 1) hp.push(`h1 ("${t}") comes after h${prev}`);
    if (prev && lv > prev + 1) hp.push(`skipped level: h${prev} → h${lv} ("${t}")`);
    prev = lv;
  });
  const fonts = document.fonts ? [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => `${f.family.replace(/["']/g, "")} ${f.weight} ${f.style}`))] : [];
  const fontsFailed = document.fonts ? [...new Set([...document.fonts].filter((f) => f.status === "error").map((f) => f.family.replace(/["']/g, "")))] : [];
  const imgs = [...document.images].filter((im) => !im.hasAttribute("alt")).map((im) => ({ selector: sel(im), src: (im.currentSrc || im.src || "").slice(0, 200) }));
  const scrollWidth = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0);
  const page = {
    url: location.href, title: document.title.slice(0, 120),
    scrollWidth, scrollHeight: de.scrollHeight, innerWidth: window.innerWidth, innerHeight: window.innerHeight, clientWidth: de.clientWidth,
    hasHorizontalOverflow: scrollWidth > de.clientWidth, overflowPx: Math.max(0, scrollWidth - de.clientWidth),
    bodyBackground: css(bgOf(document.body || de).color),
    fontsLoaded: fonts, fontsFailed, imagesWithoutAlt: imgs, headingOrderProblems: hp,
  };
  return { page, elements: kept, totalCandidates: total, truncated: total > kept.length, problems };
}

/** Muhtasari mfupi wa dom.json (unaingia kwenye manifest.domMetrics). */
function domSummary(d) {
  const v = d.elements.filter((e) => e.visible);
  return {
    elements: d.elements.length, totalCandidates: d.totalCandidates, truncated: d.truncated,
    hasHorizontalOverflow: d.page.hasHorizontalOverflow, overflowPx: d.page.overflowPx,
    tooSmall: v.filter((e) => e.tooSmall).length, lowContrast: v.filter((e) => e.lowContrast).length, occluded: v.filter((e) => e.occluded).length,
    imagesWithoutAlt: d.page.imagesWithoutAlt.length, headingOrderProblems: d.page.headingOrderProblems.length,
  };
}

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

// ── TASK 21: checks za browser ──────────────────────────────────────────────
const BROWSER_CHECK_TYPES = new Set(["dom_exists", "computed_style", "no_horizontal_overflow", "console_clean", "contrast_min", "touch_target_min"]);
const CHECK_DEFAULT_VIEWPORT = "375x667"; // mobile-first: kali zaidi kwa touch/overflow
const norm = (v) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/\s*,\s*/g, ", ");
/** "#fff" / "#ffffff" → "rgb(255, 255, 255)" ili ilingane na computed style */
function normStyle(v) {
  const x = norm(v);
  const h = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(x);
  if (!h) return x.replace(/^rgba\((\d+), (\d+), (\d+), 1\)$/, "rgb($1, $2, $3)");
  const hex = h[1].length === 3 ? h[1].split("").map((c) => c + c).join("") : h[1];
  return `rgb(${parseInt(hex.slice(0, 2), 16)}, ${parseInt(hex.slice(2, 4), 16)}, ${parseInt(hex.slice(4, 6), 16)})`;
}

/** Sehemu moja ya check kwenye ukurasa mmoja (route × viewport) → { ok: true|false|null(ERROR), detail } */
async function evalCheckPart(page, c, pageInfo) {
  const where = `${pageInfo.route} @${pageInfo.vp}`;
  if (pageInfo.status >= 400 || pageInfo.status === 0) return { ok: false, detail: `${where}: route answered HTTP ${pageInfo.status}` };
  const sel = String(c.selector || "");
  const count = async () => page.evaluate((s) => { try { return { n: document.querySelectorAll(s).length }; } catch (e) { return { err: String(e && e.message || e).split("\n")[0] }; } }, sel);
  switch (c.type) {
    case "dom_exists": {
      const r = await count();
      if (r.err) return { ok: null, detail: `${where}: bad selector "${sel}": ${r.err}` };
      return { ok: r.n > 0, detail: `${where}: "${sel}" matched ${r.n}` };
    }
    case "computed_style": {
      const prop = String(c.property || "");
      const r = await page.evaluate(([s, p]) => {
        try { return { vals: [...document.querySelectorAll(s)].slice(0, 20).map((el) => getComputedStyle(el).getPropertyValue(p)) }; }
        catch (e) { return { err: String(e && e.message || e).split("\n")[0] }; }
      }, [sel, prop]);
      if (r.err) return { ok: null, detail: `${where}: bad selector "${sel}": ${r.err}` };
      if (!r.vals.length) return { ok: false, detail: `${where}: "${sel}" matched 0 elements` };
      const got = r.vals.map(normStyle);
      const shown = [...new Set(r.vals.map((v) => v.trim()))].slice(0, 3).join(" | ");
      if (c.expected !== undefined && c.expected !== "") {
        const want = normStyle(c.expected);
        const bad = got.filter((v) => v !== want).length;
        return { ok: bad === 0, detail: `${where}: ${prop} of "${sel}" = ${shown} (expected ${c.expected}; ${bad}/${got.length} differ)` };
      }
      if (c.forbidden === undefined || c.forbidden === "") return { ok: null, detail: `${where}: computed_style needs "expected" or "forbidden"` };
      const forb = normStyle(c.forbidden);
      const hit = got.filter((v) => v === forb).length;
      return { ok: hit === 0, detail: `${where}: ${prop} of "${sel}" = ${shown} (forbidden ${c.forbidden}; ${hit}/${got.length} match it)` };
    }
    case "no_horizontal_overflow": {
      const r = await page.evaluate(() => { const de = document.documentElement; const sw = Math.max(de.scrollWidth, document.body ? document.body.scrollWidth : 0); return { sw, cw: de.clientWidth }; });
      return { ok: r.sw <= r.cw, detail: `${where}: scrollWidth ${r.sw} vs clientWidth ${r.cw}${r.sw > r.cw ? ` (overflow ${r.sw - r.cw}px)` : ""}` };
    }
    case "console_clean":
      return { ok: pageInfo.errors.length === 0, detail: `${where}: ${pageInfo.errors.length} console/page/request errors${pageInfo.errors.length ? ` — ${pageInfo.errors.slice(0, 2).join(" ; ").slice(0, 300)}` : ""}` };
    case "contrast_min":
    case "touch_target_min": {
      const d = await page.evaluate(collectDomMetrics, { keySelectors: [sel], generic: [], max: 500 });
      const bad = d.problems.find((x) => x.startsWith("invalid keySelector"));
      if (bad) return { ok: null, detail: `${where}: bad selector "${sel}"` };
      const vis = d.elements.filter((e) => e.visible);
      if (c.type === "contrast_min") {
        const min = Number(c.min);
        const txt = vis.filter((e) => e.hasText);
        if (!txt.length) return { ok: false, detail: `${where}: "${sel}" has no visible text element (matched ${d.elements.length})` };
        const low = txt.filter((e) => e.contrastRatio < min);
        const worst = txt.reduce((a, e) => (e.contrastRatio < a.contrastRatio ? e : a), txt[0]);
        return { ok: low.length === 0, detail: `${where}: "${sel}" ${txt.length} text elements, min contrast ${worst.contrastRatio} (${worst.color} on ${worst.backgroundColor}) vs required ${min}; ${low.length} below` };
      }
      const px = Number(c.px ?? c.minPx);
      if (!vis.length) return { ok: false, detail: `${where}: "${sel}" has no visible element (matched ${d.elements.length})` };
      const small = vis.filter((e) => e.box.w < px || e.box.h < px);
      const s0 = small[0] || vis.reduce((a, e) => (Math.min(e.box.w, e.box.h) < Math.min(a.box.w, a.box.h) ? e : a), vis[0]);
      return { ok: small.length === 0, detail: `${where}: "${sel}" ${vis.length} visible, smallest ${s0.box.w}×${s0.box.h} vs required ${px}×${px}; ${small.length} too small` };
    }
    default:
      return { ok: null, detail: `not a browser check: ${c.type}` };
  }
}

/** Checks zote za browser: zinapangwa kwa ukurasa (route × viewport) ili kila ukurasa ufunguliwe mara moja. */
async function runBrowserChecks(browser, target, checks) {
  const pages = new Map();
  const parts = new Map(checks.map((c, i) => [i, []]));
  checks.forEach((c, i) => {
    if (!BROWSER_CHECK_TYPES.has(c.type)) { parts.get(i).push({ ok: null, detail: `not a browser check: ${c.type}` }); return; }
    const routes = Array.isArray(c.routes) && c.routes.length ? c.routes : [c.route || "/"];
    const vps = Array.isArray(c.viewports) && c.viewports.length ? c.viewports : c.viewport ? [c.viewport] : c.type === "no_horizontal_overflow" ? DEFAULT_VIEWPORTS : [CHECK_DEFAULT_VIEWPORT];
    for (const route of routes) for (const vp of vps) {
      const k = `${route}@${vp}`;
      if (!pages.has(k)) pages.set(k, { route: String(route), vp: String(vp), items: [] });
      pages.get(k).items.push(i);
    }
  });
  for (const pg of pages.values()) {
    const vp = parseViewport(pg.vp);
    if (!vp) { for (const i of pg.items) parts.get(i).push({ ok: null, detail: `bad viewport "${pg.vp}" (use WIDTHxHEIGHT)` }); continue; }
    const ctx = await browser.newContext({ viewport: vp, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on("console", (m) => { if (m.type() === "error") errors.push(`console: ${m.text().slice(0, 200)}`); });
    page.on("pageerror", (e) => errors.push(`pageerror: ${String(e?.message || e).slice(0, 200)}`));
    page.on("requestfailed", (q) => { const why = q.failure()?.errorText || "failed"; if (!/ERR_ABORTED/i.test(why)) errors.push(`failed request: ${q.url().slice(0, 150)} — ${why}`); });
    page.on("response", (s) => { if (s.status() >= 400 && s.request().resourceType() !== "document") errors.push(`HTTP ${s.status()}: ${s.url().slice(0, 150)}`); });
    try {
      const resp = await page.goto(target + pg.route, { waitUntil: "networkidle", timeout: 45_000 });
      await page.evaluate(() => (document.fonts ? document.fonts.ready.then(() => true) : true)).catch(() => {});
      const info = { route: pg.route, vp: pg.vp, status: resp ? resp.status() : 0, errors };
      for (const i of pg.items) {
        try { parts.get(i).push(await evalCheckPart(page, checks[i], info)); }
        catch (e) { parts.get(i).push({ ok: null, detail: `${pg.route} @${pg.vp}: ${String(e?.message || e).split("\n")[0].slice(0, 200)}` }); }
      }
    } catch (e) {
      for (const i of pg.items) parts.get(i).push({ ok: null, detail: `${pg.route} @${pg.vp}: page failed: ${String(e?.message || e).split("\n")[0].slice(0, 200)}` });
    } finally { await ctx.close().catch(() => {}); }
  }
  return checks.map((c, i) => {
    const ps = parts.get(i);
    const result = !ps.length ? "ERROR" : ps.some((p) => p.ok === null) ? "ERROR" : ps.some((p) => p.ok === false) ? "FAIL" : "PASS";
    const shown = (result === "PASS" ? ps : ps.filter((p) => p.ok !== true));
    return { id: String(c.id || `check-${i + 1}`), type: String(c.type), result, detail: (shown.map((p) => p.detail).join(" · ") || "no result").slice(0, 900) };
  });
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
  const keySelectors = (Array.isArray(cfg.keySelectors) ? cfg.keySelectors : []).map((x) => String(x).trim()).filter(Boolean);
  const domMax = Number.isInteger(cfg.domMaxElements) && cfg.domMaxElements > 0 ? Math.min(cfg.domMaxElements, DOM_MAX_ELEMENTS) : DOM_MAX_ELEMENTS;
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
    if (cfg.mode === "checks") { // TASK 21: hakuna screenshots — checks tu
      manifest.checks = await runBrowserChecks(browser, target, Array.isArray(cfg.checks) ? cfg.checks : []);
      return;
    }
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
            // TASK 20: DOM metrics KABLA ya screenshot — full-page capture inabadilisha layout kwa ~1px baadaye (T4)
            let dom = null, domErr = "";
            try { dom = await page.evaluate(collectDomMetrics, { keySelectors, generic: DOM_GENERIC_SELECTORS, max: domMax }); }
            catch (e) { domErr = String(e?.message || e).split("\n")[0].slice(0, 200); }
            await page.screenshot({ path: file, fullPage: true });
            manifest.screenshots.push({ id, route, viewport: vpName, state: st.name, path: path.relative(cwd, file), url: "" });
            try {
              if (!dom) throw new Error(domErr || "no result");
              const domFile = path.join(outDir, `${id}.dom.json`);
              fs.writeFileSync(domFile, JSON.stringify({ screenshotId: id, route, viewport: vpName, state: st.name, generatedAt: new Date().toISOString(), ...dom }, null, 2));
              manifest.domMetrics.push({ screenshotId: id, path: path.relative(cwd, domFile), url: "", summary: domSummary(dom) });
            } catch (e) {
              manifest.errors.push({ kind: "dom", route, viewport: vpName, state: st.name, detail: `${id}: DOM metrics failed: ${String(e?.message || e).split("\n")[0].slice(0, 200)}` });
            }
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
    if (cfg.mode === "checks") console.log(`xmd-evidence checks: ${manifest.checks.filter((c) => c.result === "PASS").length}/${manifest.checks.length} PASS · errors ${manifest.errors.length}`);
    else console.log(`xmd-evidence: ${manifest.screenshots.length} screenshots · dom ${manifest.domMetrics.length} · errors ${manifest.errors.length} · console ${manifest.consoleErrors.length} → ${path.relative(cwd, outDir)}/manifest.json`);
    process.exit(code);
  }
}

main();
