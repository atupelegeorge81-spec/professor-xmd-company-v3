# Task 18 (maelezo18) — Completion gate (lango la kumaliza)

Branch `task/18-completion-gate` (kutoka main `99e5072`). Flag `XMD_MILESTONES` (default OFF) — legacy haiguswi.

## Nini kimejengwa
- **`cu/gate.py` (mpya)** — moduli moja kwa backends zote mbili: `evaluate()` inapima masharti 4 ndani ya workspace:
  (a) Build Report ipo na inafuata mkataba (headings 8), (b) `git status --porcelain` tupu + ≥1 commit tangu mwanzo wa awamu,
  (c) `buildCommand` exit 0, (d) `requiresTests` → `testCommand` exit 0. `GateGuard` = blocks + loop guard
  (3 bila maendeleo → PARTIAL; kikomo 10). `partial_line()` → `PARTIAL: gate failed: <list>` (inaandikwa ndani ya ripoti).
- **`cu/bridge.py` (Claude backend)** — `on_stop` inaendesha lango baada ya ukaguzi wa deliverables: block →
  `{"decision":"block"}` na orodha ya kilichoshindwa; partial → status `partial` + mstari kwenye ripoti; `run_end.gate`.
  `tests_run` = True TU baada ya test command kumaliza exit 0 (post-hook; pre-hook haiweki kamwe) — milestone runs tu.
- **`cu/oh_bridge.py` (OpenHands backend, uzalishaji)** — `_run_gate` baada ya judge "complete" + features harness:
  block → `send_message` + `run` (bila round ya ziada ya judge); partial → status `partial`; `run_end.gate`.
- **engine.ts** — StartPack inaongeza sehemu `## COMPLETION GATE` (masharti 4); `.xmd/startpack.json`
  {milestoneId,title,buildCommand,testCommand,requiresTests,baseCommit,reportPath}; gate.py inapakiwa kwenye sandbox;
  `.git/info/exclude` += startpack.json, CLAUDE.md, STATUS.md; `computeFinalOutcome({milestone:true, gate})`; PARTIAL → BLOCKED.
- **finalState.ts** — `COMPLETED_VERIFIED` (gate.passed tu). Milestone done bila gate → PARTIAL; raw `partial` → PARTIAL.
  Legacy → `COMPLETED_UNVERIFIED` kama zamani. adapter.ts okEnd inakubali VERIFIED.
- **plan.ts / startpack.ts** — template §4 inadai mistari `Build Command:` na `Test Command:`; validator 1b: bila Build Command
  = kosa (repair loop); `planGateCommands(md)`.
- **testHooks.ts** (inert bila `XMD_TEST_HOOKS=1`): `XMD_TEST_BUILD_CMD_<Mk>`, `XMD_TEST_CU_NOTE_<Mk>`, `XMD_TEST_GOAL_OFF_<Mk>`.

## Maamuzi yangu (CEO alikuwa amelala — nimejiuliza, nimejibu, nimetekeleza)
1. Moduli moja `cu/gate.py` kwa backends zote mbili, milestone runs tu.
2. OH: lango baada ya judge "complete" + features harness; block = `send_message`+`run` (hakuna round ya judge ya ziada).
3. Loop guard: blocks 3 mfululizo bila maendeleo → PARTIAL; kikomo cha jumla blocks 10.
4. Plan ya zamani bila Build Command → sharti (c) = "n/a" (na note). Plans mpya: validator inadai Build Command.
5. `requiresTests` = plan ina Test Command isiyo "none"; requiresTests bila amri = kushindwa.
6. Mstari wa PARTIAL unaandikwa ndani ya Build Report na kwenye ripoti ya mwisho.
7. Semantiki mpya ya `tests_run` (exit 0) kwa milestone runs tu; legacy haibadiliki.
8. Milestone PARTIAL → **BLOCKED** (inageuza uamuzi wa Task 16 "PARTIAL = ok").
9. `COMPLETED_VERIFIED` tu kwa gate.passed; milestone done bila gate = PARTIAL; legacy = COMPLETED_UNVERIFIED.
10. Faili za harness (startpack.json, CLAUDE.md, STATUS.md) kwenye `.git/info/exclude`.
11. StartPack inamwambia agent masharti 4 tangu mwanzo (anajicommit mwenyewe).
12. Test hooks za T1–T4 (build cmd / note kwa kila milestone).
13. Runtime ya Koyeb ina repo nzima (buildpack, `next start`) → `readCuFile` inapata `cu/gate.py`.
14. **Maendeleo HALISI** (kutokana na real run): orodha ya failures imebadilika, AU tree ya HEAD imebadilika nje ya Build Report,
    AU ripoti imebadilika wakati sharti la ripoti ndilo linashindwa. Commit ya ripoti peke yake / commit tupu si maendeleo —
    run 2 ilionyesha agent anazungusha kaunta kwa mabadiliko ya mapambo ya ripoti (blocks 1→4).
15. **Ujumbe wa block unakataza kuchezea mazingira** (mount, /proc, startpack.json, amri) na unasema wazi "kama haiwezekani,
    eleza kwenye ripoti, maliza tena → PARTIAL kwa uaminifu" — run 2 agent alijaribu `/tmp/proc-file` … na sandbox ikafa.
16. `XMD_TEST_GOAL_OFF_<Mk>` (test hook pekee): kwenye uzalishaji judge hukamata mengi KABLA ya lango (tabaka mbili — sawa);
    ili T1/T3 zipime hook yenyewe, judge anazimwa kwa awamu hiyo tu (njia ya dev iliyopo `XMD_GOAL_OFF=1`).
17. Task 17 rekebisho: repo mpya → `git ls-tree -r HEAD` (si `diff-tree --root HEAD`): sasa agent anacommit mara kadhaa,
    diff-tree iliona commit ya MWISHO tu → README iliitwa "fake" (run 1).
18. `HARNESS_FILES` (plan.md, feature_list.json, AGENTS.md, CLAUDE.md, STATUS.md, .xmd/startpack.json) zikitajwa kwenye ripoti si "fake".

## Majaribio HALISI (dev server ya local + Supabase/E2B/LLM halisi, tunnel ya cloudflared, brief `xmdtest-cu16`)

| Test | Matokeo | Ushahidi |
|---|---|---|
| T1 report inakosekana | **PASS** (angalia note) | Run 3 M1 (judge OFF): `BLOCK 1 — build report: file .xmd/reports/M1-build-report.md does not exist — write it with the 8 required headings` → agent aliandika ripoti (chip `📑 Build Report ya M1: muundo sahihi`). |
| T2 uncommitted | **PASS** | Run 1 M2: `gate: BLOCK 1 — git: uncommitted changes (1): scratch-notes.txt` → agent `61906c6 chore(M2): commit scratch-notes.txt…` → `gate: PASSED (blocks 1)` → **COMPLETED_VERIFIED** (completed, verified by the completion gate (blocks 1)). |
| T3 build inafeli | **PASS** | Run 3 M2 (judge OFF, build `node --check app.js && test -s README.md`): `BLOCK 1 — build: … exited 1 — /home/user/ws/app.js:2 SyntaxError: Unexpected end of input` → agent alirekebisha + commit → `run_end gate {passed:true, blocks:1, build exit 0, tests exit 0, commitsSinceStart 4}` → **COMPLETED_VERIFIED**. |
| T4 loop guard | **PASS** | Run 4 M2 (judge ON = njia ya uzalishaji, build `test -f /proc/xmd-impossible-file`): blocks 3 → `run_end status partial, gate {passed:false, partial:true, blocks:3}` → `milestoneBuild M2 ok:false finalState PARTIAL reason "PARTIAL: gate failed: build: \`test -f /proc/xmd-impossible-file\` exited 1 —"` → chip ⛔ PARTIAL → DB `M2 BLOCKED · M2.R0.build:FAILED` (M1 SIGNED_OFF). Mwisho wa `.xmd/reports/M2-build-report.md` (snapshot halisi): `PARTIAL: gate failed: build: …exited 1 —`, commit ya harness `5fc41b2`. Commit ya ripoti peke yake `0d025ff` HAIKUHESABIWA maendeleo (uamuzi 14). |
| T5 tests_run | **PASS** | pytest halisi (subprocess) → HookState: `FAIL exit=1 '1 failed' tests_run_after_pre=False after_post=False` · `PASS exit=0 '1 passed' after_pre=False after_post=True` · mfuatano fail→pass: False → True. |
| T6 flag OFF | **PASS** | Session ya flag OFF: `milestone 0 · 🚦 0 · "gate" 0 · COMPLETED_VERIFIED 0`; CU ya zamani: `run_end {status: done, milestone: None, gate: None}`, chip `🖥️ XMD Computer: completed, NOT yet verified` (COMPLETED_UNVERIFIED kama zamani). |

**Note ya T1:** block + agent kuandika ripoti vimeonekana halisi (run 3). Hali ya mwisho ya awamu hiyo ilikatizwa na
watchdog ya RAM ya server yangu ya local (sandbox ya 2GB, `🌡️ RAM imefika 78%`) → ERROR — haihusiani na lango.
Njia "block → kurekebisha → COMPLETED_VERIFIED" imethibitishwa halisi kwenye T2 na T3. Kwenye runs 1/2/4 agent alichagua
kuandika ripoti mapema licha ya agizo la test (mkataba + sehemu ya COMPLETION GATE vina nguvu) — tabia nzuri kwa uzalishaji.

### Runs na mafunzo
- **Run 1** (M1 gate PASSED 0, VERIFIED; M2 = T2) → iligundua bug ya diff-tree (uamuzi 17).
- **Run 2** M1: judge (Ultra) alikataa jaribio la kwanza la kumaliza (ripoti haipo + syntax error) → agent alirekebisha →
  gate PASSED 0 (judge ni tabaka la kwanza) → uamuzi 16. M2 (T4 v1): blocks 1→4 (maendeleo ya mapambo) kisha agent alichezea
  mazingira → sandbox ilikufa → ERROR → maamuzi 14–15.
- **Run 3** T1 + T3 (judge OFF). **Run 4** M1 VERIFIED + T4 (judge ON) → PARTIAL/BLOCKED. Agent HAKUCHEZEA mazingira tena.

### Ugunduzi (haujarekebishwa — nje ya wigo wa Task 18, eneo la Task 16)
- Watchdog ya RAM ya server (`R43`, ≥78%) ikipumzisha CU ndani ya awamu ya milestone → `milestoneBuild ERROR` yenye reason tupu,
  na loop inaendelea milestone inayofuata (uamuzi wa Task 16 ulikuwa "pause → hatua inarudiwa"). Inapendekezwa kurekebishwa
  kwenye task ya baadaye. Kwenye majaribio ya baadaye nilitumia `R43_WATCHDOG=off` (local tu).
- Optimus mara moja aliandika Build Command inayoandika faili (`printf '# xmdtest-cu16\n' > README.md`) badala ya kukagua — ubora wa plan.

## Baselines
tsc 0 · vitest **514** passed + 2 skipped · pytest **333** · unittest **263** · eslint 0 (faili zilizobadilishwa).
Majaribio mapya: `cu/tests/test_t18_gate.py` (22: repo halisi ya git kwa a/b/c/d, n/a, loop guard, maendeleo halisi, ujumbe,
injected, semantiki ya tests_run), finalState/engine/plan/startpack/loop/buildReport tests.

## Usafi
Sessions 5 za xmdtest (0525fe01, fce5190d, 0869583d, a0654450, 8f1ead47 + rows za cu_files), snapshots 8 za bucket za leo zimefutwa;
sandboxes za E2B: 16 zilizobaki si zetu. Workspace: logs za zamani zimeondolewa, cloudflared imehamishiwa `~/.cache`.
