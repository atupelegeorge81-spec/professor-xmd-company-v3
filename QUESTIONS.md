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
