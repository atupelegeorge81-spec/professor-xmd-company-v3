// src/lib/broker/online.ts — R20: MTANDAO UKIKATIKA, BOARD INASUBIRI (haichomi lanes wala haiachi kazi nusu).
// Chanzo (Mama Lishe, 27 Sep): mtandao ulikatika wakati wa ripoti → kila lane ilitupa "fetch failed" → broker
// aliyachukulia kama makosa ya provider (transient), akazungusha mpaka lanes zikaisha, kipande 2/2 kikafeli na
// kuhifadhi Appwrite kukashindwa bila kurudiwa. Sasa:
//   • isNetworkError — kosa lisilo na HTTP status + code ya mtandao (ENOTFOUND, ECONNRESET, "fetch failed"…)
//   • isOnline      — HEAD fupi kwa endpoints 3 (yoyote ikijibu → mtandao upo); cache 3s
//   • waitOnline    — inasubiri (kila 10s) mpaka mtandao urudi; Detach/Stop (signal) inaikata
//   • onNetState    — Board inaonyesha "📡 Mtandao umekatika — Board inasubiri" mara moja kwa kila tukio

const CODES = /\b(?:ENOTFOUND|EAI_AGAIN|ECONNRESET|ECONNREFUSED|ECONNABORTED|ETIMEDOUT|ENETUNREACH|EHOSTUNREACH|ENETDOWN|EPIPE|UND_ERR_CONNECT_TIMEOUT|UND_ERR_SOCKET|UND_ERR_HEADERS_TIMEOUT)\b/;
const WORDS = /fetch failed|connection error|network ?error|socket hang up|other side closed|getaddrinfo|terminated/i;

/** kosa la mtandao (si la provider): hakuna HTTP status + dalili za mtandao kwenye error/cause */
export function isNetworkError(err: any): boolean {
  if (!err || Number(err?.status) > 0) return false;
  const parts: string[] = [];
  let e: any = err;
  for (let d = 0; e && d < 4; d++, e = e.cause) parts.push(String(e.code || ""), String(e.name || ""), String(e.message || ""), String(e.constructor?.name || ""));
  const s = parts.join(" ");
  return CODES.test(s) || WORDS.test(s) || /APIConnectionError|APIConnectionTimeoutError/.test(s);
}

const PROBES = () =>
  (process.env.XMD_ONLINE_PROBES || "https://www.gstatic.com/generate_204,https://cloudflare.com/cdn-cgi/trace,https://api.unorouter.com/")
    .split(",").map((s) => s.trim()).filter(Boolean);

let last = { at: 0, ok: true };

export async function isOnline(fresh = false): Promise<boolean> {
  if (!fresh && Date.now() - last.at < 3000) return last.ok;
  const ok = await Promise.any(
    PROBES().map((u) =>
      fetch(u, { method: "HEAD", cache: "no-store", signal: AbortSignal.timeout(5000) }).then((r) => {
        if (r.status >= 500 && r.status !== 503) throw new Error(String(r.status));
        return true;
      }),
    ),
  ).catch(() => false);
  last = { at: Date.now(), ok };
  return ok;
}

type NetFn = (offline: boolean) => void;
const G = globalThis as unknown as { __xmdNet?: { offline: boolean; subs: Set<NetFn> } };
const net = (G.__xmdNet ||= { offline: false, subs: new Set() });

export function onNetState(fn: NetFn): () => void {
  net.subs.add(fn);
  return () => net.subs.delete(fn);
}
function setOffline(v: boolean) {
  if (net.offline === v) return;
  net.offline = v;
  for (const f of net.subs) { try { f(v); } catch { /* */ } }
}

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((res) => {
    if (signal?.aborted) return res();
    const onAbort = () => { clearTimeout(t); res(); };
    const t = setTimeout(() => { signal?.removeEventListener("abort", onAbort); res(); }, ms);
    signal?.addEventListener("abort", onAbort, { once: true });
  });

/**
 * Subiri mpaka mtandao urudi. Inarudi `true` mtandao ukirudi, `false` kama signal (Detach/Stop) imekata,
 * au kama mtandao ulikuwepo tangu mwanzo (kosa halikuwa la mtandao) → mwitaji aendelee kama kawaida.
 */
export async function waitOnline(signal?: AbortSignal, everyMs = Number(process.env.XMD_ONLINE_EVERY_MS) || 10_000): Promise<boolean> {
  last.at = 0;
  if (await isOnline()) return false;
  setOffline(true);
  try {
    while (!signal?.aborted) {
      await sleep(everyMs, signal);
      last.at = 0;
      if (await isOnline()) return true;
    }
    return false;
  } finally {
    last.at = 0;
    if (await isOnline()) setOffline(false);
  }
}
