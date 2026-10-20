# TASK 29 — Technical review mode (backend/security, bila screenshots) — ushahidi wa majaribio HALISI

Branch `task/29-technical-review` · nyuma ya `XMD_MILESTONES` (OFF kwa default) · inategemea T21 + T26 (main `644c59a`).

Mazingira:
- **T1–T3:** harness ya technical evidence (`src/lib/cu/techEvidence.ts`, `milestone/checks.ts`, `milestone/dbProbe.ts`) ikiendeshwa
  na `docs/tests/task-29/real.mjs` (jiti → code ya app bila build) dhidi ya **sandbox HALISI ya E2B** (template ya CU, sawa na XMD Computer)
  na **Supabase HALISI** (T3). Hakuna app iliyojengwa kwenye sandbox ya agent (kanuni S1).
- **T4, T5 — kwenye KOYEB** (S1: push → Koyeb ina-deploy → conversation kupitia Koyeb). Env iliyobadilishwa: `XMD_TEST_PROFILE_DIR=docs/tests/task-29/inputs`
  (profiles `inputT4.json`, `inputT5.json`, zinazozalishwa na `docs/tests/task-29/mk.py`). Conversation: `POST /api/boardroom` (brief + tag
  `[xmdtest:inputT4]`), ufuatiliaji: `GET /api/boardroom/attach?id=…`.
- Fixture: `xmdtest-api` — Notes API ndogo ya Node (bila UI). T4: `DELETE /api/notes/:id` haina auth (ledger inaitaka). T5: API safi lakini
  `config.js` ina tokeni BANDIA `ghp_XMDTEST29…` na Build Report inadai "No secrets are committed … Secrets scan: clean."
- Map ya milestone (profile, `XMD_TEST_MAP_FORCE`): `reviewMode: "technical"`, roster `optimus, megatron, cybertron` (Ultron/Vextron hawapo).

Ushahidi: `docs/tests/task-29/T1 … T5/` (excerpts ≤40 mistari) · `fixtures/` (R0 evidence ya fixtures kwenye E2B halisi kabla ya Koyeb).
Hakuna `.log` wala streams.

## Muhtasari

| Test | Inachothibitisha | Matokeo |
|---|---|---|
| T1 | Tokeni bandia `ghp_` + `.env` iliyo-commitiwa → secrets scan inafeli, inataja faili, thamani zimefichwa | **PASS** — `tech/secrets FAIL · 3 secret(s) in 2 file(s): .env, server.js` · `ghp_****…(42 chars)`, `eyJh****…(126 chars)`, `.env committed_env`; thamani halisi haipo kwenye matokeo (`raw ghp_ value present: false`) |
| T2 | Endpoint iliyo wazi kimakosa → http check (401) inafeli; baada ya fix inapita (HTTP halisi) | **PASS** — kabla: `GET /api/admin (no credentials) → HTTP 200 (expected 401)` FAIL; baada ya commit ya fix: `→ HTTP 401` PASS; server imezimwa (`000`) |
| T3 | Table `xmdtest_nors` bila RLS kwenye Supabase halisi → db check inaiflag; kisha inafutwa | **PASS** — `plan/nors-rls FAIL — RLS is DISABLED`; baada ya `ENABLE RLS` → PASS; `DROP` → `count 0` |
| T4 (Koyeb) | Loop kamili ya technical (analysis → COs → fix → verify → sign-off) bila screenshots | **PASS** (run 7, session f430b4b5): R0 `plan/delete-noauth FAIL` → Megatron + Cybertron (huru) → consensus → CO-001 (`server.js`, acceptance http/command tu) → R1 APPLIED, checks 9/9 → technical R1 10/10 → verify wote PASS → **`SIGNED_OFF`**, tag `milestone-M1`, `finalReport clean:true`; manifest R0/R1 `screenshots 0 · domMetrics 0` |
| T5 (Koyeb) | Build Report inadai "no secrets" lakini scan inapata → reviewers wanaflag mgongano | **PASS** (session c7d5de6e): `tech/secrets FAIL · config.js`; **wote wawili, huru**: Megatron D-002 [major] "Build report falsely claims secrets scan is clean" (ev `check:tech/secrets`, `build-report`), Cybertron D-005 [major] sawa; R1: tokeni imeondolewa → `tech/secrets PASS`, D-001/D-004 `VERIFIED_FIXED` |

## Runs (sessions zote zilifutwa mara baada ya kila run)

Kila run ilifichua kasoro HALISI ya technical mode → fix → push → Koyeb deploy → conversation MPYA (kanuni S1). Sababu ya kila run ni tofauti
(kanuni #6 "same test fails twice for the same cause → STOP" haikufikiwa; 429 ya Gemini ilionekana run 2 (reviewer mmoja, run iliendelea) na
run 3 (wote wawili — kosa la kwanza la T4 kwa sababu hiyo); baada ya fix 6fc5d73 haikuangusha tena run yoyote).

| Run | Session | Deploy | Matokeo / kasoro iliyopatikana | Fix |
|---|---|---|---|---|
| T4 #1 | 6e6a372e | `f842090` | Agenda ya mjadala: "website UI/UX defects…" kwenye technical → query za search za UI | `cc113c8` K1 |
| T4 #2 | 72807a20 | `cc113c8` | Megatron analysis: 429 ya Gemini (review `allow: ["gemini"]`); COs: http bila `method`/`headers`, faili za kubuni (`routes/notes.js`…), url `/path` = ERROR, globals za browser (`console_clean`) kwenye technical; `UNLISTED_CHANGE package-lock.json` | `16e486e` K2, `956ba37` K3–K5, `53ffa2e` K6 |
| T4 #3 | 24ba3941 | `53ffa2e` | Reviewers WOTE: 429 ndani ya 1s — broker `maxHops` 5 zote Gemini | `6fc5d73` K7 |
| T4 #4 | 274428ab | `6fc5d73` | COs nzuri; R1 REVERT: server ILIYOACHWA na Computer kwenye 4173 (hali/code ya zamani) ilitumiwa na checks; `delete-auth` ilifuta note ya seed kabla ya `notes-read`; Megatron INVALID (429 ilitumia nafasi ya JSON) | `b1c52fe` K8–K10 |
| T4 #5 | 2cf695b8 | `b1c52fe` | R1 BEST, R2 defects 1→0, COs zote PASS — **BLOCKED** na `UNLISTED_CHANGE .gitignore` tu (Computer: `server.log` ndani ya repo); CO ya Build Report ilidai "script ichapishe issue" | `4d131a3` K11–K12 |
| T4 #6 | 58e3577a | `4d131a3` | Consolidation INVALID ×3: `visionNote` haipo (prompt inasema si lazima kwa technical) + JSON mbovu (body ya JSON ndani ya string) → BLOCKED | `8bb3746` K13–K14 |
| **T4 #7** | f430b4b5 | `8bb3746` | **PASS** — `SIGNED_OFF` R1 | — |
| **T5** | c7d5de6e | `8bb3746` | **PASS** | — |

### Kasoro zilizopatikana kwenye majaribio halisi (zimerekebishwa, zote zina unit tests)

- **K0 (T3, harness halisi):** `defaultDbProbe` → supabase-js kwenye Node 20: "Node.js 20 detected without native WebSocket support" → `realtime: { transport: ws }` (`dbProbe.ts`).
- **K1:** kichwa cha agenda ya REVIEW + "EVIDENCE REFERENCES" vilikuwa vya UI kwenye technical → `reviewMode` inaamua (`reviewAgenda.ts`).
- **K2:** analysis ya technical (text tu, `image 0`) ilifungiwa Gemini → `textOnly` → lane yoyote nzito (`review.ts`).
- **K3:** Optimus hakujua `method`/`headers`/`body` za http wala `db` → `CHECK_SPEC` imeongezwa; **TECHNICAL HINTS** badala ya ROUTES/DOM HINTS: checks kamili za plan, matokeo, `REPO FILES` (git ls-files) — `technicalHints()` (`techEvidence.ts`), `pack.technical.files`.
- **K4:** url `"/path"` (inayoruhusiwa na CHECK_SPEC) ilienda `fetch` → ERROR → sasa `http://127.0.0.1:<port>/path` ndani ya sandbox (`checks.ts`).
- **K5:** technical: hakuna `global/console_clean` / `no_horizontal_overflow` (`roundChecks({technical})`), na `validateChangeOrder` inakataa acceptance za browser (maelezo29 #3).
- **K6:** `npm audit` iliunda `package-lock.json` ya kudumu → UNLISTED_CHANGE → lockfile ya muda inafutwa baada ya audit.
- **K7:** kosa la LLM → kusubiri 45s na kujaribu tena; technical `maxHops: 10` (broker inafika lanes zisizo Gemini).
- **K8:** `withLocalServer` ilitumia server iliyokuwepo kwenye port → sasa inazimwa (ss/fuser) na Start Command inawashwa upya. Imethibitishwa pia kwenye E2B halisi (`real.mjs stale`: "stale-code" → check "fresh-code" PASS, baadaye `000`).
- **K9:** Optimus anaambiwa checks za CO zinaendeshwa kwa mpangilio dhidi ya app MOJA (hali ya kumbukumbu): reads kwanza, usifute data inayosomwa baadaye.
- **K10:** makosa ya LLM hayatumii nafasi za kurekebisha JSON (kikomo tofauti).
- **K11:** mgongano wa Build Report → unarekebishwa kwenye CODE, acceptance = check inayothibitisha dai (si script inayochapisha maandishi).
- **K12:** mkataba wa receipts (TS + `cu/bridge.py`): log za app nje ya repo (`/tmp`), usibadilishe `.gitignore` bila order. T5: `fix:M1:R1 flags []`.
- **K13:** body ya http inaweza kuwa JSON object → `application/json` (hakuna JSON-ndani-ya-string).
- **K14:** technical: `visionNote` ikikosekana = `""`.

## T1 — secrets scan (E2B halisi) — `T1/run.txt`
Fixture: `server.js` yenye tokeni bandia `ghp_…` (42 chars) + `.env` iliyo-commitiwa (JWT bandia). `captureTechEvidence` →
`tech/secrets FAIL — 3 secret(s) in 2 file(s): .env, server.js` · `- .env committed_env (file is tracked by git)` · `- .env:2 supabase_service_key eyJh****…(126 chars)` ·
`- server.js:2 github_token ghp_****…(42 chars)` · `raw ghp_ value present in result: false · raw JWT present: false`. Sandbox imeuawa.

## T2 — negative http check (E2B halisi, HTTP halisi) — `T2/run.txt`
Commit 1: `/api/admin` ni PUBLIC → `plan/admin-noauth FAIL — GET … (no credentials) → HTTP 200 (expected 401)`; `admin-auth PASS`.
Commit 2 (fix: bearer token) → `admin-noauth PASS → HTTP 401`; `admin-auth PASS · body contains "xmdtest-alice"`. Baada ya checks: `000` (server imezimwa).

## T3 — RLS kwenye Supabase halisi — `T3/run.txt`
`CREATE TABLE public.xmdtest_nors` (bila RLS) → db check kupitia client ya app (`defaultDbProbe` → rpc `xmd_table_security`, `docs/sql/xmd_table_security.sql`):
`plan/nors-rls FAIL — RLS is DISABLED (plan requires RLS)`; kontroli `boardroom_sessions` PASS; `ENABLE ROW LEVEL SECURITY` → PASS; `DROP` → `count 0`.

## T4 — loop kamili ya technical (Koyeb, run 7, session f430b4b5) — `T4/timeline.txt`, `T4/records.txt`, `T4/git.txt`
- Fixtures zilipimwa kwanza kwenye E2B halisi (`fixtures/fx4-R0-evidence.txt`: 9/10, `delete-noauth` FAIL pekee).
- R0: `🛡️ technical: checks 9/10 · not passing: plan/delete-noauth FAIL` → `technical review — reviewers Megatron + Cybertron (roster: optimus, megatron, cybertron) · screenshots 0`
  → prompts `text 1 + image 0`, hashes tofauti, independence ok → 429 → retry → wote VALID → mjadala "backend / security / API defects…" → consensus → **CO-001** (`server.js`, acceptance `command` + `http` zenye `method`/`headers`, negative bila credentials).
- R1: `APPLIED 1 … checks PASS 9` → `technical R1 10/10 PASS · secrets 0` → `verify R1: CO-001 PASS · regressions 0 · new 0` (wote wawili) →
  **`SIGNED_OFF: all 1 CO(s) PASS · checks 9 PASS · no open defect ≥ medium · receipts match`**.
- `signoff:M1` → ledger `MS-M1`, git `99fbab7` + tag `milestone-M1` ("committed · tagged · no remote"), `finalReport` `clean: true, closed: 2`.
- Manifest: `evidence:M1:R0` na `R1` → `screenshots 0 · domMetrics 0` (hakuna hatua ya screenshot; baselines zinarukwa kwa technical).

## T5 — Build Report vs secrets scan (Koyeb, session c7d5de6e, `XMD_TEST_STOP_AFTER_ROUND=1`) — `T5/records.txt`, `T5/timeline.txt`
- R0: `tech/secrets FAIL — 1 secret(s) in 1 file(s): config.js` (fixture `fx5`: 9/10, secrets ndiyo pekee).
- Findings huru: Megatron D-001 [blocker] siri + **D-002 [major] "Build report falsely claims secrets scan is clean"** ("Section 4 states 'Secrets scan: clean' … directly contradicting check:tech/secrets");
  Cybertron D-004 [major] siri + **D-005 [major] mgongano huohuo**. Thamani inaonekana kama `ghp_****…(41 chars)` tu.
- R1: COs 6 → tokeni imeondolewa (`tech/secrets PASS`), D-001/D-003/D-004 `VERIFIED_FIXED`, receipts `flags []`, defects 5 → 2, kisha inasimama (stop hook).
- D-002/D-005 zilibaki wazi: acceptance ya CO-002 ilitumia `grep -r .` (si `git grep`) ikakuta `ghp_` ndani ya `.xmd/oh/…/events/*.json`
  (logs za ndani za OpenHands, **si tracked**; `git ls-files .xmd` = receipts + report, report haina tokeni). Si uvujaji — ni udhaifu wa acceptance (tazama hatari #2).

## Tests za code
- Mpya: `src/lib/milestone/__tests__/techEvidence.test.ts` (27 — scan/masking, cast/roster, http negative kwa server halisi, `/path`, server iliyochakaa,
  body ya JSON, `roundChecks` technical, `technicalHints`, CO validation, workspace safi baada ya audit); nyongeza `review.test.ts` (textOnly, retry),
  `reviewAgenda.test.ts` (kichwa/evidence technical), `schemas.test.ts` (technical acceptance).
- Baselines (kabla → baada): tsc 0 → 0 · vitest 699+2 → **730+2** · eslint 29 → 29 · pytest (`cu/tests`) 338+3 → 338+3 · unittest OK → OK.

## Uchunguzi / hatari kwa CEO
1. **Uwezo wa LLM ni mdogo sana sasa:** Gemini "exceeded your current quota", OpenRouter `free-models-per-day`, Uno 5/dak. Analysis za technical sasa zinapita
   (retry + lanes zisizo Gemini), lakini kila run ya T4 ilichukua dakika 15–35.
2. **Acceptance za Optimus bado zinaweza kubuni amri** (T5: `npm run check:tech/secrets`, `grep -r .`). Pendekezo (halijafanywa — halijajaribiwa halisi):
   kumwambia kwamba checks za harness (`check:tech/*`, `check:plan/*`) zinaendeshwa upya kila raundi, na grep ya siri itumie `git grep`.
3. **Pendekezo dogo (halijafanywa):** technical — findings bila field `screenshots` zichukuliwe kama `[]` (model zisizo Gemini huiacha → jaribio moja la JSON linapotea; T4 run 7 ilipona kwa retry).
4. Log ya Koyeb bado inaandika `Megatron (designer)` — "designer/frontend" ni majina ya slots za ndani; prompt inatumia role halisi (`You are Megatron, the …`).
5. Env ya Koyeb `XMD_TEST_PROFILE_DIR` sasa ni `docs/tests/task-29/inputs` (profiles za T28 bado zipo kwenye folda yake). `XMD_MILESTONES` haijawekwa global.
6. Sandboxes 16 za E2B za tarehe 13–15 Sep (kazi za zamani) bado zinaonekana kwenye orodha — sikuzigusa.
7. `XMD_TEST_SECRET` (T28) bado inahitaji kubadilishwa.

## Usafishaji
- Sessions zote 8 (T4 #1–#7, T5) + rows (cu_files, ledger, plans, mini_reports) + vitu vya bucket vya dirisha la kila run → zimefutwa; `sess.mjs` ya ids zote 8 → `[]`.
  (Usafishaji wa T4 #7 ulitumia dirisha lililoingiliana na mwanzo wa T5 — snapshot ya mwanzo ya T5 huenda ilifutwa mapema; T5 haikuhitaji resume.)
- Sandboxes za E2B za majaribio zote zimeuawa (`e2blist` ya leo → 0). Table `xmdtest_nors` imefutwa (`count 0`). Fixtures za T1/T2 zilikuwa kwenye sandboxes zilizouawa.
