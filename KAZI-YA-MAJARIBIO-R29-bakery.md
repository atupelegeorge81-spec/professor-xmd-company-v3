Optimus na Board — hii ni kazi mpya kutoka kwa Mkuu.

KANUNI YA AGENDA: Unda agenda 5 TU kwa kazi hii — si 4, si 6. Tumia mada 5 zilizoorodheshwa hapa chini kwa mpangilio huo. Jadilini kila agenda hadi ifungwe (LOCKED). Kama agenda haiwezi kufungwa, iacheni OPEN na andikeni sababu HALISI iliyotokea kwenye mjadala. Baada ya agenda zote 5 kuisha, andika ripoti ya mwisho kwa Kiswahili.

MRADI: Tovuti ya "Mkate Bora Bakery" — duka la mikate na keki, katikati ya jiji la Arusha.
Lengo: tovuti nyepesi, mobile-first, inayofunguka haraka kwenye 3G, bila backend. Mteja aone menyu na bei, saa na mahali, kisha atume oda kupitia WhatsApp (ujumbe ukiwa tayari na jina la bidhaa aliyoichagua) na aje kuichukua dukani.

DATA RASMI (TUMIA HII HASA — USIBUNI, USIBADILISHE):
- Jina: Mkate Bora Bakery
- Anwani: Mtaa wa Sokoine, Jengo la Kilimanjaro Plaza (ghorofa ya chini), Karibu na Benki ya NMB, Arusha
- Saa za kazi:
  - Jumanne – Jumamosi: 06:00 – 19:00
  - Jumapili: 07:00 – 13:00
- Jumatatu: IMEFUNGWA (duka halifunguliwi). Msiweke saa zozote za Jumatatu.
- Simu / WhatsApp: namba halisi bado haijatolewa. Tumia placeholder `2556XXXXXXXX` kwenye `src/data/config.json`. Msibuni namba nyingine yoyote.
- Barua pepe: oda@mkatebora.co.tz (hii tu — msiweke barua pepe nyingine yoyote).
- Menyu na bei (TZS) — data iwe kwenye `src/data/menu.json`:
  | Bidhaa | Bei |
  |---|---|
  | Mkate wa kawaida (gramu 400) | 2,500 |
  | Mkate wa ngano nzima (gramu 400) | 3,500 |
  | Maandazi (vipande 5) | 1,500 |
  | Chapati (vipande 3) | 1,800 |
  | Kalimati (vipande 10) | 2,000 |
  | Keki ya vanila (kilo 1) | 35,000 |
  | Keki ya chokoleti (kilo 1) | 40,000 |
  | Keki ya harusi (kilo 3) | 150,000 |
- Oda za keki: sentensi hii lazima ionekane karibu na keki na kwenye ujumbe wa oda ya keki, neno kwa neno: "Oda za keki zifanywe angalau saa 48 kabla."
- Kuchukua oda: mteja huchukua oda yake dukani. Malipo ni taslimu au M-Pesa wakati wa kuchukua. Hakuna malipo ya mtandaoni.
- Maelezo ya bidhaa: HAYAJATOLEWA. Onyesheni jina na bei tu. Msiandike maelezo ya kubuni (ladha, viungo, "fresh kila siku" n.k.).
- Huduma ya kusafirisha (delivery), punguzo, au ofa: HAZIJATOLEWA. Msiandike yoyote.
- Historia ya biashara, mwaka wa kuanzishwa, na majina ya wafanyakazi: HAYAJATOLEWA. Msibuni.
- Picha: hakuna picha halisi. Hakuna picha za stock.

MASHARTI:
- Page weight chini ya 50KB (gzipped) kwa ukurasa wa kwanza.
- Zero JavaScript isipokuwa kama kuna sababu isiyoepukika, ambayo lazima ijadiliwe na ikubaliwe.
- Kiswahili ndiyo lugha kuu ya tovuti.
- Oda ni kupitia WhatsApp tu (`wa.me`). Hakuna fomu, hakuna database, hakuna kikapu (cart), hakuna mfumo wa kulipia mtandaoni.

AGENDA 5 (tumieni hizi, kwa mpangilio huu):
1. Teknolojia ya frontend, mpango wa scaffold (mobile-first, bila backend), na design tokens (rangi, fonts) za Mkate Bora Bakery — kila rangi ya maandishi lazima ipite WCAG AA dhidi ya rangi ya nyuma inayotumika.
2. Ukurasa wa Menyu — data kwenye `src/data/menu.json` kwa bei ZILE ZILE zilizotolewa hapo juu, layout ya pamoja (header, footer), na mpangilio wa mikate/vitafunio na keki.
3. Oda kupitia WhatsApp: kitufe kwa KILA bidhaa (ujumbe wa Kiswahili wenye jina la bidhaa; kwa keki ujumbe uwe na sentensi ya saa 48 neno kwa neno), namba kutoka `config.json` (placeholder), maelezo ya kuchukua dukani na malipo, pamoja na sehemu ya Saa na Mahali (anwani, saa ZILE ZILE, Jumatatu imefungwa, barua pepe rasmi, link ya ramani bila iframe).
4. Ukurasa wa "Kuhusu Sisi" (tumieni DATA RASMI tu — historia haijatolewa, kwa hiyo msiibuni) pamoja na Performance na SEO (meta tags, sitemap, bajeti ya ukubwa, compression).
5. Testing na CI (Playwright kwenye viewports za simu, ukaguzi wa data dhidi ya DATA RASMI, size guard), ripoti ya mwisho na makabidhiano, pamoja na script kamili ya mwisho.

SHERIA ZA MJADALA:
- Ukitoa pendekezo, anza jibu lako na `PROPOSED DECISION:`. Ukikubali pendekezo la mwenzako, anza na `AGREE:`. Ukiona kasoro, sema wazi `DISAGREE:` pamoja na sababu — kukubali bila kukagua si kazi.
- Data zote (anwani, saa, bei, namba, barua pepe) zitoke kwenye DATA RASMI hapo juu, neno kwa neno.
- Kama kitu hakikujadiliwa, kiandikwe "haikujadiliwa", si kubuniwa.
- Kwenye script ya mwisho, kila kipande kiseme kilitoka agenda ipi, na kiwe sahihi. Kitu kilichoongezwa bila kujadiliwa kiwekwe alama `NYONGEZA (haikujadiliwa)`.
