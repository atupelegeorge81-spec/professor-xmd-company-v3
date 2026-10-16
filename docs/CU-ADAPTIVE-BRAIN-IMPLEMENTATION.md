# CU Adaptive Brain — mwongozo wa kuunganisha, kukagua na kufanya majaribio

**Lengo:** kuboresha Computer Use (CU) routing bila kubadilisha mradi mzima au kuvuruga kazi za Board. Hati hii ni kwa agent atakayechukua files zilizobadilishwa, kuziunganisha kwenye repo, kukagua environment ya Koyeb, na kufanya tests halisi.

## 1. Uamuzi wa architecture

CU haitumii Groq wala XKiro. Haiwi tena mfumo unaozungusha model kwa zamu bila kuangalia hali zao. Router inapaswa kuchagua lane inayoweza kutekeleza ombi kwa kuangalia:

1. **Availability:** lane haiko kwenye cooldown na provider/model/account inapatikana.
2. **Quota/rate limit:** lane ina nafasi kulingana na limit ya model, project au account.
3. **Uwezo uliothibitishwa:** model inayofaa kwa tool calling/utekelezaji ndiyo ichaguliwe kwa kazi za CU.
4. **Health na latency:** history ya success/failure, latency na load hutumika kurekebisha alama ya lane.
5. **Failover:** 404, 429, 503, empty response na timeout huainishwa; lane yenye tatizo hupumzishwa na ombi hujaribiwa kupitia lane nyingine iliyo tayari. Kosa la wazi kama 404 halipaswi kurudiwa mara kwa mara kwa account ileile.
6. **Uthibitishaji:** model haitangazi kazi kuwa imekamilika kwa maandishi tu. Tool calls na outputs, exit codes, tests na harness ndizo ushahidi.

### Weighted dispatch ya kuanzia

`cu/oh_router.py` ina schedule ya awali ya slots 11: Gemini Flash ×4, Gemini Flash-Lite ×4, UnoRouter ×2 na OpenRouter ×1. Hii ni **uzito wa mwanzo**, si ahadi kwamba kila requests 11 lazima zifuate mpangilio huo. Family zisipokuwa na lane eligible, router inaruka family hiyo na kuchagua lane kutoka kwa family nyingine iliyo tayari. Kisha score ya lane inazingatia rank, latency ya mafanikio, reliability na load.

OpenRouter kwa hiyo inaweza kupata kazi wakati wa traffic ya kawaida; si kusubiri Gemini na UnoRouter zote zife. Quota yake ni account-wide, inayoshirikiwa na model na role zote ndani ya run/process hiyo.

## 2. Roster iliyokubaliwa kwa CU

### Ondoa kabisa kutoka CU

- UnoRouter `laguna-s-2.1:free`
- UnoRouter `north-mini-code:free`
- UnoRouter `kimi-k3:free`
- UnoRouter `codestral-latest:free`
- UnoRouter `deepseek-v4-flash:free`
- **Groq nzima ndani ya CU**, ikiwemo `qwen/qwen3.8-27b` na `openai/gpt-oss-120b`
- XKiro haijajumuishwa kwenye CU; inabaki nje kwenye majukumu ya Board kama mfumo wako unavyoihitaji.

Usiondoe variables/config za Groq za Board kwa jumla. Mabadiliko haya yanaondoa Groq kwenye Computer Use tu.

### Model za Gemini zinazobaki

**Flash:** `gemini-3.8-flash`, `gemini-3.7-flash`, `gemini-3.6-flash`, `gemini-3.5-flash`, `gemini-3-flash-preview`, `gemini-2.5-flash`.

**Flash-Lite:** `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite`, `gemini-3.1-flash-lite-preview`, `gemini-flash-lite-latest`.

Mmiliki wa mradi amethibitisha kwenye dashboard kuwa `gemini-3.1-flash-lite` na `gemini-3.5-flash-lite` zina quota ya requests 500 kwa siku kwa kila project. Ikiwa API keys nne zinawakilisha projects nne tofauti, kinadharia kuna hadi 2,000 requests kwa siku kwa kila moja ya model hizo mbili. Hii si sawa na quota ya Flash ya kawaida.

**Usidhani kuwa quota ya 500 imethibitishwa kwa Preview/Latest.** Code inaweka cap ya tahadhari ya 20 kwa siku kwa kila project kwa `gemini-3.1-flash-lite-preview` na `gemini-flash-lite-latest` hadi owner athibitishe quota. Unaweza kuweka `GEMINI_LITE_PREVIEW_RPD` au `GEMINI_LITE_LATEST_RPD`; `GEMINI_LITE_RPD` ya jumla ikitajwa kwa makusudi inaweza ku-overwrite default hizo. Baada ya live verification, rekebisha caps. Pia, keys nne haziongezi quota kama zingekuwa project ileile; ripoti inasema ni projects tofauti.

`gemini-2.5-flash` inaripotiwa kupatikana kwenye account/project ya kwanza pekee. Hakikisha `GEMINI_MODEL_SKIP` inaruka model hiyo kwa accounts 2, 3 na 4.

### Model za UnoRouter zinazobaki

- `minimax-m2.7:free`
- `deepseek-v4.1-flash:free` (iwe probation; ilifanikiwa kwenye probe ndogo tu, hivyo afya yake iangaliwe)
- `nemotron-3-ultra-550b-a55b:free` (executor fallback na judge wa kwanza)

Quota/rate limit ya Uno iliyoripotiwa: request moja kwa dakika kwa account × model. Heshimu `Retry-After` na matokeo ya provider.

### Model za OpenRouter zinazobaki

- `nvidia/nemotron-3.5-lightning:free` (fallback ya judge, si judge wa kwanza)
- `nvidia/nemotron-3-ultra-550b-a55b:free` (executor fallback)

Ripoti ya mradi inaweka kikomo cha OpenRouter kuwa requests 50 kwa siku kwa account, zikishirikiwa na model zote kwenye account hiyo. Hivyo usihesabu quota tofauti kwa Lightning na Ultra. Usimalize quota yote kwa execution ya kawaida; hakikisha role ya judge ina nafasi ya kutumia fallback pale inapohitajika.

## 3. Judge na uthibitishaji wa mwisho

- Judge wa kwanza: UnoRouter Nemotron Ultra, mradi lane yake ipo na inaruhusiwa.
- Fallback ya judge: OpenRouter Nemotron Lightning, ikiwa model hiyo iko kwenye `CU_OPENROUTER_MODELS` na account ina quota. Scheduler maalumu ya judge huipa UnoRouter kipaumbele; Lightning haitumiki kama judge wa kawaida wakati Uno Ultra ina lane eligible.
- North na Laguna hawaruhusiwi kama executor au judge.
- Verdict tupu/haieleweki, timeout au provider error si verdict ya `complete`; rekodi kosa na jaribu judge mbadala unaoruhusiwa.
- Harness ndiyo uthibitishaji wa mwisho. Ikiwa check imefeli, agent arudishiwe ushahidi wa check na apewe fursa ya kurekebisha. Usikubali madai ya commit/tool/test bila exit code/output halisi.
- Katika live test, thibitisha tabia ya continuation ya `run_goal`: kama checks zimefeli, run inapaswa kuendelea kurekebisha badala ya kuishia `STUCK` bila kuipa agent ushahidi. Ikiwa active OpenHands code bado hufunga run mapema, rekebisha hilo kama kazi tofauti na uongeze regression test kabla ya production.

## 4. Files zilizorekebishwa na jukumu lake

| File | Mabadiliko makuu |
|---|---|
| `cu/lanes.py` | Roster allowlist, Gemini Flash-Lite lanes, per-family timeouts, cooldown hadi reset ya siku kwa quota ya siku, quota/health state, na sharing ya OpenRouter counter kati ya pools za CU zilizo kwenye process moja. |
| `cu/oh_router.py` | Adaptive weighted dispatch; OpenRouter inashiriki traffic ya kawaida badala ya kuwa fallback iliyofungwa hadi main kufa. |
| `cu/oh_bridge.py` | Inatumia lane timeout/policy mpya na inaendelea kutumia OpenHands tools zilizopo. |
| `src/lib/cu/engine.ts` | CU config sasa ina allowlisted UnoRouter/OpenRouter na Gemini; haijengi Groq/XKiro lanes za CU; ina `CU_OPENROUTER_MODELS` na `CU_UNOROUTER_MODELS`. |
| `src/lib/env.ts` | Default roster ya Gemini Lite imepanuliwa na skip ya Gemini 2.5 Flash kwenye accounts 2–4 imewekwa sawa. |
| `cu/brain.py` | Safeguard kwa legacy backend: inakataa Groq/XKiro na roster ya Uno/OpenRouter isiyoruhusiwa. Si mbadala kamili wa weighted scheduler ya OpenHands. |
| `.env.example` | Inaonyesha env vars maalumu za CU na kueleza Groq ni ya Board, si CU. |
| `cu/tests/test_r51_lanes.py`, `cu/tests/test_t3b_lanes.py`, `cu/tests/test_r51_ohrouter.py`, `cu/tests/test_brain.py` | Regression tests za roster, quota/cooldown, dispatch na legacy allowlist. |

## 5. Muhimu: backend ya Koyeb

Kwa code ya sasa, `CU_AGENT_BACKEND` default ni `openhands`. Weighted adaptive dispatcher ipo kwenye OpenHands path (`cu/oh_bridge.py`, `cu/lanes.py`, `cu/oh_router.py`).

**Kabla ya deploy, soma environment ya Koyeb bila kuonyesha secrets na thibitisha `CU_AGENT_BACKEND=openhands`.** Kama imewekwa `claude`, `cu/brain.py` bado ina legacy scheduler yenye tabia tofauti (Gemini-first na emergency fallback). Mabadiliko ya sasa yanaweka roster safety, lakini hayahamishi kikamilifu weighted dispatch mpya kwenye legacy backend. Usidai architecture ni sawa kwenye backend zote mbili. Chaguo salama ni kutumia OpenHands path ambayo ndiyo default iliyokusudiwa, au port na test weighted scheduler kwa legacy path kabla ya kuiwasha.

## 6. Environment variables za kuthibitisha

Thibitisha hizi zipo kwenye Koyeb (majina tu; usitoe thamani za API keys kwenye logs/tickets):

```env
CU_AGENT_BACKEND=openhands
CU_OPENROUTER_MODELS=nvidia/nemotron-3.5-lightning:free,nvidia/nemotron-3-ultra-550b-a55b:free
CU_UNOROUTER_MODELS=minimax-m2.7:free,deepseek-v4.1-flash:free,nemotron-3-ultra-550b-a55b:free
```

Pia thibitisha keys tofauti kwa `GEMINI_API_KEY_1..4`, UnoRouter accounts mbili na OpenRouter accounts mbili. Usitume wala kuweka API keys kwenye source control.

Quota manager ya Python huanza na snapshot ya ledger inayotumwa kwenye CU, kisha counter za OpenRouter hushirikishwa kati ya main/fallback/judge pools **ndani ya process/run moja**. Hii si reservation atomiki ya quota kati ya deployments/processes zote zinazoendesha kwa wakati mmoja. Ikiwa Board na CU au CU runs nyingi zinaweza kutumia account moja kwa concurrency, agent lazima akague ledger upande wa Koyeb na aongeze atomic reservation/shared quota broker pamoja na concurrency tests kabla ya kudai kuwa quota haiwezi kugongani.

## 7. Mpangilio wa kazi kwa agent

### A. Kabla ya kuunganisha

1. Fungua repo halisi na uthibitishe branch/commit na working tree.
2. Tengeneza branch/backup ya rollback.
3. Linganisha files hizi na repo halisi; usibadilishe source isiyohusiana, API keys, Board policies au data za production.
4. Nakili/merge files zilizotolewa kwa paths zake. Hii si project kamili; ni patch ya mabadiliko tu.

### B. Tests za local

Katika root ya project:

```bash
python -m pytest -q cu/tests
python -m unittest discover -s cu/tests -t .
npm ci
npm run typecheck
npm run test
npm run lint
npm run build
```

Kama package manager lockfile ya repo si ya npm au CI ya mradi inasema vinginevyo, fuata package manager rasmi ya repo. Linganisha failures na baseline na tenganisha failures za zamani na regressions mpya. Usifunge kazi kwa sababu Python tests pekee zimepita ikiwa TypeScript/build hazijajaribiwa.

### C. Kukagua roster bila kuonyesha secret

1. Tengeneza config ya CU na print **majina tu** ya provider/account alias/model, si key.
2. Hakikisha hakuna `groq`, `xkiro`, Laguna, North, Kimi, Codestral au DeepSeek V4 Flash kwenye CU lanes, emergency provider list au judge pool.
3. Hakikisha Gemini Flash-Lite zote nne zinatengenezwa kwa kila project inayotumika, isipokuwa account/model iliyoripotiwa 404.
4. Hakikisha Ultra ipo kwa Uno accounts zote zenye key; Lightning ipo kwenye OpenRouter judge fallback; OpenRouter models zote mbili zipo kwenye normal dispatch roster.
5. Hakikisha model ya 2.5 Flash inarukwa kwa accounts 2–4.
6. Hakikisha Lite base 3.1/3.5 zina cap 500/project/model; Preview/Latest zina cap ya tahadhari 20 mpaka dashboard/probe ithibitishe quota yake.

### D. Real tests kwenye Koyeb (fanya kwa hatua)

1. **Smoke test salama:** kazi ndogo kwenye workspace ya majaribio, mfano kuunda file la test, kulisoma, kulibadilisha na kuendesha test/command isiyo na madhara. Hakikisha log inaonyesha tool calls halisi na exit codes.
2. **Routing:** kwa logs zisizo na secrets, hakikisha model/family zinateuliwa kulingana na quota/availability; OpenRouter inaweza kupata request wakati wa normal traffic na si baada tu ya Gemini/Uno kufa.
3. **Failover:** tumia config/test route ya staging yenye lane moja ya majaribio iliyozuiwa au stub ya 503. Hakikisha request inahamia lane nyingine ya afya bila kusubiri timeout yote.
4. **Quota:** thibitisha counters za Flash na Lite kwa project × model na OpenRouter kwa account nzima. Test OpenRouter Ultra kisha Lightning; quota ya account hiyo lazima ipungue kwa pamoja.
5. **Concurrent load:** tuma requests mbili au zaidi kwa staging. Hakikisha rate limit ya Uno haivunjwi, OpenRouter counter haivuki limit, na tool call isiyoweza kurudiwa haitekelezwi mara mbili.
6. **Judge:** test case moja inayopita na moja inayofeli. Judge asikubali completion ya uongo; verdict tupu/timeout ipate fallback; harness output ndiyo uamuzi wa mwisho.
7. **Full task:** baada ya smoke/failover/quota/judge kupita, fanya task halisi yenye risk ndogo kwenye branch/workspace salama, kisha uangalie artifacts na tests, si status message pekee.
8. Andika matokeo ya kila test: tarehe/saa, build/commit, backend, model alias, pass/fail na latency. Ficha API keys, Authorization headers, prompt data nyeti na tokens.

### E. Release na rollback

- Deploy kwa staging/preview kwanza ikiwa ipo; usibadilishe production kwa kutegemea tests za mock pekee.
- Usi-deploy kama typecheck/build au smoke test imeshindwa bila kuelewa sababu.
- Weka rollback commit/branch tayari. Ikiwa run inaanza kusubiri muda mrefu, quota inagongana, model zisizoruhusiwa zinaonekana au judge anatoa false completion, rollback mabadiliko ya CU na uchunguze logs.
- Usiondoe Groq env vars za Board kwa jumla; hakikisha ni CU pekee inayozizuia.

## 8. Matokeo ya ukaguzi wa local uliofanywa wakati wa kuandaa patch hii

- `python -m pytest -q cu/tests`: **266 passed, 1 warning** (warning ya `tarfile.extractall` kwenye test iliyokuwepo; si failure).
- `python -m unittest discover -s cu/tests -t .`: **220 tests, OK**.
- `npm run typecheck` haikuweza kuthibitishwa katika mazingira ya kuandaa patch kwa sababu `node_modules` hazikuwepo (makosa ya imports/dependencies kama React, Next, Vitest na Appwrite). Hivyo usichukulie TypeScript typecheck, Vitest, lint au Next build kuwa zimepita mpaka agent aendeshe commands hizo katika repo yenye dependencies.
- Hakuna API provider probe, inference ya live au Koyeb deployment iliyofanywa hapa. Hizo ni hatua za real test zilizoelezwa hapo juu, na lazima zifanywe na agent mwenye ruhusa kwenye mazingira husika.

**Hitimisho:** patch hii imejaribiwa kwenye Python unit tests, lakini haijathibitishwa live. Agent lazima akamilishe sehemu ya TypeScript/Next.js, athibitishe backend ya Koyeb, kisha afanye staged real tests kabla ya deployment ya production.
