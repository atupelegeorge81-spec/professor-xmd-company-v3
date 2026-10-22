// TASK-35 (T32 follow-up, pointi 1): (a) block ya uwezo wa sandbox kwenye prompt ya plan · (b) preflight ya `command -v`
import { describe, expect, it } from "vitest";
import {
  PLAN_REPAIR_MAX, PREFLIGHT_REPAIR_MAX, SANDBOX_BIN_MANIFEST, SANDBOX_CAPABILITIES, commandBinaries, generateMilestonePlan,
  isPreflightError, missingBinaries, validateMilestonePlan, type MilestonePlanDeps,
} from "../plan";
import type { Milestone } from "../types";

const M1: Milestone = { id: "M1", title: "Page", agendas: { from: 1, to: 1 }, phase: "foundation", reviewMode: "mixed", roster: ["optimus"], rationale: "" } as any;

const PART1 = (build = "npm run build", test = "none") => `## 1. Objective & Deliverable
Build the page.
## 2. Official Data
x
## 3. Constraints
x
## 4. Tech Stack & Design Tokens
Styling + Dependencies: plain CSS in styles.css ; packages: none
Build Command: \`${build}\`
Test Command: ${test === "none" ? "none" : `\`${test}\``}`;

const PART2 = (cmd: string, start = "npx serve -l 4173", extra = "") => `## 5. File Structure
- index.html
## 6. Work Steps
### Step 1 — Page
- **Goal:** g
- **Source:** Agenda 1 mini-report (authoritative)
- **Files:** index.html
- **Instructions:** 1. do it
- **Verification:** ok
- **Depends on:** none
- **Checks:**
\`\`\`checks
[{"id":"M1-S1-a","type":"file_exists","path":"index.html"},{"id":"M1-S1-b","type":"command","cmd":${JSON.stringify(cmd)},"expectExit":0}]
\`\`\`
## 7. QA Checklist
- [ ] ok
**Screenshots:**
- route: / · states: default · viewports: 375x667, 768x1024, 1280x800
Start Command: \`${start}\`${extra}
## 8. Agent Rules
- never invent`;

describe("TASK-35 (b): commandBinaries / missingBinaries", () => {
  it("neno la kwanza la kila kipande; quotes, redirects, VAR=, wrappers, builtins na njia vinarukwa", () => {
    expect(commandBinaries("npm run build && npx tsc --noEmit")).toEqual(["npm", "npx"]);
    expect(commandBinaries("cd web && pnpm build")).toEqual(["pnpm"]);
    expect(commandBinaries("FOO=1 timeout 30s node x.js 2>&1 | tee out.log")).toEqual(["node", "tee"]);
    expect(commandBinaries(`node -e "const a=1; process.exit(a|0)"`)).toEqual(["node"]);
    expect(commandBinaries("./scripts/check.sh; bash scripts/y.sh")).toEqual(["bash"]);
    expect(commandBinaries("test -s README.md && [ -f a ]")).toEqual([]);
    expect(commandBinaries("sudo docker compose up -d")).toEqual(["docker"]);
    expect(commandBinaries("grep -q x $(ls src) || exit 1")).toEqual(["grep", "ls"]);
  });

  it("manifest halisi: supabase/psql/vitest/pnpm hazipo; npx/node/npm/python3 zipo", () => {
    expect(missingBinaries("supabase test db")).toEqual(["supabase"]);
    expect(missingBinaries("psql $DATABASE_URL -c 'select 1'")).toEqual(["psql"]);
    expect(missingBinaries("vitest run")).toEqual(["vitest"]);
    expect(missingBinaries("npx vitest run && python3 -m pytest -q")).toEqual([]);
    expect(missingBinaries("pnpm i && next build")).toEqual(["pnpm", "next"]);
    expect(SANDBOX_BIN_MANIFEST).toContain("npx");
    expect(SANDBOX_BIN_MANIFEST).not.toContain("docker");
  });
});

describe("TASK-35 (b): validateMilestonePlan — preflight ya kila amri", () => {
  it("plan yenye amri zinazopatikana inapita", () => {
    const v = validateMilestonePlan(`${PART1()}\n${PART2("node --check server.js")}`, M1);
    expect(v.errors).toEqual([]);
  });

  it("command check isiyopatikana → kosa lenye id ya check + sababu ya command -v; check haihesabiwi", () => {
    const v = validateMilestonePlan(`${PART1()}\n${PART2("vitest run")}`, M1);
    const e = v.errors.find(isPreflightError) || "";
    expect(e).toMatch(/^M1 plan Step 1 check\[1\] \(M1-S1-b\): command `vitest run` cannot run in the build sandbox — preflight: `vitest` \(command -v vitest → not found\)/);
    expect(v.checks.map((c) => c.id)).toEqual(["M1-S1-a"]);
  });

  it("Build/Test (§4) na Start/Lint/Typecheck/Migration (§7) zinapitiwa zote", () => {
    const v = validateMilestonePlan(`${PART1("pnpm build", "supabase test db")}\n${PART2("node --check a.js", "serve -l 4173", "\nLint Command: `eslint .`\nTypecheck Command: `npx tsc --noEmit`\nMigration Status Command: `psql -c 'select 1'`")}`, M1);
    const pf = v.errors.filter(isPreflightError);
    expect(pf.some((e) => /^M1 plan §4: "Build Command:" `pnpm build`.*`pnpm` \(command -v pnpm → not found\)/.test(e))).toBe(true);
    expect(pf.some((e) => /^M1 plan §4: "Test Command:" `supabase test db`/.test(e))).toBe(true);
    expect(pf.some((e) => /^M1 plan §7: "Start Command:" `serve -l 4173`/.test(e))).toBe(true);
    expect(pf.some((e) => /^M1 plan §7: "Lint Command:" `eslint \.`/.test(e))).toBe(true);
    expect(pf.some((e) => /^M1 plan §7: "Migration Status Command:"/.test(e))).toBe(true);
    expect(pf.some((e) => /Typecheck Command/.test(e))).toBe(false); // npx → inapatikana
    expect(pf).toHaveLength(5);
  });

  it("mstari \"none (maelezo)\" si amri → haupitiwi (plan halisi ya E6 M3)", () => {
    const v = validateMilestonePlan(`${PART1()}\n${PART2("node --check a.js", "npx serve -l 4173", "\nMigration Status Command: none (Supabase CLI not assumed available in sandbox)")}`, M1);
    expect(v.errors.filter(isPreflightError)).toEqual([]);
  });

  it("amri iliyopo lakini inahitaji Postgres ya ndani (localhost:5432) → bado inakataliwa (SANDBOX_UNAVAILABLE_RE)", () => {
    const v = validateMilestonePlan(`${PART1()}\n${PART2("node scripts/db.js --url postgres://localhost:5432/x")}`, M1);
    expect(v.errors.some((e) => isPreflightError(e) && /needs Docker \/ a local Postgres/.test(e))).toBe(true);
  });
});

function deps(texts: string[], logs: string[] = []): MilestonePlanDeps & { users: string[] } {
  const users: string[] = [];
  let i = 0;
  return {
    users,
    project: "xmdtest", title: "T", sessionId: "xmdtest-s", date: "2026-10-22", facts: null, factsBlock: "", dataFilesBlock: "",
    ledger: [{ agenda_index: 1, agenda_item: "Page", status: "LOCKED", decision_summary: "plain CSS" }],
    miniOf: async () => "mini", system: "SYS", guard: () => [],
    write: async ({ user }: { user: string }) => { users.push(user); return texts[i++] ?? texts[texts.length - 1]; },
    log: (_l: string, t: string) => logs.push(t),
  } as any;
}

describe("TASK-35 (a)+(b): generateMilestonePlan", () => {
  it("(a) block ya uwezo iko kwenye prompt ya PART 1, PART 2 na marekebisho; inataja Docker/Supabase CLI/xmdtest_", async () => {
    expect(SANDBOX_CAPABILITIES).toMatch(/NOT available: Docker/);
    expect(SANDBOX_CAPABILITIES).toMatch(/supabase test db/);
    expect(SANDBOX_CAPABILITIES).toMatch(/prefixed `xmdtest_`/);
    expect(SANDBOX_CAPABILITIES).toMatch(/over HTTPS/);
    const d = deps([PART1(), PART2("vitest run"), PART2("node --check a.js")]);
    const r = await generateMilestonePlan(M1, d);
    expect(r.status).toBe("active");
    expect(d.users).toHaveLength(3);
    for (const u of d.users) expect(u).toContain("=== BUILD SANDBOX CAPABILITIES");
    expect(d.users[2]).toContain("cannot run in the build sandbox — preflight: `vitest`"); // sababu imerudishwa kwa Optimus
  });

  it("(b) amri isiyopo kila mara → marudio 3 hasa, kisha structure_failed (haitekelezwi, kosa halitupwi)", async () => {
    const logs: string[] = [];
    const d = deps([PART1(), PART2("vitest run")], logs);
    const r = await generateMilestonePlan(M1, d);
    expect(PREFLIGHT_REPAIR_MAX).toBe(3);
    expect(d.users).toHaveLength(2 + PREFLIGHT_REPAIR_MAX);
    expect(r.repairs.structure).toBe(3);
    expect(r.status).toBe("structure_failed");
    expect(r.executable).toBe(false);
    expect(r.problems.some(isPreflightError)).toBe(true);
    expect(logs.filter((l) => l.startsWith("🧰 Preflight M1"))).toHaveLength(3);
    expect(logs[0]).toMatch(/jaribio 1\/3\): vitest/);
  });

  it("makosa ya muundo yasiyo ya preflight yanabaki na kikomo cha zamani (PLAN_REPAIR_MAX = 2)", async () => {
    const noStart = PART2("node --check a.js").replace(/Start Command:.*\n/, "");
    const d = deps([PART1(), noStart]);
    const r = await generateMilestonePlan(M1, d);
    expect(d.users).toHaveLength(2 + PLAN_REPAIR_MAX);
    expect(r.status).toBe("structure_failed");
  });
});
