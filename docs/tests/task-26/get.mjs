// get.mjs <sessionPrefix|sid> <key> [out.json]
import fs from "node:fs";
import { createJiti } from "/home/user/xmd-home/professor-xmd-company/node_modules/jiti/lib/jiti.mjs";
const REPO = "/home/user/xmd-home/professor-xmd-company";
for (const l of fs.readFileSync(`${REPO}/.env.local`, "utf8").split("\n")) { const m = /^([A-Z0-9_]+)=(.*)$/.exec(l); if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^"|"$/g, ""); }
process.env.XMD_MILESTONES = "1";
const jiti = createJiti(import.meta.url, { alias: { "@": `${REPO}/src` } });
const store = await jiti.import(`${REPO}/src/lib/milestone/store.ts`);
const r = await store.getRecord(process.argv[2], process.argv[3]);
const s = JSON.stringify(r?.data ?? null, null, 1);
if (process.argv[4]) fs.writeFileSync(process.argv[4], s); else console.log(s.slice(0, 4000));
process.exit(0);
