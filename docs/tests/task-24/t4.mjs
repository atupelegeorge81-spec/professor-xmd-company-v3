// T24 T4: acceptance checks za COs (store cos:M1 ya run A2) → runChecks (task 21) ndani ya E2B dhidi ya site ya CEO iliyo hai
import fs from "node:fs";
import { createJiti } from "/home/user/xmd-home/professor-xmd-company/node_modules/jiti/lib/jiti.mjs";
const REPO = "/home/user/xmd-home/professor-xmd-company";
for (const l of fs.readFileSync(`${REPO}/.env.local`, "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
const jiti = createJiti(import.meta.url, { alias: { "@": `${REPO}/src` } });
const { runChecks } = await jiti.import(`${REPO}/src/lib/milestone/checks.ts`);
const { Sandbox } = await import(`${REPO}/node_modules/e2b/dist/index.mjs`);
const BASE = "https://professor-xmd-professorcj-2c4d4efe.koyeb.app";
const cos = JSON.parse(fs.readFileSync(process.argv[2], "utf8")).changeOrders;
const checks = cos.flatMap((c) => c.acceptance.map((a) => ({ ...a, id: `${c.id}/${a.id}` })));
const sbx = await Sandbox.create(process.env.CU_E2B_TEMPLATE || "professor-xmd-browser-v3", { apiKey: process.env.E2B_API_KEY, timeoutMs: 30 * 60_000, metadata: { purpose: "xmdtest-t24" } });
console.log("sandbox", sbx.sandboxId);
try {
  const ws = "/home/user/xmdtest-t24";
  await sbx.commands.run(`mkdir -p ${ws}`, { user: "user" });
  const { results, ms } = await runChecks(checks, { sbx, ws, script: fs.readFileSync(`${REPO}/cu/xmd-evidence.mjs`, "utf8"), base: BASE, tag: "t24" });
  for (const r of results) console.log(`${r.result.padEnd(5)} ${r.id} [${r.type}] ${String(r.detail).replace(/\s+/g, " ").slice(0, 200)}`);
  const n = (k) => results.filter((r) => r.result === k).length;
  console.log(`TOTAL ${results.length} · PASS ${n("PASS")} · FAIL ${n("FAIL")} · ERROR ${n("ERROR")} · ${ms}ms`);
  fs.writeFileSync("/home/user/xmdtest/t24/t4-results.json", JSON.stringify(results, null, 1));
} finally { await sbx.kill(); console.log("killed", sbx.sandboxId); }
process.exit(0);
