# RIPOTI R18: Resume baada ya restart · Memory mpya · Gemini (embeddings + lanes)

**Tarehe:** 27 Sep 2026 · **Hali:** imekamilika na kuhakikiwa (mock + live + UI)
**Mpango wenye namba zote:** `MPANGO-KAZI-R18-gemini.md` (§7 = matokeo yaliyohakikiwa)

---

## 1. Matatizo 3 uliyoripoti: chanzo na marekebisho

| Tatizo | Chanzo halisi | Marekebisho |
|---|---|---|
| Ripoti ya Board iliyoendelezwa ilishuka kama **`board-room.md`** | Server ilipoanza upya, runner mpya alijengwa kutoka Appwrite akiwa na **buffer tupu**. Historia (pamoja na title) ilichezwa tu kwenye ukurasa uliobonyeza Resume. Refresh, tab nyingine au auto-attach zilipokea matukio mapya tu, kwa hiyo hakukuwa na title na download ilikosa agenda za mwanzo. | Server sasa inajaza buffer na **historia YOTE**: title, chips, ujumbe na usage (`src/lib/board/rehydrate.ts`). Kila attach inapata mjadala kamili, na download inaitwa kwa title (mf. `Mobile-Money-Landing-Page.md`). |
| Baada ya **refresh**, ukurasa ulirudi kwenye hali ya zamani | Ni chanzo kilekile. Pia **kuhifadhi kwenye Appwrite kulishindwa kimya kimya**, kwa sababu session ilikuwa na herufi 404K wakati kikomo cha `items` kilikuwa 500K pamoja na JSON. | Items **zinabanwa** (gzip, `gz1:`) kabla ya kuhifadhiwa: 404K → takriban 38%. Nimepandisha vikomo: `items` 2M, `content` 1M. |
| Maudhui ya resume **hayakuhifadhiwa** Appwrite | Kosa la kuhifadhi lilimezwa na `catch`. | Sasa kuna **onyo linaloonekana** kwenye Board ("⚠️ Mazungumzo hayakuhifadhiwa Appwrite (sababu) — yatajaribiwa tena hatua ijayo"), na tangazo inapopona. Ripoti ikishindwa kuhifadhiwa, chip inaonyesha sababu na kukuambia uipakue hapo hapo. |

## 2. Vipengele vya R17-fix (maamuzi yako A=1, B, C=1)

1. ✅ **Session inabanwa** + onyo inaposhindwa (`src/lib/server/packed.ts`, `reports.ts`). Documents za zamani zisizobanwa bado zinasomeka.
2. ✅ **Ripoti inabanwa** vilevile.
3. ✅ **Resume inapakia historia yote + title** kwa kila attach. Client haichezi historia mara ya pili tena, kwa hiyo hakuna marudio.
4. ✅ **A=1:** agenda iliyokatizwa na restart inafutiwa maneno yake ya zamani, kwenye skrini na kwenye Appwrite, kisha inaanza upya safi. Chip yake: **"♻️ Agenda N imeanza upya"**. Finale (script/ripoti) ikikatizwa, nayo inaandikwa upya.
5. ✅ **`writeMemory`:** 404 inatambuliwa kwa `code`/`type`. Ujumbe wa Appwrite ni "…could not be found", na regex ya zamani haikuukamata, ndiyo sababu memory haikuwahi kuundwa. Wakati wa create, sehemu zote **6 zinazohitajika** zinajazwa. Nimehakiki kwenye Appwrite yako halisi.
6. ~~"The user wants me…"~~: **haikuguswa**, kama ulivyoagiza.
7. ✅ **Kadi ya LOCKED** inaonyesha **sharti lenyewe tu**, bila "[Condition added by X]". Vivyo hivyo kwenye orodha ya Ledger ya pembeni na kwenye download ("- Sharti: …"). Mini-report inabaki na muundo wake: CONDITIONS = nani, sharti gani.
8. ✅ **Agenda iliyofungwa (LOCKED) ambayo mini-report yake ya mwisho haikuandikwa kabla ya restart:** Optimus anaikamilisha **kwanza** kutoka mjadala uliohifadhiwa, kisha anaendelea. Agenda yenyewe hairudiwi.
9. ✅ **Memory mpya (C=1):**
   - Baada ya collector, **kila agent (pamoja na Optimus) anaunganisha SELF memory yake mwenyewe** kwa wito wake binafsi.
   - **Optimus peke yake** anaandika **memory MOJA ya Board ya kampuni**: doc `company` ndani ya `agent_memory`, iliyojengwa kutoka BOARD notes za wote.
   - **Agents wote wanaisoma** kupitia `recall.ts`: SELF ni yake mwenyewe, BOARD ni ya kampuni.
   - Chat haijabadilika.
10. ✅ **Vikomo vya Appwrite** nimevipandisha mwenyewe (B): `boardroom_sessions.items` 2M, `reports.content` 1M.

## 3. Gemini

**Embeddings**
- Gemini tu: **`gemini-embedding-001`** kwanza (768 dims, threshold 88%), **`gemini-embedding-2`** kama akiba (80%).
- UnoRouter na HuggingFace **zimeondolewa kabisa** kwenye embeddings. Hakuna brain mpya; mantiki ya search/cache iliyopo ndiyo inaendelea.
- Kila search inatumia **embedding moja**: vector ya ukaguzi inatumika tena wakati wa kuhifadhi. Embedding ikishindikana, hakuna jaribio la pili, ili quota isitumike bure.

**Lanes za chat (hakuna gemma)**
- **Flash × 6** (20/siku kila moja) ni za **HEAVY** tu: mini-report, code, script, ripoti. Requests 4 za mwisho zinabaki kwa script na ripoti.
- **Flash-Lite × 2** (500/siku kila moja) ni za **LIGHT/BACKGROUND**: observers, memory na title.
- Reset ni **10:00 saa za Dar** (usiku wa manane Pacific). Kwenye 429, kikomo halisi kinasomwa kutoka jibu la Google.

**Pulse**
- Pete ya **Gemini** inaonyesha requests kwa jumla ya models zake: 1,120/siku.
- Pete ya **Embed** iko **peke yake**: 2,000/siku.

**Uwezo wa siku (mahesabu ya mwisho)**

| | Kwa Board | Boards kwa siku |
|---|---|---|
| Flash | ≈ 39 | ≈ 3 (kisha Uno/OR/XKiro kimya kimya) |
| Flash-Lite | ≈ 115 | ≈ 7–8 |
| Embeddings | ≈ 23 | ≈ 85 |
| Jumla ya chat ya providers wote | ≈ 185 | ≈ 1,580 req/siku ≈ **Boards 8** |

## 4. Uthibitisho

**Live, kwa key yako**
- Embedding ilichukua 282–543 ms.
- Swali jipya lilipata **SAVE SUCCESS**.
- Swali linalofanana lilipata **KAPATA 98.8%**, kwa sekunde 0.9 badala ya 4.0.
- `gemini-3.5-flash-lite` ilijibu "GEMINI OK" kwa 577 ms.
- Ledger inahesabu chat na embeddings kando kando.

**Unit:** jumla **148/148**: usage 37 · broker 48 · broker-gemini 20 · r18 43.

**E2E (mock):** Detach, server inauawa na kuanzishwa upya, kisha Resume:
- **Njia A (katikati ya agenda 2):** maneno ya zamani ya agenda 2 yameondolewa, chip "Agenda 2 imeanza upya" imeonekana, na agenda 1 haikurudiwa.
- **Njia B (baada ya LOCK):** mini-report imekamilishwa na agenda 2 haikurudiwa.
- Kwa njia zote mbili: title iko kwenye historia, attach ya pili inapata historia kamili, session imebanwa na kuhifadhiwa, na ripoti imehifadhiwa. **YOTE SAWA.**

**UI (Playwright)**
- Baada ya restart na refresh, historia ni kamili.
- Download ina jina sahihi.
- "Condition added by" haionekani.
- Pulse inaonekana vizuri kwenye desktop na mobile.

`tsc` na `next build` ni safi.

## 5. Unachohitaji kufanya
- Hakuna kazi ya Appwrite: vikomo, `search_cache` (`space`/`dims` + index) vimeshafanywa.
- `GEMINI_API_KEY_1` iko ndani ya `.env.local`, ambayo imo kwenye zip.
- `npm install`, `npm run build`, kisha anzisha upya server.
- Board ya kwanza itaunda doc `company` ndani ya `agent_memory` yenyewe.
