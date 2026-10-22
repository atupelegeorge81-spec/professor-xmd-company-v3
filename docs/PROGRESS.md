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

## Task 7 (maelezo7) — `/api/live` liveness bila DB (2026-10-17) — main be96671 (deploy 571ed21e)
- `src/app/api/live/route.ts`: force-dynamic, nodejs, `{ok:true,t}` 200 + `Cache-Control: no-store`, hakuna import yoyote.
- `instrumentation.ts`: keep-alive → `/api/live`. Test-only `XMD_TEST_KEEPALIVE_MS` (chini ya `XMD_TEST_HOOKS=1` tu). `/api/health` haijaguswa.
- Tests: T1 DB batili → live 200 (15–24ms), health 503 · T2 env sahihi → zote 200 · T3 hakuna import · T4 ping 32 zote
  `/api/live` (0 health) · smoke Koyeb 5/5 200, no-store. Ushahidi: docs/tests/task-7.md.
- Baselines: tsc 0 · vitest 282 + 2 skipped · pytest 308 · unittest 238 · eslint 0.
- **CEO action: in Koyeb -> Service -> Health checks, set HTTP path `/api/live`, port = app port, grace period >= 60 s.**
  (Port ya app = 3000. Sijabadilisha settings za Koyeb.)

## Task 8 (CEO "fix matatizo yote ma3") (2026-10-17) — main 1a2900a + afe88f4 (deploy e0582465)
- Koyeb health check → `/api/live` (port 3000, grace 60s). Start: `NEXT_MANUAL_SIG_HANDLE=true exec next start`.
- Fixes za zamani: burst ya checkPausedDue baada ya boot (grace 30s) · status `running` kwa run iliyoresumiwa · pause inaua
  oh_bridge · restore tar + kiovu · ripoti ya orphan inahifadhiwa · inflight ya autoResume haivuji.
- Imegunduliwa kwenye real test: Resume baada ya Detach haikufuta `pauseOrigin="user"`, kwa hiyo timer ya quota auto-resume
  iliruka kimya. Imerekebishwa kwenye `resumeRun` (boardRunner.ts, +5).
- Real Koyeb: SIGTERM persist#1 254ms, snapshot t+1.1s, exit safi t+4s, bridges 0 · burst resume resumeAt + 85s (zamani dk 8)
  · status running · restore tar + kiovu (sandbox 2 na 3) · R3 orphan report → COMPLETED_UNVERIFIED (matukio yaliingizwa).
- Baselines: tsc 0 · vitest 293 + 2 skipped · pytest 308 · unittest OK · eslint 0. Data ya majaribio imefutwa.
  Ushahidi: docs/tests/task-8.md.

## Task 9 (maelezo9) — Milestone types + validators (2026-10-17) — branch task/9-milestone-types
- Mpya: `src/lib/milestone/types.ts`, `schemas.ts`, `__tests__/schemas.test.ts`. Pure, hakuna wiring. Validators za mkono (zod haipo).
- Tests: 28/28 (ramani halali N=10/15/20/3; batili 9 + ziada; CO bila acceptance / free-text; receipt DONE bila files; BLOCKED bila sababu).
- Baselines: tsc 0 · vitest 321 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-9.md.
- Maamuzi madogo ya muundo (sehemu za Check, priority int, lanesUsed unknown[] hadi task 10) yameandikwa kwenye doc.

## Task 10 (maelezo10) — Milestone state machine + persistence (2026-10-17) — main 56b897d (deploy 60b53039)
- Mpya: `src/lib/milestone/state.ts` (transition GOTO/RESUME, step ledger, lane log), `store.ts` (hidden chips kwenye
  `boardroom_sessions.items`, version kwa kila rekodi + CAS ya row kwa `updated_at`), `flag.ts`, `__tests__/state.test.ts`.
  Imebadilishwa: types.ts, schemas.ts, usageChip.ts (+1: chip ya milestone ni hidden).
- Maamuzi ya CEO: R0→FIXING = round 1; CAP_REACHED kutoka VERIFYING tu kwa round 10.
- Tests: T1 48/48 (kingo halali 34, haramu 10, round) · T2 deep-equal · T3 process mpya → nextStep `M1.R1.verify` · T4 writers
  2 × 20 → v41, conflicts 28 zilirudiwa, stale → VERSION_CONFLICT · T5 store inert, imports 0, run diff kabla/baada sawa.
- Baselines: tsc 0 · vitest 369 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-10.md.
- Ugunduzi (haujabadilishwa): bridge mbili kwa session moja baada ya quota auto-resume (`startComputerPhase` haina kinga ya
  kuitwa sambamba). Inapendekezwa task ya kinga.
- Kumbuka kwa wiring (task 14+): board persist inaandika items zote kutoka kumbukumbu, kwa hiyo chip za store lazima ziwe
  kwenye `runner.items` (au store iandike wakati runner hai haandiki), vinginevyo persist inayofuata itazifuta.

## Task 11 (maelezo11) — OCB builder (2026-10-17) — branch task/11-ocb
- Mpya: `src/lib/milestone/ocb.ts` (buildOCB, buildOCBForComputer, withOCB, consumerOf; length guard 1,200 tokens) + tests 51
  (snapshots 45 = stages 9 × roles 5). Haijaunganishwa kwenye prompts.
- T2: OCB kutoka state halisi ya DB (store ya Task 10). T3: Gemini Flash (gemini-3.8-flash) ilitaja milestone, hatua ijayo
  na msomaji kwa stages 3/3.
- Baselines: tsc 0 · vitest 420 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-11.md.

## Task 12 (maelezo12): Milestone map (2026-10-17), branch task/12-milestone-map
- Mpya: `src/lib/milestone/map.ts` (Optimus kupitia Gemini lane ya broker, cls heavy → Flash; validator + retry 3; fallback ya code
  ceil(N/4)). Hook ya boardRunner iko nyuma ya flag pekee: store.ts + event `milestoneMap`. Tests 19.
- Marekebisho yaliyofichuliwa na T4: chips za MS zilifutwa na persist ya Board (sasa ziko kwenye `runner.msChips`), na chip ya MS ilivuja kwenye UI
  (adapter `HIDDEN` + MILESTONE).
- T1 N=10/15/20 valid jaribio la 1 · T2 ramani 5 mbovu zimekataliwa · T3 fallback (hook) · T4 local flag ON: DB + event + UI ·
  T5 Koyeb flag OFF: signature sawa na baseline.
- Baselines: tsc 0 · vitest 439 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-12.md.

## Task 13 (maelezo13): Roster ya kila milestone (2026-10-18), branch task/13-roster
- Mpya: `src/lib/milestone/roster.ts`; boardRunner (flag ON + ramani): owners/observers wanachujwa kwa roster, header
  `Participants: …`, resume inasoma ramani (`readMsMap`). Test hook `XMD_TEST_MAP_FORCE` (XMD_TEST_HOOKS=1 tu). Tests 9.
- Maamuzi yangu (CEO alilala): pm daima ni mwenyekiti; owners ∩ roster (tupu → wasio-pm 2 wa roster → pm); observers = wasio-owners
  wa roster; Participants flag ON tu; forced map ≥2 entries.
- T1 roster ndogo: Megatron/Cybertron zamu 0 kwenye agenda 1–2 · T2 wote 5 wanashiriki · T3 consensus, fallback 0 ·
  T4 Koyeb flag OFF: signature sawa na baseline.
- Baselines: tsc 0 · vitest 448 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-13.md.

## Task 14 (maelezo14): Milestone loop + trigger (2026-10-18), branch task/14-milestone-trigger
- Mpya: `src/lib/milestone/loop.ts` (maybeCloseMilestones: Ledger = ukweli → CAS DISCUSSING→PLANNING → runMilestoneBuild STUB:
  milestoneClosed + chip, plan/build DONE stub, SIGNED_OFF), `testHooks.ts` (kunasa prompts, kukata agenda). boardRunner: trigger
  baada ya kila agenda + resume + baada ya kitanzi; OCB DISCUSS kwenye prompts za mjadala (flag ON tu). ocb.ts: `YOU ARE HERE: <stage> |`
  sasa sawa na kiolezo cha maelezo11. Tests 7.
- Maamuzi yangu: agenda imefungwa = iko kwenye finalBoardResolution; event inatolewa na mshindi wa CAS tu; hitilafu ya loop haiangushi Board;
  dev ya local ni `--turbopack` (webpack inazidi RAM).
- T1 M1 ×1 baada ya agenda 2, M2 ×1 baada ya agenda 3 · T2 kill -9 wakati wa agenda 3 → recovery ya Task 5, M1 haikurudi (v5), M2 ×1 ·
  T3 `YOU ARE HERE: DISCUSS | Milestone M1` kwenye prompt halisi · T4 flag OFF: kinds sawa, prompts bila OCB.
- Baselines: tsc 0 · vitest 455 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-14.md.


## Task 15 (maelezo15): Plan ya kila Milestone (2026-10-18), branch task/15-milestone-plan
- Mpya: `src/lib/milestone/plan.ts`:
  - `validateMilestonePlan` (muundo: §1–9, Styling+Dependencies, ```checks kwa kila hatua yenye Files, route + viewports 3, proof command/http);
  - `generateMilestonePlan` (vipande 2 + §9 ya Ledger neno kwa neno; repair muundo ≤1, data ≤1; active/structure_failed/guard_failed).
- loop.ts: hatua ya plan si stub tena. Plan isiyotekelezeka → BLOCKED (resumeTo PLANNING), Computer haianzi. BLOCKED/PAUSED hairudiwi yenyewe.
- boardRunner: OCB PLAN, event `milestonePlan`, store `plan:Mk` pekee. Flag ON + map → plan ya zamani ya mradi mzima inarukwa. Tests 13.
- Maamuzi yangu (11, yameandikwa kwenye task-15.md): deps interface; §9 kwa code; muundo wa ```checks/route;
  plan haiendi project_plans; chips 🗺️ zinaonekana; hairudii BLOCKED; build stub hadi Task 16.
- T1 plan halisi active (hatua 3 · checks 14 · routes 1) · T2 bila Checks → makosa 4 sahihi kwa kila hatua ·
  T3 sabotage → guard_failed, M1 BLOCKED, CU 0 · T4 VAT haiongezwi · T5 flag OFF: plan ya zamani (hatua 9), milestone/OCB 0.
- Baselines: tsc 0 · vitest 468 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-15.md.

## Task 16 (maelezo16): XMD Computer kwa kila Milestone (2026-10-18), branch task/16-computer-per-milestone
- Mpya: `src/lib/milestone/startpack.ts` (StartPack (a)–(e): plan · Ledger fupi · repo tree+git log · ripoti zilizopita ≤60 · kasoro).
- engine.ts: `startComputerPhase(runner, hooks, phase)` = milestone MOJA. Kila awamu: bridge mpya, sandbox iliyopo ikiwa hai
  (la sivyo mpya + restore ya snapshot/kiovu), liveness `CU_LIVENESS_MS` (dak 15) → STUCK, commit ya harness "XMD Computer",
  snapshot tar+git ya mwisho wa awamu. loop.ts `runBuildStep`: STUCK/BLOCKED/ERROR → BLOCKED. Test hook `XMD_TEST_CU_SILENT`.
- Maamuzi yangu (9, yameandikwa kwenye task-16.md): concurrency guard `msBusy` (jibu la swali la bridges mbili); pause → hatua inarudiwa;
  ping ×2 → ERROR; `.git/info/exclude` ya harness; snapshot tar+git (kiovu hakinasi faili za terminal); timeoutMs saa 24;
  checkCuStall "ok" kwenye njia ya milestone; resume ya CU ya zamani inarukwa; git log bila commit sio kosa.
- T1 M1/M2 → commits 2 (`80306f7`, `70bf1a5`), sandbox imetumika tena, mazungumzo 2 ya OpenHands · T2 prompt ya M2 ina StartPack,
  chat ya M1 haipo (think 0/126) · T3 sandbox imeuawa → M2 sandbox mpya, faili 6 + git zimerejeshwa (`2616771` → `e6e995e`) ·
  T4 bridge kimya → STUCK baada ya 60.05s → M1 BLOCKED · T5 flag OFF: milestone 0, CU ya zamani ×1.
- Baselines: tsc 0 · vitest 489 + 2 skipped · pytest 308 · unittest 238 · eslint 0. Ushahidi: docs/tests/task-16.md.

## Task 17 (maelezo17): Build Report contract (2026-10-18), branch task/17-build-report
- Mpya: `src/lib/milestone/buildReport.ts` (`parseBuildReport`: headings 8 kwa mpangilio, sehemu zisizo tupu, exit codes za sehemu 3,
  paths za sehemu 2; `crossCheckBuildReport` ↔ git diff → fake/unreported). bridge.py: `build_report_contract` + block ya CLAUDE.md
  + `--milestone`; oh_bridge (backend halisi) inaweka mkataba kwenye ujumbe wa kwanza. engine: HEAD ya mwanzo + kusoma ripoti na
  `git diff` baada ya commit (>16KB → storage). loop: `report:Mk` + event `buildReport` + chip 📑.
- Maamuzi yangu (7, kwenye task-17.md): backends zote mbili; milestone tu (legacy haiguswi); ripoti mbaya haibadilishi hali (task 18
  ndiyo lango); diff = HEAD ya mwanzo → HEAD (= HEAD~1, na inafanya kazi M1); directory inafunika faili; ripoti iko ndani ya git; inline 16KB.
- T1 parser (accept + 4 rejects) · T2 ripoti halisi ya M1 (sehemu 8, amri 4 = vipande halisi vya exec_start, fake 0) na M2 ·
  T3 snapshot halisi `git diff HEAD~1`: path iliyopandikizwa → fake, README iliyoondolewa → unreported · T4 pytest 311, unittest 241.
- Baselines: tsc 0 · vitest 506 + 2 skipped · pytest 311 · unittest 241 · eslint 0. Ushahidi: docs/tests/task-17.md.

## Task 18 (maelezo18): Completion gate (2026-10-18), branch task/18-completion-gate
- Mpya: `cu/gate.py` (masharti 4: Build Report · git safi + commit ≥1 · buildCommand exit 0 · testCommand exit 0 ikihitajika;
  GateGuard: 3 bila maendeleo halisi → PARTIAL, kikomo 10). bridge.py `on_stop` + oh_bridge `_run_gate` (baada ya judge);
  `tests_run` tu baada ya exit 0 (milestone). engine: sehemu ya COMPLETION GATE kwenye StartPack + `.xmd/startpack.json`;
  finalState: `COMPLETED_VERIFIED` (gate.passed tu), PARTIAL → BLOCKED; legacy COMPLETED_UNVERIFIED haibadiliki.
  plan.ts: Build/Test Command zinadaiwa. Test hooks: XMD_TEST_BUILD_CMD_/CU_NOTE_/GOAL_OFF_<Mk>.
- Maamuzi yangu (18, kwenye task-18.md) — ya kipekee: maendeleo HALISI (commit ya ripoti peke yake haihesabiwi), ujumbe wa block
  unakataza kuchezea mazingira (real run: agent alijaribu /proc → sandbox ikafa), repo mpya → `git ls-tree` (rekebisho la Task 17).
- T1 block "report does not exist" → agent aliandika · T2 block scratch-notes.txt → commit → VERIFIED · T3 SyntaxError → rekebisho →
  VERIFIED · T4 blocks 3 → PARTIAL → M2 BLOCKED + mstari wa PARTIAL kwenye ripoti · T5 pytest halisi fail→False, pass→True ·
  T6 flag OFF: gate/milestone 0, COMPLETED_UNVERIFIED kama zamani. Ugunduzi: pause ya watchdog ya RAM ndani ya milestone → ERROR (haijarekebishwa).
- Baselines: tsc 0 · vitest 514 + 2 skipped · pytest 333 · unittest 263 · eslint 0. Ushahidi: docs/tests/task-18.md.

## Task 19 (maelezo19): Evidence screenshots (2026-10-18), branch task/19-screenshots
- Mpya: `cu/xmd-evidence.mjs` (playwright global via createRequire; local mode inazindua `Start Command` port 4173, `--base` =
  deployed; routes × viewports × states[click/hover]; console/pageerror/requestfailed/≥400 → consoleErrors; manifest daima;
  exit 0/1/2; server fast-fail ~1s ikikufa; ERR_ABORTED imefutwa); `src/lib/milestone/evidence.ts` (planEvidenceSpec:
  mistari `route: · states: · viewports:`, actions za " > ", splitTop, "default" huachwa, duplicate route merge, problems);
  `src/lib/cu/evidence.ts` (`captureEvidence`: inaandika script+config `.xmd/tools/`, kuendesha 15min, upload CU bucket,
  validate requireUrls); `validateEvidencePack` schemas (data: URL hukataliwa kwanza); engine block baada ya build report
  (needsScreenshots=visual/mixed tu + build imepita); loop `recordEvidence` → `evidence:Mk:Rn` + chip 📸 + bcast;
  `types:url/evidence kinds`; `plan.ts EVIDENCE_PORT=4173` + template ina mfano wa state + Start Command; MS_GIT_EXCLUDE `.xmd/`.
- Maamuzi yangu (12, kwenye task-19.md) — ya kipekee: koma ndani ya [] hubaki selector moja; ERR_ABORTED si kosa;
  object names ni uuid (unique()); full-page urefu unaweza kuzidi viewport.
- T1 fixture 6 PNG, upana=viewport (home 375×685 full-page), 11.9s · T2 states ≠ default kwa hash + macho ·
  T3 deployed Koyeb 3 viewports requireUrls OK, consoleErrors 0 (baada ya filter) · T4 404→exit 1 + kind http, manifest imeandikwa;
  T4b server faiba 1.2s · T5 URLs 21/21 200, uploads 21 zimefutwa (storage list: baki 0, public 200 = CDN cache).
- Baselines: tsc 0 · vitest 525 + 2 skipped · pytest 333 · unittest 263 · eslint 0. Ushahidi: docs/tests/task-19.md.

## Task 20 (maelezo20): Evidence — DOM metrics (2026-10-18), branch task/20-dom-metrics
- `cu/xmd-evidence.mjs`: `collectDomMetrics` ndani ya ukurasa (KABLA ya screenshot) → `S-nnn.dom.json` kwa kila screenshot:
  elements ≤150 (keySelectors + header/nav/main/footer/h1–h3/button/a/input/img): selector thabiti, text 40, box (CSS px, ukurasa),
  visible, font family/size/weight/letterSpacing/textTransform, color, backgroundColor (ancestor asiye wazi + alpha), contrastRatio
  WCAG, lowContrast (4.5 / 3 large), touchTarget + tooSmall (<44). Page: scrollWidth/innerWidth/hasHorizontalOverflow/overflowPx,
  fontsLoaded/Failed, imagesWithoutAlt, headingOrderProblems, bodyBackground. `manifest.domMetrics[{screenshotId,path,url,summary}]`, kosa → kind `dom`.
- evidence.ts: `Key Selectors:` (mstari mpya wa HIARI kwenye plan template) → `keySelectors`; `DOM_MAX_ELEMENTS=150`; config inapeleka zote.
  cu/evidence.ts: dom.json → storage (url). schemas: validate domMetrics. types: EvidenceDomSummary + kind `dom`. appwrite.ts: `.json` mime.
- Maamuzi yangu (9, kwenye task-20.md) — ya kipekee: pima KABLA ya full-page capture (inasogeza layout 1px); landmarks juu ya vitufe
  kwenye kikomo; kazi nzito kwa ≤150 tu; dom.json inapakiwa storage.
- T1 evil: overflow 3px, 20×20 tooSmall, contrast 2.03, uppercase+monospace, img bila alt, h1 baada ya h3 → zote kwenye JSON (8/8) ·
  T2 good: overflow 0, tooSmall 0, min contrast 6.7 (8/8) · T3 Koyeb: header 56px, h1 25/28px, kitufe 36×36 / 32×32 (tooSmall),
  overflow false, body rgb(7,8,11); requireUrls OK · T4 box = boundingBox() ±0.004px (3/3) · T5 150/363, hidden 0, landmarks zimebaki.
  Jumla 23/23 PASS kwenye sandbox halisi ya E2B; uploads 32 + workspaces zimefutwa, sandbox imeuawa.
- Baselines: tsc 0 · vitest 533 + 2 skipped · pytest 330 + 3 skipped · unittest 263 OK · eslint (bila backups/) 29 = kabla (0 mpya). Ushahidi: docs/tests/task-20.md.

## Task 20 — nyongeza: merged main `9251878`, Koyeb deploy `be8fc9ec` HEALTHY; smoke `/`, `/api/live`, `/api/health`, `/board` = 200.

## Task 21 (maelezo21): Check runners (2026-10-18), branch task/21-checks
- Mpya: `src/lib/milestone/checks.ts`: `runCheck`/`runChecks` (aina 12), `canSignOff` (FAIL/ERROR inazuia), `applyReviewerVerdict`
  (kanuni ya dhahabu: LLM hawezi kugeuza FAIL/ERROR → PASS). command/grep/file_* = shell ndani ya sandbox (exit + mistari 40);
  http localhost = curl sandbox, nje = fetch; checks 6 za browser = batch moja ya `xmd-evidence.mjs` `mode:"checks"`
  (contrast/touch zinatumia collectDomMetrics ya Task 20); screenshot_taken = EvidencePack + PNG. Schema batili / exception → ERROR.
- types/schemas/plan CHECK_SHAPES: fields za maelezo21 kama mbadala (count/op, paths, forbidden, routes/viewports, px, status, bodyContains, state); za Task 9 bado halali.
- Maamuzi (7, kwenye task-21.md): viewport default 375x667 (overflow: zote 3); ERROR vs FAIL; elementi zote lazima zipite; grep inaruka .git pia.
- REAL: kesi 24 (12×2) + ziada 7 + server iliyokufa = **32/32 kama zilivyoundwa** (sandbox halisi ya E2B + Chromium + site ya CEO);
  http /api/live 200 PASS, 404 FAIL; selector batili → ERROR ×3; suite 7.2s (jumla pamoja na evidence 18.8s, chini ya 3 min).
- Baselines: tsc 0 · vitest 543 + 2 skipped · pytest 330 + 3 skipped · unittest 263 OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-21.md.

## Task 21 — nyongeza: merged main `c7ababf`, Koyeb deploy `b1f5dfa9` HEALTHY; smoke `/`, `/api/live`, `/api/health`, `/board` = 200.

## Task 22 (maelezo22): Baselines + regression (2026-10-18), branch task/22-baselines
- Mpya: `cu/xmd-regression.mjs`:
  - `diffImages` (pixelmatch 7.2.0 + pngjs 7.0.0, zinasakinishwa kwenye `.xmd/tools` ikiwa hazipo tu; AA inarukwa; vipimo tofauti → 100% + note);
  - mode save/diff;
  - baseline inarudishwa kutoka storage ikikosekana.
- Mpya: `src/lib/milestone/regression.ts`:
  - `saveBaselines` → `.xmd/baselines/<Mk>/<route>-<viewport>-<state>.png` + manifest, zote → storage;
  - `checkRegression` → `EvidencePack.regression[]` (RegressionEntry: regression / expected_change kwa `CO.location.route`, diffUrl);
  - `REGRESSION_THRESHOLD_PCT` (default 2).
- types/schemas: `RegressionEntry`. engine: `checkRegression` baada ya screenshots za R0; `.xmd/baselines/` kwenye git exclude.
- REAL (E2B + Chromium + storage halisi):
  - T1 0% · T2 rangi moja → 12.884%, diff inaangazia `.cta` tu (imekaguliwa kwa macho) · T3 100% + note;
  - T4 sign-off M1 → baselines 5, zimepatikana M2 R1: `/` regression ×2, `/pricing` expected (CO-001) ×2, `/about` 0%;
  - T4b restore kutoka storage 5/5 · T5 env 14 → `/` haiorodheshwi, abc → 2.
- Baselines: tsc 0 · vitest 552 + 2 skipped · pytest 330 + 3 skipped · unittest 263 OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-22.md.

## Task 22 — nyongeza: merged main `afccaee`, Koyeb deploy `b1233ae3` HEALTHY.

## Task 23 (maelezo23): Reviewer analysis — Round 0 huru (2026-10-18), branch task/23-reviewer-analysis
- Mpya: `src/lib/milestone/review.ts`:
  - `analyse(reviewer, pack, ctx, deps)` → Findings `{reviewer, screenshots[], defects[], proposals[], notes}`; validator (evidence lazima iwe id iliyopo kwenye pack: S-xxx / S-xxx dom / check: / regression:), retry ×2 na orodha ya makosa;
  - `reviewRound0` = designer (Ultron) + frontend (Vextron) sambamba, sha256 ya kila prompt, `leakedFragments` (jibu la A ndani ya prompt ya B = 0);
  - context kwa mpangilio wa maelezo23 (OCB REVIEW_ANALYSE + RoundHeader → mini-reports → ledger → plan → build report → evidence/DOM/checks/regression → defects → baselines); picha = `image_url` parts halisi.
- broker: `CompleteSpec.stallFirstMs` ya hiari (reviewers 300s). T1 ya kwanza: Gemini haitumi thinking kwenye stream → kimya > 90s → stall ×4 + 503 → hops zikaisha. Sasa: hop 0, 145–160s. LLM ikishindwa → `valid:false` (raundi haianguki).
- REAL (E2B + Chromium + Gemini 3.8 Flash, thinking high):
  - T1 site ya CEO: wote valid attempt 1, image parts 4, evidence ids zote zipo. Wote wawili: `/board` 375 haina bottom nav (imethibitishwa kwa macho), touch 36px, contrast 2.92;
  - T2 hash tofauti, grep 0/419 & 0/296 (deployed), 0/377 & 0/370 (kivuli);
  - T3 kasoro 5/5 (designer 5, frontend 4);
  - T4 image parts 3/4 kwenye body ya request; bila picha → 0 madai ya screenshot pekee;
  - T5 frontend 10/10 nukuu za DOM = JSON.
- Haijaunganishwa na loop/boardRunner bado (library). Hakuna web-search tool kwenye lane (prompt inasema "if available").
- Baselines: tsc 0 · vitest 564 + 2 skipped (+12) · pytest 330 + 3 skipped · unittest 263 OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-23.md + docs/tests/task-23/.

## Task 23 — marekebisho (maoni ya CEO, kabla ya T24)
- **Broker, timeout ya kila wito:** `CompleteSpec.stallFirstMs?` (hiari) → `collect` → `idleGuard(parent, firstMs)`. Ni `review.ts` PEKEE inayoipitisha (`REVIEW_STALL_FIRST_MS` = 300s). Waitaji wengine wote (board turns, plans, mini-reports, map, consolidate…) hawapitishi kitu, kwa hiyo wanabaki na **default 90s** (`BROKER_STALL_FIRST_MS`), bila mabadiliko. Test: `src/lib/broker/stall.test.ts` (fake timers: bila stallFirstMs bado hai kwenye 89.999s na imekatwa kwenye 90.001s; reviewer 300s; grep ya `src/` = review.ts pekee). Sababu: Gemini haitumi thinking kwenye stream → kimya > 90s → reroute ×4 + 503 (T23 T1 run 1).
- Raw `.log` zimeondolewa kwenye `docs/tests/task-23/`; vipande (≤ 40 mistari kwa kila test) viko ndani ya `task-23.md`.
- Picha 4 (T1) dhidi ya 3 (T4): runs tofauti. T1 = site ya CEO (`/` ×3 + `/board`); T4 = fixture ya kivuli (`/` ×3). Jedwali liko kwenye task-23.md.
- Deploy ya T23: Koyeb `4e0b3213` HEALTHY (main `cb347e7`).

## Task 24 — Mjadala wa timu (REVIEW) + Change Orders za Optimus
- Branch `task/24-review-discussion`, nyuma ya `XMD_MILESTONES` (OFF kwa default), na T23 ndani.
- **REVIEW = aina maalum ya agenda yenye id `R-Mk-n`, bila namba ya agenda.** Ramani inabaki 1..N.
  - Mwili wa loop ya agenda sasa ni closure `discussAgenda(item)` ndani ya `run()`.
  - `runMilestoneBuild` → hatua `Mk.R0.review` → `msHooks.review.discuss` → `discussAgenda`.
  - REVIEW inatumia mashine ileile (gate ya search, zamu, AGREE, consensus).
  - REVIEW inarudi KABLA ya R37, Ledger ya Board, mini-report, code na pingamizi.
  - Zamu za REVIEW ni maneno 600–900; agenda za kawaida zinabaki "under 180 words". FLOW-MAP B.10.
- `src/lib/milestone/reviewAgenda.ts`:
  - `numberFindings` → D-/P-ids
  - `parseReviewDecision`
  - `applyReviewRules`:
    - proposals zinakubaliwa TU kwa consensus ya Ultron + Vextron + Optimus; vinginevyo REJECTED kwa default;
    - defect inabaki isipokuwa wote wanaibatilisha, pamoja na sababu;
    - mgongano na ledger/brief → CR.
  - `consolidate`: Optimus → `ChangeOrder[]` → `validateChangeOrder` + ukaguzi wa coverage, mara 3 zaidi; ikishindikana → FAILED/BLOCKED.
  - `runReviewRound`: store `findings`, `review`, `defects`, `decisions`, `changeRequests`, `cos`; events `reviewFindings`, `reviewDecision`, `changeOrders`.
  - Matokeo: NO_CHANGES → SIGNED_OFF, au FIXING round 1.
- REAL:
  - T1 (A2): COs 5 valid kwenye jaribio la 1; defects 6/6 + maamuzi 7/7 zina CO.
  - T2 (B1/B3): P-02 (reviewer mmoja) REJECTED; P-03 ACCEPTED → `decisions` + CO-005.
  - T3 (B3): serif ↔ A1 → `CR-M1-0-01`; COs 0 za serif.
  - T4: checks 10 kwa E2B dhidi ya site hai: FAIL 10, ERROR 0.
  - T5: nukuu 3.
  - CEO #3: searches 3 kwa kila run (SearXNG halisi + READ_SOURCE).
- Kasoro 5 zilizopatikana kwenye runs halisi zimerekebishwa: CAS ya hook, `[Condition added by`, CR ya fallback, id ndani ya mabano, kichwa "P-05". Maelezo yako task-24.md.
- Baselines: tsc 0 · vitest 594 + 2 skipped (+30) · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-24.md + docs/tests/task-24/ (bila `.log`).
- Deploy ya T24: Koyeb `f49b0b24` HEALTHY (main `d9f91b9`).

## Task 25 — Raundi ya marekebisho: Computer anatekeleza COs na kurudisha Receipts
- Branch `task/25-fix-round`, nyuma ya `XMD_MILESTONES` (OFF kwa default). Inategemea T16–18, T21 na T24.
- `runFixRound(m, round, cos)` (`milestone/loop.ts`):
  - hali FIXING → hatua `Mk.R<n>.fix` → `msHooks.fix.run` → `startComputerPhase(..., {fix})` (mechanics za T16; sandbox haiuawi);
  - pack = RoundHeader · OCB ya computer (stage FIX + LOCKED LEDGER) · COs kamili · repo summary · "what previous rounds changed" (≤40) — `renderFixPack` (`milestone/fixRound.ts`).
- Receipts: Computer anaandika `.xmd/receipts/R<n>.json` + `git commit -m "Mk Rn: CO-…"`.
  - Bridge: `milestone_contract` (`cu/bridge.py`, `cu/oh_bridge.py`).
  - Lango la T18, sharti (e) `cu/gate.py`: receipts halali + receipt kwa kila CO. Raundi ya marekebisho haina Build Report; zote BLOCKED/CANNOT → commit haihitajiki.
- Uthibitishaji kwa code (`verifyReceipts`) dhidi ya `git diff --name-only <before>..HEAD`:
  - lengo halikuguswa bila BLOCKED/CANNOT → `NOT_ATTEMPTED` → rerun MARA MOJA kwa ujumbe wa kudumu;
  - faili iliyobadilika bila kutajwa → `UNLISTED_CHANGE`;
  - faili iliyotajwa lakini haikubadilika → receipt `REJECTED`.
- Checks (T21 `runChecks` kwenye sandbox ileile): acceptance za COs + global (build, tests, console_clean, no_horizontal_overflow kwenye routes muhimu). Store `fix:Mk:Rn`, `checks:Mk:Rn`; `defects[].history` + `attempts`; `perCo` {attempt, runs, verdict, receipt, diff stats, checks}. Matokeo: VERIFYING (T26) au BLOCKED (resumeTo FIXING).
- Test hooks (inert bila `XMD_TEST_HOOKS=1`): `XMD_TEST_FIX_INPUT`, `XMD_TEST_FIX_NOOP_<Mk>`, `XMD_TEST_FIX_RECEIPTS_PATH_<Mk>`.
- REAL (E2B + OpenHands + Chromium + Supabase, repo `xmdtest-fix`):
  - T1: h1 `rgb(242, 240, 235)` PASS;
  - T2: NO-OP → ujumbe → rerun → APPLIED;
  - T3: `UNLISTED_CHANGE README.md`;
  - T4: BLOCKED "Contradicts LOCKED LEDGER A1", bila rerun;
  - T5: blocks 10 → PARTIAL → M1 BLOCKED.
- Kasoro 3 zilizopatikana kwenye runs halisi zimerekebishwa:
  - BLOCKED ya CO kwenye faili lililoguswa na CO nyingine;
  - NO-OP haikuwa kwenye historia ya defect;
  - hook ya uhakika kwa T5.
- Hatari kwa CEO: session ya majaribio iliyokatika iliendelezwa na orphan-resume ya Koyeb (imesafishwa); pendekezo liko task-25.md.
- Baselines: tsc 0 · vitest 616 + 2 skipped (+22) · unittest 271 OK (+8) · pytest 338 + 3 (+8) · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-25.md + docs/tests/task-25/ (bila `.log`).

## Task 26 — Raundi za uthibitisho, kanuni za verdict, vihesabu vya raundi
- Branch `task/26-verify-rounds`, nyuma ya `XMD_MILESTONES` (OFF kwa default). Inategemea T22–T25. Deploy ya T25 iliyotangulia: Koyeb `4614faf6` HEALTHY (main `c9b6559`).
- `runFixVerifyLoop` (`milestone/loop.ts`) inaendesha FIXING → VERIFYING → FIXING(n+1) | SIGNED_OFF | CAP_REACHED | BLOCKED. Hatua `Mk.Rn.evidence` → `Mk.Rn.verify` → `Mk.Rn.decide` zinahifadhiwa kila moja na ni idempotent (resume haiongezi raundi).
  - evidence upya (tasks 19–22, `captureRoundEvidence`);
  - reviewers WAWILI tu, kila mmoja peke yake (RoundHeader + OCB `REVIEW_VERIFY` + PLAN GOAL), wanatoa PASS/FAIL/PARTIAL kwa kila CO pamoja na `regressions[]` na `newDefects[]`;
  - wakitofautiana → zamu MOJA ya sync.
- `milestone/verify.ts` (SAFI, ina unit tests):
  - `decide`: PASS = wote PASS + checks PASS; check FAIL/ERROR inapindua; reviewer akiona tatizo ilhali check ilipita → defect mpya + check mpya (`CHECK_MISSED_IT`, concern moja kwa kila CO).
  - `decideNext`: SIGN_OFF | CONTINUE | CAP_REACHED (raundi 10) | BLOCKED; minor zinaruhusiwa tu zikiwa kwenye orodha (T28).
  - `roundOutcome`: BEST (`git tag -f xmd-best-Mk`, `best:Mk`) | REVERT | SAME.
  - `applyVerifyToDefects` (dedupe ya reviewers wawili + ya defects zilizo wazi), `newlyOccluded`, `nextAttempt`.
  - newDefects/regressions → Optimus `consolidate` (validation ya T24; mjadala wa timu ni pale tu reviewer anapouomba).
- Git: REVERT = `git stash` (mabadiliko yasiyocommitiwa) + `git revert <base>..HEAD` + commit; Optimus anaambiwa "round N reverted: made things worse (…)" (`cu/engine.ts` `milestoneGit`).
- RoundHeader inajengwa kutoka DB kwa KILA wito (computer, reviewers, sync, Optimus); `attempt` = jaribio linaloendelea.
- Test hooks (inert bila `XMD_TEST_HOOKS=1`): `XMD_TEST_VERIFY_INPUT` (pamoja na `startRound`, baseline ya R0) na `XMD_TEST_STOP_AFTER_ROUND`.
- REAL (E2B + OpenHands + Chromium + Supabase + LLMs, fixture `xmdtest-site`):
  - T1: jedwali la kesi 45/45 (decide 11, decideNext 14);
  - T2: kasoro 3 zilizopandwa → SIGNED_OFF kwenye raundi ya **2**; D-001 (toggle) ilihitaji majaribio 2;
  - T3: mstari wa RoundHeader uko kwenye prompts za computer, designer, frontend na pm za raundi ya 3, na ni sahihi;
  - T4: CO mbaya (header fixed inafunika hero) → `REVERT (7 regression(s))` + `git revert` ndani ya sandbox + D-001 REOPENED (cause REVERTED);
  - T5: `kill -9` wakati wa VERIFYING → resume kwenye raundi ileile, `verify:M1:R3` ni rekodi moja, evidence haikurudiwa.
- Kasoro 7 zilizopatikana kwenye runs halisi zimerekebishwa (zina tests):
  - dedupe ya reviewers;
  - kasoro zinazojulikana kuripotiwa tena;
  - retry ya 429;
  - regression ya code `occluded` (reviewers walipitisha madhara);
  - `git stash` kabla ya revert;
  - ids za CO (`nextCoNumber`);
  - `attempt` ya header wakati wa verify.
- Hatari kwa CEO: reviewers wa LLM hawagundui madhara yasiyotajwa ambayo si ya kufunika; pendekezo ni ulinganisho wa landmarks za DOM. Maelezo yako task-26.md.
- Baselines: tsc 0 · vitest 661 + 2 skipped (+45) · pytest 338 + 3 · unittest 271 OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-26.md + docs/tests/task-26/ (bila `.log`).

## Task 27 — Escalation ladder

- Branch `task/27-escalation`, nyuma ya `XMD_MILESTONES` (OFF kwa default). Inategemea T26 (main `51c7eaf`, Koyeb `26804d5c` HEALTHY).
- `milestone/escalation.ts` (ina unit tests): ladder kwa attempt — 1 standard · 2 concrete (diagnosis ya Optimus + CO kamili) · 3 pair_patch (diff ya Vextron → `git apply --check`/`git apply` ya harness, au Computer verbatim) · 4 split (faili 1 / property 1, REPRODUCE kwanza, lane switch "skipped" imerekodiwa) · ≥5 redecide (KEEP / MODIFY → ledger decision / WAIVE = reviewers wote + Optimus + sababu; si kimya).
- `Defect.history` (diagnosis, mode, outcome) + chips `D-xxx escalated to attempt N (mode)`; `waivers:Mk` + `state.waivers` (kwa ripoti ya mwisho / T28); `amendments:Mk` + `decisions`; conflict guard ya COs (selector/property) kabla ya kutuma.
- REAL (E2B + OpenHands + Chromium + Supabase + LLMs, fixture `xmdtest-site`):
  - T1: ladder 1→5 dhidi ya A1 (LOCKED) → redecide **WAIVE** (zamu 3) → `SIGNED_OFF_WITH_WAIVERS`;
  - T2: grid ya CSS → patch ya Vextron `git apply` attempt 3 → checks 5/5 + reviewers PASS → D-001 VERIFIED_FIXED;
  - T3: Optimus alichagua NOT_ATTEMPTED mwenyewe (inalingana na NO-OP detector), JSON valid;
  - T4: WAIVE kwenye `state:M1.waivers` + `waivers:M1`;
  - T5: `CAP_REACHED` 10/10, hakuna R11.
  - Historia iliyopandwa (T2/T4/T5) imewekwa wazi kwenye task-27.md.
- Kasoro 4 zilizopatikana kwenye runs halisi zimerekebishwa (zina tests):
  - race ya bridge kwenye NO-OP rerun (`msBridgeGen`);
  - SIGN_OFF ya uongo bila waiver → BLOCKED yenye sababu, na `*.log` si UNLISTED;
  - **kinga ya hitaji** (consolidation ilikuwa inageuza hitaji kimya kimya);
  - Computer kuandika `RIPOTI.md` kwenye repo.
- Hatari kwa CEO: kinga ya hitaji inashughulikia checks za computed_style tu; split inaweza kuongeza kazi isiyohusiana chini ya defect ileile.
- Baselines: tsc 0 · vitest 683 + 2 skipped (+22) · pytest 338 + 3 · unittest 271 OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-27.md + docs/tests/task-27/ (bila `.log`).

## Task 28 — Kikomo cha raundi, sign-off, commit/tag, defects zilizorithiwa

- Branch `task/28-signoff`, nyuma ya `XMD_MILESTONES` (OFF kwa default). Inategemea T27 (main `31650ed`).
- `milestone/signoff.ts` (ina unit tests): `closeOutMilestone` — ledger `MS-Mk` → commit + annotated tag `milestone-Mk` (+ push ikiwa remote ipo, idempotent) → baselines (task 22, raundi ya mwisho isiyo-REVERT) → `finalReport` → event `milestoneSignedOff` / `milestoneCapReached`; kila hatua inarekodiwa `signoff:Mk` (resume bila kurudia).
- Cap: defects wazi → `INHERITED` (`inheritedFrom`, `inheritedChecks`) → ledger + plan (§10) + StartPack "(e)" ya milestone inayofuata + ripoti ya mwisho; checks zake zinaendeshwa kila raundi ya milestones zinazofuata. Cap haionyeshwi kamwe kama "clean".
- `SIGNOFF_MAX_OPEN_SEVERITY = "minor"`: minor wazi zinaruhusiwa TU zikiwa kwenye `backlog` ya ledger + ripoti; medium+ → hakuna sign-off (`closeoutProblems`).
- Test hooks: `XMD_TEST_MAX_ROUNDS`, `XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_<Mk>`, `nextMilestone`, na **test profiles** (`XMD_TEST_PROFILE_DIR` + `[xmdtest:<jina>]`) kwa majaribio kwenye Koyeb.
- REAL (E2B + OpenHands + Supabase + LLMs; T4a/T4b/T5 **kwenye Koyeb** kwa agizo la CEO):
  - T1: defects 2 → `SIGNED_OFF`, `git tag -l` → `milestone-M1`, baselines 3, ledger `MS-M1`;
  - T2: `XMD_TEST_MAX_ROUNDS=2` → `CAP_REACHED`, D-001 `INHERITED`, iko kwenye plan:M2 na StartPack:M2 (grep);
  - T3: WAIVE → `SIGNED_OFF_WITH_WAIVERS`, sababu kwenye ledger;
  - T4: minor wazi → `SIGNED_OFF` + backlog; medium wazi → hakuna sign-off (`CAP_REACHED`);
  - T5: `kill -9` baada ya commit/tag (Koyeb) → resume: `tag exists`, tag 1, commit 1, ledger 1, event 1.
- Kasoro 3 zilizopatikana kwenye runs halisi zimerekebishwa: `.xmd/checks` kwenye commit ya sign-off; baselines kutoka raundi iliyorudishwa; alama ya crash `/tmp` haidumu kwenye restart ya Koyeb.
- Koyeb: env mpya `XMD_TEST_PROFILE_DIR=docs/tests/task-28/inputs` (haina athari bila tag). Sheria ya CEO S1 (majaribio kwenye Koyeb) imehifadhiwa `task-docs/SHERIA-ZA-CEO.md`.
- Hatari kwa CEO: kanuni ya T26 "defects ziliongezeka → REVERT" inahesabu kasoro mpya zilizokuwepo tangu mwanzo; push ya tag haijajaribiwa na remote halisi.
- Baselines: tsc 0 · vitest 699 + 2 skipped (+16) · pytest 338 + 3 · unittest OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-28.md + docs/tests/task-28/ (bila `.log`).

## Task 29 — Technical review mode (backend/security — bila screenshots)
- Branch `task/29-technical-review` · nyuma ya `XMD_MILESTONES` · inategemea T21 + T26.
- **Technical evidence** (`src/lib/cu/techEvidence.ts`): secrets scan juu ya faili za git (`git ls-files` / `git grep`, thamani zinafichwa: `ghp_****…(42 chars)`, `.env` iliyo-commitiwa),
  amri za plan (build/test/lint/typecheck/migrations) + `npm audit --omit=dev` (lockfile ya muda inafutwa), checks za plan (`command`/`grep`/`http`/`file_*`/`db`),
  http negative (bila credentials → 401) na app safi (process iliyochakaa kwenye port inazimwa), db/RLS kupitia client ya Supabase ya app (`dbProbe.ts` + rpc `docs/sql/xmd_table_security.sql`), git diff summary.
- **Reviewers:** `reviewCast` — technical → Megatron (backend) + Cybertron (qa) kutoka roster; mjadala/COs ileile ya T23–T24 kwa prompt ya technical; Megatron hayupo bila backend kwenye roster.
  Analysis bila picha inaweza kutumia lane yoyote nzito; kosa la LLM → retry baada ya kusubiri.
- **COs:** Optimus anapata TECHNICAL HINTS (checks kamili za plan, matokeo, faili halisi); acceptance za technical ni `command`/`grep`/`http`/`db`/`file_*` tu; url `/path`, body ya JSON; hakuna globals za browser.
- Hakuna hatua ya screenshot kwa technical (mixed: zote mbili). Mkataba wa receipts: log za app nje ya repo, `.gitignore` haiguswi bila order.
- REAL: T1–T3 (E2B halisi + Supabase halisi, harness `docs/tests/task-29/real.mjs`); **T4 + T5 kwenye Koyeb** (S1) — T4 run 7 `SIGNED_OFF` + tag `milestone-M1` bila screenshots kwenye manifest;
  T5 reviewers wote wawili (huru) waliflag "Build report falsely claims secrets scan is clean". Runs 6 za T4 kabla ya PASS zilifichua kasoro 15 (K0–K14), zote zimerekebishwa na zina unit tests.
- Koyeb: env `XMD_TEST_PROFILE_DIR=docs/tests/task-29/inputs`. Hatari: uwezo wa LLM (Gemini/OpenRouter quotas), Optimus bado anaweza kubuni amri za acceptance.
- Baselines: tsc 0 · vitest 730 + 2 skipped (+31) · pytest 338 + 3 · unittest OK · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-29.md + docs/tests/task-29/ (bila `.log`).

## Task 30 — Judging lanes (Flash ×4 keys → XKiro → Flash-Lite), lane logging, vision rule
- Branch `task/30-judging-lanes` · nyuma ya `XMD_MILESTONES` · inategemea T2, T23–T26 · broker imeguswa kidogo (darasa jipya `judge` pekee).
- **Judge chain** (`policy.ts` `JUDGE_CHAIN`): Gemini Flash (models zote × keys 4, zinazunguka, thinking `reasoning_effort: high`) → XKiro → Flash-Lite;
  fall-through kwa admission ya kawaida. Inatumika na reviewer analysis, verify na mjadala wa review (`milestone/judge.ts`). Lanes/policies nyingine hazijabadilika.
- **Rekodi kwa kila wito** → `state:Mk.lanesUsed` (callId, stepId, lane, model, keyId iliyofichwa, visionCapable, usedFallback, tokensIn/Out, ms, visionDegraded) + chip `🔌 Mk lanes` kwenye export.
- **Vision rule:** picha kwenye lane bila vision → digest ya Flash (iliyohifadhiwa) + DOM metrics, `visionDegraded:true`; sign-off ya visual/mixed kwa verdicts za degraded
  inakataliwa → `PAUSED_QUOTA` (system, `resumeAt`) → inasubiri lane ya vision → re-verify → sign-off.
- Test hooks (judge pekee): `XMD_TEST_LANES_DOWN`, `XMD_TEST_LANES_NOVISION`; routes `/api/xtest/lanes`, `/api/xtest/judge`.
- REAL (Koyeb, S1): T1 10/10 Flash, keys 4 (3/3/2/2) · T2 Flash down → XKiro, zote → Flash-Lite (`usedFallback`) · T3 `reasoning_effort: high`, reasoning tokens 86–3357 ·
  T4 (session f9f5cb7b) `visionDegraded` + digest → sign-off ya mixed imekataliwa → `PAUSED_QUOTA` → Flash inarudi → RESUME → `SIGNED_OFF` · T5 board turns XKiro,
  observers Flash-Lite, heavy Flash licha ya hook (hook ni judge pekee) · T6 export `.md` ina chips 3 za lanes + records 8.
- Kasoro 4 zilizopatikana kwenye runs halisi zimerekebishwa: judge `maxHops` 5 → 32 (429 discovery); thinking tokens kutoka `total_tokens`; digest `maxHops` 32;
  `stepId` ya record wakati wa wito; (review ya docs) vigezo vya digest vilivyomezwa na comment.
- Koyeb: env `XMD_TEST_PROFILE_DIR=docs/tests/task-30/inputs`. Hatari: reviewers wa degraded wanaflag touch-target minors (DOM) → REVERT inaweza kuzunguka; ledger ya usage haidumu kati ya deploys.
- Baselines: tsc 0 · vitest 749 + 2 skipped (+19) · pytest 338 + 3 · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-30.md + docs/tests/task-30/ (bila `.log`).

## Task 31 — Final report (Optimus → CEO), ya kweli na yenye ushahidi
- Branch `task/31-final-report` · nyuma ya `XMD_MILESTONES` · inategemea T26–T30 · ripoti ya sehemu 10 ya non-milestone mode haijaguswa.
- **`milestone/finalReport.ts`:** data kwa code (map, `state:Mk` raundi + lanesUsed, defects OPEN/INHERITED/WAIVED, `waivers:Mk`, proposals zilizokubaliwa, Build Reports,
  evidence/checks, technical checks, Ledger, mini-reports, repo/live links, post-deploy) → sehemu 7; 2/4/5/6 = code, 1/3/7 = Optimus (report skill). Hakuna plan.
- **Sheria ya ukweli (code):** `COMPLETED` tu milestones zote zimesainiwa + hakuna INHERITED + post-deploy PASS; vinginevyo `CAP_REACHED in Mk` / `PARTIAL — see open defects`
  + sababu; `enforceHonesty` → `[PARTIAL]` badala ya complete/completed/imekamilika. `maskSecrets`. Rekodi `finalReportDoc`.
- **Post-deploy (`cu/engine.ts` `milestonePostDeploy`):** GET routes muhimu = 200, checks za http/browser za plan ya milestone ya mwisho iliyotekelezwa, screenshots za deployed mode.
  Hooks: `XMD_TEST_FINAL_REPORT=1`, `XMD_TEST_LIVE_URL=sandbox` (live ya majaribio = host ya umma ya E2B port 4180 — si Vercel).
- REAL (Koyeb, S1): run C (3d94cb62) CAP → T1–T5 PASS · run W (91faa597) WAIVE → `SIGNED_OFF_WITH_WAIVERS`, waiver + sababu (T3 PASS) — ilifichua post-deploy kuchagua M2
  (haijaanza) → fix `d821776` · run W2 (775f358c) baada ya fix: post-deploy M1 PASS (screens 3), `CAP_REACHED in M1`, T1–T5 PASS. COMPLETED: unit tests pekee.
- Koyeb: env `XMD_TEST_PROFILE_DIR=docs/tests/task-31/inputs`. Hatari: Gemini Flash 503 (high demand) wakati wa majaribio; scrub ya honesty ni ya maneno.
- Baselines: tsc 0 · vitest 754 + 2 skipped (+5) · pytest 338 + 3 · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-31.md + docs/tests/task-31/ (bila `.log`).

## Task 32 — End-to-end REAL run (acceptance ya mfumo mzima) · **ACCEPTANCE FAIL** (ripoti ya ukweli)
- Branch `task/32-e2e` · Koyeb (S1) · `XMD_MILESTONES=1` kwa test profile `[xmdtest:e2e]` pekee · brief ya portfolio (dark, sw/en, Supabase contact, Vercel).
- Runs 8 halisi E1–E8 (~36 h): hakuna milestone iliyosainiwa kwa haki; raundi nyingi zaidi E6 M2 R5 / E8 M3 R3; E8 final report (code) = **PARTIAL** (M1–M4 BLOCKED, hakuna live URL).
- PASS: Recovery (E2, review R0 bila duplicate) · Detach (E6, dakika 10 paused → Resume) · lane log judges 82, `visionDegraded` 0 · sign-off ya uongo inakataliwa (Fix 15, live E8 M2).
- Fixes 17 (kila moja commit ndogo + test): 1–15 live; **16** plan repair hadi 2× + PART 1 kwa makosa ya §1–§4 + validator ya Start Command; **17** BLOCKED ya R0 inarudiwa mara 1 (re-plan) — unit tests tu (CEO: hakuna E9).
- Gharama: Computer 3 492 requests / ~1.02 B tokens · judges 2.18 M in / 98 k out · ujumbe 729. Pendekezo: **usiwashe flag kwenye prod**.
- Usafi: sessions 8 + screenshots 189 zimefutwa, sandbox ya E8 imeuawa; QUESTIONS.md (maswali 3 + majibu ya CEO).
- Baselines: tsc 0 · vitest 786 + 2 skipped (+32) · pytest 346 + 3 · eslint (bila backups/) 29 = kabla. Ushahidi: docs/tests/task-32.md + docs/tests/task-32/shots/ (bila `.log`).

## Task 33 — MISSION ONE: kumbukumbu ya review (mini-report inayokua) · **DONE (mock/unit tests)**
- Branch `task/33-review-memory` · spec: `task-docs/NEXT-STEP.md` (CEO 2026-10-22) · REAL test imeahirishwa kwa agizo la CEO.
- Mpya: `src/lib/milestone/reviewMemory.ts` — rekodi `memo:Mk` yenye sehemu 8 (review R0 · fix · verify · sync · discussion · redecide · escalation · close); facts za code + maelezo ya Optimus; ukaguzi wa code wa kila D/P/CO; reviewers 2 wanathibitisha R0 mara moja (CONFIRM/AMEND).
- Uthibitisho (`buildVerifyPrompt`): mini-report (3 kamili / za zamani zimefupishwa) + findings za R0 za reviewer mwenyewe + historia ya defects + mini-reports za agenda — bila transcript. Computer: historia ya defects kwenye fix pack.
- requestDiscussion ≤6 zamu (sync 1 / redecide ≤4 kama zilivyokuwa); matokeo yote kwenye mini-report. UI: badge ya "mini report imeandikwa" tu.
- Baselines: tsc 0 · vitest 804 + 2 skipped (+18) · eslint 29 = kabla. Ushahidi: docs/tests/task-33.md.
