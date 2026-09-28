// src/lib/server/agentChatsSchema.ts — muundo wa collection ya Agent chat + kujikamilisha (auto-heal).
// Chanzo kimoja: scripts/agent-chats.schema.json (script ya setup inasoma faili hilo hilo).
// Mara ya kwanza server inapoandika/kusoma: inahakikisha collection + columns + indexes zipo; zinazokosekana
// zinaundwa. Haizuii kamwe kazi ya chat — ikishindwa (mf. API key haina scopes) inaandika log tu.
import { DatabasesIndexType, OrderBy } from "node-appwrite";
import SCHEMA from "../../../scripts/agent-chats.schema.json";
import { appwriteConfigured, databases, DB } from "./appwrite";

type Column = { key: string; type: string; size?: number; min?: number; max?: number; elements?: string[]; required: boolean };
type Index = { key: string; attributes: string[]; orders: string[] };

/** ID ya collection: imewekwa moja kwa moja. Env inaweza kuibadilisha — ila "agent_conversations" ni JINA, si ID, hivyo linapuuzwa. */
const ENV_COL = (process.env.AGENT_CHATS_COLLECTION_ID || "").trim();
export const AGENT_CHATS_COL: string = ENV_COL && ENV_COL !== SCHEMA.name ? ENV_COL : SCHEMA.collectionId;
export const AGENT_CHATS_NAME: string = SCHEMA.name;

const log = (msg: string) => console.log(`[agent-chats] ${msg}`);
const code = (e: unknown) => (e as { code?: number })?.code;
const msgOf = (e: unknown) => (e as Error)?.message || String(e);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface SchemaResult { ok: boolean; created: string[]; error?: string; ms: number }
let running: Promise<SchemaResult> | null = null;
let legacy = false; // seva bila varchar/mediumtext → string

async function createColumn(c: Column) {
  const base = { databaseId: DB, collectionId: AGENT_CHATS_COL, key: c.key, required: c.required };
  const asString = (size: number) => databases.createStringAttribute({ ...base, size });
  const fallback = (e: unknown) => [400, 404, 405].includes(code(e) ?? 0) && !/already exists/i.test(msgOf(e));
  switch (c.type) {
    case "varchar":
      if (legacy) return asString(c.size!);
      try { return await databases.createVarcharAttribute({ ...base, size: c.size! }); }
      catch (e) { if (fallback(e)) { legacy = true; return asString(c.size!); } throw e; }
    case "mediumtext":
      if (legacy) return asString(SCHEMA.mediumtextMax);
      try { return await databases.createMediumtextAttribute(base); }
      catch (e) { if (fallback(e)) { legacy = true; return asString(SCHEMA.mediumtextMax); } throw e; }
    case "integer":
      return databases.createIntegerAttribute({ ...base, ...(c.min !== undefined ? { min: c.min } : {}), ...(c.max !== undefined ? { max: c.max } : {}) });
    case "enum": return databases.createEnumAttribute({ ...base, elements: c.elements! });
    case "boolean": return databases.createBooleanAttribute(base);
    default: throw new Error(`type isiyojulikana: ${c.type}`);
  }
}

async function waitAvailable(keys: string[]) {
  for (let i = 0; i < 40 && keys.length; i++) {
    const states = await Promise.all(keys.map((key) => databases.getAttribute({ databaseId: DB, collectionId: AGENT_CHATS_COL, key }).then((a) => (a as { status?: string }).status).catch(() => "")));
    keys = keys.filter((_, j) => states[j] !== "available" && states[j] !== "failed");
    if (keys.length) await sleep(750);
  }
}

async function run(): Promise<SchemaResult> {
  const t0 = Date.now();
  const created: string[] = [];
  const ref = { databaseId: DB, collectionId: AGENT_CHATS_COL };
  try {
    let col: { attributes?: { key: string }[]; indexes?: { key: string }[] };
    try {
      col = (await databases.getCollection(ref)) as typeof col;
    } catch (e) {
      if (code(e) !== 404) throw e;
      col = (await databases.createCollection({ ...ref, name: AGENT_CHATS_NAME, permissions: [], documentSecurity: false, enabled: true })) as typeof col;
      created.push(`collection:${AGENT_CHATS_NAME}`);
      log(`collection "${AGENT_CHATS_NAME}" (ID ${AGENT_CHATS_COL}) imeundwa`);
    }
    const have = new Set((col.attributes || []).map((a) => a.key));
    const newCols: string[] = [];
    for (const c of SCHEMA.columns as Column[]) {
      if (have.has(c.key)) continue;
      try { await createColumn(c); newCols.push(c.key); created.push(c.key); }
      catch (e) { if (code(e) !== 409) log(`column ${c.key} haikuundwa: ${msgOf(e)}`); }
    }
    if (newCols.length) { log(`columns zimeongezwa: ${newCols.join(", ")} — zinasubiriwa ziwe tayari…`); await waitAvailable(newCols); }
    const haveIdx = new Set((col.indexes || []).map((i) => i.key));
    for (const i of SCHEMA.indexes as Index[]) {
      if (haveIdx.has(i.key)) continue;
      try {
        await databases.createIndex({ ...ref, key: i.key, type: DatabasesIndexType.Key, attributes: i.attributes, orders: i.orders.map((o) => (o === "desc" ? OrderBy.Desc : OrderBy.Asc)) });
        created.push(`index:${i.key}`);
      } catch (e) { if (code(e) !== 409) log(`index ${i.key} haikuundwa (${msgOf(e)}) — chat bado inafanya kazi`); }
    }
    const ms = Date.now() - t0;
    log(created.length ? `muundo umekamilishwa (${created.join(", ")}) · ${ms}ms` : `muundo uko kamili (collection ${AGENT_CHATS_COL}) · ${ms}ms`);
    return { ok: true, created, ms };
  } catch (e) {
    const ms = Date.now() - t0;
    const error = code(e) === 401
      ? `API key haina ruhusa ya kusoma/kuunda muundo (ongeza scopes collections.*, attributes.*, indexes.*): ${msgOf(e)}`
      : msgOf(e);
    log(`ukaguzi wa muundo umeshindwa · ${ms}ms · ${error}`);
    return { ok: false, created, error, ms };
  }
}

/** Mara moja kwa kila process (au tena kwa force=true baada ya "Unknown attribute"). Ikishindwa, inajaribiwa tena baada ya 30s. */
export function ensureAgentChatsSchema(force = false): Promise<SchemaResult> {
  if (!appwriteConfigured) return Promise.resolve({ ok: false, created: [], error: "Appwrite env haijawekwa", ms: 0 });
  if (!running || force) {
    const p = run();
    running = p;
    p.then((r) => { if (!r.ok) setTimeout(() => { if (running === p) running = null; }, 30_000); });
  }
  return running;
}
