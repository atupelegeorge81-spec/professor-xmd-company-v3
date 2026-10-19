# TASK 26 — Raundi za uthibitisho, kanuni za verdict, vihesabu vya raundi — ushahidi wa majaribio HALISI

Branch `task/26-verify-rounds` · nyuma ya `XMD_MILESTONES` (OFF kwa default) · inategemea T22–T25.

Mazingira ya majaribio:
- Server: `next start` ya production build (`build.sh`), port 3100.
- `CU_PUBLIC_URL`: cloudflared quick tunnel.
- Sandbox: E2B halisi, OpenHands (XMD Computer), Chromium.
- Data: Supabase halisi.
- LLMs: halisi (broker; reviewers walitumia lanes za gemini).
- Fixture: `xmdtest-site` "Kivuli" (`mk.mjs`). Ni site ndogo ya static yenye kasoro 3 zilizopandwa:
  - lead ina `text-transform: uppercase` (inapingana na A1);
  - theme toggle haipo (A2);
  - `.promo-strip { width: 640px }` inasababisha overflow kwenye 375px (A3).

Harness iko kwenye `docs/tests/task-26/` (`mk.mjs`, `start.sh`, `go.sh`, `killer.py`, `cleanall.sh`, `get.mjs`, `watch.py`, inputs, na rekodi za store zilizochaguliwa). Hakuna faili za `.log`.

## Muhtasari

| Test | Inachothibitisha | Matokeo |
|---|---|---|
| T1 | `decide` / `decideNext` / `roundOutcome` (jedwali la kesi ≥15) | **PASS**: `verify.test.ts` 45/45, ikiwemo decide kesi 11 na decideNext kesi 14 |
| T2 | Kasoro 3 zilizopandwa → R0 halisi → COs → fix → verify → SIGN_OFF ndani ya raundi ≤4 | **PASS**: SIGNED_OFF kwenye raundi ya **2**. D-001 (toggle) ilihitaji majaribio 2 |
| T3 | Prompt ya kila jukumu kwenye raundi ya 3 ina mstari sahihi wa RoundHeader | **PASS**: computer ×2, designer, frontend, pm |
| T4 | CO mbaya → raundi inarudishwa nyuma kiotomatiki, na state inaonyesha hivyo | **PASS**: `REVERT (7 regression(s))`, `git revert` ndani ya sandbox, Optimus aliambiwa |
| T5 | `kill -9` wakati wa VERIFYING → raundi ileile inaendelea, bila rekodi ya pili ya uthibitisho | **PASS**: `verify:M1:R3` ni rekodi moja; evidence haikurudiwa |

## Runs (sessions zote zilifutwa mara baada ya kila run)

| Run | Session | Kusudi | Matokeo |
|---|---|---|---|
| T4a | 34b83bfe | CO mbaya v1 | REVERT (1 → 3). Computer alikataa sehemu iliyopingana na ledger. "Kasoro mpya" zilikuwa zile zilizopandwa → kasoro 1 na 2 hapa chini |
| T4b | 3b1c331f | CO mbaya v2 (inafuta grid) | 429 kwa reviewer mmoja → BLOCKED → kasoro 3 |
| T4c | 8e3869a0 | Kama T4b | Grid ilifutwa, lakini reviewers wote walisema PASS ("as specified") → BEST → kasoro 4 |
| T4d | 58bf315b | CO mbaya v3 (header fixed ya 280px) | Hero ilifunikwa (screenshot), reviewers PASS → kasoro 4 (sehemu ya code) |
| T4e | e3571744 | Kama T4d | Computer aliacha sehemu ya header; revert ilihitajika (3 → 4) lakini `git revert` ilishindwa kwa sababu ya `server.log` → kasoro 5 |
| T4f | (fixture) | Kama T4d | Computer alizuia CO yote kwa sababu `visionNote` ya fixture ilisema waziwazi "planted BAD". Lilikuwa kosa la fixture, si la code |
| **T4** | 3384c6ad | CO mbaya v4: header `position: fixed` bila kusogeza main | **REVERT** ✔ |
| T3a+T5a | a767de4f | Raundi ya 3 + kill -9 | T5 ✔. Header ya verify ilisema "attempt 4", na id CO-003 ilitolewa mara mbili → kasoro 6 na 7 |
| **T3+T5** | f0a714b2 | Kama hapo juu, kwenye code ya mwisho | ✔ |
| **T2** | c220524f | Mzunguko kamili | **SIGNED_OFF R2** ✔ |

### Kasoro zilizopatikana kwenye majaribio halisi (zimerekebishwa, na zina unit tests)
1. **Reviewers wawili waliripoti tatizo lilelile kwa maneno tofauti**, likahesabiwa mara 2 ("Horizontal page overflow on 375px…" na "Horizontal scrolling overflow at 375px…").
   - Suluhisho: `titleSimilarity` (Jaccard ya maneno ≥ 0.5) inaunganisha findings za reviewers **tofauti**; za reviewer mmoja haziunganishwi.
2. **Kasoro zinazojulikana ziliripotiwa tena kama "mpya"**, jambo lililosababisha revert za uongo.
   - Prompt sasa inasema `newDefects` = matatizo **yasiyo** kwenye DEFECT LEDGER.
   - Code: finding inayofanana na defect iliyo wazi tayari haiongezwi, bali inarekodiwa kwenye `duplicates`.
3. **429 moja (quota) ilimfanya reviewer kuwa INVALID** baada ya wito 1 tu, na raundi ikawa BLOCKED.
   - Suluhisho: `VERIFY_TRANSPORT_RETRIES = 2` (pumziko la 30s), ambazo hazihesabiwi kama validation retries.
4. **Reviewers (flash-lite) walipitisha CO iliyotekelezwa "kama ilivyoandikwa" hata ilipoharibu bidhaa.** Grid ilifutwa (T4c), na hero ilifunikwa na header (T4d, angalia screenshot iliyohifadhiwa).
   - Hatua ya kwanza: PLAN GOAL kwenye prompt, pamoja na kanuni "applied exactly as written and still WRONG → FAIL + regressions". Peke yake haikutosha (T4d).
   - Suluhisho la uhakika: regression inayoamuliwa na **code**:
     - `xmd-evidence.mjs` sasa inaandika `occluded` / `occludedBy` kwa kila elementi yenye maandishi (`elementFromPoint` katikati yake, ndani ya viewport) na `summary.occluded`.
     - `newlyOccluded` inahesabu elementi ambazo hazikuwa zimefunikwa kwenye evidence ya raundi iliyopita (R(n-1)…R0) lakini sasa zimefunikwa. Kila moja ni regression, na regression yoyote husababisha REVERT.
     - Baseline isiyo na sehemu `occluded` haihesabiwi (msimamo wa kihafidhina).
     - Hook ya majaribio sasa inarekodi evidence ya R0 (kama mtiririko halisi) inapoanza moja kwa moja kwenye FIXING.
5. **`git revert` ilishindwa kwa sababu ya working tree chafu** (`server.log` iliyokuwa tracked ilibadilishwa na server ya Computer).
   - Suluhisho: kabla ya revert, `git stash push -m "xmd: uncommitted work before Mk-Rn-revert"` (data inabaki inapatikana). Detail inaandika "(uncommitted changes stashed first)". Amri ilijaribiwa kwenye repo ya muda (chafu na safi).
6. **Ids za CO zilirudiwa**: `nextCoNo = idadi + 1`. Seed ya R3 ilikuwa na CO-003 pekee, kwa hiyo COs za R4 zilikuwa "CO-002, CO-003", na `cos:Mk` iliandika juu ya CO-003 ya zamani kimya kimya.
   - Suluhisho: `nextCoNumber` = max(namba zilizopo, idadi) + 1. Linatumika kwa R0 (reviewAgenda) na kwa verify (loop).
7. **RoundHeader wakati wa verify ilionyesha jaribio LINALOFUATA** ("D-001 attempt 4") badala ya linalothibitishwa (3).
   - Suluhisho: `attempt` = jaribio linaloendelea. Kama raundi hii tayari imeijaribu defect (ina history ya raundi hii), ni `attempts`; kabla ya fix ni `attempts + 1`.
8. (Kabla ya runs) Header ya consolidate ilitumia raundi iliyopita; sasa inatumia raundi ya sasa na counts mpya kutoka DB.

## T1 — jedwali (`src/lib/milestone/__tests__/verify.test.ts`)
Output kamili iko kwenye `task-26/T1-vitest.txt` (mistari 47). Excerpt:
```
✓ T1: decide > wote PASS + checks PASS → PASS
✓ T1: decide > check FAIL inapindua PASS ya wote
✓ T1: decide > check ERROR inapindua PASS ya wote
✓ T1: decide > checks hazikuendeshwa → FAIL
✓ T1: decide > wanatofautiana, bila sync → FAIL (+concern: check ilipita)
✓ T1: decide > wanatofautiana → sync: wote PASS → PASS
✓ T1: decide > wanatofautiana → sync bado wanatofautiana → FAIL
✓ T1: decide > wote FAIL lakini checks PASS → FAIL + concern 2 (defect mpya + check mpya)
✓ T1: decide > FAIL vs PARTIAL si tofauti (hakuna sync)
✓ T1: decide > reviewer mmoja hana jibu → FAIL
✓ T1: decideNext > kila kitu PASS → SIGN_OFF
✓ T1: decideNext > CO moja FAIL → CONTINUE
✓ T1: decideNext > check ya global FAIL → CONTINUE
✓ T1: decideNext > defect wazi medium → CONTINUE
✓ T1: decideNext > minor ISIYOorodheshwa → CONTINUE
✓ T1: decideNext > minor iliyoorodheshwa → SIGN_OFF (leftover)
✓ T1: decideNext > receipts ≠ diffs → CONTINUE
✓ T1: decideNext > raundi 10 + kasoro → CAP_REACHED
✓ T1: decideNext > raundi 10 bila kasoro → SIGN_OFF (si CAP)
✓ T1: decideNext > raundi 9 + kasoro → CONTINUE
✓ T1: decideNext > reviewer batili → BLOCKED
✓ T1: decideNext > consolidation batili → BLOCKED
✓ T1: decideNext > hakuna COs → CONTINUE (si SIGN_OFF)
✓ roundOutcome > {3→1, reg 0} BEST · {1→3} REVERT · {3→1, reg 1} REVERT · {2→2} SAME
✓ newlyOccluded > h1 ilionekana R0 → imefunikwa R1 = regression; …
✓ verifyOne > 429 mara 1 → jaribio la pili linafaulu
✓ nextCoNumber > max(namba, idadi)+1
✓ runVerifyRound (loop) > T4 (code): git revert + Optimus anaambiwa · T5 (code): crash → resume bila kurudia reviewers
Tests  45 passed (45)
```

## T2 — kasoro 3 zilizopandwa → SIGN_OFF (session c220524f, 07:27–07:58)
Kwenye R0 halisi, reviewers 2 walipata defects 7 (designer 3 + frontend 4) na proposals 8. Mjadala wa timu ulifikia consensus kwa zamu 4 na searches 3. Defects 4 zilibaki wazi (3 zilikuwa batili), maamuzi 5, COs 6.
```
07:31:55 🧑‍⚖️ R-M1-0: consensus ✓ · defects wazi 4 · batili 3 · maamuzi 5 · CR 0 · COs 6 → CHANGES.
07:32:00 🔧 M1 R1: raundi ya marekebisho — COs CO-001 … CO-006 · 4 defects wazi.
07:38:09 🧾 M1 R1 imekamilika: APPLIED 6 · NOT_ATTEMPTED 0 · BLOCKED 0 · checks PASS 12 · FAIL 0 · ERROR 0 → VERIFYING
07:38:22 📸 Evidence ya M1 R1: 3 screenshots (uploaded 6) · errors 0.
07:40:44 🔍 frontend verify R1: CO-001 PASS · CO-002…CO-006 PASS · regressions 0 · new 2 · 136s
07:43:53 🔍 designer verify R1: CO-001 PARTIAL · CO-002…CO-006 PASS · regressions 0 · new 1 · 326s
         🤝 M1 R1: reviewers wanatofautiana (CO-001) — zamu MOJA ya sync   → sync: designer PASS / frontend PARTIAL
07:45:15 🧾 Optimus: COs 2 · ledger conflicts 0 (attempt 2)
07:45:24 ✅ M1 R1 → FIXING: COs not PASS: CO-001 · open defects ≥ medium: D-001 (blocker), D-008 (major), D-009 (medium)
         · unlisted minor defects: D-010, D-011 · defects fixed 3 · reopened 1 · new 4 · SAME (open defects unchanged (4)).
07:45:30 🔧 M1 R2: raundi ya marekebisho — COs CO-007, CO-008 · 5 defects wazi.
07:57:26 🧾 M1 R2 imekamilika: APPLIED 2 · … · checks PASS 7 · FAIL 0 · ERROR 0 → VERIFYING
07:58:09 🔍 frontend verify R2: CO-007 PASS · CO-008 PASS · regressions 0 · new 0 · 23s
07:58:14 🔍 designer verify R2: CO-007 PASS · CO-008 PASS · regressions 0 · new 0 · 27s
07:58:29 🏷️ M1 R2: open defects 5 → 0 → best mpya (tag xmd-best-M1 @ 667f5ba)
07:58:33 ✅ M1 R2 → SIGNED_OFF: all 2 CO(s) PASS · checks 7 PASS · no open defect ≥ medium · receipts match
         · defects fixed 5 · BEST (open defects 5 → 0).
```
Defects mwishoni (`task-26/T2-defects.json`):

| Defect | Asili | Ukali | Majaribio | Matokeo |
|---|---|---|---|---|
| D-001 Missing theme toggle (**iliyopandwa**) | R0 | blocker | **2** (R1 FAIL: frontend PARTIAL baada ya sync → REOPENED; R2 PASS) | VERIFIED_FIXED |
| D-002 Overflow 375px (**iliyopandwa**) | R0 | blocker | 1 | VERIFIED_FIXED |
| D-003 Hero subtitle all-caps (**iliyopandwa**) | R0 | major | 1 | VERIFIED_FIXED |
| D-007 Header bila max-width 1100 | R0 | medium | 1 | VERIFIED_FIXED |
| D-008 / D-009 Contrast ya toggle mpya | R1 (newDefects) | major / medium | 1 | VERIFIED_FIXED |
| D-010 Logo touch target < 44px | R1 | minor | 1 | VERIFIED_FIXED |
| D-011 Concern ya CO-001 (`CHECK_MISSED_IT`) | R1 | minor | 1 | VERIFIED_FIXED |

State: `SIGNED_OFF round 2`. Hatua 11, zote DONE (R0 plan/build/review, R1 na R2 fix/evidence/verify/decide). Ni minor zisizoorodheshwa (D-010, D-011) zilizozuia SIGN_OFF ya R1; zililazimika kurekebishwa, kwa kuwa waivers ni T28.

## T3 — RoundHeader kwenye prompts za raundi ya 3 (session f0a714b2)
Seed (`inputT3.json`, `startRound: 3`) ina haya:
- raundi 1–2 ni stub (hatua 8 `stub:true`, kingo halali FIXING→VERIFYING→FIXING);
- D-001 REOPENED (attempts 2);
- D-002 na D-003 ziko OPEN;
- CO-003 (attempt 3).

Excerpt ya `task-26/T3-prompts-excerpt.txt`:
```
=== computer · fix:M1:R3 (mstari 1 wa 91) ===
ROUND 3/10 (M1) — closed defects: 0 · open: 3 (D-001 attempt 3, D-002 attempt 1, D-003 attempt 1) · waivers: 0 · rounds left: 7
=== computer · computer:M1:R3:a1 (mstari 1 wa 99) ===
ROUND 3/10 (M1) — closed defects: 0 · open: 3 (D-001 attempt 3, D-002 attempt 1, D-003 attempt 1) · waivers: 0 · rounds left: 7
=== designer · verify:M1:R3 (mstari 30 wa 119, mara baada ya OCB "=== END ===") ===
ROUND 3/10 (M1) — closed defects: 0 · open: 3 (D-001 attempt 3, D-002 attempt 1, D-003 attempt 1) · waivers: 0 · rounds left: 7
=== frontend · verify:M1:R3 (mstari 30 wa 119) ===
ROUND 3/10 (M1) — closed defects: 0 · open: 3 (D-001 attempt 3, D-002 attempt 1, D-003 attempt 1) · waivers: 0 · rounds left: 7
=== pm · consolidate:M1:R4 (mstari 3 wa 55) ===
ROUND 3/10 (M1) — closed defects: 1 · open: 2 (D-002 attempt 1, D-003 attempt 1) · waivers: 0 · rounds left: 7
```
Header ni sahihi dhidi ya DB:
- Raundi 3/10 imebaki na raundi 7.
- D-001 ilikuwa na majaribio 2 ya awali, kwa hiyo hili ni la 3.
- Header ya pm imejengwa baada ya uamuzi: D-001 VERIFIED_FIXED, kwa hiyo closed ni 1 na open ni 2.
- COs za R4 zilikuwa CO-004 na CO-005; hakuna id iliyorudiwa.

## T4 — CO mbaya → revert ya moja kwa moja (session 3384c6ad)
CO-001 (`inputT4.json`) inafanya mambo mawili:
- inarekebisha D-001: `.lead` → `text-transform: none`;
- inaongeza `position: fixed; top: 0; …` kwenye `.site-header` bila kusogeza `main`. Hili ni kosa la kawaida linalofunika juu ya hero.

`visionNote` haikutaja ubaya wowote.
```
06:48:32 📸 XMD_TEST_VERIFY_INPUT: baseline R0 — screenshots 3 · errors 0          (occluded 0/0/0)
06:52:51 🧾 M1 R1 imekamilika: APPLIED 1 · NOT_ATTEMPTED 0 · BLOCKED 0 · checks PASS 3 · FAIL 1 · ERROR 0 → VERIFYING
06:53:05 📸 Evidence ya M1 R1: 3 screenshots (uploaded 6) · errors 0.             (occluded 2/2/2)
06:53:19 🔍 frontend verify R1: CO-001 PASS · regressions 0 · new 0 · 10s
06:53:22 🔍 designer verify R1: CO-001 FAIL · regressions 1 · new 0 · 14s   ("Fixed header obscures hero heading")
         🤝 M1 R1: reviewers wanatofautiana (CO-001) — zamu MOJA ya sync      (baada ya sync bado wanatofautiana → FAIL)
06:53:36 🧱 M1 R1: harness — maandishi 6 yamefunikwa na raundi hii: body > main @375x667 (chini ya body > header)
         · body > main > section:nth-of-type(1) > h1 @375x667 (chini ya body > header) · … @768x1024 · … @1280x800
06:53:39 ⏪ M1 R1: round 1 reverted: made things worse (7 regression(s)) — reverted 1 commit(s) since 99c67c8 (HEAD 03ea98c). Optimus ataambiwa.
06:54:15 🧾 Optimus: COs 3 · ledger conflicts 0 (attempt 1)
06:54:19 ✅ M1 R1 → FIXING: COs not PASS: CO-001 · … · reopened 1 · new 0 · REVERT (7 regression(s)).
```
Kinachoonekana kwenye state (`task-26/T4-*.json`):
- `verify:M1:R1`:
  - `outcome {REVERT, "7 regression(s)", openBefore 3, openAfter 4, regressions 7}`;
  - `git {op: revert, ok: true, sha 03ea98c…}`;
  - `harnessRegressions` = 6.
- `defects`: D-001 ni `REOPENED` na `history[-1].cause = "REVERTED"`, result "… · round 1 reverted: made things worse (7 regression(s))". Defects mpya za raundi iliyorudishwa hazihesabiwi.
- Prompt ya pm `consolidate:M1:R2` ina `- round 1 reverted: made things worse (7 regression(s))`.
- `state:M1` = FIXING round 2.

Git ndani ya sandbox (`task-26/T4-sandbox-git.txt`):
```
03ea98c xmd: revert M1 R1 — made things worse (7 regression(s))
35701ac M1 R1: CO-001
99c67c8 xmdtest-site: seed
.site-header { display: flex; … padding: 16px 20px; }      ← position: fixed imeondoka
.lead { font-size: 18px; text-transform: uppercase; … }      ← imerudi hali ya seed (raundi yote imerudishwa)
 .xmd/receipts/R1.json | 16 ----  ·  src/styles.css | 8 +-------
```
Njia ya BEST nayo ilionekana kwenye runs halisi. Kwenye T4c, T3 na T2 kulikuwa na `git tag -f xmd-best-M1` na `best:M1 {round, sha, openAfter}`.

## T5 — kill -9 wakati wa VERIFYING (session f0a714b2)
`killer.py` inasoma `state:M1` kila sekunde 4. Ikikuta `M1.R3.evidence = DONE` na `M1.R3.verify = RUNNING`, inasubiri sekunde 8 kisha inafanya `kill -9` kwa next-server.
```
07:23:16 📸 Evidence ya M1 R3: 3 screenshots (uploaded 6) · errors 0.          evidence:M1:R3 at 07:23:15.937Z
07:23:19 🔍 ROUND 3/10 (M1) — … — reviewers 2 wanathibitisha (REVIEW_VERIFY).
07:23:22 VERIFYING 3 DONE RUNNING
07:23:31 KILLED -9 ['32753', '32781', '32782']
--- baada ya kill: verify:M1:R3 = null · steps R3: fix DONE · evidence DONE · verify RUNNING · decide PENDING
--- restart (next start) + POST /api/boardroom/resume {"id":"f0a714b2-…"}
07:23:51 🧪 XMD_TEST_VERIFY_INPUT: resume ya M1 (VERIFYING R3) — haipandi upya; inaendelea pale ilipoachwa.
07:23:52 ♻️ Milestone M1 iko VERIFYING — inaendelea pale ilipoachwa (resume).
07:24:06 🔍 ROUND 3/10 (M1) — … — reviewers 2 wanathibitisha (REVIEW_VERIFY).
07:24:26 🔍 frontend verify R3: CO-003 PASS · regressions 0 · new 0 · 20s
07:24:34 🔍 designer verify R3: CO-003 PASS · regressions 0 · new 0 · 29s
07:24:47 🏷️ M1 R3: open defects 3 → 2 → best mpya (tag xmd-best-M1 @ 235a62f)
07:25:04 ✅ M1 R3 → FIXING: … · defects fixed 1 · BEST (open defects 3 → 2).
```
Baada ya resume:
- `evidence:M1:R3.at` = 07:23:15.937Z, sawa na kabla ya kill, kwa hiyo evidence haikurudiwa. Chip ya "harness inakusanya evidence" iliyo kwenye stream ya resume ni replay ya items zilizohifadhiwa.
- Hatua `M1.R3.evidence` ina attempts 1.
- `verify:M1:R3` ni **rekodi moja** (round 3, at 07:25:02).
- Kuna tukio moja tu la `verifyRound`.
- Hatua `M1.R3.verify` ina attempts 2 (RUNNING mara 2: kabla na baada ya kill), na `decide` ina attempts 1.
- State ni FIXING round 4 (raundi haikurudiwa wala kuongezwa mara mbili).

T5a (session a767de4f, build ya awali) ilitoa matokeo yaleyale.

## Tests za code
- `verify.test.ts`: tests 45, zikiwemo kesi mpya 6 kutokana na runs halisi (dedupe ×2, transport retry, newlyOccluded ×2, nextCoNumber) na uthibitisho wa header ya verify.
- `stall.test.ts`: T23 guard inaruhusu `review.ts` na `verify.ts`.
- Baselines baada ya mabadiliko: angalia `docs/PROGRESS.md` (Task 26).

## Uchunguzi / hatari kwa CEO
1. **Reviewers wa LLM hawagundui madhara yasiyotajwa.** Kwenye T4c na T4d walipitisha CO zilizofuta grid au kufunika hero. Kinga ya kwanza ni XMD Computer, ambaye alizuia sehemu zinazopingana na ledger kwenye T4a, T4e na T4f. Kinga ya pili sasa ni `newlyOccluded` (code).
   - Madhara mengine yasiyo ya kufunika (k.m. sehemu kufutwa kabisa) bado yanategemea reviewers.
   - Pendekezo: ulinganisho wa "landmarks" za DOM kati ya raundi (sections/headings zilizopotea), ukiidhinishwa.
2. **Computer si wa uhakika:** CO ileile ilitekelezwa kikamilifu (T4d), nusu (T4e), au ilizuiwa (T4f). Hii ni tabia nzuri ya usalama, lakini inafanya majaribio ya "CO mbaya" kuhitaji fixture isiyofichua nia yake.
3. **"receipts match"** inazuia SIGN_OFF kila mara Computer anapoandika faili ambayo haikutajwa (k.m. `.gitignore` R3, `M1_R1_REPORT.md` T4a). Hii ni kwa mujibu wa spec.
4. **Minor zisizoorodheshwa** zinazuia SIGN_OFF hadi orodha ya waivers ya T28 ipatikane (T2 R1: D-010, D-011).
5. Idadi ya `harnessRegressions` ni elementi × viewport (main + h1 × 3 = 6). Kinachoamua ni kama ni > 0, si ukubwa wa namba.
6. Koyeb orphan-resume: haikutokea safari hii. Server ilirudi ndani ya chini ya dakika 1 na sessions zilifutwa mara moja.

## Usafishaji
- Sessions 11 za majaribio zilifutwa kwa `cleanall.sh`: vitu vya bucket vya dirisha la run, `cu_files`, rows, na session.
- Sandboxes 11 za E2B ziliuawa.
- Uthibitisho baada ya usafishaji:
  - `boardroom_sessions` zenye `xmdtest` = 0;
  - vitu vya bucket vya 05:00–09:00 = 0;
  - sandboxes za leo = 0.
- Tunnel imesimamishwa.
