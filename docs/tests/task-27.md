# TASK 27 — Escalation ladder — ushahidi wa majaribio HALISI

Branch `task/27-escalation` · nyuma ya `XMD_MILESTONES` (OFF kwa default) · inategemea T26 (main `51c7eaf`).

Mazingira (sawa na T26):
- Server: `next start` ya production build (`build.sh`), port 3100.
- `CU_PUBLIC_URL`: cloudflared quick tunnel.
- Sandbox: E2B halisi, OpenHands (XMD Computer), Chromium.
- Data: Supabase halisi.
- LLMs: halisi (broker; reviewers walitumia lanes za gemini).
- Fixture: `xmdtest-site` "Kivuli" safi (`mk.mjs`), yenye kasoro moja kwa kila test.

Harness iko kwenye `docs/tests/task-27/` (`mk.mjs`, `start.sh`, `go.sh`, `build.sh`, `cleanall.sh`, `get.mjs`, `watch.py`, `tl.sh`, `inputT1..T5.json`, na rekodi za store `Tn-*.json`). Hakuna `.log`, streams wala prompts.

**Historia iliyopandwa (wazi):**
- T2, T4 na T5 zinaanza katikati ya ladder. `XMD_TEST_VERIFY_INPUT` (`escalate: true`, `startRound`) inapanda defect yenye `attempts` 2, 3 au 4 pamoja na `history` iliyoandikwa kwa mkono (BLOCKED / FAIL za raundi zilizopita).
- Ladder (Optimus, Vextron, reviewers), Computer, checks na reviewers vyote ni HALISI.
- T1 na T3 hazina historia iliyopandwa: zinaanza R1 attempt 1.

## Muhtasari

| Test | Inachothibitisha | Matokeo |
|---|---|---|
| T1 | Ladder 1→5 kwenye defect inayozuiwa na uamuzi LOCKED; mode + diagnosis kila ngazi; redecide → MODIFY/WAIVE kwenye ledger/ripoti | **PASS**: standard → concrete (CONFLICT_WITH_DECISION) → pair_patch → split (lane switch skipped, imerekodiwa) → redecide **WAIVE** (zamu 3, wote 3) → `SIGNED_OFF_WITH_WAIVERS` |
| T2 | Kasoro ngumu ya CSS grid inatatuliwa attempt 3 na patch iliyotumika; check inapita | **PASS**: diff ya Vextron → `git apply --check` + `git apply` (commit `dedd15a`) → checks 5P/0F, reviewers wote PASS → D-001 `VERIFIED_FIXED` (attempts 3) |
| T3 | Diagnosis JSON inathibitishwa; NOT_ATTEMPTED inachaguliwa wakati diff haikugusa lengo (dhidi ya NO-OP detector) | **PASS**: Optimus alichagua `NOT_ATTEMPTED` mwenyewe (enforcer hakubadilisha), sentensi moja, valid jaribio la 1 |
| T4 | WAIVE inaonekana kwenye state ya milestone na imeorodheshwa kwa ripoti ya mwisho | **PASS**: `state:M1.waivers` + `waivers:M1` (approvedBy designer+frontend+pm, votes, reason), D-001 `WAIVED`, chip 🏳️ |
| T5 | Raundi zote bado zimefungwa kwa 10 | **PASS**: split R10 → `CAP_REACHED` 10/10; hakuna `fix/verify/cos:M1:R11` wala prompt ya escalation ya R11 |

## Runs (sessions zote zilifutwa mara baada ya kila run)

| Run | Session | Kusudi | Matokeo |
|---|---|---|---|
| T3a | 4d219392 | T3, run ya 1 | attempt 2 (NO-OP rerun) ilikufa sekunde 1 baada ya kuanza; receipt MISSING → BLOCKED. **Kasoro K1** |
| T3 | d48809ce | T3, baada ya K1 | **PASS** |
| T2 | b9a18a78 | T2 (startRound 3) | **PASS** (R3). R4 ilionyesha **kasoro K2** |
| T1a | a0aca792 | T1, run ya 1 | consolidation ilibadilisha hitaji kimya kimya → ingepita bila ladder. **Kasoro K3**, run ilisimamishwa R2 |
| T1 | b259b7aa | T1, baada ya K3 | **PASS** (R1→R5) |
| T4 | 2604a625 | T4 (startRound 5) | **PASS** (waiver). Mwisho BLOCKED kwa sababu ya `RIPOTI.md`: **kasoro K4** |
| T5 | f67b9dea | T5 (startRound 10) | **PASS** |

### Kasoro zilizopatikana kwenye majaribio halisi (zimerekebishwa, na zina unit tests)

- **K1, race ya bridge (`7a36895`, `cu/engine.ts`):** NO-OP rerun inatumia milestone id ileile.
  - `handle.wait()` ya bridge ya attempt 1, ilipochelewa, ilipita guard ya `msPhase.id === id` na kutuma `run_end` error, ikaua attempt 2 ("bridge exit 0").
  - Suluhisho: `cu.msBridgeGen` (generation guard).
  - Pia hook ya sabotage (`git reset --hard`) ilikuwa inafuta receipt iliyocommitiwa. Sasa receipt inahifadhiwa.
  - Kwenye T25/T26 kasoro hii ilifichwa na timing.
- **K2, SIGN_OFF ya uongo (`b1c5ad2`, `loop.ts`):** T2 R4 iliandika `SIGN_OFF` kwa sababu "all remaining defects waived by redecide ()" bila waiver yoyote.
  - Override ilifyatuka wakati hakuna CO wala defect wazi, lakini decideNext ilikuwa CONTINUE kwa sababu ya `receipts do not match` (`server.log`).
  - Suluhisho:
    - override inafanya kazi **tu** kukiwa na waivers;
    - CONTINUE isiyo na CO yoyote → `BLOCKED: nothing for a fix round … remaining blocker: <sababu>` (wazi, si raundi tupu);
    - `*.log` za runtime hazihesabiwi UNLISTED (`RUNTIME_LOG_RE`).
- **K3, kinga ya hitaji (`0420650`, `escalation.ts`):** kwenye T1a, consolidation ya Optimus mwishoni mwa R1 iligeuza hitaji: "Maintain sentence case … text-transform: none" (`T1a-cos_M1_R2.json`).
  - CO ikawa no-op inayopita checks, kwa hiyo defect ingefungwa bila hitaji kutimizwa. Huo ni WAIVE wa kimya, ambao spec inaukataza.
  - Suluhisho: hitaji = computed_style checks (property + expected/forbidden) za CO ya KWANZA ya defect (`escalationRequirements`).
    - attempts 2–4 na KEEP lazima zihifadhi checks hizo (`requirementDrift` kwenye `validateConcrete` / `validateSplit` / `validateRedecide`);
    - prompts zote za ladder zina `REQUIREMENT (fixed …)`;
    - consolidation ikibadilisha hitaji, code inairejesha (`restoreRequirement`) kabla ya ngazi, na history inarekodi `requirement restored`;
    - MODIFY peke yake ndiyo inaweza kubadilisha hitaji, na baada ya amendment kinga inaondoka.
- **K4, ripoti ya Computer kwenye repo (`9480616`, `fixRound.ts`):** T4 R5: Computer iliandika `RIPOTI.md`, ikawa UNLISTED_CHANGE, na receipts ≠ diffs → BLOCKED ingawa kazi yote ilipita.
  - Suluhisho: pack ya Computer sasa inasema wazi: "Do NOT create report/notes files in the repo".
  - Hatari hii ilirekodiwa tangu T26.

## T1 — ladder 1→5, A1 inazuia (session b259b7aa, 10:33–11:06)

Kasoro iliyopandwa: D-001 medium "Nav links must be uppercase (CEO brand sheet)". Ledger A1 (LOCKED) inakataza `text-transform: uppercase` kila mahali, na `build.mjs` ya fixture inakataa `uppercase|toUpperCase`. CO-001 acceptance: `.site-nav a text-transform: uppercase @1280`.

`T1-defects.json`, `D-001.history` (imefupishwa):
```
R1 CO-001: BLOCKED · checks 0P/1F/0E | BLOCKED: Contradicts locked ledger decision A1 …
R1 verify: CO-001 FAIL (designer FAIL, frontend FAIL, checks 0P/1F/0E)
R2 ESCALATED attempt 2 (concrete) → CO-002 | diagnosis CONFLICT_WITH_DECISION: The required styling of
   text-transform: uppercase on .site-nav a directly contradicts locked ledger decision A1 …
R2 CO-002: BLOCKED · checks 0P/1F/0E
R3 ESCALATED attempt 3 (pair patch) → CO-003 | patch file index.html · requirement restored (1 check(s)) — the consolidated order had changed it
R3 CO-003: BLOCKED · checks 1P/1F/0E        (Computer ilipewa faili kamili — verbatim — ikaBLOCK kwa A1)
R3 verify: CO-003 FAIL · round 3 reverted: made things worse (open defects 1 → 3)
R4 ESCALATED attempt 4 (split) → CO-005, CO-006, CO-007, CO-008 | lane switch skipped — cu/brain.py has no
   per-CO Computer lane override (FLOW-MAP B.8); recorded, not switched · requirement restored (1 check(s))
R4 CO-005: BLOCKED (text-transform)  · CO-006/007/008: APPLIED, checks PASS
R5 ESCALATED attempt 5 (redecide) → WAIVE → no order | WAIVE: Defect D-001 … directly contradicts Locked Ledger
   decision A1 … both reviewers have agreed to waive the defect due to this conflict, the defect is waived.
status WAIVED · attempts 4
```
`T1-verify_M1_R{1..4}.json` `consolidation.escalation.events`: `CO-002 concrete valid tries 1 CONFLICT_WITH_DECISION restored 1` · `CO-003 pair_patch valid 1 restored 1` · `CO-004 split valid 1 → [CO-005..CO-008] restored 1` · `CO-009 redecide valid 1 → WAIVE, turns 3 (≤4), votes designer WAIVE + frontend WAIVE, approvedBy [designer, frontend, pm]`.

`T1-state_M1.json`: `status SIGNED_OFF_WITH_WAIVERS · round 4 · waivers [{defectId D-001, severity medium, round 4, reason "…", approvedBy [designer, frontend, pm]}]`. `T1-waivers_M1.json` ina votes kamili. Kwenye T1, matokeo ya redecide yalikuwa WAIVE (si MODIFY). Njia ya MODIFY → ledger decision (`amendments:Mk` + `decisions`) imethibitishwa na unit tests (`escalation.test.ts`, `verify.test.ts`).

Chips: `🪜 D-001 escalated to attempt 2 (concrete) · diagnosis CONFLICT_WITH_DECISION` → `… attempt 3 (pair patch)` → `… attempt 4 (split)` → `… attempt 5 (redecide) → WAIVE` → `🏳️ WAIVE D-001 (M1 R4): … — approved by designer + frontend + pm`.

## T2 — CSS grid → pair patch attempt 3 (session b9a18a78, 09:38–09:56)

Kasoro iliyopandwa: `.grid { grid-template-columns: repeat(3, 280px) }` + `.card { min-width: 280px }` → overflow ya mlalo kwenye 375/768. D-001 major, REOPENED, attempts 2 (historia iliyopandwa). CO-003 acceptance: `no_horizontal_overflow` @375x667/768x1024/1280x800 + `#shop display: grid`.

Patch ya Vextron (`T2-cos_M1_R3.json` `.patch`), `git apply` na harness (`T2-patch_M1_R3.json`: `applied true, method "git apply", sha dedd15a`):
```diff
--- a/src/styles.css
+++ b/src/styles.css
@@ -87,11 +87,10 @@
 .grid {
   display: grid;
-  grid-template-columns: repeat(3, 280px);
+  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
   gap: 16px;
 }
 
 .card {
-  min-width: 280px;
   padding: 16px;
```
```
🩹 M1 R3 CO-003: git apply · commit dedd15af13c0 · git apply: src/styles.css
🧾 M1 R3 imekamilika: APPLIED 1 · … · checks PASS 5 · FAIL 0 · ERROR 0
🔍 frontend verify R3: CO-003 PASS — "… fully responsive … 1 column at 375px, 2 at 768px, 3 at 1280px. Horizontal overflow is eliminated"
🔍 designer verify R3: CO-003 PASS
```
`T2-defects.json`: `D-001 VERIFIED_FIXED attempts 3`. Wito wa patch ulichukua kama dakika 9 kwa sababu ya stalls za Gemini (90s → reroute), lakini ulikuwa valid kwenye jaribio la 1. R4: defect mpya ndogo D-002 → CO-004 PASS. Mwisho wa run hii ulikuwa na K2 (juu).

## T3 — diagnosis + NO-OP detector (session d48809ce)

Fixture: `.promo-strip { width: 640px }`. Hook `XMD_TEST_FIX_NOOP_M1=all` inaharibu majaribio YOTE ya R1 (diff 0 files, receipt inahifadhiwa).
```
fix:M1:R1 attempts [(1,[CO-001],sabotaged),(2,[CO-001],sabotaged)] · CO-001 NOT_ATTEMPTED · receipt REJECTED · diff 0 files
fixReminder: "Order CO-001 was NOT applied: git diff does not touch src/styles.css…"
verify R1: CO-001 FAIL (wote) → CONTINUE
escalation: CO-002 attempt 2 concrete · valid · tries 1 · errors []
  diagnosis {cause: NOT_ATTEMPTED, reason: "The previous change order failed to generate any file modifications,
             leaving the hardcoded 640px width in src/styles.css untouched."}       (overriddenBy: hakuna)
  CO-002: src/styles.css · .promo-strip · current "width: 640px;" → desired "width: 100%; max-width: 100%;
          box-sizing: border-box;" · acceptance no_horizontal_overflow
chip: 🪜 D-001 escalated to attempt 2 (concrete) · diagnosis NOT_ATTEMPTED
```
`validateDiagnosis` inakataa cause isiyojulikana au sababu ya sentensi >1. `enforceDetector` inalazimisha NOT_ATTEMPTED pale diff haikugusa lengo (isipokuwa BLOCKED). Kwenye run hii halisi haikuhitajika kulazimisha, kwa sababu Optimus alichagua sawa.

## T4 — WAIVE inaonekana kwenye state (session 2604a625, 11:20–11:34)

Seed: D-001 (nav uppercase dhidi ya A1) attempts 4 (historia iliyopandwa) + D-002 promo. startRound 5. Escalation kwenye seed: CO-005 attempt 5 → redecide.
```
🪜 M1 R5 CO-005 attempt 5 (redecide) → no order · WAIVE (3 turns): D-001 directly conflicts with the locked ledger decision A1 …
🏳️ WAIVE D-001 (M1 R4): … — approved by designer + frontend + pm
EV escalation {round 5, events [{CO-005, attempt 5, redecide, outcome WAIVE, valid true}], waivers ["D-001"], amendments []}
```
- `T4-state_M1.json`: `waivers [{D-001, approvedBy [designer, frontend, pm], reason …}]`.
- `T4-defects.json`: `D-001 WAIVED`, `D-002 VERIFIED_FIXED`.
- `T4-waivers_M1.json` ina votes (designer WAIVE + frontend WAIVE, kila moja na sababu). Hii ndiyo orodha ambayo ripoti ya mwisho na `decideNext` ya T28 zitasoma.
- Mwisho wa run: BLOCKED kwa sababu ya `RIPOTI.md` UNLISTED (K4, imerekebishwa).

## T5 — kikomo cha raundi 10 (session f67b9dea, 11:37–11:45)

Seed: D-001 attempts 3 (historia iliyopandwa), startRound 10 → split.
```
🪜 M1 R10 CO-004 attempt 4 (split) → CO-005, CO-006 · lane switch skipped — … recorded, not switched
  CO-005 src/styles.css .site-nav a text-transform uppercase · current "measure getComputedStyle('.site-nav a').textTransform …"
  CO-006 src/styles.css .site-nav a letter-spacing 0.06em
🔍 ROUND 10/10 (M1) — … rounds left: 0
✅ M1 R10 → CAP_REACHED: round 10/10 — COs not PASS: CO-005, CO-006 · … open defects ≥ medium: D-001
```
`T5-state_M1.json`: `CAP_REACHED · round 10 · maxRounds 10`. `get.mjs` ya `verify:M1:R11`, `fix:M1:R11` na `cos:M1:R11` → `null` zote. Hakuna consolidation wala escalation ya R11, na prompts zina 0 `escalate:M1:R11`.

## Tests za code

- `src/lib/milestone/__tests__/escalation.test.ts`, tests **17**:
  - ladder/chip;
  - diagnosis + detector (T3);
  - concrete/patch/split;
  - redecide (WAIVE wote 3; KEEP/MODIFY);
  - conflicts;
  - orchestration (stub);
  - history + Computer pack;
  - kinga ya hitaji (K3).
- `verify.test.ts`, tests 49: ikiwemo K2 (BLOCKED yenye sababu) na harness ya ladder (`escStub`, `allFail`, `patches`, `extraChanged`).
- `fixRound.test.ts`: `*.log` si UNLISTED (K2).
- Baselines kabla → baada:

| Kipimo | Kabla | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 661 + 2 | **683 + 2** |
| eslint (bila backups/) | 29 | 29 |
| pytest | 338 + 3 | 338 + 3 |
| unittest (repo root) | 271 OK | 271 OK |

## Uchunguzi / hatari kwa CEO

- **Optimus hupenda kufuata ledger kuliko defect.** Kwenye T1a alibadilisha hitaji kimya kimya kila raundi (R1, R2, R3 na R4). Kinga ya K3 inazuia hilo kwa checks za `computed_style` tu. Hitaji lililoandikwa kwa maneno pekee (bila check ya thamani) halina kinga ya code.
- **Split inaweza kuchanganya kazi nyingine.** Kwenye T1 R4, split ya D-001 iliongeza COs za touch-target/overflow (CO-006..008, zilipita) chini ya `defectIds [D-001]`. Validation inahakikisha faili 1 + property 1 kwa kila CO na kwamba hitaji linabaki, lakini haizuii kazi isiyohusiana.
- **Lane switch:** `cu/brain.py` haina override ya lane kwa kila CO, kwa hiyo switch inarekodiwa kama "skipped" (B.8), kama spec inavyoruhusu.
- **Mazingira ya majaribio:** Gemini stalls/429 zinaongeza muda (patch ya T2 ilichukua dakika 9). Computer bado si deterministic.

## Usafishaji

Kila run: server ilisimamishwa → `cleanall.sh <sid> <from> <to>` (session + board_ledger + storage `xmdtest-`) → sandbox ya E2B iliuawa kwa prefix yake (`igplkbiz`, `irgpffo2`, `ivofrxg3`, `ide34x85`, `i8gvsdw1`, `irqu7tpz`, `ihdw0jyy`). Tunnel ilisimamishwa mwishoni.
