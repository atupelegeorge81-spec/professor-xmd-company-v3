# TASK 30 — Judging lanes (Flash ×4 keys → XKiro → Flash-Lite), lane logging, vision rule — ushahidi wa majaribio HALISI

Branch `task/30-judging-lanes` · nyuma ya `XMD_MILESTONES` (OFF kwa default) · inategemea T2, T23–T26 · broker imeguswa kidogo
(darasa jipya `judge` tu; madarasa ya zamani na `WEIGHTS` hayajabadilika).

Mazingira (kanuni S1 — hakuna app iliyojengwa kwenye sandbox ya agent):
- Kila kitu kiliendeshwa **kwenye KOYEB** (push → auto-deploy). Env ya service: `XMD_TEST_HOOKS=1`, `XMD_TEST_PROFILE_DIR=docs/tests/task-30/inputs`.
- **T1–T3 + vision routes:** `POST /api/xtest/judge` (inapigwa kwa `x-xmd-test-secret`; n≤2 kwa ombi moja, gateway ya Koyeb ~100s) → `brokerComplete`
  HALISI ya darasa `judge` (Gemini/XKiro halisi). Hooks za muda wa ombi (`down`, `novision`) au `/api/xtest/lanes` (runtime).
- **T4, T5:** conversations HALISI (`POST /api/boardroom` + tag `[xmdtest:inputT4|inputT5]`), ufuatiliaji `GET /api/boardroom/attach`; store records
  kupitia Supabase. **T6:** export `.md` HALISI ya session ya T4 kupitia pipeline ya BoardLive (`savedToEvents` → `createBoardAdapter` → `boardMarkdown`).
- Keys zote zimefichwa (`***` + herufi 4 za mwisho). `grep -E 'AIza|sk-or|gsk_'` kwenye ushahidi wote → hakuna.

Ushahidi: `docs/tests/task-30/T1 … T6/` (excerpts / store records, kila moja ≤40 mistari au JSON ndogo). Hakuna `.log` wala streams.

## Muhtasari

| Test | Inachothibitisha | Matokeo |
|---|---|---|
| T1 | Judge calls 10 → Gemini Flash, zinazunguka keys 4 + models za Flash | **PASS** — 10/10 `gemini-flash`, `usedFallback:false`; keys `***0-Pw`×3 `***A4gA`×3 `***9VFw`×2 `***JAzw`×2; models `gemini-3.8-flash` → `3.6-flash` → `3-flash-preview` |
| T2 | Flash down → XKiro; Flash+XKiro down → Flash-Lite; `usedFallback=true` | **PASS** — `xkiro-1`/`xkiro-2` `qwen3.8-max` fb True; kisha `gemini-3.5-flash-lite` (keys `***9VFw`, `***JAzw`) fb True |
| T3 | Flash judge call ina thinking config + metadata ya thinking | **PASS** — flags `{reasoning_effort:'high'}` (flag tu, si siri); `reasoningTokens` 86–243 (T1), 1741/3357 (T4 verifiers) |
| T4 | Picha kwenye lane bila vision → digest + `visionDegraded`; sign-off ya visual inakataliwa → `PAUSED_QUOTA`; Flash ikirudi → resume + sign-off | **PASS** (run 2, session f9f5cb7b) — tazama hapa chini |
| T5 | Board turn ya kawaida inabaki kwenye lane yake (hook ya judge haiigusi) | **PASS** (session 2b916e43) — tazama hapa chini |
| T6 | Export / state ina lane records | **PASS** — export `.md` ina chips 3 `🔌 M1 lanes` + mistari 8 ya kila call; `state:M1.lanesUsed` records 8 |

## Runs (sessions/sandboxes zote zilifutwa baada ya majaribio)

| Run | Session | Deploy | Matokeo / kasoro iliyopatikana | Fix |
|---|---|---|---|---|
| T1 #1 | — (route) | `f33a3af` | 429 discovery kwenye lanes za Flash ilifika `maxHops` 5 → judge ilishindwa | `e9b88d0` judge `maxHops` 32; thinking tokens kutoka `total_tokens` (stream ya Gemini haina `completion_tokens_details`) |
| T4 #1 | 06a0fada | `e9b88d0` | (a) digest ya picha: 429 hop 5 → hakuna digest; (b) `lanesUsed.stepId` ilirekodi step INAYOFUATA (append ya async) | `6c4db23` digest `maxHops` 32; stepId inachukuliwa wakati wa call |
| T4 #2 | f9f5cb7b | `6c4db23` | PASS | — |
| (review ya docs) | — | — | Kwenye `6c4db23` comment ya `// hops` ilimeza `temperature: 0.1, priority: "background", waitMs: 120_000` za digest (defaults zilitumika; T4 haitegemei vigezo hivyo) | fix kwenye commit ya docs: vigezo vimerudishwa kabla ya comment |

Kanuni #6 (kosa lilelile mara mbili) haikufikiwa — kila run ilikuwa na sababu tofauti.

## T1 / T2 / T3 (excerpts: `T1/judge-10-calls.txt`, `T2/fallback-chain.txt`, `T3/thinking.txt`)

```
T1_1.json 0 gemini-flash gemini-1:gemini-3.8-flash ***0-Pw fb False vis True in/out 31 1 think 197 {'reasoning_effort': 'high'}
T1_1.json 1 gemini-flash gemini-2:gemini-3.8-flash ***A4gA fb False … think 184
T1_2.json 0 gemini-flash gemini-3:gemini-3.8-flash ***9VFw fb False … think 86
T1_2.json 1 gemini-flash gemini-4:gemini-3.8-flash ***JAzw fb False … think 224
T1_3.json 0 gemini-flash gemini-1:gemini-3.6-flash ***0-Pw … | T1_5.json 1 gemini-flash gemini-2:gemini-3-flash-preview ***A4gA …
calls 10 distribution: {('gemini-flash','***0-Pw'): 3, ('gemini-flash','***A4gA'): 3, ('gemini-flash','***9VFw'): 2, ('gemini-flash','***JAzw'): 2}
T2_a (down=gemini-flash)        xkiro xkiro-1:qwen/qwen3.8-max:free ***1910 fb True | xkiro-2 ***4f51 fb True
T2_b (down=gemini-flash,xkiro)  gemini-flash-lite gemini-3:gemini-3.5-flash-lite ***9VFw fb True think 147 | gemini-4 ***JAzw fb True
T3  L1-mvgbhwnr gemini-3.8-flash flags {'reasoning_effort':'high'} reasoningTokens 197 · usage {completion 1, prompt 31, total 229}
```

Vision routes (`T4/vision-route-checks.txt`, picha nyekundu ya 8×8): Flash → `vis True deg False` "Red"; Flash down → **Flash-Lite yenye vision
inapendelewa** kuliko XKiro; Flash+Lite down + `novision=xkiro` → `xkiro-1 vis False deg True` — digest ya maandishi inachukua nafasi ya picha, "Red".

## T4 — vision rule + sign-off guard (session f9f5cb7b, fixture ya visual `inputT4`: `XMD_TEST_LANES_DOWN=gemini-flash,gemini-flash-lite`, `XMD_TEST_LANES_NOVISION=xkiro`)

Hook inazima lanes za Flash/Lite kwa **verifiers wa judge** pekee; digest (`makeImageDigest`, darasa `heavy`, `allow:[gemini]`) ni wito wa awali wa Flash
vision na haiguswi na hook — ndiyo "cached text digest" ya maelezo. Verifiers wanaangukia XKiro (bila vision) → digest + DOM metrics + `visionDegraded:true`.

Map: agenda moja → map ya code (M1 `reviewMode: mixed`). Excerpt ya stream (≤40):
```
07:07:16 🖼️ M1 R1: digest ya picha 3 (gemini-1:gemini-3.8-flash (gemini-flash)) — kwa lanes bila vision.
 🔌 M1 lanes (R1): wito 3 · gemini-flash 1 · xkiro 2 · Flash keys ***0-Pw×1 · fallback 2 · visionDegraded 2 · thinking tokens 813
07:15:00 ✅ M1 R1 → FIXING … REVERT (open defects 2 → 4)   [degraded reviewers: touch-target minors 37.05×44, 43.8×44]
07:24:10 🖼️ M1 R2: digest ya picha 3 (gemini-2:gemini-3.7-flash (gemini-flash)) — kwa lanes bila vision.
 🔌 M1 lanes (R2): wito 6 · gemini-flash 2 · xkiro 4 · … · fallback 5 · visionDegraded 4 · thinking tokens 2165
 🚫 M1 R2: sign-off ya mixed imekataliwa — verdicts ni visionDegraded (designer, frontend)
 [milestonePaused] {"id":"M1","status":"PAUSED_QUOTA","origin":"system","reason":"R2 verdicts visionDegraded (designer, frontend)","resumeAt":"2026-10-20T07:27:43.333Z"}
07:27:44 ⏸️ M1: bado hakuna lane ya judge yenye vision na nafasi — ukaguzi ujao 07:30 UTC.
07:28:20 (agent) POST /api/xtest/lanes {"down":"","novision":""} → ok   ← "Flash inarudi"
07:30:46 ▶️ M1 RESUME → VERIFYING (vision: gemini-1:gemini-3.8-flash).
 🔍 M1 R2: Ultron + Vextron wanathibitisha COs CO-003, CO-004 (peke yao) — upya kwa vision halisi
 🔌 M1 lanes (R2): wito 8 · gemini-flash 4 · xkiro 4 · Flash keys ***0-Pw×2 ***A4gA×1 ***9VFw×1 · … · thinking tokens 7263
07:32:16 🏷️ M1 sign-off: tag milestone-M1 @ 0553b5a
07:32:24 ✅ M1 R2 → SIGNED_OFF: all 2 CO(s) PASS · checks 6 PASS · no open defect ≥ medium · receipts match · BEST (open defects 2 → 0).
```
Store records (`T4/`): `visionPause_M1.json` (stepId `M1.R2.decide`, pausedAt 07:24:43 → resumedAt 07:30:46, `resumedOn gemini-1:gemini-3.8-flash`),
`verify_M1_R2.json` (`degradedRuns` = verdicts zilizokataliwa zimehifadhiwa), `digest_M1_R1/R2.json` (digest + DOM metrics), `signoff_M1.json`
(`clean:true`), `state_M1.json` (`lanesUsed` 8). Kumbuka: fix ya touch-target kwenye fixture iliandaliwa kisha **ikarudishwa** (`inputT4.json` haijabadilika)
— minors hizo ni ushahidi kwamba reviewers wa degraded wanategemea DOM metrics (tazama Mapendekezo).

## T5 — board turn ya kawaida (session 2b916e43, `inputT5`: milestones OFF, `XMD_TEST_MAX_AGENDAS=1`, `XMD_TEST_LANES_DOWN=gemini-flash,xkiro`)

Baseline ya lane ya kawaida = `policy.ts` `WEIGHTS` (haijabadilishwa na T30): `normal: { xkiro: 1, unorouter: 0.85, openrouter: 0.6, groq: 0.5 }`,
`GEMINI_WEIGHTS.light.lite 1.05` (observers), `heavy.flash 1.2`, Mpango Kazi R49 = XKiro → Uno/OpenRouter; unit `judge.test.ts` (hook = judge pekee).
Hook ya profile inasema `gemini-flash,xkiro` ziko down — kama ingevuja nje ya judge, board turns zisingeweza kutumia XKiro wala Optimus kutumia Flash.
Excerpt (`T5/lanes-regular-vs-judge.txt`):
```
07:37:21 🔌 Optimus → XKiro 2 · qwen3.8-max          (board turn, darasa normal → XKiro kwanza, kama WEIGHTS.normal)
07:37:33 🔌 Ultron → XKiro 2 · qwen3.8-max           … turns 6 zote za mjadala: XKiro 1/2
07:38:44 🔌 Vextron → Gemini 3 · gemini-3.5-flash-lite (observers 3: light → Flash-Lite, kama kawaida)
07:40:28 📋 Mpango Kazi · lanes pekee: XKiro qwen … (R49) → 07:41:03 ✅ Optimus alimaliza kwa XKiro 1
07:41:46 🔌 Optimus → Gemini 2 · gemini-3.8-flash    (heavy → Flash, ingawa hook inasema gemini-flash "down")
/api/xtest/judge, process ileile, wakati huo huo (07:39, hook ya profile hai):
regular L16-mvgdgvjb board-turn → xkiro-1:qwen/qwen3.8-max:free ***929c judge False class xkiro usedFallback False
regular L17-mvgdgxo4 board-turn → xkiro-1:qwen/qwen3.8-max:free ***929c judge False class xkiro usedFallback False
judge   L18-mvgdh5wf xmdtest-judge:1 → gemini-1:gemini-3.5-flash-lite ***0-Pw judge True class gemini-flash-lite usedFallback True {'reasoning_effort':'high'} think 148
```
Export ya T5 (`export.mjs`): items 86, chips `🔌 M1 lanes` 0 — records za lanes zinaandikwa na loop ya milestone/judge tu; session ya kawaida haibadiliki.
Session ilisimamishwa (`POST /api/boardroom/pause`) baada ya mjadala + Mpango Kazi, XMD Computer ilipoanza build (kuokoa quota) — si sehemu ya T5.

## T6 — export (`T6/export-lanes-excerpt.md`)

`xmdtest/t30/export.mjs` (Supabase `boardroom_sessions.items` `gz1:` → gunzip → `savedToEvents` → `createBoardAdapter({instant:true})` →
`boardMarkdown`) kwenye session ya T4: items 199, chips 22 za milestone zilizofichwa (`__PROFESSOR_XMD_MILESTONE__`, hazitoki), `.md` herufi 60,380.
```
> ℹ️ 🔌 M1 lanes (R1): wito 3 · gemini-flash 1 · xkiro 2 · Flash keys ***0-Pw×1 · fallback 2 · visionDegraded 2 · thinking tokens 813
- L23-mvgcam6s · M1.R1.verify · image-digest:M1:R1 → gemini-1:gemini-3.8-flash key ***0-Pw · vision yes · in 3439 / out 570 (thinking 813) · 63.3s
- L24-mvgcc0a4 · M1.R1.verify · review-verify:M1:R1:frontend → xkiro-1:qwen/qwen3.8-max:free key ***929c · vision NO · visionDegraded · fallback · in 8117 / out 887 · 20.0s
> ℹ️ 🔌 M1 lanes (R2): wito 8 · gemini-flash 4 · xkiro 4 · Flash keys ***0-Pw×2 ***A4gA×1 ***9VFw×1 · fallback 5 · visionDegraded 4 · thinking tokens 7263
- L39-mvgd6b3l · M1.R2.verify · review-verify:M1:R2:designer → gemini-1:gemini-3.8-flash key ***0-Pw · vision yes · in 10764 / out 394 (thinking 1741) · 63.1s
- L41-mvgd6deu · M1.R2.verify · review-verify:M1:R2:frontend → gemini-3:gemini-3.8-flash key ***9VFw · vision yes · in 10772 / out 405 (thinking 3357) · 66.6s
```
Kila record: `callId, stepId, lane, model, keyId (masked), visionCapable, usedFallback, tokensIn/Out, ms` (+ `visionDegraded`, `reasoningTokens`).

## Baseline

| | Kabla | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 730 + 2 skipped | 749 + 2 skipped (+19 za T30) |
| eslint (problems) | 29 | 29 |
| pytest `cu/tests` | 338 + 3 skipped | 338 + 3 skipped |

## Mapendekezo / mambo wazi
- Reviewers wa degraded (DOM metrics) wanaflag touch-target minors ambazo vision haizioni → REVERT inahesabu minors na inaweza kuzunguka.
- Ledger ya usage haidumu kati ya deploys za Koyeb (scale-to-zero, `/tmp`) → discovery ya 429 inahitaji `maxHops` 32 kwa calls za Gemini pekee.
- `XMD_TEST_*` za profile ni za process nzima (zinafutwa session inayofuata ikianza) — usianzishe profiles mbili kwa wakati mmoja.
