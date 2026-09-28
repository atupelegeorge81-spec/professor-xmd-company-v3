Optimus na Board — hii ni kazi mpya kutoka kwa Mkuu.

KANUNI YA AGENDA: Unda agenda 5 TU kwa kazi hii — si 4, si 6. Tumia mada 5 zilizoorodheshwa hapa chini kwa mpangilio huo. Jadilini kila agenda hadi ifungwe (LOCKED). Kama agenda haiwezi kufungwa, iacheni OPEN na andikeni sababu HALISI iliyotokea kwenye mjadala. Baada ya agenda zote 5 kuisha, andika ripoti ya mwisho kwa Kiswahili.

MRADI: Tovuti ya "Gereji Imara" — gereji ya kutengeneza magari, Nyakato, Mwanza.
Lengo: tovuti nyepesi, mobile-first, inayofunguka haraka kwenye 3G, bila backend. Mteja aone huduma, bei, saa na mahali, kisha aombe nafasi ya kupeleka gari kupitia WhatsApp (ujumbe ukiwa tayari na jina la huduma aliyoichagua).

DATA RASMI (TUMIA HII HASA — USIBUNI, USIBADILISHE):
- Jina: Gereji Imara
- Anwani: Barabara ya Musoma, Nyakato Sokoni, Karibu na Kituo cha Mafuta cha Lake Oil, Mwanza
- Saa za kazi:
  - Jumatatu – Ijumaa: 07:30 – 18:00
  - Jumamosi: 08:00 – 16:00
- Jumapili: IMEFUNGWA (hakuna huduma). Msiweke saa zozote za Jumapili.
- Simu / WhatsApp: namba halisi bado haijatolewa. Tumia placeholder `2557XXXXXXXX` kwenye `src/data/config.json`. Msibuni namba nyingine yoyote.
- Barua pepe: haijatolewa. Msiweke barua pepe yoyote.
- Huduma na bei (TZS):
  | Huduma | Bei |
  |---|---|
  | Kubadilisha oili na filta | 45,000 |
  | Ukaguzi wa gari (diagnosis ya kompyuta) | 30,000 |
  | Kubadilisha brake pads (tairi mbili) | 60,000 |
  | Wheel alignment | 25,000 |
  | Kuosha injini | 15,000 |
  | Kuchaji betri | 10,000 |
  | Kurekebisha AC ya gari | 80,000 |
- Bei hizi ni za UFUNDI tu (vipuri havijajumuishwa) — sentensi hii lazima ionekane karibu na orodha ya bei, neno kwa neno: "Bei ni za ufundi tu; vipuri vinalipiwa tofauti."
- Maelezo ya huduma: HAYAJATOLEWA. Onyesheni jina na bei tu. Msiandike maelezo ya kubuni.
- Dhamana (warranty), punguzo, au ofa: HAZIJATOLEWA. Msiandike yoyote.
- Picha: hakuna picha halisi. Hakuna picha za stock.

MASHARTI:
- Page weight chini ya 50KB (gzipped) kwa ukurasa wa kwanza.
- Zero JavaScript isipokuwa kama kuna sababu isiyoepukika, ambayo lazima ijadiliwe na ikubaliwe.
- Kiswahili ndiyo lugha kuu ya tovuti.
- Kuomba nafasi ni kupitia WhatsApp tu (`wa.me`). Hakuna fomu, hakuna database, hakuna mfumo wa kulipia mtandaoni.

AGENDA 5 (tumieni hizi, kwa mpangilio huu):
1. Teknolojia ya frontend, mpango wa scaffold (mobile-first, bila backend), na design tokens (rangi, fonts) za Gereji Imara — kila rangi ya maandishi lazima ipite WCAG AA.
2. Layout ya pamoja (header, footer, container) na ukurasa wa Huduma na Bei — data kwenye `src/data/services.json` kwa bei ZILE ZILE zilizotolewa hapo juu, pamoja na sentensi ya vipuri neno kwa neno.
3. Kitufe cha WhatsApp kwa KILA huduma (ujumbe wa Kiswahili wenye jina la huduma, namba kutoka `config.json` — placeholder) pamoja na sehemu ya Saa na Mahali (anwani na saa ZILE ZILE, Jumapili imefungwa, link ya ramani bila iframe).
4. Ukurasa wa "Maswali Yanayoulizwa Mara kwa Mara" (majibu yatoke kwenye DATA RASMI tu — kama jibu halipo kwenye data, swali lisiwekwe) pamoja na Performance na SEO (meta tags, sitemap, bajeti ya ukubwa, compression).
5. Testing na CI (Playwright kwenye viewports za simu, ukaguzi wa data dhidi ya DATA RASMI, size guard), ripoti ya mwisho na makabidhiano, pamoja na script kamili ya mwisho.

SHERIA ZA MJADALA:
- Ukitoa pendekezo, anza jibu lako na `PROPOSED DECISION:`. Ukikubali pendekezo la mwenzako, anza na `AGREE:`. Ukiona kasoro, sema wazi `DISAGREE:` pamoja na sababu — kukubali bila kukagua si kazi.
- Data zote (anwani, saa, bei, namba) zitoke kwenye DATA RASMI hapo juu, neno kwa neno.
- Kama kitu hakikujadiliwa, kiandikwe "haikujadiliwa", si kubuniwa.
- Kwenye script ya mwisho, kila kipande kiseme kilitoka agenda ipi, na kiwe sahihi. Kitu kilichoongezwa bila kujadiliwa kiwekwe alama `NYONGEZA (haikujadiliwa)`.
