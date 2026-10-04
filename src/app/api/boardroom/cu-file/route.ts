import { storage, SCREENSHOTS_BUCKET } from "@/lib/server/appwrite";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** R31 · XMD Computer — picha za screenshots (Appwrite bucket) kwa UI.
 *  Proxy ya server (client haina keys za Appwrite) · GET /api/boardroom/cu-file?bucket=…&file=…
 *  Bucket default = SCREENSHOTS_BUCKET ya CU. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const file = url.searchParams.get("file") || "";
  const bucket = url.searchParams.get("bucket") || SCREENSHOTS_BUCKET;
  // IDs za Appwrite ni alphanumeric/dash/underscore tu — kinga ya path injection
  if (!file || !/^[A-Za-z0-9_-]{1,64}$/.test(file) || !/^[A-Za-z0-9_-]{1,64}$/.test(bucket)) {
    return new Response("Bad request", { status: 400 });
  }
  try {
    const buf = await storage.getFileDownload(bucket, file);
    return new Response(Buffer.from(buf as unknown as Uint8Array), {
      headers: {
        "Content-Type": "image/png",
        "Cache-Control": "public, max-age=86400, immutable",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
