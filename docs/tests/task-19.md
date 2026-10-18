# Task 19 (maelezo19) — Evidence screenshots: ushahidi + maamuzi (2026-10-18)

Branch: `task/19-screenshots`. Sandbox halisi ya E2B (`sbx19`), template ya Uno (playwright global).

## Maamuzi niliyojiuliza na kujibu (CEO alilala)
1. **Playwright hatoki wapi?** Spec ilisema runner wa browser kwenye sandbox. Probe: template ya Uno ina
   `playwright@1.63.0` global + chromium. Hivyo hakuna QUESTIONS.md entry; script ina-load kwa `createRequire(npm root -g)` (ESM import inashindwa global).
2. **Sintaksia ya states:** `name[click sel > hover sel]` — actions zinazounganishwa kwa ` > `; states hugawanywa
   kwa koma NA splitTop (koma ndani ya `[]` hubaki ndani ya selector moja, Playwright inakubali selectors za koma).
   State `default` huepukwa (ni shot ya msingi). Lines mbili za route moja zinajiunga (states).
3. **Mkataba wa mstari wa route:** lazima `states:` na `viewports:` (munana na template); segment ya viewports yenye
   garbage → fallback PLAN_VIEWPORTS (375x667, 768x1024, 1280x800). Unknown action → `problems` (si crash) → manifest/harness error.
4. **Rapid fail ya server:** kabla nilikuwa nangoja 120s hata server ikifa. Sasa waitHttp200 inapiga pia process —
   ikikufa: fail ndani ya ~1s na stderr tail kwenye message (T4b kweli: `echo booting; exit 3` → 1.2s).
5. **`ERR_ABORTED` haikusiki:** requestfailed yenye ERR_ABORTED = browser iliacha prefetch/navigation/context-close
   yenyewe (T3 imeonyesha RSC prefetch za Next) — si kosa la site, imewekewa filter.
6. **data: URL hukataliwa KWANZA** ilhali validateEvidencePack: nilibadili mpangilio wa branches (check ya `data:`
   kabla ya requireUrls) ili ujumbe maalum uonekane hata kwa requireUrls (spec: hakuna base64 kwenye context la LLM).
7. **id za format mbaya hazijiandikishi seen** — duplicate check inachunguza id halali tu (validator imesisimama; test ilirekebishwa).
8. **Full-page PNG:** upana = viewport daima; urefu unaweza kuzidi (T1: 375×685, T3: 1280×1808) — ndiyo ushahidi wa full-page.
   Script inakata 1px zilizo chini ya viewport (device scale 1).
9. **Mode mbili:** `--base https://...` = deployed (hakuna server, commands []); bila = local (`Start Command` ya plan,
   port 4173 kwenye cwd ya workspace). Manifest inaandikwa `finally` — hajawahi kupotea; exit 0/1/2.
10. **Object names ni uuid:** storage unique() hupa uuid; jina la awali linabaki kama metadata tu. Futa/lifikisha kiwa
    kwa uuid (kama snapshots). MS_GIT_EXCLUDE imepanuliwa: `.xmd/tools/` na `.xmd/evidence/M*/R*/` — harness haiingii git ya agent.
11. **Wiring:** reviewMode huenda boardRunner (`m.reviewMode`) → engine; capture tu needsScreenshots (visual/mixed) na
    build isiposhindwa; upload Supabase CU bucket kimi-Mk/R; validate requireUrls; loop inarekodi `evidence:Mk:Rn`
    (capped 120/60/60), bcast `evidence`, chip 📸, blog — yote ndani ya try/catch (haivunji loop).
12. **Test-only:** `__t19.evidenceUploader` kwenye engine (driver wa .mjs wa marudio halisi); schema/load inapakia
    screenshot `url` mpya; line ya template ya visual imeonyesha mfano wa state.

## Majaribio HALISI (dhidi ya sandbox ya kweli + Supabase ya kweli)
- **T1** — fixture `tests/fixtures/site-a/` (2 routes × 3 viewports), start `python3 -m http.server 4173`:
  6 PNG, exit 0, errors 0, consoleErrors 0, upload 6, **11.9s**. Vipimo (`identify`/`file`): upana 375/768/1280 kupatana,
  home 375×685 (full-page), about 375×667 kizuri. commands: exit 0 + `.xmd/evidence/M1/R0/server.log`.
- **T2** — states `menu-open[click #menu-toggle]`, `card-hover[hover .card]`: 6 PNG, exit 0; sha256 ya states ≠ default
  kwenye viewports zote mbili; kuangalia kwa macho: drawer imefunguka (picha iliyonganishwa).
- **T3** — `--base https://professor-xmd-professorcj-2c4d4efe.koyeb.app`, route `/`, viewports 3: 3 shots full-page
  (375×2956, 768×2759, 1280×1808), mode deployed, commands [], validateEvidencePack(requireUrls) OK, exit 0, ~34s.
  Rerun baada ya filter ya ERR_ABORTED: **consoleErrors 0**. Screenshot ya homepage imekaguliwa (hero/dashboard safi).
- **T4** — `/missing`: HTTP 404 → exit 1, `errors=[{kind:http,status:404,detail:"…404"}]`, consoleError inarekodiwa,
  manifest imeandikwa, `/` imepigwa 3 shots bila kufa. **T4b** — server inayokufa mara moja: exit 1 katika 1.2s,
  `kind:server` na stderr tail kwenye detail.
- **T5** — URLs zote 21 (T1+T2+T4+T3+T3r2): **21/21 200 OK**; za T1 pia bytes zinalingana na za sandbox.
  Kisha uploads zote 21 (uuid objects) zilifutwa — storage list API: **0 zimebaki** (public 200 nilichoona baadaye = CDN cache).

## Unit tests + baselines
- `src/lib/milestone/__tests__/evidence.test.ts`: **11** (brackets/commas/splitTop, action isiyojulikana → problem,
  duplicate route merge, "default" drop, Start Command, default viewports fallback, plan tupu, needsScreenshots,
  evidenceKey/dir/config, validate requireUrls/data:/id/duplicate/viewport/kind).
- Baselines: **tsc 0 · vitest 525 + 2 skipped (ilikuwa 514) · pytest 333 · unittest 263 (OK) · eslint 0**
  (cu/xmd-evidence.mjs haipo kwenye lint pattern ya project — ignore ya makusudi, script ya sandbox).

## Noti
- Flag ya mazingira: pipeline nzima iko nyuma ya `XMD_MILESTONES` (OFF by default) — legacy haitegemei kazi hizi.
- Tester `(~1min)` ya drives: `node xmdtest/t19.mjs <sb> <label> <fixture-> <plan> [--base URL]`.
