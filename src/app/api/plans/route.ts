import { NextRequest } from "next/server";
import { getPlanBySession, getPlanByProject, ensurePlans, PROJECT_PLANS_COL } from "@/lib/server/plans";
import { databases, DB } from "@/lib/server/appwrite";

export const dynamic = "force-dynamic";

/**
 * R30 · /api/plans — Mpango Kazi wa Agent kwa computer-use agent.
 * GET /api/plans                      → orodha ya mipango (metadata tu — plan_content haipaki)
 * GET /api/plans?session=<id>         → mpango MMOJA kamili (session_id) · header X-Plan-Status
 * GET /api/plans?project=<id>         → mpango MMOJA kamili (project_id)
 * GET /api/plans?session=<id>&download=1 → file ya .md (Content-Disposition: attachment)
 * Mlipuko: JSON kama makosa. Indexes zinajibootstrap (ensurePlans) kwenye ombi la kwanza.
 */
export async function GET(req: NextRequest) {
  const session = req.nextUrl.searchParams.get("session");
  const project = req.nextUrl.searchParams.get("project");
  const download = req.nextUrl.searchParams.get("download");

  try {
    if (session || project) {
      const plan = session ? await getPlanBySession(session) : await getPlanByProject(project || "");
      if (!plan) {
        return Response.json(
          { error: "plan_not_found", hint: `Hakuna Mpango Kazi kwa ${session ? `session ${session}` : `project ${project}`}. Ndani ya Board, plan mode huandika mpango baada ya Validator (HATUA 6.6).` },
          { status: 404 },
        );
      }
      if (download) {
        const fname = `work-plan-${String(plan.session_id || "").slice(0, 8) || "session"}.md`;
        return new Response(plan.plan_content, {
          headers: {
            "Content-Type": "text/markdown; charset=utf-8",
            "Content-Disposition": `attachment; filename="${fname}"`,
            "X-Plan-Status": plan.status,
            "X-Plan-Steps": String(plan.total_steps || 0),
          },
        });
      }
      return Response.json(
        { plan },
        { headers: { "X-Plan-Status": plan.status, "X-Plan-Steps": String(plan.total_steps || 0) } },
      );
    }

    // orodha (metadata tu — plan_content inaweza kuwa 900K; computer-use agent lazima aombe moja moja)
    await ensurePlans();
    const { documents } = await databases.listDocuments(DB, PROJECT_PLANS_COL, []);
    return Response.json({
      plans: documents
        .map((d) => ({
          session_id: d.session_id, project_id: d.project_id, title: d.title, objective: d.objective,
          status: d.status, total_steps: d.total_steps, updated_at: d.$updatedAt,
        }))
        .sort((a, b) => String(b.updated_at || "").localeCompare(String(a.updated_at || ""))),
    });
  } catch (err) {
    return Response.json({ error: "plans_api_failed", detail: String((err as Error)?.message || err) }, { status: 500 });
  }
}
