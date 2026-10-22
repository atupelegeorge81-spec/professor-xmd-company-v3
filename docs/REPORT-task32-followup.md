# REPORT — T32 follow-up (maswali 5 ya CEO) · Task 35 · 2026-10-22

- **Branch:** `task/35-t32-followup` (kutoka main `6694cf4`). Commits: `3854ea6` (pointi 1), `ea02872` (pointi 1, false positive ya "none (…)"), na commit ya ripoti hii.
- **Haijaunganishwa na main na HAIJA-deploy.** `XMD_MILESTONES` bado iko OFF kwenye production: Koyeb `a0f448ea` haina key hiyo (pointi 5).
- **Baselines:**

  | Kipimo | Kabla (`6694cf4`) | Baada |
  |---|---|---|
  | tsc | 0 | 0 |
  | vitest | 828 + 2 skipped (faili 58) | **838** + 2 skipped (faili 59) |
  | eslint | 29 | 29 |
  | pytest `cu/tests` | — | 346 + 3 skipped |

- **Usafi:**
  - session ya majaribio `3a211744` (`xmdtest-flagoff`) imefutwa, pamoja na project_plans na snapshot 1 ya bucket;
  - sandboxes `if3pxir535gzg0yjrxbox` na `imy1bjs2w9xtysd9je9q8` zimeuawa (sandboxes zinazoendelea sasa: 0).
- **Ruhusa zinazohitajika:** maswali 5 yako kwenye `QUESTIONS.md` (sehemu ya "TASK 35"). Bug ya metering HAIJAREKEBISHWA.
- **Artifacts** (kwenye workspace, si repo): `xmdtest/f1/` — `plans/*`, `probe-manifest.txt`, `baseline-0591e0a3.json`, `after-3a211744.json`, `streamOFF.sse`, scripts `genplans.mts`, `extract.mts`, `kinds.mjs`, `cost_tables.py`.

---

## 1. Chanzo cha M1/M4 BLOCKED: block ya uwezo wa sandbox + preflight ya `command -v`

**Verdict:** PARTIAL kabla ya task hii. (a) ilikuwepo kwa sentensi moja tu ya §4, bila Supabase-HTTPS wala `xmdtest_`. (b) haikuwepo kabisa: kulikuwa na regex ya Docker/Postgres kwa Build/Test tu. Sasa (a) na (b) zimetekelezwa kwenye branch.

**Ushahidi (kabla):** `git show 6694cf4:src/lib/milestone/plan.ts | grep -n "SANDBOX_UNAVAILABLE_RE\|Both commands run INSIDE\|command -v\|PLAN_REPAIR_MAX = "`
```
55:export const SANDBOX_UNAVAILABLE_RE = /\b(?:docker(?:-compose)?|podman|supabase\s+(?:start|stop|status|test|db\s+(?:reset|start|test|lint|push|diff
107:    const hit = cmd ? cmd.match(SANDBOX_UNAVAILABLE_RE) : null;          ← Build/Test PEKEE
236:Both commands run INSIDE the build sandbox: Linux with Node/npm and Python only — NO Docker, NO local Postgres/database server, so never `supab
275:export const PLAN_REPAIR_MAX = 2;
```
Hakuna mstari wenye `command -v`. Checks za aina `command`, pamoja na mistari ya Start/Lint/Typecheck/Migration, hazikukaguliwa kabisa.

**Chanzo halisi** (kutoka plans za production, pointi 2):
- `pnpm` ilikuwa kwenye plans 5/15 (amri 28);
- `supabase test db` ilikuwa kwenye E5-M1 (`docs/tests/task-32.md:28`);
- `vercel` ilikuwa kwenye E8-M4 (amri 2).

Hakuna kati ya hizi kilichopo kwenye sandbox. Uamuzi wa Ledger ya E8 (A1, LOCKED) ulikuwa "Next.js 15+, Tailwind v4, **pnpm**".

**Probe ya sandbox halisi** (template `professor-xmd-browser-v3`): `command -v` kwa binaries 96 → `xmdtest/f1/probe-manifest.txt`
```
OK 53: bash sh node npm npx python3 python pip pip3 git curl wget jq sed awk grep find xargs tar gzip make gcc g++ test sleep timeout
       cat ls mkdir rm cp mv chmod touch head tail wc sort uniq diff env tee date du kill ps ss which openssl sha256sum base64 ssh playwright
MISSING (mfano): pnpm yarn bun docker docker-compose podman psql pg_ctl pg_prove postgres supabase vercel tsc eslint prettier vitest jest next vite serve
node v20.20.2 · npm 10.8.2 · Python 3.12.14 · PATH=/usr/local/bin:/usr/bin:/bin   (/home/user/node_modules/.bin haipo)
```

**Ugunduzi wa ziada.** Sandbox ya build **haipokei credentials zozote za Supabase**: `src/lib/cu/engine.ts:447-485` haina `SUPABASE_*`/`XMD_PROJECT_SUPABASE_*`. Checks za `db` zinaendeshwa nje ya sandbox kupitia `src/lib/milestone/dbProbe.ts:34-35`. Kwa hiyo block ya uwezo inasema ukweli huu (DB inafikiwa na harness kupitia HTTPS, na tables zina kiambishi `xmdtest_`), na haiahidi DB ndani ya sandbox. Swali kuhusu hili liko kwenye `QUESTIONS.md` #2.

**Utekelezaji:** branch `task/35-t32-followup`, commits `3854ea6` + `ea02872`. Faili ni `src/lib/milestone/plan.ts` (+108/−9) na tests mbili.

| Nini | Wapi (`plan.ts`) |
|---|---|
| `SANDBOX_BIN_MANIFEST` (binaries 53 zilizothibitishwa kwenye probe) | :61 |
| (a) `SANDBOX_CAPABILITIES`: Node/npm/Python; HAKUNA Docker/Postgres/psql/Supabase CLI/Vercel/pnpm/yarn; zana za npm kupitia `npm run`/`npx`; DB = Supabase halisi kupitia HTTPS (harness) na tables `xmdtest_`; "kila amri inapitiwa kwa `command -v`" | :69 |
| Block hiyo inaingia kwenye prompt ya PART 1, PART 2, marekebisho ya PART 1 (ndani ya `task(1)`) na marekebisho ya PART 2 | :401, :447 |
| `commandBinaries`: neno la kwanza la kila kipande (`&&`, `\|\|`, `;`, `\|`, `&`, `( )`), bila quotes; inaruka builtins, njia, `VAR=`, sudo/env/timeout | :84 |
| `preflightError`: inatoa sababu kamili, kwa mfano "`pnpm` (command -v pnpm → not found)" | :120 |
| Preflight ya Build/Test (§4) | :184 |
| Preflight ya kila check ya aina `command` (§6) | :219 |
| Preflight ya Start/Lint/Typecheck/Migration (§7) | :246 |
| Mstari "none (maelezo)" hauhesabiwi kama amri. Plan halisi ya E6-M3 ilisema "none (Supabase CLI not assumed available)" | :132 |
| **Hadi marudio 3** (`PREFLIGHT_REPAIR_MAX`) kwa makosa ya preflight; makosa mengine yanabaki 2 | :78, :425 |
| Log ya `🧰 Preflight Mk: amri N hazipo … (jaribio i/3): <bins>` | :429 |
| Yakibaki baada ya marudio 3: `structure_failed` na `executable=false`. Kosa linabaki kwenye `problems`; **halitupwi kimya kimya** | — |

**Tests:**
- `src/lib/milestone/__tests__/plan.preflight.test.ts` (tests 11):
  - parsing ya binaries;
  - manifest halisi;
  - kila mahali amri inapotokea (§4, §6, §7);
  - "none (…)" haikataliwi;
  - `localhost:5432` inakataliwa;
  - block iko kwenye prompts zote 3;
  - sababu inarudishwa kwa Optimus;
  - **marudio 3 hasa, kisha `structure_failed`**;
  - makosa yasiyo ya preflight bado yana kikomo cha 2.
- `plan.test.ts`: assertion 1 ya ujumbe wa zamani imesasishwa; tabia ni ileile (`supabase test db` bado inakataliwa).
- `npx vitest run src/lib/milestone/__tests__/plan` → `Test Files 2 passed · Tests 30 passed (30)`

**Namba:**
- Preflight ya static ingekataa plans **6/15** za production (amri **29/105**).
- Kwenye plans 5 mpya, amri zisizowezekana ni **0** (pointi 2).
- Diff ni mistari +247/−9.

---

## 2. Plans 5 halisi + kila amri ikiendeshwa kwenye sandbox halisi

**Verdict:** MISSING kabla ya ripoti hii (haikuwahi kufanywa). Sasa imefanyika.

**Mbinu:**
- **Inputs halisi za T32:** ramani ya milestones ya E8/E5 (`map`), ledger iliyosomwa neno kwa neno kutoka §9 ya plans za production (entries 5/2/6/3/3), na brief ya portfolio (`xmdtest/t32/brief.json`).
- **Kuzalisha plans:** `generateMilestonePlan` halisi, LLM halisi (`gemini-3.5-flash-lite`). Matoleo mawili, kila moja na inputs zilezile:
  - **old** = `plan.ts` ya `6694cf4`: wito 13, tokens in 39K / out 29K;
  - **new** = `plan.ts` ya branch: wito 12, tokens in 42K / out 27K.
- **Kuendesha amri:** amri **zote** za plans 25 (15 za production + 5 old + 5 new; amri 73 za kipekee) ziliendeshwa kwenye sandbox ya E2B `professor-xmd-browser-v3`:
  - PATH ileile ya bridge, folda tupu kwa kila amri, timeout 25s;
  - **"impossible"** = shell inasema `<bin>: command not found` (amri inayoanguka kwa sababu mradi haujajengwa haihesabiwi).
- **Mipaka ya mbinu:**
  - system prompt ni fupi kuliko OCB halisi ya Optimus;
  - mini-reports zimebadilishwa na muhtasari wa ledger (mini-reports zenyewe zilifutwa pamoja na sessions za T32);
  - n=5, na LLM si deterministic.

**Ushahidi.** `npx tsx xmdtest/f1/extract.mts` na runner ya sandbox (`plans/exec-results.json`), muhtasari:
```
exit codes Counter({1: 31, 127: 19, 254: 10, 0: 7, 2: 4, 9: 1, 7: 1})        ← amri 73 za kipekee
static preflight vs real exec agreement 140 / 143
mismatches: 3 × "pnpm dev & sleep 5 && curl … | grep …"  ← pnpm haipo; kosa limo kwenye output lakini si mstari wa mwisho (background)
prod plans 15 cmds 105 impossible 26(+3 background = 29) plans with ≥1 6
old  plans  5 cmds  20 impossible 8                       plans with ≥1 2
new  plans  5 cmds  18 impossible 0                       plans with ≥1 0
```

**Jedwali: ulinganisho unaodhibitiwa (inputs zilezile, model ileile).**

| Plan # | Milestone (mode) | BEFORE (prompt ya zamani): amri / impossible / zipi | AFTER (block + preflight): amri / impossible | Status before → after |
|---|---|---|---|---|
| 1 | E8-M1 (visual) | 2 / **2** / `pnpm build` (Build), `pnpm build && pnpm start -- -p 4173` (Start) | 4 / **0** (`npm run build`, `npm test`, …) | active → structure_failed¹ |
| 2 | E8-M2 (visual) | 2 / 0 | 2 / 0 | active → active |
| 3 | E8-M3 (mixed) | 5 / 0 | 5 / 0 | active → active |
| 4 | E8-M4 (technical) | 6 / **6** / `pnpm build`, `pnpm test:e2e`, `pnpm start --port 4173`, Lint, Typecheck, check M4-S6-a (zote `pnpm`) | 3 / **0** (`npm run build`, `npx playwright test`) | structure_failed¹ → structure_failed¹ |
| 5 | E5-M1 (mixed) | 5 / 0 | 4 / 0 | active → active |
| **Jumla** | | **20 / 8 (plans 2/5)** | **18 / 0 (plans 0/5)** | |

¹ Sababu za `structure_failed` hazihusiani na preflight:
- "sehemu 8 (Agent Rules) haipo" na "hatua 6 < ndogo ya 8" zinatoka `assemblePlanDocument`, na **haziingii kwenye loop ya marekebisho**. Hii ni kasoro iliyokuwepo kabla ya T35 (`QUESTIONS.md` #4).
- Plan "old" E8-M1 ilikuwa `active`, yaani ingetekelezwa, ingawa ina `pnpm` → ingeanguka kwenye gate kwa exit 127.

**Jedwali: plans 15 za production za T32 (before, amri halisi zilizoendeshwa).**

| Plan | Amri | Impossible | Zipi |
|---|---|---|---|
| E5-M1 | 4 | **1** | `supabase test db` (Test Command) → hii ndiyo M1 BLOCKED ya E5 |
| E5-M2 | 13 | **8** | `pnpm` (Build, Start, checks 6) |
| E5-M4 | 7 | **7** | `pnpm` (Build, Test, checks 5) |
| E8-M1 | 1 | **1** | `pnpm` (Start Command) |
| E8-M3 | 14 | **3** | `pnpm` (Start, checks 2) |
| E8-M4 | 14 | **9** | `pnpm` ×7 (Build/Test/Start/Lint/Typecheck/Migration/check), `vercel env ls …` ×2 |
| E5-M3, E6-M1..M4, E7-M1..M3, E8-M2 | 52 | 0 | — |
| **Jumla** | **105** | **29 (plans 6/15)** | `pnpm` 26 · `vercel` 2 · `supabase` 1 |

**Tahadhari.** Plan mpya E8-M1 iliandika `npm` ingawa ledger A1 (LOCKED) ilisema `pnpm`. Ni sahihi kwa sandbox, lakini ni mkengeuko kutoka uamuzi wa Board (`QUESTIONS.md` #3: chaguo ni kuweka `corepack`/pnpm kwenye template, au kuijulisha Board uwezo wa sandbox wakati wa agenda).

**Namba:** impossible kwa kila plan: production 1.93 (29/15) · old 1.6 (8/5) · new **0** (0/5). Preflight ya static ililingana na utekelezaji halisi kwa 143/143 baada ya kuhesabu zile 3 za background. Kwenye plans 5 mpya, preflight haikuhitaji kurudisha plan hata mara moja (log za 🧰 = 0), kwa sababu block (a) peke yake ilizuia amri hizo.

---

## 3. Gharama ya req 3,492 / tokens ~1.02B

**Verdict:** EXISTS (data ipo), lakini **namba iliyoripotiwa ya Computer imepandishwa ×6–8.9 na bug ya metering.** Halisi ni **≈129M**, si 1.02B. Bug hii HAIJAREKEBISHWA; ruhusa imeombwa kwenye `QUESTIONS.md` #1.

**Ushahidi wa bug:**
- `cu/oh_util.py:167-169` (`extract_usage`) inasoma `resp.metrics` → `metrics.accumulated_token_usage`.
- Kwenye SDK 1.46 (`openhands/sdk/llm/utils/metrics.py:217-220`, `accumulated_token_usage = … + new_usage`), hiyo ni **jumla inayojilimbikiza kwa kila LLM instance (lane)**.
- Thamani hiyo inapita `cu/oh_router.py:186-192` → `cu/oh_bridge.py:250-256` (tukio la `usage`) → UI/cost.
- Pia inaingia kwenye `cu/lanes.py:286-291`, lakini huko ni meter tu; **haizuii lanes**, kwa hiyo haibadilishi routing.

Uzalishaji upya kwenye sandbox halisi (prompts halisi za 25K/26K/27K):
```
call 1 real prompt 25000 → extract_usage (25000, 300)
call 2 real prompt 26000 → extract_usage (51000, 500)     ← 25000+26000
call 3 real prompt 27000 → extract_usage (78000, 650)     ← jumla inayojilimbikiza
streams: per-lane prompt non-decreasing 214/214; drops ONLY at lane switches
```

**Jedwali A: kwa provider / lane** (T32 nzima; "true" = tofauti ndani ya kila lane, kutoka streams E1+E2+E5 zenye wito 480).

| Lane · provider | Req | Reported | Uwiano (streams) | True in (est.) | True out (est.) | Cached |
|---|---|---|---|---|---|---|
| Computer · gemini | 2,671 | 791.0M | 7.9× | **≈99.4M** | ≈1.07M | haijarekodiwa² |
| Computer · unorouter | 661 | 198.7M | 8.2× | ≈24.0M | ≈0.21M | haijarekodiwa² |
| Computer · openrouter | 160 | 34.3M | 7.4× | ≈4.6M | ≈0.03M | haijarekodiwa² |
| **Computer jumla** | **3,492** | **1,023.9M** | 7.9× | **≈128M** | **≈1.3M** | — |
| Judges · gemini-flash-lite (exact, `lanesUsed`) | 48 | — | 1× | 1.467M | 42.4K (+32.6K reasoning) | haijarekodiwa |
| Judges · gemini-flash | 24 | — | 1× | 0.552M | 41.5K (+118K reasoning) | haijarekodiwa |
| Judges · xkiro | 10 | — | 1× | 0.164M | 14.2K | haijarekodiwa |
| **Judges jumla** | **82** | 2.18M | 1× | **2.18M** | **98.1K** | — |
| Board agents (exact, mf. E1: pm 37 req 128K/19.5K · designer 16 req 124K/4.3K · frontend 13 req 87K/3.8K) | ~66 kwa kila run | — | 1× | ≈0.34M kwa kila run (≈2–3M kwa runs 8, est.) | ≈28K kwa kila run | haijarekodiwa |

² SDK `TokenUsage` ina `cache_read_tokens`, `cache_write_tokens` na `reasoning_tokens`, lakini `extract_usage` inarudisha `(prompt, completion)` tu, kwa hiyo cached zinatupwa. Hakuna chanzo kingine chenye cached.

Uwiano kwa kila stream:

| Stream | Wito | Lanes | Reported | True | Uwiano |
|---|---|---|---|---|---|
| E1 | 236 | 22 | 73.9M | 9.04M | 8.2× |
| E2 | 100 | 14 | 23.7M | 3.95M | 6.0× |
| E5 | 144 | 16 | 42.1M | 4.75M | 8.9× |

E6–E8 zina jumla tu (hakuna stream), kwa hiyo ≈129M ni makadirio, na safu ni 115–171M. Hata baada ya marekebisho, **Computer ni ≈97% ya tokens zote.**

**Jedwali B: context kwa kila wito, run MOJA ya Computer (E1 M1, wito 236), kila wito wa 10.**

| Wito | Dak. | Model | Reported | **TRUE prompt** | TRUE completion |
|---|---|---|---|---|---|
| 1 | 1.1 | g3-flash-prev | 24,608 | 24,608 | 962 |
| 11 | 5.6 | g3.5-lite | 59,313 | 33,717 | 141 |
| 21 | 6.7 | g3.5-lite | 64,369 | 38,396 | 503 |
| 31 | 9.2 | g3.5-lite | 135,520 | 29,175 | 120 |
| 41 | 10.7 | g3.5-lite | 198,568 | 31,927 | 210 |
| 51 | 14.5 | g3.5-lite | 233,973 | 35,405 | 273 |
| 61 | 15.8 | g3.1-lite-prev | 41,312 | 41,312 | 885 |
| 71 | 17.0 | g3.1-lite-prev | 103,302 | 37,095 | 168 |
| 81 | 19.1 | g3.1-lite-prev | 157,163 | 40,144 | 252 |
| 91 | 20.0 | g3-flash-prev | 78,388 | 45,776 | 47 |
| 101 | 21.6 | nemotron-ultra | 93,112 | 28,659 | 74 |
| 111 | 24.2 | g3.5-lite | 276,272 | 33,187 | 42 |
| 121 | 27.3 | nemotron-ultra | 358,519 | 34,314 | 114 |
| 131 | 29.4 | g3.1-lite-prev | 349,148 | 44,150 | 2,641 |
| 141 | 31.9 | g3.1-lite | 354,358 | 44,365 | 698 |
| 151 | 33.9 | nemotron-ultra | 383,758 | 34,457 | 64 |
| 161 | 35.8 | g3.1-lite-prev | 407,638 | 42,758 | 169 |
| 171 | 37.4 | nemotron-ultra | 516,201 | 34,473 | 439 |
| 181 | 38.6 | g3.5-lite | 489,620 | 39,738 | 478 |
| 191 | 40.8 | g3.5-lite | 565,975 | 32,684 | 102 |
| 201 | 43.3 | g3.5-lite | 595,904 | 43,745 | 542 |
| 211 | 45.1 | minimax | 693,379 | 37,257 | 493 |
| 221 | 46.6 | g3.1-lite | 586,977 | 47,198 | 276 |
| 231 | 49.1 | nemotron-3.5-lightning | 137,717 | 137,717³ | 876 |

True: wastani 37,948 · wito wa kwanza 24,608 · upeo 137,717. Jumla halisi ya run: prompt 8.96M / completion 0.081M.

³ Wito wa kwanza wa lane mpya ya `nemotron-3.5-lightning`, dakika 49. Inaelekea ni lane inayoshirikiwa na fallback ya judge; haijathibitishwa.

**Jedwali C: vipengele 5 vikubwa vya prompt** (E1 M1; vipimo ni chars za matukio `exec_end`, think na tool-args kwenye `streamE.sse`).

| # | Kipengele | Kipimo | Sehemu ya prompt halisi 8.96M |
|---|---|---|---|
| 1 | **Kichwa kisichobadilika kinachotumwa kila wito**: system prompt ya OpenHands, schemas za tools 3, xmd-law (1,731 chars), na StartPack/task yenye plan ya M1 (**44,612 chars ≈ 11K tokens**) | wito wa kwanza = **24,608 tokens** × 236 | **≈5.81M ≈ 65%** |
| 2 | Thoughts zinazobaki kwenye historia | think 176 · **114,383 chars** (≈28.6K tok) | kila kipengele cha historia kinatumwa tena kila wito hadi kifupishwe → ≈35% kwa pamoja (#2–#5) |
| 3 | Matokeo ya `read_file` | reads 27 · **105,242 chars**; **`feature_list.json` ilisomwa mara 11 = 89,816 chars (85%)** | ↑ |
| 4 | Matokeo ya `bash` | 114 · **96,059 chars**; moja la juu = 30,000 chars (kikomo) | ↑ |
| 5 | Edits/writes: matokeo ya edit (47,518) pamoja na args za wito wa tools (edit 26,136 · write 21,030 · bash 11,325) | **≈106K chars** (≈26.5K tok) | ↑ |

Mgawanyo wa ndani wa #1: plan ni ≈11K na xmd-law ≈0.4K. Salio la ≈13K (system prompt ya SDK, tool schemas, sehemu nyingine za StartPack) **halikutenganishwa**: SDK haitoi system prompt bila conversation hai, na sikubuni namba.

**Mengineyo:**
- **Condenser:** `XMD_CONDENSE_MAX` haipo kwenye Koyeb, kwa hiyo default ni 60 (`cu/oh_bridge.py:446`). `LLMSummarizingCondenser(max_size=60, keep_first=2)` iko `:451`.
  - Inahesabu **idadi ya events**, si tokens.
  - Haitoi tukio lolote: neno "condens" lina 0 hits kwenye streams, kwa hiyo ukubwa wa summary haupimiki.
  - Context halisi inabaki 29–47K, hivyo condenser inaidhibiti.
- **Faili kubwa zinazorudiwa:** `feature_list.json` ×11 (89,816 chars), `.xmd/reports/M1-build-report.md` ×3 (6,801), `globals.css` ×2, `tailwind.config.ts` ×2.
- **Screenshots HAZIMO kwenye context ya LLM:** tools ni `terminal`, `file_editor` na `task_tracker` tu, na `BrowserToolSet` haitumiki (`cu/oh_bridge.py:171-179`). Shots 18 za E1 zinaenda UI pekee.
- **Kwa nini gharama ni kubwa (bila kurekebisha):**
  1. Idadi ya wito (3,492) × kichwa cha ~25K. Plan nzima iko kwenye StartPack ya kila wito.
  2. Lanes kubadilishwa mara 22 ndani ya wito 236 (E1), kwa hiyo cache yoyote ya prefix (Gemini implicit caching ni kwa model/key moja) inapotea.
  3. Kusoma `feature_list.json` tena na tena.
  4. Matokeo ya bash hadi 30K chars.

**Namba:** halisi ≈129M (≈37K kwa wito) dhidi ya 1.02B iliyoripotiwa; judges 2.18M in / 98K out (exact).

---

## 4. Regression ya flag-OFF baada ya refactor ya `discussAgenda` (T24 `b27c707`/`ae6408e`)

**Verdict:** MISSING kabla ya ripoti hii: ulinganisho wa flag-OFF haukufanywa baada ya refactor (`docs/tests/task-24.md` ina 0 hits za "flag OFF"). **Sasa run halisi imefanyika: hakuna regression kwenye kiwango cha event-kinds**, pamoja na mipaka iliyoelezwa chini.

**Run:**
- Koyeb main `6694cf4` (deploy `a0f448ea`), 2026-10-22 08:21–08:40 UTC. Session `3a211744`, prompt `xmdtest-flagoff: Create a modern log in and sign up page Make only 4 agenda`, bila tag `[xmdtest:…]`, kwa hiyo flag iko OFF.
- Ilifika mwanzo wa Computer ya legacy, kisha **niliisimamisha** (Detach) ili isichome tokens. Baseline haina awamu ya Computer ya kulinganisha.
- Kisha ilifutwa.

**Ushahidi.** `node xmdtest/runsig.mjs <sid>` (signature ileile iliyotumika T12) pamoja na `kinds.mjs`/SSE:
```
{"status":"paused","mode":"code","kinds":["chip","cu","msg","title"],
 "hiddenChips":["__PROFESSOR_XMD_CU_STATE__","__PROFESSOR_XMD_RESUME_STATE__","__PROFESSOR_XMD_USAGE__"],"milestoneChips":0, …}
SSE prefix to first round: mode system log sync usage usage_provider title_done system log system usage usage_provider … log round
SSE kinds before Computer (19): activity log memory mode msg_done msg_start report round search skill_tag sources sync system think
                                title_done token usage usage_live usage_provider
Agenda grammar A1..A4: …owner/pm turns > LOCKED > …   (4/4 LOCKED, hakuna agenda ya REVIEW "R-M…")
tail: plan > plan > plan > report > report > consensus > chip:computer > cu:run_start
```

| Kipimo | Baseline iliyoandikwa (T12 B2 / T14 `runT13c` / T15 T5, kabla ya T24) | Sasa (`3a211744`) | Matokeo |
|---|---|---|---|
| Item kinds | [chip, cu, msg, title] | [chip, cu, msg, title] | ✅ sawa |
| Hidden chips | 3 | 3 (CU_STATE, RESUME_STATE, USAGE) | ✅ |
| Milestone chips / `msMap` / OCB | 0 | 0 | ✅ flag OFF inaheshimiwa |
| Awamu | agenda×N (LOCKED) → Mpango Kazi vipande → ripoti → Computer | agenda×4 (LOCKED 4) → plan×3 → report×2 → consensus → Computer `run_start` | ✅ mpangilio uleule |
| Kinds za SSE hadi finale | 18 (T14) | 19 | ⚠ tofauti ya 1. **Kinds zote 19 zilikuwepo kabla ya T24**: `git log -S'type: "<kind>"'` inaonyesha ya karibuni kabisa ni 09-28 (`8231e93`) au mapema zaidi. Kind ipi ilikosekana mwaka T14 haijulikani, kwa sababu orodha ghafi haikuhifadhiwa (sheria ya "hakuna .log") |
| Prefix hadi `round` ya kwanza | `mode system log title_done system log … round` | ileile, pamoja na `sync` / `usage` / `usage_provider` | ⚠ kinds hizi zipo tangu 09-28; zinategemea muda wa wito wa LLM (T12 ilieleza "A2 ≠ B2 kwenye code ileile") |

**Mipaka:**
- Session pekee iliyohifadhiwa ya flag-OFF ya kabla ya refactor, `0591e0a3` (10-13), ina `msMap`/`msStart`. Lakini commit ya wakati huo, `46d27c1`, **haitoi `msMap` kabisa**. Kwa hiyo session hiyo ilizalishwa na code nyingine (kuna uwezekano mkubwa ilikuwa server ya Render inayoshiriki Supabase, D10), na **haikutumika kama baseline**.
- Ulinganisho ni dhidi ya signature zilizoandikwa kwenye task-12/14/15, si dhidi ya mfuatano ghafi kamili.

**Namba:** items 95; agenda 4/4 LOCKED; msg 39; milestone chips 0; kinds mpya za SSE baada ya T24: **0**.

---

## 5. Je, kulikuwa na deploy wakati run inaendelea?

**Verdict:** EXISTS. Ndiyo, ukiukaji ulitokea:
- **4 wakati kazi ilikuwa hai** (E6 ×1, E7 ×3);
- **5 wakati E2 ilikuwa wazi lakini imekwama**;
- 1 ya makusudi (Recovery test).

Leo hakuna ukiukaji.

**Ushahidi:**
- `GET https://app.koyeb.com/v1/deployments?service_id=8867b9a0…&limit=100` (deployments 100, kuanzia 10-16);
- madirisha ya runs kutoka `xmdtest/t32/evidence/E*.json` (`created_at`/`updated_at`);
- muda wa hatua kutoka `state:Mk.steps` kwenye `E*.records.json`;
- `xmdtest/t32/notes.md`.
```
2026-10-21T03:47:17 1cd636e3 d9b03e2   ← E6 M4.R0.build RUNNING (tangu 03:29:38) → SIGTERM 03:50:56 (notes.md:14)
2026-10-21T05:55:01 bcfaf419 9a56649   ← E7 M1.R0.build RUNNING (→06:52:11) + M2.R0.build RUNNING (→09:24:45)
2026-10-21T07:49:46 7a723243 213ada5   ← E7 M2.R0.build RUNNING (→09:24:45)
2026-10-21T09:57:01 e8cf5a16 d69a1b8   ← E7 M3.R0.plan RUNNING (09:45:12 → FAILED 09:57:55)
2026-10-22T07:24:27 8ee22290 ee6acdd   ← boardroom_sessions updated_at ≥ 10-21 21:00 = [] (session ya mwisho ilisasishwa 10-13)
2026-10-22T07:46:11 a0f448ea 6694cf4   ← vivyo hivyo; hakuna run
```

| Deploy (UTC) | Id · sha | Run | Hali wakati huo | Uamuzi |
|---|---|---|---|---|
| 10-20 11:52:13 | 19cdb1b7 · b076e98 | E1 | E1 ilikuwa paused tangu 11:51:01 | ✅ baada ya run |
| 10-20 12:40:50 | 5d9478b6 · b076e98 (redeploy) | E2 | M1 review RUNNING | ⚪ ya makusudi: Recovery test (`task-32.md:86`) |
| 10-20 12:59:40 / 13:10:19 / 13:23:59 | 13b2fa12 · 6b8f1a0 / 45f71d61 · 14967ee / 9b5566c8 · f709bef | E2 | M1 `REVIEW_R0` imekwama: hakuna hatua tangu 12:44:01. Fixes 2–4 zilikuwa za kuiokoa | ❌ run wazi (herufi ya sheria) |
| 10-20 14:04:11 / 14:19:19 | 3656ca87 · 34b8bfc / e462c73e · 9417c8b | E2 (E3/E4 zilikuwa zimeisha 14:03:16 / 14:18:26) | E2 bado wazi na imekwama | ❌ run wazi (herufi ya sheria) |
| 10-20 20:18:45 | 0482fc8f · 126a7de | E5 | paused 20:18:30 (`notes.md:6`) | ✅ |
| 10-20 22:50:43 | e1f7c829 · bdb8713 | E6 | Detach 21:07:50 (`notes.md:5`); resume baada ya deploy | ✅ ilikuwa paused |
| **10-21 03:47:17** | 1cd636e3 · d9b03e2 (Fix 11) | **E6** | **M4 build RUNNING** → SIGTERM 03:50:56 → E6 ikachukuliwa na Render → "completed" ya uongo (Fix 12) | ❌ **UKIUKAJI** |
| 10-21 04:16:12 | 8ec092a9 · 63a1afe | — | E6 iliisha 03:53:41; E7 ilianza 04:20:08 | ✅ |
| **10-21 05:55:01** | bcfaf419 · 9a56649 | **E7** | **M1 build + M2 build RUNNING** | ❌ **UKIUKAJI** |
| **10-21 07:49:46** | 7a723243 · 213ada5 | **E7** | **M2 build RUNNING** | ❌ **UKIUKAJI** |
| **10-21 09:57:01** | e8cf5a16 · d69a1b8 | **E7** | **M3 plan RUNNING** (FAILED sekunde 54 baadaye) | ❌ **UKIUKAJI** |
| 10-21 22:17:17 | 06fc3609 · d45f4a0 | — | E8 iliisha 21:57:08 | ✅ |
| 10-22 07:24:27 / 07:46:11 | 8ee22290 · ee6acdd / a0f448ea · 6694cf4 | — | hakuna session hai (DB) | ✅ |
| 10-22 08:21–08:40 (run ya pointi 4) | hakuna deploy (bado ni `a0f448ea`); task hii haikupush main | — | — | ✅ |

**Athari iliyothibitishwa:**
- 03:47 ilisababisha SIGTERM ya M4 ya E6, na session ikaendelezwa kwa njia ya legacy na server ya Render (`task-32.md:79`).
- E7 M2 "SIGNED_OFF — BATILI" (app HTTP 500, bila screenshots) ilitokea baada ya deploys mbili za katikati ya build. **Uhusiano huo haujathibitishwa.**

**Namba:**
- Deploys 11 ziliangukia ndani ya madirisha ya runs: 4 ❌ hai, 5 ❌ run wazi lakini imekwama, 1 ⚪ ya makusudi, 1 ✅ run ilikuwa paused (E6 22:50).
- Deploys za T33/T34/T35 wakati wa run: 0.
- Kinga ya push wakati kuna session hai ni pendekezo tu (`QUESTIONS.md` #5).
