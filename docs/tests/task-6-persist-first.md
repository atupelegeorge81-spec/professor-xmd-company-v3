# TASK 6 (maelezo6) — Persist-first pause · ushahidi (2026-10-17)

> Namba: maelezo6 inaiita "TASK 6", lakini Task 6 tayari ni "maamuzi 3 ya CEO" (docs/tests/task-6.md).
> Ili kuepuka mgongano, ushahidi huu uko kwenye `task-6-persist-first.md` na branch ni `task/6-persist-first`.

Branch `task/6-persist-first` · main **b722ca6** · Koyeb deploy **fdc1aed8 HEALTHY** (majaribio yote yalifanyika kwenye deploy hii;
redeploy ya T2 = 9072b9df, image ileile).

## Mabadiliko
| Faili | Nini |
|---|---|
| src/lib/cu/engine.ts | `pauseComputerFromServer`: **persist#1** (chip + session `paused` + resumeAt/pauseOrigin) mara tu baada ya ujumbe wa pause, KABLA ya tar (≤4s race). Snapshot ina bajeti (`limits {budgetMs,maxBytes}`), kila hatua `within()`; > kikomo / bajeti imeisha / error → `🎒 snapshot skipped (…)` na **sandbox inabaki hai**. Snapshot ikifaulu → **persist#2** (rejea ya snapshot). Sandbox inauawa TU kama snapshot MPYA imechukuliwa. Upload: `InputFile.fromBuffer(bytes)` (hakuna `Buffer.from` copy). |
| src/lib/server/watchdog.ts | `cooldown(…, waitBusyMs)`: SIGTERM ikikuta cooldown nyingine inaendelea → inasubiri ≤3s kisha inaendelea (si `return`). Watchdog/SIGTERM zinatumia `PRESSURE_SNAPSHOT_LIMITS` = 20s / 8MB. |
| src/lib/cu/engine.persistFirst.test.ts | Unit tests 7 (mpangilio persist→tar, skip kwa cap, skip kwa bajeti, sandbox inabaki, Detach haina bajeti, n.k.). |

Detach (user) haina bajeti: cap 40MB na timeouts za zamani. Persist-first imeongezwa juu yake tu.

## Unit tests
- `engine.persistFirst.test.ts` → **7/7**.
- Kwa engine.ts ya zamani (main a1db5fa), tests hizo hizo → **6 failed / 1 passed**, kwa hiyo zinapima tabia mpya kweli.

## Majaribio halisi (Koyeb, sessions `xmdtest-persist`)
Alama za logs (`klog.sh 'cu/pause'`): `persist#1 paused · Xms (t+Yms …)`, `🎒 snapshot NKB · ms · t+ms`, `🎒 snapshot skipped (…)`, `persist#2`.

### T1 — system pause (route ya majaribio), workspace ndogo · session 1f5f0c06
```
13:29:46.896 POST /api/xtest/system-pause {resumeMs:240000} → 200 (1.75s)
[cu/pause] 1f5f0c06 persist#1 paused · 193ms (t+194ms tangu pause · origin system)
[cu/pause] 1f5f0c06 🎒 snapshot 38KB · 841ms · t+1036ms
[cu/pause] 1f5f0c06 persist#2 paused · 153ms (t+1189ms tangu pause · origin system)
DB mara baada ya route: status=paused · resumeAt=13:33:47 · origin=system · snapshot=327d7f9e…
```
**PASS**: hali iliandikwa ndani ya 194ms, KABLA ya snapshot.

### T3 — snapshot ndani ya bajeti → resume inarejesha · session 1f5f0c06
- Sandbox i1hg97hp iliuawa kwa makusudi (E2B API) saa 13:30:20, ili resume ilazimike kutumia sandbox MPYA.
- Auto-resume 13:33:47 (`[cu/autoResume] ♻️ 1f5f0c06… imeanza tena`) → sandbox mpya **igbtzizn**: README.md, check.sh,
  feature_list.json, AGENTS.md na plan.md zipo. md5 za plan.md (9c84d5f0…) na AGENTS.md (6f657070…) ni **sawa** na kabla ya kuua.
- Snapshot ya bucket (38,888B) ilipakuliwa: tar.gz halali, ina hello.txt (`hello`), plan.md, AGENTS.md, TASKS.json na events 15.
- Run iliishia **completed / COMPLETED_UNVERIFIED**.

**PASS**. (Restore hii ilitoka kwenye kiovu `cu_files`, design ya R44-B. Restore ya tar imeonyeshwa kwenye T4.)

### T2 — 30MB junk + SIGTERM halisi (redeploy) · session ec657d45
```
13:50:14 head -c 30MB /dev/urandom > /home/user/ws/xmdtest-junk.bin   (sandbox ish7ihxq)
13:50:21 POST /v1/services/…/redeploy {"skip_build":true} → 9072b9df
13:51:25 [watchdog] 📜 SIGTERM — … kuhifadhi runner...
13:51:25 [cu/pause] ec657d45 persist#1 paused · 231ms (t+231ms tangu pause · origin system)
13:51:26 npm error signal SIGTERM · npm error command sh -c next start
13:51:26 Instance stopped.
DB: status=paused · resumeAt=13:52:25 (+60s, sahihi) · origin=system · snapshot=-
13:52:39 sandbox ish7ihxq: HAI, xmdtest-junk.bin 31457280B ipo
14:00:19 session → running (auto-resume) → bridge ilikuwa imemaliza kazi (events 33→138 ziliokolewa) → PARTIAL
```
**PASS kwa lengo** (hali ndani ya 3s: 231ms; resumeAt sahihi; sandbox haikuangamia; auto-resume ilifanya kazi).
Ugunduzi muhimu: **neema halisi ya SIGTERM kwenye Koyeb ni ~1s, si 30s.** `npm start` → `sh -c next start`: SIGTERM inaua `sh`,
npm (PID kuu) inatoka, na container inasimama ndani ya 1s. Snapshot haiwezi kumalizika wakati wa SIGTERM, na ndiyo sababu
persist-first ni muhimu. Kwa sababu container ilikufa mapema, cap ya 8MB haikuonekana hapa. Imethibitishwa kwenye T2b.

### T2b — cap ya 8MB (bajeti ileile ya watchdog/SIGTERM), 30MB junk · session 7e6a2faa
```
14:10:31 junk 30MB (sandbox ier4mdo1) · 14:10:31.711 POST system-pause {resumeMs:60000} → 200
[cu/pause] 7e6a2faa persist#1 paused · 146ms (t+147ms tangu pause · origin system)
[cu/pause] 7e6a2faa 🎒 snapshot skipped (30.0MB > kikomo 8MB) · t+1225ms
[cu/pause] 7e6a2faa persist#2 paused · 190ms (t+1415ms tangu pause · origin system)
DB: status=paused · resumeAt=14:11:32 · snapshot=- · sandbox ier4mdo1 HAI (junk ipo)
14:11:32 auto-resume → runner hai tena kwenye sandbox ileile
```
**PASS**.

### T4 — Detach (user) na faili kubwa → snapshot inachukuliwa → Resume inarejesha · session 7e6a2faa
```
14:12:09 POST /api/boardroom/pause → 200
[cu/pause] 7e6a2faa persist#1 paused · 537ms (t+537ms tangu pause · origin user)
[cu/pause] 7e6a2faa 🎒 snapshot 30805KB · 17758ms · t+18296ms
[cu/pause] 7e6a2faa persist#2 paused · 155ms (t+18451ms tangu pause · origin user)
DB: paused · resumeAt=0 · origin=user · snapshot=5092f8af… · sandbox ier4mdo1 imeuawa (kama kawaida ya Detach)
bucket: 31,543,848B · tar ina ./xmdtest-junk.bin 31457280 · ./hello.txt 5 · ./plan.md 9652
14:13:10 POST /api/boardroom/resume → sandbox MPYA iuclj57n:
  xmdtest-junk.bin 31457280 (mtime 14:10:31 ya awali) · hello.txt 5 (14:10:49) · plan.md · AGENTS.md · feature_list.json
14:18:19 completed / COMPLETED_UNVERIFIED
```
**PASS**. Restore ilitoka kwenye **tar ya snapshot**: mtime za awali zimehifadhiwa, na junk haiko kwenye kiovu.
Kabla ya Task 6, `paused` ingeandikwa baada ya sekunde ~18 hizi. Sasa inaandikwa ndani ya 0.54s.

### Smoke — Detach → Resume
Imefunikwa na T4 (Detach → snapshot → Resume → completed).

## Baselines
| | kabla (Task 6) | sasa |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 275 + 2 skipped | **282 + 2 skipped** (+7 mpya) |
| pytest | 308 | 308 |
| unittest | 238 | 238 OK |
| eslint (engine.ts, watchdog.ts, test) | 0 | 0 |

## Usafi wa data ya majaribio
- Sessions 4 (2b78ae0c plan-gate block, 1f5f0c06, ec657d45, 7e6a2faa): `clean.mjs --go` (session, project_plans, mini_reports) na `find.mjs --go` (board_ledger 2).
- Rows 9 za `cu_files` zimefutwa. Snapshot 2 za bucket (327d7f9e, 5092f8af) zimefutwa (authenticated GET → 400).
- E2B: hakuna sandbox ya majaribio iliyobaki hai.
- Real: project_plans 9 na sessions halisi hazijaguswa.
- Jaribio la kwanza (2b78ae0c) lilizuiwa na plan gate ya Task 4: Optimus aliacha sehemu 8. Hii ni tabia sahihi na haihusiani na kazi hii.

## Uchunguzi (tabia za ZAMANI, hazijabadilishwa; zinahitaji uamuzi wa CEO)
1. **SIGTERM grace ~1s kwenye Koyeb** (`sh -c next start` + handler ya Next.js ya `process.exit(0)`). Pendekezo: run command
   `node node_modules/next/dist/bin/next start` (bila `sh`/npm) + `NEXT_MANUAL_SIG_HANDLE=true`, ili handler yetu ipate muda.
   Hii inahitaji kubadilisha setting ya Koyeb au package.json.
2. **Rolling deploy**: instance mpya inawaka KABLA ya SIGTERM ya ile ya zamani. Boot scan inakuta session bado `running`,
   na `resumeAt` inachukuliwa na tick ya dk 10 (T2: dk 8 badala ya 60s).
3. `schedulePersist` inaandika `paused` kwa run iliyoresumiwa (`pausedOnce && !done`, tangu R31-G4). DB inaonyesha paused
   wakati CU inaendelea, hadi mwisho.
4. pkill ya pause inalenga `cu_bridge.py|cu_brain.py`, **si `oh_bridge.py`**. Bridge ya OpenHands inaendelea baada ya pause,
   hadi launch inayofuata iiue (zombie kill).
5. Restore inachagua kiovu kikiwa na faili ≥1 hata kama hakijakamilika (T3: hello.txt haikuwa kwenye kiovu, lakini ilikuwa kwenye tar).
6. Run ya T2 ilimaliza `PARTIAL — missing report` ingawa maandishi ya ripoti yapo kwenye events.
