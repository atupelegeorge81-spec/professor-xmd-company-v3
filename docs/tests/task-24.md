# TASK 24 — Mjadala wa timu (REVIEW) na Change Orders za Optimus — ushahidi wa majaribio HALISI

Branch `task/24-review-discussion` · tarehe 2026-10-18 · `XMD_MILESTONES=1`.

**Njia ya majaribio:**
- Board halisi: `next dev` kwenye port 3100 na `XMD_TEST_HOOKS=1` + `XMD_TEST_REVIEW_INPUT`.
- `POST /api/boardroom` → `maybeCloseMilestones` → `runMilestoneBuild` → plan → build → **review**.
- Plan, evidence pack na findings za T23 vinatoka faili (bila Computer/E2B). Mjadala (mashine ya agenda ya Board, LLM halisi), consolidate ya Optimus (LLM halisi) na store ya milestone (Supabase halisi) ni HALISI.
- Drivers na matokeo yako `docs/tests/task-24/`. Raw `.log` hazikuhifadhiwa; vipande viko hapa chini.

## Muhtasari

| Test | Run | Matokeo |
|---|---|---|
| **T1** findings za T23 T1 → maamuzi → COs, zote valid, kila defect ≥1 CO | A2 | ✅ PASS: defects 6/6 + maamuzi 7/7 zina CO; COs 5 valid kwenye jaribio la 1 |
| **T2** proposal ya reviewer mmoja HAIKUBALIWI; ya wote wawili + Optimus INAKUBALIWA na inaingia ledger | B1, B3 | ✅ PASS: P-02 (Ultron pekee) REJECTED; P-03 (wote) ACCEPTED → `decisions` |
| **T3** proposal inayopingana na decision iliyofungwa (serif dhidi ya A1 Inter) → CR, si CO | B3 | ✅ PASS: `CR-M1-0-01` (P-01 ↔ A1); COs 0 za serif |
| **T4** acceptance checks za kila CO kwa runners za task 21: PASS/FAIL sawa, ERROR hapana | A2 + E2B | ✅ PASS: checks 10, FAIL 10, **ERROR 0** |
| **T5** reviewers wanarejeleana; nukuu 3 | A2 | ✅ PASS: nukuu 3 hapa chini |
| **CEO #3** search ya Board inapatikana ndani ya REVIEW | A1, A2, B3 | ✅ PASS: searches 3 kwa kila run; SearXNG halisi (A1); READ_SOURCE (B3) |

**Baselines (kabla → baada):**
- tsc 0 → 0
- vitest 564 + 2 skipped → **594 + 2 skipped** (+27 `reviewAgenda.test.ts`, + `broker/stall.test.ts` kwa timeout ya 90s ya calls zisizo za reviewers)
- eslint (bila `backups/`) 29 → 29

## Runs

| Run | Ingizo | Session (imefutwa) | Kilichotokea |
|---|---|---|---|
| A1 | `inputA.json` (site ya CEO, findings za T23 T1) | `f05acf04` | Mjadala + consolidate vilifanya kazi. Kasoro 2 zilionekana (chini) → zimerekebishwa |
| **A2** | `inputA.json` | `5d72ba96` | ✅ T1, T4, T5 |
| B1 | `inputB.json` (kivuli + proposals zilizotengenezwa) | `fa711136` | ✅ T2; T3 haikufika (P-01 ilikataliwa bila CR) → kanuni ya CR imeongezwa |
| B2 | `inputB.json` | `a166166e` | CR ilifanya kazi, lakini parser ilibatilisha D-002 kimakosa → parser imerekebishwa |
| **B3** | `inputB.json` | `6b71ac53` | ✅ T2 + T3 safi |

### Kasoro zilizopatikana na majaribio halisi (zote zimerekebishwa, na zina unit tests)

1. **A1: `illegal transition DISCUSSING -> FIXING`.**
   - Chanzo: test hook iliita `runMilestoneBuild` moja kwa moja, ikaruka CAS `DISCUSSING → PLANNING`.
   - Rekebisho: hook sasa inapitia `maybeCloseMilestones`, njia halisi ya production.
2. **A1: NEW PROPOSALS zilisomwa kama P-T1…P-T9.**
   - Chanzo: mashine ya Board inaongeza `[Condition added by X]: …` chini ya uamuzi (AGREE yenye masharti), na sehemu ya `NEW PROPOSALS: none` ilimeza aya hizo.
   - Rekebisho: kila sehemu inaishia kwenye mstari mtupu au `[Condition added by`.
3. **B1: P-01 (serif) ilikataliwa "contradicts locked decision A1" lakini haikuwa CR.**
   - Rekebisho, tabaka mbili:
     - prompt: mgongano na ledger/brief LAZIMA uende CHANGE REQUESTS;
     - code: proposal iliyokataliwa kwa sababu inayotaja mgongano na A-n au brief → CR (onyo linarekodiwa).
4. **B2: `INVALID DEFECTS: D-004 (Duplicate of D-002; merged into D-002)` ilibatilisha D-002 pia.** Hiyo ni blocker ya lang-toggle, ambayo ingebaki bila CO.
   - Rekebisho: vipengele vinatenganishwa kwa mstari mpya, `;` au `, <id>` NJE ya mabano. Ni id za mwanzo wa kipengele tu zinazohesabiwa; id ndani ya mabano ni sababu.
   - Hii pia ilizuia `P-03 (identical to P-04)` kukubali P-04 kimya kimya.
5. **B3: kichwa cha P-T1 kilisomwa kama "P-05".** Timu iliandika `P-05 — Strict Grid Implementation: …` chini ya NEW PROPOSALS.
   - Rekebisho: `P-\d+ —` ya mwanzo inaondolewa, kisha kichwa kinatenganishwa kwenye ` — ` au `: `.
   - Id iliyobuniwa (P-05) ndani ya ACCEPTED inapuuzwa, na onyo linarekodiwa (`unknown proposal id P-05`).

## T1 — run A2 (findings za T23 T1, site ya CEO)
```
21:01:12 [success] 📸 Evidence ya M1 R0: 4 screenshots (uploaded 4) · errors 0.
21:01:12 [success] 🧱 Build ya M1: DONE — hatua DONE.
EV {"type": "reviewFindings", "id": "M1", "round": 0, "reviewId": "R-M1-0", "designer": {"defects": 3, "proposals": 5}, "frontend": {"defects": 3, "proposals": 3}, …}
CHIP 🧑‍⚖️ R-M1-0: mjadala wa timu (Ultron + Vextron + Optimus) — defects 6 · proposals 8
21:01:17 [success] ✅ Ultron: mandatory evidence gate imekamilika — sources 5.
21:01:27 [info] 🧭 [delib] Ultron · zamu 1/15 · overlap 0 · ✓ new proposal, 5 new source(s), new facts
21:01:28 [success] ✅ Vextron: mandatory evidence gate imekamilika — sources 4.
21:02:03 [info] 🧭 [delib] Vextron · zamu 2/15 · overlap 0.55 · ✓ agreed to a proposal, new facts
21:02:07 [success] ✅ Optimus: mandatory evidence gate imekamilika — sources 4.
21:02:14 [info] 🧭 [delib] Optimus · zamu 3/15 · overlap 0.5 · ✓ agreed to a proposal, new content
21:02:18 [warning] 🧭 [delib] Ultron · zamu 4/15 · overlap 0.86 · hakuna jipya (stall 1)
21:02:18 [success] 🧑‍⚖️ R-M1-0: consensus (all owners AGREE) · zamu 4 · searches 3.
21:02:56 [success] 🧾 Optimus: COs 5 · ledger conflicts 0 (attempt 1)
EV {"type": "reviewDecision", …, "consensus": true, "turns": 4, "searches": 3, "accepted": ["R-M1-0/P-01", … "R-M1-0/P-08"], "rejected": [{"id": "P-06", "reason": "Docking both input bar and bottom nav on mobile consumes ~25% of the 667px vertical viewport…"}], …}
EV {"type": "changeOrders", "id": "M1", "round": 0, "reviewId": "R-M1-0", "valid": true, "count": 5, "changeOrders": [ …]}
21:03:02 [success] 🧑‍⚖️ R-M1-0: consensus ✓ · defects wazi 6 · batili 0 · maamuzi 7 · CR 0 · COs 5 → CHANGES.
21:03:04 [info] 🔧 M1 → FIXING (round 1) — COs 5 zinasubiri raundi za marekebisho (tasks 25+).
```
State ya M1: `FIXING` round 1, na hatua `M1.R0.plan` / `M1.R0.build` / `M1.R0.review` zote DONE (`A2-state_M1.json`).

| CO | priority | defectIds | decisionIds | route | acceptance (Check union) |
|---|---|---|---|---|---|
| CO-001 | 1 | D-001, D-004 (`/board` haina bottom nav) | P-04 | `/board` | dom_exists, computed_style |
| CO-002 | 2 | D-002, D-006 (contrast 2.92) | P-02, P-08 | `/` | contrast_min, computed_style, dom_exists |
| CO-003 | 2 | D-003, D-005 (touch 36px) | P-05, P-07 | `/` | touch_target_min ×3 |
| CO-004 | 3 | — | P-01 | `/` | computed_style |
| CO-005 | 3 | — | P-03 | `/board` | computed_style |

- Uncovered defects: **0**. Uncovered decisions: **0**. Hii inakaguliwa na code (`validateConsolidation`) na tena kutoka store.
- Zamu za REVIEW zilikuwa na maneno 597 / 903 / 457 / 311. Agenda za kawaida zinabaki "under 180 words" (unit test).

## T2 — proposal ya reviewer mmoja dhidi ya ya wote wawili
**Ingizo B:**
- Ultron: P-01 serif, P-02 video ya autoplay, P-03 sticky WhatsApp bar.
- Vextron: P-04, ambayo ni sticky bar ileile.

**B1** (`B1-review_M1_R0.json`):
```
1 Ultron  > * **P-02 (Autoplay hero background video on mobile 375px): REJECT**
2 Vextron > *   **P-02 (Hero Video):** As the Frontend lead, I strongly reject this
DECISION  > ACCEPTED PROPOSALS: P-03 (identical to P-04)
          > REJECTED PROPOSALS: P-01 (…A1…); P-02 (performance risk/bandwidth overhead for mobile users per Vextron)
```

**B3** (`B3-decisions.json`):
- `R-M1-0/P-03` "Sticky mobile WhatsApp order bar" imeingia ledger ya review (`decisions`), `agreedBy` = designer, frontend, pm.
- CO-005 (`decisionIds: [R-M1-0/P-03]`, `defectIds: []`) imetolewa kwa ajili yake.
- P-02 imekataliwa: "Degrades mobile performance/LCP on Tanzanian networks".
- P-04 (nakala ya P-03) haikutajwa kwenye ACCEPTED, kwa hiyo imekataliwa kwa default: "not accepted by all three". Kanuni ni ya code.

**Kanuni kwa code** (unit tests):
- Bila consensus, proposals ZOTE ni REJECTED na defects zote zinabaki. Hakuna R37 forced closure kwa REVIEW.
- Proposal inakubaliwa TU ikiwa iko kwenye ACCEPTED ya uamuzi ambao owners wote (Ultron + Vextron + Optimus) waliu-AGREE.

## T3 — serif dhidi ya A1 (Inter / system sans-serif ONLY) → CR
```
21:21:11 [success] 🧑‍⚖️ R-M1-0: consensus (all owners AGREE) · zamu 5 · searches 3.
21:21:54 [success] 🧾 Optimus: COs 6 · ledger conflicts 0 (attempt 1)
EV {"type": "reviewDecision", …, "accepted": ["R-M1-0/P-03", "R-M1-0/P-T1"], "rejected": [{"id": "P-02", …}, {"id": "P-04", …}], "invalidDefects": [{"id": "D-004", "reason": "Duplicate of D-002"}, {"id": "D-006", "reason": "Duplicate of D-003"}], "changeRequests": [{"id": "CR-M1-0-01", "proposalId": "P-01", "conflictsWith": "A1"}], …}
21:21:57 [success] 🧑‍⚖️ R-M1-0: consensus ✓ · defects wazi 4 · batili 2 · maamuzi 2 · CR 1 · COs 6 → CHANGES.
```
- `B3-changeRequests.json`: `CR-M1-0-01`, "Serif display headings", conflictsWith **A1**, status OPEN, raisedBy designer/frontend/pm.
- COs zenye "Playfair" au "serif display": **0**. CO-002 inasema "Global typography must use Inter or system sans-serif ONLY".
- Ledger ya Board HAIJAGUSWA. CR ni kwa ajili ya CEO.
- Uamuzi uliweka P-01 chini ya REJECTED **na** CHANGE REQUESTS; code inaipa CR kipaumbele.
- Defects za B3: D-001, D-002 (lang-toggle blocker, sasa imebaki), D-003, D-005. Zote zina CO. D-004/D-006 zimebatilishwa kama marudio, na sababu imerekodiwa.

## T4 — acceptance za COs za A2 → `runChecks` (task 21) ndani ya E2B dhidi ya site iliyo hai
`node t4.mjs A2-cos_M1.json`: sandbox `if4ukklh6trfv27oaraij` iliundwa na kuuawa ndani ya script.

| check | type | result | detail (kifupi) |
|---|---|---|---|
| CO-001/check-nav-exists-board | dom_exists | FAIL | /board @375x667: "body > nav" matched 0 |
| CO-001/check-main-padding-mobile | computed_style | FAIL | padding-bottom of "main" = 0px (expected 96px) |
| CO-002/check-nav-contrast | contrast_min | FAIL | min contrast 2.92 vs required 4.5 |
| CO-002/check-nav-hidden-tablet | computed_style | FAIL | @768x1024 display of "body > nav" = flex (expected none) |
| CO-002/check-active-indicator | dom_exists | FAIL | matched 0 |
| CO-003/check-touch-header | touch_target_min | FAIL | smallest 36×36 vs required 44×44 |
| CO-003/check-touch-convene | touch_target_min | FAIL | smallest 142×36 vs 44×44 |
| CO-003/check-touch-sidebar | touch_target_min | FAIL | @1280x800 smallest 227×36 vs 44×44 |
| CO-004/check-desktop-grid | computed_style | FAIL | grid-template-columns = 80px ×5 |
| CO-005/check-node-text-wrap | computed_style | FAIL | white-space = normal / nowrap |

`TOTAL 10 · PASS 0 · FAIL 10 · ERROR 0 · 49631ms`. FAIL inatarajiwa, kwa sababu marekebisho bado hayajafanywa (tasks 25+). Kila FAIL inapima defect halisi. Hakuna ERROR (`t4-results.json`).

## T5 — reviewers wanarejeleana (A2, `A2-review_M1_R0.json`)
1. **Ultron (zamu 1)**, akiunganisha hoja za Vextron na zake: "**D-001 / D-004** (Missing bottom navigation on `/board` route) are duplicate findings of a critical blocker violating Locked Decision A1". Pia: "**P-06 (Dock prompt input bar on mobile /board)**: **REJECT**". P-06 ni ya Vextron.
2. **Vextron (zamu 2)**, akijibu hoja ya Ultron: "Ultron's counter-evaluation of my initial proposal **P-06** (docking the prompt bar on mobile `/board`) is completely spot on from a mobile viewport and usability perspective."
3. **Optimus (zamu 3)**: "My own analysis of the viewport metrics confirms Vextron's concern: on a standard iPhone SE (375x667), a double-docked UI would leave only ~67% of the screen for the actual "Board of Agents" discussion".

## CEO #3 — search ya Board ndani ya REVIEW
- Mandatory evidence gate inaendeshwa kwa kila owner wa REVIEW kabla ya zamu yake ya kwanza. Pia `RESEARCH_REQUEST` / `READ_SOURCE` zinafanya kazi. `DiscussionOutcome.searches` inazihesabu, na zinaonekana kwenye event `reviewDecision.searches`.
- Lanes za reviewers zilikuwa Gemini (`gemini-3.6-flash`, `gemini-3.5-flash`), ambazo hazina search tool. Search inafanywa na Board, si lane.

A1, kutoka search engine halisi:
```
20:50:28 [warning] ❌ Ultron KAKOSA kwenye Appwrite — similarity ya juu: 87.2% (threshold 88% …). Analazimika kuwasha engine.
20:50:28 [search] 🌐 Ultron anawasha SearXNG engine... (attempt 1/11)
20:50:32 [success] 📥 Ultron: matokeo 5 KUTOKA SEARCH ENGINE.
20:50:32 [success] ✅ Ultron: mandatory evidence gate imekamilika — sources 5.
20:50:41 [success] ✅ Vextron: mandatory evidence gate imekamilika — sources 5.
20:50:52 [success] ✅ Optimus: mandatory evidence gate imekamilika — sources 5.
20:51:25 [success] 🧑‍⚖️ R-M1-0: consensus (all owners AGREE) · zamu 6 · searches 3.
```
- **B3:** `EV search "📄 READ_SOURCE · roastmyweb.com"` (Vextron, zamu 2: "reading a source").
- **A2 / B3:** searches 3 kila moja, kupitia Appwrite semantic cache ya Board.

## Marekebisho ya CEO (kabla ya T24) — yalivyotekelezwa
1. **REVIEW haichukui namba ya agenda.**
   - id ni `R-M1-0` (index 0); ramani inabaki 1..N.
   - Inaitwa kutoka `runMilestoneBuild` (hatua `M1.R0.review`) baada ya evidence.
   - `run()` ni closure moja, kwa hiyo mwili wa loop ya agenda umekuwa closure `discussAgenda(item)` ndani yake. `for` ya agenda inaiita kwa agenda 1..N, na `msHooks.review.discuss` inaiita kwa REVIEW. Imeelezwa kwenye FLOW-MAP B.10.
2. **R37 haitumiki kwa REVIEW.** REVIEW inarudi kabla ya Itifaki ya Kufunga. Bila consensus, proposals zote ni REJECTED. Defect inaondoka TU ikiwa iko kwenye INVALID DEFECTS ya uamuzi wa wote, pamoja na sababu.
3. **Search ya Board inapatikana**, kama ilivyoonyeshwa juu.
4. **Urefu wa ujumbe:**
   - REVIEW: maneno 600–900, max tokens 9000, transcript 60k.
   - Agenda za kawaida: "Keep this exchange under 180 words." bila mabadiliko (unit test).
5. **Hakuna raw `.log`** kwenye repo; vipande ≤ 40 mistari kwa kila test.

## Cleanup
- Sessions 5 za `xmdtest-t24*` zimefutwa kwa `clean.mjs --go`; uthibitisho: session haipo tena.
- cu_files 0. Sandbox ya T4 iliuawa ndani ya script.
- Hakukuwa na uploads mpya: evidence ya majaribio ilitoka faili.
