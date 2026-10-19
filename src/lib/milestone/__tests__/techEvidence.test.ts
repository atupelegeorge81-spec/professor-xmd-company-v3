// TASK 29 — unit tests: secrets scanner (regex + masking), amri za plan, cast ya reviewers, check ya db, http headers,
// captureTechEvidence juu ya repo halisi ya git (sandbox ya local = bash). Majaribio halisi: docs/tests/task-29.md.
import { execSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { captureTechEvidence, mergeTechEvidence } from "@/lib/cu/techEvidence";
import { runChecks } from "../checks";
import { supabaseDbProbe } from "../dbProbe";
import { patchAgentOf, votePrompt } from "../escalation";
import { milestoneCast } from "../loop";
import { buildReviewPrompt, validateFindings, type ReviewContext } from "../review";
import { numberFindings, reviewParticipants, applyReviewRules } from "../reviewAgenda";
import { AGENT_ID_BY_ROSTER } from "../roster";
import { validateCheck } from "../schemas";
import {
  findSecretsInLine, maskSecret, maskSecrets, needsTechEvidence, parseSecretScan, reviewCast, techCommandsOf, techPlanChecks,
} from "../techEvidence";
import type { EvidencePack } from "../types";

// tokeni BANDIA (si halali) — zinajengwa kwa vipande ili repo hii yenyewe isiwe na "siri"
const GHP = "ghp" + "_" + "A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8";
const SK = "sk" + "-" + "xmdtestFAKEfake0123456789abcdef";
const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT_SVC = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role", iss: "xmdtest" })}.c2lnbmF0dXJlLXhtZHRlc3Q`;
const JWT_ANON = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "anon", iss: "xmdtest" })}.c2lnbmF0dXJlLXhtZHRlc3Q`;

describe("secrets scanner — kanuni + masking", () => {
  it("inatambua ghp_, sk-, private key, JWT ya service_role (Supabase) na anon JWT", () => {
    expect(findSecretsInLine(`const t = "${GHP}";`).map((x) => x.kind)).toEqual(["github_token"]);
    expect(findSecretsInLine(`OPENAI=${SK}`).map((x) => x.kind)).toEqual(["openai_key"]);
    expect(findSecretsInLine("-----BEGIN RSA PRIVATE KEY-----")[0].kind).toBe("private_key");
    expect(findSecretsInLine(`SUPABASE_SERVICE_ROLE_KEY=${JWT_SVC}`).map((x) => x.kind)).toEqual(["supabase_service_key"]);
    expect(findSecretsInLine(`key: '${JWT_ANON}'`).map((x) => x.kind)).toEqual(["jwt"]);
    expect(findSecretsInLine("task-sk-abc / risk-assessment-notes-for-the-team")).toEqual([]); // sk- ndani ya neno ≠ siri
  });
  it("masking: thamani haionekani kamwe (herufi 4 + urefu)", () => {
    expect(maskSecret(GHP)).toBe(`ghp_****…(${GHP.length} chars)`);
    const out = maskSecrets(`token=${GHP} and ${SK}`);
    expect(out).not.toContain(GHP);
    expect(out).not.toContain(SK);
    expect(out).toContain("ghp_****");
  });
  it("parseSecretScan: .env iliyocommitiwa (si .env.example) + hits za git grep → faili zinatajwa, thamani zimefichwa", () => {
    const f = parseSecretScan(`src/config.js:3:const gh = "${GHP}";\nnode_modules/x/a.js:1:${SK}`, ["src/config.js", ".env", ".env.example", "api/.env.production"]);
    expect(f.map((x) => `${x.file}:${x.kind}`)).toEqual([".env:committed_env", "api/.env.production:committed_env", "src/config.js:github_token"]);
    expect(JSON.stringify(f)).not.toContain(GHP);
  });
});

describe("amri za plan + checks za plan + cast", () => {
  it("techCommandsOf: Build/Test/Lint/Typecheck/Migration + npm audit (package.json)", () => {
    const plan = "Build Command: `node --check server.js`\nTest Command: `node test.js`\nLint Command: none\nMigration Status Command: `node migrate.js --status`";
    expect(techCommandsOf(plan, true).map((c) => c.id)).toEqual(["tech/build", "tech/test", "tech/migrations", "tech/audit"]);
    expect(techCommandsOf(plan, false).map((c) => c.id)).not.toContain("tech/audit");
  });
  it("techPlanChecks: hakuna checks za browser; ids plan/<id>", () => {
    const r = techPlanChecks([
      { id: "a", type: "http", url: "http://localhost:4173/api", expectStatus: 401 },
      { id: "b", type: "dom_exists", route: "/", selector: "h1" },
      { id: "c", type: "db", table: "orders", rls: true },
    ]);
    expect(r.map((c) => c.id)).toEqual(["plan/a", "plan/c"]);
  });
  it("needsTechEvidence: technical + mixed tu", () => {
    expect(["visual", "technical", "mixed"].map(needsTechEvidence)).toEqual([false, true, true]);
  });
  it("reviewCast: technical → Megatron + Cybertron kutoka roster; bila backend kwenye roster Megatron HAYUPO", () => {
    expect(reviewCast("technical", ["optimus", "megatron", "cybertron"], AGENT_ID_BY_ROSTER)).toEqual({ designer: "backend", frontend: "qa" });
    expect(reviewCast("technical", ["optimus", "vextron"], AGENT_ID_BY_ROSTER)).toEqual({ designer: "frontend", frontend: "qa" });
    expect(reviewCast("technical", ["optimus"], AGENT_ID_BY_ROSTER)).toEqual({ designer: "qa", frontend: "frontend" });
    expect(reviewCast("visual", ["optimus", "megatron"], AGENT_ID_BY_ROSTER)).toEqual({ designer: "designer", frontend: "frontend" });
    expect(reviewCast("mixed", ["megatron"], AGENT_ID_BY_ROSTER)).toEqual({ designer: "designer", frontend: "frontend" });
    expect(milestoneCast({ reviewMode: "technical", roster: ["optimus", "megatron", "cybertron"] })).toEqual({ designer: "backend", frontend: "qa" });
  });
});

describe("checks: db + http headers", () => {
  it("schema: db (table identifier, rls boolean) + http headers/body", () => {
    expect(validateCheck({ id: "d", type: "db", table: "orders", rls: true }).ok).toBe(true);
    expect(validateCheck({ id: "d", type: "db", table: "orders; drop table x" }).ok).toBe(false);
    expect(validateCheck({ id: "d", type: "db", table: "t", rls: "yes" }).ok).toBe(false);
    expect(validateCheck({ id: "h", type: "http", url: "https://x", status: 401, headers: { Authorization: "Bearer t" } }).ok).toBe(true);
    expect(validateCheck({ id: "h", type: "http", url: "https://x", status: 401, headers: { a: 1 } }).ok).toBe(false);
  });
  const noSbx = { files: { write: async () => undefined, read: async () => "" }, commands: { run: async () => ({ stdout: "" }) } };
  it("db: bila probe → ERROR; RLS OFF ikiombwa → FAIL; table haipo → FAIL; RLS ON → PASS", async () => {
    const probe = async (c: { table: string }) => (c.table === "nors" ? { exists: true, rls: false } : c.table === "gone" ? { exists: false, rls: null } : { exists: true, rls: true });
    const { results } = await runChecks([
      { id: "a", type: "db", table: "nors", rls: true },
      { id: "b", type: "db", table: "gone" },
      { id: "c", type: "db", table: "ok", rls: true },
    ], { sbx: noSbx, ws: "/w", db: probe });
    expect(results.map((r) => r.result)).toEqual(["FAIL", "FAIL", "PASS"]);
    expect(results[0].detail).toContain("Row Level Security is DISABLED");
    expect((await runChecks([{ id: "x", type: "db", table: "t" }], { sbx: noSbx, ws: "/w" })).results[0].result).toBe("ERROR");
  });
  it("http ya nje: headers zinatumwa; detail inasema (authenticated)/(no credentials); siri za body zinafichwa", async () => {
    const seen: any[] = [];
    const fetchImpl = (async (_u: string, init: any) => { seen.push(init); return new Response(`leak ${GHP}`, { status: init.headers ? 200 : 401 }); }) as typeof fetch;
    const { results } = await runChecks([
      { id: "neg", type: "http", url: "https://api.example/x", expectStatus: 401 },
      { id: "pos", type: "http", url: "https://api.example/x", expectStatus: 200, headers: { Authorization: "Bearer t" }, bodyContains: "nope" },
    ], { sbx: noSbx, ws: "/w", fetchImpl });
    expect(results[0]).toMatchObject({ result: "PASS" });
    expect(results[0].detail).toContain("(no credentials)");
    expect(results[1].result).toBe("FAIL");
    expect(results[1].detail).toContain("(authenticated)");
    expect(seen[1].headers).toEqual({ Authorization: "Bearer t" });
  });
});

describe("dbProbe (Supabase client) — rpc, fallback bila function", () => {
  it("rpc ipo → exists + rls", async () => {
    const client: any = { rpc: async () => ({ data: [{ table_exists: true, rls_enabled: false }], error: null }) };
    expect(await supabaseDbProbe(client)({ id: "x", type: "db", table: "t" })).toMatchObject({ exists: true, rls: false });
  });
  it("function haipo → table kwa select; RLS null (→ ERROR ikiombwa)", async () => {
    const client: any = {
      rpc: async () => ({ data: null, error: { code: "PGRST202", message: "Could not find the function public.xmd_table_security" } }),
      from: () => ({ select: async () => ({ error: null, count: 0 }) }),
    };
    const r = await supabaseDbProbe(client)({ id: "x", type: "db", table: "t" });
    expect(r).toMatchObject({ exists: true, rls: null });
    const gone: any = { ...client, from: () => ({ select: async () => ({ error: { code: "PGRST205", message: "Could not find the table" } }) }) };
    expect(await supabaseDbProbe(gone)({ id: "x", type: "db", table: "t" })).toMatchObject({ exists: false });
  });
});

// ── captureTechEvidence juu ya repo halisi ya git (sandbox ya local) ──
const dirs: string[] = [];
afterAll(() => { for (const d of dirs) rmSync(d, { recursive: true, force: true }); });
function localSbx() {
  return {
    files: {
      write: async (p: string, d: any) => { mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, d); },
      read: async (p: string) => readFileSync(p, "utf8"),
    },
    commands: {
      run: async (cmd: string) => {
        try { return { stdout: execSync(cmd, { shell: "/bin/bash", encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }), exitCode: 0 }; }
        catch (e: any) { return { stdout: String(e.stdout || ""), stderr: String(e.stderr || ""), exitCode: e.status ?? 1 }; }
      },
    },
  };
}
function fixtureRepo(files: Record<string, string>): string {
  const ws = mkdtempSync(join(tmpdir(), "xmdtest-t29-"));
  dirs.push(ws);
  for (const [p, c] of Object.entries(files)) { mkdirSync(dirname(join(ws, p)), { recursive: true }); writeFileSync(join(ws, p), c); }
  execSync("git init -q && git add -A && git -c user.email=x@x -c user.name=x commit -qm seed", { cwd: ws, shell: "/bin/bash" });
  return ws;
}

describe("captureTechEvidence — repo halisi ya git", () => {
  const plan = [
    "## 4. Tech Stack", "Build Command: `node --check server.js`", "Test Command: none", "## 5. File Structure", "- server.js", "## 6. Work Steps",
    "### Step 1 — server", "- **Goal:** g", "- **Files:** server.js", "- **Instructions:** 1. do it", "- **Verification:** ok", "- **Depends on:** none", "- **Checks:**",
    "```checks", '[{"id":"c1","type":"file_contains","path":"server.js","text":"listen"},{"id":"c2","type":"db","table":"xmdtest_nors","rls":true}]', "```",
    "## 7. QA Checklist", "- [ ] ok",
  ].join("\n");
  it("siri + .env → tech/secrets FAIL inataja faili (thamani zimefichwa); amri + checks za plan zinaendeshwa; hakuna screenshots", async () => {
    const ws = fixtureRepo({
      "server.js": `const k = "${GHP}";\nrequire("http").createServer((q, s) => s.end("ok")).listen(4173);\n`,
      ".env": `SUPABASE_SERVICE_ROLE_KEY=${JWT_SVC}\n`,
      ".env.example": "SUPABASE_SERVICE_ROLE_KEY=\n",
      "README.md": "# xmdtest\n",
    });
    const t = await captureTechEvidence(localSbx() as any, { milestoneId: "M1", round: 0, planMarkdown: plan, ws, db: async () => ({ exists: true, rls: false }) });
    const sec = t.checks.find((c) => c.id === "tech/secrets")!;
    expect(sec.result).toBe("FAIL");
    expect(sec.detail).toContain("server.js:1 github_token ghp_****");
    expect(sec.detail).toContain(".env committed_env");
    expect(sec.detail).toContain(".env:1 supabase_service_key");
    expect(sec.detail).not.toContain(".env.example");
    expect(JSON.stringify(t)).not.toContain(GHP);
    expect(JSON.stringify(t)).not.toContain(JWT_SVC);
    expect(t.checks.find((c) => c.id === "tech/build")?.result).toBe("PASS");
    expect(t.checks.find((c) => c.id === "plan/c1")?.result).toBe("PASS");
    expect(t.checks.find((c) => c.id === "plan/c2")?.result).toBe("FAIL");
    expect(t.gitDiffSummary).toContain("server.js");
    const empty: EvidencePack = { milestoneId: "M1", round: 0, screenshots: [], domMetrics: [], checks: [], commands: [], gitDiffSummary: "", regression: [], consoleErrors: [], errors: [] };
    const pack = mergeTechEvidence(empty, t);
    expect(pack.screenshots).toEqual([]);
    expect(pack.technical).toMatchObject({ secrets: 3, secretFiles: ["server.js", ".env"].sort((a, b) => (a < b ? -1 : 1)) });
  }, 60_000);
  it("repo safi → tech/secrets PASS", async () => {
    const ws = fixtureRepo({ "server.js": "console.log('ok')\n", ".env.example": "KEY=\n" });
    const t = await captureTechEvidence(localSbx() as any, { milestoneId: "M1", round: 0, planMarkdown: "Build Command: `node --check server.js`", ws });
    expect(t.checks.find((c) => c.id === "tech/secrets")).toMatchObject({ result: "PASS" });
  }, 60_000);
});

describe("reviewers wa technical — prompt, uthibitisho, mjadala, escalation", () => {
  const pack: EvidencePack = {
    milestoneId: "M1", round: 0, screenshots: [], domMetrics: [], commands: [{ cmd: "node --check server.js", exit: 0, logPath: "" }], gitDiffSummary: "server.js | 3 +", regression: [], consoleErrors: [], errors: [],
    checks: [{ id: "tech/secrets", type: "grep", result: "FAIL", detail: "1 secret(s) in 1 file(s): server.js" }],
    technical: { secrets: 1, secretFiles: ["server.js"], checks: 1, failed: 1, ms: 5 },
  };
  const ctx = (): Omit<ReviewContext, "pack"> => ({
    ocb: { project: { name: "xmdtest", summary: "api" }, map: { version: 1, sessionId: "s", milestones: [{ id: "M1", title: "API", agendas: { from: 1, to: 1 }, phase: "core", reviewMode: "technical", roster: ["optimus", "megatron", "cybertron"], rationale: "x" }] } as any, milestoneId: "M1", round: { current: 0, max: 10 }, counts: { lockedDecisions: 1, milestonesDone: [], openDefects: 0, waivers: 0 } },
    roundHeader: { milestoneId: "M1", round: 0, maxRounds: 10, closedDefects: 0, open: [], waivers: 0, roundsLeft: 10 },
    miniReports: [], ledger: [], planMarkdown: "plan", buildReport: "## 2. Security\nNo secrets are committed.", defects: [], baselines: [],
    cast: { designer: "backend", frontend: "qa" }, reviewMode: "technical",
  });
  it("prompt: Megatron (backend) + Cybertron (qa), lens ya technical, claims vs evidence, hakuna picha", async () => {
    const a = await buildReviewPrompt("designer", { ...ctx(), pack }, { images: true, loadImage: async () => { throw new Error("no images in technical"); } });
    const b = await buildReviewPrompt("frontend", { ...ctx(), pack }, { images: true });
    expect(a.text).toContain("You are Megatron");
    expect(b.text).toContain("You are Cybertron");
    expect(a.text).toContain("CLAIMS vs EVIDENCE");
    expect(b.text).toContain("SECURITY CHECKLIST");
    expect(a.text).toContain("TECHNICAL EVIDENCE");
    expect(a.text).toContain("check:tech/secrets");
    expect(a.imageParts).toBe(0);
    expect(a.hash).not.toBe(b.hash);
  });
  it("validateFindings: screenshots [] halali; reviewer = slot / agent id / jina; evidence check:tech/secrets", () => {
    const f = { reviewer: "backend", screenshots: [], defects: [{ title: "Report claims no secrets", area: "security", severity: "blocker", kind: "broken", evidence: ["check:tech/secrets"], expected: "no secrets", actual: "ghp token in server.js" }], proposals: [], notes: "" };
    expect(validateFindings(f, "designer", pack, { designer: "backend", frontend: "qa" }).ok).toBe(true);
    expect(validateFindings({ ...f, reviewer: "Megatron" }, "designer", pack, { designer: "backend", frontend: "qa" }).ok).toBe(true);
    expect(validateFindings({ ...f, reviewer: "qa" }, "designer", pack, { designer: "backend", frontend: "qa" }).ok).toBe(false);
  });
  it("mjadala: washiriki = backend + qa + pm; reportedBy = agent id; makubaliano yanahitaji wataalamu wote wawili", () => {
    const cast = { designer: "backend", frontend: "qa" };
    expect(reviewParticipants([], cast)).toEqual(["backend", "qa", "pm"]);
    const t = numberFindings({ designer: { reviewer: "designer", screenshots: [], defects: [{ title: "x", area: "a", severity: "major", kind: "broken", evidence: ["check:tech/secrets"], expected: "e", actual: "a" }], proposals: [], notes: "" } }, { milestoneId: "M1", round: 0, cast });
    expect(t.defects[0].reportedBy).toEqual(["backend"]);
    expect(applyReviewRules(t, { consensus: true, decision: "DEFECTS: D-001 VALID", participants: ["backend", "qa", "pm"], cast }).consensus).toBe(true);
    expect(applyReviewRules(t, { consensus: true, decision: "DEFECTS: D-001 VALID", participants: ["backend", "pm"], cast }).consensus).toBe(false);
  });
  it("escalation: technical → patch na kura kwa wataalamu wa cast", () => {
    expect(patchAgentOf({ reviewMode: "technical", cast: { designer: "backend", frontend: "qa" } })).toBe("backend");
    expect(patchAgentOf({ reviewMode: "visual" })).toBe("frontend");
    const co: any = { id: "CO-001", attempt: 4, defectIds: ["D-001"], location: { files: ["server.js"] }, current: "c", desired: "d", priority: 1 };
    const m = votePrompt({ milestoneId: "M1", round: 2, reviewMode: "technical", defects: [], ledgerLines: [], roundHeader: "R", cast: { designer: "backend", frontend: "qa" } }, co, [], "frontend", []);
    expect(String(m[0].content)).toContain("Cybertron");
  });
});

describe("http ya localhost — Start Command inawashwa na kuzimwa (withLocalServer)", () => {
  it("endpoint ya admin bila credentials: 401 inatarajiwa → PASS; ikiwa wazi (200) → FAIL; server inazimwa baadaye", async () => {
    const port = 4391;
    const srv = (open: boolean) => `require("http").createServer((q, s) => { const ok = ${open} || q.headers.authorization === "Bearer xmdtest"; s.statusCode = q.url.startsWith("/api/admin") && !ok ? 401 : 200; s.end(ok ? "secret-data" : "denied"); }).listen(Number(process.env.PORT) || ${port}, "127.0.0.1");\n`;
    const checks = [
      { id: "neg", type: "http", url: `http://127.0.0.1:${port}/api/admin`, expectStatus: 401 },
      { id: "pos", type: "http", url: `http://127.0.0.1:${port}/api/admin`, expectStatus: 200, headers: { Authorization: "Bearer xmdtest" }, bodyContains: "secret-data" },
    ];
    const closed = fixtureRepo({ "server.js": srv(false) });
    const a = await runChecks(checks, { sbx: localSbx() as any, ws: closed, startCommand: "node server.js", port, tag: "t29a", startTimeoutMs: 20_000 });
    expect(a.results.map((r) => r.result)).toEqual(["PASS", "PASS"]);
    const open = fixtureRepo({ "server.js": srv(true) });
    const b = await runChecks(checks, { sbx: localSbx() as any, ws: open, startCommand: "node server.js", port, tag: "t29b", startTimeoutMs: 20_000 });
    expect(b.results[0].result).toBe("FAIL");
    expect(b.results[0].detail).toContain("→ HTTP 200 (expected 401)");
    const down = execSync(`curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:${port}/ || true`, { shell: "/bin/bash", encoding: "utf8" });
    expect(down).toBe("000");
  }, 60_000);
});
