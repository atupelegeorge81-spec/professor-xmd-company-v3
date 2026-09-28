#!/usr/bin/env node
// scripts/appwrite-agent-chats.mjs
// Inaunda collection ya mazungumzo ya vyumba binafsi vya agents (Agent chat) kwenye Appwrite.
//
//   npm run setup:agent-chats            → unda / kamilisha collection (salama kurudia)
//   npm run setup:agent-chats -- --dry   → onyesha mpango tu, bila kugusa Appwrite
//
// Inasoma: APPWRITE_ENDPOINT, APPWRITE_PROJECT_ID, APPWRITE_API_KEY, APPWRITE_DATABASE_ID
//          Collection: ID 6ab6d7990026978d4ba9 · jina agent_conversations (tayari ndani ya script — hakuna env inayohitajika)
// kutoka .env.local / .env (au environment). API key inahitaji scopes: collections.read/write,
// attributes.read/write, indexes.read/write (na documents.read/write kwa app yenyewe).
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { Client, Databases, DatabasesIndexType, OrderBy } from "node-appwrite";

/* ---------------- env ---------------- */
for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || process.env[m[1]] !== undefined) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
}
const DRY = process.argv.includes("--dry");
const { APPWRITE_ENDPOINT: ENDPOINT, APPWRITE_PROJECT_ID: PROJECT, APPWRITE_API_KEY: KEY, APPWRITE_DATABASE_ID: DB } = process.env;

/* ---------------- muundo: scripts/agent-chats.schema.json (server inasoma faili hilo hilo) ---------------- */
const SCHEMA = JSON.parse(readFileSync(new URL("./agent-chats.schema.json", import.meta.url), "utf8"));
export const COLUMNS = SCHEMA.columns;
export const INDEXES = SCHEMA.indexes;
const MEDIUMTEXT_MAX = SCHEMA.mediumtextMax;
// Collection ID imewekwa moja kwa moja (6ab6d7990026978d4ba9). Env inaweza kuibadilisha, ila "agent_conversations"
// ni JINA la collection, si ID — likiandikwa kwenye env linapuuzwa.
const ENV_COL = (process.env.AGENT_CHATS_COLLECTION_ID || "").trim();
const COL = ENV_COL && ENV_COL !== SCHEMA.name ? ENV_COL : SCHEMA.collectionId;

function plan() {
  console.log(`\nCollection: ${SCHEMA.name} · ID ${COL}  (database: ${DB || "<APPWRITE_DATABASE_ID>"})\n`);
  console.log("Column              Type        Size / range           Required  Maelezo");
  console.log("------------------  ----------  ---------------------  --------  ----------------------------------------");
  for (const c of COLUMNS) {
    const size = c.type === "varchar" ? String(c.size) : c.type === "mediumtext" ? `${MEDIUMTEXT_MAX.toLocaleString("en")} (4 MB)` : c.type === "integer" ? `${c.min ?? "-∞"} … ${c.max?.toLocaleString("en") ?? "max"}` : c.type === "enum" ? c.elements.join(" | ") : "—";
    console.log(`${c.key.padEnd(18)}  ${c.type.padEnd(10)}  ${size.padEnd(21)}  ${(c.required ? "yes" : "no").padEnd(8)}  ${c.note}`);
  }
  console.log("\nIndexes:");
  for (const i of INDEXES) console.log(`  ${i.key.padEnd(22)} key  [${i.attributes.join(", ")}]  — ${i.note}`);
  console.log("");
}

if (DRY) { plan(); process.exit(0); }
const missing = [["APPWRITE_ENDPOINT", ENDPOINT], ["APPWRITE_PROJECT_ID", PROJECT], ["APPWRITE_API_KEY", KEY], ["APPWRITE_DATABASE_ID", DB]].filter(([, v]) => !v).map(([k]) => k);
if (missing.length) {
  console.error(`❌ Env hazipo: ${missing.join(", ")} — ziweke kwenye .env.local kisha rudia.`);
  process.exit(1);
}

const client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT).setKey(KEY);
const db = new Databases(client);
const base = { databaseId: DB, collectionId: COL };
const code = (e) => e?.code ?? e?.response?.code;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let legacy = false; // seva ya zamani bila varchar/mediumtext → string

async function createColumn(c) {
  const common = { ...base, key: c.key, required: c.required };
  const asString = (size) => db.createStringAttribute({ ...common, size });
  switch (c.type) {
    case "varchar":
      if (legacy) return asString(c.size);
      try { return await db.createVarcharAttribute({ ...common, size: c.size }); }
      catch (e) { if ([404, 400, 405].includes(code(e)) && !/already exists/i.test(e?.message || "")) { legacy = true; return asString(c.size); } throw e; }
    case "mediumtext":
      if (legacy) return asString(MEDIUMTEXT_MAX);
      try { return await db.createMediumtextAttribute(common); }
      catch (e) { if ([404, 400, 405].includes(code(e)) && !/already exists/i.test(e?.message || "")) { legacy = true; return asString(MEDIUMTEXT_MAX); } throw e; }
    case "integer": return db.createIntegerAttribute({ ...common, ...(c.min !== undefined ? { min: c.min } : {}), ...(c.max !== undefined ? { max: c.max } : {}) });
    case "enum": return db.createEnumAttribute({ ...common, elements: c.elements });
    case "boolean": return db.createBooleanAttribute(common);
    default: throw new Error(`type isiyojulikana: ${c.type}`);
  }
}

async function waitAvailable(key) {
  for (let i = 0; i < 60; i++) {
    const a = await db.getAttribute({ ...base, key }).catch(() => null);
    if (a?.status === "available") return true;
    if (a?.status === "failed" || a?.status === "stuck") throw new Error(`${key}: ${a.status} ${a.error || ""}`);
    await sleep(1000);
  }
  throw new Error(`${key}: haikuwa "available" ndani ya sekunde 60`);
}

async function main() {
  plan();
  // 1) collection
  try {
    await db.getCollection(base);
    console.log(`✓ Collection "${COL}" ipo tayari`);
  } catch (e) {
    if (code(e) !== 404) throw e;
    await db.createCollection({ ...base, name: SCHEMA.name, permissions: [], documentSecurity: false, enabled: true });
    console.log(`✓ Collection "${COL}" imeundwa (server API key pekee ndiyo inaweza kusoma/kuandika)`);
  }

  // 2) columns
  for (const c of COLUMNS) {
    try {
      await createColumn(c);
      console.log(`  + ${c.key} (${legacy && (c.type === "varchar" || c.type === "mediumtext") ? "string" : c.type})`);
    } catch (e) {
      if (code(e) === 409) { console.log(`  = ${c.key} ipo tayari`); continue; }
      throw new Error(`Column ${c.key}: ${e?.message || e}`);
    }
  }
  if (legacy) console.log("  ℹ️ Seva hii haina varchar/mediumtext — string ya ukubwa ule ule imetumika (Appwrite inaichagulia hifadhi sahihi).");

  process.stdout.write("  … inasubiri columns ziwe tayari");
  for (const c of COLUMNS) await waitAvailable(c.key);
  console.log(" ✓");

  // 3) indexes
  for (const i of INDEXES) {
    try {
      await db.createIndex({ ...base, key: i.key, type: DatabasesIndexType.Key, attributes: i.attributes, orders: i.orders.map((o) => (o === "desc" ? OrderBy.Desc : OrderBy.Asc)) });
      console.log(`  + index ${i.key}`);
    } catch (e) {
      if (code(e) === 409) console.log(`  = index ${i.key} ipo tayari`);
      else console.warn(`  ⚠️ index ${i.key} haikuundwa (${e?.message || e}) — app bado inafanya kazi, ila queries zitakuwa polepole.`);
    }
  }

  console.log(`\n✅ Tayari. Collection ${SCHEMA.name} (ID ${COL}) iko kamili — app inaitumia moja kwa moja.`);
  console.log("   Kisha anzisha app upya (npm run dev / npm start). Header ya chat itaonyesha \"Appwrite\".\n");
}

main().catch((e) => {
  console.error(`\n❌ ${e?.message || e}`);
  if (code(e) === 401) console.error("   API key haina ruhusa — ongeza scopes: collections.*, attributes.*, indexes.*, documents.*");
  process.exit(1);
});
