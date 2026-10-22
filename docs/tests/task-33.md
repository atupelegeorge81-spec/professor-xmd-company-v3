# Task 33 — MISSION ONE: kumbukumbu ya review (mini-report inayokua / rolling)

Uamuzi wa CEO: `xmd-home/task-docs/NEXT-STEP.md` (2026-10-22). Branch `task/33-review-memory`.
**Majaribio: mock/unit tu** (agizo la CEO 2026-10-22: "usifanye real test bado") — hakuna conversation iliyoanzishwa kwenye Koyeb.

## Kilichojengwa

| Spec ya CEO | Utekelezaji |
|---|---|
| 1. Mini-report inayokua (rekodi moja kwa milestone) | `src/lib/milestone/reviewMemory.ts` · rekodi `memo:Mk` (entries zinaongezwa, hazifutwi; idempotent kwa `kind:Rn`) |
| Sehemu 1 — R0 baada ya mjadala wa timu | `writeR0Memo` (loop.ts) — facts za code (defects + batili + sababu, accepted/rejected, "no consensus", kila CO inalenga nini) + maelezo ya Optimus |
| 2. Reviewers wote 2 wanathibitisha MARA MOJA + code inakagua kila D/P/CO | `confirmR0` (CONFIRM / AMEND — AMEND inahifadhiwa na kuonyeshwa kwenye prompts) · `checkR0Coverage` / `missingIds`; Optimus akiacha id → jaribio la 2 linaambiwa kilichoachwa; bado → `missing` inarekodiwa + log (facts za code hazipotei kamwe) |
| Sehemu 2 — kila raundi ya Computer | `fixFacts` (APPLIED/NOT_ATTEMPTED/BLOCKED, receipt, faili, phantom/REJECTED, UNLISTED_CHANGE, checks P/F/E, flags) |
| Sehemu 3 — kila uthibitisho | `verifyFacts` (kila CO + verdict/note ya kila reviewer, defects mpya/zilizofungwa/zilizorudi, regressions, revert, CONTINUE/SIGN_OFF/CAP/BLOCKED) |
| Sehemu 4/5/6/7/8 | sync · discussion (requestDiscussion) · redecide · escalation · close (SIGNED_OFF/WITH_WAIVERS/CAP_REACHED/BLOCKED, retry ya BLOCKED) |
| 3. Prompts za uthibitisho | `buildVerifyPrompt`: REVIEW MINI-REPORT (ingizo 3 za mwisho kamili, za zamani ≤500 chars + ids) · YOUR OWN R0 FINDINGS (kamili: expected/actual/evidence/notes — za mwenzake hazionekani) · DEFECT HISTORY · AGENDA MINI-REPORTS (≤2 500 chars kila moja) · **hakuna transcript** |
| 4. Milango ya sync / requestDiscussion / redecide inabaki, ila mifupi | sync = zamu 1 (ilivyokuwa) · redecide ≤4 (`REDECIDE_MAX_TURNS`, ilivyokuwa) · requestDiscussion sasa **≤6 zamu za owners** (+ reserve ya kura = idadi ya washiriki) — `ReviewAgendaPayload.maxTurns` → `createDeliberation` (boardRunner) · prompt: "NEVER just because another fix round is needed" (E8 M3 R2 ilikuwa zamu 13) · matokeo yote → mini-report. Mjadala kamili wa timu = R0 tu |
| 5. Pakiti ya Computer | `renderFixPack`: "DEFECT HISTORY — … (do NOT repeat a failed approach)" kwa defects za COs za raundi; Computer bado anaanza na muktadha mpya kila raundi |
| UI (Mission 2 #8) | badge ya "mini report imeandikwa" tu (`activity` ya Optimus) — maandishi hayatumwi kwa UI |

LLM ya mini-report: `memoLlm` (broker, `cls: normal`, si critical). Hook `LoopHooks.memo.complete` — bila hook (tests) sehemu zinaandikwa na code peke yake; kosa la LLM halisimamishi loop.

## Majaribio (mock/unit — vitest, store ya memory yenye CAS, loop halisi `maybeCloseMilestones`)

Ramani ya tests za CEO: **(a)** prompt ya verifier ina mini-report + findings zake za R0 · **(b)** pointi iliyokubaliwa ikiachwa → ukaguzi wa code unashindwa · **(c)** defect iliyoshindwa mara 2 → historia kwa verifier NA Computer · **(e)** fix + verify zinaongeza sehemu zenye COs zote; sync / requestDiscussion / redecide zinaongeza sehemu zao.
**(d)** "full run kwenye fixture ya xmdtest-site bado inasainiwa" = REAL test — **imeahirishwa** kwa agizo la CEO; toleo la mock: tests za loop zilizopo (FIXING → … → SIGNED_OFF) zote zinapita na test (a) inaishia SIGNED_OFF.

```
✓ src/lib/milestone/__tests__/verify.test.ts > TASK-33: mini-report ya review (rolling) — loop > (a) prompt ya verifier ina mini-report + findings ZAKE kamili za R0 (si za mwenzake) · (e) fix + v
✓ src/lib/milestone/__tests__/verify.test.ts > TASK-33: mini-report ya review (rolling) — loop > (c) defect iliyoshindwa mara 2 → historia yake inaonekana kwa verifier NA kwa Computer (raundi 3)
✓ src/lib/milestone/__tests__/verify.test.ts > TASK-33: mini-report ya review (rolling) — loop > sync (wanatofautiana) na mjadala ulioombwa (kikomo cha zamu 6) zinaongeza sehemu zake 9ms
✓ src/lib/milestone/__tests__/verify.test.ts > TASK-33: mini-report ya review (rolling) — loop > redecide (jaribio 5, WAIVE) na escalation zinaandikwa; kufunga: SIGNED_OFF_WITH_WAIVERS 23ms
✓ src/lib/milestone/__tests__/verify.test.ts > TASK-33: mini-report ya review (rolling) — loop > (b) R0: Optimus akiacha pointi iliyokubaliwa → ukaguzi wa code unashindwa (majaribio 2) · review
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: coverage ya vitambulisho > missingIds: mpaka wa neno (P-01 ≠ P-012, D-001 ≠ D-0011), bila kujali herufi kubwa 3ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: coverage ya vitambulisho > (b) R0: kila defect + pendekezo lililokubaliwa + CO; pointi iliyoachwa → ok:false 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: coverage ya vitambulisho > r0Facts: batili + sababu, no consensus, COs na malengo yao 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: Optimus note + addMemoEntry > note inakosa id → jaribio la pili linaambiwa kilichoachwa; bado kikiachwa → missing kinarekodiwa 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: Optimus note + addMemoEntry > LLM ikitupa kosa → sehemu ya code peke yake (loop haisimami) 0ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: Optimus note + addMemoEntry > addMemoEntry ni idempotent (resume haiandiki upya wala haiiti LLM) 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: renderMemo · historia · findings za R0 > ingizo 3 za mwisho KAMILI, za zamani zimefupishwa (≤500 chars + ids) 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: renderMemo · historia · findings za R0 > defectHistoryLines: majaribio, sababu, diagnosis + COs zilizopita; defects zisizojaribiwa haz
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: renderMemo · historia · findings za R0 > ownR0Findings: defects/proposals/notes za reviewer HUYU tu (kamili: expected/actual/evidence)
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: renderMemo · historia · findings za R0 > parseConfirm: CONFIRM / AMEND / jibu lisilo sahihi 1ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: sehemu mpya za prompts > buildVerifyPrompt: mini-report + findings ZAKE + historia + mini-reports za agenda; reviewer mwingine haoni fin
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: sehemu mpya za prompts > buildVerifyPrompt bila kumbukumbu (sessions za zamani) → hakuna sehemu mpya 0ms
✓ src/lib/milestone/__tests__/reviewMemory.test.ts > TASK-33: sehemu mpya za prompts > renderFixPack: historia ya defects kwa Computer (kabla ya REPO SUMMARY); bila historia → haipo 1ms
Tests  18 passed | 56 skipped (74)
```

## Baselines

| | Kabla | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 786 + 2 skipped | **804** + 2 skipped (+18) |
| eslint (bila backups/) | 29 | 29 |
| pytest | 346 + 3 | haikuguswa (hakuna Python iliyobadilika) |

## Hatari / kumbuka
- Prompt ya uthibitisho inaongezeka (~73k → takriban +10–20k chars kulingana na idadi ya agenda za milestone); mini-reports za agenda zimekatwa ≤2 500 kila moja.
- Wito wa LLM mpya kwa milestone: R0 ≤2 (+2 uthibitisho), kisha ~1 kwa kila sehemu (fix/verify/…); zote `background`, si critical.
