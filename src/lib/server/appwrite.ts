// src/lib/server/appwrite.ts — R42: FACADE YA SUPABASE (Appwrite imeondolewa kabisa).
// Muundo umebadilika LAKINI signature imebaki ileile: files 30+ zinazo-import
// { databases, storage, DB, SESSIONS_COL, REPORTS_COL, SCREENSHOTS_BUCKET, appwriteConfigured }
// hazibadilishwi — shim hii inaitafsisha Appwrite-style → Supabase (Postgres 17 + Storage).
//  - docs: table ya Postgres (TABLES cfg kwenye supabase.ts); JSONB "data" ina-flatten kwenye read,
//    ina-merge kwenye write — code inaona doc "ya Appwrite" yenye $id + fields zote flat.
//  - Query/ID za node-appwrite zinaendelea (helpers tu — hakuna API call).
//  - Storage: bucket ya Supabase (public read kwa restore ya E2B); createFile → upload,
//    download → Buffer. Public URL: publicFileUrl().
import { randomUUID } from "node:crypto";
import {
  supabase, supabaseConfigured, SUPABASE_BUCKET, publicFileUrl, tableOf, type TableCfg,
} from "./supabase";

export const appwriteConfigured = supabaseConfigured;
export { supabase, supabaseConfigured, publicFileUrl };

// R31 · bucket ya screenshots + ws-snapshots (Supabase: "professor-xmd-files", public read)
export const SCREENSHOTS_BUCKET = SUPABASE_BUCKET;
export const DB = "supabase"; // R42.1: Supabase — thamani ya kitambulisho tu (shim inai-ignore)
export const REPORTS_COL = process.env.REPORTS_COLLECTION_ID || "reports";
export const SESSIONS_COL = "boardroom_sessions";

/* --------------------------------------------------------------- helpers */

type Q = { method: string; attribute?: string; values?: unknown[] };

const idColOf = (cfg: TableCfg) => cfg.idCol || "id";

/** jina la column ya PostgREST kwa attribute ya doc (column halisi au JSONB extraction). */
function colOf(cfg: TableCfg, attr: string): string {
  if (attr === "$id") return idColOf(cfg);
  if (attr === "$createdAt" || attr === "$updatedAt") return attr === "$createdAt" ? "created_at" : "updated_at";
  if (cfg.cols.includes(attr)) return attr;
  if (cfg.jsonb) return `${cfg.jsonb}->>${attr}`; // PostgREST jsonb extraction
  return attr;
}

/** row ya Postgres → doc "ya Appwrite" (flatten: data JSONB + real cols + $id/$createdAt). */
function rowToDoc(row: any, cfg: TableCfg): any {
  const idc = idColOf(cfg);
  const out: any = { ...(cfg.jsonb ? (row[cfg.jsonb] || {}) : {}) };
  for (const c of cfg.cols) if (row[c] !== undefined && row[c] !== null) out[c] = row[c];
  out.$id = row[idc];
  out.$createdAt = row.created_at;
  if (cfg.jsonb && row[cfg.jsonb]) out[cfg.jsonb] = row[cfg.jsonb];
  return out;
}

/** payload ya doc → row ya Postgres (real cols direct; vinginevyo kwenye JSONB data). */
function docToRow(cfg: TableCfg, payload: any): any {
  const row: any = {};
  const rest: any = {};
  for (const [k, v] of Object.entries(payload || {})) {
    if (k === "$id" || k === "$createdAt") continue;
    if (cfg.cols.includes(k)) row[k] = v;
    else if (cfg.jsonb) rest[k] = v;
    // table ya columns halisi: keys zisizo columns zinapuuzwa (schema ni kamili)
  }
  if (cfg.jsonb) row[cfg.jsonb] = rest;
  return row;
}

const cleanErr = (scope: string, e: unknown): Error => {
  const msg = String((e as Error)?.message || e);
  return new Error(`[supabase:${scope}] ${msg}`);
};

/* ------------------------------------------------------- databases shim */
// Types ni za loose (any) kwa makusudi — façade ya Appwrite SDK ambayo callers 30+ zinarudisha docs za any.

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyRec = any;

export const databases = {
  async listDocuments(_db: string, collectionId: string, queries: any[] = []): Promise<{ documents: any[]; total: number }> {
    const cfg = tableOf(collectionId);
    const idc = idColOf(cfg);
    let q = supabase.from(cfg.table).select("*");
    let limit = 25; // default ya Appwrite
    let offset = 0;
    let cursor: string | null = null;
    for (const qq of queries || []) {
      const attr = qq.attribute ? colOf(cfg, qq.attribute) : "";
      const vals = (qq.values || []) as any[];
      switch (qq.method) {
        case "equal": q = vals.length > 1 ? q.in(attr, vals) : q.eq(attr, vals[0]); break;
        case "notEqual": q = q.neq(attr, vals[0]); break;
        case "greaterThan": q = q.gt(attr, vals[0]); break;
        case "greaterThanEqual": q = q.gte(attr, vals[0]); break;
        case "lessThan": q = q.lt(attr, vals[0]); break;
        case "lessThanEqual": q = q.lte(attr, vals[0]); break;
        case "search": q = q.ilike(attr, `%${String(vals[0])}%`); break;
        case "contains": q = q.ilike(attr, `%${String(vals[0])}%`); break;
        case "isNull": q = q.is(attr, null); break;
        case "isNotNull": q = q.not(attr, "is", null); break;
        case "orderAsc": cursor === null && attr !== idc && (q = q.order(attr, { ascending: true })); break;
        case "orderDesc": cursor === null && attr !== idc && (q = q.order(attr, { ascending: false })); break;
        case "limit": limit = Number(vals[0]) || 25; break;
        case "offset": offset = Number(vals[0]) || 0; break;
        case "cursorAfter": cursor = String(vals[0]); break;
        case "select": break; // inarudisha zote (fields nyingi zinahitajika downstream)
        default: break;
      }
    }
    if (cursor !== null) q = q.order(idc, { ascending: true }).gt(idc, cursor);
    const from = offset, to = offset + limit - 1;
    const { data, error, count } = await q.range(from, to);
    if (error) throw cleanErr(`list ${cfg.table}`, error);
    return { documents: (data || []).map((r) => rowToDoc(r, cfg)), total: count ?? (data || []).length };
  },

  async getDocument(_db: string, collectionId: string, docId: string): Promise<any> {
    const cfg = tableOf(collectionId);
    const { data, error } = await supabase.from(cfg.table).select("*").eq(idColOf(cfg), docId).maybeSingle();
    if (error) throw cleanErr(`get ${cfg.table}/${docId}`, error);
    if (!data) throw new Error(`Document not found: ${cfg.table}/${docId}`);
    return rowToDoc(data, cfg);
  },

  async createDocument(_db: string, collectionId: string, docId: string, data: any): Promise<any> {
    const cfg = tableOf(collectionId);
    const idc = idColOf(cfg);
    const id = !docId || docId === "unique()" ? randomUUID() : docId;
    const row = docToRow(cfg, data || {});
    row[idc] = id;
    if (cfg.cols.includes("created_at") && !row.created_at) row.created_at = new Date().toISOString();
    const { data: created, error } = await supabase.from(cfg.table).insert(row).select("*").single();
    if (error) throw cleanErr(`create ${cfg.table}`, error);
    return rowToDoc(created, cfg);
  },

  async updateDocument(_db: string, collectionId: string, docId: string, data: any): Promise<any> {
    const cfg = tableOf(collectionId);
    const idc = idColOf(cfg);
    const patch = docToRow(cfg, data || {});
    if (cfg.jsonb) {
      // JSONB: merge na data iliyopo (Appwrite update = partial merge)
      const { data: existing } = await supabase.from(cfg.table).select(cfg.jsonb).eq(idc, docId).maybeSingle();
      const prev = (existing as AnyRec | null)?.[cfg.jsonb] as AnyRec | null;
      if (prev) patch[cfg.jsonb] = { ...prev, ...(patch[cfg.jsonb] as AnyRec) };
    }
    if (cfg.cols.includes("updated_at")) patch.updated_at = new Date().toISOString();
    const { data: updated, error } = await supabase.from(cfg.table).update(patch).eq(idc, docId).select("*").maybeSingle();
    if (error) throw cleanErr(`update ${cfg.table}/${docId}`, error);
    if (!updated) throw new Error(`Document not found: ${cfg.table}/${docId}`);
    return rowToDoc(updated, cfg);
  },

  async deleteDocument(_db: string, collectionId: string, docId: string): Promise<Record<string, never>> {
    const cfg = tableOf(collectionId);
    const { error } = await supabase.from(cfg.table).delete().eq(idColOf(cfg), docId);
    if (error) throw cleanErr(`delete ${cfg.table}/${docId}`, error);
    return {};
  },

  /* ---- schema stubs (agentChatsSchema auto-heal — Postgres schema inaundwa kwa SQL, si runtime) ---- */
  async listAttributes(_opts: AnyRec): Promise<AnyRec> { return { attributes: [], total: 0 }; },
  async getAttribute(opts: AnyRec): Promise<AnyRec> { return { ...opts, status: "available" }; },
  async createStringAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createVarcharAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createMediumtextAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createIntegerAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createEnumAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createBooleanAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createFloatAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async createDatetimeAttribute(o: AnyRec): Promise<AnyRec> { return { ...o, status: "available" }; },
  async listIndexes(o: AnyRec): Promise<AnyRec> { return { indexes: [], total: 0, ...o }; },
  async createIndex(...args: any[]): Promise<any> {
    // styles mbili: object (agentChatsSchema) na positional (miniReports/plans): (DB, COL, key, type, attrs)
    const o = typeof args[0] === "object" && args[0] !== null ? args[0] : { databaseId: args[0], collectionId: args[1], key: args[2], type: args[3], attributes: args[4] };
    return { ...o, status: "available" };
  },
  async getCollection(o: any): Promise<any> { return { ...o, attributes: [], indexes: [] }; },
  async createCollection(o: any): Promise<any> { return { ...o, attributes: [], indexes: [] }; },
};

/* -------------------------------------------------------- storage shim */

export const storage = {
  async createFile(bucketId: string, fileId: string, file: any): Promise<any> {
    const id = !fileId || fileId === "unique()" ? randomUUID() : fileId;
    const body = (file && typeof file === "object" && "data" in file) ? file.data : file;
    const { error } = await supabase.storage.from(bucketId || SUPABASE_BUCKET).upload(id, body, { upsert: true });
    if (error) throw cleanErr(`upload ${bucketId}/${id}`, error);
    return { $id: id, name: file?.name || id, bucketId };
  },

  async getFileDownload(bucketId: string, fileId: string): Promise<Buffer> {
    const { data, error } = await supabase.storage.from(bucketId || SUPABASE_BUCKET).download(fileId);
    if (error) throw cleanErr(`download ${bucketId}/${fileId}`, error);
    const blob = data as unknown as Blob;
    if (blob && typeof blob.arrayBuffer === "function") return Buffer.from(await blob.arrayBuffer());
    return Buffer.from(data as any);
  },

  async getFileView(bucketId: string, fileId: string): Promise<AnyRec> {
    return { $id: fileId, publicUrl: publicFileUrl(bucketId || SUPABASE_BUCKET, fileId) };
  },

  async listFiles(bucketId: string, queries: any[] = []): Promise<any> {
    let limit = 100, offset = 0;
    for (const q of queries || []) {
      if (q.method === "limit") limit = Number((q.values || [100])[0]);
      if (q.method === "offset") offset = Number((q.values || [0])[0]);
    }
    const { data, error } = await supabase.storage.from(bucketId || SUPABASE_BUCKET).list("", { limit, offset, sortBy: { column: "created_at", order: "desc" } });
    if (error) throw cleanErr(`listFiles ${bucketId}`, error);
    return { files: (data || []).map((f: AnyRec) => ({ ...f, $id: f.name, bucketId })) };
  },

  async updateFile(): Promise<AnyRec> { return {}; }, // public bucket — hakuna permissions za kusasisha
  async getBucket(bucketId: string): Promise<AnyRec> { return { $id: bucketId || SUPABASE_BUCKET, name: bucketId || SUPABASE_BUCKET }; },
  async listBuckets(): Promise<AnyRec> { return { buckets: [{ $id: SUPABASE_BUCKET, id: SUPABASE_BUCKET, name: SUPABASE_BUCKET }] }; },
};
