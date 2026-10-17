# PROGRESS — Professor XMD Company (kufuatia maelezo0.md)

## Baselines
| commit (base) | tsc | vitest | python (cu) | date |
|---|---|---|---|---|
| `737b57a` (v3/main, kabla ya Task 2) | 0 errors | 183/183 (18 files) | 186/186 OK | 2026-10-16 |

## Tasks
| # | branch | kazi | hali | ushahidi |
|---|---|---|---|---|
| 1 | (kufanywa na session nyingine; merged main `737b57a`) | pause/resume split (user vs system) | **COMPLETE** — live Koyeb T0–T8 + smoke PASS (deployment `fc81c156` HEALTHY) | `docs/tests/task-1.md` |
| 2 | `task/2-flow-map` | READ-ONLY flow map → `docs/FLOW-MAP.md` (A–I) | **COMPLETE** — baselines zimeandikwa, vision test ya kweli PASS lanes 3, hakuna code changes | `docs/tests/task-2.md` |
| 3 | `task/3-cu-final-states` (ec8c75f → main `8ad7871`, Koyeb `b74f750b`) | Computer final states (`computeFinalState`; ok = COMPLETED_UNVERIFIED pekee) | **T1 ✅ · T2 ✅ (LIVE) · T3 ❌ STUCK×2 (judge cap — Q-001)** | `docs/tests/task-3.md` |
| 3b | `task/3b-cu-thinking` (e96eb45 → main `95c3161`, Koyeb `2c37e274`) | CU thinking formats → think cards; text tool-call imefichwa; Gemini `gemini/`; judge max(40, steps×3) | **T1 ✅ · T2 ✅ (E2B) · T3 ❌ STUCK (harness assertion evidence — Q-002)**; thinking LIVE ✅ | `docs/tests/task-3b.md` |

## Baseline ya Task 2 (kumbukumbu ya amri)
```
$ npm run typecheck      → 0 errors
$ CI=1 npx vitest run    → 18 files, 183/183 tests PASSED
$ npm run cu:test        → Ran 186 tests — OK
```

## Task 2 — Vision test (matokeo ya kweli, 2026-10-16)
- gemini-flash 3.8 (key1): HTTP 503 (outage ya wakati) → retry 3.7 (key2): **"Red"** ✅
- xkiro qwen/qwen3.8-max:free (optimus-1): **"Red"** ✅
- gemini-flash-lite 3.5 (key1): **"Red"** ✅


## Task 3 — Computer final states (2026-10-16)
- Branch `task/3-cu-final-states` · commit `ec8c75f` · merged v3/main `8ad7871` · Koyeb `b74f750b` HEALTHY.
- Faili: `src/lib/cu/finalState.ts` (MPYA, pure + jedwali), `src/lib/cu/engine.ts` (finishComputer: ok=COMPLETED_UNVERIFIED
  pekee; finalState/finalReason → CuRunState, CuChip, item ya run_end, bcast phase_done; maneno "completed, NOT yet verified";
  startComputerPhase inafuta finalState ya run iliyopita), `src/lib/board/adapter.ts` (run_end/phase_done: stuck/blocked/unknown
  → "error" + finalState), `src/lib/stage/types.ts` (CuRunItem.finalState/finalReason), `src/components/board/stage/Computer.tsx`
  ("Imekamilika · haijathibitishwa" / "Imesimama · STATE"), `src/components/board/exportMarkdown.ts` (maneno ya export).
  Tests: `finalState.test.ts` (MPYA), `engine.test.ts` (+3), `ui.test.ts` (+2).
- Baselines baada: tsc 0 · vitest 210/210 · python 186/186.
- Tabia iliyobadilika (kwa makusudi, spec): run ya bridge `stuck` yenye ripoti SASA ni `finale_incomplete` + Endeleza (zamani: completed).
- Known issues: T3 haijapita — judge cap ya OpenHands (`XMD_GOAL_MAX_ITER` default min(25,max(6,steps))) → QUESTIONS.md Q-001.
  Lint: makosa 2 ya zamani `Computer.tsx` (react-hooks) — hayakuguswa.

## Task 3b (2026-10-16)
- Baselines: tsc 0 · vitest 210/210 · cu:test 198 OK.
- Judge cap (Q-001) imetatuliwa: live `judge: complete score=1.0`.
- Known issue: harness `features_verify` inakataa `assertion` bila evidence ya file/browser hata judge akisema complete → Q-002.
- Haijathibitishwa: kimi-k3, deepseek-v4.1-flash, codestral (503 busy).

## Task 4 — CU Adaptive Brain (2026-10-16)
- Patch ya CEO + marekebisho 7 (judge fallback halali, harness continuation, shared Uno RPM, akiba ya judge OR, afya ya model, Board Lite haikuguswa). Evidence: docs/tests/task-4.md.
- Baselines: pytest 283 · unittest 220 OK · tsc 0 · vitest 212/212 · eslint errors = baseline (34).
- Live: run 11 + run 12 = COMPLETED_UNVERIFIED (harness ✓), judge Uno Ultra (run 12: kataa → kubali). Rollback: backup/pre-adaptive-brain (ac9c5a3).
- Yaliyobaki: harness-continuation haijatokea live (tests tu); quota broker ya pamoja Board+CU (spec §6) inahitaji uamuzi.

## Task 4c — fast failover (2026-10-17) — main e1811ee + marekebisho ya timeouts
- Chanzo: retries 2 za siri za litellm/openai client (max_retries default 2) kwa Uno/OR, si SDK.
- Sasa: jaribio 1 kwa lane (SDK num_retries=1 + max_retries=0), lane nyingine papo hapo, timeouts kwa
  provider (latency iliyopimwa), deadline 300s, logs za majaribio (bila keys), condenser ya SDK.
- Tests 303 passed (18 mpya, pamoja na SDK halisi + HTTP). Run 14 live: COMPLETED_UNVERIFIED, 613s,
  failovers 8 (gap 1–250ms). Ushahidi: docs/tests/task-4c.md. Rollback: backup/pre-4c (64fe3a3).

## Task 4 (maelezo4) — Plan Guard Gate (2026-10-17) — main 57a2222 + 5d458ea (deploy c0bdcf40)
- `src/lib/cu/planGate.ts` (MPYA): `isPlanExecutable`, `planStatusOf`, whitelist ya warnings (fail-safe: ujumbe usiojulikana = block).
  Status: `guard_failed` (Data Guard, daima) > `structure_failed` (muundo) > `active`.
- `startComputerPhase`: lango KABLA ya sandbox → `⛔ Plan blocked: <sababu>` + run_end BLOCKED + `finale_incomplete`.
- Warnings (§3 Ledger fallback; hatua N<8 na N≥1): zinahifadhiwa kwenye plan, chip "⚠️ warnings" run ikianza, kiambatisho kwenye ripoti.
- Tests: planGate.test.ts 21/21 (T1+T2 pipeline halisi) · planGate.real.test.ts 2/2 (plans 9 halisi hazizuiwi; zikivunjwa zinazuiwa;
  warnings zinarudi). T3 live: run 15 sabotage → guard_failed → BLOCKED, sandbox haikuundwa (API + export + Endeleza);
  run 16 kawaida → Computer imeanza + chip ya warnings → COMPLETED_UNVERIFIED. Ushahidi: docs/tests/task-4-plan-guard.md.
- Baselines: tsc 0 · vitest 237 + 2 skipped · unittest 238 OK · eslint (files zilizoguswa) 0.
- Bug iliyopatikana na T3 + kurekebishwa: `toDoc` haikusoma `warnings`.
- Known gaps: Data Guard inahitaji Fact Sheet; >60 hatua inazuia (CEO athibitishe); OR Lightning judge 385s licha ya timeout 180s (4c).

## Task 5 (maelezo5) — Orphan sweeper (2026-10-17) — main abf222a + aa97ee7 (deploy 36bfb80e)
- `sweepOrphans` (src/lib/cu/autoResume.ts): session "inaendelea" bila runner hai + stale ≥10 dk + resume state → system pause
  (resumeAt +60s, chip "♻️ Recovered after crash") → checkPausedDue inaiendeleza. Callers: instrumentation (boot/tick) + /api/boardroom/active.
- Uamuzi wa CEO: status zote za kazi inayoendelea (si "running" pekee) + paused/system bila resumeAt (SIGTERM).
- Marekebisho yaliyohitajika: checkPausedDue isome items gz1: (haikuwahi kuona chip baada ya reboot); cu-event orphanPersist
  ibakize chips (ilifuta resume state); hali ya autoResume kwenye globalThis (Next.js ilipakia module mara 2 → mara mbili).
- Tests: orphan.test.ts 24/24 · T1–T5 + G1/G2 kwa server halisi (kill -9) · smoke 2 za Koyeb (redeploy wakati wa mjadala + wakati wa CU) zimerecover.
  Ushahidi: docs/tests/task-5.md.
- Baselines: tsc 0 · vitest 261 + 2 skipped · unittest 238 OK · eslint (files zilizoguswa) 0.
- **DHANA YA INSTANCE MOJA:** instance mbili zikiwepo, moja ingeweza kuiba session ya nyingine. Runner hai + staleness
  vinapunguza hatari hii (smoke 1: deploy overlap → "fresh", haikuguswa) lakini HAVITOI kabisa.
- Known issues: status inabaki "running" baada ya resume ya CU (race ya schedulePersist; sweeper inairuka); cu-event orphan haina auth.

## Task 6 — Maamuzi 3 ya CEO (2026-10-17) — main 06637b4 (deploy 4be01254)
- 6a: plan > hatua 60 → Kipande 2 cha zamani kinafutwa mahali palepale, Optimus anaandika upya (≤60), majaribio 2; bado > 60 → structure_failed.
  Real: hatua 5 > kikomo 2 (hook) → upya → hatua 2, rekodi 1 tu kwenye project_plans.
- 6b: OR Lightning = fallback tu (executor + judge) — `FALLBACK_ONLY_MODELS` + `pick()`. Real Koyeb runs 2: Lightning 0, OR slot → OR Ultra.
- 6c: status haibaki "running" baada ya CU: schedulePersist inaheshimu finalState + writes za session kwa foleni (serialQueue).
  Real Koyeb: Detach + Resume wakati wa CU → completed, na bado completed dk 3+ baadaye.
- Baselines: tsc 0 · vitest 275 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-6.md.
- Kumbuka: redeploy ya Koyeb huchukua ~dk 12.5 kubadili instance.

## Task 6 (maelezo6) — Persist-first pause (2026-10-17) — main b722ca6 (deploy fdc1aed8)
- Namba: maelezo6 inaiita "TASK 6" lakini Task 6 = maamuzi 3 ya CEO, kwa hiyo ushahidi uko `docs/tests/task-6-persist-first.md`.
- Pause: chip + session `paused` (resumeAt/pauseOrigin) zinaandikwa KWANZA (persist#1), snapshot baadaye ndani ya bajeti.
  Watchdog/SIGTERM: 20s / 8MB. Detach: 40MB kama zamani. Skip → sandbox inabaki hai. Snapshot ikifaulu → persist#2.
  Hakuna Buffer copy. SIGTERM ikikuta cooldown busy → subiri ≤3s.
- Real Koyeb: T1 persist#1 194ms (snapshot 38KB t+1.0s) · T2 SIGTERM halisi persist#1 231ms, resumeAt +60s, sandbox hai,
  auto-resume · T2b 30MB → `snapshot skipped (30.0MB > kikomo 8MB)` t+1.2s, sandbox hai · T3 sandbox mpya ina faili
  (md5 sawa) · T4 Detach 30MB → persist#1 537ms, snapshot 30.8MB t+18.3s, Resume → sandbox mpya ina junk (mtime ya awali).
- Baselines: tsc 0 · vitest 282 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Data ya majaribio imefutwa (sessions, cu_files, bucket).
- Ugunduzi: SIGTERM grace kwenye Koyeb ≈ 1s (`sh -c next start` inakufa, container inasimama). Pendekezo kwenye doc.
  Tabia 5 za zamani zimeandikwa (hazijabadilishwa).
