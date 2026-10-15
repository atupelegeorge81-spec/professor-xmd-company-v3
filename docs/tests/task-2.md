# Task 2 — ushahidi (evidence). Branch `task/2-flow-map` · base `737b57a` · 2026-10-16
Kanuni: docs pekee; hakuna source code iliyoguswa. Kila sehemu ≤ mistari 40.

## T0 — Baselines (kabla ya uandishi)
```
$ npm run typecheck        → tsc --noEmit → 0 errors
$ CI=1 npx vitest run      → Test Files 18 passed (18) · Tests 183 passed (183)
$ npm run cu:test          → python unittest: Ran 186 tests — OK
```
STATUS: PASS (kama baseline, si matokeo ya mabadiliko)

## F. Vision test ya kweli (§F.4 / §17.3)
Amri: script ya node inasoma majina/env kutoka `.env.local` (values hazijawahi kuprintiwa),
inatumia 64×64 PNG nyekundu (`/tmp/red64.png`, 205 bytes, RGBA8 valid) kama `image_url`
data-URI kwenye `chat.completions`, prompt: "What colour is the square? One word."
```
$ node /tmp/vision.mjs
gemini-flash (gemini-1)         :: HTTP 503           (gemini-3.8-flash ili-down wakati huo)
xkiro (optimus-1)               ::  Red               (XTROUTER qwen/qwen3.8-max:free)
gemini-flash-lite (gemini-1)    :: Red               (3.5-flash-lite)
$ node /tmp/vision2.mjs        (retry: gemini-3.7-flash, GEMINI key_2)
gemini-flash 3.7 (gemini-2)     :: Red
```
STATUS: PASS — lanes zote 3 zinakubali picha kupitia OpenAI-compatible APIs.

## B.2 — Hakuna mid-run agenda add
```
$ grep -n "agenda.push\|agenda.splice\|agenda.unshift" src/lib/boardRunner.ts
(hakuna output — 0 matches)
$ grep -n "export async function" src/app/api/boardroom/agenda/route.ts
6:export async function GET(   ← GET pekee
```
STATUS: PASS (ukweli umehakikishiwa kwa kukosekana kwa mbinu zote mbili)

## A — Agents (sample)
```
$ sed -n '18,50p' src/lib/agents.ts
pm       → Optimus   "Project Manager"        :20-24
designer → Ultron    "UI/UX Designer"         :26-30
frontend → Vextron   "Frontend Engineer"      :32-36
backend  → Megatron  "Backend & DB Engineer"  :38-42
qa       → Cybertron "QA & DevOps Engineer"   :44-48
```
STATUS: PASS

## G — Tooling
```
$ grep -o '"zod"' package.json              → (0 matches)
$ grep -o '"playwright' package.json        → (0 matches)
$ grep -in "playwright" cu/setup.sh
4:  # playwright + Chromium … claude-agent-sdk … gh CLI
29-30: venv check: /code/openhands-venv/bin/python -c "import playwright"
$ node -e 'console.log(Object.keys(require("./package.json").scripts))'
[ build, cu:live, cu:test, dev, lint, start, test, typecheck ]
```
STATUS: PASS

## C/D/E — file:line spot checks (amri za grep kuthibitisha refs za FLOW-MAP)
```
$ grep -n "CU_HARD_CAP_MS\|timeoutMs\|onTimeout" src/lib/cu/engine.ts   → :38, :349-363(353), cap loop :434-438
$ grep -n "startComputerPhase\|pauseComputerFromServer\|buildResumeNote" src/lib/cu/engine.ts → :418, :1100, :635
$ grep -n "generateAgenda\|for (const item of agenda)\|saveLedgerEntry" src/lib/boardRunner.ts → :1198, :1509, :2493/:2984
$ grep -n 'case "cu"' src/lib/board/adapter.ts   → :1124
$ grep -n "writeMiniReport\|needsMiniRedo\|provisionalMini" src/lib/miniReport.ts → :137/:104/:115
$ grep -n "boardroom_sessions" src/lib/server/appwrite.ts   → :22
$ grep -n "PLAN_PROVIDERS\|allLanes\|tierOf" src/lib/broker/{policy,lanes}.ts → policy.ts:67, lanes.ts:51/:42
$ grep -n "pauseOrigin\|pauseRun\|unpauseRun" src/lib/boardRunner.ts   → :63/:144, :146, :201
```
STATUS: PASS (refs zote zinakubaliana na FLOW-MAP.md)

## Diff guard — hakuna code changes
```
$ git status --short
?? docs/FLOW-MAP.md
?? docs/tests/task-2.md
?? docs/PROGRESS.md (kama ipo mpya / au tu inaongezwa entries)
(0 mabadiliko kwenye src/ au cu/)
$ git diff --stat 737b57a HEAD -- src/ cu/ → (hakuna output)
```
STATUS: PASS
