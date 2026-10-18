# Task 14 — Mfupa wa milestone loop na trigger (code inaamua) (maelezo14)

Branch: `task/14-milestone-trigger`. Iko nyuma ya `XMD_MILESTONES` (default OFF).

## Kilichobadilika
- `src/lib/milestone/loop.ts` (mpya):
  - `maybeCloseMilestones(runner, hooks)`: kwa kila milestone ya ramani, agenda zake zote zikiwa kwenye Ledger (`finalBoardResolution`) na state bado `DISCUSSING` → CAS `DISCUSSING → PLANNING` (store ya Task 10) → `runMilestoneBuild`.
  - `runMilestoneBuild` (STUB): event `milestoneClosed {id}` + chip `🏁 Milestone Mk closed — …`; hatua `Mk.R0.plan`, `Mk.R0.build` → `DONE` (`stub:true`); state → `SIGNED_OFF` kupitia forward edges halali (PLANNING→BUILDING→EVIDENCE→REVIEW_R0→SIGNED_OFF).
  - `msUpdate`/`mirrorChip`: kila andiko la store linawekwa pia kwenye `runner.msChips` (persist ya Board haizifuti).
- `src/lib/boardRunner.ts`: trigger mwishoni mwa kila agenda + mara moja kwenye resume (kabla ya kitanzi) + wavu wa mwisho baada ya kitanzi. OCB (stage `DISCUSS`) kwenye prompts za mjadala: owner, observer, objection (pande 2) — flag ON + ramani pekee; vinginevyo prompt haibadiliki.
- `src/lib/milestone/types.ts`: `StepEntry.stub?: boolean`.
- `src/lib/milestone/ocb.ts`: mstari sasa unafuata kiolezo cha maelezo11 haswa: `YOU ARE HERE: <stage> | Milestone …`; maelezo ya hatua (`step 2: agenda discussion`) yamehamia kipande cha mwisho cha mstari (snapshots 45 zimesasishwa — diff ni mstari huo tu).
- `src/lib/milestone/testHooks.ts` (mpya, inert bila `XMD_TEST_HOOKS=1`): `XMD_TEST_CAPTURE_PROMPTS=<jsonl>` (system prompt halisi ya kila zamu ya mjadala), `XMD_TEST_MAX_AGENDAS=<n>`.
- Tests: `__tests__/loop.test.ts` (7).

## Maamuzi niliyojifanyia (CEO amelala — kanuni ya batch 13–20)
1. **"Agenda imefungwa" = iko kwenye `finalBoardResolution`** (LOCKED au OBJECTED_OPEN) — kanuni ile ile ambayo validator ya finale (HATUA 6.4) inatumia.
2. **`milestoneClosed` inatolewa TU na aliyeshinda CAS** `DISCUSSING → PLANNING`. Resume ya milestone iliyo PLANNING+ inaendelea bila kutoa event tena (T2 inahitaji M1 isirudi).
3. **Kinga ya ndani ya process** (`globalThis.__xmdMsRunning`) dhidi ya wito sambamba ndani ya process moja; kati ya processes, CAS ya store ndiyo inaamua.
4. Trigger inaitwa pia **baada ya kitanzi** (agenda ya mwisho iliyoruka kwa `continue` isiache milestone wazi) na **kwenye resume kabla ya kitanzi** (crash baada ya Ledger kabla ya trigger).
5. Hitilafu ya loop haiangushi Board: inaandikwa `⚠️ Milestone loop: …` na mjadala unaendelea.
6. OCB inaingia kwenye prompts za **mjadala tu** (owner, observer, objection). Code writer/reviewer si stage ya DISCUSS → hazikuguswa.
7. OCB `counts`: lockedDecisions = chips `🔒 LOCKED` za session; milestonesDone = states terminal kutoka msChips; defects/waivers = 0 (zinakuja tasks za review).
8. **Kiolezo cha YOU ARE HERE** kimesawazishwa na maelezo11 (tazama juu) ili T3 ipite kwa maandishi halisi ya spec.
9. **Test hooks mpya** (XMD_TEST_HOOKS=1 tu): kunasa prompts (T3/T4) na kukata agenda hadi 3 (generator haitii idadi iliyoombwa).
10. Dev server ya local lazima iwe `next dev --turbopack` — webpack inazidi RAM ya sandbox (GB 2) wakati wa compile ya route ya boardroom (ilijaribiwa: server ilikufa/kukwama).

## Majaribio HALISI (local `next dev --turbopack`, Supabase + keys halisi)
Ramani ya kulazimishwa (`XMD_TEST_MAP_FORCE`): M1 = agenda 1–2 [optimus, ultron, vextron], M2 = agenda 3 [optimus, megatron, cybertron]. `XMD_TEST_MAX_AGENDAS=3`. Brief: `xmdtest-mstrigger`.

### T1 — mfuatano — PASS
Session `0a2200a9-73cc-472f-82bb-e31474c8199c` (SSE `runT14a.log`, mstari):
```
1467 🔒 LOCKED: (agenda 1)            1560 🔒 LOCKED: (agenda 2)
1614 EVENT milestoneClosed M1         1616 🏁 Milestone M1 imefungwa → PLANNING
1617 🧩 M1.R0.plan DONE (stub)        1618 🧩 M1.R0.build DONE (stub)   1619 ✅ M1 → SIGNED_OFF
1622 🎯 Agenda 3 …                    1771 🔒 LOCKED: (agenda 3)
1815 EVENT milestoneClosed M2         1820 ✅ M2 → SIGNED_OFF
```
`milestoneClosed` M1 ×1, M2 ×1; chip `🏁 Milestone M1 closed — Foundation (agendas 1–2)` ×1, M2 ×1.
DB (store): `M1 v5 SIGNED_OFF M1.R0.plan:DONE:stub M1.R0.build:DONE:stub` · `M2 v5 SIGNED_OFF …`. Session ilisimamishwa (pause) kabla ya CU.

### T2 — usalama wa restart — PASS
Session `f7024891-21a7-480e-9ee6-a7478bb4125e`.
- `milestoneClosed M1` ×1 (mstari 311); agenda 3 ilianza (header mstari 319) → **`kill -9`** ya next dev + next-server kwenye mstari 343 (23:50:30), M2 bado wazi. DB kabla ya restart: `M1 v5 SIGNED_OFF`, status `agenda_2_mini`.
- Restart ya server (env ile ile) → sweeper ya Task 5: `[orphan] f7024891 stale 1min -> recovered` → `[cu/autoResume] ♻️ f7024891… imeanza tena`.
- Stream baada ya resume (`runT14b2.log`): `♻️ Kipengele 1/3 tayari kimeshughulikiwa — kinarukwa`, agenda 3 ilirudiwa, **`milestoneClosed M1` = 0**, `milestoneClosed M2` ×1 (mstari 1472) → SIGNED_OFF. (Chip ya M1 inaonekana mara moja tu kama replay ya items zilizohifadhiwa, kabla ya resume.)
- DB baada: `M1 v5` (haijaguswa — hakuna andiko lolote baada ya restart) · `M2 v5 SIGNED_OFF`.

### T3 — prompts — PASS
Prompts 14 halisi zilinaswa (`promptsT14b.jsonl`). Zote zina OCB mwanzoni (`=== OPERATION CONTEXT` kwenye index 0). Agenda 1 (Vextron):
`YOU ARE HERE: DISCUSS | Milestone M1: Foundation (agendas 1–2), milestone 1 of 2 | agenda 1: Define HTML structure and basic CSS styling for the contact page | step 2: agenda discussion`
Zote za agenda 1–2 zina `YOU ARE HERE: DISCUSS | Milestone M1`; zote za agenda 3 zina `… | Milestone M2`.

### T4 — flag OFF — PASS
Session `37ffdaad-f495-4337-ba87-4cec4cd95d93` (agenda 3 zote LOCKED, ilisimamishwa mwanzoni mwa finale).
- Event kinds hadi finale: sawa kabisa na baseline ya flag OFF (`runT13c`, Koyeb): 18 = 18, tofauti 0.
- `milestone*` / `🏁 Milestone` / `Participants:` / `OPERATION CONTEXT` kwenye SSE: 0.
- Prompts 22 zilizonaswa: OCB **0**. Prompt ya pm agenda 1: mstari wa kwanza wa OFF == mstari wa kwanza wa ON baada ya kuondoa kizuizi cha OCB (tofauti pekee ni OCB).

## Baselines (branch)
tsc 0 · vitest **455 passed + 2 skipped** · pytest 308 · unittest OK (238) · eslint 0 (`src/lib/milestone`, `boardRunner.ts`).

## Usafi
Sessions 4 za majaribio zimefutwa (0a2200a9, b610533b — run iliyoishia `error` kwa lanes za heavy kujaa, f7024891, 37ffdaad): `clean.mjs --go`, `cleanstore.mjs` (cu_files 0), `find.mjs --go` (0). Hakuna run iliyofika CU → hakuna sandbox/snapshot mpya. Dev servers zimezimwa.
