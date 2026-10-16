# TASK 3 — Computer final states (evidence) · LIVE Koyeb (2026-10-16)

Code: branch `task/3-cu-final-states` commit `ec8c75f` → merged v3/main **`8ad7871`** → Koyeb deployment
`b74f750b` HEALTHY (git sha `8ad7871`, ilithibitishwa kupitia Koyeb API).

## Baselines
| | kabla (810b1ad) | baada (ec8c75f) |
|---|---|---|
| `npm run typecheck` | 0 errors | 0 errors |
| `CI=1 npx vitest run` | 183/183 (18 files) | **210/210 (19 files)** (+27 mpya) |
| `npm run cu:test` | 186/186 OK | 186/186 OK |
| eslint (faili zilizoguswa) | Computer.tsx: makosa 2 ya zamani (mistari 102, 208 — react-hooks) | yale yale 2, hakuna mapya |

## T1 — unit (pure) · PASS
`src/lib/cu/finalState.test.ts` — jedwali la safu 18 (done/ok/success ± report, stuck ± report, blocked,
paused_quota, paused flag, error/crash/fatal, unknown `weird_status`, status tupu) + ok/reason (ok ni kweli TU kwa
COMPLETED_UNVERIFIED; reason "completed, NOT yet verified"; unknown inabeba raw status).
Pia `engine.test.ts` (+3: stuck+report → STUCK/ok=false/chip/run_end/phase_done; done+report →
COMPLETED_UNVERIFIED + chip "NOT yet verified"; unknown → ERROR) na `ui.test.ts` (+2: replay STUCK → card
"error"+finalState; live run_end stuck → error).
```
Test Files  19 passed (19)
     Tests  210 passed (210)
```

## T2 — real endpoint (`POST /api/boardroom/cu-event`) · PASS
Session ya majaribio `xmdtest-final` (`e7559a4a…`, brief: repo ya kutupwa yenye hello.txt), deployed URL.
- **stuck + report (KIASILI, mara 2):** bridge halisi ya OpenHands ndani ya E2B ilipost events zake kwenye route hii.
  Run 1 (i=1..79) na Resume (i=80..172) zote zilimaliza `finish(report)` + `run_end status:"stuck"`
  (judge: `objective haijakamilika (capped)`). DB baada ya kila run:
  ```
  status: finale_incomplete
  CU chip: {"done":false,"finalState":"STUCK","finalReason":"stuck","maxI":79,"hasReport":true}
  cu: run_end {"i":79,"status":"stuck","finalState":"STUCK","finalReason":"stuck"}
  chip: ❌ XMD Computer haijakamilika (STUCK) — bonyeza ▶ Endeleza kuiendeleza.
  ```
  (Code ya zamani: `ok = !!cu.report && status !== "error"` → hii ingeandikwa **completed** ya uongo.)
- **Resume inafuta hali ya zamani:** chip baada ya Resume (00:05:22) = `{"done":false,"maxI":80,…}` — hakuna finalState
  wakati inaendelea; mwisho wa run inawekwa upya (STUCK).
- **done + report (POST ya moja kwa moja yenye token ya run kutoka chip):**
  ```
  finish  -> {"ok":true}
  run_end -> {"ok":true}
  bad-token -> {"ok":false,"error":"token"}
  status: completed
  CU chip: {"done":true,"finalState":"COMPLETED_UNVERIFIED","finalReason":"completed, NOT yet verified","maxI":174,"hasReport":true}
  cu: run_end {"i":174,"status":"done","finalState":"COMPLETED_UNVERIFIED","finalReason":"completed, NOT yet verified"}
  chip: 🖥️ XMD Computer: completed, NOT yet verified — ripoti + 840,416 tokens.
  ```
- UI live (`/board?session=…`, Playwright): card ya XMD Computer = **"Imekamilika · haijathibitishwa"** → `docs/tests/task-3-ui.png`.

## T3 — real smoke (kazi halisi ndogo ya Computer → COMPLETED_UNVERIFIED) · **HAIJAPITA (STUCK ×2)**
Kazi halisi (hello.txt kwenye repo ya kutupwa) ilifika hatua 4/5 (git init, hello.txt bytes 5, commit, verify)
lakini mara zote mbili judge wa OpenHands alifikia kikomo kabla ya push:
`max_iter = int(os.environ.get("XMD_GOAL_MAX_ITER") or min(25, max(6, _steps_n)))` (`cu/oh_bridge.py:343`) — mpango
wa hatua 5 → iterations **6**. Hii ni tabia ya R51 iliyokuwepo (nje ya scope ya Task 3); kanuni 6 → `QUESTIONS.md` Q-001.
Mfumo mpya UMEFANYA kazi yake hapa: STUCK imeripotiwa kama STUCK (si "completed").

## Post-deploy smoke
Imeruka hadi Q-001 ijibiwe (= T3 kwenye URL live).

## Cleanup
Session `e7559a4a…` + project_plans/mini_reports/reports/board_ledger zake ZIMEFUTWA. Pia mabaki ya Task 1
(`xmdtest-pause`: report 1, ledger 1, mini_report 1, plan 1) yaliyobaki DB yamefutwa. Repo ya GitHub haikuundwa
(push haikufanyika). Sandbox ya E2B iliuawa na engine (finishComputer). NB: memory ya agents (reflection) inaweza kuwa
na somo kutoka run hii — haikuguswa.
