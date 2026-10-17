// TASK-4 — test ya ziada (CEO): isPlanExecutable kwenye plans HALISI zilizohifadhiwa (Supabase project_plans).
// Inaendeshwa TU ikiwa XMD_REAL_PLANS=1 + SUPABASE_URL/SUPABASE_SERVICE_KEY (vinginevyo imerukwa).
// Inasoma tu (read-only) — haibadilishi data yoyote.
import { describe, expect, it } from "vitest";
import { unpack } from "../server/packed";
import { isPlanExecutable } from "./planGate";

const URL_ = process.env.SUPABASE_URL || "";
const KEY = process.env.SUPABASE_SERVICE_KEY || "";
const run = process.env.XMD_REAL_PLANS === "1" && !!URL_ && !!KEY;

describe.skipIf(!run)("TASK-4 — plans halisi (Supabase)", () => {
  it("plans 9 za mwisho zilizoendeshwa vizuri: HAKUNA inayozuiwa; ikivunjwa muundo: inazuiwa", async () => {
    const r = await fetch(`${URL_}/rest/v1/project_plans?select=session_id,updated_at,data&order=updated_at.desc&limit=9`, {
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
});
