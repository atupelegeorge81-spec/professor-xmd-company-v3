# Task 34 — MISSION TWO: UI ya milestone mode (badges, header, cards, logs) · ushahidi

- Branch `task/34-ui` (kutoka `ee6acdd`, T33) · spec: `task-docs/MISSION-2.md` (CEO 2026-10-22).
- **Agizo la CEO (2026-10-22):** mock/unit tests tu; hakuna mazungumzo halisi (REAL test ni task inayofuata). App HAIKUWASHWA kwenye sandbox (S1) —
  components zimekaguliwa kwa `renderToStaticMarkup` ndani ya vitest.

## Kilichojengwa
| Eneo | Faili | Maelezo |
|---|---|---|
| Matukio ya UI (engine) | `src/lib/milestone/uiEvents.ts` (mpya) | chip iliyofichwa `__XMD_MSUI__:{…}` — `map`, `st` (hali), `cu` (Computer inaingia; r=0 build, r≥1 marekebisho + COs), `rev` (reviewers R0/Rn), `final0`/`final` (ripoti ya CEO). Inahifadhiwa kwenye items → replay = live. |
| Loop | `milestone/loop.ts` | hooks `ui`/`say`: build + rebuild ya evidence → `cu r0`; R0 → `rev r0` + findings KAMILI za kila reviewer (`renderR0Findings`); kila raundi ya fix → `cu{r,cos}`; kila uthibitisho → `rev r` + `renderVerifyFindings`; sync → zamu za reviewers kama ujumbe. |
| Runner | `boardRunner.ts` | `msUi` (chip iliyofichwa + bcast), `say` (msg ya kawaida iliyohifadhiwa), `onMsState` → `st` (bila marudio), ramani → `map`, ripoti ya mwisho → `final0`/`final`. |
| Adapter | `lib/board/adapter.ts` | items mpya `msMap`, `msMark` (enter/computer/review/talk), `msCos`, `msReport`; plan ya kila milestone → PlanItem YAKE (`milestone`, kichwa `Mk · title`); `R-Mk-n` → badge ya mjadala + zamu kamili; chips 7 za kiufundi (`MS_LOG_ONLY`) hazionyeshwi. `stage.milestones` + `msActive` kwa header. Non-milestone: `cuDivider` ileile. |
| UI | `stage/Milestones.tsx` (mpya), `StageStream.tsx`, `StageRail.tsx`, `kit.tsx`, `Plan.tsx` | badge ya milestone ya PEKEE (machungwa→waridi + bendera, anchor `#ms-Mk`); badges za Computer (violet), reviewers (sky), mjadala (pink) — familia ya badge ya agenda (haijabadilika); card ya Milestones (familia ya card ya Agenda; mstari wa maendeleo + hali live); card ya marekebisho ya Optimus (familia ya Mpango Kazi); card ya ripoti ya CEO; header: pill M1/M2… kabla ya ajenda zao, inayoendelea = gradient + nukta inayopiga. **Card ya "Pakua" imeondolewa kabisa** (Plan.tsx). Toni mpya `TONE.ms` `#fdba74`. |
| Logs | `BoardLive.tsx` | chips zilizofichwa → `addLog("system")` (Overview › Logs), live tu (si replay — zisirudiwe). |
| Export | `exportMarkdown.ts` | items mpya zote + **mini-report ya review KAMILI** (`memo:Mk`, ingizo zote) kutoka `/api/conversations?id=` — chat inaonyesha badge ya "mini report imeandikwa" tu. |
| Tests config | `vitest.config.ts` | `oxc.jsx.runtime=automatic` (tests za render za `.tsx`; tsconfig ya Next ina `jsx: preserve`) — haiathiri build ya Next. |

Hazijaguswa (kwa agizo): badge ya agenda, badge/TaskLine ya "mini report imeandikwa", ripoti ya Computer (`cuReport`), Build Report, kitufe cha Export (BoardRoom.tsx).

## Chips zilizohamishiwa kwenye logs (regex `MS_LOG_ONLY`, zimelinganishwa na maandishi halisi ya engine)
`🧾 Mk Rn:` (loop:911) · `📸 Evidence ya Mk Rn` (145) / `📸 Mk Rn:` (1177) · `🔍 Mk Rn:` (1206) · `🔌 Mk lanes` (640) · `✅ Mk Rn verify` (1406) · `🔧 Mk Rn: XMD Computer` (833) · `🖥️ XMD Computer · Milestone` (cu/engine:1164).

## Tests (mock/unit — HAKUNA mazungumzo halisi)
| Faili | Tests | Inathibitisha |
|---|---|---|
| `lib/board/adapter.milestoneUi.test.ts` (mpya) | 14 | round-trip ya msui · render ya findings bila kukata · card ya Milestones + header · badge ya milestone KABLA ya agenda yake (mara moja) + `msActive` · chips 8 halisi hazionekani, "mini report imeandikwa"/Build Report/🏁 zinabaki · plan per-milestone (cards 2 tofauti, maandishi ndani, `saved`) · Computer: badge kwa build + kila raundi, COs ndani ya card, hakuna cuDivider · reviewers: badges R0/R1 + ujumbe kamili (3 000+ herufi) · mjadala R-M1-0 · ripoti ya CEO (stream → md kamili) · replay = live · export (milestones, badges, COs, ripoti) · export ya mini-report kamili (ingizo 5, bila "(compressed)") · flag OFF haijaharibika |
| `components/board/stage/Milestones.render.test.ts` (mpya) | 6 | render ya MsMark ×4, MsMapCard (1/3, hali), MsCosCard, MsReportCard (LIVE / link ya Reports, si download), StageRail (mpangilio `M1 A1 A2 M2 A3 M3 A4`, M2 active), PlanWriter bila "Pakua" (milestone + legacy) |
| `milestone/__tests__/verify.test.ts` | +3 | loop halisi (mock LLM): `cu1 rev1 cu2 rev2`, COs `CO-001` → `CO-002` attempt 2, ujumbe 4 kamili wa reviewers; sync → zamu 2 kama ujumbe; bila hooks → hakuna kosa |
| `milestone/__tests__/loop.test.ts` | +1 | build ya kwanza: `ui:cu:M1:0` kabla ya `build` |

**Mutation checks** (adapter imerudishwa baada ya kila moja): kuzima kuficha chips → tests 2 zinaanguka; kuzima badge ya milestone → tests 2 zinaanguka.

## Baselines
| | Kabla (T33 `ee6acdd`) | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 56 files + 1 skipped · 804 passed + 2 skipped | 58 files + 1 skipped · **828 passed + 2 skipped** (+24) |
| eslint (`--ignore-pattern 'backups/**'`) | 29 | 29 (Milestones.tsx haina kosa) |

## Hatari / ambacho hakijathibitishwa (kinasubiri REAL test)
- Muonekano halisi kwenye simu 375px / desktop haujaonekana kwa macho (S1: app haiwashwi kwenye sandbox) — classes ni responsive (`max-w-[86%]`, `truncate`, avatars `hidden sm:flex`).
- `boardRunner` (msUi/say/onMsState) halina unit test ya moja kwa moja — linathibitishwa kwenye REAL run.
- Matukio ya `activity` (badge ya mini report) hayahifadhiwi — kama zamani (si sehemu ya kazi hii).
- `🖥️ XMD Computer · Milestone …` inaonekana mara 2 kwenye logs (blog ya engine + chip) — ndogo.
