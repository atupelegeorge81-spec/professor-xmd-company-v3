# Task 22 (maelezo22): Baselines + regression (pixel diff)

Branch: `task/22-baselines` · Tarehe: 2026-10-18 · Inahitaji Tasks 19–21 (ziko `main` c7ababf).

## Kilichobadilika
| Faili | Mabadiliko |
|---|---|
| `cu/xmd-regression.mjs` (mpya) | Script ya sandbox (`.xmd/tools/`). `diffImages(baselinePath, currentPath, threshold)` → `{changedPct, diffPng}` kwa pixelmatch + pngjs (anti-aliasing inarukwa, default ya pixelmatch). Vipimo tofauti → `changedPct: 100` + `note`. Mode `save` (baselines) na `diff` (raundi). CLI `diff a.png b.png [out.png]`. `ensureDeps`: pixelmatch 7.2.0 + pngjs 7.0.0 zinasakinishwa kwenye `.xmd/tools/node_modules` **ikiwa hazipo tu** (`package.json` ya mradi haiguswi) |
| `src/lib/milestone/regression.ts` (mpya) | `saveBaselines` (sign-off; task 28 itaiita), `checkRegression` (kila raundi), `classifyRegression`, `regressionThresholdPct` (`REGRESSION_THRESHOLD_PCT`, default 2), majina (`baselineFileName`, `normRoute`), `regressionSummary` |
| `src/lib/milestone/types.ts` | `RegressionEntry` + `REGRESSION_KINDS` (`regression` / `expected_change`). `EvidencePack.regression: RegressionEntry[]` (ilikuwa `string[]` "task 22") |
| `src/lib/milestone/schemas.ts` | `validateEvidencePack` inakagua kila `regression[]` (kind, route, viewport, changedPct 0..100, URLs, hakuna `data:`) |
| `src/lib/cu/engine.ts` | Baada ya screenshots za R0: `checkRegression`. Hakuna baseline → hakuna kazi wala npm install. Pia `.xmd/baselines/` imeongezwa kwenye git exclude ya harness |
| `tests/fixtures/t22-site/`, `PLAN-T22.md` | Site ndogo (`/`, `/pricing/`, `/about/`) + `package.json` ya "mradi" |
| `src/lib/milestone/__tests__/regression.test.ts` | Unit tests 9 |

## Maamuzi yangu
1. **Diff inafanyika ndani ya sandbox**, mahali screenshots zilipo. Hakuna PNG inayopita kwenye harness isipokuwa diff zinazoorodheshwa (kwenda storage). pixelmatch/pngjs hazikuongezwa kwenye `package.json` ya repo yetu (maelezo22: "in the sandbox script only if absent").
2. **`threshold` ya `diffImages`** = unyeti wa pixelmatch kwa kila pixel (0.1, default). Ni tofauti na `REGRESSION_THRESHOLD_PCT` (% ya pixels zilizobadilika; inaorodheshwa ikiwa **zaidi** ya threshold, si sawa nayo). Env mbaya (`abc`, `-1`, `>100`) → 2.
3. **Majina:**
   - `/` → `root`; `/pricing/` → `pricing`;
   - state `menu-open` → `menu_open` (`-` ni kitenganishi);
   - key kamili (route iliyosawazishwa | viewport | state) iko kwenye manifest.
4. **Baselines nyingi:** kila key inachukua baseline ya karibuni kabisa (`savedAt`) kati ya milestones zote zilizoidhinishwa. Baseline isiyo na screenshot ya sasa → `notCaptured` (si regression).
5. **Storage:** kila PNG ya baseline + manifest inapakiwa. Manifest ya sandbox inaandikwa upya na URLs. Workspace ikipotea PNG (sandbox mpya / restore), script inaipakua kutoka storage (T4b).
6. **Expected change:** route ya `ChangeOrder.location.route` (imesawazishwa: `/pricing/` = `/pricing`) → `kind: "expected_change"` + `changeOrderIds`. Inabaki kwenye orodha (reviewer anaona), lakini si regression. Mpangilio: regressions kwanza, kisha % kubwa.
7. Diff PNG inaandikwa tu ikiwa pixels > 0. Inapakiwa tu kwa entries zilizoorodheshwa. Vipimo tofauti → `diffUrl: ""` + note (baseline na current URLs zipo).
8. Hitilafu yoyote (script, deps, download) → `pack.errors` (`harness`, "regression: …"). Raundi haianguki.

## Majaribio HALISI
Mazingira: driver `xmdtest/t22.mjs` · sandbox mpya ya E2B (`professor-xmd-browser-v3`) · Chromium halisi · `python3 -m http.server` · uploader halisi wa storage (engine `__t19`) · npm halisi ndani ya sandbox.

Mtiririko:
1. M1 R0: `captureEvidence` (picha 5) → **mini sign-off** = `saveBaselines(M1)`.
2. Rangi MOJA ya CSS inabadilishwa (`.cta` `#1d4ed8` → `#dc2626`, route `/`). `/pricing/` inapewa kisanduku kipya chini ya `CO-001`.
3. M2 R1: `captureEvidence` → `checkRegression` pamoja na `CO-001 {location.route: "/pricing/"}`.

| # | Jaribio | Matokeo | |
|---|---|---|---|
| T1 | Picha ileile (`root-375x667-default.png` dhidi yake) | `changedPct 0` · changedPixels 0/250125 · diffPng null | ✅ |
| T2 | Rangi moja ya CSS (`.cta`) kwenye `/` @375x667 | **`changedPct 12.884`** (32227 px) · diff PNG imeandikwa | ✅ |
| T3 | Viewport tofauti (375x667 dhidi ya 1280x800) | **`changedPct 100`** · note: "dimensions differ: baseline 375x667 vs current 1280x800 — not comparable pixel by pixel" | ✅ |
| T4a | Baseline kwenye mini sign-off | `.xmd/baselines/M1/`: root/pricing ×2 viewports + about = PNG 5 + manifest.json. Uploads 6 (5 PNG + manifest), errors 0, 2.0s | ✅ |
| T4 | Raundi inayofuata (M2 R1) | Baselines 5/5 zimepatikana (`base=M1`). `regression[]`: **regression `/`@375x667 12.884%**, **regression `/`@1280x800 3.147%**, **expected_change `/pricing`@375x667 18.985% (CO-001)**, **expected_change `/pricing`@1280x800 17.011% (CO-001)**. `/about` = **0%** (haikuorodheshwa). Kila entry ina `diffUrl` http(s). `validateEvidencePack(requireUrls)` OK | ✅ |
| T4b | PNG za baseline zimefutwa kwenye workspace | 5/5 zimerudishwa kutoka storage, entries sawa kabisa na T4, errors 0 | ✅ |
| T5 | `REGRESSION_THRESHOLD_PCT` (env; `thresholdPct` haipitishwi) | Bila env → 2 (entries 4). **`=14` → `/` (12.884%) haiorodheshwi**, `/pricing` (17–19%) inabaki. `=0.01` → 4. `=abc` → 2 (default) | ✅ |

**T1–T5: zote PASS.** Muda wa jumla (evidence 2 + save + diff 6): **35.1s**. `checkRegression` moja: 1.8s.

### T2: ukaguzi wa macho wa diff PNG
| baseline (M1) | current (M2 R1) | diff (pixelmatch) |
|---|---|---|
| ![](task-22/t2-baseline.png) | ![](task-22/t2-current.png) | ![](task-22/t2-diff.png) |

Maelezo ya diff:
- Kisanduku cha `.cta` "Get started" pekee (280×120 px, kutoka (16,192) hadi (296,312)) kimepakwa **nyekundu tupu**, yaani pixels zilizobadilika.
- Header, h1 "Home" na aya vimefifia kuwa kijivu: havijabadilika.
- Kingo za herufi "Get started" na pembe za mviringo ni **njano**, yaani anti-aliasing iliyotambuliwa na kurukwa (haihesabiwi).
- 32,227 px ≈ eneo la kisanduku (33,600) ukiondoa pembe na maandishi meupe yasiyobadilika. Eneo sahihi kabisa.

### Utengano wa deps
- Baada ya diff ya kwanza: `.xmd/tools/node_modules` = `pixelmatch`, `pngjs`.
- Mradi: hakuna `node_modules`; md5 ya `package.json` haijabadilika (`96081d617825` kabla = baada).
- Usakinishaji ulifanyika mara moja tu: raundi zilizofuata zina `depsInstalled: false`.

### Usafi
- Run ya kwanza ilionyesha kuwa mabadiliko ya `/pricing/` yalikuwa madogo mno (0.47% < 2%), kwa hiyo hayakuorodheshwa (tabia sahihi ya threshold). Fixture ilifanywa kubwa zaidi kwa run ya pili.
- Uploads zote za run 2 (86) zimefutwa; ombi la pili la kufuta → 0.
- Workspace `xmdtest-t22` imefutwa na sandbox imeuawa.

## Unit tests + baselines
- `regression.test.ts` (9):
  - majina (harness = script ya sandbox);
  - env threshold;
  - classify (> si ≥, CO → expected, vipimo tofauti);
  - schema ya `regression[]`;
  - script iliyoshindwa → `pack.errors`;
  - save bila screenshots.
- Baselines (kabla → baada):
  - tsc 0 → 0
  - vitest 543 + 2 skipped → **552 + 2 skipped**
  - pytest 330 + 3 skipped → sawa
  - unittest 263 OK → sawa
  - eslint (bila `backups/`) 29 → 29 (0 mpya)

## Noti
- `saveBaselines` bado haiitwi na loop. Sign-off halisi ni task 28. Kwa sasa engine inaendesha `checkRegression` kwenye R0 tu, na `changeOrders: []` (COs zinakuja na raundi za marekebisho, task 24+).
- Reviewers kupokea `regression[]` ni task 23+.
- Hakuna baseline leo → R0 haina kazi ya ziada (ni `ls` moja tu ndani ya script).
