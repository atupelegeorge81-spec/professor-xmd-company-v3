// TASK 25: pembejeo za XMD_TEST_FIX_INPUT — repo ndogo `xmdtest-fix` + plan + COs + defects + ledger (runs R1..R4)
import fs from "node:fs";
const files = {
  "package.json": JSON.stringify({ name: "xmdtest-fix", private: true, version: "0.0.1", scripts: { build: "node scripts/build.mjs" } }, null, 2) + "\n",
  "scripts/build.mjs": `import fs from "node:fs";\nconst html = fs.readFileSync("index.html", "utf8");\nconst css = fs.readFileSync("src/styles.css", "utf8");\nif (!html.includes('href="/src/styles.css"')) { console.error("index.html must link /src/styles.css"); process.exit(1); }\nconst open = (css.match(/{/g) || []).length, close = (css.match(/}/g) || []).length;\nif (open !== close) { console.error("styles.css: unbalanced braces"); process.exit(1); }\nconsole.log("build ok: " + open + " css rules");\n`,
  "index.html": `<!doctype html>\n<html lang="en">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>xmdtest-fix</title>\n  <link rel="icon" href="data:,">\n  <link rel="stylesheet" href="/src/styles.css">\n</head>\n<body>\n  <main>\n    <h1>xmdtest-fix</h1>\n    <p class="lead">Tiny repo for the fix-round test.</p>\n  </main>\n</body>\n</html>\n`,
  "src/styles.css": `body {\n  margin: 0;\n  background: #0B0C10;\n  color: #E5E7EB;\n  font-family: Inter, system-ui, sans-serif;\n}\n\nmain {\n  padding: 24px;\n  max-width: 720px;\n}\n\nh1 {\n  color: #111111;\n  font-size: 32px;\n}\n`,
  "README.md": "# xmdtest-fix\n\nTiny static site used by the XMD fix-round test (task 25).\n",
};
const planMarkdown = `# M1 plan — xmdtest-fix (tiny static site)\n\n## 4 Commands\nBuild Command: \`npm run build\`\nTest Command: none\nStart Command: \`python3 -m http.server 4173 --bind 127.0.0.1\`\n\n## 7 Screenshot matrix\n- route: / · states: default · viewports: 375x667, 768x1024, 1280x800\n`;
const ledger = [
  { agenda_index: 1, agenda_item: "Typography", status: "LOCKED", decision_summary: "Headings and body use Inter / system sans-serif ONLY. Serif fonts are forbidden everywhere." },
  { agenda_index: 2, agenda_item: "Palette", status: "LOCKED", decision_summary: "Dark background #0B0C10; body text #E5E7EB; headings warm off-white #F2F0EB." },
];
const defects = [
  { id: "D-001", milestoneId: "M1", foundInRound: 0, reportedBy: ["designer", "frontend"], area: "typography", severity: "major", title: "h1 is near-invisible (#111111 on #0B0C10)", evidence: ["S-001", "S-001 dom: h1 color=rgb(17, 17, 17)"], expected: "A2: headings #F2F0EB", actual: "h1 color #111111", status: "OPEN", attempts: 0, history: [] },
];
const CO1 = {
  id: "CO-001", defectIds: ["D-001"], attempt: 1, priority: 1,
  location: { files: ["src/styles.css"], route: "/", selector: "h1" },
  current: "In src/styles.css the h1 rule sets color: #111111 — the heading is almost invisible on the #0B0C10 background.",
  desired: "Change h1 color to #F2F0EB in src/styles.css (ledger A2). Change nothing else.",
  visionNote: "The heading must read as warm off-white on the dark page, like a premium editorial title.",
  acceptance: [{ id: "h1-color", type: "computed_style", route: "/", viewport: "1280x800", selector: "h1", property: "color", expected: "#F2F0EB" }],
  mode: "standard",
};
const CO2 = {
  id: "CO-002", defectIds: [], decisionIds: ["R-M1-0/P-01"], attempt: 1, priority: 2,
  location: { files: ["src/styles.css"], route: "/", selector: "h1" },
  current: "h1 uses the Inter / system sans-serif stack.",
  desired: "Change the h1 font-family to Georgia, 'Times New Roman', serif for an editorial look.",
  visionNote: "An editorial serif headline.",
  acceptance: [{ id: "h1-serif", type: "computed_style", route: "/", viewport: "1280x800", selector: "h1", property: "font-family", expected: "Georgia, \"Times New Roman\", serif" }],
  mode: "standard",
};
const base = { milestoneId: "M1", planMarkdown, files, ledger, defects };
const w = (n, cos) => fs.writeFileSync(`/home/user/xmdtest/t25/${n}.json`, JSON.stringify({ ...base, changeOrders: cos }, null, 2));
w("inputR1", [CO1, CO2]); // T1 + T4
w("inputR2", [CO1, CO2]); // T3 (note: README imebadilishwa bila kutajwa) + T4 end-to-end baada ya fix ya verdict
w("inputR3", [CO1]);      // T2 (XMD_TEST_FIX_NOOP_M1)
w("inputR4", [CO1]);      // T5 (goal off + note: usiandike receipts)
fs.writeFileSync("/home/user/xmdtest/t25/brief.json", JSON.stringify({ project: "xmdtest-fix — tiny static site: one page with a heading and a lead paragraph on a dark background. Agenda MBILI tu: (1) typography, (2) palette.", force: true }));
console.log("ok");
