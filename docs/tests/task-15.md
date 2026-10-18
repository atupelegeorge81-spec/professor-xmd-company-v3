# Task 15 (maelezo15): Plan ya kila Milestone, ushahidi

Branch `task/15-milestone-plan` (kutoka main fdc625d). Flag `XMD_MILESTONES` (default OFF).

## Nini kimebadilika
- **Mpya `src/lib/milestone/plan.ts`:**
  - `validateMilestonePlan(md, {id, reviewMode})` hukagua muundo pekee:
    - §1–§9 zote zipo;
    - mstari wa `Styling + Dependencies:` kwenye §4 upo na si wa jumla;
    - kila hatua yenye muundo (Files ≠ none) ina ```` ```checks ```` JSON yenye Check ≥1 halali;
    - id za Check hazijirudii;
    - `visual`/`mixed` zina mstari wa route kwenye §7 wenye viewports 3 (375x667, 768x1024, 1280x800);
    - `code`/`mixed` zina angalau Check 1 ya `command`/`http` kama uthibitisho.
  - `generateMilestonePlan(deps)`:
    - Optimus anaandika vipande 2 (§1–5, kisha §6–8);
    - §9 inajengwa na code kutoka maamuzi ya Ledger ya agenda za milestone hiyo, neno kwa neno (`ledgerDecisionsSection`);
    - validator inafuata, kisha urekebishaji wa muundo ≤1;
    - kisha Data Guard, na urekebishaji wa data ≤1;
    - matokeo ni `active` / `structure_failed` / `guard_failed`.
- **`loop.ts`:**
  - `runMilestoneBuild` sasa inaita `hooks.plan` (`runPlanStep`), ambayo inachukua nafasi ya stub ya hatua ya plan;
  - plan isiyotekelezeka → M1 BLOCKED (resumeTo PLANNING), plan FAILED, build PENDING;
  - milestone iliyo BLOCKED/PAUSED hairudiwi yenyewe (HOLD_STATUSES skip);
  - build bado ni stub hadi Task 16.
- **`boardRunner.ts`:**
  - `msHooks().plan` inatumia OCB stage PLAN, brain.prompt ya phase plan, kunasa prompt `plan:Mk` na lanes za plan;
  - plan inahifadhiwa kwenye store record `plan:Mk` PEKEE (si project_plans);
  - event mpya `milestonePlan` (ina markdown);
  - flag ON + map ipo → plan ya zamani ya mradi mzima haiandikwi, kwa hiyo CU ya zamani haianzi.
- **Tests:** `plan.test.ts` (11) + 2 kwenye `loop.test.ts`.

## Maamuzi yangu (CEO alikuwa amelala, sikuuliza)
1. **Muundo wa code:** `MilestonePlanDeps` (interface ya deps) badala ya closures za boardRunner, ili iweze kupimwa bila LLM.
2. **Uandishi:** plan inaandikwa kwa vipande 2, kama Mpango Kazi wa zamani. §9 inajengwa na code (si LLM), neno kwa neno kutoka Ledger, ili isibadilishwe.
3. **Muundo wa Checks:**
   - ```` ```checks ```` JSON chini ya `**Checks:**`;
   - "hatua yenye muundo" = Files ≠ none;
   - mstari wa route ni `route: / · states: … · viewports: 375x667, 768x1024, 1280x800`;
   - uthibitisho ni Check ya `command` au `http`.
4. **Marekebisho:** muundo ≤1 na data ≤1. `guard_failed` huzuia daima, kama uamuzi wa CEO wa Task 4.
5. **Uhifadhi:** plan inakaa kwenye store record `plan:Mk` tu. `saveProjectPlan`/planId/CU ya zamani havijaguswa.
6. **Chips:**
   - ni "🗺️ Optimus anaandika plan ya Milestone …" / "🗺️ Plan ya Milestone …";
   - zinaonekana makusudi (hazijafichwa);
   - hazilingani na FINALE_CHIP;
   - planPartChip haitumiki.
7. **Event:** `milestonePlan` inabeba markdown, ili UI/Task 16 ziweze kuitumia bila kusoma DB.
8. **Plan ya zamani:** flag ON + map → plan ya zamani ya mradi mzima inarukwa (blog "🗺️ XMD_MILESTONES: Mpango Kazi wa mradi mzima hauandikwi"), kwa hiyo CU ya zamani haianzi. Plan za milestone ndizo mpya.
9. **Kurudia:** milestone iliyo BLOCKED/PAUSED hairudiwi yenyewe (inazuia kitanzi cha gharama).
10. **Build:** inabaki stub hadi Task 16.
11. **T3:** inatumia alama ya brief `xmdtest-planguard-sabotage` (test hook iliyopo, inafanya kazi tu chini ya `XMD_TEST_HOOKS=1`).

## Real tests (local `next dev --turbopack`, Supabase + lanes halisi)
Wrapper `devT14.sh`: XMD_TEST_HOOKS=1, MAX_AGENDAS=3, MAP_FORCE M1 1–2 · M2 3.

### T1 PASS: plan halisi inathibitishwa, ina Checks na routes
- **Session:** 30492f28, flag ON, briefT15.json "xmdtest-msplan" (Kinyozi Bora).
- **Mtiririko:**
  - agenda 1–2 LOCKED → `milestoneClosed M1`;
  - "🗺️ Optimus anaandika plan ya Milestone M1 (agenda 1–2 · mixed)";
  - "validator imekataa (1) — Optimus anaandika upya kipande 2…";
  - "🗺️ Plan ya M1: active · hatua 3 · checks 14 · routes 1 · marekebisho muundo 1/data 0".
- **Event:** `{id M1, status active, executable true, steps 3, checks 14, routes 1, reasons [], warnings ['hatua 3 < ndogo ya 8']}`.
- **DB:**
  - `M1 v6 SIGNED_OFF M1.R0.plan:DONE:a1 M1.R0.build:DONE:stub`;
  - `plan:M1 v1 active executable true steps 3 checks 14 routes 1 md 18197`.
- **Validator juu ya plan halisi (jiti):** `ok: true stats {steps 3, structural 3, checks 14, routes 1, proofChecks 3}`.
  - Step 1 index.html: checks 4.
  - Step 2 styles.css: checks 4.
  - Step 3 index.html+styles.css: checks 6.
- **Vipande muhimu vya plan:**
  - §4 `Styling + Dependencies: plain CSS in styles.css ; packages: none`;
  - §7 `route: / · states: default · viewports: 375x667, 768x1024, 1280x800`;
  - §9 Ledger Decisions (verbatim).
- **OCB ya prompt halisi** `plan:M1` (OCB iko kwenye offset 0):
  - `YOU ARE HERE: PLAN | Milestone M1: Foundation (agendas 1–2), milestone 1 of 2 | step 3: milestone plan`;
  - `YOUR OUTPUT IS READ BY: XMD Computer (literal)`.

### T2 PASS: Checks zikiondolewa, validator inakataa kwa usahihi
Nakala ya plan ya T1 iliondolewa vizuizi vyote 3 vya ```` ```checks ````, kisha → `ok: false`:
```
M1 plan Step 1 ("Create index.html with semantic structure"): no machine-readable Acceptance Checks — this step touches files (index.html) so it needs a ```checks JSON array with ≥1 valid Check
M1 plan Step 2 ("Create styles.css with reset and visual identity"): … (styles.css) …
M1 plan Step 3 ("Verify integration and accessibility constraints"): … (index.html, styles.css) …
M1 plan: reviewMode mixed needs ≥1 "command" or "http" Check that proves the work …
```

### T3 PASS: sabotage → guard_failed, Computer haianzi
- **Session:** ad872881, briefT15s.json.
- **Data Guard:** "🛡️ Data Guard · plan M1: tofauti 2 — "Kunyoa: 999,999", "999,999" — Optimus anarekebisha…". Baada ya urekebishaji 1 bado ilikuwa na tofauti.
- **Ujumbe:**
  - "⛔ Plan ya M1: guard_failed … → M1 BLOCKED (Computer haianzi)";
  - chip "⛔ Plan ya Milestone M1 haitekelezeki (guard_failed) — XMD Computer HAIANZI".
- **Event:** `milestonePlan {status guard_failed, executable false}`.
- **DB:**
  - `M1 v4 BLOCKED M1.R0.plan:FAILED:a1 M1.R0.build:PENDING:a0`;
  - `plan:M1 guard_failed`, `guardHits [{found "Kunyoa: 999,999", expected "Kunyoa: TSh 5,000"}, …]`, `repairs {structure 1, guard 1}`.
- **CU:** matukio `cu*` = 0 na "Awamu ya XMD COMPUTER" = 0. Board iliendelea na agenda 3.

### T4 PASS: sharti la VAT linaheshimiwa
Kila mahali "VAT" inapotajwa kwenye plan ya T1 ni marufuku au uthibitisho:
- §2/§3: "Prices already include VAT (18%). Never add VAT on top of the listed prices."
- Step 3: "Verify that no VAT calculations or additions are present";
- §7: "no VAT is added or mentioned", na proof command inayofeli HTML ikiwa na `VAT`/`18%`;
- §8: VAT Rule.

Hakuna agizo la kuongeza VAT. Bei TSh 5,000 / 8,000 / 3,000 zinaonekana mara 11.

### T5 PASS: flag OFF, mtiririko wa zamani haubadiliki
- **Session:** 23024765, `devT14.sh 0`, briefT15.json.
- **Plan ya zamani:**
  - "📋 Optimus anaandika Mpango Kazi — Kipande 1/2 (1-4)" → "Kipande 2/2 (5-8)";
  - "📋 Mpango Kazi wa Agent umehifadhiwa (hatua 9 · status active · doc 19d4bd8d…)".
- **Hakuna kipya:** matukio `milestone*` = 0, OCB = 0, "plan ya Milestone" = 0, `cu*` = 0 (ilisimamishwa kabla ya CU).
- **Kinds za kitanzi cha agenda dhidi ya T14c (flag OFF):** hakuna kinds zilizokosekana. Kinds za ziada: `msg_reset` tu, ambalo ni tukio la zamani la retry la LLM, si jipya.

### Usafi
- Sessions 30492f28, ad872881, 23024765 zimefutwa (clean.mjs, cleanstore.mjs, find.mjs `--go` = 0 mabaki), pamoja na safu ya project_plans ya T5.
- E2B: 16 (zile za zamani, si zetu).

## Baselines
| Baseline | Matokeo |
|---|---|
| tsc | 0 |
| vitest | 468 passed + 2 skipped (470) |
| pytest | 308 |
| unittest | 238 OK |
| eslint (milestone + boardRunner) | 0 |
