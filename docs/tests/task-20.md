# Task 20 (maelezo20): Evidence — DOM metrics (namba, si makadirio)

Branch: `task/20-dom-metrics` · Tarehe: 2026-10-18 · Inahitaji Task 19 (iko `main` 70f3e53).

## Kilichobadilika
| Faili | Mabadiliko |
|---|---|
| `cu/xmd-evidence.mjs` | `collectDomMetrics` (inaendeshwa ndani ya ukurasa) + `domSummary`; kila screenshot → `S-nnn.dom.json`; `manifest.domMetrics[]` = `{screenshotId, path, url:"", summary}`; kosa → `errors[{kind:"dom"}]` (screenshot haiharibiki) |
| `src/lib/milestone/evidence.ts` | `EvidenceSpec.keySelectors` (mstari `Key Selectors:` wa plan), `DOM_MAX_ELEMENTS=150`, `domMetricsPath`, config ina `keySelectors` + `domMaxElements` |
| `src/lib/milestone/types.ts` | `EvidenceDomSummary`; `EvidenceDomMetrics.url?/summary?`; error kind `"dom"` |
| `src/lib/milestone/schemas.ts` | `validateEvidencePack` inakagua `domMetrics[]` (screenshotId ipo, `.dom.json`, url http(s) chini ya requireUrls, data: imezuiwa, summary) |
| `src/lib/cu/evidence.ts` | harness inapakia kila `dom.json` kwenye storage (bucket ya CU) na kujaza `url`; `evidenceSummary` ina `dom N` |
| `src/lib/milestone/plan.ts` | template ya visual: mstari wa hiari `Key Selectors: …` (Optimus anaweza kutaja elements muhimu) |
| `src/lib/server/appwrite.ts` | storage shim: `.json` → `application/json` (mstari 1; kabla ilikuwa octet-stream) |
| `tests/fixtures/{evil,good,big}.html`, `PLAN-T20.md`, `t20-assert.mjs` | fixtures + assertions za T1/T2/T4/T5 |
| `src/lib/milestone/__tests__/dom-metrics.test.ts` | unit tests 8 |

## Muundo wa `S-nnn.dom.json`
- **page:** `scrollWidth, scrollHeight, innerWidth, innerHeight, clientWidth, hasHorizontalOverflow, overflowPx, bodyBackground,
  fontsLoaded[], fontsFailed[], imagesWithoutAlt[{selector,src}], headingOrderProblems[]`
- **elements[] (≤150):** `selector, tag, text(40), box{x,y,w,h} (CSS px, ukurasa), visible, keySelector, fontFamily, fontSize,
  fontWeight, letterSpacing, textTransform, color, backgroundColor (ancestor wa kwanza asiye wazi, alpha zimechanganywa juu ya canvas
  nyeupe), backgroundFrom, backgroundImage, contrastRatio (WCAG), hasText, largeText, contrastMin (4.5 / 3), lowContrast, interactive,
  touchTarget{w,h} + tooSmall (<44×44)` kwa interactive
- `totalCandidates, truncated, problems[]` (mf. keySelector batili / haikupata kitu)

## Maamuzi yangu (yaliyochukuliwa bila kuuliza)
1. **`keySelectors` hazikuwepo kwenye plan** (grep: 0). Nimeongeza mstari wa HIARI `Key Selectors:` (template + parser). Plan zisizo na mstari huo zinaendelea na generic tu.
2. **Metrics zinapimwa KABLA ya screenshot.** Jaribio la kwanza la T4 lilishindwa kwa 1.004px: probe ilionyesha full-page capture inabadilisha layout (`#tiny` y 288.09 → 287.09 baada ya `page.screenshot({fullPage:true})`). Kabla ya capture = layout halisi ya mtumiaji.
3. **Kipaumbele cha kikomo:** inayoonekana (1e7) > keySelector (5e6) > landmark/heading header·nav·main·footer·h1–h3 (4e6) > interactive (2e6) > eneo. Landmark imeongezwa baada ya T5 ya kwanza kushindwa (vitufe 300 viliondoa header/main/h1). Elements zilizobaki zinarudishwa kwa mpangilio wa DOM.
4. **Kazi nzito kwa waliobaki tu:** hatua 1 (rect + style + score) kwa wagombea wote; hatua 2 (selector, background, contrast) kwa ≤150. Hii inalinda kurasa zenye maelfu ya `<a>`.
5. **Contrast:** rangi ya element yenyewe juu ya background yake. `backgroundImage:true` inaonyesha contrast ni ya makadirio (gradient/picha hazipimwi). `lowContrast` inahesabiwa tu kwa maandishi yanayoonekana; large text (≥24px au ≥18.66px bold) = 3:1.
6. **headingOrderProblems:** heading ya kwanza si h1 · h1 zaidi ya moja · h1 baada ya h2–h6 · kuruka ngazi (h2→h4). Kurudi juu (h3→h2) si kosa.
7. **`hasHorizontalOverflow` = scrollWidth > documentElement.clientWidth** (bila scrollbar), na `overflowPx` kamili.
8. **dom.json zinapakiwa storage** kama PNG (reviewers wanazisoma hata sandbox ikifa). Upload ikishindwa → `errors[{kind:"upload"}]`.
9. `t20-assert.mjs` iko ndani ya repo (`tests/fixtures/`) ili majaribio yarudiwe; inazindua server yake (4174) na Playwright ya pili kwa T4.

## Majaribio HALISI (sandbox ya E2B `professor-xmd-browser-v3` + storage halisi)
Driver: `xmdtest/t20.mjs` = `captureEvidence` halisi + `__t19.evidenceUploader` halisi (kama Task 19).

**Run ya kufunga (t20b):** `node t20.mjs <sb> t20b tests/fixtures tests/fixtures/PLAN-T20.md`
```
{"exit":0,"shots":5,"dom":5,"domUrls":5,"uploaded":10,"errors":[],"invalid":[],"consoleErrors":[],"ms":8994}
```
Kisha ndani ya sandbox: `cd /home/user/xmdtest-t20b && node t20-assert.mjs .xmd/evidence/M1/R0 .`

### T1: evil fixture — PASS (8/8)
```
PASS T1 · S-001 horizontal overflow 3px — hasHorizontalOverflow=true overflowPx=3 scrollWidth=378 innerWidth=375
PASS T1 · 20×20 button tooSmall — #tiny touchTarget={"w":20,"h":20} tooSmall=true
PASS T1 · contrast ≈ 2:1 flagged — #faint color=rgb(182, 182, 182) bg=rgb(255, 255, 255) contrastRatio=2.03 lowContrast=true
PASS T1 · uppercase + monospace — #mono textTransform=uppercase fontFamily=monospace
PASS T1 · img without alt — imagesWithoutAlt=["#noalt"]
PASS T1 · h1 after h3 — headingOrderProblems=["first heading is h3 (\"Section before the title\"), expected h1","h1 (\"Evil page title\") comes after h3"]
PASS T1 · manifest summary mirrors the defects — {"elements":8,...,"hasHorizontalOverflow":true,"overflowPx":3,"tooSmall":1,"lowContrast":1,"imagesWithoutAlt":1,"headingOrderProblems":2}
PASS T1 · keySelector problem reported (.does-not-exist) — ["keySelector \".does-not-exist\" matched 0 elements"]
```
### T2: good fixture — PASS (8/8, viewports 375 na 1280)
```
PASS T2 · S-003 @375x667 no overflow — scrollWidth=375 clientWidth=375
PASS T2 · S-003 @375x667 no tooSmall — interactive=5 tooSmall=
PASS T2 · S-003 @375x667 text contrast ≥ 4.5 — text elements=13 min contrast=6.7
PASS T2 · S-003 @375x667 no alt/heading problems — imagesWithoutAlt=0 headingOrderProblems=0
PASS T2 · S-004 @1280x800 (sawa: overflow 0 · tooSmall 0 · min contrast 6.7 · alt/heading 0)
```
### T3: site ya CEO (deployed) — PASS
`node t20.mjs <sb> t20e - planT20d.md --base https://professor-xmd-professorcj-2c4d4efe.koyeb.app` (route `/`, viewports 3)
```
{"exit":0,"shots":3,"dom":3,"domUrls":3,"uploaded":6,"errors":[],"invalid":[],"consoleErrors":[],"ms":36404}
t20e validateEvidencePack(requireUrls)=OK dom.json parsed 3/3 URLs 6/6 → 200   (dom.json content-type: application/json)
```
| Kipimo | 375×667 | 768×1024 | 1280×800 |
|---|---|---|---|
| Urefu wa header (top bar) | 56px | 56px | 56px |
| h1 font size / weight ("Karibu tena, Mkuu.") | 25px / 600 | 28px / 600 | 28px / 600 |
| Kitufe cha kwanza | "Open menu" 36×36 (tooSmall) | "Open menu" 36×36 (tooSmall) | "System" 32×32 (tooSmall) |
| Horizontal overflow | false (375/375) | false (768/768) | false (1280/1280) |
| Body background | rgb(7, 8, 11) | rgb(7, 8, 11) | rgb(7, 8, 11) |

Ziada (ugunduzi halisi kwenye site): tooSmall 7 / 8 / 18; lowContrast 3 kwenye simu = links za bottom nav "Board/Agents/Reports"
(rgb(86,92,108) juu ya rgb(11,12,17), **2.92:1**, 10.5px). Fonts: GeistSans, GeistMono. imagesWithoutAlt 0, heading problems 0.
Haya ni matokeo tu; site haijaguswa.

### T4: namba ni sahihi — PASS (3/3, ≤ 0.004px)
```
PASS T4 · #tiny box within 1px — dom.json={"x":0,"y":291.09,"w":20,"h":20} boundingBox={"x":0,"y":291.09,"w":20,"h":20} maxDiff=0.004px
PASS T4 · #title box within 1px — dom.json={"x":0,"y":128.16,"w":375,"h":37} boundingBox={"x":0,"y":128.16,"w":375,"h":37} maxDiff=0.004px
PASS T4 · #noalt box within 1px — dom.json={"x":24.45,"y":264.59,"w":40,"h":40} boundingBox={"x":24.45,"y":264.59,"w":40,"h":40} maxDiff=0.004px
```
(Jaribio la kwanza: FAIL 1.004px → uamuzi #2 → PASS.)

### T5: kikomo cha 150 — PASS (4/4)
```
PASS T5 · every dom.json ≤ 150 elements — S-001:8/8 S-002:8/8 S-003:14/14 S-004:14/14 S-005:150/363
PASS T5 · S-005 big: capped at exactly 150 of 363 — elements=150 totalCandidates=363 truncated=true
PASS T5 · hidden buttons dropped first (all kept are visible) — visible=150 hiddenKept=0
PASS T5 · large landmarks kept (header, main, h1) — body > header, body > header > h1, body > main
```
**Jumla: T20 assertions 23/23 PASS** (sandbox halisi). Pia ilipita mara 2 kabla (local + t20a).

### Storage + usafi
- URLs zote (t20a 10, t20b 10, t20d 6, t20e 6) → 200 kabla ya kufuta. Uploads **32** zimefutwa (`bucket del 200`; ombi la pili la kufuta → 0 zilizobaki).
- Workspaces `xmdtest-t20*` zimefutwa ndani ya sandbox, na sandbox `ikd5s1rlyielehite0yim` imeuawa. Hakuna session/row ya CEO iliyoguswa.

## Unit tests + baselines
- `dom-metrics.test.ts` (8): Key Selectors (backticks / bold / koma ndani ya `[]` / none), config 150, domMetricsPath, kind `dom`,
  validate domMetrics (halali, requireUrls, data:, screenshotId isiyokuwepo, path, summary).
  Ilikamata kosa halisi: `cmdLine` inachukua backtick ya kwanza tu → parser ya mstari mzima.
- **Baselines (kabla → baada):** tsc 0 → 0 · vitest 525+2 skipped → **533+2 skipped** · pytest 330 passed + 3 skipped → sawa ·
  unittest 263 OK → sawa · eslint (bila `backups/`) 29 problems kabla → 29 baada (hakuna jipya; faili zilizobadilishwa: 0 errors).
  NB: `eslint .` kamili ina 45 problems (16 za ziada ziko `backups/R31/**`, ambazo hazipo git). Haya yalikuwepo kabla ya task hii; sijayagusa (kanuni 3).

## Kasoro zinazojulikana / noti
- Contrast haipimi maandishi juu ya picha/gradient (alama `backgroundImage:true`).
- `tooSmall` inahesabu pia links zilizo ndani ya mstari wa maandishi (WCAG 2.5.8 inazisamehe). Reviewers waangalie `tag`/`box`.
- Pipeline bado iko nyuma ya `XMD_MILESTONES` (OFF by default). Legacy haiguswi.
