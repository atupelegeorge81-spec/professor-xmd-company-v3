# TASK 9 (maelezo9) — Milestone types + validators (pure code) · ushahidi (2026-10-17)

Branch `task/9-milestone-types`. Pure code, hakuna wiring (hakuna faili la app linai-import `src/lib/milestone/`).

## Faili
| Faili | Nini |
|---|---|
| src/lib/milestone/types.ts (mpya) | MilestoneMap/Milestone, MilestoneState (+ MAX_ROUNDS 10), Defect, ChangeOrder, Receipt, Check (union ya aina 12), EvidencePack (screenshots, domMetrics, checks, commands, gitDiffSummary, regression, consoleErrors), RoundHeaderData, CuFinalState. Enum zote ni `as const` arrays, kwa hiyo validators zinatumia chanzo kimoja. |
| src/lib/milestone/schemas.ts (mpya) | `validateMilestoneMap(map,totalAgendas,knownAgents,{hasUI})`, `validateChangeOrder(co,reviewMode)`, `validateReceipt`, `validateDefect`, `validateCheck`, `validateMilestoneState`. Zinarudisha `{ok:true,value}` au `{ok:false,errors}`, kila kosa likiwa "path: sababu". Zinakusanya makosa yote. |
| src/lib/milestone/__tests__/schemas.test.ts (mpya) | Tests 28. |

## Maamuzi (spec haikutaja; nimeandika ili CEO ajue)
- `zod` haipo kwenye package.json (FLOW-MAP §G), kwa hiyo validators zimeandikwa kwa mkono, bila dependency mpya.
- `CuFinalState` = `CuFinalState` ya `src/lib/cu/finalState.ts` + `"COMPLETED_VERIFIED"`. finalState.ts haijaguswa, na engine bado haiandiki "verified" (task 18).
- Sehemu za kila aina ya Check: `route`/`viewport?` kwa checks za UI, `cmd`/`expectExit?`, `pattern`/`path`/`expect`,
  `selector`/`property`/`expected`, `min` (contrast), `minPx`, `url`/`method?`/`expectStatus`, `path`/`text`.
- `priority` = integer ≥1 (1 = juu). `diagnosis` = `{cause: DIAGNOSIS_CAUSE, note}`. `mode:"pair_patch"` inahitaji `patch`.
- `MilestoneState.lanesUsed: unknown[]` (muundo unafafanuliwa task 10). `startedAt/updatedAt` ni ISO strings. `currentStepId` ni `""` au `M<n>.R<n>.<step>` ya milestone hiyo hiyo.
- `validateMilestoneMap` pia inakagua `map.totalAgendas === totalAgendas`, title isiwe tupu, `from <= to`, na isizidi totalAgendas.

## REAL TESTS (unit, pure) — `CI=1 npx vitest run src/lib/milestone --reporter=verbose`
```
 ✓ validateMilestoneMap — ramani halali > N=10 inapita
 ✓ validateMilestoneMap — ramani halali > N=15 inapita
 ✓ validateMilestoneMap — ramani halali > N=20 inapita
 ✓ validateMilestoneMap — ramani halali > N=3 inapita
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (1) pengo kati ya ranges
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (2) overlap
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (3) haianzi agenda 1
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (4) ya mwisho si quality_deploy
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (5) agent asiyejulikana kwenye roster
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (6) roster bila optimus
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (7) reviewMode batili
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (8) ids si sequential
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > (9) milestones tupu
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > ziada: ya kwanza si foundation wakati hasU
 ✓ validateMilestoneMap — ramani batili (ujumbe maalum) > ziada: haifiki totalAgendas · from > to �
 ✓ validateChangeOrder > CO halali inapita (pamoja na location yenye route tu)
 ✓ validateChangeOrder > bila acceptance → fail
 ✓ validateChangeOrder > acceptance ya maandishi huru → fail
 ✓ validateChangeOrder > Check batili ndani ya acceptance → fail na path
 ✓ validateChangeOrder > visionNote tupu: inaruhusiwa technical tu
 ✓ validateChangeOrder > location bila files wala route · defectIds tupu
 ✓ validateReceipt > halali inapita
 ✓ validateReceipt > DONE bila files → fail
 ✓ validateReceipt > BLOCKED bila sababu → fail; na sababu → pass (bila files)
 ✓ validateReceipt > status batili
 ✓ validateCheck · validateDefect · validateMilestoneState > Checks: kila aina halali inapita; aina 
 ✓ validateCheck · validateDefect · validateMilestoneState > Defect halali/batili
 ✓ validateCheck · validateDefect · validateMilestoneState > MilestoneState halali/batili
Tests  28 passed (28)
```
Kesi batili zinathibitisha ujumbe kamili, mf.
`map.milestones[1].agendas.from: gap — agendas 4..4 are not covered (expected from=4, got 5)` ·
`map.milestones[1].agendas.from: overlap — agenda 3 already covered by milestones[0] (expected from=4, got 3)` ·
`changeOrder.acceptance[0]: must be a Check object (got "button iwe kubwa zaidi") — free-text acceptance is not allowed` ·
`receipt.blockedReason: required (non-empty) when status is BLOCKED`. **PASS**.

## Baselines (kabla → baada)
tsc 0 → 0 · vitest 293 + 2 skipped → **321** + 2 skipped (+28) · pytest 308 → 308 · unittest 238 OK → 238 OK · eslint (src/lib/milestone) 0.
