# R32 · Nidhamu ya Agent ya XMD Computer (Claude Agent SDK zenyewe)

> ✅ **IMEKAMILIKA (06-10-2026):** ukaguzi wa sandbox (Awamu A) + implementation + unit tests 75 green +
> integration test ya sandbox (fail×3 → ushauri×2 → brake → STATUS.md). Uamuzi wa CEO (06-10 jioni):
> **ushauri + brake ya majibu pekee — HAKUNA block ya command**; **HAKUNA token budget kabisa**
> (agizo la usiku: quota-pause ya LLM ipo tayari — inasimama na inaendelea yenyewe).
> Task\* tools ON · subagents ON · MCP search ON.

## Chanzo cha tatizo (session 6ac4393b — "Modern Male Login System Design")

| Kipimo | Thamani halisi |
|---|---|
| Tokens za CU | 4.6M (calls 62 zilizofaulu + 28 zilizokufa) |
| Context | call ya 1 = 34K → ya mwisho = 147K |
| `AuthPage.tsx` imeandikwa | mara 13 |
| `npm run build && npx playwright test` imeshindikana | mara ~13 (command ILEILE) |
| Kosa halisi (color-contrast) | `var(--accent)` haikuwa defined kwenye globals.css — kosa lilikuwa KATIKA FILE Nyingine |
| Kilichomsimamisha | HAKUNA — CEO ndiye aliistopisha |

## Msimamo (kila kitu cha Claude — hakuna mfumo wa kwetu)

- **Ubongo = Gemini** (cuBrain, `ANTHROPIC_BASE_URL=127.0.0.1:4010`); **Mashine = Claude Agent SDK 0.2.163**
  (CLI 2.1.286). Nidhamu yote ni **harness-side** — model haiwezi kuipuuza.
- CLAUDE.md / hooks / subagents / Task\* tools / MCP = capabilities za Claude zenyewe (agizo la CEO:
  "tumia kila kitu cha Claude").

## Uthibitisho wa Awamu A (sandbox + proxy ya Anthropic-format — model si Claude)

| Kipengele | Hali | Maelezo muhimu |
|---|---|---|
| PreToolUse DENY round-trip | ✓ | reason inafika model kama tool_result is_error; command haitekelezwi (hatujautilishe — ni uthibitisho tu) |
| PostToolUse `additionalContext` | ✓ | **njia ya ushauri** — inafika model baada ya tool yoyote iliyofanikiwa, bila kuzuia chochote |
| PostToolUseFailure | ✓ | ina `error` field = "Exit code N" + output kamili; hakuna channel ya kumfikia model (by design ya CLI) |
| Stop hook | ✓ | `{"decision":"block","reason":…}` = lazimisha kuendelea (reason inamfika model); `{"continue":false}` = simama |
| CLAUDE.md ya project | ✓ | inapakiwa kama system-reminder kwenye KILA request (user turn); inabaki baada ya compaction; ina-load bila git |
| append-system-prompt | ✓ | `extra_args={"append-system-prompt": …}` — key BILA `--` (SDK inaiongeza yenyewe); `system_prompt` option ina-REPLACE system nzima (ikataa CLAUDE.md) — HAITUMIKI |
| HookMatcher | ⚠️ | `hooks` inahitaji **HookMatcher objects** — dict ya kawaida inaconvertiwa kimya kuwa tupu (fumbo la majaribio ya kwanza) |
| Subagents | ✓ | `agents={"jina": AgentDefinition(description, prompt, tools)}` — dict, si list; subagent anapata system yake (`cc_is_subagent=true`) |
| MCP in-process | ✓ | `create_sdk_mcp_server()` + `SdkMcpTool(...)` — handler inapata dict, inarudisha `{"content":[{"type":"text","text":…}]}` |
| Task* tools | ℹ️ | `TodoWrite` haipo tena kwenye CLI 2.x — mrithi = TaskCreate/Get/List/Stop/Update |
| Output ya makosa | ✓ | CLI yenyewe inakata MIDDLE (head+tail zinaonekana + "Exit code N") — model inaona tail tayari |

## Vilivyowekwa (faili)

| Faili | Mabadiliko |
|---|---|
| `cu/bridge.py` | `R32_CLAUDE_MD` (sheria 7) · `fingerprint_cmd` · `shape_fail_tail` · `HookState` + `build_xmd_hooks` (PostToolUseFailure/PostToolUse/Stop) · `xmd_web_search` + `build_search_tool` (MCP) · CLAUDE.md inaandikwa workspace · `setting_sources=["project"]` + `append-system-prompt` (badala ya `system_prompt`) · Task\*/Agent/web_search kwenye allowed · exec_output tail kwa fails · pkill anchor-fix |
| `src/app/api/boardroom/cu-search/route.ts` | MPYA — search ya sandbox: Bearer token ya run → `searchWeb()` (cache ya semantic inclusive); 401 → bridge ina fallback SearXNG direct |
| `src/lib/cu/engine.ts` | env `CU_SEARCH_URL` kwenye bridgeCommand · case `xmd_hook` (items + chip kwa brake) |
| `cu/tests/test_r32_hooks.py` | MPYA — 21 tests (fingerprint, streaks 3/6, rewrites 5, brake semantics ×3, tail, search handler mock) |


## Mtiririko wa nidhamu (unaoendelea sasa)

```
command ifeli (exit≠0) ──► PostToolUseFailure: streak++ (kila fingerprint yake)
   fail 3  ──► ushauri: "soma error kamili; hypotheses 3 kwenye STATUS.md; jaribu MOJA"
   fail 6  ──► ushauri mkali: "kosa liko SEHEMU Nyingine (dependencies/CSS var/config)"
   fail 10/15 ──► kumbushimo (ushauri tu — HAKUNA block)
tool iliyofanikiwa (yoyote) ──► PostToolUse: ushauri uliokusanywa unamfika model
                                (additionalContext — bila kuzuia chochote)
command iliyofeli ikafanikiwa ──► "✓ imefanikiwa baada ya N — kumbuka kilichofunga"
file imeandikwa mara 5 ──► ushauri: "angalia dependencies za file hii"
model imesimama (Stop):
   - final report ya kawaida ──► run inaisha vizuri ({} moja kwa moja)
   - imesimama IKO STUCK (ushauri haujafika / jibu linarudiwa) ──► block#1 na ushauri
   - jibu lileile tena ──► block#2 ("endelea na hatua nyingine / weka [~]")
   - jibu lileile mara 3 ──► BRAKE: run inasimama + ripoti ya NIMEKWAMA (STATUS.md)
                                + chip "▶ Endeleza inaanza na hali iliyohifadhiwa"
```

**Muhakiki wa mapatano na maamuzi ya CEO:**
- Hakuna cap ya turns/steps (run_start budget steps=0) — hooks zinaangalia KURUDIA bila maendeleo pekee.
- Hakuna block ya command wala ya file — kila kitu ni ujumbe (ushauri) au simamisho la MWISHO (brake/budget).
- Ushauri hautafikiri kufika mara kwa mara: unapelekwa mara moja kwa kila kiwango (3, 6, 10, 15) cha streak.
- Brake ya majibu inawaka tu jibu likirudiwa ≈90% (au prefix) mara 3 — na hook yenyewe ndiyo inayolazimisha
  continuations mbili za kwanza (semantiki za query-mode: `{}` = mwisho wa run).
- HAKUNA token budget: quota ya siku ya LLM (R31-G4) ndiyo inayosimamisha — inaendelea YENYEWE ikirudi.
- Hakuna memory ya kudumu: HookState + STATUS.md + CLAUDE.md vinaanzia run mpya kila mara.

## Uthibitisho wa integration (sandbox ya majaribio, fake brain)

Matukio halisi kutoka events.jsonl (yametokea kwa mfuatano huu):
`xmd_hook fail streak=1` → `fail streak=2` → `fail streak=3` → `continue (ushauri hypotheses)`
→ `continue (endelea/[~])` → `brake` → `run_end status="stuck"` — na `STATUS.md` (NIMEKWAMA + streaks
+ hatua zinazofuata) + `CLAUDE.md` kwenye workspace. Request za CLI zilidhihirisha: CLAUDE.md
(system-reminder), append-system-prompt (system 3376), `mcp__xmd-search__web_search` + Task\* + Agent
kwenye tools, WebSearch/WebFetch hazipo.

## Maswali ya baadaye (si ya sasa)

- Subagents za kawaida (AgentDefinition za kawaida kwa "researcher" n.k.) — sasa tool ya Agent ipo
  wazi; majina maalum yataongezwa kwa miradi mikubwa inapokuja.

## R32.2 (06-10 jioni) — kosa la session halisi 6ac4a63b + ugunduzi 2

Uchunguzi wa session zote mbili za CEO (baada ya R32.1):

**1. Kifo cha session mapema (ya leo — shida kubwa):** CU phase iliisha "done" baada ya tool call
MOJA tu (`ls`). Chanzo: lanes kuu za Gemini (3.8/3.7-flash) zilikuwa quota-locked — call ya mwisho
ilifanikiwa kwenye **lane ya dharura (3.5-flash)** na ilitoa jibu la **`<thought>` pekee** (bila
tool wala text halisi) + end_turn. Stop hook ya R32 iliihiriki kuwa "ripoti ya mwisho" — kosa la
ufafanuzi wa "stuck". **Fix (R32.2):** jibu ambalo lenye maudhui halisi chini ya herufi 40 baada ya
kuondoa `<thought>` tags SI mwisho halali → hook inalazimisha kuendelea (reason: "endelea moja kwa
moja na hatua inayofuata — tumia zana"); mfululizo > 6 (bila tool kati) → brake + ripoti ya
NIMEKWAMA; **tool yoyote iliyofanikiwa inareset counter** (maendeleo halisi hayasubiwi).

**2. "Hakuna tokens za GitHub/Vercel" (session ya nyuma, kabla ya update):** agent **aliizua** —
exec 68 zote hazina hata moja ya `gh`/`vercel`/`git` (alidai tu kwenye ripoti baada ya kuzama kwenye
mzunguko wa test zilizofeli). Tokeni zipo kweli kwenye Koyeb (`CU_GITHUB_TOKEN` github_pat_…,
`CU_VERCEL_TOKEN` vcp_… — zimehakikiwa). Sheria za R32 CLAUDE.md (#7 usikadiriwa) + ushauri wa
mzunguko wa test (fail 3 → hypotheses) zinashughulikia aina hii sasa.

**3. Slow sana (board phase):** lanes 6 za Gemini zilifeli kila call (429/503) kabla ya kufanikiwa
kwenye 3.6/3.5-flash — kila request ya CLI = majaribio mengi ya lane + cooldown sleeps. Hii ni
**mazingira (quota ya siku)**, si code — quota ikirudi, kasi inarudi.

## R32.2b (06-10 usiku) — fix ya R32.2 ilikuwa na pengo: tags ZISIZOFUNGWA

E2E test na prompt ileile ya CEO (session 6ac4af5e, "Modern Male Auth Pages", baada ya deploy
a2aaca3) iliifa NJE ILE ILE baada ya exec 1: gemini-3.8-flash (lane kuu, ok) ilituma
**`<thought>…` ILIYOFUNGULIWA PEKEE** — hakuna `</thought>` wala text nje ya tag.

**Chanzo:** `THOUGHT_RX` ya R32.2 inahitaji opening+closing (`<thought>…</thought>`) — tag
isiyo-fungwa haipaswi, "visible text" ilibaki na herufi zote za thought (>40) → hook iliruhusu
mwisho. `ThinkTagSplitter` (ya UI) tayari inajua semantics sahihi: tag isiyofungwa = kila kitu
kutoka hapo hadi mwisho ni thought. Tests za R32.2 zote zilitumia tags zilizofungwa — ndiyo
maana zilipita huku production ikifa.

**Fix (mstari wa regex, hakuna mabadiliko ya logic):** `_visible_text()` sasa (a) inaondoa
blocks zilizofungwa kwanza, KISHA (b) tag iliyofunguliwa isiyofungwa + kila kitu baada yake
(`UNCLOSED_THOUGHT_RX` — mfano huununua ThinkTagSplitter). Vilevile `<thinking>`. Tests 86
green (+5 za unclosed: block, ×7 brake, `<thinking>`, closed+kisha-unclosed, text halisi
kabla ya tag isiyofungwa inaisha vizuri).

## R33 (06-10 usiku) — screenshots moja kwa kila page + mabaki + Resume card (agizo la CEO)

**1. Screenshot MOJA kwa kila page/view ("PICHA IPO TAYARI"):** CEO alikumbusha sheria ya xmd3 —
kila page inatakiwa screenshot moja; ya pili ya page ileile inakataliwa. Ukweli wa code: xmd3/v3
zilikuwa na dedup ya **content-hash pekee** (picha zilezile zinapuuliwa kimya kwenye UI). Sasa
v3 ina **PreToolUse hook** inayomkataa AGENT yenyewe: key = (page_url, viewport); navigate/click/
type/tabs/resize zinafungua picha mpya (desktop→mobile ya page moja bado inaruhusiwa — workflow
ya verification inavyohitaji); kosa la kukataa linafika model kama reason. System prompt
imeongezwa sheria: kila page ya mradi inahitaji screenshot yake moja. Bash bado HAKUBLOCKIWI
(msimamo wa CEO unabaki) — hii ni pekee ya screenshots zilizokuwa zinapoteza tokens.

**2. Mabaki (yaliyoidhinishwa "Sawa"):**
- *Ripoti si code-dump* (kosa la 6ac4b789: `<tool_code>` dump ya file): `_is_code_dump()` —
  ripoti yenye alama za sehemu (RIPOTI/Live/GitHub/Muhtasari/🌐🐙📱📁✅🔗) halali; `<tool_code>`
  au >70% ya mistari ni code bila alama → block (max 2, kisha inaishishwa).
- *Tests ziliyoandikwa lazima ziendeshwe*: Write ya test file (`tests/`, `*.spec/test.*`) inaweka
  `tests_written`; Bash yoyote ya runner (playwright/vitest/jest/pytest/npm test/go test…) inaweka
  `tests_run` (hata ikifeli baadaye — jaribio linahesabiwa); Stop ikiwa tests_written bila
  tests_run → block "endelea: endesha tests, onesha matokeo, AU weka [~] + sababu" (max 2).

**3. Resume card (frontend):** `pausedInfo` ni ya global — card ya "Mjadala umesimamishwa"
ilikuwa inaonekana kwenye KILA session unayoifungua (hata zilizoisha). Sasa `pausedHere`:
inaonekana kwenye session iliyopausiwa PEKEE (au board root bila session waliyoifungua). R20
"Endeleza" card ya session zilizokatika pia imefungwa scope ileile (haifichwi tena na pause ya
session nyingine).

**Tests:** python 104/104 (+18: dedup 6, tests-tracking 5, report-language 5, regex 2);
vitest 69/69; tsc OK.

## R34 (06-10 jioni) — Sticky Lane + Empty Deliverables (agizo la CEO)

**A — Sticky Lane (brain.py):** kila request ilianza kutembeza orodha upya — 3.8/3.7 zilizokufa
zilipokea requests 28 za bure kwenye session 6ac4c32c, kila mara. Sasa: **lane iliyofanikiwa
mwisho (`record_usage ok=True`) inakuwa work lane — requests zinazofuata zinaenda MOJA KWA MOJA
kwake.** Inabadilika TU: (a) quota ya siku/disabled → inafutwa, orodha inatafuta mpya (na
mafanikio mapya yanaweka sticky mpya), (b) kosa fupi la dakika (≤25s) → inasubiri kimya bado
yake, (c) cooling ndefu (>25s) → inashuka orodha. Failover ya ndani ya request (tried) haifuti
sticky. Emergency tier inabaki kama ilivyo; sticky inarudisha model bora likiwa limerejea.

**B — Empty Deliverables (bridge.py):** kosa la 6ac4c32c — `index.html` ilirejelea
`js/login.js` ya 0 bytes (touch-tu); ripoti + STATUS.md zikadai "Step 9 ✓". Sasa Stop hook,
ikiruhusu mwisho halali, inascan HTML zote za workspace (bila node_modules/hidden): kila rejea
ya ndani (`<script src>`, `<link rel=stylesheet href>`, `<img src>`) lazima iwepo wenye maudhui
>0 bytes. `find_empty_deliverables()` → [("js/login.js", "0 bytes"|"haipo")…] → block "andika
maudhui KAMILI au ondoa rejea — USIISHIE hivi" (max 2, kisha inaishishwa). External
(http/https/data/mailto/#) na rel-isio-stylesheet (favicon n.k.) zinarukwa.

**Tests:** python 121/121 (+17: sticky 6 — pamoja na test_pacific_reset iliyosasishwa kwa
semantiki mpya ya sticky; deliverables 11). vitest 69/69.

## R34.1 (08-10) — false positive ya Empty Deliverables (session halisi 6ac6c6e5)

Session ya kwanza baada ya R34: hook iliwaka kwa uongo mara 2 — `dist/index.html` (vite build)
ilirejelea `./assets/index-*.js` zenye maudhui, lakini hook ilitafuta `ws/assets/` (mzizi) badala
ya `dist/assets/`. Agent aliiita kwa usahihi "ripoti chanya ya uwongo" kwenye ripoti yake na
kaihama kwa kufuta index.html ya source (baada ya push — hakuna uharibifu). Fix: (a) rejea
zinatafutwa KUTOKA na directory ya HTML yenyewe (+"./" prefix removal sahihi, "../" inatoroka
hairuhusiwi), (b) saraka za build (dist/build/out/.next/.output/.cache/coverage) ni generated —
hazihesabiwi. Tests 124/124 (+3: dist skip, subdir resolution, ../ escape).

## R35 (08-10 jioni) — Export kamili + hakuna vikomo (agizo la CEO)

- **Export "kila kitu hadi picha":** think KAMILI (haikatwi 300), exec = command kamili + output
  + diff (before/after) + path + exit/muda, hooks za nidhamu (cuHook mpya — live `xmd_hook` na
  replay `hook` zote), picha za CU **embedded kama data-URI** (fetch kutoka bucket wakati wa export),
  files tree ya workspace, header ya muda. Export ni async sasa (Promise.all ya picha).
- **cuHook kwenye timeline:** adapter + CuHookView (mstari mfupi wenye icon kwa kind) — nidhamu
  sasa inaonekana kwenye mkondo, si blog tu.
- **Vikomo vimeondolewa kwa kazi kubwa:** PLAN_STEPS_MAX 15 → **60** (env PLAN_STEPS_MAX), agenda
  cap 20 → **30**. Min 8 ya steps inabaki (kina cha chini, si limiter).
- Tests: vitest 71/71 (+2: hooks kwenye adapter + export kamili), tsc OK.

## R36 (08-10 jioni) — Nidhamu = BACKGROUND + UI kwa SPEED HALISI ya model (agizo la CEO)

- **Hook cards hazionekani kwenye UI:** cuHook zote (advice/continue/shot_deny/fail) zinaruka
  render kwenye timeline; blog za engine za "⚠️ Nidhamu" na "📷 Picha ipo tayari" zimeondolewa.
  PEKE ya **brake** (NIMEKWAMA — run imekwama kabisa) inaonekana kwenye UI + chip (ni error
  halisi). Hook zenyewe ZINAENDELEA kumdirect agent background kama kawaida; data zote bado
  zinahifadhiwa — **Export kamili (R35) haikubadilishwa** (hooks + picha + kila kitu badoipo).
- **Speed ya UI = speed ya Gemini:** `useTypewriter` sasa INSTANT — text/delta inayoingia
  inaonekana MOJA KWA MOJA (awali: replay ya herufi 70/s — thought ya 600 chars = sekunde 9,
  script ya 3000 chars = sekunde 43 kwenye 140/s "Writing"). Thinking card: window ya reveal
  (hadi 5000ms) imekuwa settle fupi ya shimmer 300ms. Hakuna kugusa speed ya model wala
  njia yake — ni upande wa onyesho tu.
- vitest 71/71, tsc OK.

## R37 — Itifaki ya Kufunga (hakuna UNRESOLVED tena) + uwasi wa guards

Chanzo: Agenda 3 ya session 6ac7576d ("Enterprise BI Platform Specification") — owners walikubaliana
100% (AGREE 12) lakini agenda ilifungwa 🟠 OPEN. Mnyororo: "enterprise" (neno la kwanza la title ya
kikao CHA SASA na pia head ya mradi wa zamani "Enterprise BI Platform Blueprint") → TRADE-OFF halali ya
designer ("subgrid requires modern browser support, acceptable for an enterprise BI tool") → guard ya
past-authority (R27) false positive → proposal iliuliwa + karantini (cutTexts) → AGREE 12 zilitupwa KIMYA
(hakuna pendekezo hai) → mwenyekiti akazuiwa kuona (karantini) → "chair could not produce a proposal" → OPEN.

**Sehemu A — mlinzi asimue makubaliano halisi:**
- `memoryAuthority.ts`: neno linalojitokeza kwenye title/brief/agenda ya kikao cha SASA haliwezi kuwa
  head/alama ya mradi wa zamani (`contextWords` filter kwenye `pastAuthorityHits`). Jina KAMILI la mradi
  wa zamani linabaki linakamatwa (wizi halisi haujaguswa).
- Guard yoyote ikiua proposal inaacha **QUOTE ya sentensi halisi iliyotrigga** (`authorityTriggerSentence`
  → kill-log + note ya mfumo + close-record). Hakuna silent kill tena.
- AGREE ikifika bila pendekezo hai → **note wazi** (`agreeNote`): "haikusababisha chochote — sababu: …".
  Hakuna silent discard tena.

**Sehemu B — Itifaki ya Kufunga (OPEN inafutwa kama hali):** `deliberation.ts` + `boardRunner.ts`
- Mnyororo: consensus (owners wote — haikubadilishwa) → kura ya mwisho **BINDING** (kila owner: AGREE na
  sharti moja au DISAGREE na kosa moja konkreti) → wote = LOCKED consensus; wingi + kosa la wachache =
  mzunguko MMOJA wa marekebisho (UPDATED DECISION) → kura ya pili → wingi = **LOCKED rough consensus**
  (+ DISSENT inarekodiwa kwenye uamuzi na Ledger); hakuna wingi = **LOCKED fallback** (mwenyekiti huchagua
  toleo la chini salama kutoka yaliyojadiliwa tu + ASSUMPTION wazi); hakipatikani kabisa = **LOCKED defer
  ya ndani** (kilitokosekana kimeandikwa wazi + BUILD NOTE — kamwe si swali kwenda kwa Mkuu).
- DEFER ya owner haifungi agenda kama OPEN tena — inaleta FALLBACK (missing → ASSUMPTION wazi).
- Mwenyekiti "could not produce a proposal" haizalishiwi tena — anaingia fallback (jaribio 2, na
  kill-log + quotes zinaonekana kwenye prompt yake — haishi kipofu tena).
- `status` ya Ledger inabaki "LOCKED" kwa kila kufunga; aina (rough/fallback/defer) inaingia
  decision_summary (`[ROUGH CONSENSUS — …]`, `[FALLBACK DECISION — …]`, `[DEFER — YA NDANI]`).
- Awamu zote za baada (Data Guard, enforce JSON, code-writing, observers, objection, mini-report 5B,
  deliverables) sasa zinaendesha kwa `itemLocked` — uamuzi wa Itifaki pia unaandikwa code yake.
- HARD_TURNS: reserve ya Itifaki (`maxTurns + owners*2 + 6`) — consensus ya kawaida bado inafunga mapema.

**Sehemu C — research (uwanja wa tokens unatumika):** searches/owner/agenda 6→**12**, matokeo/query
8→**12**, dirisha la evidence 8→**16 za mwisho** (sources za mwanzo hazipotei tena), deep-read 3→**5**.

**Sehemu D — close-record (`openRecord.ts`):** kila kufunga kisicho consensus rahiti kina rekodi ya
ukweli: jinsi ilivyofunga, pendekezo, nani alikubali, DISSENT, guards zilizoondoa mapendekezo (na
quotes za R37/A2), assumptions za owners. Mpango kazi/memory unaonyesha aina: `A5 [LOCKED rough
consensus] …` — coding/computer agents hupata maagazi kamili, si "OPEN — NOT locked".

**Visivyobadilika:** DATA RASMI + Data Guard (uamuzi za Itifaki pia zinapita), wizi halisi
(Saluni Nuru / Mama Lishe Bora) unabaki anakatwa (regression tests), exemption ya "locked in Agenda 1",
Export kamili (R35), UI ya R36, sessions zilizopo (historia haipitiwi — Resume ya 6ac7576d inaendelea
na Itifaki kwa agenda zilizobaki).

**Uthibitisho:** tsc clean; vitest **95/95** (71 za zamani + 24 mpya: memoryAuthority 10,
deliberation 11, openRecord 4 — ikiwemo replay ya msg #17 halisi ya A3: hakuna hit; Saluni/Mama Lishe
zinakatwa bado). Replay ya msgs 44 zote za session 6ac7576d kwa logic mpya: **hakuna hit hata moja** —
A3 ingefunga LOCKED kwa AGREE za owners.

## R38 — gemini-2.5-flash @ gemini-2 = 404 (lane iliyo kufa imeondolewa)

Live probe 08-10 (kila model × account, request halisi): `gemini-2.5-flash` → **gemini-1 ✅ 200 OK**
(lane kuu ya CU run) · **gemini-2 ❌ 404 "no longer available to new users"**. Fix (upunjaji mdogo kabisa):
`GEMINI_MODEL_SKIP: { "gemini-2": ["gemini-2.5-flash"] }` (`src/lib/env.ts`) — broker ya Board
(`lanes.ts` allLanes) na config ya CU (`engine.ts` → `brain.py build_order`) hazizalishi lane hiyo PEKEE;
gemini-1 inabaki na 2.5-flash, models/lane ZOTE nyingine hazikuguswa. Back-compat: config bila `modelSkip`
inaendelea kufanya kazi kama zamani. Uthibitisho: python 125/125 (+1), vitest 98/98 (+3), tsc clean.
(Uchunguzi kamili wa session 6ac78bc6: docs/R38-DEEP-INSPECTION.md — root causes RC1–RC5 na fix plan.)

## R38-B — FIX ZA KUBWA (RC1–RC5 + usage hang) — 08-10 jioni

Msingi: docs/R38-DEEP-INSPECTION.md (ripoti v2, evidence-based). Zote zimeandikwa kwa
minimal-scope — hakuna logic nyingine iliyoguswa. Uthibitisho: **python 128/128 (+3), vitest
111/111 (+13: engine.pause 10, ui RC4 3), tsc clean, build ✓**.

- **RC1 · stream iliyokwama haikukamatwa** (`cu/brain.py` open_stream): idle-check ilikuwa dead
  code (`last_data` ilesasishwa kabla ya check). Sasa: check iko JUU ya loop; **data halisi pekee**
  (mstari unaanza `data:`) unawasha `last_data` — ping/keep-alive hauhesabiwi; idle >180s →
  LaneError busy (lane inarudiwa). Kipya: **STREAM_MAX_MS=15dk** — generator usiokoma unakatwa.
  Watchdog ya pili (`engine.ts`): `checkCuStall` interval ya 30s kwenye kila phase — hakuna tukio
  la bridge 5dk → onyo (moja); 15dk (`CU_STALL_PAUSE_MS`) → pause + auto-retry 10dk.
- **RC5 · pause haishimangi CU** (`pauseRun`): awamu ya computer ilikuwa ikiendelea chini ya pause
  (ushahidi [243]: matukio ~600 baada ya pause). Sasa `pauseComputerFromServer`: tar ya workspace →
  bucket (snapshot, ≤40MB, timeboxed ~7dk max) → pkill bridge+brain → sandbox inafiwa (+15s) kama
  snapshot ipo (bila snapshot inabaki hai kuokoa kazi) → session "paused" + chip + awamu
  inarudishwa. resumeAt=0 = pause ya mwandamizi (hakuna auto-resume); Resume inapita
  quota-paste-resume path ileile. Guard mpya ya `pausedNow` (pause ya SASA) tofauti na
  `pausedOnce` (historia — inaruhusu quota-pause ya pili na resume-continue). Events za bridge
  wakati wa pause: "kelele" (think/text/exec) zinakataliwa; za mwisho (run_end/report/snapshot/
  github/deploy) zinapita — kazi halisi haipotei. Resume wakati snapshot inapangwa → 409 "pausing".
- **RC4 · orphan think cards** (`adapter.ts`): think_start mpya inafunga iliyotangulia
  (partial:false — ushahidi [311]/[314]); run_end/phase_done/pause pia zinafunga think wazi.
- **RC2 · matumizi ya tokens ya Board** (R37-C caps): dirisha la evidence 16→12
  (`boardRunner.ts`), matokeo ya search 12→10 kwa query (`search.ts`).
- **RC3 · vifo vya process ya Koyeb**: keep-alive ya ndani — instrumentation ina-ping
  `/api/health` ya URL ya umma kila dakika 4 (production tu, `CU_KEEPALIVE=off` inazima) —
  instance isiife kwa kukosa traffic wakati run/runner ziko memory. (Vifo vya deploy/OOM
  havizuiiki — recovery ya nje (Ledger/boot-scan) inabaki kama ilivyo.)
- **`/api/usage/accounts` hang**: probes zote zina timeouts zao (8-10s) lakini jumla sasa
  imefungwa — `Promise.race` ya sekunde 15; snapshot ya ledger inarudi hata probe ikikwama.
