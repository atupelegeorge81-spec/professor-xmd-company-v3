// T24: ingizo la XMD_TEST_REVIEW_INPUT — A = T23 deployed findings (T1/T4/T5), B = kivuli (sehemu) + proposals zilizotengenezwa (T2/T3)
import fs from "node:fs";
const R = "/home/user/xmd-home/professor-xmd-company";
const J = (p) => JSON.parse(fs.readFileSync(`${R}/${p}`, "utf8"));
const fnd = (p) => { const d = J(p); return d.findings || d; };
const shot = (id, route, viewport) => ({ id, route, viewport, state: "default", path: `evidence/M1/R0/${id}.png`, url: "" });
// A — CEO site (deployed), checks halisi za T23 (task-23.md: T23-live PASS · T23-touch-mobile FAIL · T23-overflow PASS)
const ca = J("tests/fixtures/t23-deployed-context.json");
const A = {
  milestoneId: "M1",
  pack: { milestoneId: "M1", round: 0, screenshots: [shot("S-001", "/", "375x667"), shot("S-002", "/", "768x1024"), shot("S-003", "/", "1280x800"), shot("S-004", "/board", "375x667")],
    domMetrics: [], commands: [], gitDiffSummary: ca.gitDiffSummary || "", consoleErrors: [], errors: [], regression: [],
    checks: [
      { id: "T23-live", type: "http", result: "PASS", detail: "GET /api/live → 200" },
      { id: "T23-touch-mobile", type: "touch_target_min", result: "FAIL", detail: "button @375x667: 'Open menu' 36x36, 'Convene board' 142x36 < 44px" },
      { id: "T23-overflow", type: "no_horizontal_overflow", result: "PASS", detail: "/ @375x667,768x1024,1280x800 overflow 0px" },
    ] },
  findings: { designer: fnd("docs/tests/task-23/deployed-designer.json"), frontend: fnd("docs/tests/task-23/deployed-frontend.json") },
  ledger: ca.ledger, buildReport: ca.buildReport, planMarkdown: fs.readFileSync(`${R}/tests/fixtures/PLAN-T23-deployed.md`, "utf8"),
};
fs.writeFileSync("/home/user/xmdtest/t24/inputA.json", JSON.stringify(A));
fs.writeFileSync("/home/user/xmdtest/t24/briefA.json", JSON.stringify({ project: `xmdtest-t24a — ${ca.project.summary} Agenda MBILI tu: (1) dashboard shell & accessibility, (2) visual language.`, force: true }));

// B — KIVULI: defects 3 kwa kila reviewer + proposals zilizotengenezwa (T2: ya mmoja vs ya wote wawili · T3: serif dhidi ya A1 Inter)
const ck = J("tests/fixtures/t23-kivuli-context.json");
const kd = fnd("docs/tests/task-23/kivuli-designer.json"), kf = fnd("docs/tests/task-23/kivuli-frontend.json");
const pick = (f, re) => f.defects.filter((d) => re.test(d.title));
const sticky = { title: "Sticky mobile WhatsApp order bar", detail: "At 375px add a fixed bottom bar with one primary CTA 'Agiza kwa WhatsApp' (height ≥48px, accent #E11D48 as a primary CTA button, Inter, sentence case) that opens wa.me with the product name; hidden at ≥768px where the card buttons are visible.", rationale: "The brief sells through WhatsApp ordering; on a phone the order action scrolls away under 6 cards.", evidence: ["S-001"] };
const B = {
  milestoneId: "M1",
  pack: { milestoneId: "M1", round: 0, screenshots: [shot("S-001", "/", "375x667"), shot("S-002", "/", "768x1024"), shot("S-003", "/", "1280x800")],
    domMetrics: [], commands: [], gitDiffSummary: "index.html | 120 +\nstyles.css | 210 +", consoleErrors: [], errors: [], regression: [],
    checks: [
      { id: "M1-S1-a", type: "dom_exists", result: "FAIL", detail: "button#lang-toggle matched 0" },
      { id: "M1-S1-b", type: "contrast_min", result: "FAIL", detail: ".hero p, .card h3, .price min contrast 3.9 < 4.5" },
      { id: "M1-S3-a", type: "touch_target_min", result: "PASS", detail: ".btn ≥44px" },
      { id: "M1-S3-b", type: "no_horizontal_overflow", result: "PASS", detail: "overflow 0px" },
    ] },
  findings: {
    designer: { ...kd, defects: [...pick(kd, /Courier New/), ...pick(kd, /lang-toggle/), ...pick(kd, /touch targets/)], proposals: [
      { title: "Serif display headings", detail: "Replace Inter on h1/h2 and product names with the serif display font Playfair Display (Google Fonts) for a luxury editorial feel; keep Inter for body text.", rationale: "Premium streetwear brands use serif display type to feel exclusive.", evidence: ["S-003"] },
      { title: "Autoplay hero background video", detail: "Add a 15-second looping 1080p MP4 of Dar es Salaam at night that autoplays muted behind the hero on ALL viewports, including 375px mobile.", rationale: "Movement makes the night-time mood stronger than a static image.", evidence: ["S-001", "S-003"] },
      sticky,
    ] },
    frontend: { ...kf, defects: [...pick(kf, /lang-toggle/), ...pick(kf, /contrast/), ...pick(kf, /touch target/)], proposals: [sticky] },
  },
  ledger: ck.ledger, buildReport: ck.buildReport, planMarkdown: fs.readFileSync(`${R}/tests/fixtures/PLAN-T23-kivuli.md`, "utf8"),
};
fs.writeFileSync("/home/user/xmdtest/t24/inputB.json", JSON.stringify(B));
fs.writeFileSync("/home/user/xmdtest/t24/briefB.json", JSON.stringify({ project: `xmdtest-t24b — ${ck.project.summary} Agenda TATU tu: (1) brand & design system, (2) header & language, (3) product grid.`, force: true }));
console.log("A", A.findings.designer.defects.length, A.findings.frontend.defects.length, A.findings.designer.proposals.length, A.findings.frontend.proposals.length);
console.log("B", B.findings.designer.defects.map((d) => d.title.slice(0, 30)), B.findings.frontend.defects.map((d) => d.title.slice(0, 30)));
