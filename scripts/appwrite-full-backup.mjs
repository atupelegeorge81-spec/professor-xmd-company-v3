// appwrite-full-backup.mjs — BACKUP KAMILI ya Appwrite: schema + documents ZOTE + files ZOTE za bucket.
// Tumia:  cd /home/user/professor-xmd-company && node /home/user/r40-audit/appwrite-full-backup.mjs
// (inatumia node-appwrite ya repo). Inahitaji bandwidth ya Appwrite kuwa WAZI (sio 402).
// Output: /home/user/r40-audit/appwrite-backup-<YYYYMMDD-HHmm>/

import { Client, Databases, Storage, Query } from "node-appwrite";
import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const env = JSON.parse(readFileSync("/home/user/r40-audit/prod-env.json", "utf8"));
const OUT = join("/home/user/r40-audit", "appwrite-backup-" + new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ""));
mkdirSync(OUT, { recursive: true });
mkdirSync(join(OUT, "files"), { recursive: true });

const client = new Client()
  .setEndpoint(env.APPWRITE_ENDPOINT)
  .setProject(env.APPWRITE_PROJECT_ID)
  .setKey(env.APPWRITE_API_KEY);
const db = new Databases(client);
const st = new Storage(client);

const log = (m) => console.log(`[${new Date().toISOString().slice(11, 19)}] ${m}`);
let totalDocs = 0, totalFiles = 0, errors = 0;

async function safe(name, fn) {
  try { return await fn(); } catch (e) {
    errors++; log(`❌ ${name}: ${String(e?.message || e).slice(0, 140)}`); return null;
  }
}

log("=== 1. DATABASES ===");
// SDK hii haina listDatabases — tunatumia DB yetu inayojulikana (env) + null-check ya health
const health = await safe("ping (listCollections ya DB yetu)", () => db.listCollections(env.APPWRITE_DATABASE_ID, [Query.limit(1)]));
if (!health) {
  log("⛔ Appwrite haitajiwi (402 ama network) — backup haiwezekani SASA. Fungua bandwidth kwanza.");
  process.exit(1);
}
const dbIds = [{ id: env.APPWRITE_DATABASE_ID, name: "(known)" }];
writeFileSync(join(OUT, "databases.json"), JSON.stringify({ known: dbIds, note: "SDK hii haina listDatabases; DB ya env" }, null, 1));
log(`databases: ${dbIds.map((d) => d.id).join(", ")}`);

for (const { id: dbId } of dbIds) {
  log(`=== 2. COLLECTIONS za ${dbId} ===`);
  const cols = [];
  let cursor = null;
  do {
    const page = await safe("collections.list", () => db.listCollections(dbId, cursor ? [Query.cursorAfter(cursor)] : [Query.limit(100)]));
    if (!page) break;
    cols.push(...page.collections);
    cursor = page.collections.length ? page.collections[page.collections.length - 1].$id : null;
  } while (cursor);
  writeFileSync(join(OUT, `collections-${dbId}.json`), JSON.stringify(cols, null, 1));
  log(`collections: ${cols.length}`);

  for (const col of cols) {
    // --- schema kamili (attributes + indexes) ---
    const attrs = await safe(`attributes ${col.$id}`, () => db.listAttributes(dbId, col.$id));
    const idxs = await safe(`indexes ${col.$id}`, () => db.listIndexes(dbId, col.$id));
    writeFileSync(join(OUT, `schema-${col.$id}.json`), JSON.stringify({ collection: col, attributes: attrs, indexes: idxs }, null, 1));

    // --- documents ZOTE (paged) ---
    let docs = [], cur = null, n = 0;
    do {
      const page = await safe(`docs ${col.$id}+${n}`, () => db.listDocuments(dbId, col.$id, cur ? [Query.cursorAfter(cur), Query.limit(500)] : [Query.limit(500)]));
      if (!page) break;
      docs.push(...page.documents);
      n += page.documents.length;
      cur = page.documents.length ? page.documents[page.documents.length - 1].$id : null;
    } while (cur);
    writeFileSync(join(OUT, `docs-${col.$id}.json`), JSON.stringify(docs, null, 1));
    totalDocs += docs.length;
    log(`  ${col.name || col.$id}: schema(${attrs?.attributes?.length ?? "?"} attrs) + ${docs.length} docs`);
  }
}

log("=== 3. BUCKETS + FILES ===");
const buckets = await safe("buckets.list", () => st.listBuckets());
if (buckets) {
  writeFileSync(join(OUT, "buckets.json"), JSON.stringify(buckets, null, 1));
  for (const b of buckets.buckets) {
    let cur = null, n = 0;
    do {
      const page = await safe(`files ${b.$id}+${n}`, () => st.listFiles(b.$id, cur ? [Query.cursorAfter(cur), Query.limit(100)] : [Query.limit(100)]));
      if (!page) break;
      for (const f of page.files) {
        const dl = await safe(`download ${b.$id}/${f.$id}`, () => st.getFileDownload(b.$id, f.$id));
        if (dl) {
          const buf = Buffer.from(dl);
          writeFileSync(join(OUT, "files", `${b.$id}__${f.$id}__${(f.name || "file").replace(/[^\w.-]/g, "_")}`), buf);
          totalFiles++;
        }
        n++;
      }
      cur = page.files.length ? page.files[page.files.length - 1].$id : null;
    } while (cur);
    log(`  bucket ${b.name || b.$id}: files ${n}`);
  }
}

log(`=== IMEKAMILIKA: docs ${totalDocs} · files ${totalFiles} · makosa ${errors} ===`);
log(`Backup ipo: ${OUT}`);
if (errors === 0 && totalDocs > 0) log("✅ KILA LOTHING limehifadhiwa — schema + data + files.");
