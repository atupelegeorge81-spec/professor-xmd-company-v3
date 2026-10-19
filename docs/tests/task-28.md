# TASK 28 — Kikomo cha raundi, sign-off, commit/tag, defects zilizorithiwa — ushahidi wa majaribio HALISI

Branch `task/28-signoff` · nyuma ya `XMD_MILESTONES` (OFF kwa default) · inategemea T27 (main `31650ed`).

Mazingira:
- **T1–T3:** `next start` (production build) kwenye sandbox ya agent, port 3100, cloudflared tunnel kama `CU_PUBLIC_URL`.
- **T4a, T4b, T5 — kwenye KOYEB** (agizo la CEO 2026-10-19: usibuild kwenye sandbox; push → Koyeb ina-deploy → conversation kupitia Koyeb).
  Deploy `9f4d7e66` (commit `1d65e5b`), env mpya `XMD_TEST_PROFILE_DIR=docs/tests/task-28/inputs`. Conversation ilianzishwa kwa
  `POST https://professor-xmd-professorcj-2c4d4efe.koyeb.app/api/boardroom` (brief + tag `[xmdtest:inputT4a]`, n.k. — `harness/gok.sh`).
- Sandbox: E2B halisi, OpenHands (XMD Computer). Data: Supabase halisi. LLMs: halisi (reviewers Ultron + Vextron, Optimus).
- Fixture: `xmdtest-site` "Kivuli" (`harness/mk.mjs`) — msingi safi zaidi kuliko T27 (tap targets 44px, header max-width) + kasoro za kila jaribio.

Harness: `docs/tests/task-28/harness/` · inputs/profiles: `docs/tests/task-28/inputs/inputT*.json` (kila moja na `env` yake) ·
ushahidi: `docs/tests/task-28/T1 … T5/` (rekodi za store `signoff:M1`, entry ya ledger `MS-M1`, `finalReport`, `state:M1`, `defects`,
`git.txt` ya sandbox, `timeline.txt` ≤40 mistari). Hakuna `.log` wala streams.

## Muhtasari

| Test | Inachothibitisha | Matokeo |
|---|---|---|
| T1 | Defects 2 rahisi → `SIGNED_OFF`, tag `milestone-M1`, baselines, ledger | **PASS**: R1 COs 2 PASS → `SIGNED_OFF`; `git tag -l` → `milestone-M1` (annotated, commit `6827177 xmd: sign-off M1 (SIGNED_OFF, round 1)`); baselines 3 (uploaded 4, manifest public); ledger `MS-M1` (closedDefects D-001, D-002); `finalReport` clean=true; event `milestoneSignedOff` ×1 |
| T2 | `XMD_TEST_MAX_ROUNDS=2` + defect isiyorekebishika → `CAP_REACHED` → INHERITED → StartPack + plan ya M2 | **PASS**: R2 → `CAP_REACHED` 2/2; D-001 `INHERITED` (`inheritedFrom: M1`, inherited checks 6); ledger `inherited: [D-001]`, hakuna tag; plan:M2 (Optimus HALISI) ina §10 Inherited Defects + hatua "CRITICAL FIX FOR D-001"; StartPack:M2 "(e) Inherited defects — D-001 …" (grep hapa chini) |
| T3 | WAIVE → `SIGNED_OFF_WITH_WAIVERS` + sababu kwenye ledger | **PASS**: R4 split → FAIL → ladder attempt 5 redecide **WAIVE** (wote 3) → `SIGNED_OFF_WITH_WAIVERS`; ledger `waivers[0].reason` = "Both reviewers voted WAIVE. Locked Ledger A1 explicitly forbids …"; tag `milestone-M1`; clean=false |
| T4a (Koyeb) | Minor moja wazi inaruhusiwa na inaorodheshwa | **PASS**: `SIGNED_OFF` + `backlog: [D-003 minor]` kwenye ledger na `finalReport` (clean=false); D-003 inabaki OPEN; tag `milestone-M1` |
| T4b (Koyeb) | Medium moja wazi hairuhusiwi kusign-off | **PASS**: CO-001 PASS lakini D-004 (medium) wazi → **hakuna sign-off** (`decideNext`: "open defects ≥ medium: D-004"), raundi 1/1 → `CAP_REACHED`, D-004 `INHERITED`; hakuna tag `milestone-M1` |
| T5 (Koyeb) | `kill -9` mara baada ya commit/tag → recovery bila tag/commit mbili, hali thabiti | **PASS**: process ya Koyeb ilijiua (SIGKILL) 17:42:12 baada ya commit `10c7aad` + tag; rekodi: `ledger` tu (hakuna `git`), state `VERIFYING`. Resume (`POST /api/boardroom/resume`) → `tag exists · no remote` → `SIGNED_OFF`; tags: `milestone-M1` ×1, commits za sign-off ×1, ledger `MS-M1` ×1, ripoti safu 1, event ×1 |

## Runs (sessions zote zilifutwa mara baada ya kila run)

| Test | Session | Mahali | Matokeo |
|---|---|---|---|
| T1 (jaribio la kwanza) | af8c681f | sandbox | Ilisimamishwa: defect ya "CTA tap target" iliwafanya reviewers wakague tap targets zote (nav, logo) → kila raundi new defects → REVERT. **Muundo wa jaribio**, si code ya T28 → msingi wa fixture ulisafishwa, defect ya 2 = rangi ya `.lead` (A4) |
| T1 | 86997010 | sandbox | **PASS** (R1) — ilionyesha **K1** (hapa chini) |
| T2 | 1058f89f | sandbox | **PASS** |
| T3 (jaribio la kwanza) | bc056c77 | sandbox | Harness ilitumia WAIVE KABLA ya raundi (seedEx) → R5 haina COs → BLOCKED. **Kasoro ya harness**; flow halisi inawaive BAADA ya verify → ilirudiwa hivyo |
| T3 | 6d60a3dc | sandbox | **PASS** — ilionyesha **K2** |
| T4a | 14452279 | **Koyeb** | **PASS** (dakika 6) |
| T4b | b1d63e9e | **Koyeb** | **PASS** |
| T5 | a9ce0223 | **Koyeb** | **PASS** (kill -9 + resume) |

### Kasoro zilizopatikana kwenye majaribio halisi (zimerekebishwa, na zina unit tests)

- **K1 (T1):** commit ya sign-off ilijumuisha `.xmd/checks/M1-fix/` (manifest + `server.log`) — matokeo ya harness, si kazi.
  → `git add -A -- . ':(exclude).xmd/checks'` (commit `7899258`). T4a/T5: commit ya sign-off haina faili hizo.
- **K2 (T3):** sign-off ilitokea kwenye raundi iliyorudishwa (REVERT) → baselines zilihifadhiwa kutoka evidence ya R4 ambayo HAILINGANI na HEAD
  (kazi ya R4 ilirudishwa). → `baselineRound()`: evidence ya raundi ya mwisho isiyorudishwa; ikiwa hakuna (stubs) → baselines zinarukwa
  na sababu inaandikwa (`signoff:Mk.baselines.errors`). Unit test `signoff.test.ts`.
- **K3 (Koyeb, kabla ya T5):** alama ya "crash mara moja" ilikuwa `/tmp` → container ya Koyeb ikianzishwa upya ingejiua tena.
  → alama kwenye store (`xmdtest-crash:Mk`) (commit `1d65e5b`).

## T1 — SIGNED_OFF + tag + baselines (session 86997010)

```
12:43:45 ledger MS-M1 · 12:43:49 🏷️ M1 sign-off: tag milestone-M1 @ 6827177 — committed · tagged · no remote
12:43:52 🖼️ M1 baselines: 3 saved · uploaded 4
CHIP 🏁 M1 SIGNED_OFF · tag milestone-M1
12:43:57 ✅ M1 R1 → SIGNED_OFF: all 2 CO(s) PASS · checks 5 PASS · no open defect ≥ medium · receipts match · BEST (open defects 2 → 0)
```
`T1/git.txt` (ndani ya sandbox ya milestone):
```
milestone-M1
xmd-best-M1
---
6827177 xmd: sign-off M1 (SIGNED_OFF, round 1)
f88b715 M1 R1: CO-001, CO-002
93e581c xmdtest-site: seed
--- git cat-file -t milestone-M1 → tag (annotated) · git remote → (hakuna) → "no remote"
.xmd/baselines/M1: manifest.json root-1280x800-default.png root-375x667-default.png root-768x1024-default.png
```
`T1/signoff_M1.json`: hatua `ledger → git (6827177) → baselines (entries 3, uploaded 4, manifestUrl) → report → event`.
`T1/baseline-manifest.json`: kila entry ina `sourcePath .xmd/evidence/M1/R1/S-00x.png` + URL ya storage.

## T2 — CAP_REACHED → INHERITED → M2 (session 1058f89f, `XMD_TEST_MAX_ROUNDS=2`)

```
13:06:37 ✅ M1 R1 → FIXING: COs not PASS: CO-001 · checks 1 FAIL · open defects ≥ medium: D-001
13:09:33 📦 M1 CAP_REACHED: defects D-001 → INHERITED (milestone inayofuata: StartPack + plan + checks kila raundi)
CHIP 📦 M1 CAP_REACHED (round 2) — NOT clean: inherited D-001 → next milestone
13:09:41 ✅ M1 R2 → CAP_REACHED: round 2/2 — COs not PASS: CO-002 · checks 4 FAIL · open defects ≥ medium: D-001 (medium)
13:11:03 🧪 XMD_TEST_VERIFY_INPUT: M2 plan (active, hatua 3) + StartPack — inherited defects 1: D-001
```
`grep -n "D-001\|Inherited" T2/plan_M2.md` (plan ya Optimus, halisi):
```
94:  - **Goal:** ... and explicitly fix defect D-001 by forcing nav links to uppercase.
103:  6. **CRITICAL FIX FOR D-001:** Style `.site-nav a` with `text-transform: uppercase; ...`
192:- **Inherited Defect D-001:** You MUST apply `text-transform: uppercase;` to `.site-nav a`. ...
200:## 10. Inherited Defects (verbatim — from earlier milestones; keep them in view, their checks run every round)
202:- D-001 [medium] Nav links must be uppercase (CEO brand sheet: 'SHOP · STORY · CONTACT') — expected: ... (INHERITED from M1, 2 attempt(s))
```
`grep -n "Inherited\|D-001" T2/startpack_M2.txt`:
```
39:## (e) Inherited defects
40:- D-001 [medium] Nav links must be uppercase (CEO brand sheet: 'SHOP · STORY · CONTACT') — expected: ... (INHERITED from M1, 2 attempt(s))
243:## 10. Inherited Defects (verbatim — ...)
```
`T2/defects.json`: D-001 `INHERITED`, `inheritedFrom: "M1"`, `inheritedChecks` = `inherited/D-001/…` ×6 (zinaendeshwa kila raundi ya M2+).
`T2/git.txt`: hakuna tag (cap si sign-off).

## T3 — WAIVE → SIGNED_OFF_WITH_WAIVERS (session 6d60a3dc, startRound 4)

```
13:31:10 🪜 escalation R4: CO-004 attempt 4 (split) → CO-005, CO-006
13:47:29 🔍 designer verify R4: CO-005 FAIL · CO-006 PASS · 13:47:47 ⏪ M1 R4 reverted (open defects 1 → 2)
CHIP 🏳️ WAIVE D-001 (M1 R4) — approved by designer + frontend + pm
13:52:45 🏷️ M1 sign-off: tag milestone-M1 @ 82c1459 — committed · tagged · no remote
CHIP 🏁 M1 SIGNED_OFF_WITH_WAIVERS · tag milestone-M1 · waivers D-001
13:52:56 ✅ M1 R4 → SIGNED_OFF_WITH_WAIVERS: all remaining defects waived by redecide (D-001)
```
`T3/ledger_MS-M1.json`: `status SIGNED_OFF_WITH_WAIVERS`, `waivers[0] = {defectId D-001, severity medium, round 4, reason "Both reviewers voted WAIVE. Locked Ledger A1 explicitly forbids all-caps text …", approvedBy […]}`.
Baselines za run hii zilitoka R4 iliyorudishwa → **K2** (imerekebishwa: sasa zingerukwa — R1–R3 ni stubs).

## T4a — minor moja wazi inaruhusiwa (Koyeb, session 14452279)

```
CHIP 🧪 test profile inputT4a: XMD_TEST_VERIFY_INPUT, XMD_MILESTONES, XMD_TEST_MAX_AGENDAS, XMD_TEST_MAP_FORCE
17:12:13 🏷️ M1 sign-off: tag milestone-M1 @ db2cb80 — committed · tagged · no remote
CHIP 🏁 M1 SIGNED_OFF · tag milestone-M1 · minor backlog D-003
17:12:19 ✅ M1 R1 → SIGNED_OFF: all 1 CO(s) PASS · checks 4 PASS · no open defect ≥ medium · receipts match · listed minor left: D-003
```
Ledger `backlog: [{D-003, "Footer copyright line missing", minor}]` · `finalReport` clean=false, backlog D-003 · defects: D-001 VERIFIED_FIXED, D-003 OPEN.
`git show --stat milestone-M1^{commit}` → commit tupu (K1 imethibitishwa).

## T4b — medium moja wazi hairuhusiwi (Koyeb, session b1d63e9e, `XMD_TEST_MAX_ROUNDS=1`)

```
17:25:35 🏷️ M1 R1: open defects 2 → 1 → best mpya (tag xmd-best-M1)
17:25:36 📦 M1 CAP_REACHED: defects D-004 → INHERITED
17:25:41 ✅ M1 R1 → CAP_REACHED: round 1/1 — open defects ≥ medium: D-004 (medium) · defects fixed 1
```
CO-001 ilipita (D-001 VERIFIED_FIXED), lakini medium D-004 ilibaki wazi → sign-off haikutokea. Tags: `xmd-best-M1` tu (hakuna `milestone-M1`).
Kinga ya pili (code): `closeoutProblems` inakataa sign-off yenye medium+ wazi hata kama uamuzi ungesema SIGN_OFF (unit test).

## T5 — kill -9 baada ya commit/tag (Koyeb, session a9ce0223)

Kabla ya resume (`T5/pre_*.json`, `T5/pre_git.txt`):
```
17:42:12 🧪 XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_M1: kill -9 baada ya commit/tag (kabla ya rekodi)
signoff:M1 = {status SIGNED_OFF, round 1, ledger {MS-M1}}        ← hakuna git/baselines/report/event
state:M1   = VERIFYING R1 · alama xmdtest-crash:M1 ipo
sandbox: tags milestone-M1, xmd-best-M1 · HEAD 10c7aad xmd: sign-off M1 (SIGNED_OFF, round 1)
```
Resume (`POST /api/boardroom/resume`, Koyeb):
```
CHIP 🧪 test profile inputT5: … XMD_TEST_CRASH_AFTER_SIGNOFF_GIT_M1
17:42:59 ♻️ Milestone M1 iko VERIFYING — inaendelea pale ilipoachwa (resume).
17:43:11 🏷️ M1 sign-off: tag milestone-M1 @ 10c7aad — milestone-M1: tag exists · no remote
17:43:16 🖼️ M1 baselines: 3 saved · uploaded 4
17:43:18 ✅ M1 R1 → SIGNED_OFF
```
Baada (`T5/git.txt` + rekodi): tags `milestone-M1` ×1 (→ `10c7aad`, ileile), commits za "sign-off M1" ×1, ledger `MS-M1` ×1
(sha `10c7aad`), `finalReport` safu 1, event `milestoneSignedOff`: kabla ya crash 0, baada ya resume 1. Crash haikujirudia (alama ya store).

## Tests za code

- `src/lib/milestone/__tests__/signoff.test.ts` — tests **12**: SIGNOFF_MAX_OPEN_SEVERITY; signoffStatus; closeoutProblems (medium wazi,
  minor nje ya backlog, WITH_WAIVERS ⇔ waivers, waiver bila sababu); inheritOpenDefects (idempotent, checks za CO ya mwisho);
  ledger/finalReport (cap si "clean"); inheritedFor/line/section; inherited checks → VERIFIED_FIXED; baselineRound (K2);
  XMD_TEST_MAX_ROUNDS; crash hook; applyTestProfile.
- `verify.test.ts` — 54 (+5): T1–T5 za loop (sign-off + git + baselines + ledger + report + event; cap 2 → INHERITED; WAIVE;
  minor backlog; closeOut baada ya "kill" → hatua hazirudiwi). Tests 2 za zamani zilisasishwa (git op ya sign-off; cap → INHERITED).
- `reviewAgenda.test.ts`: R0 NO_CHANGES — minor zinabaki OPEN (backlog), si INHERITED.
- Baselines kabla → baada:

| Kipimo | Kabla | Baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 683 + 2 | **699 + 2** |
| eslint (bila backups/) | 29 | 29 |
| pytest | 338 + 3 | 338 + 3 |
| unittest (repo root) | OK | OK |

## Uchunguzi / hatari kwa CEO

- **Kanuni ya T26 "defects ziliongezeka → REVERT"** inahesabu pia kasoro MPYA zilizokuwepo tangu mwanzo (hazikusababishwa na raundi).
  Reviewers wakali wakipata kasoro mpya halali kila raundi, kazi nzuri inarudishwa (T1 ya kwanza). Si sehemu ya T28 — inahitaji uamuzi.
- **Test profiles kwenye production:** env za majaribio zinawekwa kwa process nzima wakati run ya `[xmdtest:…]` inaendelea; conversation
  halisi inayoanzishwa wakati huo inaziondoa. Endesha majaribio wakati huna conversation halisi. `XMD_TEST_PROFILE_DIR` imebaki kwenye
  Koyeb (haina athari bila tag).
- **Push ya tag:** sandbox za milestone hazina git remote kwa sasa → "no remote" (spec: push ikiwa remote ipo — imetekelezwa, haijajaribiwa na remote halisi).
- Gemini 429 bado inaonekana (T4b, reviewer alirudia baada ya 30s).

## Usafishaji

Kila run: `cleanall.sh <sid> <from> <to>` (session + board_ledger + storage) → sandbox ya E2B iliuawa kwa prefix
(`it5ui8fj`, `iotf5x9z`, `ix42kev9`, `ifz5ip2b`, `ievsk5xo`, `i3jlfdzh`, `iuiq2on9`, `ij385xu9`). `sess.mjs` → sessions 0.
Sandbox za zamani (Sept–Okt 17) hazikuguswa (si za task hii).
