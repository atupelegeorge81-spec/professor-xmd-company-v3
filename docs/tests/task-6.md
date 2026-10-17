# Task 6 — Maamuzi 3 ya CEO (2026-10-17)

Branch `task/6-ceo-decisions` · code `ecba0e1` · main `06637b4` (deploy `4be01254` HEALTHY)

## 6a — Plan yenye hatua > 60: inafutwa, Optimus anaandika mpya (≤ 60)
**Uamuzi wa CEO:** plan ikizidi hatua 60, inakataliwa; Optimus anapewa ujumbe aunde nyingine isiyozidi hatua 60; ya zamani inafutwa na mpya inawekwa.
- `boardRunner.ts` (HATUA 6.6): baada ya kuunganisha plan, kama `hatua > kikomo`:
  - ujumbe wa Kipande 2 (sehemu 5–8) unafutwa **mahali palepale** (`msg_reset`);
  - Optimus anapewa agizo `planStepsRewriteInstruction` (idadi iliyopatikana, kikomo, "DISCARDED", unganisha hatua ndogo) na anaandika Kipande 2 upya;
  - `replacePlanStepsPart` inaondoa maandishi yote ya zamani yenye sehemu 6. Bila hivyo `assemblePlanDocument` ingechagua sehemu NDEFU, yaani hatua za zamani.
- Majaribio ya kuandika upya ni `PLAN_STEPS_REWRITES = 2`. Yakiisha bado > kikomo → `structure_failed`, yaani inazuia kama awali (fail-safe).
- Plan inahifadhiwa MARA MOJA tu baada ya kuandikwa upya, kwa hiyo hakuna rekodi ya zamani kwenye `project_plans`.
- Hook ya majaribio: `xmdtest-plansteps-max=<N>` kwenye project, TU na `XMD_TEST_HOOKS=1`. Inabadilisha kikomo cha LANGO pekee (prompt ya Optimus inabaki 8–60). Bila env haina athari (unit test).
- Prompt ya production haijabadilika: `planSecsOf(part)` inatoa maandishi yaleyale (8 to 60).

**Unit** `src/lib/board/planStepsRewrite.test.ts` → 8/8:
- 61 → inazuia, 60 → sawa;
- `maxSteps`;
- hatua ndefu za zamani hazishindi;
- akiba 5/7/8;
- maandishi ya marekebisho yenye §6 yanaondolewa;
- agizo;
- bado > kikomo → inazuia;
- hook ni inert.

**Real (server ya ndani, Supabase halisi, `xmdtest-plansteps-max=2`)**, session `3c4a1586`:
```
📋 Mpango Kazi: hatua 5 > kikomo 2 — Kipande 2 cha zamani kimefutwa; Optimus anaandika upya (jaribio 1/2)…
📋 Mpango Kazi: baada ya kuandika upya (jaribio 1) — hatua 2 (kikomo 2).
📋 Mpango Kazi wa Agent umehifadhiwa (hatua 2 · status active · doc d86501a8…)
DB session: msgs zenye "## 6. Work Steps" = 1 (msg y2nz7hh7, hatua 2) — ya zamani (hatua 5) haipo tena
DB project_plans: rows 1 · status active · total_steps 2 · content "TOTAL STEPS: 2" · warnings [§3 fallback, hatua 2 < 8]
```
- Majaribio 2 ya kwanza hayakugusa kikomo: brief ilitoa agenda 7 (ilisimamishwa), na hello.txt ilitoa hatua 1 (≤ kikomo 5). Zote zilifutwa.

## 6b — OR Lightning ni FALLBACK TU (judge + executor)
**Uamuzi wa CEO:** Lightning iwe fallback tu, kote (judge na katikati/executor).
- `cu/lanes.py`: `FALLBACK_ONLY_MODELS = {nemotron-3.5-lightning}`.
- `cu/oh_router.py` `pick()`: Lightning inaondolewa kwenye candidates kama kuna lane NYINGINE yoyote eligible. Inachaguliwa pale tu hakuna nyingine, na tukio `↪ fallback: …` linaandikwa.
- Band ya OpenRouter (slot 1/11) sasa inaenda kwa OR Ultra.
- Judge: Uno Ultra kwanza; Lightning tu Uno ikikosekana (kama awali).
- Lightning bado iko kwenye pools, kwa hiyo fallback ipo.
- Backend ya `claude` (brain.py, legacy, haitumiki — default `openhands`) haijaguswa.

**Unit** `cu/tests/test_t6_lightning_fallback.py` → 5/5:
- iko kwenye pools;
- mizunguko 4 bila Lightning;
- Lightning tu zote zikikosekana;
- OR Ultra kabla ya Lightning;
- judge.

Kwa code ya ZAMANI tests 3 zinashindwa (Lightning ilikuwa kwenye mzunguko wa kawaida).

**Real (Koyeb, runs 2 kamili)**, matukio `usage` ya CU:

| Run | Executor | Judge | Lightning |
|---|---|---|---|
| 49d5a805 | gemini 3.8-flash ×8, 3.5-lite ×7, 3.7-flash ×4, 3.1-lite ×2, minimax ×2; OR slot → `nvidia/nemotron-3-ultra` (server_error ×2) | Uno Ultra → complete 1.0 | **0** |
| e46e8afc | gemini 3.8-flash ×8, 3.5-lite ×7, 3.7-flash ×5, 3.6-flash ×2, minimax ×1 | Uno Ultra | **0** |

## 6c — Status haibaki "running" baada ya CU kumaliza
**Chanzo (Task 5 smoke 2):** kulikuwa na njia mbili ambazo "running" ingeweza kuandikwa JUU ya "completed":
1. **Writes za session hazikupangwa foleni:** write ya "running" iliyoanza mapema ingeweza kutua baada ya "completed".
2. **Tukio la bridge linalochelewa baada ya `run_end`** → `schedulePersist` → timer ya 2.5s → "running".

**Fix:**
- `engine.ts` `schedulePersist`: `finalState` ikiwa imewekwa (CU imemaliza), status ni `completed` (done) au `finale_incomplete`, si "running". `finalState` inafutwa kila awamu mpya, kwa hiyo run inayoendelea bado inaandika "running".
- `boardRunner.ts` `persistOnce` → `serialQueue(30s)` (`src/lib/serialQueue.ts`): writes zinatua kwa mpangilio wa wito. Kusubiri kuna kikomo cha 30s (write isiyorudi haizuii nyingine).

**Unit** `src/lib/cu/finalStatus.test.ts` → 6/6:
- tukio linalochelewa baada ya done → "completed";
- baada ya stuck → "finale_incomplete";
- wakati inaendelea → "running";
- foleni (write ya polepole haitui baada ya ya mwisho);
- kosa halizuii foleni;
- kikomo.

Kwa code ya ZAMANI tests 2 za engine zinashindwa (bug imezalishwa).

**Real (Koyeb)**, njia ileile ya resume ya smoke 2 (`boardRunner` "Quota ilirudi — XMD Computer inaendelea moja kwa moja"), session `e46e8afc`:
```
12:36:52 Detach wakati wa CU → paused (user)
12:37:2x Resume → "♻️ Quota ilirudi — XMD Computer inaendelea moja kwa moja (snapshot inarejesha workspace)."
12:41:16 status=completed · "✅ XMD Computer: completed, NOT yet verified (22 LLM calls · 284,574 tokens)"
12:44:35 recheck (dk 3+ baadaye): status=completed (updated_at haijabadilika 12:41:16) · /active: hakuna runner
```
- Run `49d5a805` (njia ya kawaida, bila resume) pia iliishia `completed`.
- Redeploy ilijaribiwa, lakini ilichukua ~dk 12.5 kubadili instance, na CU ilimaliza kabla (dk 3). Kwa hiyo njia ya resume ilipitishwa kwa Detach + Resume.
- Kumbuka: race ni ya bahati (timing). Unit tests zinaonyesha kesi kwa uhakika, na run halisi inathibitisha tabia sahihi kwenye njia hiyo.

## Baselines
| Baseline | Matokeo |
|---|---|
| tsc | 0 |
| vitest | 275 passed + 2 skipped (261 + 14 mpya) |
| pytest | 308 (303 + 5) |
| unittest | 238 OK |
| eslint (files zilizoguswa) | 0 |

## Usafi
- Sessions 5 za majaribio (ndani 3: d7f4cc2f, b44a547d, 3c4a1586 + Koyeb 2: 49d5a805, e46e8afc), pamoja na plans/reports/ledger zao, zimefutwa. `find.mjs` → 0.
- Sessions 9 + plans 9 halisi hazikuguswa.
