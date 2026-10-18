# Task 23 (maelezo23): Reviewer analysis — Round 0, huru (independent)

Branch: `task/23-reviewer-analysis` · Tarehe: 2026-10-18 · Inahitaji Tasks 19–22 (ziko `main` afccaee). Iko nyuma ya `XMD_MILESTONES` (OFF).

## Kilichobadilika
| Faili | Mabadiliko |
|---|---|
| `src/lib/milestone/review.ts` (mpya) | `analyse(reviewer, pack, ctx, deps)` → `ReviewRun{findings, valid, meta}`. Pia `reviewRound0` (wote wawili sambamba + uhuru), `buildReviewPrompt`, `validateFindings`, `classifyEvidence`, `extractJson`, `domLines`, `formatRoundHeader`, `leakedFragments`. Reviewers ni `designer` (Ultron) na `frontend` (Vextron) kutoka `agents.ts` |
| `src/lib/broker/broker.ts` | Chaguo la hiari `CompleteSpec.stallFirstMs`, linalopelekwa kwa `idleGuard` ya wito huo tu. Default (90s, `BROKER_STALL_FIRST_MS`) haijabadilika kwa waitaji wengine (+6/−2) |
| `src/lib/milestone/__tests__/review.test.ts` (mpya) | Unit tests 12 |
| `tests/fixtures/t23-kivuli/` + `PLAN-T23-kivuli.md` + `t23-kivuli-context.json` | Ukurasa unaofanana na KIVULI, wenye kasoro 5 za makusudi (tazama T3), pamoja na ledger/map/mini-reports/build report |
| `tests/fixtures/PLAN-T23-deployed.md` + `t23-deployed-context.json` | Site ya CEO iliyo hai (`/` ×3 viewports + `/board` 375) |

## Muundo
- **Mpangilio wa context (maelezo23):**
  1. OCB (stage `REVIEW_ANALYSE`, self = reviewer) + RoundHeader
  2. Mini-reports kamili
  3. Ledger (maamuzi yaliyofungwa)
  4. Milestone plan
  5. Build report ya XMD Computer
  6. Evidence pack: orodha ya screenshots → DOM metrics (mstari mmoja kwa kila elementi: selector, maandishi, box, font, rangi, contrast, touch) → checks → regression → console/harness errors → git diff
  7. Defect ledger
  8. Baselines
  9. YOUR TASK
- **Picha** zinatumwa kama image parts halisi (`image_url` yenye `data:` base64). Kila picha inatanguliwa na lebo ya id yake (`Image S-001 — route … viewport …`). Kikomo ni picha 12.
- **Prompts (Kiingereza):** Designer na Frontend wana system prompts tofauti kulingana na maelezo23. Sehemu ya pamoja inasema: DOM kwa vipimo, picha kwa hisia na mpangilio; eleza KILA screenshot; kila finding iwe na evidence; DEFECTS ni tofauti na PROPOSALS; unaweza kutafuta mtandaoni.
  - **Kumbuka:** hakuna web-search tool kwenye lane ya Gemini kwa sasa, kwa hiyo prompt inasema "if a search tool is available". Mtindo wa sasa unatoka kwenye maarifa ya model.
- **Output:** `{reviewer, screenshots:[{id, description}], defects:[{title, severity, expected, actual, evidence[], location?, agendaRef?}], proposals:[{title, detail, rationale, evidence[]}], notes}`.
  - **Evidence halali:** `S-xxx` / `S-xxx dom: …` (id iliyopo kwenye pack), `check:<id>` iliyopo, `regression:<route>@<viewport>` iliyopo. `ledger:A<n>` inaruhusiwa kama nyongeza tu, isisimame peke yake.
  - JSON ikiwa batili, inarudiwa **mara 2 tu**, na orodha ya makosa inaongezwa kama ujumbe. Baada ya hapo ni `valid:false` na makosa yanabaki.
- **Uhuru:** wito 2 sambamba; kila mmoja ana prompt yake. Kwa kila prompt kunahifadhiwa `sha256(system + user + hash za picha)`. `leakedFragments(outputA, promptB, promptA)` inakata jibu la A vipande vya herufi 60 (step 30) na kutafuta kipande chochote ndani ya prompt ya B. Inaruka vipande vilivyomo pia kwenye prompt ya A yenyewe, kwa sababu context ya pamoja (kama mistari ya DOM) si uvujaji.
- **Lane:** broker `allow:["gemini"]`, `cls:"heavy"`, `effort:"high"` (thinking ON), `priority:"background"`, `stallFirstMs: 300_000` (tazama "Tatizo halisi" chini).
- **LLM ikishindwa** (lanes zote zimekwisha, au 503): reviewer huyo anapata `valid:false` na `LLM call failed: …`. Raundi haianguki.
- **Bado haijaunganishwa** na `loop.ts`/`boardRunner`. Ni library tu, kama maelezo23 inavyoeleza; Tasks zijazo zitaiita.

## Tatizo halisi lililogunduliwa na kurekebishwa
Run ya kwanza ya T1 kwenye site ya CEO (picha 4 = 2.4 MB, prompt 58k chars) ilishindwa. Gemini haitumi mawazo (thinking) kwenye stream, kwa hiyo ilikaa kimya zaidi ya 90s, na `idleGuard` ya broker ikaona kama provider amekwama. Ilitokea kama ifuatavyo:
- Kulikuwa na reroute 4 (3.8-flash → 3.7 → 3.6), kisha 503 "high demand", na hops zikaisha. Kipande cha log kiko chini ("Vipande vya logs" → deployed run 1).
- Run hiyo pia ilionyesha kuwa exception iliangusha raundi nzima.

Marekebisho mawili yalifanywa:
1. `stallFirstMs` ya kila wito (300s kwa reviewers).
2. `analyse` sasa inakamata hitilafu za LLM.

Run ya pili ilikuwa na hop 0: Designer 144.6s, Frontend 159.8s. Muda huo ni zaidi ya 90s, kwa hiyo dirisha refu ni la lazima.

## Majaribio HALISI
Mazingira:
- Driver: `xmdtest/t23.mjs` (nakala: `task-23/t23-driver.mjs`).
- Sandbox mpya ya E2B, Chromium halisi, `captureEvidence` + `runChecks` halisi, na storage halisi.
- Broker halisi kwa Gemini; `fetch` imefungwa ili kuhesabu image parts za kila request.

Phase **kivuli**: fixture `t23-kivuli` kwenye `python3 -m http.server` ndani ya sandbox (375/768/1280). Phase **deployed**: `https://professor-xmd-professorcj-2c4d4efe.koyeb.app` (`/` ×3 + `/board` 375).

### T1: Output ni halali na evidence ids zipo kwenye pack → **PASS**
| Phase | Reviewer | Model | valid | attempts | image parts | defects | proposals | screenshots zilizoelezwa | ms |
|---|---|---|---|---|---|---|---|---|---|
| deployed (CEO) | designer | gemini-3.8-flash | ✅ | 1 | 4 | 3 | 5 | 4/4 | 144585 |
| deployed (CEO) | frontend | gemini-3.8-flash | ✅ | 1 | 4 | 3 | 3 | 4/4 | 159780 |
| kivuli | designer | gemini-3.8-flash | ✅ | 1 | 3 | 8 | 3 | 3/3 | 105114 |
| kivuli | frontend | gemini-3.8-flash | ✅ | 1 | 3 | 10 | 2 | 3/3 | 103722 |

`evidenceIdsExist: true` kwa phases zote mbili: kila evidence ya kila defect na proposal ilikaguliwa tena na driver dhidi ya pack.

**Findings kwenye site ya CEO (deployed):**
- **Wote wawili (blocker):** `/board` kwenye 375px haina bottom nav. Nimethibitisha kwa macho kwenye S-004: header "Board Room" + mchoro wa board + kisanduku cha prompt, bila nav. Kama ni uamuzi wa makusudi, ni wa CEO.
- **Wote wawili:** touch targets 36px (kitufe "Open menu" 36×36, "Convene board" 142×36). Hii ni sawa na `check:T23-touch-mobile` = FAIL.
- **Wote wawili:** nav links zisizo active zina contrast 2.92 (`rgb(86,92,108)` juu ya `rgb(11,12,17)`), chini ya 4.5.
- **Proposals:** kuzuia lebo za agents kukatika kwenye `/board` ("Backend & DB En…", "QA & DevOps Eng…"; zinaonekana kweli kwenye S-004), kuficha floating nav kwenye 768, na kuweka active indicator kwenye bottom nav.

### T2: Hash tofauti + grep → **PASS**
| Phase | hash designer | hash frontend | Vipande vya jibu A vilivyopatikana kwenye prompt ya B |
|---|---|---|---|
| kivuli | `955158c3856c…` | `38779bbb83ee…` | designer→frontend 0/377 · frontend→designer 0/370 |
| deployed | `230cb0202c49…` | `dc9d4b5e31cd…` | designer→frontend 0/419 · frontend→designer 0/296 |

Prompts kamili za kivuli ziko kwenye `task-23/kivuli-prompt-{designer,frontend}.txt`. Kwa ujenzi wenyewe, prompt hujengwa kabla ya wito wowote kufanyika; unit test inathibitisha hilo pia.

### T3: Kasoro zinazojulikana (informational) → **5/5**
| Kasoro ya makusudi kwenye fixture | Designer | Frontend |
|---|---|---|
| ALL-CAPS kila mahali (`text-transform: uppercase` body) | ✅ defect | ✅ defect |
| Monospace imechanganywa (Courier New) | ✅ defect | ✅ defect |
| Accent `#e11d48` imetumika kupita kiasi (header, footer, headings, bei) | ✅ defect | — (haikutajwa wazi) |
| Language toggle haipo (`#lang-toggle`) | ✅ defect + `check:M1-S1-a` | ✅ defect + check |
| Picha za bidhaa zinafanana (`tee.svg` ×6) | ✅ defect | ✅ defect |

Muungano: 5/5. Designer peke yake: 5/5; Frontend: 4/5.

### T4: Image parts zilitumwa + run bila picha → **PASS**
Log ya request (fetch wrapper), ambayo ni body iliyotumwa kweli kwa Gemini:
```
[request] Vextron → gemini-3.8-flash · parts text 5 + image 3 (216 KB) · reasoning_effort=high
[request] Ultron → gemini-3.8-flash · parts text 5 + image 3 (216 KB) · reasoning_effort=high
[request] Ultron → gemini-3.8-flash · parts text 2 + image 0 (0 KB) · reasoning_effort=high   ← analyse(images:false)
[request] Vextron → gemini-3.8-flash · parts text 6 + image 4 (2455 KB) · reasoning_effort=high   ← deployed
```
(Text parts ni system + user + lebo moja kwa kila picha. Kwenye kivuli, request ya bila picha ilirudiwa mara moja na broker: stall ya 90s kwenye Gemini 2, kabla ya marekebisho ya `stallFirstMs`.)

| Designer kivuli | Image parts | Findings | Evidence ya screenshot pekee (`S-00x` bila dom/check) | Maneno ya "kuona picha" |
|---|---|---|---|---|
| Na picha | 3 | 11 | 3 | 2 |
| Bila picha | 0 | 12 | **0** | **0** |

Bila picha, kila finding inatumia DOM metrics au checks pekee. Hata "picha zinafanana" iligunduliwa kwa kutaja `#shop > article:nth-of-type(1..6) > img` za DOM, si kwa kudai kuona picha. Prompt yenyewe inasema "PICTURES: NOT attached… Do not claim anything you could only know from looking at a picture".

### T5: Finding inanukuu thamani ya DOM inayolingana na JSON → **PASS**
Driver inachukua kila evidence ya `S-xxx dom: <selector> <prop>=<value>` na kulinganisha na JSON ya DOM ya screenshot hiyo:
- **deployed frontend: 10/10 zinalingana**, mfano `S-001 dom: body > div:nth-of-type(3) > div > header > button height=36` → JSON `36`, na `contrastRatio=2.92` → JSON `2.92`.
- **kivuli:** designer 32/39, frontend 23/32. Mfano `S-002 dom: body > header backgroundColor=rgb(225, 29, 72)` → JSON `rgb(225, 29, 72)`. Zisizolingana zote ni `fontFamily=Courier New`, ambayo JSON inaiandika `"Courier New", monospace`. Hilo ni kosa la checker ya driver (domLines inaonyesha familia ya kwanza), na lilirekebishwa kabla ya run ya deployed.
- Designer wa deployed alinakili mistari mizima ya DOM (`… width=36 height=36 … contrastRatio=5.73 …`). Thamani ni sahihi, ila muundo huo haukusomwa na checker kali (0/19). Hii si kosa la validator: evidence ni halali kwa sababu `S-001 dom:` ipo kwenye pack.

### Unit tests (12)
Zinakagua:
- mpangilio wa context na image parts halisi;
- `images:false`;
- domLines; RoundHeader; evidence classify;
- validator; extractJson;
- JSON batili → retry ×2 → halali, na batili baada ya 2 → `valid:false`;
- reviewRound0: wito sambamba, hash tofauti, hakuna uvujaji;
- leakedFragments;
- LLM ikishindwa → `valid:false` na raundi haianguki.

## Picha 4 (T1) dhidi ya picha 3 (T4): ni runs TOFAUTI
| | Run / process | Site | Screenshots | Image parts kwa kila request |
|---|---|---|---|---|
| **T1** (pamoja na T2/T5 deployed) | `node t23.mjs <sbx> deployed` (run 2, baada ya marekebisho ya stall) | Site ya CEO iliyo hai | `/` @375, @768, @1280 + `/board` @375 = **4** | 4 (designer na frontend) |
| **T4** (pamoja na T1-kivuli, T2/T3/T5 kivuli) | `node t23.mjs <sbx> kivuli` (process tofauti, iliendeshwa kwanza) | Fixture `t23-kivuli` ndani ya sandbox | `/` @375, @768, @1280 = **3** | 3 kwenye run yenye picha, 0 kwenye `analyse(images:false)` |

Plans ni tofauti (`PLAN-T23-deployed.md` ina `/board` ya ziada), kwa hiyo idadi ya picha ni tofauti. Hakuna request iliyopoteza picha: kila request inatuma picha zote za pack yake (`imageParts == screenshots`).

## Vipande vya logs (raw .log hazikuhifadhiwa kwenye repo)
**Kivuli** (T1-kivuli / T4). Mistari 1–6 ni run yenye picha; mistari 7–10 ni `images:false`:
```
kivuli evidence: S-001 /@375x667, S-002 /@768x1024, S-003 /@1280x800 · dom 3 · errors 0
checks: M1-S1-a FAIL · M1-S1-b FAIL · M1-S3-a PASS · M1-S3-b PASS
[info] 🔎 Vextron (frontend) M1 R0: prompt 46021 chars · parts: text 4 + image 3 (S-001, S-002, S-003) · hash 38779bbb83ee
[request] Vextron → gemini-3.8-flash · parts text 5 + image 3 (216 KB) · reasoning_effort=high
[info] 🔎 Ultron (designer) M1 R0: prompt 46026 chars · parts: text 4 + image 3 (S-001, S-002, S-003) · hash 955158c3856c
[request] Ultron → gemini-3.8-flash · parts text 5 + image 3 (216 KB) · reasoning_effort=high
[info] 🔎 Ultron (designer) M1 R0: prompt 46038 chars · parts: text 1 + image 0 · hash 5951d94517e2
[request] Ultron → gemini-3.8-flash · parts text 2 + image 0 (0 KB) · reasoning_effort=high
[broker] Gemini 2 · gemini-3.8-flash · review-analyse:M1:R0:designer · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Ultron → gemini-3.8-flash · parts text 2 + image 0 (0 KB) · reasoning_effort=high
```
**Deployed run 1** (imeshindwa: stall ya 90s, sababu ya `stallFirstMs`):
```
deployed evidence: S-001 /@375x667, S-002 /@768x1024, S-003 /@1280x800, S-004 /board@375x667 · dom 4 · errors []
checks: T23-live PASS · T23-touch-mobile FAIL · T23-overflow PASS
[info] 🔎 Ultron (designer) M1 R0: prompt 58297 chars · parts: text 5 + image 4 (S-001, S-002, S-003, S-004) · hash 9ad73c12a65f
[request] Ultron → gemini-3.8-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[info] 🔎 Vextron (frontend) M1 R0: prompt 58292 chars · parts: text 5 + image 4 (S-001, S-002, S-003, S-004) · hash 15366a4b51c7
[request] Vextron → gemini-3.8-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 3 · gemini-3.8-flash · review-analyse:M1:R0:designer · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Ultron → gemini-3.8-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 4 · gemini-3.8-flash · review-analyse:M1:R0:frontend · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Vextron → gemini-3.8-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 1 · gemini-3.8-flash · review-analyse:M1:R0:designer · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Ultron → gemini-3.7-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 2 · gemini-3.8-flash · review-analyse:M1:R0:frontend · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Vextron → gemini-3.7-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 2 · gemini-3.7-flash · review-analyse:M1:R0:frontend · busy 30s → reroute · 503 [{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in deman
[request] Vextron → gemini-3.7-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 1 · gemini-3.7-flash · review-analyse:M1:R0:designer · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Ultron → gemini-3.7-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 3 · gemini-3.7-flash · review-analyse:M1:R0:frontend · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Vextron → gemini-3.7-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 4 · gemini-3.7-flash · review-analyse:M1:R0:designer · busy 60s → reroute · stalled: provider hakutuma data kwa 90s
[request] Ultron → gemini-3.6-flash · parts text 6 + image 4 (2451 KB) · reasoning_effort=high
[broker] Gemini 1 · gemini-3.6-flash · review-analyse:M1:R0:designer · busy 30s → reroute · 503 [{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in deman
InternalServerError: 503 [{"error":{"code":503,"message":"This model is currently experiencing high demand. Spikes in demand are usually temporary. Please try a
```
**Deployed run 2** (T1/T2/T5, `stallFirstMs` 300s, hop 0):
```
deployed evidence: S-001 /@375x667, S-002 /@768x1024, S-003 /@1280x800, S-004 /board@375x667 · dom 4 · errors []
checks: T23-live PASS · T23-touch-mobile FAIL · T23-overflow PASS
[info] 🔎 Vextron (frontend) M1 R0: prompt 58292 chars · parts: text 5 + image 4 (S-001, S-002, S-003, S-004) · hash dc9d4b5e31cd
[request] Vextron → gemini-3.8-flash · parts text 6 + image 4 (2455 KB) · reasoning_effort=high
[info] 🔎 Ultron (designer) M1 R0: prompt 58297 chars · parts: text 5 + image 4 (S-001, S-002, S-003, S-004) · hash 230cb0202c49
[request] Ultron → gemini-3.8-flash · parts text 6 + image 4 (2455 KB) · reasoning_effort=high
```

## Baselines
| | Kabla | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 552 + 2 skipped | 564 + 2 skipped (+12) |
| pytest | 330 + 3 skipped | 330 + 3 skipped |
| unittest | 263 OK | 263 OK |
| eslint (bila backups/) | 29 | 29 |

## Usafi
- Uploads 22 za storage zimefutwa (kivuli 6 + deployed run1 8 + run2 8). Ukaguzi wa `object/info` ulionyesha 0/22 zimebaki.
- Sandbox `iqms60pey7hervidyx7mr` imeuawa.
- `~/.cache/t23` imeondolewa baada ya kunakili matokeo kwenye `docs/tests/task-23/`.
- Gharama ya Gemini Flash: kivuli requests 4 (+1 reroute), deployed run1 requests 10 (stalls), run2 requests 2.
