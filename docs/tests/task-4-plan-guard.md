# Task 4 (maelezo4) — Plan Guard Gate: plan iliyoshindwa guard HAITEKELEZWI

Branch: `task/4-plan-guard-gate` · main `57a2222` (deploy `dd7cd905`) + fix `5d458ea` (deploy `c0bdcf40` HEALTHY) · 2026-10-17

## Uamuzi wa CEO (option A, refined) — kilichotekelezwa
| Aina | Ujumbe / hali | Matokeo |
|---|---|---|
| Warning (whitelist, regex kamili) | `S3_LEDGER_FALLBACK` "§3 imetumia fallback ya Ledger…" · `STEPS_BELOW_MIN` "hatua N < ndogo ya 8" (N ≥ 1 tu) | Haizuii · inahifadhiwa kwenye plan · chip "⚠️ warnings" run ikianza · kiambatisho kwenye ripoti |
| Block | `SECTION_MISSING` · `NO_STEPS` (hatua 0) · `STEPS_ABOVE_MAX` · `UNKNOWN` (ujumbe wowote usiojulikana — fail-safe) | status `structure_failed` |
| Block (daima) | Data Guard hits > 0 | status `guard_failed` (bila kujali `asm.problems`) |

- Status (spec §3, imechaguliwa na kuandikwa): **`structure_failed`** kwa muundo, **`guard_failed`** kwa Data Guard; mpangilio `guard_failed` > `structure_failed` > `active` (`planStatusOf`).
- `isPlanExecutable({status, md, warnings})` (src/lib/cu/planGate.ts) — inakagua status + inahakiki tena sehemu §1–§8 na hatua za §6 kutoka md iliyohifadhiwa.
- `startComputerPhase` inaiita KABLA ya sandbox. Ikizuia: hakuna sandbox; chip/log `⛔ Plan blocked: <sababu>`;
  `cu error` + `run_end {status: blocked, finalState: BLOCKED, finalReason}`; session `finale_incomplete` (▶ Endeleza inapitia lango tena).
- Hook ya majaribio: `maybeSabotagePlan` — TU `XMD_TEST_HOOKS=1` + project ina `xmdtest-planguard-sabotage`; inaongeza code block yenye bei isiyo rasmi. Bila env: inert (T1 inathibitisha).
- Kumbuka: `>60 hatua` sasa INAZUIA (fail-safe; si kwenye whitelist ya CEO) — **CEO athibitishe**.

## T1 + T2 — `src/lib/cu/planGate.test.ts` → 21/21 PASS
- T1 (jedwali): ok plan; guard_failed; structure_failed; sehemu kukosa; hatua 0 (block); hatua 3 < 8 (warning); §3 fallback (warning); >60 (block); ujumbe usiojulikana (block); plan tupu; whitelist regex kamili (tofauti ndogo = block); hook inert bila env; hook ya T3 kweli inaangusha guard halisi.
- T2 (pipeline halisi): `extractFactSheet` (brief ya DATA RASMI halisi) + `assemblePlanDocument` + `guardText`:
  bei TSh 7,500 (si rasmi) → `guard_failed` → `isPlanExecutable.ok=false`; §7/§8 zimeondolewa → `structure_failed` → imezuiwa; bei sahihi → `active`.

## Test ya ziada ya CEO — plans HALISI (Supabase, read-only) — `planGate.real.test.ts` (XMD_REAL_PLANS=1) → 2/2 PASS
```
[real-plan] 0591e0a3 status=active steps=14 chars=24550 -> ok=true
[real-plan] bf805006 status=active steps=8 chars=16680 -> ok=true
[real-plan] 0af8e1cb status=active steps=11 chars=28818 -> ok=true
[real-plan] 0673c62b status=active steps=1 chars=51562 -> ok=true
[real-plan] f075b2a3 status=active steps=15 chars=70877 -> ok=true
[real-plan] 5efcc185 status=active steps=10 chars=16845 -> ok=true
[real-plan] 0784469f status=active steps=13 chars=37350 -> ok=true
[real-plan] 88ef0a2d status=active steps=18 chars=53571 -> ok=true
[real-plan] a1978bac status=active steps=16 chars=18812 -> ok=true
[real-plan-warnings] 947d9592 db=["hatua 7 < ndogo ya 8"] doc=["hatua 7 < ndogo ya 8"]
[real-plan-warnings] 39456582 db=["hatua 6 < ndogo ya 8"] doc=["hatua 6 < ndogo ya 8"]
```
- Plans 9 (kabla ya 2026-10-17): HAKUNA iliyozuiwa. Kila moja ikiondolewa §7 → imezuiwa ("sehemu 7").
- Bug iliyopatikana na T3 + kurekebishwa: `toDoc` (plans.ts) haikusoma `warnings` → API/`getPlanBySession` zilirudisha `undefined`.
  Bila fix test inashindwa (`doc=undefined`), na fix inapita.

## T3 — live Koyeb (deploy dd7cd905, XMD_TEST_HOOKS=1)
**Run 15 — sabotage** (`39456582`, brief `xmdtest-planguard-sabotage …` + DATA RASMI Kunyoa TSh 5,000 / Kuosha TSh 3,000):
```
📋 Mpango Kazi wa Agent umehifadhiwa (hatua 6 · status guard_failed · doc cb92eceb… · herufi 12526).
⛔ Plan blocked: status guard_failed — Data Guard bado inaona tofauti za DATA RASMI — XMD Computer HAIKUANZISHWA (sandbox haikuundwa).
cu items: {"divider":1,"error":1,"run_end":1}   (hakuna run_start/exec/usage → sandbox haikuundwa)
run_end {"status":"blocked","finalState":"BLOCKED","finalReason":"status guard_failed — Data Guard bado inaona tofauti za DATA RASMI"}
```
- `/api/conversations?id=` → status `finale_incomplete`; `error ⛔ Plan blocked…`; `run_end BLOCKED …`.
- `/api/plans?session=` → `status: guard_failed`.
- Export (adapter + `boardMarkdown` halisi, items za session):
  `- Hali: imesimama (BLOCKED — status guard_failed — …) · hatua 0 · 0 LLM calls · 0 tokens · files 0` + `⛔ Plan blocked: …`.
- ▶ Endeleza (`/api/boardroom/resume`): plan imeandikwa upya → bado `guard_failed` → imezuiwa tena (BLOCKED, sandbox haikuundwa).

**Run 16 — kawaida** (`947d9592`, brief ileile bila sabotage):
```
📋 Mpango Kazi wa Agent umehifadhiwa (hatua 7 · status active · doc 67d3a0a3… · herufi 13987).
🖥️ Awamu ya XMD COMPUTER inaanza — agent anatekeleza Mpango Kazi (E2B sandbox).
⚠️ Mpango Kazi una warnings 1 (hazizuii utekelezaji): hatua 7 < ndogo ya 8
## Kiambatisho: ⚠️ Onyo za Mpango Kazi (warnings) … - ⚠️ hatua 7 < ndogo ya 8   (kwenye ripoti)
judge: complete score=1.0
run_end {"status":"done","finalState":"COMPLETED_UNVERIFIED","finalReason":"completed, NOT yet verified"}
```
- Baada ya fix (deploy c0bdcf40): `/api/plans` → `947d9592 status=active warnings=['hatua 7 < ndogo ya 8']`.
- Usafi: sessions 15/16 + plans/ripoti zao zimefutwa (clean.mjs); plans halisi 9 hazikuguswa.

## Baselines (baada)
tsc 0 · vitest 237 passed + 2 skipped (real tests, zinahitaji env) — 216 za awali + 21 mpya · unittest 238 OK · eslint (files zilizoguswa) 0.

## Known gaps
- Data Guard inafanya kazi TU kama brief ina Fact Sheet (DATA RASMI / jedwali / saa); na inakagua code blocks pekee (`guardText`).
- `>60 hatua` inazuia (fail-safe) — CEO athibitishe au aiongeze kwenye whitelist.
- Nje ya wigo (4c): run 16 judge OR Lightning `attempt_ms=385325` licha ya `timeout_s=180` — timeout haibani stream ndefu. Inahusiana na uamuzi wazi wa CEO (Lightning fallback-only).
