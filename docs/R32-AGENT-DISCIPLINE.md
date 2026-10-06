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
