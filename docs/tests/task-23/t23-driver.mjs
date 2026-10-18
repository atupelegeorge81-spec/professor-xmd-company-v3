// TASK 23 driver: node t23.mjs <sandboxId> [phase]  → reviewers HALISI (Gemini Flash vision via broker) juu ya screenshots HALISI
// phase: all (default) | kivuli | deployed
import fs from "node:fs";
import path from "node:path";
import { createJiti } from "/home/user/xmd-home/professor-xmd-company/node_modules/jiti/lib/jiti.mjs";
const REPO = "/home/user/xmd-home/professor-xmd-company";
for (const l of fs.readFileSync(`${REPO}/.env.local`, "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const OUT = "/home/user/.cache/t23"; fs.mkdirSync(OUT, { recursive: true });
const phase = process.argv[3] || "all";

// ── kipimo cha REQUEST halisi: kila wito wa LLM → idadi ya image parts ndani ya body inayotumwa ──
const reqLog = [];
const origFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  try {
    const url = String(input?.url || input);
    if (/chat\/completions/.test(url) && init?.body) {
      const b = JSON.parse(String(init.body));
      const parts = (b.messages || []).flatMap((m) => (Array.isArray(m.content) ? m.content : [{ type: "text" }]));
      const sys = String((b.messages || [])[0]?.content || "");
      const who = /You are (\w+)/.exec(sys)?.[1] || "?";
      const imgs = parts.filter((p) => p.type === "image_url");
      reqLog.push({ at: new Date().toISOString(), host: new URL(url).host, model: b.model, who, messages: (b.messages || []).length, textParts: parts.filter((p) => p.type === "text").length, imageParts: imgs.length, imageBytes: imgs.reduce((s, p) => s + Math.round(String(p.image_url?.url || "").length * 0.75), 0), reasoning_effort: b.reasoning_effort ?? null, bodyChars: String(init.body).length });
      console.log(`[request] ${who} → ${b.model} · parts text ${reqLog.at(-1).textParts} + image ${imgs.length} (${Math.round(reqLog.at(-1).imageBytes / 1024)} KB) · reasoning_effort=${b.reasoning_effort}`);
    }
  } catch { /* kipimo hakivunji wito */ }
  return origFetch(input, init);
};

const jiti = createJiti(import.meta.url, { alias: { "@": `${REPO}/src` } });
const RV = await jiti.import(`${REPO}/src/lib/milestone/review.ts`);
const { captureEvidence } = await jiti.import(`${REPO}/src/lib/cu/evidence.ts`);
const { runChecks } = await jiti.import(`${REPO}/src/lib/milestone/checks.ts`);
const { __t19 } = await jiti.import(`${REPO}/src/lib/cu/engine.ts`);
const { Sandbox } = await import(`${REPO}/node_modules/e2b/dist/index.mjs`);
const sbx = await Sandbox.connect(process.argv[2], { apiKey: process.env.E2B_API_KEY });
const FIX = `${REPO}/tests/fixtures`;
const evScript = fs.readFileSync(`${REPO}/cu/xmd-evidence.mjs`, "utf8");
const urls = [];
const upload = async (bytes, name) => { const u = await __t19.evidenceUploader(bytes, name.replace(/^xmd-/, "xmd-xmdtest-")); urls.push(u); return u; };
const log = (lvl, t) => console.log(`[${lvl}] ${t}`);
const saveUploads = () => fs.writeFileSync(`${OUT}/uploads-${phase}.txt`, urls.map((u) => u.split("/").pop()).join(","));

function ctxFrom(file, pack) {
  const c = JSON.parse(fs.readFileSync(file, "utf8"));
  const map = { version: 1, sessionId: "xmdtest-t23", totalAgendas: Math.max(...c.map.milestones.map((m) => m.agendas.to)), generatedBy: "xmdtest", usedFallback: false, milestones: c.map.milestones.map((m) => ({ rationale: "", ...m })) };
  pack.gitDiffSummary = c.gitDiffSummary || pack.gitDiffSummary;
  return {
    ocb: { project: c.project, map, milestoneId: "M1", round: null, counts: { lockedDecisions: c.ledger.length, milestonesDone: [], openDefects: 0, waivers: 0 } },
    roundHeader: { milestoneId: "M1", round: 0, maxRounds: 10, closedDefects: 0, open: [], waivers: 0, roundsLeft: 10 },
    miniReports: c.miniReports, ledger: c.ledger, planMarkdown: "", buildReport: c.buildReport, defects: [], baselines: [],
  };
}

// T5: evidence "S-00x dom: <selector> <prop>=<value>" → linganisha na dom.json halisi
async function metricCitations(run, pack) {
  const out = [];
  if (!run.findings) return out;
  const doms = {};
  for (const d of pack.domMetrics) doms[d.screenshotId] = await (await origFetch(d.url)).json();
  const items = [...run.findings.defects, ...run.findings.proposals].flatMap((f) => f.evidence.map((e) => ({ title: f.title, e })));
  for (const { title, e } of items) {
    const m = /^(S-\d{3,})\s+dom:\s*(.+?)\s+([A-Za-z]+)\s*=\s*(.+?)\s*$/.exec(e);
    if (!m) continue;
    const [, sid, selector, prop, valRaw] = m;
    const d = doms[sid];
    if (!d) { out.push({ title, e, match: false, why: "no dom.json" }); continue; }
    const el = d.elements.find((x) => x.selector === selector);
    const boxKey = { x: "x", y: "y", width: "w", height: "h" }[prop];
    let actual;
    if (el) actual = boxKey ? el.box?.[boxKey] : el[prop];
    if (actual === undefined && d.page[prop] !== undefined) actual = d.page[prop];
    if (prop === "fontFamily" && actual !== undefined) actual = String(actual).split(",")[0].replace(/["']/g, "").trim(); // domLines inaonyesha familia ya kwanza
    const norm = (v) => String(v).replace(/px$/, "").replace(/\s+/g, "").toLowerCase();
    const match = actual !== undefined && (norm(actual) === norm(valRaw) || (Number.isFinite(+norm(actual)) && Math.abs(+norm(actual) - parseFloat(norm(valRaw))) < 0.01));
    out.push({ title, e, actual: actual === undefined ? "(not found)" : actual, match });
  }
  return out;
}

const KNOWN = {
  allCaps: /all[- ]?caps|uppercase|text-transform/i,
  monospace: /monospace|courier/i,
  accentOverused: /(accent|#e11d48|crimson|red)[^.]{0,160}(overus|excess|everywhere|too (much|many|heav)|reserved|only (for|on) (the )?(primary )?cta|dilut|saturat|loses? (its )?(power|impact))|(overus|excess|everywhere|dilut)[^.]{0,120}(accent|#e11d48|red)/i,
  languageToggle: /lang(uage)?[- ]?(toggle|switch|selector)|sw\s*\/\s*en|lang-toggle|bilingual/i,
  identicalImages: /(identical|same|repeated|duplicate|placeholder|one image|single image)[^.]{0,60}(image|photo|picture|svg|tee\.svg)|(image|photo|picture)s?[^.]{0,60}(identical|the same|repeated|duplicat|placeholder)/i,
};
function knownIssues(run) {
  const found = {};
  if (!run.findings) return found;
  const fs_ = [...run.findings.defects.map((d) => ({ k: "defect", t: `${d.title}. ${d.actual}. ${d.expected}` })), ...run.findings.proposals.map((p) => ({ k: "proposal", t: `${p.title}. ${p.detail}` }))];
  for (const [key, re] of Object.entries(KNOWN)) { const hit = fs_.find((f) => re.test(f.t)); if (hit) found[key] = `${hit.k}: ${hit.t.slice(0, 140)}`; }
  return found;
}

// T2: "grep" — vipande vya jibu A (visivyotoka context ya pamoja) ndani ya prompt B
function grepIndependence(r0, tag) {
  const res = {};
  for (const [a, b] of [["designer", "frontend"], ["frontend", "designer"]]) {
    const A = r0[a], B = r0[b];
    fs.writeFileSync(`${OUT}/${tag}-prompt-${b}.txt`, B.promptText);
    const frags = RV.leakedFragments(A.raw, A.raw, A.promptText, 60, 30); // vipande vyote vya A visivyo kwenye prompt yake (maandishi MAPYA ya A)
    fs.writeFileSync(`${OUT}/${tag}-frags-${a}.txt`, frags.join("\n"));
    let count = 0;
    for (const f of frags) if (B.promptText.replace(/\s+/g, " ").includes(f)) count++;
    res[`${a}→prompt(${b})`] = { ownFragments: frags.length, foundInOtherPrompt: count };
  }
  return res;
}

const summaryOf = (r) => ({ valid: r.valid, attempts: r.meta.attempts, errors: r.meta.errors.slice(0, 5), model: r.meta.model, tier: r.meta.tier, imageParts: r.meta.imageParts, promptChars: r.meta.promptChars, hash: r.meta.promptHash.slice(0, 16), ms: r.meta.ms, defects: r.findings?.defects.length, proposals: r.findings?.proposals.length, screenshots: r.findings?.screenshots.length });
const result = {};

if (phase === "all" || phase === "deployed") {
  // ── T1: site ya CEO (deployed) ──
  const ws = "/home/user/xmdtest-t23d";
  await sbx.commands.run(`rm -rf ${ws} && mkdir -p ${ws}`);
  const BASE = "https://professor-xmd-professorcj-2c4d4efe.koyeb.app";
  const ev = await captureEvidence(sbx, { milestoneId: "M1", round: 0, planMarkdown: fs.readFileSync(`${FIX}/PLAN-T23-deployed.md`, "utf8"), script: evScript, ws, sessionId: "xmdtest-t23d", base: BASE }, upload);
  saveUploads();
  console.log(`deployed evidence: ${ev.pack.screenshots.map((s) => `${s.id} ${s.route}@${s.viewport}`).join(", ")} · dom ${ev.pack.domMetrics.length} · errors ${JSON.stringify(ev.pack.errors).slice(0, 300)}`);
  const { results } = await runChecks([
    { id: "T23-live", type: "http", url: `${BASE}/api/live`, status: 200 },
    { id: "T23-touch-mobile", type: "touch_target_min", route: "/", selector: "button", px: 44, viewport: "375x667" },
    { id: "T23-overflow", type: "no_horizontal_overflow", routes: ["/"] },
  ], { sbx, ws, script: evScript, base: BASE, evidence: ev.pack, tag: "t23d" });
  ev.pack.checks = results;
  console.log("checks:", results.map((r) => `${r.id} ${r.result}`).join(" · "));
  const ctx = ctxFrom(`${FIX}/t23-deployed-context.json`, ev.pack);
  ctx.planMarkdown = fs.readFileSync(`${FIX}/PLAN-T23-deployed.md`, "utf8");
  const r0 = await RV.reviewRound0(ev.pack, ctx, { log });
  fs.writeFileSync(`${OUT}/deployed-pack.json`, JSON.stringify(ev.pack, null, 2));
  for (const k of ["designer", "frontend"]) fs.writeFileSync(`${OUT}/deployed-${k}.json`, JSON.stringify({ meta: r0[k].meta, findings: r0[k].findings, raw: r0[k].findings ? undefined : r0[k].raw }, null, 2));
  const evidenceIdsExist = ["designer", "frontend"].every((k) => (r0[k].findings?.defects || []).every((d) => d.evidence.every((e) => !("error" in RV.classifyEvidence(e, ev.pack)))));
  result.T1 = { designer: summaryOf(r0.designer), frontend: summaryOf(r0.frontend), evidenceIdsExist };
  result.T2_deployed = { independence: { hashesDiffer: r0.independence.hashesDiffer, leaks: [r0.independence.designerLeakIntoFrontend.length, r0.independence.frontendLeakIntoDesigner.length], ok: r0.independence.ok }, grep: grepIndependence(r0, "deployed") };
  result.T5_deployed = { designer: await metricCitations(r0.designer, ev.pack), frontend: await metricCitations(r0.frontend, ev.pack) };
  console.log("T1", JSON.stringify(result.T1));
}

if (phase === "all" || phase === "kivuli") {
  // ── T3/T4: ukurasa wa KIVULI-like (local, sandbox) ──
  const ws = "/home/user/xmdtest-t23k";
  await sbx.commands.run(`rm -rf ${ws} && mkdir -p ${ws}`);
  for (const f of fs.readdirSync(`${FIX}/t23-kivuli`)) await sbx.files.write(`${ws}/${f}`, fs.readFileSync(`${FIX}/t23-kivuli/${f}`, "utf8"));
  const plan = fs.readFileSync(`${FIX}/PLAN-T23-kivuli.md`, "utf8");
  const ev = await captureEvidence(sbx, { milestoneId: "M1", round: 0, planMarkdown: plan, script: evScript, ws, sessionId: "xmdtest-t23k" }, upload);
  saveUploads();
  console.log(`kivuli evidence: ${ev.pack.screenshots.map((s) => `${s.id} ${s.route}@${s.viewport}`).join(", ")} · dom ${ev.pack.domMetrics.length} · errors ${ev.pack.errors.length}`);
  const { results } = await runChecks([
    { id: "M1-S1-a", type: "dom_exists", route: "/", selector: "button#lang-toggle" },
    { id: "M1-S1-b", type: "contrast_min", route: "/", selector: ".hero p, .card h3, .price", min: 4.5 },
    { id: "M1-S3-a", type: "touch_target_min", route: "/", selector: ".btn", px: 44 },
    { id: "M1-S3-b", type: "no_horizontal_overflow", routes: ["/"] },
  ], { sbx, ws, script: evScript, startCommand: "python3 -m http.server 4173 --bind 127.0.0.1", evidence: ev.pack, tag: "t23k" });
  ev.pack.checks = results;
  console.log("checks:", results.map((r) => `${r.id} ${r.result}`).join(" · "));
  const ctx = ctxFrom(`${FIX}/t23-kivuli-context.json`, ev.pack);
  ctx.planMarkdown = plan;
  const r0 = await RV.reviewRound0(ev.pack, ctx, { log });
  fs.writeFileSync(`${OUT}/kivuli-pack.json`, JSON.stringify(ev.pack, null, 2));
  for (const k of ["designer", "frontend"]) fs.writeFileSync(`${OUT}/kivuli-${k}.json`, JSON.stringify({ meta: r0[k].meta, findings: r0[k].findings, raw: r0[k].findings ? undefined : r0[k].raw }, null, 2));
  const evidenceIdsExist = ["designer", "frontend"].every((k) => (r0[k].findings?.defects || []).every((d) => d.evidence.every((e) => !("error" in RV.classifyEvidence(e, ev.pack)))));
  result.T1_kivuli = { designer: summaryOf(r0.designer), frontend: summaryOf(r0.frontend), evidenceIdsExist };
  result.T2_kivuli = { independence: { hashesDiffer: r0.independence.hashesDiffer, leaks: [r0.independence.designerLeakIntoFrontend.length, r0.independence.frontendLeakIntoDesigner.length], ok: r0.independence.ok }, grep: grepIndependence(r0, "kivuli") };
  const kd = knownIssues(r0.designer), kf = knownIssues(r0.frontend);
  const union = [...new Set([...Object.keys(kd), ...Object.keys(kf)])];
  result.T3 = { designer: kd, frontend: kf, union, count: union.length, of: Object.keys(KNOWN).length };
  result.T5_kivuli = { designer: await metricCitations(r0.designer, ev.pack), frontend: await metricCitations(r0.frontend, ev.pack) };

  // T4: Designer bila picha (prompt ileile ila image parts 0) → linganisha
  const noImg = await RV.analyse("designer", ev.pack, ctx, { log, images: false });
  fs.writeFileSync(`${OUT}/kivuli-designer-noimages.json`, JSON.stringify({ meta: noImg.meta, findings: noImg.findings }, null, 2));
  const visualClaims = (run) => {
    if (!run.findings) return null;
    const all = [...run.findings.defects, ...run.findings.proposals];
    const shotOnly = all.filter((f) => f.evidence.some((e) => /^S-\d{3,}\s*$/.test(e.trim())) && !f.evidence.some((e) => /dom:/.test(e)));
    const pictureWords = /\b(looks?|visual(ly)?|feel|imagery|photo(graph)?s?|picture|vibe|composition|whitespace|cluttered|busy)\b/i;
    return { findings: all.length, screenshotOnlyEvidence: shotOnly.length, pictureWording: all.filter((f) => pictureWords.test(`${f.title} ${f.actual || f.detail || ""}`)).length, identicalImagesFound: !!knownIssues(run).identicalImages, known: Object.keys(knownIssues(run)) };
  };
  result.T4 = { withImages: { imageParts: r0.designer.meta.imageParts, ...visualClaims(r0.designer) }, withoutImages: { imageParts: noImg.meta.imageParts, valid: noImg.valid, ...visualClaims(noImg) }, noImagesNotes: noImg.findings?.notes?.slice(0, 400) };
}

result.requests = reqLog;
fs.writeFileSync(`${OUT}/result-${phase}.json`, JSON.stringify(result, null, 2));
saveUploads();
console.log("RESULT", JSON.stringify({ ...result, requests: reqLog.map((r) => `${r.who}:${r.model}:img${r.imageParts}`) }, null, 1).slice(0, 6000));
process.exit(0);
