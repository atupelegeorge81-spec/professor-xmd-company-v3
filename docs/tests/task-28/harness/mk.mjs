// TASK 28: pembejeo za XMD_TEST_VERIFY_INPUT — xmdtest-site (kutoka t27) + kasoro za kila jaribio la sign-off/cap.
import fs from "node:fs";
const t1 = JSON.parse(fs.readFileSync("/home/user/xmdtest/t27/inputT1.json", "utf8")); // A1 inazuia uppercase (build inaitekeleza)
const t3 = JSON.parse(fs.readFileSync("/home/user/xmdtest/t27/inputT3.json", "utf8")); // promo strip 640px
const base = { milestoneId: "M1", planMarkdown: t1.planMarkdown, ledger: t1.ledger, buildReport: t1.buildReport };
const w = (n, o) => fs.writeFileSync(`/home/user/xmdtest/t28/${n}.json`, JSON.stringify({ ...base, ...o }, null, 2));
const D = (o) => ({ milestoneId: "M1", foundInRound: 0, reportedBy: ["designer", "frontend"], evidence: ["S-001"], status: "OPEN", attempts: 0, history: [], ...o });
const readme = "# xmdtest-site\n\nTiny static shop page used by the XMD sign-off test (task 28).\n";
// tovuti SAFI zaidi (run ya kwanza ya T1: reviewers walipata tap targets za nav/logo + header isiyo na max-width) — zimeondolewa kwenye msingi
const clean = (css) => css
  .replace(".site-header {\n  display: flex;", ".site-header {\n  max-width: 1100px;\n  margin: 0 auto;\n  display: flex;")
  .replace("  font-size: 18px;\n}\n\n.logo {", "  font-size: 18px;\n  font-family: inherit;\n}\n\n.logo {\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;")
  .replace(".site-nav a {\n", ".site-nav a {\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;\n  padding: 0 4px;\n")
  .replace(".cta {\n  display: inline-block;", ".cta {\n  display: inline-flex;\n  align-items: center;\n  min-height: 44px;")
  .replace(".lead {\n  font-size: 18px;\n}", ".lead {\n  font-size: 18px;\n  line-height: 1.5;\n  max-width: 60ch;\n}")
  .replace("h1 {\n  color: var(--accent);", "h1 {\n  max-width: 22ch;\n  color: var(--accent);");
for (const f of [t1, t3]) { const c = clean(f.files["src/styles.css"]); if ((c.match(/min-height: 44px/g) || []).length < 4 || !c.includes("max-width: 60ch")) throw new Error("clean failed"); f.files["src/styles.css"] = c; }
// tovuti yenye kasoro 2 rahisi: promo 640px + rangi hafifu ya .lead (A4: text #E5E7EB)
const css1 = t1.files["src/styles.css"].replace(".promo-strip {\n  max-width: 100%;", ".promo-strip {\n  width: 640px;");
const css2 = css1.replace(".lead {\n  font-size: 18px;", ".lead {\n  color: #4B5563;\n  font-size: 18px;");
if (!css2.includes("width: 640px") || !css2.includes("#4B5563")) throw new Error("inject failed");
const files2 = { ...t1.files, "src/styles.css": css2, "README.md": readme };
const PROMO_CO = { ...t3.changeOrders[0] };
const PROMO_D = D({ ...t3.defects[0] });
const CTA_CO = { id: "CO-002", defectIds: ["D-002"], attempt: 1, priority: 2, mode: "standard", location: { files: ["src/styles.css"], route: "/", selector: ".lead" },
  current: ".lead { color: #4B5563 } — dim grey, low contrast on #0B0C10", desired: "In src/styles.css, in the .lead rule, delete the line color: #4B5563; so the paragraph inherits the palette text colour #E5E7EB (locked decision A4).",
  visionNote: "The hero paragraph reads clearly in the palette text colour.", acceptance: [{ id: "lead-color", type: "computed_style", route: "/", selector: ".lead", property: "color", expected: "#E5E7EB" }] };
const CTA_D = D({ id: "D-002", area: "palette", severity: "medium", title: "Hero lead paragraph uses dim grey #4B5563 instead of the palette text colour", expected: "A4: text #E5E7EB — .lead computed color rgb(229, 231, 235)", actual: ".lead color #4B5563 (low contrast)" });
// T1 + T5: kasoro 2 rahisi → SIGNED_OFF
w("inputT1", { files: files2, changeOrders: [PROMO_CO, CTA_CO], defects: [PROMO_D, CTA_D] });
w("inputT5", { files: files2, changeOrders: [PROMO_CO, CTA_CO], defects: [PROMO_D, CTA_D] });
// T2: kasoro isiyorekebishika (A1 LOCKED + build inakataa uppercase) · XMD_TEST_MAX_ROUNDS=2 → CAP_REACHED → INHERITED → M2 plan + StartPack
w("inputT2", { files: { ...t1.files, "README.md": readme }, changeOrders: t1.changeOrders, defects: t1.defects, nextMilestone: true });
// T3: kasoro ileile, attempt 5 (redecide) → WAIVE → SIGNED_OFF_WITH_WAIVERS
w("inputT3", { files: { ...t1.files, "README.md": readme }, changeOrders: [{ ...t1.changeOrders[0], id: "CO-004", attempt: 4 }], defects: [{ ...t1.defects[0], status: "REOPENED", attempts: 3 }], startRound: 4, escalate: true }); // R4 split (Computer) → verify FAIL → ladder attempt 5 redecide
// T4a: promo (CO) + minor iliyoachwa wazi → SIGNED_OFF + backlog
const files1 = { ...files2, "src/styles.css": css1 }; // promo tu
const MINOR = D({ id: "D-003", area: "content", severity: "minor", title: "Footer copyright line missing", expected: "a small footer with '© Kivuli' under the grid", actual: "page has no footer" });
w("inputT4a", { files: files1, changeOrders: [PROMO_CO], defects: [PROMO_D, MINOR] });
// T4b: promo (CO) + medium iliyoachwa wazi · XMD_TEST_MAX_ROUNDS=1 → hakuna sign-off (CAP_REACHED, medium INHERITED)
const MED = D({ id: "D-004", area: "interaction", severity: "medium", title: "Product cards have no visible keyboard focus state", expected: ".card:focus-within shows a 2px accent outline", actual: "no focus style on cards" });
w("inputT4b", { files: files1, changeOrders: [PROMO_CO], defects: [PROMO_D, MED] });
console.log("ok");
