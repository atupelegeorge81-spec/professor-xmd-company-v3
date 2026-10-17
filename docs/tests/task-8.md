# TASK 8 (CEO "fix matatizo yote ma3") · ushahidi (2026-10-17)

Branch `task/8-ceo-fixes` · main **1a2900a** (fixes) → **afe88f4** (pauseOrigin) · Koyeb deploy **e0582465** HEALTHY,
kisha **54d61d7c** (skip_build ya test R3) HEALTHY.

## Mabadiliko
| # | Tatizo (docs/tests/task-6-persist-first.md "Uchunguzi") | Fix | Faili |
|---|---|---|---|
| 1 | Health check ya Koyeb ilikuwa `/api/health` (DB) | Koyeb PATCH: `http /api/live`, port 3000, grace 60s, interval 60, timeout 5, restart_limit 3 | Koyeb service (si code) |
| 2 | SIGTERM grace ~1s (`sh -c next start`) | `"start": "NEXT_MANUAL_SIG_HANDLE=true exec next start"`: hakuna `sh` inayobaki, handler yetu inapata muda | package.json |
| 3a | Rolling deploy: resumeAt ilisubiri tick ya dk 10 | Burst ya `checkPausedDue` baada ya boot (grace 30s) | src/instrumentation.ts, src/lib/cu/autoResume.ts |
| 3b | `schedulePersist` iliandika `paused` kwa run iliyoresumiwa | status = `running` wakati CU hai (pausedOnce && !done) | src/lib/cu/engine.ts |
| 3c | pkill haikuua `oh_bridge.py` | `pkill -9 -f '[c]u_bridge.py'; pkill -9 -f '[o]h_bridge.py'; pkill -9 -f '[c]u_brain.py'; true` | engine.ts |
| 3d | Restore ilichagua kiovu tu hata kama hakijakamilika | Tar ya snapshot kwanza, kisha faili za kiovu (`cu_files`) juu yake | engine.ts |
| 3e | Ripoti iliyofika bila runner → `PARTIAL — missing report` | cu-event orphan inahifadhi `report` kwenye item ya finish; `ensureCuState` inairudisha | cu-event/route.ts, engine.ts |
| + | `autoResumeSession` `inflight` ilivuja (ilibaki milele baada ya kosa) | `finally` inafuta inflight | autoResume.ts |
| + | **Imegunduliwa kwenye Run D:** Detach → awamu ya CU inaisha → status `"error"` → Resume ya CEO inapita tawi la jumla la `resumeRun`, ambalo halifuti `pauseOrigin="user"`. Timer ya auto-resume ya quota pause iliyofuata iliruka KIMYA | Tawi la jumla: system + `pauseOrigin==="user"` → `"user_paused"`, na Resume ya user inafuta `pauseOrigin` | src/lib/boardRunner.ts |

Unit tests mpya: `src/lib/cu/engine.task8.test.ts` (**11**). Kwa code ya zamani: 8/10 za kwanza zinashindwa, na test ya
pauseOrigin inashindwa kwa boardRunner.ts ya 1a2900a (1 failed / 10 passed). Kwa code mpya: 11/11 zinapita.

## Baselines
tsc 0 · vitest **293 passed + 2 skipped** (zamani 282) · pytest 308 · unittest OK · eslint 0 (faili zilizobadilishwa).

## Item 1: health check `/api/live`
Deploy 4d3a14d0 (PATCH) → HEALTHY. Deploy za git zilizofuata zinarithi:
```
54d61d7c "health_checks":[{"grace_period":60,"interval":60,"restart_limit":3,"timeout":5,"http":{"port":3000,"path":"/api/live","method":"GET"...
live 200 0.291159
```

## R1: SIGTERM halisi (Run D, redeploy skip_build 15:15:07 → 93332de4)
```
15:16:10 [watchdog] sigterm · server imepata SIGTERM — runner anahifadhiwa kama paused (auto-resume +60s)
15:16:10 [cu/pause] 85d3a5c6 persist#1 paused · 253ms (t+254ms · origin system)
15:16:11 [cu/pause] 85d3a5c6 🎒 snapshot 53KB · 853ms · t+1108ms
15:16:11 [cu/pause] 85d3a5c6 persist#2 paused · 131ms (t+1240ms)
15:16:12 [watchdog] cooldown · Server inarestart — runner amepumzishwa; auto-resume baada ya 1dk
15:16:14 Instance stopped.          ← soft exit, HAKUNA "npm error signal SIGTERM"
bridge ndani ya sandbox baada ya SIGTERM: count=0            (3c)
15:18:34 [cu/autoResume] ♻️ 85d3a5c6… imeanza tena            (3a: resumeAt 15:17:09 + 85s; zamani ~dk 8)
85d3a5c6 status=running maxI=51 → 45s baadaye status=running maxI=105   (3b)
```
Kabla ya fix (Task 6 T2): process ilikufa ~1s, kabla ya snapshot. **PASS**.

## R2: restore tar + kiovu (Detach 15:19:40 → Resume 15:20:35)
Faili `ws/xmdtest-shell.txt` liliundwa kwa e2b (halikuwa kwenye kiovu; kiovu kilikuwa na faili 3).
```
15:19:40 persist#1 paused · 200ms (origin user) · snapshot 94KB t+875ms · persist#2 t+1081ms
sandbox mpya in3gzuidanevbmq9cibn0: xmdtest-shell.txt mtime 15:19:39 (kutoka tar) · faili za kiovu mtime 15:20:43–44 (juu yake)
```
Baadaye quota pause iliua sandbox na resume ikaenda sandbox ya **tatu** (iot1a2cofwuf6mnyr7ccq). Faili la shell lilikuwepo
tena (mtime 15:19:39, maudhui `xmdtest-shell-1792250379`). Run D iliisha **COMPLETED_UNVERIFIED** (maxI 411). **PASS**.

## Ugunduzi wa Run D: timer ya quota auto-resume haikufyatuka
Judge: "deadline 300s imepita baada ya majaribio 3" → quota pause, resumeAt 15:40:17. Timer haikufanya kitu. Run
iliendelea 15:43:59 tu kwa sababu poll yangu ya `/api/boardroom/active` iliamsha sweep + checkPausedDue (bila poll ingesubiri
tick ya dk 10).
Chanzo: boardRunner.ts:3849 inaweka `status="error"` baada ya pause ya CU, kwa hiyo Resume ya CEO baada ya Detach haipiti
`unpauseRun` (inayofuta `pauseOrigin`). `pauseOrigin="user"` ilibaki, na `scheduleAutoResume` ikaruka kimya.
Fix (+5 mistari): commit 44d1f7b, unit test inaonyesha kosa kwa code ya zamani.
Real test ya njia hii haiwezekani kwa mahitaji: inahitaji quota pause halisi ya bridge baada ya Detach/Resume.

## R3: ripoti iliyofika bila runner (Run E2, session d82319c4)
Hali ya Task 6 T2 (bridge inamaliza wakati instance haina runner) haitokei tena kwa kawaida, kwa sababu 3c inaua bridge.
Kwa hiyo **matukio yaliingizwa kwa makusudi** (`xmdtest/orphinj.sh`) kwenye njia halisi ya server:
redeploy skip_build 16:24:11 → SIGTERM → pause 16:25:12 (resumeAt 16:26:12, maxI 41) → instance mpya haina runner:
```
POST finish  i=541 (report "# RIPOTI xmdtest-orphan (Task 8 R3) …") → {"ok":true,"orphan":true}
POST run_end i=542 status done                                   → {"ok":true,"orphan":true}
mistari ile ile imeongezwa kwenye /home/user/events.jsonl ya sandbox · bridges=0
16:27:37 [cu/autoResume] ♻️ d82319c4… imeanza tena   (resumeAt + 85s)
d82319c4 status=completed final=COMPLETED_UNVERIFIED maxI=542
· 🖥️ XMD Computer: completed, NOT yet verified — ripoti + 31,934 tokens.
item cu_finish_541 ina "xmdtest-orphan (Task 8 R3)…" · cu_end_105 finalState COMPLETED_UNVERIFIED
```
Kabla ya fix: PARTIAL — missing report. **PASS**.
(Run E ya kwanza, 135ba408, ilimaliza kabla sijaingiza matukio, kwa sababu grep ya sid haikulingana. Ilifutwa, haina ushahidi.)

## Uchunguzi (haujabadilishwa)
- Wakati wa retries za judge (deadline 300s × 3), DB haiandikwi hadi ~dk 10. Orphan sweeper iliiruka kwa usahihi
  (`skipped (live runner)`).
- `/api/boardroom/active` inaamsha sweep + checkPausedDue, kwa hiyo inaweza kuficha bugs za timer wakati wa kupima.

## Usafi
Sessions 85d3a5c6, 135ba408 na d82319c4 zimefutwa, pamoja na plans, reports, board_ledger na cu_files. Snapshots za
bucket d7ec13a3, 62fd8ec4, 0799d686 na fc1f1ef4 zimefutwa. Sandboxes za majaribio hazipo tena. `find.mjs` → hits 0.
Session 88ef0a2d (stale, user-paused, ya zamani) haijaguswa.
