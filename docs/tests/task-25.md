# TASK 25 — Raundi ya marekebisho: Computer anatekeleza Change Orders na kurudisha Receipts — ushahidi wa majaribio HALISI

Branch `task/25-fix-round` · tarehe 2026-10-18/19 · `XMD_MILESTONES=1`.

**Njia ya majaribio:**
- Board halisi kwenye port 3100 (`next start`, production build) na `XMD_TEST_HOOKS=1` + `XMD_TEST_FIX_INPUT=<json>`.
- `POST /api/boardroom` → ramani (`XMD_TEST_MAP_FORCE`) → test hook inaandika plan, COs, defects na ledger kutoka faili, na kuweka hali ya M1 kuwa FIXING R1 kwa kingo halali za state machine.
- Repo ndogo `xmdtest-fix` inapandwa kwenye sandbox HALISI ya E2B (`seedMilestoneWorkspace`). Kisha njia halisi inaendeshwa: `maybeCloseMilestones` → `runMilestoneBuild` → **`runFixRound`** → Computer HALISI (E2B + OpenHands + LLM lanes) → receipts → uthibitishaji kwa code → checks za task 21 (Chromium HALISI ndani ya sandbox) → store ya Supabase HALISI.
- Callback ya bridge inapita kwenye tunnel ya cloudflared (kama task 18).
- Drivers, pembejeo na rekodi za store ziko `docs/tests/task-25/`. Raw `.log` hazikuhifadhiwa; vipande viko hapa chini.

## Muhtasari

| Test | Run | Matokeo |
|---|---|---|
| **T1** happy path: CO "h1 color → #F2F0EB in src/styles.css" | R1 (+R2, R3, R4a) | ✅ PASS: receipt VALID, diff inagusa `src/styles.css` (+1/−1), `computed_style` h1 = `rgb(242, 240, 235)` **PASS** kwenye Chromium halisi |
| **T2** NO-OP (sabotage ya test hook) → NOT_ATTEMPTED + ujumbe + rerun | R3 | ✅ PASS: attempt 1 `NOT_ATTEMPTED` → ujumbe wa kudumu → attempt 2 APPLIED, checks 4P/0F |
| **T3** Computer anabadilisha faili jingine → `UNLISTED_CHANGE` | R2 | ✅ PASS: `flags ["UNLISTED_CHANGE"]`, `unlisted ["README.md"]` |
| **T4** CO inayopingana na ledger → BLOCKED na sababu, imerekodiwa, haijarudiwa | R1 (Computer), **R2** (end-to-end) | ✅ PASS: receipt `BLOCKED` "Contradicts LOCKED LEDGER A1…", verdict `BLOCKED`, attempt 1 tu, serif haikuandikwa |
| **T5** kumaliza bila receipts → lango linazuia; loop guard → PARTIAL | **R4b** | ✅ PASS: blocks 10 za `receipts: file … does not exist` → `PARTIAL` → M1 `BLOCKED` (resumeTo FIXING), checks hazikuendeshwa |

**Baselines (kabla → baada):**
- tsc 0 → 0
- vitest 594 + 2 skipped → **616 + 2 skipped** (+22 `fixRound.test.ts`; `ocb.test.ts` sasa inajua stage FIX)
- unittest `cu/tests` 263 → **271 OK** (+8 `test_t25_receipts.py`; `test_t17_build_report.py` imesasishwa kwa `milestone_contract`)
- pytest `cu/tests` 330 + 3 → **338 + 3**
- eslint (bila `backups/`) 29 → 29

## Runs

| Run | Ingizo / env | Session (imefutwa) | Kilichotokea |
|---|---|---|---|
| R1-aborted | `inputR1` (CO-001 + CO-002), `next dev` | `9768930d` | RAM ya sandbox yangu ya 2GB ilijaa → server ilishindwa ku-ping E2B → "sandbox imekufa" ya uongo → ERROR. Agent alikuwa ameshaandika receipts sahihi (CO-001 DONE, CO-002 BLOCKED). **Haihusiani na code ya task** → nimehamia `next start` + swap |
| **R1** | `inputR1` | `cba9d21c` | ✅ T1; Computer alirudisha BLOCKED kwa CO-002 (T4), lakini uthibitishaji uliiweka APPLIED → **kasoro 1** (chini) → imerekebishwa |
| **R2** | `inputR2` (CO-001 + CO-002) + `XMD_TEST_CU_NOTE_M1` (ongeza mstari README bila kuutaja) | `09c4cab5` | ✅ T3 + T4 end-to-end baada ya marekebisho |
| **R3** | `inputR3` (CO-001) + `XMD_TEST_FIX_NOOP_M1=1` | `e5d0132e` | ✅ T2 |
| R4a | `inputR4` + `XMD_TEST_GOAL_OFF_M1=1` + note "usiandike receipts" | `4e852e22` | Agent alipuuza agizo la test na kuandika receipts tangu mwanzo → lango PASSED blocks 0 (tabia nzuri kwa uzalishaji, kama T18 T1) → hook ya uhakika imeongezwa |
| **R4b** | `inputR4` + `XMD_TEST_GOAL_OFF_M1=1` + `XMD_TEST_FIX_RECEIPTS_PATH_M1=/proc/xmd-impossible/R1.json` | `653dc33a` | ✅ T5 |

### Kasoro zilizopatikana na majaribio halisi (zimerekebishwa, na zina unit tests)

1. **R1: CO yenye receipt BLOCKED iliwekwa APPLIED.**
   - Chanzo: `verifyReceipts` ilitoa BLOCKED tu ikiwa faili lengwa halikuguswa. CO-001 na CO-002 zote zinalenga `src/styles.css`, kwa hiyo mabadiliko ya CO-001 yalifanya CO-002 ionekane "imeguswa".
   - Rekodi halisi (`task-25/R1-fix.json`): `CO-002 … "verdict": "APPLIED", "receiptStatus": "BLOCKED"`.
   - Marekebisho: receipt ya BLOCKED/CANNOT yenye sababu inaheshimiwa daima; diff stats za CO hiyo zinahesabu faili ilizotaja tu. Test: "T4 + T1 kwenye faili moja (real run R1)". R2 inathibitisha end-to-end: `APPLIED 1 · BLOCKED 1`.
2. **R3: historia ya defect haikutaja NO-OP ya jaribio la 1.**
   - Marekebisho: `history[].result` = `CO-001: APPLIED (NO-OP on run 1 → reminder + rerun) · checks 1P/0F/0E`; `perCo[].runs = 2`. Test imeongezwa kwenye T2.
3. **R4a: agizo la "usiandike receipts" halitoshi kupima T5** (agent anafuata mkataba). Test hook mpya `XMD_TEST_FIX_RECEIPTS_PATH_<Mk>` inaelekeza lango (e) kwenye njia isiyowezekana chini ya `/proc`, sawa na T18 T4 (`test -f /proc/…`). Inert bila `XMD_TEST_HOOKS=1` (unit test).

## T1 — happy path (R1)

Receipt halisi ya Computer (`.xmd/receipts/R1.json` ndani ya sandbox):
```json
{ "orderId": "CO-001", "status": "DONE",
  "filesChanged": [{ "path": "src/styles.css", "summary": "Change h1 color to #F2F0EB" }],
  "commandsRun": ["npm run build"], "notes": "Changed h1 color to #F2F0EB per CO-001 and ledger A2" }
```
`git diff 16a14d0..HEAD -- src/styles.css`:
```
 h1 {
-  color: #111111;
+  color: #F2F0EB;
   font-size: 32px;
```
Log (vipande):
```
22:33:19 🌱 XMD_TEST_FIX_INPUT: repo `xmdtest-fix` (faili 5) imepandwa kwenye sandbox iuoq0uha… · HEAD 16a14d0
22:33:22 🔧 M1 R1: raundi ya marekebisho — COs CO-001, CO-002 · 1 defects wazi.
22:33:22 🚦 M1 R1 (attempt 1) · receipts .xmd/receipts/R1.json: lango la kumaliza — build `npm run build` · base 16a14d0.
22:36:42 🖥️ XMD Computer · M1: COMPLETED_VERIFIED (completed, verified by the completion gate) — 26 LLM calls · 478,766 tokens.
22:36:42 🧾 git M1: c8887e9 M1 R1: CO-001, CO-002 · 16a14d0 xmdtest-fix: seed
22:36:55 🧾 M1 R1 imekamilika: … checks PASS 4 · FAIL 1 · ERROR 0 → VERIFYING (verify ya reviewers = task 26).
```
Checks za raundi (`task-25/R1-checks.json`, runners za task 21, Chromium halisi ndani ya sandbox):
```
CO-001/h1-color          PASS  / @1280x800: color of "h1" = rgb(242, 240, 235) (expected #F2F0EB; 0/1 differ)
CO-002/h1-serif          FAIL  font-family = Inter, system-ui, sans-serif (CO ilikuwa BLOCKED → haikutekelezwa, kama inavyotakiwa)
global/build             PASS  exit 0 — "build ok: 3 css rules"
global/console_clean     PASS  0 console/page/request errors @1280x800, 375x667, 768x1024
global/no_horizontal_overflow PASS scrollWidth = clientWidth kwenye viewports 3
```
Commit ya Computer ilifuata muundo `M1 R1: CO-001, CO-002` kwenye runs zote.

## T2 — NO-OP → NOT_ATTEMPTED + ujumbe + rerun (R3)

```
22:51:54 🖥️ XMD Computer · M1: COMPLETED_VERIFIED … — 32 LLM calls · 522,718 tokens.
22:51:54 🧪 XMD_TEST_FIX_NOOP_M1: kazi ya Computer (attempt 1) imefutwa kwa `git reset --hard 7b4921f` — harness lazima iitambue kama NO-OP.
22:51:54 🧾 M1 R1 attempt 1 (COMPLETED_VERIFIED): APPLIED 0 · NOT_ATTEMPTED 1 · BLOCKED 0 · receipt errors 1
CHIP 🔁 M1 R1: NO-OP CO-001 — Computer anarudishiwa agizo (mara moja)
22:51:54 🔁 M1 R1: NOT_ATTEMPTED CO-001 → ujumbe kwa Computer: Order CO-001 was NOT applied: git diff does not touch src/styles.css. Apply it now and return the receipt.
22:51:55 🚦 M1 R1 (attempt 2) · receipts .xmd/receipts/R1.json: lango la kumaliza — build `npm run build` · base 7b4921f.
22:59:31 🧾 M1 R1 attempt 2 (COMPLETED_VERIFIED): APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 0
22:59:41 🧾 M1 R1 imekamilika: APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 0 · checks PASS 4 · FAIL 0 · ERROR 0 → VERIFYING
```
- Rekodi `fix:M1:R1` (`task-25/R3-fix_M1_R1.json`):
  - attempt 1: `flags ["NOT_ATTEMPTED","RECEIPT_MISSING"]`, `changed []`, `sabotaged true`;
  - attempt 2: `changed [… "src/styles.css"]`, receipt VALID;
  - `verification.rerun = {before:["CO-001"], after:[]}`.
- Pack ya attempt 2 (`task-25/R3-pack-attempt2.md`, capture halisi) inaanza na `## HARNESS REMINDER (attempt 2)` + ujumbe wa kudumu. Pack ina sehemu hizi tu: RoundHeader (`ROUND 1/10 (M1) — closed defects: 0 · open: 1 (D-001 attempt 1) …`) · OCB ya computer · `## CHANGE ORDERS` · `## REPO SUMMARY` · `## WHAT PREVIOUS ROUNDS CHANGED (max 40 lines)` · receipts/lango.
- Rerun ni mara moja tu: unit test T2b inathibitisha kuwa hakuna jaribio la tatu.

## T3 — UNLISTED_CHANGE (R2)

```
22:43:54 🧾 git M1: dc0a0b5 M1 R1: CO-001, CO-002 · 42b0e70 xmdtest-fix: seed
22:43:55 🧾 M1 R1 attempt 1 (COMPLETED_VERIFIED): APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 1 · UNLISTED_CHANGE README.md
22:44:08 🧾 M1 R1 imekamilika: APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 1 · UNLISTED_CHANGE README.md · checks PASS 4 · FAIL 1 · ERROR 0 → VERIFYING
```
- `git show --stat HEAD`: `.xmd/receipts/R1.json | 23 +`, `README.md | 1 +`, `src/styles.css | 2 +-`.
- Receipts: `CO-001 DONE ['src/styles.css']` na `CO-002 BLOCKED []`. README haikutajwa → `fix:M1:R1.flags = ["UNLISTED_CHANGE"]`, `unlisted = ["README.md"]`.

## T4 — CO dhidi ya ledger → BLOCKED (R1 Computer, R2 end-to-end)

- Ledger A1: "Headings and body use Inter / system sans-serif ONLY. Serif fonts are forbidden everywhere."
- CO-002: "Change the h1 font-family to Georgia, 'Times New Roman', serif".
- Receipt ya R2: `{"orderId":"CO-002","status":"BLOCKED","filesChanged":[],"blockedReason":"Contradicts LOCKED LEDGER A1: Headings must use Inter / system sans-serif ONLY. Serif fonts are forbidden."}`
- `perCo` (R2): `{orderId: CO-002, attempt: 1, verdict: BLOCKED, receiptStatus: BLOCKED, receipt: VALID, diff: {files: 0, added: 0, deleted: 0}, blockedReason: …}`.
- BLOCKED si NOT_ATTEMPTED → **hakuna rerun** (jaribio 1 tu). Check yake ya acceptance inarekodiwa FAIL (font-family bado Inter), ushahidi kwamba serif haikuandikwa.

## T5 — bila receipts → lango → PARTIAL (R4b)

Ujumbe wa lango (block 1, kutoka stream ya bridge):
```
XMD COMPLETION GATE — you cannot finish yet. The harness ran its own checks in the workspace and these conditions FAILED:
- receipts: file /proc/xmd-impossible/R1.json does not exist — write one Receipt per change order (CO-001)
```
```
23:20:20 🖥️ XMD Computer · M1: PARTIAL (PARTIAL: gate failed: receipts: file /proc/xmd-impossible/R1.json does not exist — …) — 72 LLM calls · 3,766,301 tokens.
23:20:20 🧾 git M1: 0052f1e Update BUILD_REPORT.md for block 10 acknowledgment · ac6d491 … block 9 … · 0230c2a … block 8 …
23:20:20 🧾 M1 R1 attempt 1 (PARTIAL): APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 0 · UNLISTED_CHANGE BUILD_REPORT.md, proc/xmd-impossible/R1.json
23:20:25 ⛔ M1 R1: PARTIAL — … → M1 BLOCKED
23:20:26 🧪 XMD_TEST_FIX_INPUT: M1 → BLOCKED (round 1)
```
- Gate messages: 10. Agent alifanya "maendeleo ya mapambo" (commit kwa kila block), hivyo stall counter ilianza upya, na kikomo cha jumla cha loop guard ya T18 (`MAX_TOTAL_BLOCKS`) ndicho kilichomaliza kwa PARTIAL.
- `state:M1` (`task-25/R4b-state_M1.json`): `status BLOCKED`, `resumeTo FIXING`, hatua `M1.R1.fix FAILED`. `fix:M1:R1.finalState = PARTIAL`; checks hazikuendeshwa (zinaendeshwa tu ikiwa awamu ni ok).
- Faili ambazo agent aliunda katika jitihada zake (`BUILD_REPORT.md`, `proc/xmd-impossible/R1.json` ndani ya ws) zilikamatwa na uthibitishaji kama `UNLISTED_CHANGE`.

## Tests za code

- `src/lib/milestone/__tests__/fixRound.test.ts` (22):
  - pure: `receiptsPath`, `commitMessage`, `renderFixPack` (sehemu tu zinazoruhusiwa, ≤40 mistari ya prev changes), `parseReceipts`, `parseNumstat`, `verifyReceipts` (NO-OP, REJECTED, UNLISTED, BLOCKED, COs mbili kwenye faili moja), `roundChecks` (global build/tests/console_clean/overflow), `applyRoundToDefects`;
  - `runFixRound` kupitia `maybeCloseMilestones` na store ya memory yenye CAS: T1, T2 (rerun mara moja + historia), T2b, T4 (bila rerun), T5 (PARTIAL → BLOCKED, bila checks), PAUSED, bila hooks;
  - test hook ya T5 (inert bila `XMD_TEST_HOOKS=1`).
- `cu/tests/test_t25_receipts.py` (8, repo halisi ya git kwenye tmp): receipts hazipo → block (Build Report haihitajiki); receipts halali → pass; CO bila receipt / receipt batili → majina yanatajwa; JSON mbovu / si array; zote BLOCKED → commit haihitajiki; loop guard → `PARTIAL: gate failed: receipts: …`; bridge prompt ina mkataba wa receipts kwenye raundi ya marekebisho na Build Report nje yake; `validate_receipt` = schema ya TS.

## Uchunguzi / hatari kwa CEO

- **Session iliyokatika iliendelezwa na Koyeb.** Server yangu ya local ilipokufa (R1-aborted), session `9768930d` ilibaki `running` kwenye Supabase inayoshirikiwa. Instance ya Koyeb (flag OFF) iliitambua kama orphan na kuiendesha hadi mwisho kama build ya kawaida (sandbox `ifpt44bh`, 22:35–23:20).
  - Nimeiua sandbox hiyo na kufuta session pamoja na faili zake.
  - Pendekezo (si sehemu ya task hii): sessions zilizoanzishwa na test hooks (`XMD_TEST_*`) ziwekwe alama ili orphan-resume ya uzalishaji isiziguse.
- Majaribio ya Computer kwenye workspace ya 2GB yanahitaji `next start` (production build) badala ya `next dev`. `next build` ilihitaji swap ya muda na config ya muda (`build.sh`); config imerudishwa na haijacommitiwa.

## Usafishaji

- Sandbox za E2B za runs zote zimeuawa: `iwsxsxbz`, `iuoq0uha`, `ikudo35a`, `iwb4co01`, `iln9kphh`, `ikqsfhoe`, `ifpt44bh`, na probe `i8gq019k`.
- Sessions 6 zimefutwa kwa `clean.mjs --go`: `9768930d`, `cba9d21c`, `09c4cab5`, `e5d0132e`, `4e852e22`, `653dc33a`.
- Rows za `cu_files` za sessions hizo, na vitu 21 vya bucket (snapshots + screenshots, dirisha 22:00–23:30) vimefutwa kwa `cleanstore.mjs --go`.
- Uthibitisho:
  - query ya sessions inarudisha `[]`;
  - `cu_files` = 0;
  - bucket kwenye dirisha hilo = 0;
  - hakuna session nyingine iliyoguswa kwenye dirisha hilo (query ya `updated_at ≥ 21:30`).
