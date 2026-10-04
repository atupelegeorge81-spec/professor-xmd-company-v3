# MPANGO KAZI R30 — PLAN MODE: Board ya Maamuzi + Mpango Kazi wa Agent (computer-use)

> **Hali: IMETEKELEZWA ✅ (4 Oktoba 2026).** Awamu A–D zote zimekamilika: `tsc --noEmit` ✅ · `npm test` 23/23 ✅ · `next build` ✅.
> Kumbuka: §B2 ya awali ilipendekeza chip ya plan — **imebadilishwa kwa amri ya Mkuu**: card ya plan ni
> **ileo ya ReportWriter (shimmer, HAKUNA chip)**. Logs zipo kila hatua. Endeleza kusoma kwa muundo kamili.
> Tarehe: 4 Oktoba 2026 · Imeandaliwa baada ya kusoma repo nzima (mistari 27,000+), documents zote R16–R29, na ukaguzi wa Appwrite yako halisi (collections 9).

## STATUS YA UTEKELEZAJI (live)

| Awamu | Kilichotekelezwa | Files |
|---|---|---|
| **A — Engine** | `workPlan.ts` (pure module, 8 sehemu, chips/regex, assemble deterministic); `miniReports.ts` + `plans.ts` (collections, self-bootstrap); plan mode kwenye `env.ts` (`BOARD_PLAN_MODE`, default ON); `boardRunner.ts`: mode kwenye Runner + resume chip, mini-reports → collection (HATUA 5/5B/relock/resume-redo, ledger = pointer + fallback), code phase IMERUKWA plan mode, HATUA 6.6 (vipande 2 → Data Guard → repair ×1 → save → chip), HATUA 7 (ledgerText/appendix/decisionsBrief/scriptAudit zinasoma mini kutoka collection; §10 inaelekeza /api/plans; hakuna §10.1 plan mode) | `src/lib/board/workPlan.ts`, `src/lib/server/miniReports.ts`, `src/lib/server/plans.ts`, `src/lib/boardRunner.ts`, `src/lib/env.ts`, `src/lib/board/finale.ts` |
| **B — UI** | `PlanItem` + `FinalePhase "plan"` (types); adapter: chips za plan ZIMEMEZWA → card; `PlanWriter` (clone ya ReportWriter: shimmer "Optimus anaandika Mpango Kazi wa Agent", sehemu 8, "Sasa: Step N — …", saved prism card, download); StageStream/StageRail (`Mpango` badala ya `Script`); exportMarkdown; sessions page (PLAN badge + kitufe cha kupakua) | `src/lib/stage/types.ts`, `src/lib/board/adapter.ts`, `src/components/board/stage/Plan.tsx`, `StageStream.tsx`, `StageRail.tsx`, `exportMarkdown.ts`, `src/app/sessions/page.tsx`, `src/lib/server/sessionIndex.ts` |
| **C — API** | `/api/plans`: orodha (metadata), `?session=`, `?project=`, `&download=1` (.md), headers `X-Plan-Status`/`X-Plan-Steps`; indexes self-bootstrap | `src/app/api/plans/route.ts` |
| **D — Ukaguzi** | vitest (mpya kwenye repo): `npm test` → **23/23 ✅** (chips/regex, sections, steps, capSampleCode, code-gen §2/§3, assembly: renumbering, backend-is-truth, problems); `tsc --noEmit` ✅; `next build` ✅ | `src/lib/board/workPlan.test.ts`, `package.json` |
| **E — R29 fixes (optional)** | **HAIJATEKELEZWA** — mapungufu ya R29 yaliyoorodheshwa chini (kuagiza, "nimethibitisha", memory bleed) yanabaki kama kazi ya baadaye | — |

**Mtiririko wa plan mode (ukweli wa code):** mjadala + LOCK haujaguswa → code phase inarukwa (`planModeRun`) → Validator (HATUA 6.4) → *(hakuna assembly ya script)* → **HATUA 6.6**: chip `📋 …Kipande 1/2 (1-4)` → Optimus anaandika §1–4 (§2/§3 zinabadilishwa na code-gen ya Fact Sheet) → chip `Kipande 2/2 (5-8)` → §5–8 (Work Steps: `### Step N — Title` + template) → `assemblePlanDocument` (renumber + problems log) → Data Guard (deterministic) → hitilafu → repair pass 1 → `saveProjectPlan` (upsert, retries ×3) → chip ✅ + `finale.planId` → HATUA 7 ripoti (Kiswahili, §10 = Action Plan inayoelekeza /api/plans). Resume: `mode` + `planId` vimo kwenye RESUME chip v2; kipande kilichoandikwa kamili hakiandikiwi upya; `missingParts(mode)` inajua lini Mpango/Script/Ripoti/Memory zinakosekana.

---

---

## 0. Kwa ufupi (executive summary)

**Tunabadilisha PROFESSOR-XMD kuwa na mode mbili:**

| | **CODE MODE (ya sasa)** | **PLAN MODE (mpya — DEFAULT)** |
|---|---|---|
| Mjadala | agenda → maswali → utafiti → owners/observers → LOCK | **HAUBADILIKI KABISA** — flow ileile |
| Code | agents wanaandika faili kamili, review, fix, assembly ya script | **Hapana.** Ila **sample code ndogo** (snippet ya hoja, mf. `.btn-wa` CSS) inaruhusiwa |
| Mwisho | ripoti + script kamili ya mwisho (§10.1) | **RIPOTI yako (Kiswahili)** + **MPANGO KAZI WA AGENT (Kiingereza)** kwa computer-use |
| Appwrite | mini-report **imo ndani ya ledger** (`decision_detail`) | mini-report kwenye **collection yake** (`mini_reports`); ledger inabaki **ya maamuzi rasmi ya agents wote** |

**Kwa nini:** Ushahidi wa R29 (Mkate Bora): mjadala kwa maneno ulikuwa imara — agenda 5/5 LOCKED, data rasmi 100% — lakini awamu ya code ndiyo iliyovuruga (A2–A5 zote `code_status=rejected`, mgongano wa waandishi 2 kwa faili 1, kosa la `new_context` halikugunduliwa, ripoti ilidai mambo yaliyotekelezwa wakati hayajatekelezwa). Ukaguzi wangu wa Appwrite ulithibitisha hili kwenye data halisi.

**Uamuzi wa Mkuu uliofungwa tayari:**
1. Work plan = **Kiingereza** · hatua **8–15 (coarse)**
2. Plan mode = **DEFAULT** (code mode inabaki nyuma ya env flag `BOARD_PLAN_MODE=off`)
3. **Mini-reports zinatenganishwa na ledger** — "mini report ni ya Optimus; ledger ni ya kila agent"
4. Sample code ndogo **inaruhusiwa**; sheria ya **script FULL inatoka**
5. Mwisho wa Board: **ripoti yako + mpango kazi wa agent** unaopewa computer-use

---

## 1. Uelewaji wangu (ulichojiangalia nimeyaelewa)

### 1.1 Flow ya sasa ya engine (`src/lib/boardRunner.ts`, mistari 3,204)

```
startRun(project)
 ├─ HATUA 1: AGENDA (~line 1054) + R26 FACT SHEET (~line 1072, kwa CODE — deterministic)
 ├─ HATUA 2–6: KILA AGENDA (~line 1285): maswali → utafiti (SearXNG + cache ya Gemini embeddings)
 │    → owners wanaunda hoja → CONSENSUS GATE (~line 1874, hakuna forced decision)
 ├─ CODE-WRITING PHASE (~line 1906) → review (reviewVerdict) → fix → approved_code
 ├─ HATUA 5: LOCK (~line 2200) — mini-report ya MUDA (fallback, bila LLM) kwa usalama wa resume
 ├─ Observers objection (~line 2275, max 1 valid) → Deliverables (~line 2679)
 ├─ HATUA 5B: MINI-REPORT YA MWISHO ya Optimus (~line 2693) → kwa sasa iingia ledger.decision_detail
 ├─ R20 FINISHING PASS (~line 2727) + HATUA 6.4 validator (~line 2740)
 ├─ HATUA 6.5: ASSEMBLY YA SCRIPT YA MWISHO (~line 2768, deterministic — code, si LLM)
 └─ HATUA 7: RIPOTI (~line 2821) — vipande 2 (1–5, 6–10) kutoka LEDGER pekee + Data Guard
      → reports (packed gz1) + kiambatisho mini-reports
```

Vuline vya R26 vyote vipo na vinafanya kazi: **Fact Sheet** (`board/factSheet.ts`), **Data Guard** (`board/dataGuard.ts` — bei/saa/simu/email/anwani, prose + code modes), **contrast guard**, **memory scoping** (mradi huu vs masomo ya zamani), review verdict ya kweli, code blocks kamili, assembly deterministic.

### 1.2 Hali ya Appwrite yako (imekaguliwa live — 4 Okt 2026)

| Collection | Docs | Maelezo |
|---|---|---|
| `boardroom_sessions` | 38 | latest: Mkate Bora (completed, 27 Sep 23:56 UTC) |
| `reports` | 40 | latest: Mkate Bora — packed gz1, unpacked 69,166 chars, vichwa 34 |
| `board_ledger` | 97 | Mkate Bora: A1–A5 LOCKED + A3 SUPERSEDED 1 (supersedes inafanya kazi) |
| `agent_memory` | 6 | agents 5 + company (self ~4.4–5.4K chars kila moja) |
| `agent_memory_events` | 234 | checkpoints/reflections/consolidated |
| `agent_conversations` | 18 | chat za agents |
| `search_cache` | 21 | semantic cache (Gemini embeddings, space+dims) |
| **`mini_reports`** | **0** | ⚠️ **imeundwa TAYARI (attrs 10 kamili) — HAKUNA code inayoitumia** (nimehakiki main + branches zote 3) |
| **`project_plans`** | **0** | ⚠️ **imeundwa TAYARI (attrs 11 kamili, plan_content 900K) — HAKUNA code inayoitumia** |

**Ugunduzi:** Mtu (wewe au session iliyopita) alikuwa tayari anaandaa makao ya mpango huu — collections mbili zipo na muundo unaofaa 100%. Hazina indexes, na hazina docs. Sisi tunajaza tu.

**Uthibitisho kutoka data ya Mkate Bora (lewaza la kwanza):**
- §10.1 ya ripoti: faili 7 za agents zote zina alama **"⚠️ code haikupitishwa na mkaguzi"** (`code_status=rejected` A2–A5). Faili 3 tu safi ni za DATA RASMI (`menu.json`, `hours.json`, `config.json`) — ambazo **mfumo (code) ndiye aliandika, si LLM.** → Ushahidi wa moja kwa moja kwamba awamu ya code ndiyo dhaifu, na data rasmi inapita vizuri.
- Mini-report ya A3 (5,816 chars) ina kila kitu kinachohitajika kujenga work plan: exact strings (`"Oda za keki zifanywe angalau saa 48 kabla."`), logic (`encodeURIComponent(fullString)` mara moja), rangi (`#1A1A1A` juu ya `#25D366` ~8.5:1), touch targets (44px), validation (phone === `2556XXXXXXXX`, CI blocker).

### 1.2.B Madhumuni ya kila sehemu (baada ya mabadiliko)

| Sehemu | Ni ya nani | Kazi yake |
|---|---|---|
| `board_ledger` | **Agents wote** (engine) | Uamuzi RASMI: status, decision_summary, owners, objections, evidence, sources, rationale, supersedes, locked_at, code_status |
| `mini_reports` | **Optimus pekee** | Tafsiri ya kina ya agenda: `detail` kamili + `carried_constraints` |
| `project_plans` | **Mfumo + Optimus** | Mpango kazi wa computer-use agent |
| `reports` | Optimus | Ripoti yako ya Kiswahili |

### 1.3 Yasiyoguswa kwa mjumla (kanuni ya R24 inaendelea)

- Flow ya mjadala (agenda → maswali → utafiti → owners/observers → pingamizi → consensus gate → LOCK) — **HAIGUSWI**
- Fact Sheet, Data Guard, contrast guard, memory scoping, mini-report structure, Ledger, Resume/Endeleza — **vinabaki na vinatumika kwenye plan mode**
- Broker, Pulse/usage, agents chat, search/cache — **haziguswi**
- Sessions 38 za zamani + reports 40 — **hazibadilishwi kabisa** (readers wana fallback)
- Code mode nzima — **haifutwi**; inabaki nyuma ya `BOARD_PLAN_MODE=off`

---

## 2. Mabadiliko kamili — faili kwa faili

### Awamu A — Plan mode core + kutenganisha mini-reports na ledger

| # | Kazi | Faili | Maelezo ya kina |
|---|---|---|---|
| **A1** | Env flag ya mode | `src/lib/env.ts` | `BOARD_PLAN_MODE` (default `on`) · `PLAN_STEPS=coarse` (8–15). `off` = flow ya sasa 100% bila tofauti. |
| **A2** | Mini-reports kwenye collection yake | `src/lib/miniReport.ts` + mpya `src/lib/server/miniReports.ts` | `saveMiniReport()`: create/update kwa `project_id + agenda_index`. **`ledger.decision_detail` HAJAZWI tena** kwa sessions mpya — inapata reference fupi tu (`"mini-report → mini_reports/<$id>"`, chars ~50) kwa traceability. HATUA 5 (fallback ya muda) nayo inaandika `mini_reports` na alama yake ileile (`<!-- xmd:mini-fallback -->`). Kikomo cha majaribio (E1 cha R24) kinabaki. |
| **A3** | Readers wote: mini_reports kwanza → fallback ledger | `boardRunner.ts` (HATUA 7 `finalBoardResolution`), `board/rehydrate.ts`, `board/finale.ts`, R20 finishing-pass, `components/board/exportMarkdown.ts`, `components/agents/BoardSteps.tsx` | Q: `mini_reports` kwa `project_id` → ipo? itumie. Haipo (session ya zamani)? → `ledger.decision_detail` (unpacked). Hii ndiyo inayolinda sessions 38 za historia. |
| **A4** | Sample-code rules (badala ya code nzima) | `boardRunner.ts` CODE-WRITING PHASE (~1906) → "SAMPLE PHASE" kwenye plan mode; `codeFence.ts`, `scriptBox.ts` | Plan mode: snippet ndogo **inaruhusiwa** kama hoja (cap: lines ~40 / chars ~1,500 kwa fence moja). Fence Kubwa ya faili kamili → inakatwa + chip "⚠️ sample code imepunguzwa (plan mode — scripts kamili zimekatishwa)". Data Guard (prose) inaikagua snippet: bei/saa/simu zisizo kwenye Fact Sheet → snippet inapewa alama, si kuondolewa (mjadala unabaki halisi). Hakuna review-fix loop, hakuna `approved_code`, hakuna `code_status` mpya. |
| **A5** | Generator ya WORK PLAN | mpya `src/lib/board/workPlan.ts` + prompt mpya ya Optimus | **Part za CODE (deterministic, si LLM):** header (jina, session, tarehe, mode), **§2 Official Data** kutoka Fact Sheet **neno kwa neno**, §3 Constraints, jedwali la agenda (index, jina, status, owners, kiungo cha mini-report yake), `total_steps` (kuhesabwa kutoka headers). **Part za LLM (Optimus, class HEAVY, vipande 2 × budget 24K):** §1 Objective & Deliverable, §4 Tech Stack & Design Tokens, §5 File Structure, **§6 WORK STEPS (8–15, coarse, muundo uniform — tazama §3 hapa chini)**, §7 QA Checklist, §8 Agent Rules. Kila hatua inabeba data rasmi ya sehemu yake **inline** (agent asilute hatahitaji kutafuta). |
| **A6** | Data Guard kwa plan | `board/dataGuard.ts` (prose mode ipo tayari) + `workPlan.ts` | Plan nzima inakaguliwa: kila bei/saa/simu/email/anwani katika plan **lazima iwepo kwenye Fact Sheet**. Kosa → sehemu husika tu inaandikwa upya (mara 2 max) → kisha plan inahifadhiwa na status `guard_failed` + orodha ya mismatches (mfumo haanguki). |
| **A7** | Save ya plan | `workPlan.ts` → `project_plans` | doc: project_id, session_id, title (kutoka session title), objective (code-gen), status (`active` / `guard_failed`), constraints (Fact Sheet), official_data (Fact Sheet JSON), **plan_content (packed gz1)**, total_steps. Indexes: `idx_session [session_id]`, `idx_project [project_id]`. |
| **A8** | Ripoti ya plan mode | `boardRunner.ts` HATUA 7 (~2821) | Vipande 2 (1–5, 6–10) vinabaki. Mabadiliko: **§10.1 script HAITAJAZWI** — §10 = "Action Plan" inayomuhtasari na kurejelea work plan. §10.2/10.3 zinabadilika kuwa **ukaguzi wa WORK PLAN dhidi ya DATA RASMI** (Data Guard prose) — matokeo: "Official data: 100% sahihi" au orodha. Kiambatisho cha mini-reports kinabaki (kutoka `mini_reports` sasa). |
| **A9** | Mode kwenye session | `boardRunner.ts` + Appwrite | Session mpya inapata attribute `mode` (`plan` / `code`; null kwa zamani = `code`). Inaundwa **kwa self-bootstrap** (mfano wa agent_chats — log: `[sessions] mode attribute imeongezwa`), si kwa mkono. Chip ya mode kwenye items (gz) kwa resume. |
| **A10** | Resume/Endeleza ya plan mode | `boardRunner.ts` finishing-pass + `miniReports.ts` | "Haijakamilika" checks mpya: mini-report iliyobaki fallback (kanuni ileile ya R24/E1), **plan iliyokatika** (sehemu za LLM zilizokosekana tu ndizo zinaandikwa upya — kanuni ya R20), ripoti kama kawaida. Status mpya: `plan_part_1/2` → `completed` (completed inawekwa tu baada ya ripoti NA plan zote). |

### Awamu B — UI

| # | Kazi | Faili |
|---|---|---|
| **B1** | Kadi ya "Mpango Kazi wa Agent" kwenye session details: jina, hatua N, status, **download** `Mpango-Kazi-<Title>.md`, kiungo cha API | `src/app/sessions/page.tsx`, `src/components/reports/ReportBody.tsx` |
| **B2** | Chip ya live: "📑 Optimus anaandika Mpango Kazi wa Agent…" + badge "plan" kwenye sessions list | `board/adapter.ts`, `sessions/page.tsx` |
| **B3** | Ripoti ya plan mode inaonyesha §10 mpya (bila script); kiambatisho cha mini-reports kinabaki | `ReportBody.tsx`, `exportMarkdown.ts` |

### Awamu C — API kwa computer-use agent

| # | Kazi | Faili |
|---|---|---|
| **C1** | `GET /api/plans?session=<id>` — plan kamili: meta + `plan_content` (markdown) + `total_steps` + `official_data` (parsed) + `constraints` | mpya `src/app/api/plans/route.ts` |
| **C2** | `GET /api/plans?session=<id>&step=N` — hatua MOJA + context yake (data rasmi ya hatua + provenance ya agenda) | ileile (hiari — **adapter**, inakamilika baada ya kuisoma computer-use) |
| **C3** | `GET /api/plans/<session>/mini-reports` — provenance kamili kama agent anahitaji kusoma mjadala wa agenda | mpya |

> C2/C3 zinaundwa sasa kwa guess ya awali (markdown + step query) — baada ya kunipa project yako ya computer-use, **adapter pekee ndiyo inaweza kubadilika** (sio engine wala muundo wa plan). Hii ndiyo insuransi ya kuunganisha websites mbili.

### Awamu D — Majaribio (kabla ya kuita imekamilika)

| Aina | Maudhui | Vigezo vya kukubalika |
|---|---|---|
| **Unit** (mpya `research/unit/r30.test.js`, node:test) | miniReports save/read/fallback (zamani vs mpya) · workPlan parser + step counter + uniform structure · Data Guard prose kwa plan (fixtures: **mini-reports halisi za Mkate Bora — nazizo nimepull** kutoka Appwrite yako) · sample-code cap · resume ya plan (part 2 missing → sehemu hiyo tu) · mode flag off = regression ya code mode | Zote zipite; fixtures za Mkate Bora zikamate mismatch yoyote ya data |
| **E2E mock** (broker mock, kama R20/R26) | Board kamili ya plan mode: 5/5 LOCKED · mini-reports 5 kwenye collection · plan imehifadhiwa · Guard 0 mismatches · ripoti bila §10.1 · Detach→Resume katikati ya plan | YOTE SAWA, hakuna kosa linalomfikia mtumiaji |
| **Live** (keys zako — `.env.local` nimeiweka tayari kwenye repo, haifuatiliwi na git) | Board MOJA halisi (brief mpya au ya Mkate Bora) | Uhakiki wa docs halisi kwenye Appwrite: mini_reports 5, project_plans 1, data 100%, total_steps 8–15 |

### Awamu E — Masuala ya mjadala ya R29 (yanapendwa — yanaomba idhini yako tofauti)

| # | Jambo | Fix |
|---|---|---|
| E1 | "kuoda" → "kuagiza" (Kiswahili kwenye mini-reports/ripoti) | Prompt ya report/mini-report: gazeti la maneno sai-hai (glossary) + post-check ndogo ya maneno yanayojulikana kosekana |
| E2 | Madai ya uongo "nimethibitisha…" yanakubaliwa bila ukaguzi | Prompt ya observers/owners: dai la uthibitisho linahitaji chanzo (source/ledger); bila chanzo linaandikwa "dai bila ushahidi" |
| E3 | "AGREE … lakini …" (kukubali huku ukipinga) | Stance parser: AGREE yenye DISAGREE ya wazi ndani yake → inaangukiwa kuwa "MIXED" na mwenyekiti anaombwa ayasafishe kabla ya LOCK |
| E4 | Memory ya miradi ya zamani (R29 iliona bado kunako-vuja) | Ukaguzi wa recall output kwa sessions mpya; kuimarisha label ya "LESSONS ONLY — si maamuzi ya mradi huu" |

---

## 3. Muundo wa WORK PLAN (`plan_content`) — template kamili (Kiingereza)

```markdown
# AGENT WORK PLAN — <Project Title>
> Generated by PROFESSOR-XMD Board · Session <id> · <date> · Mode: PLAN

## 1. Objective & Deliverable
<What the agent is building, in 3–6 sentences. Source: brief + Agenda 1 decision.>

## 2. Official Data (VERBATIM — never invent, never reformat)
<CODE-GENERATED from Fact Sheet. Every price, hour, phone, email, address,
closed day, mandatory sentence — word for word.>

## 3. Constraints
<CODE-GENERATED: page weight, zero-JS, language, WhatsApp-only, etc.>

## 4. Tech Stack & Design Tokens
<From LOCKED decisions: framework, fonts, colors (hex + contrast), touch targets…>

## 5. File Structure
<tree: every file, its job, which agenda owns it>

## 6. Work Steps (TOTAL: <N>)
### Step 1 — <Imperative title>
- **Goal:** <what this step builds>
- **Source:** Agenda <n> mini-report (authoritative) — API: /api/plans/<session>/mini-reports
- **Files:** <paths touched>
- **Instructions:** <detailed, step-by-step>
- **Official Data (verbatim):** <only the values this step needs, word for word>
- **Sample Code (reference only):** <snippet from the debate, if any>
- **Verification:** <what must be TRUE for this step to count as done>
- **Depends on:** <step numbers>

### Step 2 — … (uniform structure, 8–15 steps total)

## 7. QA Checklist
- [ ] <size guard, contrast, "Imefungwa" row, phone === placeholder, …>

## 8. Agent Rules
- DATA RASMI is law. Never invent prices/hours/names/descriptions.
- If something was NOT discussed, write "not discussed" — never fill gaps.
- Mark anything you add beyond this plan: NYONGEZA (not discussed).
- Stop and report on: data conflict, missing file, failed verification ×2.
```

**Kanuni za generator:** hatua hazipiti 15 wala hazishuki 8 (coarse — kila hatua ni kazi kubwa yenye verification yake); kila thamani rasmi inatumaina **inline** kwenye hatua inayoihitaji; maneno ya lazy "official strings" (mf. sentensi ya saa 48, "Imefungwa") yanakuwa code-blocked ili agent azinakili badala ya kuandika upya.

---

## 4. Mabadiliko ya Appwrite (yote)

| # | Kazi | Umuhimu |
|---|---|---|
| 1 | Indexes 4: `mini_reports [project_id, agenda_index]`, `mini_reports [session_id]`, `project_plans [session_id]`, `project_plans [project_id]` | 🔴 lazima (queries za readers + API) |
| 2 | Attribute `boardroom_sessions.mode` (string 16, nullable) — self-bootstrap kwa mfano wa agent_chats | 🟠 inapendekezwa (docs za zamani: null = code mode) |
| 3 | Hakuna kufutwa, hakuna kubadilisha attributes zilizopo, hakuna kugusa docs 38+40+97 za zamani | 🔴 kanuni |

---

## 5. Mpangilio wa utekelezaji (utaratibu halisi)

```
1. A1 (flag) → A2+A3 (mini-reports split + fallback readers) → unit tests → tsc → build
2. A4 (sample phase) + A5–A7 (work plan generator + guard + save) → unit (fixtures za Mkate Bora) → tsc → build
3. A8–A10 (ripoti ya plan mode + resume) → e2e mock kamili (pause/resume/guard)
4. B (UI) → ukaguzi wa UI (desktop + 390px)
5. C (API) + indexes za Appwrite
6. D live: Board MOJA halisi → ukaguzi wa docs halisi → RIPOTI R30 + zip
7. E (baada ya idhini yako tofauti)
```

Kila hatua inaishia `tsc --noEmit` safi + `next build` safi + tests zipite. Siku ya mwisho: **Board halisi moja ya majaribio** — wewe ndiye unayeibonyesha, mimi nakagua data.

---

## 6. Hatari na jinsi ninavyoziepuka

| Hatari | Mkizo |
|---|---|
| `boardRunner.ts` ni faili kubwa (3,204 lines) | Nagusa mahali pa haba tu (phase gates ~1906, ~2768, ~2821 + HATUA 5B save); kila awamu na tests zake — si yote kwa pamoja |
| Kuvunjika kwa sessions za zamani | Fallback: mini_reports kwanza → ledger.decision_detail; e2e inajaribu session ya ZAMANI (fixture ya Mkate Bora) na ya mpya |
| Tests za zamani (393+89) hazipo kwenye repo | Nitaandika set mpya (r30) + e2e mock kamili; regression inategemea e2e + Board halisi moja kabla ya kuita kazi imekamilika |
| LLM inabuni data kwenye plan | Data Guard (prose) + rewrite ya sehemu (2 max) + status `guard_failed` ikiwa bado; §2 Official Data na §3 Constraints ni **code-generated 100%** — LLM hairushiwi hata neno moja la data |
| Plan kukata katikati (mtandao/quota) | Vipande 2 + finishing-pass ya R20 inatumika (sehemu zilizokosekana tu) |
| Computer-use akitaka format tofauti | Adapter ya API (C2/C3) pekee inabadilika — engine na muundo wa plan haviguswi |
| Ununuzi wa tokens wa plan (Optimus HEAVY ×2) | Imepimwa: Gemini Flash reserve inalinda (FLASH_RESERVE=4 — script+ripoti); plan inachukua nafasi ya script ya mwisho, kwa hiyo matumizi ya jumla HUSHUKA (awamu ya code nzima + reviews 8 + fixes 8 ndiyo inayoondoka) |

---

## 7. Vinavyosubiri ruhusa yako (maswali ya mwisho)

1. **Idhini ya jumla ya Awamu A–D** — hii ndiyo kazi kuu. (E inaomba idhini tofauti.)
2. **`boardroom_sessions.mode` attribute** (A9) — nzuri au utapendelea mode ibaki ndani ya items pekee (bila kugeusa schema ya sessions)?
3. **Ripoti ya plan mode, sehemu ya 10** — nimependekeza §10 = Action Plan ya kawaida + rejelea ya plan (bila script). Uko sawa, au unataka namba za sehemu zibadilike kabisa kwenye plan mode?
4. **Kama computer-use project yako inapatikana sasa** — nipe, niiusome kabla ya C (API), ili adapter iandikwe mara moja sahihi. Kama hapana: C naondelea kwa guess + adapter baadaye.

---

## 8. Ahadi ya mwisho (nini kitaonekana ukikubali)

Ukisema **"ANZA"**: naanza na 1 (A1→A3), kisha nakuja na muhtasari wa kile nilichofanya + matokeo ya tests kabla ya kuendelea hatua inayofuata — **hatua kwa hatua, hakuna kunyumbua kutoka kwenye hati hii.** Kama kitu kitahitaji kubadilika njiani, naandika marekebisho hapa kwenye hati KABLA ya kuyatekeleza (mfano wa R24: "mapendekezo yanasubiri idhini").

*Mwisho wa utekelezaji: RIPOTI-R30 + zip + ukaguzi wako wa Board halisi moja.*
