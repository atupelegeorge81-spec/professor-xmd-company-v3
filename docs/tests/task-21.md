# Task 21 (maelezo21): Check runners (code inaamua PASS/FAIL)

Branch: `task/21-checks` · Tarehe: 2026-10-18 · Inahitaji Tasks 9, 19, 20 (ziko `main` 9251878).

## Kilichobadilika
| Faili | Mabadiliko |
|---|---|
| `src/lib/milestone/checks.ts` (mpya) | `runCheck` / `runChecks` / `canSignOff` / `applyReviewerVerdict`. command·grep·file_* = shell ndani ya sandbox (`sbxShell`: exit halisi + mistari 40 ya mwisho, haitupi exception kwa exit≠0). http: localhost → curl ndani ya sandbox, URL ya nje → fetch ya harness. Checks 6 za browser → batch MOJA ya `xmd-evidence.mjs`. screenshot_taken → EvidencePack + PNG halisi. Check batili / exception / runner kukosa → **ERROR** |
| `cu/xmd-evidence.mjs` | `mode:"checks"`: `runBrowserChecks` (kurasa zinapangwa route×viewport na kufunguliwa mara moja) + `evalCheckPart`; contrast/touch zinatumia `collectDomMetrics` ya Task 20 (WCAG ileile); `normStyle` (#hex → rgb()); matokeo → `manifest.checks[]`. `generic:[]` inaruhusiwa |
| `src/lib/milestone/types.ts` | Fields za maelezo21 kama hiari (za zamani bado halali): grep `paths`/`count`/`op`, computed_style `forbidden`, overflow/console `routes`/`viewports`, touch `px`, http `status`/`bodyContains`, screenshot `state` |
| `src/lib/milestone/schemas.ts` | `validateCheck` inakubali shapes mpya + za zamani (AU-rules) |
| `src/lib/milestone/plan.ts` | `CHECK_SHAPES` (prompt ya Optimus) inaonyesha shapes mpya |
| `tests/fixtures/t21-cases.json`, `t21-repo/`, `noisy.html` | kesi 24 + ziada 7, repo ndogo, ukurasa wenye makosa ya console |
| `src/lib/milestone/__tests__/checks.test.ts` | unit tests 10 |

## Maamuzi yangu
1. **Utangamano:** shapes za Task 9 (`expect`, `minPx`, `expectStatus`, `route`) zinabaki halali. Za maelezo21 (`count/op`, `px`, `status`, `routes/viewports`, `forbidden`, `bodyContains`) zimeongezwa kama mbadala. Hakuna plan ya zamani inayovunjika.
2. **Viewport ya default** kwa checks za ukurasa mmoja = `375x667` (mobile-first, kali zaidi kwa touch na overflow). `no_horizontal_overflow` bila viewport = viewports zote 3.
3. **ERROR dhidi ya FAIL:**
   - ERROR = check haikuweza kuendeshwa: selector batili, schema batili, server haikuanza, grep exit 2 (path haipo au regex mbaya), http bila jibu, hakuna evidence pack.
   - FAIL = imeendeshwa na matokeo ni mabaya: elementi hazipo, route 404, faili halipo kwa `file_contains`.
4. **Elements nyingi:** computed_style/contrast/touch zinapima ZOTE zinazolingana. Moja tu ikiwa mbaya, check ni FAIL. 0 zinazolingana → FAIL.
5. **grep** inahesabu mistari (`grep -rEn`), na inaruka `node_modules`, `.next`, `dist` + `.git`. Pattern ni ERE.
6. **Kanuni ya dhahabu (`applyReviewerVerdict`):** matokeo ya code ni ya mwisho kila wakati. Reviewer akisema PASS juu ya FAIL/ERROR → `overrideRejected:true` na matokeo hayabadiliki. Maoni ya reviewer juu ya PASS yanahifadhiwa tu (yatakuwa defect, task 23+). Task 26 itaitumia.
7. Fixture ya command FAIL ni `broken.sh` (`bash -n`), si `.js`, ili eslint ya project isiihesabu kama kosa jipya.

## Majaribio HALISI
Driver `xmdtest/t21.mjs`:
- sandbox mpya ya E2B (`professor-xmd-browser-v3`), Chromium halisi, `python3 -m http.server 4173`;
- fixtures za Tasks 19–20 + `t21-repo`; ndani yake folda `node_modules/`, `.next/`, `dist/` zimeundwa zenye TODO (grep lazima izirukie);
- evidence halisi (`captureEvidence`, PLAN-T20) kwa screenshot_taken; http dhidi ya site ya CEO.

### Kesi 24 (aina 12 × PASS/FAIL), zote kama zilivyoundwa
| Check | Aina | Inatarajiwa | Matokeo | | Ushahidi (detail ya runner) |
|---|---|---|---|---|---|
| `T21-command-pass` | command | PASS | **PASS** | ✅ | exit 0 (expected 0) — last lines: |
| `T21-command-fail` | command | FAIL | **FAIL** | ✅ | exit 2 (expected 0) — last lines: t21-repo/broken.sh: line 5: syntax error: unexpected end of file |
| `T21-grep-pass` | grep | PASS | **PASS** | ✅ | 2 matching lines for /TODO/ in t21-repo (rule: eq 2) t21-repo/src/a.js:1:// TODO: first marker t21-repo/src/a.js:2:export const a = 1; // TODO: second marker |
| `T21-grep-fail` | grep | FAIL | **FAIL** | ✅ | 1 matching lines for /console\.log/ in t21-repo (rule: eq 0) t21-repo/app.js:3: console.log("hello", name); |
| `T21-dom-pass` | dom_exists | PASS | **PASS** | ✅ | /good.html @375x667: "button.btn" matched 1 |
| `T21-dom-fail` | dom_exists | FAIL | **FAIL** | ✅ | /good.html @375x667: "form#contact" matched 0 |
| `T21-style-pass` | computed_style | PASS | **PASS** | ✅ | /evil.html @375x667: text-transform of "#mono" = uppercase (expected uppercase; 0/1 differ) |
| `T21-style-fail` | computed_style | FAIL | **FAIL** | ✅ | /good.html @375x667: background-color of "header" = rgb(10, 37, 64) (forbidden #0a2540; 1/1 match it) |
| `T21-overflow-pass` | no_horizontal_overflow | PASS | **PASS** | ✅ | /good.html @375x667: scrollWidth 375 vs clientWidth 375 · /good.html @768x1024: scrollWidth 768 vs clientWidth 768 · /good.html @1280x800: scrollWidth 1280 vs clientWidth |
| `T21-overflow-fail` | no_horizontal_overflow | FAIL | **FAIL** | ✅ | /evil.html @375x667: scrollWidth 378 vs clientWidth 375 (overflow 3px) |
| `T21-console-pass` | console_clean | PASS | **PASS** | ✅ | /good.html @375x667: 0 console/page/request errors · /site-a/ @375x667: 0 console/page/request errors |
| `T21-console-fail` | console_clean | FAIL | **FAIL** | ✅ | /noisy.html @375x667: 4 console/page/request errors — HTTP 404: http://127.0.0.1:4173/does-not-exist-xmdtest.png ; console: Failed to load resource: the server responded  |
| `T21-contrast-pass` | contrast_min | PASS | **PASS** | ✅ | /good.html @375x667: "p, h1, .btn" 3 text elements, min contrast 6.7 (rgb(255, 255, 255) on rgb(29, 78, 216)) vs required 4.5; 0 below |
| `T21-contrast-fail` | contrast_min | FAIL | **FAIL** | ✅ | /evil.html @375x667: "#faint" 1 text elements, min contrast 2.03 (rgb(182, 182, 182) on rgb(255, 255, 255)) vs required 4.5; 1 below |
| `T21-touch-pass` | touch_target_min | PASS | **PASS** | ✅ | /good.html @375x667: ".btn, nav a" 4 visible, smallest 66.69×48 vs required 44×44; 0 too small |
| `T21-touch-fail` | touch_target_min | FAIL | **FAIL** | ✅ | /evil.html @375x667: "#tiny" 1 visible, smallest 20×20 vs required 44×44; 1 too small |
| `T21-http-pass` | http | PASS | **PASS** | ✅ | GET https://professor-xmd-professorcj-2c4d4efe.koyeb.app/api/live → HTTP 200 (expected 200) · body contains "\"ok\":true" |
| `T21-http-fail` | http | FAIL | **FAIL** | ✅ | GET https://professor-xmd-professorcj-2c4d4efe.koyeb.app/xmdtest-route-that-does-not-exist → HTTP 404 (expected 200) |
| `T21-file-exists-pass` | file_exists | PASS | **PASS** | ✅ | t21-repo/app.js exists (153 bytes) |
| `T21-file-exists-fail` | file_exists | FAIL | **FAIL** | ✅ | t21-repo/missing.txt does not exist |
| `T21-file-contains-pass` | file_contains | PASS | **PASS** | ✅ | t21-repo/README.md contains "XMD tiny repo" |
| `T21-file-contains-fail` | file_contains | FAIL | **FAIL** | ✅ | t21-repo/README.md does not contain "Lorem ipsum" |
| `T21-shot-pass` | screenshot_taken | PASS | **PASS** | ✅ | S-003 /good.html @375x667 [default]: .xmd/evidence/M1/R0/S-003.png 21961 bytes |
| `T21-shot-fail` | screenshot_taken | FAIL | **FAIL** | ✅ | no screenshot for /good.html @768x1024 [default] (pack has 5) |

### Ziada (maelezo21 + ulinzi)
| Check | Aina | Inatarajiwa | Matokeo | | Ushahidi |
|---|---|---|---|---|---|
| `T21-x-bad-selector-dom` | dom_exists | ERROR | **ERROR** | ✅ | /good.html @375x667: bad selector "div[[": Failed to execute 'querySelectorAll' on 'Document': 'div[[' is not a valid selector. |
| `T21-x-bad-selector-contrast` | contrast_min | ERROR | **ERROR** | ✅ | /good.html @375x667: bad selector "##nope" |
| `T21-x-bad-selector-style` | computed_style | ERROR | **ERROR** | ✅ | /good.html @375x667: bad selector "p:::x": Failed to execute 'querySelectorAll' on 'Document': 'p:::x' is not a valid selector. |
| `T21-x-grep-missing-path` | grep | ERROR | **ERROR** | ✅ | grep failed (exit 2) — bad pattern or missing path: grep: no-such-dir: No such file or directory |
| `T21-x-invalid-schema` | dom_exists | ERROR | **ERROR** | ✅ | invalid check: check[28].selector: must be a string (got undefined) |
| `T21-x-http-local-down` | http | ERROR | **ERROR** | ✅ | GET http://127.0.0.1:4199/: no HTTP response (connection failed) |
| `T21-x-route-404` | dom_exists | FAIL | **FAIL** | ✅ | /nope-xmdtest.html @375x667: route answered HTTP 404 |
| `T21-x-server-dead` | dom_exists | ERROR | **ERROR** | ✅ | browser runner gave no result for this check — server: server did not answer HTTP 200 on http://127.0.0.1:4173/ within 1s (last: ECONNREFUSED; exit 3) — boom |

- `http` dhidi ya `/api/live` ya CEO → 200 **PASS** (na body ina `"ok":true`); path ya 404 → **FAIL** ✅
- Selector batili (dom_exists, contrast_min, computed_style) → **ERROR**, si PASS ✅
- **Kanuni ya dhahabu (halisi, juu ya matokeo ya suite):** FAIL + reviewer "PASS" → `FAIL` (overrideRejected true); ERROR + reviewer "pass" → `ERROR` (overrideRejected true); `canSignOff` yenye FAIL → false, zote PASS → true ✅

**Jumla: 32/32 kama zilivyoundwa.**

### Muda (lengo < dakika 3)
- `runChecks` ya kesi 31 (24 + ziada 7; browser = batch 1, kurasa 9): **7.2s**
- Jumla pamoja na evidence ya screenshots (10.4s) na jaribio la server iliyokufa: **18.8s** ✅

Suite ilipita mara 2: ya kwanza na `broken.js`, ya mwisho na `broken.sh`.

Usafi:
- sandboxes 2 zimeuawa na workspaces `xmdtest-t21*` zimefutwa;
- regression ya Task 20 (23/23) ilifanywa tena juu ya `xmd-evidence.mjs` mpya; uploads zake 10 zimefutwa (ombi la pili la kufuta → 0).

## Unit tests + baselines
- `checks.test.ts` (10): shapes mpya na za zamani, grepRule/grepCompare, shq, kanuni ya dhahabu, canSignOff, check batili / sandbox iliyokufa / browser bila script / screenshot bila pack → ERROR.
- Baselines (kabla → baada):
  - tsc 0 → 0
  - vitest 533 + 2 skipped → **543 + 2 skipped**
  - pytest 330 + 3 skipped → sawa
  - unittest 263 OK → sawa
  - eslint (bila `backups/`) 29 → 29 (0 mpya)

## Noti
- `runChecks` bado haijaunganishwa na loop ya milestone. Hiyo ni kazi ya tasks zinazofuata (verdict ni task 26). Hakuna tabia ya live iliyobadilika; pipeline iko nyuma ya `XMD_MILESTONES`.
- http ya localhost inahitaji app iwe inaendeshwa ndani ya sandbox wakati check inaendeshwa; isipoendeshwa → ERROR (kesi `T21-x-http-local-down`).
