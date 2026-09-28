Optimus na Board — hii ni kazi mpya kutoka kwa Mkuu.

KANUNI YA AGENDA: Unda agenda 5 TU kwa kazi hii — si 4, si 6. Tumia mada 5 zilizoorodheshwa hapa chini kwa mpangilio huo. Jadilini kila agenda hadi ifungwe (LOCKED). Kama agenda haiwezi kufungwa, iacheni OPEN na andikeni sababu HALISI iliyotokea kwenye mjadala. Baada ya agenda zote 5 kuisha, andika ripoti ya mwisho kwa Kiswahili.

MRADI: Tovuti ya "Saluni Nuru" — saluni ya urembo, Sinza, Dar es Salaam.
Lengo: tovuti nyepesi, mobile-first, inayofunguka haraka kwenye 3G, bila backend. Mteja aone huduma, bei, saa na mahali, kisha aweke miadi kupitia WhatsApp.

DATA RASMI (TUMIA HII HASA — USIBUNI, USIBADILISHE):
- Jina: Saluni Nuru
- Anwani: Mtaa wa Shekilango, Sinza Mori, Jengo la Nuru Plaza, Ghorofa ya 1, Dar es Salaam
- Saa za kazi:
  - Jumatatu – Ijumaa: 08:00 – 20:00
  - Jumamosi: 08:00 – 22:00
  - Jumapili: 10:00 – 18:00
- Simu / WhatsApp: namba halisi bado haijatolewa. Tumia placeholder `2557XXXXXXXX` kwenye `src/data/config.json`. Msibuni namba nyingine yoyote.
- Barua pepe: haijatolewa. Msiweke barua pepe yoyote.
- Huduma na bei (TZS):
  | Huduma | Bei |
  |---|---|
  | Kusuka rasta ndogo | 35,000 |
  | Kusuka twists | 25,000 |
  | Kuosha na kukausha nywele | 8,000 |
  | Kunyoa (wanaume) | 5,000 |
  | Manicure | 10,000 |
  | Pedicure | 12,000 |
  | Kupaka hina | 15,000 |
  | Make-up ya harusi | 80,000 |
- Maelezo ya huduma: HAYAJATOLEWA. Onyesheni jina na bei tu. Msiandike maelezo ya kubuni.
- Picha: hakuna picha halisi. Hakuna picha za stock.

MASHARTI:
- Page weight chini ya 60KB (gzipped) kwa ukurasa wa kwanza.
- Zero JavaScript isipokuwa kama kuna sababu isiyoepukika, ambayo lazima ijadiliwe na ikubaliwe.
- Kiswahili ndiyo lugha kuu ya tovuti.
- Kuweka miadi ni kupitia WhatsApp tu (`wa.me`). Hakuna fomu, hakuna database.

AGENDA 5 (tumieni hizi, kwa mpangilio huu):
1. Teknolojia ya frontend, mpango wa scaffold (mobile-first, bila backend), na design tokens (rangi, fonts) za Saluni Nuru.
2. Layout ya pamoja (header, footer, container) na ukurasa wa Huduma na Bei — data kwenye `src/data/services.json` kwa bei ZILE ZILE zilizotolewa hapo juu.
3. Sehemu ya Saa na Mahali (anwani na saa ZILE ZILE, link ya ramani bila iframe) na kitufe cha WhatsApp (template ya Kiswahili, namba kutoka `config.json` — placeholder).
4. Ukurasa wa "Kuhusu Sisi" (maandishi mafupi, bila kubuni historia au majina) pamoja na Performance na SEO (meta tags, sitemap, bajeti ya ukubwa, compression).
5. Testing na CI (Playwright kwenye viewports za simu, size guard), ripoti ya mwisho na makabidhiano, pamoja na script kamili ya mwisho.

SHERIA ZA MJADALA:
- Ukitoa pendekezo, anza jibu lako na `PROPOSED DECISION:`. Ukikubali pendekezo la mwenzako, anza na `AGREE:`.
- Data zote (anwani, saa, bei, namba) zitoke kwenye DATA RASMI hapo juu, neno kwa neno.
- Kama kitu hakikujadiliwa, kiandikwe "haikujadiliwa", si kubuniwa.
- Kwenye script ya mwisho, kila kipande kiseme kilitoka agenda ipi, na kiwe sahihi. Kitu kilichoongezwa bila kujadiliwa kiwekwe alama `NYONGEZA (haikujadiliwa)`.
