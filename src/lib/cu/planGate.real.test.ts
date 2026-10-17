// TASK-4 — test ya ziada (CEO): isPlanExecutable kwenye plans HALISI zilizohifadhiwa (Supabase project_plans).
// Inaendeshwa TU ikiwa XMD_REAL_PLANS=1 + SUPABASE_URL/SUPABASE_SERVICE_KEY (vinginevyo imerukwa).
// Inasoma tu (read-only) — haibadilishi data yoyote.
import { describe, expect, it } from "vitest";
import { unpack } from "../server/packed";
import { isPlanExecutable } from "./planGate";
import { getPlanBySession } from "../server/plans";

const URL_ = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
const run = process.env.XMD_REAL_PLANS === "1" && !!URL_ && !!KEY;
// plans 9 za mwisho KABLA ya Task 4 (plans za majaribio ya T3 — mf. sabotage guard_failed — hazihesabiwi)
const CUTOFF = process.env.XMD_REAL_PLANS_BEFORE || "2026-10-17T00:00:00Z";

describe.skipIf(!run)("TASK-4 — plans halisi (Supabase)", () => {
  it("plans 9 za mwisho zilizoendeshwa vizuri: HAKUNA inayozuiwa; ikivunjwa muundo: inazuiwa", async () => {
    const r = await fetch(`${URL_}/rest/v1/project_plans?select=session_id,updated_at,data&order=updated_at.desc&limit=9&updated_at=lt.${CUTOFF}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const rows = (await r.json()) as { session_id: string; updated_at: string; data: any }[];
    expect(rows.length).toBe(9);
    for (const row of rows) {
      const d = row.data || {};
      const md = unpack(d.plan_content);
      const gate = isPlanExecutable({ status: d.status, md, warnings: d.warnings });
      console.log(`[real-plan] ${String(row.session_id).slice(0, 8)} status=${d.status} steps=${d.total_steps} chars=${md.length} -> ok=${gate.ok}${gate.reasons.length ? ` reasons=${gate.reasons.join(" | ")}` : ""}`);
      expect(gate.ok, `${row.session_id}: ${gate.reasons.join(" | ")}`).toBe(true);
      // muundo uliovunjwa (sehemu 7 imeondolewa) kwenye plan halisi ileile → lazima izuiwe
      const broken = md.replace(/^##\s*7\.[^\n]*\n[\s\S]*?(?=^##\s*8\.)/m, "");
      expect(broken.length).toBeLessThan(md.length);
      const g2 = isPlanExecutable({ status: d.status, md: broken });
      expect(g2.ok).toBe(false);
      expect(g2.reasons.join(" | ")).toMatch(/sehemu 7/);
    }
  }, 30_000);

  it("warnings zilizohifadhiwa zinarudi kupitia getPlanBySession (njia ya API/gate/ripoti)", async () => {
    const r = await fetch(`${URL_}/rest/v1/project_plans?select=session_id,data&order=updated_at.desc&limit=20`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
    });
    const rows = ((await r.json()) as { session_id: string; data: any }[]).filter((x) => Array.isArray(x.data?.warnings) && x.data.warnings.length);
    if (!rows.length) return console.log("[real-plan] hakuna plan yenye warnings bado — imerukwa");
    for (const row of rows) {
      const doc = await getPlanBySession(row.session_id);
      console.log(`[real-plan-warnings] ${row.session_id.slice(0, 8)} db=${JSON.stringify(row.data.warnings)} doc=${JSON.stringify(doc?.warnings)}`);
      expect(doc?.warnings).toEqual(row.data.warnings);
    }
  }, 30_000);
});
