# TASK 12 (maelezo12): Milestone map ya Optimus (Gemini Flash) + validation + fallback · ushahidi (2026-10-17)

Branch `task/12-milestone-map`. Kila kitu kiko nyuma ya `XMD_MILESTONES` (default OFF). Code iliunganishwa kwenye main `bae0261`, deploy `9543ba1d` HEALTHY.

## Faili
| Faili | Nini |
|---|---|
| src/lib/milestone/map.ts (mpya) | `generateMilestoneMap({brief, agendas, hasUI, sessionId})` inaita `brokerComplete({agentId:"pm", cls:"heavy", allow:["gemini"]})`: lane ya Gemini iliyopo, tier Flash inapendelewa (uzito 1.2), Flash-Lite ni fallback ya broker tu. Hakuna provider mpya. Prompt ya system ni ile ya spec **neno kwa neno** (`MAP_SYSTEM_PROMPT`). User prompt ina agents halisi (`optimus: Optimus, Project Manager` …) na agenda zenye namba. Validator ya Task 9; ikishindwa, makosa yanarudishwa kwa model (majaribio 3 kwa jumla). Baada ya kushindwa mara 3 → `fallbackMap`: ukubwa `ceil(N/4)`, foundation (hasUI) … quality_deploy, mixed, roster yote, `usedFallback=true`, pamoja na log line inayoonekana. Test hook `maybeBreakMapOutput` inafanya kazi TU na `XMD_TEST_HOOKS=1` + `XMD_TEST_MAP_INVALID=1`. `detectHasUI` ni kanuni ya code: brief ikikanusha UI ("hakuna/bila/no/without UI") → hapana; owners designer/frontend → ndiyo; maneno ya UI kwenye brief → ndiyo. |
| src/lib/boardRunner.ts | Hook (FLOW-MAP B.1, baada ya `agenda_created`) chini ya `milestonesEnabled()` **pekee**: `generateMilestoneMap` (kupitia `pausable`) → `putRecord(sid, "map", map, 0)` → `bcast({type:"milestoneMap", …})` → persist. Kosa halisimamishi Board. Pia `runner.msChips`: `getPersistItems` huchuja hidden chips, kwa hiyo chips za MS zinarudishwa humo, na resume inazirejesha kutoka items (tupu flag ikiwa OFF). |
| src/lib/milestone/store.ts | `msChip()` imetolewa nje ya `putRecord` (umbo lile lile) ili runner aweze kuishikilia. |
| src/lib/types.ts | `BoardEvent` + `{type:"milestoneMap"; map; usedFallback; attempts}` (additive). |
| src/lib/board/adapter.ts | `HIDDEN` + `MILESTONE`: chip ya store haionyeshwi kwenye UI (ilivuja, angalia T4). |
| tests | `milestone/__tests__/map.test.ts` (17) na `board/adapter.milestoneMap.test.ts` (2). |

**Kipengele 5 (agenda mid-run):** FLOW-MAP B.2 = HAPANA (hakuna `agenda.push/splice`; route ya agenda ni GET tu), kwa hiyo hakuna kilichofanyika.
**adapter.ts:** switch kuu ina `default: break;` (mstari 1127), kwa hiyo kind isiyojulikana inapuuzwa. Imethibitishwa pia kwa test (snapshot ni sawa na bila event).

## T1: LLM halisi, saizi 3 (`xmdtest/mapT1.mjs`) · PASS
Export ya `Dark-Vibe-…md` haipo kwenye repo/docs/uploads (`find / -iname "*dark-vibe*"` = 0), kwa hiyo orodha ya KIVULI (N=15) imeandikwa na mimi.
```
=== N=10 · valid=true · usedFallback=false · attempts=1 · retries=0 · 12726ms · lanes=Gemini 3 · gemini-3.8-flash (tier flash)
  log success: 🗺️ Milestone map: Optimus ameandika milestones 5 kwa agenda 10 (jaribio 1/3).
  M1 1-2 foundation visual [optimus,ultron,vextron] Design System & Base Layout
  M2 3-5 core mixed [optimus,ultron,vextron,megatron] Tour Discovery & Showcase
  M3 6-8 core mixed [optimus,vextron,megatron] Availability, Booking & M-Pesa Checkout
  M4 9-9 secondary mixed [optimus,ultron,vextron,megatron] Operator Admin Management
  M5 10-10 quality_deploy technical [optimus,cybertron,vextron,megatron] QA, Hardening & Production Launch
=== N=15 · valid=true · usedFallback=false · attempts=1 · retries=0 · 9373ms · lanes=Gemini 4 · gemini-3.8-flash (tier flash)
  log success: 🗺️ Milestone map: Optimus ameandika milestones 5 kwa agenda 15 (jaribio 1/3).
  M1 1-3 foundation visual [optimus,ultron,vextron] Design System & Foundational UI
  M2 4-6 core visual [optimus,ultron,vextron] Lounge Showcase & Menu Presentation
  M3 7-9 core mixed [optimus,ultron,vextron,megatron] Events Schedule & WhatsApp Booking
  M4 10-13 secondary mixed [optimus,ultron,vextron,megatron] Gallery, Venue Details & Event Management
  M5 14-15 quality_deploy technical [optimus,vextron,cybertron] Quality Audit, Compliance & Production Launch
=== N=20 · valid=true · usedFallback=false · attempts=1 · retries=0 · 9785ms · lanes=Gemini 1 · gemini-3.7-flash (tier flash)
  log success: 🗺️ Milestone map: Optimus ameandika milestones 5 kwa agenda 20 (jaribio 1/3).
  M1 1-2 foundation visual [optimus,ultron,vextron] Design Foundation & App Shell
  M2 3-7 core mixed [optimus,vextron,megatron] Authentication & Core School Data Structure
  M3 8-13 core mixed [optimus,vextron,megatron] Attendance & NECTA Exam Processing
  M4 14-18 secondary mixed [optimus,vextron,megatron,ultron] M-Pesa Fees, Parent Portal & Admin Insights
  M5 19-20 quality_deploy technical [optimus,megatron,cybertron] Quality Assurance, Security & Production Deployment
```
Zote ni valid **jaribio la kwanza (retries 0)**, tier flash. `gemini-3.8-flash` ilipata 429 ya daily kwenye akaunti 3/4/1/2, na broker ikahamia
`gemini-3.7-flash` (bado ni Flash).

## T2: validator inakataa ramani 5 mbovu (`map.test.ts`) · PASS
| Ubovu | Kosa halisi |
|---|---|
| gap | `map.milestones[1].agendas.from: gap — agendas 4..4 are not covered (expected from=4, got 5)` |
| overlap | `map.milestones[1].agendas.from: overlap — agenda 3 already covered by milestones[0] (expected from=4, got 3)` |
| bad last phase | `map.milestones[2].phase: last milestone must be "quality_deploy" (got "secondary")` |
| unknown agent | `map.milestones[1].roster[3]: unknown agent "bumblebee" (known: optimus, ultron, vextron, megatron, cybertron)` |
| missing optimus | `map.milestones[2].roster: must contain "optimus"` |
Udhibiti: ramani sahihi inakubaliwa. Pia kuna unit tests za retry: makosa yanarudishwa kwa model ("Your map is invalid. Errors: …"), na jaribio la 2 linafaulu.

## T3: fallback kwa LLM halisi + test hook (`XMD_TEST_HOOKS=1 XMD_TEST_MAP_INVALID=1 node mapT3.mjs`) · PASS
```
env XMD_TEST_HOOKS=1 XMD_TEST_MAP_INVALID=1
LOG warning: 🗺️ Milestone map: jaribio 1/3 limekataliwa (9 makosa): map.milestones[0].phase: must be one of foundation|core|secondary|quality_deploy (got "nope") | map.milestones[0].rationale: must be a non-empty string | map.milestones[0].ro
LOG warning: 🗺️ Milestone map: jaribio 2/3 limekataliwa (9 makosa): map.milestones[0].phase: must be one of foundation|core|secondary|quality_deploy (got "nope") | map.milestones[0].rationale: must be a non-empty string | map.milestones[0].ro
LOG warning: 🗺️ Milestone map: jaribio 3/3 limekataliwa (9 makosa): map.milestones[0].phase: must be one of foundation|core|secondary|quality_deploy (got "nope") | map.milestones[0].rationale: must be a non-empty string | map.milestones[0].ro
LOG warning: ⚠️ Milestone map: Optimus ameshindwa mara 3 — fallback ya code imetumika (usedFallback=true): milestones 4 za agenda ≤3 kila moja.
RESULT valid=true usedFallback=true map.usedFallback=true attempts=3 lanes=Gemini 2 · gemini-3.7-flash (tier flash) | Gemini 4 · gemini-3.7-flash (tier flash) | Gemini 1 · gemini-3.6-flash (tier flash) generatedBy=code-fallback
  M1 1-3 foundation mixed [optimus,ultron,vextron,megatron,cybertron] Foundation and design: Design system tokens
  M2 4-6 core mixed [optimus,ultron,vextron,megatron,cybertron] Agendas 4–6: Tour listing
  M3 7-9 core mixed [optimus,ultron,vextron,megatron,cybertron] Agendas 7–9: Booking form
  M4 10-10 quality_deploy mixed [optimus,ultron,vextron,megatron,cybertron] Quality and deploy: QA, SEO and deploy
```
Hook ni inert bila bendera zote mbili (unit test). Koyeb ina `XMD_TEST_HOOKS` tangu task za awali, lakini haina `XMD_TEST_MAP_INVALID`
wala `XMD_MILESTONES`, kwa hiyo hook haifanyi kazi huko.
Fallback ni valid kwa N=2..40 × hasUI (unit test). Kwa N=1 + hasUI haiwezekani (ya kwanza foundation = ya mwisho quality_deploy); kanuni ya mwisho inashinda.

## T4: run halisi ndogo, flag ON (local `next dev`, `XMD_MILESTONES=1`, DB/keys halisi) · PASS
- **Jaribio la 1 (131fe82b) lilifichua kasoro:** event ya `milestoneMap` ilitoka, lakini DB ilikuwa na `milestoneChips 0`. Sababu: `getPersistItems()` huchuja hidden chips (pamoja na MILESTONE tangu Task 10), kwa hiyo persist ya Board ilifuta rekodi. Status pia ilikuwa mpya (`milestone_map`), nje ya allowlist ya orphan. **Marekebisho:** `runner.msChips` + `persist("agenda_created")`. Session ilifutwa.
- **Jaribio la 2 (3f7be81e, brief "xmdtest-map … Hakuna UI … Agenda MBILI"):**
```
SSE: {"type":"milestoneMap","map":{"version":1,"sessionId":"3f7be81e-…","totalAgendas":2,"generatedBy":"optimus@Gemini 4 · gemini-3.8-flash (tier flash)","usedFallback":false,"milestones":[M1 1-1 foundation, M2 2-2 quality_deploy]},"usedFallback":false,"attempts":1}
log:  🗺️ Milestone map: Optimus ameandika milestones 2 kwa agenda 2 (jaribio 1/3).
DB (baada ya msg_done 18, status agenda_2_locked): hiddenChips [MILESTONE, RESUME_STATE, USAGE] · milestoneChips 1
loadMilestones: version 1 · M1:1-1:foundation M2:2-2:quality_deploy · usedFallback false
```
- **UI (Chromium, `/board?session=3f7be81e…` kwenye Koyeb):** kabla ya deploy, HTTP 200, ukurasa kamili, console errors 0, **lakini `__PROFESSOR_XMD_MILESTONE__` ilionekana** kwenye ukurasa (adapter `HIDDEN` haikuwa na MILESTONE, ikiwa ni pengo la Task 10). Baada ya marekebisho + deploy 9543ba1d: `http 200 · has_title True · has_agenda True · MS prefix leaked False · errors []`.
  Test ya adapter inashika kasoro hiyo (inashindwa ikiwa regex ya zamani).
- Kumbuka: `tsc` + `next dev` + run kwa pamoja vililemea RAM ya 2GB ya sandbox (dakika ~25 bila kujibu). Sasa vinaendeshwa kimoja kimoja.

## T5: flag OFF, run halisi Koyeb (deploy 9543ba1d, `XMD_MILESTONES` haipo, `briefA.json` ileile ya baseline) · PASS
Session 3150d170: `completed · COMPLETED_UNVERIFIED`.
| Ulinganisho | Matokeo |
|---|---|
| Signature ya muundo (`runsig.mjs`) dhidi ya B2 (baseline Task 10) | **sawa kabisa** (`True`): status, mode, kinds [chip,cu,msg,title], hidden chips 3 zilezile, milestoneChips 0, cu aina 11 zilezile, finalState |
| Mfuatano wa kinds hadi `round` ya kwanza (ambapo hook iko) | `mode system log title_done system log system log system log system log round`, sawa na A2 na B2 |
| Kinds za SSE | hakuna `milestoneMap`; kind "mpya" pekee ni `msg_reset`, ambayo ipo tangu commit ya kwanza na inaonekana pia kwenye baseline `runT5a.log` (retry ya stream) |
Mfuatano kamili hautumiki kama kipimo: hata A2 ≠ B2 kwenye code ileile (urefu 319 dhidi ya 297, tofauti za LLM).
Runtime: pause 2 za quota ("judge: deadline 300s"), zote auto-resume (21:37:01 na 21:49:43), kama B2. **Hakuna bridge ya pili**: hakuna sandbox mpya iliyobaki baada ya run.

## Baselines (kabla → baada)
tsc 0 → 0 · vitest 420 + 2 skipped → **439** + 2 skipped (+19) · pytest 308 · unittest 238 OK · eslint 0 (faili zilizoguswa).

## Usafi
Sessions 131fe82b, 3f7be81e, 3150d170 zimefutwa (session, ledger, mini-reports, cu_files 204, snapshots 2 za bucket). `/api/boardroom/active` → null.
