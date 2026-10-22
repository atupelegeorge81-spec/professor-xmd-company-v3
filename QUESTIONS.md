# QUESTIONS — TASK 32 (E2E acceptance) · 2026-10-21 15:05 UTC

## Hali
Runs 8 halisi (E1–E8) kwenye Koyeb. Fixes 1–14 zimepushwa (mwisho `d69a1b8`). Recovery (E2) na Detach (E6) = PASS.
Lakini KILA run imeishia na milestone(s) BLOCKED — kigezo "kila milestone SIGNED_OFF*/CAP_REACHED" hakijawahi kutimia.

## Kosa linalojirudia (sheria: kosa mara 2 → QUESTIONS + simama)
**Plan ya milestone (Optimus) haitekelezeki → BLOCKED kabla Computer haijaanza / kabla ya sign-off:**
- E3: Checks JSON imevunjika → BLOCKED (fix 5)
- E5: amri za lango zinazohitaji Docker/Postgres → PARTIAL → BLOCKED (fix 8)
- E8 M1: plan haina "Styling + Dependencies:" hata baada ya kurekebisha muundo → structure_failed → BLOCKED
- E8 M2: plan haina startCommand → harness haiwezi kuwasha app → sign-off imekataliwa → BLOCKED
Kila fix inaziba tundu moja; LLM ya plan inaleta jingine. BLOCKED haijaribiwi tena kamwe.

## Maswali kwa CEO
1. Plan ikishindwa validator: iandikwe upya na Optimus (maoni ya validator ndani ya prompt) hadi N mara badala ya BLOCKED moja kwa moja? Au code ijaze default salama (mf. `npm run start`, styling kutoka Ledger)?
2. Milestone BLOCKED iruhusiwe kurudiwa (retry 1) badala ya kubaki BLOCKED milele?
3. Niendelee na runs zaidi (kila run ≈ saa 6–8, makumi/mamia ya mamilioni ya tokens), au nimalize T32 kwa ripoti ya ukweli (FAIL ya acceptance + defects + mapendekezo)?

## Majibu ya CEO (2026-10-21 ~18:10 UTC) → yametekelezwa
1. **Ndiyo** — plan iandikwe upya kwa maoni ya validator hadi mara 2 → Fix 16 `5a7ecd0` (PART 1 kwa makosa ya §1–§4; Start Command inadaiwa kwa visual/mixed).
2. **Ndiyo** — milestone BLOCKED irudiwe mara 1 → Fix 17 `87368fc` (re-plan kamili ya R0, `blockedRetries`).
3. **Hakuna runs zaidi (hakuna E9)** — E8 imaliziwe, kisha ripoti ya ukweli `docs/tests/task-32.md` + muhtasari wa CEO.

---

# QUESTIONS — TASK 35 (T32 follow-up, ripoti ya CEO) · 2026-10-22
Ripoti: `docs/REPORT-task32-followup.md`. Hakuna kati ya haya kilichorekebishwa — naomba ruhusa kwanza.

1. **Bug ya metering ya tokens za Computer (pointi 3).** `cu/oh_util.py:160-185` (`extract_usage`) inasoma `resp.metrics.accumulated_token_usage`. Kwenye SDK 1.46 hiyo ni jumla INAYOJILIMBIKIZA kwa kila LLM instance (lane), si wito mmoja. Matokeo: 1.02B iliyoripotiwa ≈ **~129M halisi** (×6–8.9). Pendekezo: tumia tofauti ya accumulated kwa kila lane (au `per_turn_token`), na urekodi `cache_read_tokens`/`reasoning_tokens` (sasa zinatupwa). Je, nirekebishe?
2. **Sandbox ya build haina credentials za Supabase.** `src/lib/cu/engine.ts:447-485` haipitishi `SUPABASE_*`/`XMD_PROJECT_SUPABASE_*`. Checks za `db` zinaendeshwa nje ya sandbox (`dbProbe.ts:34-35`). Block ya uwezo inasema ukweli huu. Je, sandbox ipewe URL + anon key ya project (tables `xmdtest_`) ili tests za ndani ziende kwenye Supabase halisi kupitia HTTPS? (Kuna athari ya usalama: key ingeingia kwenye sandbox.)
3. **Block ya uwezo inavunja uamuzi wa Ledger.** E8 A1 (LOCKED) iliamua `pnpm`, ambayo haipo kwenye sandbox. Plan mpya iliandika `npm` badala yake (`xmdtest/f1/plans/new-E8-M1.md`). Chaguo mbili: (a) uwezo wa sandbox ujulishwe kwa Board wakati wa agenda, au (b) `pnpm` iwekwe kwenye template (`corepack enable`)?
4. **Kasoro iliyokuwepo kabla ya T35:** matatizo ya `assemblePlanDocument` ("sehemu 8 (Agent Rules) haipo", "hatua N < ndogo ya 8") hayaingii kwenye loop ya marekebisho, kwa hiyo plan inakuwa `structure_failed` bila jaribio jingine. Ilitokea kwenye plans 2/5 za "old" na 2/5 za "new". Nirekebishe?
5. **Deploys wakati wa run (pointi 5).** Deploys 4 zilitokea wakati wa runs hai (E6 03:47; E7 05:55, 07:49, 09:57), na 3 zaidi wakati E2 ilikuwa imekwama. Je, niweke kinga, kwa mfano script ya push inayokataa ikiwa kuna session `running` kwenye DB?
