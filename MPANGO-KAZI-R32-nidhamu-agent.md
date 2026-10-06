# MPANGO KAZI R32 — NIDHAMU YA XMD COMPUTER (Harness Hardening)

> **Hali: AWAMU A–H ZIMEKAMILIKA (implementation + tests 78 green + integration sandbox ✓) — 06-10.
> Code imepushiwa v3 → Koyeb auto-deploy. Inasubiri: E2E ya production (G3) + uhakiki wa UI na CEO.**
> Tarehe: 5 Oktoba 2026 (jioni) · Msingi: uchunguzi wa session halisi `6ac4393b` ("Modern Male Login System Design").

---

## 0. Tatizo lililopimwa kwa data (si hisia)

Session yako uliyoistopisha, kwenye awamu ya XMD Computer:

| Kipimo | Thamani halisi |
|---|---|
| Tokens za CU | **4,615,436 (4.6M)** — calls 62 zilizofaulu + 28 zilizokufa lane-level |
| Ukuaji wa context | Call ya 1 = tokens 34K → call ya mwisho = **147K** (history inajikusanya kila call) |
| `components/AuthPage.tsx` imeandikwa | **mara 13** |
| `npm run build && npx playwright test` imeshindikana mfululizo | **mara ~13** (command ILEILE, bila mabadiliko ya mkakati) |
| Kosa halisi | `color-contrast` — link ya "Sign up" ilikuwa **`#0000ee` (blue ya default ya browser)** kwa sababu `var(--accent)` haikuwahi ku-defined kwenye `globals.css` (file aliyoandika MARA MOJA mwanzoni) + `landmark-one-main` (hakuna `<main>`) + violation ya 3 **haikufika kwake kabisa** (output ilikatika herufi 8,000) |
| Chochote kilichomsimamisha | **HAKUNA** — wewe ndiye uliStopisha |

**Sababu 3 zilichanganya (pembetatu ya mtego):**
1. Sheria yangu ya "usirudi kuandika script nzima — patch kidogo + retry" (sahihi kwa maana yake, ila haikuwa na mlango wa dharura wa kutoka).
2. Mpango Kazi unasema "QA zote zipite" + "verification fails ×2 → stop and report" — agent (Gemini) **aliipuuza** ile ya pili; hakuna kilichomlazimisha.
3. Hakuna brake ya NJE ya model: kitu kinachohesabu "nimefeli kitu kileile mara ngapi sasa?" — hakipo.

**Ubunifu wetu sasa**: Ubongo ni **Gemini** (cuBrain — hakuna token ya Anthropic inayotumika; `claude-sonnet-4-5` ni jina la kuidhinisha CLI tu, base URL ni proxy yetu `127.0.0.1:4010`). Mashine ni **Claude Agent SDK**. Gemini HAIJAfunzwa nidhamu ya harness hiyo — kwa hiyo nidhamu inawekwa **kwenye harness (mashine), ambayo model haiwezi kuipuuza**.

---

## 1. Uamuzi zilizofungwa (hapa ndani ya plan hii — LOCKED)

| # | Uamuzi |
|---|---|
| 1 | **HAKUNA cap ya turns/steps** (agizo lako la 05-10 limesimama). Hooks zinalenga **RUDIA bila maendeleo** pekee, si idadi ya jumla ya turns. |
| 2 | Hakuna memory ya kudumu kati ya projects (umeikataa). Memory ya run = **file moja ndogo ya hali** (`STATUS.md`) ndani ya workspace. |
| 3 | **HAKUNA token budget kabisa** (agizo la CEO 06-10 usiku — imeondolewa): quota-pause ya LLM (R31-G4) ipo tayari — tokens zikiisha run inasimama na inaendelea YENYEWE; models nyingi zinahesabiwa kwa request, si token. |
| 4 | Mashine ya SDK ya Claude inatumika kama ilivyo (CLAUDE.md/settings, hooks, compaction). **Hatujengi mfumo mpya wa kwetu.** |
| 5 | WebSearch/WebFetch za server-side za Anthropic hazitawashwa — searching engine yetu (SearXNG) inakuja kama **MCP tool** ya kiharness (idhini 06-10). |
| 6 | Hakuna mabadiliko ya UI, hakuna kugusa logic nyingine yoyote ya Board/CU isipokuwa hapo chini. |
| 7 | Subagents ON (idhini 06-10 — miradi mikubwa inakuja). Task* tools ON (idhini 06-10). |
| 8 | **Hooks: USHauri + BRAKE pekee — HAKUNA kublock kamanda** (idhini 06-10 jioni: block inaweza kumsukuma agent kwenye mkakati mbaya zaidi na kula tokens nyingi zaidi). Kamanda ileile inashauriwa (3, 6) bila kuzuiliwa; brake ya majibu yaleyale ×3 ndiyo simamisho pekee. |

---

## 2. Awamu A — UTAFITI NA UHAKIKI (sandbox ya majaribio, hakuna deploy)

**Lengo**: kuthibitisha kabla ya kujenga — SDK version iliyopo kwenye template `professor-xmd-browser-v3` ina support gani, na hooks zinafanya kazi KWELI na proxy yetu ya Gemini.

- A1. Spawn sandbox 1 ya majaribio (E2B API — hakuna ushawishi kwa production).
- A2. Kagua `claude_agent_sdk`: version, `ClaudeAgentOptions` ina fields gani (`hooks`, `setting_sources`, `system_prompt`), na CLI iliyonako ina aina gani za hooks (PreToolUse/PostToolUse/Stop).
- A3. Hook moja ya majaribio (PreToolUse ya Bash inayahesabu calls) + run ndogo ya SDK na brain ya majaribio → **thibitisha hook inawaka hata model ikiwa Gemini-proxy** (hooks ni za CLI, si za model — lakini nithibitishe kwa macho).
- A4. Thibitisha jinsi CLAUDE.md inavyopakiwa (`setting_sources` inahitaji "project"? au system_prompt pekee inatosha) — uamuzi wa utekelezaji wa Awamu B unatoka hapa.

**Lengo la awamu**: ripoti fupi kwako — "SDK ina X, hooks zinafanya kazi na Gemini-proxy ✓/✗, njia salama ni Y". Kama hooks hazipatikani kwenye version hiyo → tunapanga njia B (counter kwenye bridge yenyewe — brain inaona kila tool call kabla ya kuituma) — **hakuna kuanza kwa kukosa njia**.

### 2a. RIPOTI YA AWAMU A — IMEKAMILIKA ✓ (sandbox ya majaribio, 06-10)

**Mazingira**: sandbox E2B `igziz1gkur2q…` (template `professor-xmd-browser-v3`), `claude-agent-sdk 0.2.163` (CLI bundled **2.1.286**), stub proxy ya Anthropic-format kwenye `127.0.0.1:4010` inayolog kila request halisi.

**Kila kitu kimehakikiwa NA PROXY (model = stub, si Claude) — yaani nidhamu ni 100% upande wa harness:**

| # | Kipengele | Hali | Ushahidi |
|---|---|---|---|
| A1 | Round-trip SDK↔proxy (tool_use → tool_result → final) | ✓ | ResultMessage success kila test |
| A2 | **PreToolUse hook + DENY** | ✓ | Hook iwaka; command haikutekelezwa (`RAN_BASH` haikuundwa); `permissionDecisionReason` ilifika model kwenye tool_result (`is_error`) |
| A3 | **Stop hook + block** | ✓ | `{"decision":"block","reason":…}` — reason ilifika model, turn ya ziada ilitokea, hook iwaka 2× |
| A4 | **CLAUDE.md inapakiwa** | ✓ | Inaingia kama system-reminder kwenye **user turn** (si system param — ndiyo maana greps za awali zilikosea); marker ZURLA ulionekana kwenye KILA request; inabaki baada ya tool calls |
| A5 | **append-system-prompt** | ✓ | `extra_args={"append-system-prompt": "…"}` (bila `--`!) — marker ulionekana kwenye system ya kila request |
| A6 | **Subagents** | ✓ | `agents={"researcher": AgentDefinition(description, prompt, tools)}` — subagent alipata system yake mwenye prompt yetu + guardrails za Claude (`cc_is_subagent=true`); stream inatoa ResultMessage mbili (parent + subagent) |
| A7 | **MCP server in-process** | ✓ | `create_sdk_mcp_server()` + `SdkMcpTool(name, description, input_schema, handler)` — tool iliitwa `mcp__xmd-search__web_search`, handler utekelezwa, matokeo yalirudi kwa model kwenye tool_result |
| A8 | **Token budget tracking BUILT-IN** | ✓ | CLI yenyewe inaongeza `<total_tokens>14999985 tokens left</total_tokens>` kwenye tool_results — hesabu ya context ipo bure; budget ya gharama (jumla ya run) inabaki kazi ya brain |
| A9 | Tofauti `tools=` vs `allowed_tools=` | ✓ | `tools=[…]` = orodha ya tools zinazopatikana (restriction); `allowed_tools` = auto-approve pekee. Tools za default (23) zina WebSearch/WebFetch — tuta-deliver na `tools=`/disallowed |

**Marekebisho ya muhimu (yaliyogunduliwa kwenye ukaguzi):**

1. **Fumbo la hooks limefunguliwa**: `ClaudeAgentOptions.hooks` inahitaji **`HookMatcher` objects** (si dicts) — dict ya kawaida inaconvertiwa kimya kuwa `{matcher: None, hooks: []}` (kwa sababu `_hooks_to_internal_format` inatumia `hasattr()`). Ndiyo maana hooks za majaribio ya kwanza hazikuwaka.
2. **`TodoWrite` HAIPATIKANI** kwenye CLI 2.1.286 — Claude Code 2.x imebadilisha todos kuwa **`Task*` tools**: `TaskCreate/TaskGet/TaskList/TaskStop/TaskUpdate` (+ `Task` engine ya nyuma). Swali #3 limebadilika: "Task* tools washa?"
3. `system_prompt` ina-REPLACE system nzima (✗ CLAUDE.md inapotea) → **njia sahihi**: CLI default + `setting_sources=["project"]` (CLAUDE.md) + `extra_args={"append-system-prompt": <workflow>}`.
4. Hook inaporudisha `None` → CLI inalog "Error in hook callback" (JS) ingawa inaendelea → hooks zetu zirudishe `{}` au JSON sahihi kila wakati.
5. MCP handler inapata **dict** (si dataclass) na inarudisha **format ya MCP**: `{"content": [{"type": "text", "text": json.dumps(...)}]}` — sivyo tool_result inakuwa "completed with no output".
6. Tests za stub: counter ya global inavurugwa na calls za auxiliary zinazokuja concurrent → dispatch ya stub ni **content-based** sasa (muhimu kwa G2 pia).

---

## 3. Awamu B — SHERIA ZA NIDHAMU (advisory layer: kila request)

Sheria zinazoingia kwenye **kila request** kiatu-harness (CLAUDE.md kwenye `/home/user/ws` — au system_prompt ya sasa, kulingana na A4; zote zinabaki baada ya compaction):

1. **SOMA error kamili kwanza** kabla ya ku-rerun command iliyofeli — anza kutoka mstari wa "Error"/"Failed" kwenda chini (bridge itahakikisha error ipo — Awamu D).
2. **Command ileile ikifeli mara 3 mfululizo → LAZIMA abadilishe mkakati**: andika hypotheses 3 za root-cause kwenye `STATUS.md`, kisha ajARIBI MOJA tu. Kurun command ileile si jaribio.
3. **File ileile kuandikwa mara 5 bila QA kupita → ANGALIA dependencies za file hiyo** (kosa linaweza kuwa kwenye file Nyingine — mf. CSS var iliyo-missing kwenye globals.css, si component unayoirudia).
4. **Mlango wa dharura (ulikuwa haupo)**: kipengele cha QA/Verification likifeli mara 2 BAADA ya kubadilisha mkakati → andika kwenye ripoti *"⚠️ Haikupita: <sababu halisi> · Nilijaribu: X, Y"*, weka alama ya QA hiyo `[~]` (haipiti, haijagunduliwa kamafixable), **na ENDELEA na hatua nyingine** — mradi hausimami kwa kipengele kimoja.
5. `#0000ee`, `#0000ff`, `Times New Roman` n.k. = **rangi/fonti za default za browser = ishara ya CSS var isiyokuwa defined au CSS isiyopakiwa** — kamata kwenye files za style, si kwenye component.
6. STATUS.md inasasishwa kila hatua inapokamilika (hatua ✓/…, makosa yaliyofungwa, hali ya server) — ndiyo memory ya run.

---

## 4. Awamu C — HOOKS (ushauri + brake; HAKUNA block — idhini yako 06-10)

Hooks za SDK zinaendeshwa na CLI yenyewe kabla tool haifanyi kazi — model haiwezi kuziona. Zote zinahifadhi hesabu zao kwenye `xmd-hooks-state.json` (state ya run):

| Hook | Inachokamatia | Hatua |
|---|---|---|
| **PreToolUse (Bash)** | Fingerprint ya command (normalized) + matokeo yake ya awali (exit ≠ 0 — inarekodiwa na PostToolUse) | Fail 3 mfululizo → **ujumbe wa ushauri**: "command hii imeshafeli mara 3 — KABLA ya ku-rerun: andika hypotheses 3 za root-cause kwenye STATUS.md, kisha jaribu MOJA tu. Kurun command ileile si jaribio." Fail 6 → ushauri unaosisitiza ("mara 6 sasa — ishara ya kosa lililo KWENYE SEHEMU Nyingine; angalia dependencies/files za style"). **Ujumbe tu — agent ana uhuru kamili** (issue inayosolvika kwa retry inabaki inayosolvika). |
| **PreToolUse (Write/Edit)** | Path ya file + idadi ya rewrites za mfululizo | 5 → ushauri: "file hii imeandikwa mara 5 bila QA kupita — kosa linaweza kuwa kwenye file Nyingine (mf. CSS var isiyokuwa defined kwenye globals.css). Angalia dependencies." **Ujumbe tu.** |
| **PostToolUse (Bash)** | Exit code + tail ya error | Inarekodi fail/pass kwa fingerprint kwenye state (chakula cha PreToolUse ya Bash) — Awamu D inashughulikia visibility. |
| **Stop** | Fingerprint ya jibu la model (≈90% fanana) | Jibu lileile ×3 → **emergency brake**: `{"continue": false}` + **ripoti ya "NIMEKWAMA" inaandikwa na hook yenyewe** (nini lilishindikana, alifika wapi, hypotheses, commands zilizopigwa) — si kifo kimya; chip ya UI "Imesimama — ▶ Endeleza". Hii si kumlazimisha kubadilisha mkakati — ni ukweli kuwa hakuna maendeleo ya aina yoyote. |

**Muhakiki**: hakuna hook inayozuia kitu chochote kati ya run (ujumbe wa ushauri pekee), na hakuna inayolima idadi ya JUMLLA ya turns (agizo lako). Brake inawaka tu jibu likirudiwa bila mabadilio halisi mara 3 — na hata hapo, Endeleza inaanza na hali iliyohifadhiwa.

---

## 5. Awamu D — KUONEKANA KWA MAKOSA (bridge)

Leo output ya `exit ≠ 0` inakatika kwenye herufi 8,000 kutoku **mwanzo** — violation ya 3 ya axe haikufika kwa model kabisa (ndiyo alipoanza kuvumbua "Playwright hash quirks").

- D1: `exec_end`/`exec_output` kwa command iliyo-fail: tuma **tail yenye maana** — mistari ~60 ya mwisho NA sehemu inayoanza na "Error/Failed/✘" (kwanza occurrence hadi mwisho, cap 8K bado ipo). Mafanikio (exit 0) zinabaki kama ziko (head, cap ndogo).
- D2: log ya bridge kila апп tukio la hook ("hook Bash: npm run build… fail #3 → guidance ilirudishwa") — "usisahau logs".

---

## 6. Awamu E — TOKEN BUDGET: IMEONDOLEWA (agizo la CEO 06-10 usiku)

Hakuna token budget kabisa — quota-pause ya LLM (R31-G4) ipo tayari: tokens za siku zikiisha, run inasimama na inaendelea YENYEWE ikirudi. Compaction ya SDK inaendelea kufanya kazi yake ya context.

## 7. Awamu F — VITARUSHI VIDOGO (SDK capabilities zilizokuwa zimewashwa-off)

- F1: **Task* tools ON** (TaskCreate/TaskGet/TaskList/TaskStop/TaskUpdate — badala ya TodoWrite iliyokufa kwenye CLI 2.x; imehakikiwa Awamu A #A9) — agent ana orodha ya hatua za Mpango Kazi; inamsaidia kujua yuko wapi bila kujaza context.
- F2: **`STATUS.md`** — haipo kwenye tools; ni sheria #6 ya Awamu B (agent ajiandikia kwenye file; inasaidia compaction + resume).
- F3: **Subagents ON** (idhini yako 06-10: miradi mikubwa inakuja) — `agents={"researcher": AgentDefinition(…)}`; kila subagent ana context yake (inapunguza context ya parent). Page ya sasa ni testing tu.
- F4: **Search MCP tool** (idhini yako 06-10): `create_sdk_mcp_server(name="xmd-search")` + tool `web_search` inayopiga SearXNG (`src/lib/search.ts` logic — sandbox inapiga Koyeb callback kwa Bearer pattern ya cu-event). Agent anajulishwa kuwepo kwake tu (description ya tool) — HAKUNA kum-direct wapi aitumie (sheria za Claude).

---

## 8. Awamu G — TESTS + UTHIBITISHO (kabla ya deploy)

- G1: **Python unit tests**: fingerprint/counter za hooks (fail 3→advice, 6→block; rewrite 5→advice, 8→block; stop-rudia 3→brake), budget threshold + marker, output-tail shaper (axe JSON ya violations 3 inaonekana yote). Target: suite ya `cu/tests` iendelee kuwa green (52 → ~70+).
- G2: **Jaribio la sandbox** (si production): mini-plan yenye "CSS var isiyokuwa defined + QA ya contrast isiyoweza kupita" — scenario YA 6ac4393b iliyofupishwa. Thibitisha: (a) error kamili inamfika, (b) anabadilisha mkakati kwenye fail #3 (si #13), (c) anatumia mlango wa dharura na kuandika "haikupita + sababu", (d) tokens za run < 1M, (e) budget-stop + Endeleza inafanya kazi.
- G3: **E2E moja kwenye production** (session ndogo ya majaribio kama kawaida) — kisha **wewe uhakiki UI** (chips za hook, ripoti ya budget, STATUS.md kwenye file tree).

## 9. Awamu H — DOCS + DEPLOY

- H1: `docs/R32-AGENT-DISCIPLINE.md` (vilivyofanyika + vipimo).
- H2: Backup za kila failo lililoguswa (`backups/R32/…`) → commit → push v3 → Koyeb auto-deploy → HEALTHY check.
- H3: Ripoti ya mwisho kwako: vipimo vya E2E (tokens, fails, muda) vs. session ya 6ac4393b.

---

## 10. Faili zitakazoguswa (hapa pekee)

| Faili | Mabadiliko |
|---|---|
| `cu/bridge.py` | CLAUDE.md au system_prompt ya nidhamu · hooks (settings/`ClaudeAgentOptions`) · output-tail ya makosa · TodoWrite out ya blacklist · blog za hook |
| `cu/tests/*` | unit tests mpya (hooks, budget, tail) |
| `src/lib/cu/engine.ts` | (ndogo tu) kupokelewa kwa run_end ya budget + chip ya UI — si mabadiliko ya flow |
| `docs/`, `backups/R32/` | docs + backups |

## 11. Viwango vya kukubalika (definition of done)

1. Scenario ya "CSS var + QA isiyopitika": agent anabadilisha mkakati ≤ fail 3, anaandika "haikupita + sababu", anaendelea — **na si kusimama kifo**.
2. Tokens za run ndogo ya E2E zinabaki chini ya budget; budget-stop inaripoti kwa uaminifu na Endeleza inaendelea.
3. Hakuna regression: tests zote green (TS + Python), E2E ya kawaida (build → test → GitHub/Vercel → ripoti) inafanya kazi kama kawaida.
4. Hakuna cap ya turns; hakuna memory ya kudumu; hakuna UI mpya isipokuwa chips za taarifa.

---

## Swali 3 za idhini yako — ZIMEJIBIWA ✓ (06-10 jioni)

1. **Token budget**: IMEFUTWA kabisa (usiku wa 06-10) ✓
2. **Ngazi ya hooks**: **Ushauri + brake ya majibu pekee — hakuna block ya command** ✓ (hoja yako: block inamsukuma agent kwenye mkakati mbaya zaidi na kula tokens nyingi zaidi)
3. **Task\* tools (mrithi wa TodoWrite)**: **WASHA** ✓ (+ Subagents ON, MCP search tool ON — idhini za jioni)

> **Awamu B–H sasa zinaendelea na vigezo hivi.**
