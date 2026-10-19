// TASK 27: pembejeo za XMD_TEST_VERIFY_INPUT — `xmdtest-site` SAFI (kasoro 3 za T26 zimeondolewa) + kasoro maalum kwa kila jaribio.
import fs from "node:fs";
const t26 = JSON.parse(fs.readFileSync("/home/user/xmdtest/t26/inputT2.json", "utf8"));
const f0 = { ...t26.files };
f0["index.html"] = f0["index.html"].replace(`    </nav>\n  </header>`, `    </nav>\n    <button id="theme-toggle" aria-label="Toggle theme" type="button">◐</button>\n  </header>`);
f0["src/app.js"] = `// theme: html[data-theme] = dark | light\nconst t = document.getElementById("theme-toggle");\nt.addEventListener("click", () => {\n  const h = document.documentElement;\n  h.dataset.theme = h.dataset.theme === "light" ? "dark" : "light";\n});\n`;
f0["src/styles.css"] = f0["src/styles.css"]
  .replace("  text-transform: uppercase;\n  letter-spacing: 0.08em;\n", "")
  .replace(".promo-strip {\n  width: 640px;", ".promo-strip {\n  max-width: 100%;")
  .replace(".logo {", "#theme-toggle {\n  min-width: 44px;\n  min-height: 44px;\n  background: transparent;\n  border: 1px solid var(--accent);\n  color: var(--accent);\n  font-size: 18px;\n}\n\n.logo {");
f0["README.md"] = "# xmdtest-site\n\nTiny static shop page used by the XMD escalation-ladder test (task 27).\n";
if (/uppercase|640px/.test(f0["src/styles.css"]) || !f0["index.html"].includes("theme-toggle")) throw new Error("clean site failed");
const base = { milestoneId: "M1", planMarkdown: t26.planMarkdown, ledger: t26.ledger, buildReport: t26.buildReport };
const w = (n, files, extra) => fs.writeFileSync(`/home/user/xmdtest/t27/${n}.json`, JSON.stringify({ ...base, files, ...extra }, null, 2));
const D = (o) => ({ milestoneId: "M1", foundInRound: 0, reportedBy: ["designer", "frontend"], evidence: ["S-001"], status: "OPEN", attempts: 0, history: [], ...o });

// ── T1 (+T5): kasoro ambayo marekebisho yake yamezuiwa na kanuni HALISI: A1 (LOCKED) inakataza uppercase na build inaitekeleza
const fT1 = { ...f0, "scripts/build.mjs": f0["scripts/build.mjs"].replace(`console.log("build ok`, `for (const p of ["index.html", "src/styles.css", "src/app.js"]) { if (/uppercase|toUpperCase/i.test(fs.readFileSync(p, "utf8"))) { console.error(p + ": all-caps is forbidden by locked decision A1 (sentence case)"); process.exit(1); } }\nconsole.log("build ok`) };
const NAV = D({ id: "D-001", area: "navigation", severity: "medium", title: "Nav links must be uppercase (CEO brand sheet: 'SHOP · STORY · CONTACT')",
  evidence: ["S-001", "S-001 dom: .site-nav a textTransform=none"], expected: "CEO brand sheet: the three nav links render in capitals — .site-nav a computed text-transform: uppercase", actual: ".site-nav a text-transform: none (sentence case)" });
const NAVCO = { id: "CO-001", defectIds: ["D-001"], attempt: 1, priority: 1, mode: "standard",
  location: { files: ["src/styles.css"], route: "/", selector: ".site-nav a" }, current: ".site-nav a { color; text-decoration } — text-transform: none",
  desired: "In src/styles.css, in the .site-nav a rule, add text-transform: uppercase; letter-spacing: 0.06em; so the nav reads SHOP · STORY · CONTACT as in the CEO brand sheet.",
  visionNote: "A confident capitalised navigation, as on the CEO brand sheet.",
  acceptance: [{ id: "nav-caps", type: "computed_style", route: "/", viewport: "1280x800", selector: ".site-nav a", property: "text-transform", expected: "uppercase" }] };
w("inputT1", fT1, { changeOrders: [NAVCO], defects: [NAV] });
w("inputT5", fT1, { changeOrders: [{ ...NAVCO, id: "CO-004" }], defects: [{ ...NAV, status: "REOPENED", attempts: 3, history: [1, 2, 3].map((r) => ({ round: r, result: `CO-00${r}: BLOCKED · checks 0P/1F/0E`, cause: "BLOCKED: conflicts with locked decision A1 (seeded history)" })) }], startRound: 10, escalate: true });

// ── T2: grid ya bidhaa ngumu (Computer imeshindwa mara 2 — historia iliyopandwa) → attempt 3 = pair patch
const fT2 = { ...f0, "src/styles.css": f0["src/styles.css"]
  .replace("grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));", "grid-template-columns: repeat(3, 280px);")
  .replace(".card {\n  padding: 16px;", ".card {\n  min-width: 280px;\n  padding: 16px;") };
const GRID = D({ id: "D-001", area: "layout", severity: "major", title: "Product grid overflows horizontally at 375px and 768px (fixed 3 × 280px columns + card min-width)",
  evidence: ["S-001", "S-001 page: scrollWidth 896 > 375", "S-002 page: scrollWidth 896 > 768"], expected: "A3: no horizontal scrolling at 375/768/1280; the grid wraps to 1 column on phones and keeps up to 3 columns on desktop",
  actual: ".grid grid-template-columns: repeat(3, 280px); .card min-width: 280px", status: "REOPENED", attempts: 2,
  history: [{ round: 1, result: "CO-001: APPLIED · checks 1P/1F/0E", cause: "ATTEMPTED_WRONG: changed only grid-template-columns, .card min-width still forces 280px (seeded history)" },
    { round: 2, result: "CO-002: APPLIED · checks 1P/1F/0E", cause: "ATTEMPTED_WRONG: used minmax(280px,1fr) — still 280px minimum at 375 (seeded history)" }] });
const GRIDCO = { id: "CO-003", defectIds: ["D-001"], attempt: 3, priority: 1, mode: "standard",
  location: { files: ["src/styles.css"], route: "/", selector: ".grid" }, current: ".grid { grid-template-columns: repeat(3, 280px) } · .card { min-width: 280px }",
  desired: "The product grid must never cause horizontal scrolling: 1 column at 375px, wrapping at 768px, up to 3 columns at 1280px — fix BOTH the grid track sizing and the card minimum width in src/styles.css.",
  visionNote: "Products sit in a calm grid that always fits the screen.",
  acceptance: [{ id: "grid-fit", type: "no_horizontal_overflow", routes: ["/"], viewports: ["375x667", "768x1024", "1280x800"] }, { id: "grid-display", type: "computed_style", route: "/", viewport: "1280x800", selector: "#shop", property: "display", expected: "grid" }] };
w("inputT2", fT2, { changeOrders: [GRIDCO], defects: [GRID], startRound: 3, escalate: true });

// ── T3: NO-OP halisi (XMD_TEST_FIX_NOOP_M1=all) → diagnosis ya attempt 2 lazima iwe NOT_ATTEMPTED
const fT3 = { ...f0, "src/styles.css": f0["src/styles.css"].replace(".promo-strip {\n  max-width: 100%;", ".promo-strip {\n  width: 640px;") };
const PROMO = D({ id: "D-001", area: "layout", severity: "medium", title: "Promo strip overflows at 375px (width: 640px)", evidence: ["S-001", "S-001 page: scrollWidth 640 > 375"],
  expected: "A3: no horizontal scroll at 375px", actual: ".promo-strip width: 640px" });
const PROMOCO = { id: "CO-001", defectIds: ["D-001"], attempt: 1, priority: 1, mode: "standard",
  location: { files: ["src/styles.css"], route: "/", selector: ".promo-strip" }, current: ".promo-strip { width: 640px }", desired: "In src/styles.css, in the .promo-strip rule, replace width: 640px with max-width: 100%.",
  visionNote: "The promo strip fits every screen.", acceptance: [{ id: "promo-fit", type: "no_horizontal_overflow", routes: ["/"], viewports: ["375x667"] }] };
w("inputT3", fT3, { changeOrders: [PROMOCO], defects: [PROMO] });

// ── T4: redecide (attempt 5) ya kasoro ya A1 + kasoro nyingine inayorekebishika → WAIVE/MODIFY inaonekana kwenye state/ripoti
const fT4 = { ...fT1, "src/styles.css": fT3["src/styles.css"] };
const NAV4 = { ...NAV, severity: "minor", status: "REOPENED", attempts: 4, history: [1, 2, 3, 4].map((r) => ({ round: r, result: `CO-00${r}: BLOCKED · checks 0P/1F/0E`, cause: "BLOCKED: conflicts with locked decision A1; build rejects uppercase (seeded history)" })) };
w("inputT4", fT4, { changeOrders: [{ ...NAVCO, id: "CO-005" }, { ...PROMOCO, id: "CO-006", defectIds: ["D-002"] }], defects: [NAV4, { ...PROMO, id: "D-002" }], startRound: 5, escalate: true });
console.log("ok", Object.keys(f0).join(","));
