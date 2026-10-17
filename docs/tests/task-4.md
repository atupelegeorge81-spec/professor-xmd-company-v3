# Task 4 — CU Adaptive Brain (2026-10-16)

Chanzo: maelekezo ya CEO `CU-ADAPTIVE-BRAIN-IMPLEMENTATION.md` + `CU-ADAPTIVE-BRAIN.patch` + `CU-ADAPTIVE-BRAIN-CHANGES.txt`.
Branch: `task/4-cu-adaptive-brain` · Rollback: `backup/pre-adaptive-brain` = `ac9c5a3` (main kabla ya kazi hii).
Backend kwenye Koyeb: `CU_AGENT_BACKEND` haijawekwa → default `openhands` (engine.ts). `CU_OPENROUTER_MODELS` /
`CU_UNOROUTER_MODELS` / `GEMINI_LITE_MODELS` hazijawekwa → defaults za CU. Groq keys za Board zipo bila kuguswa.

## Mabadiliko

| # | Badiliko | Chanzo |
|---|---|---|
| 1 | Patch ya CEO imeingizwa juu ya `ac9c5a3` (`git apply --check` safi): roster mpya, weighted dispatch 11-slot, judge Ultra→Lightning, quotas/timeouts kwa family, daily cooldown hadi reset, `GEMINI_MODEL_SKIP` 2.5-flash kwa akaunti 2–4, Groq/XKiro nje ya CU, allowlists | patch |
| 2 | `env.ts`: `GEMINI_LITE_MODELS` ya **Board** imerudishwa kuwa Lite 2 — patch ingeipa Board preview/latest kwa 500 RPD (policy ya Board ingebadilika). CU ina Lite 4 yake ndani ya `engine.ts` | review |
| 3 | Judge: verdict tupu / si JSON / timeout = failure ya lane (`empty`, inaandikwa log) → judge mbadala. Baada ya majibu batili mfululizo, jibu la mwisho linarudishwa na SDK hulisoma `complete=False` — **kamwe si complete** | spec §3 |
| 4 | Judge core sasa ina `event_cb` — makosa ya judge yanaonekana (awali yalikuwa kimya) | spec §3 |
| 5 | Harness ikikataa baada ya judge "complete" → agent anarudishiwa failures halisi za checks na kuendelea (`XMD_HARNESS_ROUNDS`, default 3) badala ya STUCK papo hapo. Raundi zikiisha → STUCK kama awali | spec §3 |
| 6 | RPM ya Uno: lane ileile (Ultra ya executor tier-2 + Ultra ya judge) inashiriki dirisha moja la 60s | review |
| 7 | OpenRouter: akiba ya judge 10/account — executor husimama 40, judge hufika 50 (hesabu moja ya account) | spec §2 |
| 8 | Afya ya **model** kwa accounts zote: 5xx/timeout/tupu → adhabu 10 kwa dirisha 120s (429/daily hazihusiki) | **bug ya live run 11** |

## Majaribio ya local

| Jaribio | Matokeo |
|---|---|
| pytest `cu/tests` | 283 passed (patch peke yake: 269) |
| unittest (`npm run cu:test`) | 220 OK |
| `tsc --noEmit` | 0 errors |
| vitest | 212/212 (tests 2 za `GEMINI_MODEL_SKIP` zilisasishwa kwa skip mpya ya akaunti 2–4) |
| eslint `.` | errors 34 = 34 za baseline `ac9c5a3` (zote UI/backups — hakuna mpya) |
| Mutation check | kuzima validator ya judge → tests 3 zinafeli; kuzima shared RPM → test 1 inafeli |
| `next build` | haikuendeshwa kwenye sandbox (agizo la CEO) — Koyeb build HEALTHY |

Regression tests mpya: `cu/tests/test_adaptive_brain.py` (14).

## Roster inspection (env halisi → `buildCuConfig()` → `lanes.build_pools()`; majina tu)

- **main 43 lanes:**
  - Flash: 3.8 / 3.7 / 3.6 / 3.5 / 3-preview ×4 projects, na 2.5 kwenye gemini-1 pekee. Timeout 65s, 20 RPD.
  - Lite: 3.5 / 3.1 kwa 500 RPD, preview / latest kwa **20** RPD. Timeout 90s.
  - Uno: minimax, deepseek-v4.1 (×2 accounts), Ultra tier-2.
- **dharura 4:** OR Lightning + Ultra ×2 accounts.
- **judge 4:** Uno Ultra ×2 (r10), OR Lightning ×2 (r900).
- **Hazipo:** Groq, XKiro, laguna, north, kimi, codestral, deepseek-v4-flash.

## Live judge (raw API, prompt ya SDK `JUDGE_PROMPT`) — 2026-10-16 19:31 UTC

| Account | Model | Kesi | Matokeo | Sekunde |
|---|---|---|---|---|
| uno-2 | nemotron-3-ultra | FAIL (madai bila ushahidi) | `complete=false`, score 0 ✅ | 12.8 |
| or-1 | nemotron-3.5-lightning | PASS (ushahidi halisi) | `complete=true`, score 1 ✅ | 15.1 |
| or-2 | nemotron-3.5-lightning | FAIL | `complete=false`, score 0 ✅ | 15.7 |
| uno-1 | nemotron-3-ultra | PASS | 429 (`remaining 0`, free = **5/min**) — account inatumiwa na mfumo mwingine nje ya mradi | 0.6 |

Uno ilieleza limit wazi: Ultra = 5 req/min, minimax = 1 req/min kwa kila account. Code inabaki na 1/min (agizo la CEO).

## Live run 11 — Koyeb main `39ce504` (deploy 3301b24d), session `xmdtest-final11` (T3: hello.txt)

- **Matokeo:**
  - finalState **COMPLETED_UNVERIFIED** (bridge `done`), harness imepita.
  - Requests 23, muda 914s, tokens 508k.
- **Mgawanyo wa families:**

  | Family | Requests | Models |
  |---|---|---|
  | Flash | 9 | 3.8 ×1, 3.7 ×5, 3.6 ×2, 3.5 ×1 |
  | Lite | 7 | 3.1 ×4, 3.5 ×3 |
  | Uno | 3 | minimax |
  | OR | 2 | Lightning (executor) |

  Uwiano ≈ ratiba 4:4:2:1, na **OR imepata traffic ya kawaida**.
- **Judge:** Uno **Ultra uno-2**, raundi 1. Lightning haikuhitajika.
- **Bug iliyopatikana:** 3.8-flash ilifeli 503 → timeout 65s → timeout 65s kwenye accounts 3 (>2 dk). → Badiliko #8.

## Live run 12 — Koyeb main `8aa6d2c` (deploy 429abf9d), session `xmdtest-final12` (Node: calc.js + node:test + README)

- **Matokeo:**
  - finalState **COMPLETED_UNVERIFIED** (bridge `done`), harness imepita.
  - Requests 38, muda 1144s, tokens 1.05M.
  - `npm test` iliendeshwa kweli (exit 0, output → `.xmd/evidence/step-03.txt`).
- **Afya ya model live:** 3.8-flash 503 → 3.7 (si 3.8 kwenye account nyingine) timeout → 3.6 503 → Lite. Model 3 mbovu zimepitwa ndani ya ~80s; run 11 ilipoteza >2 dk kwenye 3.8 peke yake.
- **Judge pass/fail live:** Ultra uno-2 raundi 1 = **kataa** → agent aliendesha amri za uthibitisho → raundi 2 = **kubali**. Lightning haikuhitajika.
- **Mgawanyo wa families:**

  | Family | Requests | Models |
  |---|---|---|
  | Flash | 13 | 3-preview ×6, 3.5 ×4, 3.6 ×2, 2.5 ×1 (gemini-1 pekee) |
  | Lite | 15 | 3.1 ×6, 3.5 ×5, 3.1-preview ×4 |
  | Uno | 4 | minimax |
  | OR | 3 | Lightning |

  Uno ilipata chini ya 2/11 kwa sababu uno-1 ilikuwa 429 (inatumiwa nje ya mradi).

## Quota counters (server ledger, mara baada ya run 12)

| Account | Counter |
|---|---|
| or-1 | 23 req leo |
| or-2 | 11 req leo (account nzima: executor + judge) |
| gemini-1 | 3.8-flash 20/20 (daily), 3.5-lite 18/500, 3.1-lite 1/500, 2.5-flash 1/20 |
| gemini-2 / 3 / 4 | kwa project × model kama hapo juu; hakuna 2.5-flash ✅ |

## Muhtasari wa matokeo

| Tarehe | Commit (main) | Backend | Jaribio | Judge | Matokeo | Muda |
|---|---|---|---|---|---|---|
| 2026-10-16 | 39ce504 | openhands | run 11 (T3 hello.txt) | Uno Ultra ×1 | ✅ COMPLETED_UNVERIFIED, harness ✓ | 914s / 23 req |
| 2026-10-16 | 8aa6d2c | openhands | run 12 (Node + npm test) | Uno Ultra ×2 (kataa → kubali) | ✅ COMPLETED_UNVERIFIED, harness ✓ | 1144s / 38 req |

Kwa kulinganisha: runs 8–10 (kabla ya kazi hii) zote ziliishia **STUCK**.

## Yaliyobaki / tahadhari (si sehemu ya patch)

1. **Harness-continuation live:** katika runs 11–12 harness ilipita mara ya kwanza, kwa hiyo njia ya "harness inakataa → agent anarudishiwa ushahidi" imethibitishwa na regression tests tu (4) na mutation check — haijatokea live bado. Continuation ya **judge** (kataa → endelea) imethibitishwa live (run 12).
2. **Quota manager ni ya kila process** (spec §6): CU husoma ledger mwanzoni mwa run tu; Board ikitumia Gemini wakati huohuo, CU haioni matumizi hayo hadi run inayofuata. Runs 11–12 zilienda sambamba na Board bila kosa, lakini broker ya pamoja (atomic reservation) itahitajika kwa mzigo mkubwa — inahitaji uamuzi wa CEO.
3. **uno-1 inatumiwa na mfumo mwingine** (Ultra 5/5 kwa dakika, remaining 0 bila run yetu) — router inaheshimu Retry-After na kuhamia uno-2, lakini uwezo wa Uno umepungua nusu.
4. **Usage UI** haionyeshi safu za Lite preview/latest (snapshot inatumia list ya Board). CU inazisoma sawa kutoka ledger — ni suala la kuonyesha tu.
5. Events za `features` (harness) na notes za lane failures hazihifadhiwi kwenye `boardroom_sessions.items` — ushahidi wa lane failures umetoka kwenye stream ya `/api/boardroom/resume`.


## Usafi
Sessions za majaribio (`xmdtest-*`) + plans/mini-reports zake zimefutwa baada ya kutoa ushahidi.

## Task 4b — marekebisho ya issues 4 (2026-10-16, main `1dbf30a`, deploy d9f1769d HEALTHY)

| # | Issue | Rekebisho | Ushahidi |
|---|---|---|---|
| 1 | Quota ni ya kila process (§6) | `POST /api/boardroom/cu-quota` (Bearer token ya run) hutoa snapshot ya ledger ya server (Board + CU). Sandbox (`QuotaSync` ndani ya `acquire`) huisoma kila 60s → `max(local, server)`; kosa la mtandao = kimya | tests 2 (Board 20/20 → CU inaiona papo hapo; throttle; hesabu haishuki; kosa kimya) · live: endpoint ipo, token mbaya → 401 |
| 2 | uno-1 inatumiwa nje ya mradi | Haiwezi kurekebishwa kwa code — 21:07 UTC uno-1 Ultra 429 `remaining 0` bila run yetu; uno-2 200. Router inaheshimu Retry-After → uno-2 | probe live |
| 3 | Ultra 5/dk | `UNO_RPM_BY_MODEL` = Ultra 5/dk kwa account (minimax/deepseek 1); executor + judge dirisha moja | tests (rpm 5, judge 10 Uno kabla ya OR) |
| 4 | Usage UI haikuonyesha Lite preview/latest | `cuLiteModels()`/`cuLiteRpd()` (env.ts) chanzo kimoja kwa engine.ts + usageSnapshot.ts | vitest 4 · live `/api/usage/accounts`: Lite 4 (500, 500, 20, 20) |

Baselines: pytest 285 · unittest OK · tsc 0 · vitest 216/216 · eslint (files zilizoguswa) 0.
Bado: `QuotaSync` haijaonekana ndani ya run halisi ya CU (sandbox → Koyeb) — njia ileile ya token kama `cu-search`.

### Live run 13 — main `d43ad65` (deploy 89825c8a), session `xmdtest-final13` (2026-10-17 05:03–05:19 UTC)
- **Quota sync live ✅:**
  - CU note sekunde 7.6 baada ya kuanza: `quota sync: ledger ya server imesomwa (gemini 4 · or 2)`.
  - Server logs `[cu-quota] 8886887a · gemini 4 · or 2` kuanzia 05:03:35 hadi 05:19:09. Usomaji unafanyika kwenye `acquire` pale ≥60s zimepita.
- **Matokeo:** finalState **COMPLETED_UNVERIFIED** (harness ✓). Requests 27, muda 947s, tokens 669k.
- **Judge:** Uno Ultra (uno-2), raundi 1.
- **Mgawanyo:**

  | Family | Requests | Models |
  |---|---|---|
  | Flash | 11 | 3.8 ×3, 3.7 ×4, 3.6 ×4 |
  | Lite | 9 | 3.5 ×7, 3.1 ×2 |
  | Uno | 2 | minimax |
  | OR | 2 | Lightning |
