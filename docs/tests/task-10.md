# TASK 10 (maelezo10) — Milestone state machine + persistence (real DB) · ushahidi (2026-10-17)

Branch `task/10-milestone-state` · main **56b897d** → Koyeb deploy **60b53039** HEALTHY.

## Faili
| Faili | Nini |
|---|---|
| src/lib/milestone/state.ts (mpya) | `transition(state, event) → {state} \| {error}` (events `GOTO`/`RESUME`), `FORWARD_EDGES`, `newMilestoneState`, step ledger (`planSteps`, `setStep`, `nextStep`, `stepIdOf`), lane log (`appendLaneUse`, `maskKeyId`). Pure. |
| src/lib/milestone/store.ts (mpya) | `putRecord` (CAS), `updateRecord` (read→mutate→CAS + retry), `getRecord`, `loadMilestones`, `MilestoneConflictError` (`code VERSION_CONFLICT`). Inert bila `XMD_MILESTONES`. |
| src/lib/milestone/flag.ts (mpya) | `milestonesEnabled()`: `XMD_MILESTONES` = 1/true/on; default OFF. |
| src/lib/milestone/types.ts | + `StepEntry`/`STEP_STATUSES`, `LaneUse`, `MilestoneState.resumeTo?`, `steps?`; `lanesUsed: LaneUse[]`. |
| src/lib/milestone/schemas.ts | `validateMilestoneState` inakagua pia lanesUsed (kila sehemu), resumeTo (lazima kwenye pause/blocked), steps (stepId ya milestone hiyo, bila duplicate). |
| src/lib/usageChip.ts | +1 mstari: `__PROFESSOR_XMD_MILESTONE__:` ni hidden chip (haionyeshwi kwenye UI). Haisomi wala haiandiki store. |
| src/lib/milestone/__tests__/state.test.ts (mpya) | Tests 48. |

## Muundo wa persistence (hakuna table/column mpya)
- Table `boardroom_sessions`, column `items` (pack/unpack ya `gz1:` iliyopo). Kila rekodi ni hidden chip moja:
  id `__professor_xmd_ms__<key>`, text `__PROFESSOR_XMD_MILESTONE__:{key,version,data}`; key = `map` au `state:M1`.
- **CAS:** (1) kwa rekodi: `expectedVersion` ≠ version iliyopo → `MilestoneConflictError`; (2) kwa row: `UPDATE … WHERE id=… AND
  updated_at=<iliyosomwa>`. Writer mwingine akiandika katikati → 0 rows → soma upya na ukague version tena. Hakuna update inayopotea.
- Kanuni zinazolindwa wakati wa kuandika state: lanesUsed ni append-only, na step iliyokuwa DONE inabaki DONE.

## Maamuzi
- **CEO (ask_user):** REVIEW_R0 → FIXING inaweka round = 1 (R0 = review tu, fixes = rounds 1..10). Baada ya hapo round
  inaongezeka TU kwenye VERIFYING → FIXING. CAP_REACHED inaruhusiwa kutoka VERIFYING tu, na round = 10.
- **Ufafanuzi wangu:**
  - Hali za mwisho (SIGNED_OFF*, CAP_REACHED) haziwezi kupauzwa.
  - BLOCKED inarudi kwa RESUME kama pause, kwa sababu haimo kwenye orodha ya hali za mwisho.
  - Pause → pause nyingine inahifadhi resumeTo ya asili.
  - Mpito wa no-op ni haramu.
  - `maskKeyId`: lebo ≤8 (mf. `uno#2`) zinabaki; ndefu → herufi 4 + `***`.

## T1 — pure (`CI=1 npx vitest run src/lib/milestone/__tests__/state.test.ts --reporter=verbose`)
- Kingo halali **34**: forward 12 (kila kingo cha graph) + pause 21 (hali 7 hai × PAUSED_QUOTA/PAUSED_INFRA/BLOCKED, na RESUME
  inarudi pale pale bila kubadili round) + pause → pause 1.
- Kingo haramu 10 (zote zinarudisha `{error}`):
```
  DISCUSSING -> BUILDING (kuruka)
  PLANNING -> REVIEW_R0
  BUILDING -> SIGNED_OFF
  EVIDENCE -> FIXING
  REVIEW_R0 -> CAP_REACHED
  FIXING -> SIGNED_OFF (bila verify)
  SIGNED_OFF -> FIXING (ya mwisho)
  CAP_REACHED -> PAUSED_QUOTA (ya mwisho)
  PAUSED_QUOTA -> FIXING (lazima RESUME)
  RESUME kutoka BUILDING (si pause)
  ziada: no-op na CAP mapema
 ✓ T1 · round > REVIEW_R0 → FIXING = round 1; inaongezeka TU kwenye VERIFYING → FIXING; > 10 ni haramu
```
- Round: R0→FIXING = 1; FIXING→VERIFYING haiongezi; VERIFYING→FIXING +1 hadi 10;
  `illegal transition VERIFYING -> FIXING: round 11 > maxRounds 10`; `VERIFYING -> CAP_REACHED: round 4 < maxRounds 10`.
- Step ledger / lane log: `step M1.R1.fix is DONE — it is never executed again`; re-run ya RUNNING → attempts 2; keyId `sk-o***`.
- `Tests 48 passed (48)` · milestone yote 76/76. **PASS**.

## T2 — real DB roundtrip (Supabase; session doc `xmdtest-state` 99004b91)
```
$ node ms.mjs create            → 99004b91-e436-46ce-980a-cb1d19031895
$ node ms.mjs t2 99004b91…
map valid: true
written versions: 1,1,1
read back: map v1 states M1,M2 statuses BUILDING DISCUSSING
deepEqual map: true · M1: true · M2: true
```
**PASS**.

## T3 — crash/resume (process 2 tofauti)
```
pid 1957 wrote M1 v2: M1.R0.build=DONE M1.R0.evidence=DONE M1.R0.review=DONE M1.R1.fix=DONE M1.R1.verify=RUNNING M1.R2.fix=PENDING
process exits now (simulated crash: verify bado RUNNING)
pid 1969 (NEW process) read M1 v2 · nextStep = M1.R1.verify
re-run DONE step M1.R1.fix → step M1.R1.fix is DONE — it is never executed again
```
**PASS**.

## T4 — concurrency (processes 2 sambamba, DB halisi)
```
init state:M8 version 1
worker A pid 2871: 20 updates done · attempts 39 (conflict retries 19) · 26732ms · start 17:42:23.938
worker B pid 2872: 20 updates done · attempts 29 (conflict retries 9) · 20224ms · start 17:42:23.906
final version 41 · lanesUsed 40 (A 20, B 20) · unique 40 · keyIds sk-x***
stale writer (expected v1, current v41) → MilestoneConflictError VERSION_CONFLICT · version conflict on state:M8 (session 99004b91): expected version 1, found 41 — re-read and retry
```
Writers walianza ndani ya 32ms ya kila mmoja, na conflicts 28 zilitokea na kurudiwa. Version ya mwisho = 41 (1 + 40); kila
update ya kila writer ipo, kwa hiyo hakuna update iliyopotea. Jaribio la kwanza (M9) lilitoa matokeo yale yale (v41, 40/40).
Doc kwenye DB (items `gz1:` packed=true): chips `map v1`, `state:M1 v2`, `state:M2 v1`, `state:M9 v41`, `state:M8 v41`. **PASS**.

## T5 — flag OFF
```
$ MS_FLAG=off node ms.mjs flagoff …
flag off → milestone store is disabled (XMD_MILESTONES is off)      (read)
flag off → milestone store is disabled (XMD_MILESTONES is off)      (write)
grep imports za src/lib/milestone nje ya folder lake: 0 (mstari pekee = comment kwenye usageChip.ts) · XMD_MILESTONES nje: 0
Koyeb env: XMD_MILESTONES haipo (0)
```
**Real run diff** (Koyeb, brief ile ile `briefA.json`; signature ya muundo kutoka `xmdtest/runsig.mjs`):

| | Kabla (deploy 1b314ae) | Baada (deploy 60b53039, Task 10) |
|---|---|---|
| Run iliyozuiwa na plan gate (structure_failed, tofauti ya LLM) | A0: finale_incomplete · BLOCKED · hidden chips CU_STATE/RESUME_STATE/USAGE · milestoneChips 0 · cu [divider,error,run_end] | B0: **sawa kabisa** (`diff` tupu) |
| Run iliyokamilika | A2: completed · COMPLETED_UNVERIFIED · hidden chips 3 zile zile · milestoneChips 0 · cu 9 aina | B2: completed · COMPLETED_UNVERIFIED · hidden chips 3 zile zile · milestoneChips **0** · cu aina zile zile **+ error, pause** |

Tofauti pekee ya B2 ni `error` + `pause`: judge "deadline 300s imepita baada ya majaribio 4" → quota pause → auto-resume. Hili
ni tukio la runtime, si la code. Timer ya Task 8 ilifyatuka 18:40:51 (resumeAt 18:40:50) bila poll. **PASS**.

## Ugunduzi (nje ya wigo wa Task 10 — haujabadilishwa, unahitaji uamuzi wa CEO)
**Bridge mbili kwa session moja baada ya quota auto-resume (B2, 3ab83dd1).**
- Run ilikamilika 18:44:38 kwenye sandbox `i6yszvqh…`. Lakini sandbox ya **pili** `i17b52pp…` iliundwa 18:43:33, na bridge hai
  `oh_bridge.py --session 3ab83dd1… --start-i 118 --resume-note` (events 185, bado inafanya kazi 18:45).
- Server iliendelea kupokea events zake. Baada ya session kufutwa: `❌ Session update error: Document not found` 18:45:41–18:47:14.
  Iliisha nilipoua sandbox; `/api/boardroom/active` → `{"active":null,"paused":null}`.
- `--start-i 118` < maxI 126 ya pause, kwa hiyo launch ya pili ilitumia hali ya zamani (runner wa pili, au state iliyochakaa).
  Njia pekee ya launch ni `startComputerPhase` (engine.ts:467), na haina kinga dhidi ya kuitwa sambamba kwa session moja.
  Muda unalingana na `pauseForRebuild` (+2dk) baada ya kosa la E2B wakati wa resume, lakini haikuthibitishwa: items zilifutwa
  kwenye usafi kabla ya kugundua, na blog haziko kwenye logs za Koyeb.
- Pendekezo: task ndogo ya uchunguzi + kinga, mf. lock ya kila session kwenye `startComputerPhase` na kuua bridge za zamani kabla
  ya launch.

## Baselines (kabla → baada)
tsc 0 → 0 · vitest 321 + 2 skipped → **369** + 2 skipped (+48) · pytest 308 → 308 · unittest 238 OK → 238 OK · eslint 0.

## Usafi
Session `xmdtest-state` 99004b91 imefutwa. Runs za T5 (8fca36c0, 6e310d00, 1c49e4a4, 3ab83dd1) zimefutwa pamoja na plans,
reports, board_ledger, cu_files na snapshot 2f55c73b. Sandbox i17b52pp imeuawa. `find.mjs` → hits 0.
Session 88ef0a2d haijaguswa.
