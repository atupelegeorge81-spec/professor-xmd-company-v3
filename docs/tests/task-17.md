# Task 17 (maelezo17): Build Report contract, ushahidi

Branch `task/17-build-report` (juu ya main f22ed65, yaani Task 16 imeshaunganishwa). Inatumika kwenye awamu za milestone tu (`XMD_MILESTONES=1`). Legacy haiguswi.

## Nini kimebadilika

- **`src/lib/milestone/buildReport.ts` (mpya):**
  - `BUILD_REPORT_HEADINGS` (8, kwa mpangilio wa spec) na `buildReportPath(Mk)` = `.xmd/reports/<Mk>-build-report.md`.
  - `parseBuildReport(md)` → `{ok, sections, errors[], paths, commands}`. Inakagua:
    - headings zote zipo;
    - mpangilio sahihi;
    - hakuna sehemu tupu;
    - sehemu ya 3 ina ≥1 mstari wa amri wenye exit code;
    - sehemu ya 2 ina paths halisi.

    Headings ndani ya ``` hazihesabiwi, na `/home/user/ws/` na `./` zinaondolewa.
  - `crossCheckBuildReport(paths, changed)` → `{fake, unreported}`:
    - `fake` = imetajwa lakini haipo kwenye `git diff`;
    - `unreported` = imebadilika lakini haikutajwa (`.xmd/` ya harness haihesabiwi).
- **`cu/bridge.py`:**
  - `BUILD_REPORT_HEADINGS`, `build_report_contract(Mk)` (kiolezo + sheria + sentensi ya spec "You cannot finish without this report. Do not grade yourself; the harness measures."), na `with_build_report_contract`.
  - Block yenye alama `<!-- XMD-BUILD-REPORT-CONTRACT -->` ndani ya CLAUDE.md. Block hiyo pekee ndiyo inabadilishwa kila milestone; maandishi mengine hayaguswi.
  - Hoja mpya `--milestone`.
- **`cu/oh_bridge.py`** (backend inayotumika sasa, `CU_AGENT_BACKEND=openhands`): `--milestone`. Mkataba (`B.build_report_contract`) unaingizwa kwenye ujumbe wa kwanza, kabla ya plan.
- **`src/lib/cu/engine.ts`:**
  - Awamu ya milestone inapitisha `--milestone Mk` na inachukua HEAD kabla ya bridge.
  - Baada ya commit ya harness, `msReadBuildReport` inasoma ripoti (≤256KB) + `git diff --name-only <HEAD ya mwanzo> HEAD` (repo mpya: `diff-tree --root`).
  - Ripoti ikiwa >16KB, nakala kamili inaenda Supabase storage (`fileId`).
- **`src/lib/milestone/loop.ts`:** `recordBuildReport` inakagua, inalinganisha, inahifadhi `report:Mk` na kutoa tukio **`buildReport`** + chip `📑 Build Report ya Mk: …`.
- **Tests mpya:**
  - vitest: buildReport 11 (zikiwemo ulinganisho wa headings TS↔Python), loop TASK-17 4, engine 2;
  - python: `cu/tests/test_t17_build_report.py` 3.

## Maamuzi yangu (CEO alikuwa amelala, sikuuliza)

1. **Mkataba unaingia kwenye backend zote mbili.** bridge.py ni chanzo kimoja (CLAUDE.md block, kama spec ilivyosema). oh_bridge (backend halisi ya sasa) inauagiza kutoka bridge.py na kuuweka kwenye ujumbe wa kwanza. Bila hili spec isingefanya kazi kwenye production.
2. **Kwa awamu za milestone tu** (`--milestone`). Legacy (flag OFF) haipati mkataba, kwa sababu path ina `<Mk>` na legacy haibadiliki.
3. **Ripoti mbaya au isiyokuwepo haibadilishi hali ya milestone kwenye Task 17.** Inarekodiwa (`report:Mk`, `ok:false`, errors) na kuonyeshwa (chip ya onyo). Lango la "huwezi kumaliza" ni on_stop ya Task 18, na review itapima baadaye.
4. **Ulinganisho wa git.** Spec inasema `git diff --name-only HEAD~1`. Harness inatumia HEAD ya mwanzo wa awamu → HEAD, ambayo ni sawa na HEAD~1 kwa commit moja kwa awamu (T3 imethibitisha). Inafanya kazi pia milestone ya kwanza (hakuna HEAD~1, hivyo `diff-tree --root`), na agent akicommit mwenyewe.
5. **Directory iliyotajwa kwenye sehemu ya 2 inafunika faili zilizo chini yake.**
6. **Ripoti inabaki ndani ya git** (`.xmd/reports/` haijatengwa). Hivyo historia ya ripoti inasafiri na snapshot/restore ya Task 16.
7. **Kikomo cha inline ni 16KB.** Juu yake rekodi ina `fileId` ya storage na markdown haiwekwi kwenye rekodi.

## Real tests

### T1 PASS: parser (pure)
`src/lib/milestone/__tests__/buildReport.test.ts`:
- ripoti halali → ok (sehemu 8, paths 2, amri 3 zenye exit 0/0/1);
- heading inakosekana → `missing heading "## 6 Security notes"`;
- mpangilio mbaya → `heading out of order: "## 5 …" appears before "## 4 Tests run"`;
- sehemu tupu → `empty section "## 7 …"`;
- sehemu ya 3 bila exit codes → `… has no command line with an exit code`;
- sehemu ya 2 bila paths → `… lists no file paths`.

Pia: fences, prefix za paths, na headings za TS = za bridge.py.

### T2 PASS: awamu halisi ya Computer inaandika ripoti (session 277b8a07, sandbox ikx7be7k)
Local `next dev --turbopack` + Supabase + E2B + OpenHands bridge halisi (cloudflared). Brief `xmdtest-cu16` (M1 README title, M2 mstari wa pili).

Faili halisi `.xmd/reports/M1-build-report.md` (herufi 1480) iliandikwa na agent kwa headings 8 HASA. Sehemu za 2 na 3:
```
## 2 Files created or changed
- `README.md` — created — Initialized with project title header.
- `.xmd/evidence/step-01.txt` — created — …
- `.xmd/reports/M1-build-report.md` — created — …
## 3 Commands run and results
- `mkdir -p .xmd/evidence .xmd/reports` — exit 0 — …
- `printf '# xmdtest-cu16\n' > README.md` — exit 0 — …
- `head -1 README.md > .xmd/evidence/step-01.txt` — exit 0 — …
- `head -1 README.md` — exit 0 — …
```
Matukio:
```
buildReport {"id":"M1","found":true,"ok":true,"errors":[],"sections":8,"commands":4,"paths":3,"fake":[],"unreported":[],"chars":1480}
buildReport {"id":"M2","found":true,"ok":true,"errors":[],"sections":8,"commands":5,"paths":5,"fake":[],"unreported":[],"chars":2029}
```
**Amri ni halisi.** `exec_start` ya bridge (awamu ya M1) ilikuwa na amri moja iliyounganishwa:
`mkdir -p .xmd/evidence .xmd/reports && printf '# xmdtest-cu16\n' > README.md && head -1 README.md > .xmd/evidence/step-01.txt && head -1 README.md`.
Amri zote 4 za ripoti ni vipande (`&&`) halisi vya amri hiyo: 4/4 True.

DB:
- `report:M1 v1 found true ok true paths 3 commands 4 changed [.xmd/evidence/step-01.txt, .xmd/reports/M1-build-report.md, README.md] fake []`
- `report:M2 v1 … paths 5 commands 5 fake []`
- M1/M2 SIGNED_OFF.

### T3 PASS: sehemu ya 2 ↔ `git diff --name-only HEAD~1`, path iliyopandikizwa inakamatwa
Repo halisi ya M2 ilitolewa kwenye snapshot ya Task 16 (bucket, tar + `.git`): `0a9db8a XMD M2` juu ya `feea511 XMD M1`. Script ni `xmdtest/t17cross.mjs` (inatumia `parseBuildReport` + `crossCheckBuildReport` za repo).
```
git diff --name-only HEAD~1 = [.xmd/evidence/m2-step-01.txt, …m2-step-02.txt, …m2-verify1.txt, …m2-verify2.txt, .xmd/reports/M2-build-report.md, README.md]
REAL M2 report:                     fake=[]                                   unreported=[]
DOCTORED copy (+ fake path):        fake=["src/lib/auth/secret-handler.ts"]   unreported=[]
DOCTORED copy (README.md omitted):  fake=[]                                   unreported=["README.md"]
RESULT: T3 PASS
```

### T4 PASS: Python tests za cu/tests
pytest **311 passed** (308 + 3 mpya) · unittest **241 OK** (238 + 3). Hakuna string ya zamani iliyohitaji kubadilishwa, kwa sababu block mpya inaongezwa tu ikiwa `--milestone` ipo.

### Usafi
- Session 277b8a07: clean + cleanstore + find (ledger 1) → "SI xmdtest" (imefutwa).
- Snapshots 2 za bucket zimefutwa.
- Sandbox ikx7be7k iliuawa na harness.
- `e2blist`: zile 16 za zamani tu.

## Baselines (bila dev server)
tsc 0 · vitest 506 + 2 skipped (508) · pytest 311 · unittest 241 OK · eslint 0 (faili zilizoguswa).
