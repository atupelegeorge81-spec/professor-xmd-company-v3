// TASK 17 · T1 (pure): parseBuildReport + crossCheckBuildReport
import { describe, expect, it } from "vitest";
import { BUILD_REPORT_HEADINGS, buildReportPath, crossCheckBuildReport, parseBuildReport } from "../buildReport";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const VALID = `# M1 Build Report

## 1 Summary
Created the README title for xmdtest-cu16.

## 2 Files created or changed
- \`README.md\` — created — project title
- \`src/app/page.tsx\` — changed — home page

## 3 Commands run and results
- \`printf '# xmdtest-cu16\\n' > README.md\` — exit 0 — wrote the title line.
- \`head -1 README.md\` — exit code 0 — prints the title.
- \`npm test\` — exit 1 — one flaky test, fixed below.

## 4 Tests run
- head -1 README.md equals title — PASS

## 5 Decisions and deviations from the plan
- Used printf instead of the editor — the terminal rejects heredocs.

## 6 Security notes
- None: no secrets, auth or sensitive data touched.

## 7 Known problems / technical debt
- None known.

## 8 Risks for the next milestone
- M2 must append, not overwrite, README.md.
`;

const swap = (md: string, a: string, b: string) => md.replace(a, b);

describe("TASK-17 · parseBuildReport", () => {
  it("ripoti halali → ok, sehemu 8, paths 2, amri 3 (exit codes sahihi)", () => {
    const r = parseBuildReport(VALID);
    expect(r.errors).toEqual([]);
    expect(r.ok).toBe(true);
    expect(Object.keys(r.sections)).toEqual([...BUILD_REPORT_HEADINGS]);
    expect(r.paths).toEqual(["README.md", "src/app/page.tsx"]);
    expect(r.commands.map((c) => [c.command, c.exitCode])).toEqual([
      ["printf '# xmdtest-cu16\\n' > README.md", 0], ["head -1 README.md", 0], ["npm test", 1],
    ]);
  });

  it("heading inakosekana → inakataliwa", () => {
    const r = parseBuildReport(swap(VALID, "## 6 Security notes\n", ""));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('missing heading "## 6 Security notes"');
  });

  it("mpangilio mbaya → inakataliwa", () => {
    const s4 = "## 4 Tests run\n- head -1 README.md equals title — PASS\n\n";
    const s5 = "## 5 Decisions and deviations from the plan\n- Used printf instead of the editor — the terminal rejects heredocs.\n\n";
    const r = parseBuildReport(VALID.replace(s4 + s5, s5 + s4));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('heading out of order: "## 5 Decisions and deviations from the plan" appears before "## 4 Tests run"');
  });

  it("sehemu tupu → inakataliwa", () => {
    const r = parseBuildReport(swap(VALID, "- None known.\n", "\n"));
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('empty section "## 7 Known problems / technical debt"');
  });

  it("sehemu ya 3 bila exit codes → inakataliwa", () => {
    const md = VALID.replace(/ — exit( code)? \d — /g, " — ");
    const r = parseBuildReport(md);
    expect(r.ok).toBe(false);
    expect(r.errors).toContain('section "## 3 Commands run and results" has no command line with an exit code');
  });

  it("sehemu ya 2 bila paths → inakataliwa", () => {
    const r = parseBuildReport(VALID.replace(/- `README.md`.*\n- `src\/app\/page.tsx`.*\n/, "- some files were edited\n"));
    expect(r.errors).toContain('section "## 2 Files created or changed" lists no file paths');
  });

  it("headings ndani ya ``` hazihesabiwi; /home/user/ws/ na ./ zinaondolewa", () => {
    const md = VALID.replace("- `README.md`", "- `/home/user/ws/README.md`").replace("- `src/app/page.tsx`", "- ./src/app/page.tsx")
      + "\n```\n## 1 Summary\n```\n";
    const r = parseBuildReport(md);
    expect(r.ok).toBe(true);
    expect(r.paths).toEqual(["README.md", "src/app/page.tsx"]);
  });

  it("buildReportPath", () => expect(buildReportPath("M3")).toBe(".xmd/reports/M3-build-report.md"));
});

describe("TASK-17 · crossCheckBuildReport (sehemu ya 2 ↔ git diff)", () => {
  it("path iliyobuniwa → fake; faili lisilotajwa → unreported; .xmd/ ya harness haihesabiwi", () => {
    const x = crossCheckBuildReport(["README.md", "src/fake/ghost.ts"], ["README.md", ".xmd/reports/M1-build-report.md", "package.json"]);
    expect(x.fake).toEqual(["src/fake/ghost.ts"]);
    expect(x.unreported).toEqual(["package.json"]);
  });
  it("TASK-18: faili za harness (feature_list.json, plan.md…) zilizotajwa si fake", () => {
    expect(crossCheckBuildReport(["README.md", "feature_list.json", "./plan.md"], ["README.md"])).toEqual({ fake: [], unreported: [] });
  });
  it("directory iliyotajwa inafunika faili zilizo chini yake", () => {
    expect(crossCheckBuildReport(["src/components/"], ["src/components/a.tsx", "src/components/b.tsx"])).toEqual({ fake: [], unreported: [] });
  });
});

describe("TASK-17 · headings za TS = za cu/bridge.py (mkataba mmoja)", () => {
  it("BUILD_REPORT_HEADINGS zinaonekana kwa mpangilio kwenye bridge.py", () => {
    const py = readFileSync(join(process.cwd(), "cu/bridge.py"), "utf8");
    const block = py.slice(py.indexOf("BUILD_REPORT_HEADINGS = ("), py.indexOf(")", py.indexOf("BUILD_REPORT_HEADINGS = (")));
    expect([...block.matchAll(/"([^"]+)"/g)].map((m) => m[1])).toEqual([...BUILD_REPORT_HEADINGS]);
  });
});
