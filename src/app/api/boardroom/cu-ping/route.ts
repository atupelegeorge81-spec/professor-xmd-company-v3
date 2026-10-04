import { Sandbox, E2B } from "@e2b/code-interpreter";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R31 · diagnostics — 403 ya E2B kutoka Koyeb: nini hasa kinazuiliwa?
 *  GET /api/boardroom/cu-ping — inajaribu: api.e2b.app + api.e2b.dev (fetch + sandbox create),
 *  headers za jibu (server/CF), na tofauti ya User-Agent. Hakuna siri inayotoka (key = "…" prefix tu). */
export async function GET(req: Request) {
  const key = process.env.E2B_API_KEY || "";
  const out: Record<string, unknown> = {
    hasKey: !!key,
    keyPrefix: key.slice(0, 8) + "…",
    ts: new Date().toISOString(),
  };

  const probe = async (label: string, url: string, ua?: string) => {
    try {
      const res = await fetch(url, {
        headers: { "X-API-Key": key, ...(ua ? { "User-Agent": ua } : {}) },
        signal: AbortSignal.timeout(20_000),
      });
      const body = await res.text();
      return {
        status: res.status,
        server: res.headers.get("server"),
        cfRay: res.headers.get("cf-ray") ? "cloudflare" : null,
        contentType: res.headers.get("content-type"),
        bodyHead: body.slice(0, 220).replace(/\s+/g, " "),
      };
    } catch (e: any) {
      return { error: String(e?.message || e).slice(0, 220) };
    }
  };

  // 1) fetch moja kwa moja kwa domeni zote mbili + variant ya UA ya browser
  out.e2bApp = await probe("api.e2b.app", "https://api.e2b.app/v1/templates");
  out.e2bDev = await probe("api.e2b.dev", "https://api.e2b.dev/v1/templates");
  out.e2bAppBrowserUA = await probe("api.e2b.app UA", "https://api.e2b.app/v1/templates", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36");

  // 2) Sandbox.create ya kawaida (domain default = e2b.app)
  try {
    const sbx = await Sandbox.create("professor-xmd-browser-v3", { apiKey: key, timeoutMs: 30_000 });
    out.createDefault = { ok: true, sandboxId: sbx.sandboxId };
    await sbx.kill().catch(() => {});
  } catch (e: any) {
    out.createDefault = { ok: false, name: e?.name, message: String(e?.message || e).slice(0, 300) };
  }

  // 3) Sandbox.create kwenye domain e2b.dev (client mwenye domain option)
  try {
    const client = new E2B({ apiKey: key, domain: "e2b.dev" });
    const sbx = await client.Sandbox.create("professor-xmd-browser-v3", { timeoutMs: 30_000 });
    out.createDevDomain = { ok: true, sandboxId: sbx.sandboxId };
    await sbx.kill().catch(() => {});
  } catch (e: any) {
    out.createDevDomain = { ok: false, name: e?.name, message: String(e?.message || e).slice(0, 300) };
  }

  // 4) reachability ya SANDBOX edge (subdomain ya sandbox maalum) kutoka Koyeb —
  //    GET ?sbx=<sandboxId> (sandbox inaweza kuwa hai kutoka mahali pengine)
  const sbxId = new URL(req.url).searchParams.get("sbx");
  if (sbxId && /^[a-z0-9]+$/i.test(sbxId)) {
    const probeSbx = async (label: string, url: string) => {
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(15_000), redirect: "manual" });
        const body = await res.text();
        return { status: res.status, server: res.headers.get("server"), bodyHead: body.slice(0, 160).replace(/\s+/g, " ") };
      } catch (e: any) {
        return { error: String(e?.message || e).slice(0, 160) };
      }
    };
    out.sbxEdge = await probeSbx("sandbox-3000", `https://${sbxId}-3000.e2b.app/`);
    out.sbxEdgeBogus = await probeSbx("bogus", `https://zzzz-nonexistent-${sbxId.slice(0, 4)}-3000.e2b.app/`);
  }

  return Response.json(out);
}
