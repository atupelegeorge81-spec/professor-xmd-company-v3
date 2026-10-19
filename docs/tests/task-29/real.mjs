// T29 majaribio halisi T1–T3: node real.mjs t1|t2|t3
//  t1/t2 → sandbox HALISI ya E2B (template ya CU) + harness ya technical evidence (src/lib/cu/techEvidence.ts)
//  t3    → Supabase HALISI: table xmdtest_nors bila RLS (pg) → db check kupitia Supabase client (dbProbe) → futa table
// Siri hazichapishwi: env inasomwa kutoka .env.local; tokeni za fixture ni BANDIA na zinajengwa kwa vipande.
import fs from "fs";
import { createJiti } from "/home/user/xmd-home/professor-xmd-company/node_modules/jiti/lib/jiti.mjs";
const ROOT = "/home/user/xmd-home/professor-xmd-company";
for (const l of fs.readFileSync(`${ROOT}/.env.local`, "utf8").split("\n")) {
  const m = /^([A-Z0-9_]+)=(.*)$/.exec(l);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const jiti = createJiti(import.meta.url, { alias: { "@/": `${ROOT}/src/` } });
const which = process.argv[2];
const t0 = Date.now();
const log = (...a) => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)}s]`, ...a);

const GHP = "ghp" + "_" + "XmdTest29FakeToken0123456789abcdefABCD";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
const JWT_SVC = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "service_role", iss: "xmdtest-t29" })}.eG1kdGVzdC1mYWtlLXNpZ25hdHVyZQ`;

async function sandbox() {
  const { Sandbox } = await import(`${ROOT}/node_modules/e2b/dist/index.mjs`);
  const sbx = await Sandbox.create(process.env.CU_E2B_TEMPLATE || "base", { apiKey: process.env.E2B_API_KEY, timeoutMs: 15 * 60_000, metadata: { purpose: "xmdtest-t29" } });
  log("sandbox", sbx.sandboxId.slice(0, 8), "template", process.env.CU_E2B_TEMPLATE ? "(CU template)" : "base");
  // commands.run inatupa kwa exit≠0 → wrapper kama ya harness (engine) inarudisha stdout
  const run = async (cmd, o) => { try { return await sbx.commands.run(cmd, o); } catch (e) { return { stdout: String(e?.result?.stdout || e?.stdout || ""), stderr: String(e?.message || e), exitCode: e?.exitCode ?? 1 }; } };
  return { raw: sbx, files: sbx.files, commands: { run } };
}
async function seed(sbx, files, msg) {
  await sbx.commands.run("mkdir -p /home/user/ws && cd /home/user/ws && (git rev-parse --git-dir >/dev/null 2>&1 || git init -q)", { timeoutMs: 30_000 });
  for (const [p, c] of Object.entries(files)) await sbx.files.write(`/home/user/ws/${p}`, c);
  const r = await sbx.commands.run(`cd /home/user/ws && git add -A && git -c user.email=xmdtest@x -c user.name=xmdtest commit -qm ${JSON.stringify(msg)} && git log --oneline -1`, { timeoutMs: 30_000 });
  log("seed:", String(r.stdout).trim());
}
const PLAN = (checks, start) => [
  "## 4. Tech Stack", "Styling + Dependencies: none (Node http API) ; packages: none", "Build Command: `node --check server.js`", "Test Command: none",
  ...(start ? [`Start Command: \`${start}\``] : []),
  "## 5. File Structure", "- server.js", "## 6. Work Steps", "### Step 1 — API", "- **Goal:** admin API", "- **Files:** server.js", "- **Instructions:** 1. build", "- **Verification:** ok", "- **Depends on:** none", "- **Checks:**",
  "```checks", JSON.stringify(checks), "```", "## 7. QA Checklist", "- [ ] ok",
].join("\n");

const { captureTechEvidence, techEvidenceSummary } = await jiti.import(`${ROOT}/src/lib/cu/techEvidence.ts`);

if (which === "t1") {
  const sbx = await sandbox();
  try {
    await seed(sbx, {
      "server.js": `// xmdtest-t29 fixture\nconst GITHUB_TOKEN = "${GHP}";\nrequire("http").createServer((q, s) => s.end("ok")).listen(4173);\n`,
      ".env": `SUPABASE_URL=https://xmdtest.supabase.co\nSUPABASE_SERVICE_ROLE_KEY=${JWT_SVC}\n`,
      ".env.example": "SUPABASE_URL=\nSUPABASE_SERVICE_ROLE_KEY=\n",
      "README.md": "# xmdtest-t29 fixture repo\n",
    }, "xmdtest-t29 T1 fixture (fake token + committed .env)");
    const t = await captureTechEvidence(sbx, { milestoneId: "M1", round: 0, planMarkdown: PLAN([{ id: "c1", type: "file_exists", path: "server.js" }]) });
    const sec = t.checks.find((c) => c.id === "tech/secrets");
    log("summary:", techEvidenceSummary(t));
    log("tech/secrets:", sec.result);
    console.log(sec.detail);
    const blob = JSON.stringify(t);
    log("raw ghp_ value present in result:", blob.includes(GHP), "· raw JWT present:", blob.includes(JWT_SVC));
    log("T1", sec.result === "FAIL" && /server\.js/.test(sec.detail) && /\.env /.test(sec.detail) && !blob.includes(GHP) && !blob.includes(JWT_SVC) ? "PASS" : "FAIL");
  } finally { await sbx.raw.kill(); log("sandbox killed"); }
}

if (which === "t2") {
  const sbx = await sandbox();
  const server = (protectedAdmin) => `// xmdtest-t29 T2 API\nconst http = require("http");\nhttp.createServer((q, s) => {\n  if (q.url.startsWith("/api/admin")) {\n${protectedAdmin ? `    if (q.headers.authorization !== "Bearer " + (process.env.ADMIN_TOKEN || "xmdtest-admin")) { s.statusCode = 401; return s.end(JSON.stringify({ error: "unauthorized" })); }\n` : ""}    return s.end(JSON.stringify({ users: ["xmdtest-alice"] }));\n  }\n  s.end("ok");\n}).listen(Number(process.env.PORT) || 4173, "0.0.0.0");\n`;
  const checks = [
    { id: "admin-noauth", type: "http", url: "http://127.0.0.1:4173/api/admin", method: "GET", expectStatus: 401 },
    { id: "admin-auth", type: "http", url: "http://127.0.0.1:4173/api/admin", method: "GET", expectStatus: 200, headers: { Authorization: "Bearer xmdtest-admin" }, bodyContains: "xmdtest-alice" },
  ];
  const plan = PLAN(checks, "node server.js");
  try {
    await seed(sbx, { "server.js": server(false) }, "xmdtest-t29 T2: /api/admin is PUBLIC (bug)");
    const a = await captureTechEvidence(sbx, { milestoneId: "M1", round: 0, planMarkdown: plan });
    for (const c of a.checks.filter((x) => x.id.startsWith("plan/"))) log("BEFORE", c.id, c.result, "—", c.detail.split("\n")[0]);
    await seed(sbx, { "server.js": server(true) }, "xmdtest-t29 T2: fix — /api/admin requires a bearer token");
    const b = await captureTechEvidence(sbx, { milestoneId: "M1", round: 1, planMarkdown: plan });
    for (const c of b.checks.filter((x) => x.id.startsWith("plan/"))) log("AFTER ", c.id, c.result, "—", c.detail.split("\n")[0]);
    const r = await sbx.commands.run("curl -s -o /dev/null -w '%{http_code}' --max-time 2 http://127.0.0.1:4173/ ; true", { timeoutMs: 20_000 });
    log("server after checks (000 = stopped):", String(r.stdout).trim());
    const neg = (x) => x.checks.find((c) => c.id === "plan/admin-noauth")?.result;
    log("T2", neg(a) === "FAIL" && neg(b) === "PASS" && b.checks.find((c) => c.id === "plan/admin-auth")?.result === "PASS" ? "PASS" : "FAIL");
  } finally { await sbx.raw.kill(); log("sandbox killed"); }
}

if (which === "t3") {
  const { execFileSync } = await import("child_process");
  const sql = (q) => execFileSync("node", ["/tmp/pgtool/sql.js", "-e", q], { encoding: "utf8" }).trim();
  const { defaultDbProbe } = await jiti.import(`${ROOT}/src/lib/milestone/dbProbe.ts`);
  const { runChecks } = await jiti.import(`${ROOT}/src/lib/milestone/checks.ts`);
  const noSbx = { files: { write: async () => {}, read: async () => "" }, commands: { run: async () => ({ stdout: "" }) } };
  const checks = [{ id: "plan/nors-rls", type: "db", table: "xmdtest_nors", rls: true }, { id: "plan/sessions-rls", type: "db", table: "boardroom_sessions", rls: true }];
  try {
    log("create:", sql("create table if not exists public.xmdtest_nors (id bigserial primary key, note text); insert into public.xmdtest_nors(note) values ('xmdtest-t29'); notify pgrst, 'reload schema';"));
    log("catalog:", sql("select relname, relrowsecurity from pg_class where relname = 'xmdtest_nors'"));
    const db = defaultDbProbe();
    log("db probe configured:", !!db, "(Supabase client, service key from env — not printed)");
    const a = await runChecks(checks, { sbx: noSbx, ws: "/w", db });
    for (const c of a.results) log("RLS OFF →", c.id, c.result, "—", c.detail);
    log("enable RLS:", sql("alter table public.xmdtest_nors enable row level security;"));
    const b = await runChecks(checks.slice(0, 1), { sbx: noSbx, ws: "/w", db });
    log("RLS ON  →", b.results[0].id, b.results[0].result, "—", b.results[0].detail);
    log("T3", a.results[0].result === "FAIL" && /DISABLED/.test(a.results[0].detail) && b.results[0].result === "PASS" ? "PASS" : "FAIL");
  } finally {
    log("cleanup:", sql("drop table if exists public.xmdtest_nors; notify pgrst, 'reload schema';"));
    log("after cleanup:", sql("select count(*) from pg_class where relname = 'xmdtest_nors'"));
  }
}
if (which === "fx") { // node real.mjs fx <profile.json> — R0 technical evidence ya fixture (kabla ya Koyeb)
  const j = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));
  const sbx = await sandbox();
  try {
    await seed(sbx, j.files, "xmdtest-t29 fixture");
    const t = await captureTechEvidence(sbx, { milestoneId: "M1", round: 0, planMarkdown: j.planMarkdown });
    log("summary:", techEvidenceSummary(t));
    for (const c of t.checks) log(c.id, c.result, "—", c.detail.split("\n")[0].slice(0, 160));
  } finally { await sbx.raw.kill(); log("sandbox killed"); }
}
process.exit(0);
