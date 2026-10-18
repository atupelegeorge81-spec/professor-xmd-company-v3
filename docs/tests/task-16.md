# Task 16 (maelezo16): XMD Computer kwa kila Milestone, ushahidi

Branch `task/16-computer-per-milestone`. Flag `XMD_MILESTONES` (default OFF). Flag ikiwa OFF, njia ya zamani haibadiliki (T5).

## Nini kimebadilika

- **`src/lib/milestone/startpack.ts` (mpya).** StartPack ya kila awamu ina sehemu tano:
  - (a) plan ya milestone neno kwa neno;
  - (b) Ledger fupi ya agenda za milestone hii tu (`[LOCKED]`);
  - (c) muhtasari wa repo: `find` tree + `git log --oneline` (`REPO_SUMMARY_CMD` → `parseRepoSummary`);
  - (d) muhtasari wa Build Reports zilizopita (≤60 mistari, `summarizePrevBuilds`);
  - (e) kasoro zilizorithiwa.

  `renderStartPack` inaanza na OCB `YOU ARE HERE: BUILD | Milestone Mk`.
- **`src/lib/cu/engine.ts`.** `startComputerPhase(runner, hooks, phase)` ina overload mpya ya milestone. Kila awamu ni milestone MOJA, na inapata:
  - StartPack mpya na bridge MPYA (mazungumzo mapya ya OpenHands, hakuna chat ya milestone iliyopita);
  - sandbox iliyopo ikiwa hai (ping), la sivyo sandbox mpya + restore;
  - liveness `CU_LIVENESS_MS` (default dakika 15) → STUCK;
  - commit ya harness kwa jina "XMD Computer";
  - snapshot ya mwisho wa awamu (tar + `.git`) → bucket.

  `run_end` inamaliza AWAMU, si session. Session inabaki "running" na Board inaendelea.
- **`src/lib/milestone/loop.ts`.** `runBuildStep`: build si stub tena. Inaita `hooks.build`. Ikirudisha STUCK/BLOCKED/ERROR, milestone inakuwa BLOCKED (resumeTo BUILDING). PARTIAL inahesabiwa sawa. Store ni `build:Mk`.
- **`src/lib/boardRunner.ts`.** `msHooks.build` → `startComputerPhase(..., phase)`. Resume ya CU ya zamani inarukwa flag ikiwa ON na ramani ipo.
- **`src/lib/milestone/testHooks.ts`.** `cuSilentBridge()` inawashwa na `XMD_TEST_CU_SILENT=1`, lakini tu pamoja na `XMD_TEST_HOOKS=1`; vinginevyo haina athari.
- **Tests mpya:** startpack 4, loop TASK-16 6, engine.task16 11 (zikiwemo 4 za snapshot/restore).

## Maamuzi yangu (CEO alikuwa amelala, sikuuliza)

1. **Concurrency guard (`msBusy`).** Awamu ikiendelea, ya pili inarudi ERROR "concurrency guard" bila kugusa sandbox. Hili linajibu swali la zamani la "bridges mbili kwenye session moja" (Task 12).
2. **Pause katikati ya build.** Hatua ya build inabaki RUNNING, na Resume inairudia (attempts=2). Hakuna nusu-hali.
3. **Sandbox kufa katikati ya awamu.** Ping ikishindwa mara 2 → ERROR → milestone BLOCKED. PARTIAL = ok.
4. **Commit ya harness.** Inafanywa na "XMD Computer" baada ya kila awamu. `.git/info/exclude` inazuia faili za harness (`plan.md`, `feature_list.json`, `AGENTS.md`, `.xmd/oh/`, `node_modules/`). Hivyo git inabeba kazi ya milestone tu.
5. **Snapshot ya mwisho wa awamu (tar.gz ya ws PAMOJA na `.git`).** Niliiongeza baada ya Run A. Sababu: kiovu (`cu_files`) kinanasa maandishi ya file editor tu, na M1 halisi iliunda README kwa `printf` kwenye terminal. Sandbox ikifa, kiovu pekee kingepoteza faili hizo na historia ya git.
   - Sasa sandbox MPYA inarejesha snapshot kwanza (hali kamili ya mwisho wa awamu).
   - Kiovu ni kinga tu snapshot isipokuwepo.
   - Kikomo ni `SNAPSHOT_MAX_BYTES` (40MB). Ikizidi, onyo hutolewa na kiovu ndicho kinga.
6. **`timeoutMs` ya command ya bridge = saa 24.** 0 inakata papo hapo, na default ya 60s inaua bridge. Liveness ndiyo sheria pekee ya muda.
7. **Njia ya milestone.** `checkCuStall` inarudi "ok", kwa sababu liveness ya `CU_LIVENESS_MS` ndiyo inayotawala.
8. **Resume ya CU ya zamani inarukwa** flag ikiwa ON na ramani ipo, ili kuepuka awamu mbili.
9. **`git log` kwenye repo bila commit** (awamu iliyokwama bila mabadiliko) inaonyesha "hakuna mabadiliko ya kucommit", si kosa la exit 128 (iligunduliwa kwenye T4).

**Mapungufu yanayojulikana (kwa tasks zijazo):**
- Flag ikiwa ON, `missingParts` ya finale → finale_incomplete.
- E2B Hobby ina ukuta wa saa 1 kwa sandbox (milestone ndefu sana inahitaji restore).
- Evidence/review bado ni stub (Tasks 17+).

**Mazingira ya test:** dev server ya local inahitaji swap. CU + turbopack inazidi RAM ya 2GB, na OOM-killer iliua jaribio la kwanza la Run A (dmesg). Rekebisho: swapfile 3GB + `--max-old-space-size=1100`. Hili si badiliko la production.

## Real tests (local `next dev --turbopack`, Supabase + lanes halisi + E2B halisi + bridge ya OpenHands kupitia cloudflared)

Brief: `xmdtest-cu16` (README peke yake). Agenda 2 kwa ramani ya kulazimishwa: M1 (agenda 1, README title) na M2 (agenda 2, mstari wa pili).

### T1 PASS: milestone 2 → awamu 2 → commits 2 (Run A, session 589882d4)

| Awamu | Mwanzo | Sandbox | StartPack | Matokeo |
|---|---|---|---|---|
| M1 | 05:33:05 | `itkfadxb` (mpya) | herufi 8524 | 05:36:15 COMPLETED_UNVERIFIED (LLM 21) · commit `80306f7 XMD M1: README title` |
| M2 | 05:37:52 | `itkfadxb` (**imetumika tena**: "workspace ya milestone iliyopita iko hai") | herufi 11510 | 05:47:14 COMPLETED_UNVERIFIED (LLM 85) · `70bf1a5 XMD M2: Second line · 80306f7 XMD M1: README title` |

Ndani ya sandbox (`e2bsh.mjs itkfadxb cmd`):
```
# xmdtest-cu16$
Line two: built by XMD Computer.$
70bf1a5 XMD M2: Second line
80306f7 XMD M1: README title
.xmd/oh: 799a9637…  e5955d2b…     ← mazungumzo 2 TOFAUTI ya OpenHands (bridge mpya kila awamu)
```
DB: `M1 v7 SIGNED_OFF M1.R0.build:DONE:a1`, `M2 v7 SIGNED_OFF M2.R0.build:DONE:a1`. Matukio: `milestoneBuild` ×2 (`freshSandbox` true/false).

### T2 PASS: prompt ya M2 ina StartPack na haina chat ya M1

Prompt halisi ya bridge ya M2 (iliyonaswa, `computer:M2`):

| Kipengele | Kipo? |
|---|---|
| `START PACK · Milestone M2`, `YOU ARE HERE: BUILD \| Milestone M2` | ✅ |
| (a) plan ya M2 · (b) Ledger `A2 [LOCKED]` · (c) `./README.md` + `80306f7 XMD M1: README title` · (d) `### M1 — README title: COMPLETED_UNVERIFIED` · (e) | ✅ |
| `START PACK · Milestone M1`, `A1 [LOCKED]` (StartPack ya M1) | ❌ (sahihi) |
| `RESUME CONTEXT`, `Recent completed commands` (resume note ya zamani) | ❌ (sahihi) |
| Mawazo (think) ya agent wa M1: sentensi 0/126 | ❌ (sahihi) |
| Amri za M1: 1/12, ile iliyonukuliwa ndani ya ripoti ya M1 yenyewe | (sehemu ya (d)) |

Maandishi pekee ya M1 yaliyomo ni **ripoti ya mwisho ya M1** ndani ya sehemu (d) "Previous Build Reports (summary)", kama spec inavyotaka. Chat ya M1 haipo.

### T3 PASS: sandbox inauawa baada ya M1 → M2 inarejesha (Run B, session 620938b5)

- M1 kwenye `i8n6zndx` iliisha 05:53:43, na snapshot ilihifadhiwa: "🎒 M1: snapshot ya workspace (pamoja na git) imehifadhiwa (15KB)".
- Kabla ya kuua sandbox: `# xmdtest-cu16` + `2616771 XMD M1: README title`.
- `node e2bsh.mjs i8n6zndx kill` → `killed i8n6zndxenznbzarsexbv` (05:53:53, E2B halisi).
- M2: "🎒 M2: sandbox MPYA iakleeb1… — snapshot ya milestone iliyopita imerejeshwa (faili 6 + historia ya git)". Tukio: `milestoneBuild {"id":"M2","ok":true,"restored":6,"freshSandbox":true}`.
- StartPack ya M2 ina note: `IMPORTANT: this is a NEW sandbox — the workspace of earlier milestones was restored (6 files)`, pamoja na `2616771 XMD M1` kwenye (c).
- Ndani ya `iakleeb1`: `# xmdtest-cu16` / `Line two: built by XMD Computer.` / `e6e995e XMD M2: Second line` / `2616771 XMD M1: README title`. Commit ya M2 iko JUU ya historia ya M1.
- DB: M1 na M2 SIGNED_OFF, build DONE.

### T4 PASS: bridge kimya + `CU_LIVENESS_MS=60000` → STUCK → BLOCKED (Run C, session 31a780c8)

Env ya server ilithibitishwa kwenye `/proc/<pid>/environ`: `CU_LIVENESS_MS=60000`, `XMD_TEST_CU_SILENT=1`.
```
06:01:19.839 🧪 XMD_TEST_CU_SILENT: bridge ya kimya (test hook)…   🚀 M1: sandbox izf328ts…
06:02:19.886 ⏱️ M1: hakuna tukio la bridge kwa 60s (CU_LIVENESS_MS) — bridge inasimamishwa → STUCK.   (60.05s)
phase_done {"ok":false,"status":"stuck","finalState":"STUCK","finalReason":"stuck · liveness: no bridge event for 60s","milestone":"M1"}
⛔ Build ya M1: STUCK — … → M1 BLOCKED.
```
DB: `M1 v6 BLOCKED M1.R0.build:FAILED:a1`. Board iliendelea na agenda 2 (M2 PLANNING). Hitilafu ya awamu haiangushi Board.

### T5 PASS: flag OFF, njia ya zamani (Run D, session dd9c86a7)

`XMD_MILESTONES=0` (environ). Matukio `milestone*`: **0**. `START PACK`/"Milestone Mk inaanza": **0**. Prompts zilizonaswa ni `discussion` tu (hakuna `plan:Mk`/`computer:Mk`). Plan mode ya zamani: "Ripoti kamili (10/10)", kisha awamu MOJA ya CU ya zamani mwishoni (`run_start` ×1). Session ilisimamishwa (pause) baada ya CU kuanza, na sandbox yake iliuawa na pause.

### Usafi

- Sessions 4 (589882d4, 620938b5, 31a780c8, dd9c86a7): `clean.mjs --go`, `cleanstore`, `find --go` → hits 0. `msget` → "session not found".
- Snapshots 4 za bucket zimefutwa (`delsnaps.mjs`, 200).
- Sandboxes: `itkfadxb`/`iakleeb1` ziliuawa na harness (awamu ya mwisho +15s), `i8n6zndx`/`izf328ts` kwa mkono, ya Run D na pause.
- `e2blist`: zimebaki zile 16 za zamani tu (si zetu).
- Jaribio la kwanza la Run A (OOM) lilisafishwa pia: sandbox `ifsxrjct` + session 4690a1fd.

## Baselines (bila dev server)

tsc 0 · vitest 489 + 2 skipped (491) · pytest 308 · unittest 238 OK · eslint 0 (faili zilizoguswa).
