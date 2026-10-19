// TASK 29 (maelezo29) — DB checks kupitia Supabase client HALISI (service key ya harness, server pekee).
// Table ipo + RLS: rpc `xmd_table_security` (docs/sql/xmd_table_security.sql). Function haipo → table inapimwa kwa
// select (head) na RLS inarudi `null` (check ya rls → ERROR yenye maelekezo — kamwe si PASS ya kubuni).
// Database: XMD_PROJECT_SUPABASE_URL + XMD_PROJECT_SUPABASE_SERVICE_KEY (database ya mradi) au Supabase ya XMD.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import ws from "ws"; // Node 20 haina native WebSocket — supabase-js (realtime) inahitaji transport (kama server/supabase.ts)
import type { DbProbe, DbProbeResult } from "./checks";
import type { DbCheck } from "./types";

const MISSING_FN = /PGRST202|could not find the function|xmd_table_security/i;
const MISSING_TABLE = /PGRST205|42P01|does not exist|could not find the table/i;

/** Probe juu ya client yoyote (vitest inaiga `rpc`/`from`). */
export function supabaseDbProbe(client: Pick<SupabaseClient, "rpc" | "from" | "schema">): DbProbe {
  return async (c: DbCheck): Promise<DbProbeResult> => {
    const schema = c.schema || "public";
    const r = await client.rpc("xmd_table_security", { p_schema: schema, p_table: c.table });
    if (!r.error) {
      const row = (Array.isArray(r.data) ? r.data[0] : r.data) as { table_exists?: boolean; rls_enabled?: boolean } | null;
      return { exists: !!row?.table_exists, rls: row?.table_exists ? !!row.rls_enabled : null, detail: "via rpc xmd_table_security" };
    }
    const why = `${r.error.code || ""} ${r.error.message || ""}`;
    if (!MISSING_FN.test(why)) return { exists: false, rls: null, detail: `rpc failed: ${why.trim().slice(0, 200)}` };
    // function haipo kwenye database hii → kuwepo kwa table tu
    const q = await (schema === "public" ? client.from(c.table) : client.schema(schema).from(c.table)).select("*", { head: true, count: "exact" });
    if (q.error && MISSING_TABLE.test(`${q.error.code || ""} ${q.error.message || ""}`)) return { exists: false, rls: null, detail: "table not found via REST" };
    if (q.error) return { exists: false, rls: null, detail: `select failed: ${`${q.error.code || ""} ${q.error.message || ""}`.trim().slice(0, 200)}` };
    return { exists: true, rls: null, detail: "RLS unknown — apply docs/sql/xmd_table_security.sql to this database" };
  };
}

/** Probe ya harness (null = hakuna database iliyosanidiwa → db checks ERROR). */
export function defaultDbProbe(env: Record<string, string | undefined> = process.env): DbProbe | undefined {
  const url = (env.XMD_PROJECT_SUPABASE_URL || env.SUPABASE_URL || "").replace(/\/$/, "");
  const key = env.XMD_PROJECT_SUPABASE_SERVICE_KEY || env.SUPABASE_SERVICE_KEY || "";
  if (!url || !key) return undefined;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false }, realtime: { transport: ws as never } });
  return supabaseDbProbe(client);
}
