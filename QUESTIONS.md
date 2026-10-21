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
