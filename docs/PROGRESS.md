# PROGRESS — Professor XMD Company (kufuatia maelezo0.md)

## Baselines
| commit (base) | tsc | vitest | python (cu) | date |
|---|---|---|---|---|
| `737b57a` (v3/main, kabla ya Task 2) | 0 errors | 183/183 (18 files) | 186/186 OK | 2026-10-16 |

## Tasks
| # | branch | kazi | hali | ushahidi |
|---|---|---|---|---|
| 1 | (kufanywa na session nyingine; merged main `737b57a`) | pause/resume split (user vs system) | **COMPLETE** — live Koyeb T0–T8 + smoke PASS (deployment `fc81c156` HEALTHY) | `docs/tests/task-1.md` |
| 2 | `task/2-flow-map` | READ-ONLY flow map → `docs/FLOW-MAP.md` (A–I) | **COMPLETE** — baselines zimeandikwa, vision test ya kweli PASS lanes 3, hakuna code changes | `docs/tests/task-2.md` |
| 3 | `task/3-cu-final-states` (ec8c75f → main `8ad7871`, Koyeb `b74f750b`) | Computer final states (`computeFinalState`; ok = COMPLETED_UNVERIFIED pekee) | **T1 ✅ · T2 ✅ (LIVE) · T3 ❌ STUCK×2 (judge cap — Q-001)** | `docs/tests/task-3.md` |
| 3b | `task/3b-cu-thinking` (e96eb45 → main `95c3161`, Koyeb `2c37e274`) | CU thinking formats → think cards; text tool-call imefichwa; Gemini `gemini/`; judge max(40, steps×3) | **T1 ✅ · T2 ✅ (E2B) · T3 ❌ STUCK (harness assertion evidence — Q-002)**; thinking LIVE ✅ | `docs/tests/task-3b.md` |

## Baseline ya Task 2 (kumbukumbu ya amri)
```
$ npm run typecheck      → 0 errors
$ CI=1 npx vitest run    → 18 files, 183/183 tests PASSED
$ npm run cu:test        → Ran 186 tests — OK
```

## Task 2 — Vision test (matokeo ya kweli, 2026-10-16)
- gemini-flash 3.8 (key1): HTTP 503 (outage ya wakati) → retry 3.7 (key2): **"Red"** ✅
- xkiro qwen/qwen3.8-max:free (optimus-1): **"Red"** ✅
- gemini-flash-lite 3.5 (key1): **"Red"** ✅


## Task 3 — Computer final states (2026-10-16)
- Branch `task/3-cu-final-states` · commit `ec8c75f` · merged v3/main `8ad7871` · Koyeb `b74f750b` HEALTHY.
- Faili: `src/lib/cu/finalState.ts` (MPYA, pure + jedwali), `src/lib/cu/engine.ts` (finishComputer: ok=COMPLETED_UNVERIFIED
  pekee; finalState/finalReason → CuRunState, CuChip, item ya run_end, bcast phase_done; maneno "completed, NOT yet verified";
  startComputerPhase inafuta finalState ya run iliyopita), `src/lib/board/adapter.ts` (run_end/phase_done: stuck/blocked/unknown
  → "error" + finalState), `src/lib/stage/types.ts` (CuRunItem.finalState/finalReason), `src/components/board/stage/Computer.tsx`
  ("Imekamilika · haijathibitishwa" / "Imesimama · STATE"), `src/components/board/exportMarkdown.ts` (maneno ya export).
  Tests: `finalState.test.ts` (MPYA), `engine.test.ts` (+3), `ui.test.ts` (+2).
- Baselines baada: tsc 0 · vitest 210/210 · python 186/186.
- Tabia iliyobadilika (kwa makusudi, spec): run ya bridge `stuck` yenye ripoti SASA ni `finale_incomplete` + Endeleza (zamani: completed).
- Known issues: T3 haijapita — judge cap ya OpenHands (`XMD_GOAL_MAX_ITER` default min(25,max(6,steps))) → QUESTIONS.md Q-001.
  Lint: makosa 2 ya zamani `Computer.tsx` (react-hooks) — hayakuguswa.

## Task 3b (2026-10-16)
- Baselines: tsc 0 · vitest 210/210 · cu:test 198 OK.
- Judge cap (Q-001) imetatuliwa: live `judge: complete score=1.0`.
- Known issue: harness `features_verify` inakataa `assertion` bila evidence ya file/browser hata judge akisema complete → Q-002.
- Haijathibitishwa: kimi-k3, deepseek-v4.1-flash, codestral (503 busy).
