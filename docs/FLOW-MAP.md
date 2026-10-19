# FLOW-MAP — ukweli wa system ilivyo (commit `737b57a`, branch `task/2-flow-map`)

> Kanuni: kila dai lina `file:line` + amri iliyoitumika. Hakuna kubuni; mahali pasipothibitikana = `UNKNOWN`.
> Amri zote (na matokeo yao yaliyopunguzwa) zipo kwenye `docs/tests/task-2.md`.

## Control flow kwa mistari 15
1. CEO brief → `POST /api/boardroom` (start) → runner mpya inajengwa (`boardRunner.ts:282`, mode `plan` ikiwa `BOARD_PLAN_MODE && cuEnabled()`).
2. Ndani ya `run()` (`boardRunner.ts:495`) → `generateAgenda(pmClient("agenda","normal",true), pm.model, project)` (`boardRunner.ts:1198`) — agenda list inaundwa MARA MOJA, mwanzoni; `src/lib/agenda.ts:246`.
3. Loop `for (const item of agenda)` (`boardRunner.ts:1509`) — kila agenda: kila agent mwenye owner inazungumza kwa zamu; `gate(name)` (`:611`) inasimama inapotakiwa (pause/budget guards).
4. Consensus: mashine ya AGREE/owners inakagua mazungumzo ndani ya adapter (`src/lib/board/adapter.ts`; kanuni: mtoa pendekezo HAHESABIWI — `adapter.consensus.test.ts:4-6`).
5. Agenda inapofungwa: `saveLedgerEntry()` andiko la Ledger (`boardRunner.ts:2493`, `:2984`; helpers `src/lib/ledger.ts`).
6. Mini-report ya Optimus kwa kila LOCKED: `writeMiniReport(deps, input)` (`src/lib/miniReport.ts:137`); muundo wa kuhifadhi `mini_reports` collection, pointer kwenye ledger (`src/lib/server/miniReports.ts:32`, boardRunner `R30` wiring `:45`).
7. MBAO ya mini-reports ya awali/zilizokatika inafanyiwa redo (`needsMiniRedo`, `boardRunner.ts:1461-1465`).
8. Mwisho wa Board = ripoti ya Kiswahili (finale docs) + Mpango Kazi wa Kiingereza (comment `boardRunner.ts:639`); finale state: `runner.finale` (`:88`).
9. Ikiwa `mode==="plan"` (`planModeRun`, `:640`): kipimo cha kuandika code kimruka (`:2179-2180`); sio ujenzi wa code.
10. Computer-planned: `runner.computerPlanned` (:92) ikishawa true, `ensureCuState(runner)` (`:405`,`:1151`).
11. Awamu ya Computer inaanza `startComputerPhase(runner, runner.cuHooks)` (`cu/engine.ts:418`; kuipigia kutoka resume `:1157` + finale path).
12. Bridge: `Sandbox.create(CU_TEMPLATE, {timeoutMs: 55*60_000, lifecycle:{onTimeout:"pause"}})` (`cu/engine.ts:349-363`) → `cu/bridge.py`/`oh_bridge.py` inakimbizwa background `timeout 1h` (`cu/engine.ts:598-601`).
13. Events zinatiririka SSE → client (`src/app/api/boardroom/route.ts`); items+state hupersistiwa kupitia chip `__PROFESSOR_XMD_RESUME_STATE__` (read/write: resume builder `boardRunner.ts` around `:356-407`; prefix `src/lib/usageChip.ts` RESUME_PREFIX).
14. pause/resume: Task-1 wiring — `pauseRun(id, origin)` `:146`, `unpauseRun(r, by)` `:201`; auto-recovery ya system: watchdog (`src/lib/server/watchdog.ts:79-99`) + quota/CU (`src/lib/cu/engine.ts:1100` `pauseComputerFromServer`; auto-resume `src/lib/cu/autoResume.ts:22,68-72`).
15. Mwisho wa CU: ripoti zinazorejeshwa kwa items (`cu` items) → finale imefanywa; session inasnapshotted `paused`/`completed` kwenye `boardroom_sessions`.

---

## A. Agents (`src/lib/agents.ts:18-49`)
| id | name | role | tagline (dalili ya personality) | line |
|---|---|---|---|---|
| `pm` | Optimus | Project Manager | "Leader · consensus chair · protects decision quality" | :20-24 |
| `designer` | Ultron | UI/UX Designer | "Look & feel · patterns · delightful flows" | :26-30 |
| `frontend` | Vextron | Frontend Engineer | "React · Next.js · Tailwind · UX performance" | :32-36 |
| `backend` | Megatron | Backend & DB Engineer | "APIs · data · architecture · full-stack" | :38-42 |
| `qa` | Cybertron | QA & DevOps Engineer | "Reliability · security · testing · deploy" | :44-48 |

- Amri: `grep -n "id:\|name:\|role" src/lib/agents.ts` · `sed -n '18,50p' src/lib/agents.ts`
- Majibu §17.1: Designer = **Ultron**; Frontend = **Vextron**; Backend = **Megatron**; QA/Security+DevOps = **Cybertron**. Kwa jina la kiufundi: agent id hardcoded kama `pm/designer/frontend/backend/qa`.
- Kila agent pia ana `model` field kwenye config (mf. `qwen/qwen3.8-max:free` `:23`); lane halisi inachaguliwa na broker lane-pool (`src/lib/broker/lanes.ts`).

## B. Board flow
1. **Agenda list inaundwa wapi/lini:** moja kwa moja ndani ya `run()` `boardRunner.ts:1198` (`generateAgenda(pmClient("agenda","normal",true), pm.model, runner.project)`); generator: `src/lib/agenda.ts:246`.
2. **Je, agenda zinaweza kuongezwa katikati ya run? — HAPANA (imekidhinishwa):** `grep -n "agenda.push\|agenda.splice\|agenda.unshift" src/lib/boardRunner.ts` = **0 matokeo**. Route pekee inayohusiana `src/app/api/boardroom/agenda/route.ts` ni `GET` pekee (kisomoji kutoka runner hai/PERSIST chip; matoleo `:6-23`). Hakuna POST/PUT ya kuongeza agenda mid-run.
3. **Loop ya kila agenda:** `for (const item of agenda)` `boardRunner.ts:1509` — ndani: zamu za agents, gates (`gate` `:611`), locks, mini-reports.
4. **Consensus/closing protocol:** ndani ya `src/lib/board/adapter.ts` (+ `adapter.consensus.test.ts`): kanuni zinazodhibitishwa na tests — "mtoa pendekezo HAHESABIWI automatic; owners WOTE wana-AGREE wazi; DISAGREE inasahihisha pendekezo" (`adapter.consensus.test.ts:4-6,46-57`). Locks yanawekwa kama chips `🔒 LOCKED:` / `🟠 OPEN:` (`boardRunner.ts:1448`) na ledger (`saveLedgerEntry` `:2493`,`:2984`).
5. **Mini-reports zinapotengenezwa:** kwa kila agenda LOCKED → `writeMiniReport(deps, input)` `src/lib/miniReport.ts:137` (params: `MiniDeps`, `MiniInput`; kazi-msaada: `provisionalMini(context)` (`miniReport.ts:115`), `needsMiniRedo(r, i)` (`:104`)). Storage: `miniReports` collection + pointer string (`MINI_LEDGER_POINTER`) kwenye ledger (`src/lib/server/miniReports.ts:32`, persistence import `boardRunner.ts:45`).
6. **Ledger andikwa:** `saveLedgerEntry(...)` `boardRunner.ts:2493` (closing ya moja kwa moja) na `:2984` (path ya pili — neno kwa neno wa helper huonekana `src/lib/ledger.ts`).
7. **Awamu ya plan inaanzia wapi:** baada ya Board idhini — `mode==="plan" ? planModeRun` `:640` + `computerPlanned` ikishawa inawekwa mwanzoni kama plan-mode+CU (`:282`); Mpango Kazi inaandikwa mwishoni (comment `:639`).
8. **Computer inaanza:** `startComputerPhase(runner, hooks)` — `cu/engine.ts:418` (kuanzia resume: `boardRunner.ts:1157`; kutoka finale path: `runner.cu?.pausedOnce` gating `:1152`).
9. **Computer inamalizika:** CU events (`cu.*`) huingia `handleCuEvent` → items za ripoti/finale; `CU_HARD_CAP_MS` default 30*60*1000 (`cu/engine.ts:38`) — safety cap kubwa.
10. **TASK-24 · REVIEW (R-Mk-n, `XMD_MILESTONES=1` pekee):**
    - REVIEW SI agenda yenye namba. Ramani inabaki agenda 1..N; REVIEW ina id yake (`R-M1-0`, index 0) na haiandikwi kama `agenda_index`.
    - Mwili wa loop ya agenda sasa ni closure `discussAgenda(item)` ndani ya `run()`. `for (const item of agenda)` inaiita kwa agenda 1..N.
    - `msHooks.review.discuss` inaiita kwa REVIEW. `runMilestoneBuild` (`milestone/loop.ts`) inaendesha hatua `Mk.R0.review` baada ya build yenye evidence: `runReviewRound` (`milestone/reviewAgenda.ts`) → findings (T23) → `discuss(item)` → `applyReviewRules` → Optimus `consolidate` → store.
    - Kwa REVIEW, mashine ileile inatumika (evidence/search gate, zamu, AGREE, consensus), isipokuwa: zamu za maneno 600–900, transcript 60k, max tokens 9000, na OCB `REVIEW_DISCUSS`.
    - REVIEW inarudi KABLA ya R37 (rough/fallback/defer), Ledger ya Board, mini-report na pingamizi. Bila consensus, proposals zote ni REJECTED.
    - Store ya milestone: `findings:Mk:R0`, `review:Mk:R0`, `defects`, `decisions`, `changeRequests`, `cos:Mk`. Events: `reviewFindings`, `reviewDecision`, `changeOrders`.
    - Matokeo ya hatua: CHANGES → FIXING (round 1); NO_CHANGES → SIGNED_OFF; consolidate batili ×3 → BLOCKED.
11. **TASK-25 · Raundi ya marekebisho (FIXING, `XMD_MILESTONES=1` pekee):**
    - `runMilestoneBuild` ikikuta hali FIXING → `runFixRound(m, round, cos)` (`milestone/loop.ts`), hatua `Mk.R<n>.fix` → `msHooks.fix.run` → `startComputerPhase(..., {fix})` (mechanics za task 16; sandbox haiuawi).
    - Pack ya Computer ni HIZI TU (`renderFixPack`, `milestone/fixRound.ts`): RoundHeader · OCB ya computer (stage FIX + LOCKED LEDGER) · COs kamili · repo summary · "what previous rounds changed" (≤40). Hakuna plan/Build Report/screenshots.
    - Computer anaandika `.xmd/receipts/R<n>.json` + `git commit -m "Mk Rn: CO-…"`. Lango la task 18 (`cu/gate.py` sharti e): receipts halali + receipt kwa kila CO; Build Report haihitajiki. Bridge: `milestone_contract` (`cu/bridge.py`).
    - Code inathibitisha (`verifyReceipts`) dhidi ya `git diff --name-only <before>..HEAD`: lengo halikuguswa bila BLOCKED/CANNOT → NOT_ATTEMPTED (rerun MARA MOJA na ujumbe wa kudumu); faili iliyobadilika bila kutajwa → UNLISTED_CHANGE; receipt inayotaja faili isiyobadilika → REJECTED.
    - Checks (task 21, `runChecks` kwenye sandbox ileile): acceptance za COs + global (build, tests, console_clean, no_horizontal_overflow kwenye routes muhimu). Store: `fix:Mk:Rn`, `checks:Mk:Rn`, `defects` (history). Matokeo: VERIFYING (task 26) au BLOCKED (PARTIAL/ERROR, resumeTo FIXING).
12. **TASK-26 · Raundi za uthibitisho (VERIFYING, `XMD_MILESTONES=1` pekee):**
    - `runFixVerifyLoop` (`milestone/loop.ts`): FIXING → `runFixRound` → VERIFYING → `runVerifyRound(m, round)` → FIXING (round+1) / SIGNED_OFF / CAP_REACHED / BLOCKED. Kila hatua inahifadhiwa na ni idempotent: `Mk.Rn.evidence` → `Mk.Rn.verify` → `Mk.Rn.decide`.
    - `Mk.Rn.evidence`: `msHooks.verify.evidence` → `captureRoundEvidence` (`cu/engine.ts`, tasks 19–22) → `evidence:Mk:Rn`.
    - `Mk.Rn.verify`: reviewers WAWILI tu (designer + frontend), kila mmoja peke yake (`verifyBoth`, `milestone/verify.ts`), RoundHeader + OCB `REVIEW_VERIFY` + PLAN GOAL + COs + checks + evidence mpya. Wakitofautiana (PASS dhidi ya isiyo PASS) → `syncTurn` MOJA. Rekodi moja: `verify:Mk:Rn`. Wito wa LLM ulioanguka (429) unarudiwa mara 2 kabla ya INVALID.
    - `Mk.Rn.decide` (code): `decide` (PASS = wote PASS + checks PASS; check FAIL/ERROR inapindua) → `applyVerifyToDefects` (dedupe: reviewers wawili + defects zilizo wazi) → regressions (reviewers + task 22 + `newlyOccluded`: maandishi yaliyofunikwa sasa dhidi ya evidence ya raundi iliyopita) → `roundOutcome` BEST (`git tag -f xmd-best-Mk`, `best:Mk`) / REVERT (`git stash` ya mabadiliko yasiyocommitiwa + `git revert <base>..HEAD` + ujumbe "round N reverted: made things worse" kwa Optimus) / SAME → `decideNext` → CONTINUE: Optimus `consolidate` (validation ya T24; ids `nextCoNumber`) → `cos:Mk:R(n+1)`.
    - RoundHeader (`fixRoundHeader`) inajengwa kutoka DB kila wito; `attempt` = jaribio linaloendelea.
    - Event: `verifyRound`. Test hooks (inert bila `XMD_TEST_HOOKS=1`): `XMD_TEST_VERIFY_INPUT` (pamoja na `startRound`), `XMD_TEST_STOP_AFTER_ROUND`.

## C. Computer flow (`src/lib/cu/*`)
1. **start:** `startComputerPhase(runner, hooks)` — `cu/engine.ts:418`. Ndiyo inachofanya: events zilizohifadhiwa zinareplay (`:575` `resumeNote = resume ? buildResumeNote(runner) : ""`), sandbox ikipatikana hai → attach tu (`:515` pgrep ya bridge), vinginevyo bridge mpya inaandikwa (`:598-601` background, timeout 3600s) na mirror-restore + replay (`mirror.ts`).
2. **finish:** events `run_end`/finish zinamalizia phase (safu `CU_PAUSE_PASSTHROUGH` `:46` list: run_end, report, snapshot, github, deploy, finish); tear-down status inaandikwa kupitia hooks + chip.
3. **pause:** `pauseComputerFromServer(runner, hooks, reason, resumeAt)` — `cu/engine.ts:1100` (Task-1: inapita origin kupitia chip; quota/system = `system`).
4. **resume:** `autoResumeSession(sessionId)` — `cu/autoResume.ts:22`; scans `checkPausedDue` ikiruka chip yenye `pauseOrigin:"user"`/`resumeAt:0` (`:68-71` — Task-1).
5. **`awaitPhase`/hard-cap:** loop `cu/engine.ts:434-438` — `Promise.race` dhidi ya cap; kila `CU_HARD_CAP_MS` (30min default) inarejelewa; kama `Date.now()-lastReal < cap` → subiri tena (maana: cap ni "no-progress" window, si hard-lifetime ya phase yote).
6. **`buildResumeNote`:** `cu/engine.ts:635` — inatengeneza resume-note kwa bridge wakati wa watach (replay note ya hali iliyopo).
7. **Mirror/resume:** `src/lib/cu/mirror.ts` — `mirrorEvent`, `mirrorMapOf`, `restoreFromMirror`, `sandboxAlive` (import `cu/engine.ts:19`).
8. **Sandbox lifetime (E2B):** timeout 55min na `lifecycle.onTimeout:"pause"` (`cu/engine.ts:349-353`) — **sandbox haidumu kati ya phases za zamani** (ukuta saa 1 ya Hobby). Persistence ya kweli ni **mirror + chip + framework replay**, si sandbox; attach (`:515`) inafanya kazi tu wakati sandbox bado hai.

## D. Persistence
1. **Sessions doc:** table `boardroom_sessions` — `src/lib/server/appwrite.ts:22` (Appwrite) na `src/lib/server/supabase.ts:38` (columns zilizosomeka: `project`, `title`, `status`, `mode`, `items…`). Full column list **UNKNOWN** katika map hii (read-only task; list kamili haijakusanywa hapa).
2. **paused vs running docs:** `status` field inawekwa na persist hooks (`boardRunner.ts:556-557` items:`{...finale?, computer?}`) — persist ya kweli inawekwa status `paused` + chip kupitia hooks (`runner.cuHooks.persist("paused", ...)`; matumizi yanayothibitishwa: `cu/engine.ts:544`).
3. **Hidden chips:** `CuChip` `cu/engine.ts` (`cuChipItemOf`, `readCuChip`); `__PROFESSOR_XMD_RESUME_STATE__` chip ya hali inajengwa/soneshwa kwa `buildResumePayload`-na-wenzake kupitia `RESUME_PREFIX` (`src/lib/usageChip.ts`); huparisiwa kwenye `src/app/api/boardroom/agenda/route.ts:13-21`.
4. **"updated at" staleness:** `runner.pausedAt` (`boardRunner.ts:172`), `startedAt` inahaririwa kwenye `unpauseRun` (`boardRunner.ts:207`) — data-level kuwepo kwa `updatedAt` field kwenye session doc: **UNKNOWN** kwenye map hii.

## E. Events/UI
1. **BoardEvent kinds (source):** `src/lib/types.ts:9-19+` — `log` levels (`info|success|warning|error|api|search|system`), `thinking`, `search`, `sources`, `search_error`, `token`, nk. (full union kwa `sed -n '9,60p' src/lib/types.ts`).
2. **Streaming:** SSE kupitia `src/app/api/boardroom/route.ts` (force-dynamic; content stream ya BoardEvent object-line kwa client).
3. **Mahali pa kuongeza kinds MPYA bila kuvunja UI:** adapter ya client `src/lib/board/adapter.ts` ina switch `case "cu": applyCu(e.cu)` (`:1124`); mpya kind huongeza: (a) union type kwenye `src/lib/types.ts`, (b) `case` kwenye adapter, (c) render kwenye `src/components/board/*`. Tabia kwa event inayotoka server bila branch kwenye adapter: **UNKNOWN** (haijathibitishwa kwenye map hii).

## F. Lanes (`src/lib/broker/lanes.ts`, `policy.ts`)
1. **Lane = (akaunti × model):** `allLanes()` `lanes.ts:51-68`. Providers: `xkiro`, `groq`, `openrouter`, `unorouter`, `gemini` (SPEC `lanes.ts:34-40`).
2. **Order/tiers:** Gemini tiers: `GEMINI_FLASH_MODELS` (`tier:"flash"`) halafu `GEMINI_LITE_MODELS` (`tier:"lite"`); `rank` = index (`lanes.ts:42-48`). classification ya lanes kwa phase ipo kwenye `policy.ts` + brokerRun.
3. **PLAN lanes pekee:** `PLAN_PROVIDERS = ["xkiro","unorouter","openrouter"]` (`policy.ts:67`).
4. **VISION test YA KWELI (64×64 red PNG; prompt: "What colour is the square?" · amri: node script `/tmp/vision.mjs`):**
   - `gemini-flash` (gemini-3.8-flash, key1): **HTTP 503** — Google outage wakati wa jaribio; jaribio lililofaulu baadaye na `gemini-3.7-flash`, `gemini-2`: **"Red"** ✅
   - `xkiro` (qwen/qwen3.8-max:free via XTROUTER): **"Red"** ✅ (inapokea image kama content-block kupitia API ya OpenAI-compatible)
   - `gemini-flash-lite` (3.5-flash-lite, key1): **"Red"** ✅
   - Section §17.3 JAWABI: **ZOTE mbili (XKiro na Flash-lite) zinakubali picha** kupitia API hizi zilizopo. (Kumbuka: uamuzi wa policy ya kuchagua lanes zinazopewa vision haziko kwenye statement hii — matokeo haya ni ya API tu.)

## G. Tooling
- **`zod`:** HAPANA kwenye `package.json` (`grep -o '"zod"' package.json` = 0). validator ya schema mpya itaamuliwa na tasks zijazo.
- **`playwright`:** HAPANA kwenye app `package.json` — **ILA ipo ndani ya CU sandbox**: `cu/setup.sh:4` ("playwright + Chromium … claude-agent-sdk … gh CLI") + venv check ya python `import playwright` (`cu/setup.sh:29-30`). JIBU §17.8: harness inaweza kuendesha vipimo NDANI ya sandbox (playwright ya python ipo) na UI-tests zikifanywa humu ndani zinatumia Chromium hicho.
- **Test scripts (`package.json`):** `test` = `vitest run`; `typecheck` = `tsc --noEmit`; `cu:test` = `python3 -m unittest discover -s cu/tests -t .`; `cu:live` = `check_brain_live.py`; `start` = `next start` (prod).
- Baselines kwenye branch hii: tsc **0 errors** · vitest **183/183** · python **186/186 OK**.

## H. Env var NAMES (values hazionyeshwi — kanuni §8)
**Orodha kutoka `.env.local` (49 entries jumla):**
- Appwrite: `APPWRITE_API_KEY`, `APPWRITE_COLLECTION_ID`, `APPWRITE_DATABASE_ID`, `APPWRITE_ENDPOINT`, `APPWRITE_PROJECT_ID`
- Supabase: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`
- LLM keys: `GEMINI_API_KEY_1..4`, `GROQ_API_KEY_{OPTIMUS|ULTRON|VEXTRON|MEGATRON|CYBERTRON}_{1|2}`, `XTROUTER_API_KEY_{…}_{1|2}`, `OPENROUTER_API_KEY_{1|2}`, `UNOROUTER_API_KEY_{1|2}`, `TOKENHARBOR_API_KEY`
- Model/config: `XTROUTER_BASE_URL`, `XTROUTER_MODEL`, `OPENROUTER_MODEL`, `UNOROUTER_MODELS`, `GEMINI_BASE_URL` (default doc `env.ts:24`), `GEMINI_FLASH_MODELS`, `GEMINI_LITE_MODELS` (default lists `env.ts:28,30`), `GROQ_*` (env.ts), `APP_TIMEZONE`, `SEARXNG_URL`
- CU/E2B + deploy: `E2B_API_KEY`, `CU_E2B_TEMPLATE`, `CU_PUBLIC_URL`, `CU_GITHUB_TOKEN`, `CU_VERCEL_TOKEN`
- Test-hooks (Task-1): `XMD_TEST_HOOKS`, `XMD_TEST_SECRET` (set kwenye Koyeb, sio `.env.local`)
- Deploy/time-reg/noise: `NEXT_TELEMETRY_DISABLED`

## I. Open items — maelezo.md §17 (jibu kwa kila kimoja)
1. Wahusika/majukumu → **IMEJIBIWA** (A).
2. Agenda kuongezwa mid-run → **IMEJIBIWA: HAPANA** (B.2).
3. XKiro/Flash-lite vision → **IMEJIBIWA: ZOTE zinakubali picha** (F.4).
4. `zod` ipo? → **IMEJIBIWA: HAPANA** (G).
5. Wapi kuongeza matukio ya milestone/raundi? → **IMEJIBIWA** (E.3).
6. E2B persistence/lifetime/mirror → **IMEJIBIWA** (C.7-8).
7. miniReport iko wapi/params → **IMEJIBIWA** (B.5; `src/lib/miniReport.ts:137`).
8. Playwright sandbox? → **IMEJIBIWA: IPO ndani ya sandbox** (G; `cu/setup.sh`).
9. Maamuzi ya mmiliki `[PENDEKEZO]` (5) → **sio open — ni provisional decisions tayari**: reviewers technical/mixed 2-3 by Optimus; minor defects zinaweza kubaki (si medium+); mjadala wa timu ukiwa kwa mlolongo wa hukumu; harness ifanye push/deploy (12.6); kipimo cha muda tuil. Hivyo **hakuna kitu cha kuweka QUESTIONS.md hapa** — kanuni ya maelezo0: hakikisho tu, sio mapendekezo yangu.
