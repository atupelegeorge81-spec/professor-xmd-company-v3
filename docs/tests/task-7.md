# TASK 7 (maelezo7) — `/api/live` (liveness bila DB) · ushahidi (2026-10-17)

Branch `task/7-api-live` · main **be96671** · Koyeb deploy **571ed21e HEALTHY**.

## Mabadiliko
| Faili | Nini |
|---|---|
| src/app/api/live/route.ts (mpya) | `dynamic = "force-dynamic"`, `runtime = "nodejs"`; `GET` → `Response.json({ ok: true, t: Date.now() })`, status 200, `Cache-Control: no-store`. Hakuna import yoyote. |
| src/instrumentation.ts | Keep-alive inapiga `/api/live` badala ya `/api/health`. Test-only `XMD_TEST_KEEPALIVE_MS` hufanya kazi TU chini ya `XMD_TEST_HOOKS=1` (mdundo mfupi, na inaruhusu dev server). Bila env hiyo, tabia ni ileile: 60s kisha kila dk 4, production pekee. Koyeb haina `XMD_TEST_KEEPALIVE_MS`, kwa hiyo haina athari huko. |
| src/app/api/health/route.ts | **Haijaguswa** (deep check ya DB kwa binadamu). |

## T1 — DB env batili (`SUPABASE_URL=http://127.0.0.1:9`, key batili) · `next dev` (webpack) port 3100
```
live   200 0.018731
live   200 0.015182
live   200 0.019757
live   200 0.016787
live   200 0.024478
health 503 7.029223
health 503 7.029226
live headers+body: HTTP/1.1 200 OK cache-control: no-store {"ok":true,"t":1792247066077}
health body: {"ok":false,"appwrite":"unreachable"}
```
**PASS**: live 200 ndani ya < 0.1s (15–24ms), na health si 200 (503, tabia ileile).
Kumbuka: kwa `next dev --turbopack` live ilikuwa ~0.25s kila ombi. Hiyo ni overhead ya Turbopack dev, kwa sababu webpack dev
kwenye code ileile inatoa 11–24ms. Production (Koyeb) haitumii dev server.

## T2 — env sahihi (.env.local)
```
live   200 0.021892
live   200 0.014205
live   200 0.019883
health 200 0.825448
health 200 0.842751
health 200 0.223187
health body: {"ok":true,"appwrite":"ok"}
```
**PASS**: zote mbili 200.

## T3 — import graph
```
$ grep -n "import" src/app/api/live/route.ts
(grep exit=1 → mistari 0: hakuna import yoyote)
$ grep -n "from " src/app/api/live/route.ts
(grep exit=1)
```
**PASS**.

## T4 — keep-alive inapiga `/api/live`
Server (T1) iliwashwa na `XMD_TEST_HOOKS=1 XMD_TEST_KEEPALIVE_MS=5000 CU_PUBLIC_URL=http://127.0.0.1:9999`. Server ndogo ya
kunasa (xmdtest/kacap.py, port 9999) iliandika kila ombi:
```
14:22:14.268 GET /api/live ua=node
14:22:19.267 GET /api/live ua=node
14:22:24.262 GET /api/live ua=node
…   (kila ~5s)
14:24:54.901 GET /api/live ua=node
```
**PASS**: maombi 32, yote `GET /api/live`, na **0** ya `/api/health`.

## Post-deploy smoke (Koyeb 571ed21e)
```
live   200 total=0.793190 … ttfb=0.793018   (ombi la kwanza: muunganisho mpya)
live   200 total=0.918224 … ttfb=0.285187
live   200 total=0.231035 … ttfb=0.230836
live   200 total=0.280541 … ttfb=0.280406
live   200 total=0.237233 … ttfb=0.237035
headers: HTTP/2 200 cache-control: no-store · body: {"ok":true,"t":1792247422124}
msingi wa mtandao: /favicon.ico 404 ttfb≈0.25s · /api/live ttfb 0.23–0.26s · /api/health ttfb 0.39–0.51s
```
**PASS**: 5/5 ni 200. Muda wa live ≈ msingi wa mtandao kutoka sandbox hadi Koyeb (≈0.25s), kwa hiyo kazi ya server ni ms chache,
na live ina kasi kuliko health (DB).

## Baselines
tsc 0 · vitest 282 + 2 skipped · pytest 308 · unittest 238 OK · eslint (route.ts, instrumentation.ts) 0. Hakuna mabadiliko.

## Data
Hakuna data ya majaribio iliyoandikwa. Server ya env sahihi iliendesha boot scan ya kawaida (sweeper iliruka 88ef0a2d,
ambayo ni paused na si system), na haikubadilisha kitu. Swap ya muda (/swapxmd) imeondolewa.

## Hatua ya CEO
Koyeb → Service → Health checks: HTTP path `/api/live`, port = 3000 (port ya app), grace period ≥ 60s.
Sijabadilisha settings za Koyeb (maelezo7).
