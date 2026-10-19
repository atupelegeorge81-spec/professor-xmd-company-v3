// TASK 26: pembejeo za XMD_TEST_VERIFY_INPUT — site ndogo `xmdtest-site` yenye kasoro 3 zilizopandwa:
//  (1) maandishi UPPERCASE (p.lead text-transform: uppercase) — inavunja A1 (sentence case)
//  (2) toggle ya theme HAIPO kwenye header — inavunja A2 (button#theme-toggle)
//  (3) overflow ya mlalo @375px (.promo-strip width: 640px) — inavunja A3
import fs from "node:fs";
const files = {
  "package.json": JSON.stringify({ name: "xmdtest-site", private: true, version: "0.0.1", scripts: { build: "node scripts/build.mjs" } }, null, 2) + "\n",
  "scripts/build.mjs": `import fs from "node:fs";\nconst html = fs.readFileSync("index.html", "utf8");\nconst css = fs.readFileSync("src/styles.css", "utf8");\nif (!html.includes('href="/src/styles.css"')) { console.error("index.html must link /src/styles.css"); process.exit(1); }\nconst open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;\nif (open !== close) { console.error("styles.css: unbalanced braces"); process.exit(1); }\nconsole.log("build ok: " + open + " css rules");\n`,
  "index.html": `<!doctype html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>xmdtest-site</title>
  <link rel="icon" href="data:,">
  <link rel="stylesheet" href="/src/styles.css">
</head>
<body>
  <header class="site-header">
    <a class="logo" href="/">Kivuli</a>
    <nav class="site-nav">
      <a href="#shop">Shop</a>
      <a href="#story">Story</a>
      <a href="#contact">Contact</a>
    </nav>
  </header>
  <main>
    <section class="hero">
      <h1>Quiet goods for slow mornings</h1>
      <p class="lead">Hand-thrown mugs, linen and small-batch coffee from Dar es Salaam.</p>
      <a class="cta" href="#shop">Browse the shop</a>
    </section>
    <div class="promo-strip">Free delivery in Dar es Salaam on orders over 50,000 TZS</div>
    <section id="shop" class="grid">
      <article class="card"><h2>Mug</h2><p>Stoneware, 300 ml.</p></article>
      <article class="card"><h2>Linen</h2><p>Natural, pre-washed.</p></article>
      <article class="card"><h2>Coffee</h2><p>Kilimanjaro, medium roast.</p></article>
    </section>
  </main>
  <script src="/src/app.js"></script>
</body>
</html>
`,
  "src/app.js": `// theme: html[data-theme] = dark | light\n`,
  "src/styles.css": `:root {
  --bg: #0B0C10;
  --text: #E5E7EB;
  --accent: #F2F0EB;
}
html[data-theme="light"] {
  --bg: #F7F5F0;
  --text: #1F2328;
  --accent: #0B0C10;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: Inter, system-ui, sans-serif;
}

.site-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px 20px;
}

.logo {
  color: var(--accent);
  font-weight: 700;
  text-decoration: none;
}

.site-nav {
  display: flex;
  gap: 16px;
}

.site-nav a {
  color: var(--text);
  text-decoration: none;
}

main {
  padding: 0 20px 40px;
  max-width: 1100px;
  margin: 0 auto;
}

h1 {
  color: var(--accent);
  font-size: 36px;
  line-height: 1.15;
}

.lead {
  font-size: 18px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.cta {
  display: inline-block;
  padding: 12px 20px;
  border: 1px solid var(--accent);
  color: var(--accent);
  text-decoration: none;
}

.promo-strip {
  width: 640px;
  margin: 32px 0;
  padding: 12px 16px;
  background: #1A1C23;
}

.grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
}

.card {
  padding: 16px;
  background: #13151B;
}
`,
  "README.md": "# xmdtest-site\n\nTiny static shop page used by the XMD verification-round test (task 26).\n",
};
const planMarkdown = `# M1 plan — xmdtest-site (tiny static shop page)

## 1 Goal
One static page: header (logo, nav, theme toggle), hero, promo strip, product grid. Dark theme by default.

## 4 Commands
Build Command: \`npm run build\`
Test Command: none
Start Command: \`python3 -m http.server 4173 --bind 127.0.0.1\`

## 7 Screenshot matrix
- route: / · states: default · viewports: 375x667, 768x1024, 1280x800
`;
const ledger = [
  { agenda_index: 1, agenda_item: "Typography", status: "LOCKED", decision_summary: "Inter / system sans-serif only. Sentence case everywhere: NO all-caps text — text-transform: uppercase is forbidden on every element." },
  { agenda_index: 2, agenda_item: "Header", status: "LOCKED", decision_summary: "The header holds the logo (left), the nav, and a theme toggle button at the right end: <button id=\"theme-toggle\" aria-label=\"Toggle theme\"> at least 44x44px that switches html[data-theme] between dark and light." },
  { agenda_index: 3, agenda_item: "Layout", status: "LOCKED", decision_summary: "Mobile first: no horizontal scrolling at 375, 768 or 1280 px. Every block fits the viewport width; content max-width 1100px." },
  { agenda_index: 4, agenda_item: "Palette", status: "LOCKED", decision_summary: "Dark default: background #0B0C10, text #E5E7EB, accent #F2F0EB. Light theme via html[data-theme=light]." },
];
const buildReport = "# M1 build report\n\n## 1 Summary\nStatic page built: header, hero, promo strip, product grid.\n\n## 2 Files\n- index.html\n- src/styles.css\n- src/app.js\n";
const base = { milestoneId: "M1", planMarkdown, files, ledger, buildReport };
const w = (n, extra) => fs.writeFileSync(`/home/user/xmdtest/t26/${n}.json`, JSON.stringify({ ...base, ...extra }, null, 2));

// T2: R0 halisi (reviewers + mjadala + Optimus) → fix → verify … mpaka SIGN_OFF
w("inputT2", {});

// T4: CO mbaya iliyopandwa (inaharibu) → raundi inaongeza defects → revert ya moja kwa moja
const D1 = { id: "D-001", milestoneId: "M1", foundInRound: 0, reportedBy: ["designer", "frontend"], area: "typography", severity: "medium", title: "Lead paragraph is all-caps (text-transform: uppercase)", evidence: ["S-001", "S-001 dom: p.lead textTransform=uppercase"], expected: "A1: sentence case, no uppercase", actual: "p.lead text-transform: uppercase", status: "OPEN", attempts: 0, history: [] };
const DT = { id: "D-002", milestoneId: "M1", foundInRound: 0, reportedBy: ["designer"], area: "header", severity: "major", title: "Theme toggle button is missing from the header", evidence: ["S-001", "S-001 dom: #theme-toggle not found"], expected: "A2: <button id=theme-toggle> at the right end of the header", actual: "no toggle", status: "OPEN", attempts: 0, history: [] };
const DO = { id: "D-003", milestoneId: "M1", foundInRound: 0, reportedBy: ["frontend"], area: "layout", severity: "medium", title: "Promo strip overflows at 375px (width: 640px)", evidence: ["S-001", "S-001 page: scrollWidth=660 clientWidth=375"], expected: "A3: no horizontal scroll at 375", actual: ".promo-strip width 640px", status: "OPEN", attempts: 0, history: [] };
const BAD = {
  id: "CO-001", defectIds: ["D-001"], attempt: 1, priority: 1,
  location: { files: ["src/styles.css"], route: "/", selector: "p.lead" },
  current: "In src/styles.css the .lead rule has text-transform: uppercase. The .site-header rule is a plain flex row.",
  desired: "In src/styles.css: (1) in the .lead rule replace text-transform: uppercase with text-transform: none. (2) Keep the navigation always reachable: in the .site-header rule add position: fixed; top: 0; left: 0; right: 0; z-index: 10; background: #0B0C10. Change nothing else.",
  visionNote: "Calm sentence-case lead copy (A1) and a navigation that stays reachable while scrolling.",
  acceptance: [{ id: "lead-case", type: "computed_style", route: "/", viewport: "1280x800", selector: "p.lead", property: "text-transform", expected: "none" }],
  mode: "concrete",
};
w("inputT4", { changeOrders: [BAD], defects: [D1, DT, DO] });

// T3 (+T5): raundi ya 3 — D-001 imeshajaribiwa mara 2 (attempt 3), D-002 mpya (R2) haina CO ya raundi hii → CONTINUE → Optimus
const D1r = { ...D1, status: "REOPENED", attempts: 2, history: [{ round: 1, result: "CO-001: APPLIED · checks 0P/1F/0E", cause: "ATTEMPTED_WRONG" }, { round: 2, result: "CO-002: APPLIED · checks 0P/1F/0E", cause: "ATTEMPTED_WRONG" }] };
const D2 = { id: "D-002", milestoneId: "M1", foundInRound: 2, reportedBy: ["frontend"], area: "layout", severity: "medium", title: "Promo strip overflows at 375px (width: 640px)", evidence: ["S-001", "S-001 page: scrollWidth=660 clientWidth=375"], expected: "A3: no horizontal scroll at 375", actual: ".promo-strip width 640px", status: "OPEN", attempts: 0, history: [] };
const CO3 = {
  id: "CO-003", defectIds: ["D-001"], attempt: 3, priority: 1,
  location: { files: ["src/styles.css"], route: "/", selector: "p.lead" },
  current: "In src/styles.css the .lead rule has text-transform: uppercase and letter-spacing: 0.08em.",
  desired: "In src/styles.css, in the .lead rule, delete the line text-transform: uppercase; and change letter-spacing: 0.08em to letter-spacing: normal. Change nothing else.",
  visionNote: "Sentence-case lead copy reads calm and premium (ledger A1).",
  acceptance: [{ id: "lead-case", type: "computed_style", route: "/", viewport: "1280x800", selector: "p.lead", property: "text-transform", expected: "none" }],
  mode: "concrete",
};
w("inputT3", { changeOrders: [CO3], defects: [D1r, D2, { ...DT, id: "D-003", foundInRound: 2 }], startRound: 3 });

fs.writeFileSync("/home/user/xmdtest/t26/brief.json", JSON.stringify({ project: "xmdtest-site — tiny static shop page 'Kivuli': header with logo, nav and theme toggle; hero; promo strip; product grid; dark theme. Agenda MBILI tu: (1) typography, (2) header + layout.", force: true }));
console.log("ok");
