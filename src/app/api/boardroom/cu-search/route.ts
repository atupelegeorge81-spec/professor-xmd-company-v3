// src/app/api/boardroom/cu-search/route.ts — R32 · XMD Computer: search engine kama MCP tool.
//
// Bridge (ndani ya E2B) inaita route hii kupitia tool ya "mcp__xmd-search__web_search" —
// agent ya XMD Computer inapata search engine yenyewe (SearXNG + Appwrite cache ya semantic,
// yaani searchWeb() ileile ya src/lib/search.ts) bila kuwasha WebSearch ya server-side ya
// Anthropic (haitekelezeki kupitia cuBrain).
//
// Auth: Bearer token ya run (pattern ya cu-event). Runner asiopo/token isiyo sahihi → 401:
// bridge ina fallback ya SearXNG moja kwa moja, kwa hiyo tool haifi hata Koyeb ikilala.
import { findRunner } from "@/lib/boardRunner";
import { searchWeb } from "@/lib/search";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false }, { status: 400 });
  }
  const query = String(body?.query || "").trim();
  if (!query) return Response.json({ ok: false, error: "query ni tupu" }, { status: 400 });
  const maxResults = Math.max(1, Math.min(Number(body?.max_results) || 5, 10));

  const runner = findRunner(String(body?.session || ""));
  const auth = req.headers.get("authorization") || "";
  if (!runner?.cu || auth !== `Bearer ${runner.cu.token}`) {
    return Response.json({ ok: false, error: "token" }, { status: 401 });
  }

  try {
    const results = await searchWeb(query.slice(0, 300));
    const shaped = (results || []).slice(0, maxResults).map((r: any) => ({
      title: String(r?.title || "").slice(0, 300),
      url: String(r?.url || ""),
      snippet: String(r?.content || "").slice(0, 800),
    }));
    return Response.json({ ok: true, results: shaped });
  } catch (err: any) {
    return Response.json({ ok: false, error: String(err?.message || err).slice(0, 200) }, { status: 500 });
  }
}
