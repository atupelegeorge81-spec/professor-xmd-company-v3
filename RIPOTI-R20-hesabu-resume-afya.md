# RIPOTI R20: Hesabu za kweli · Endeleza kamili · Afya ya mjadala

**Tarehe:** 27 Septemba 2026
**Hali:** ✅ Imekamilika na imejaribiwa (unit tests 230/230, `next build`, E2E ya mock, ukaguzi wa UI kwa simu).

---

## 1. Swali lako: nani anadanganya, Pulse au Session?

| Kipimo | Namba | Hukumu |
|---|---|---|
| Session details | **1.2M** (1,237,499) | ✅ **Sahihi.** XKiro ≈975k + Uno 261,706 + OR kidogo |
| Pulse | **996.2k** | ❌ **Ilikuwa pungufu.** Haikuhesabu Uno, OR wala Gemini chat |

**Chanzo:** chini ya `npm run dev`, Next.js inaweka `fetch` yake juu ya ile yetu. Kwa hiyo kipimo cha Pulse kilirukwa kwa kila ombi lililopita kwenye SDK ya OpenAI. Ndiyo sababu pete ya Uno ilionyesha "tayari / 0 req" wakati Uno ilikuwa imetumia tokens 261k.

### Nilichorekebisha
- **`meteredFetch`:** kila client wa broker sasa anapewa kipimo moja kwa moja, bila kutegemea `globalThis.fetch`. Inafanya kazi kwenye `next dev` NA `next start`.
- **Kuhesabu mara mbili (hitilafu nyingine niliyoigundua wakati wa majaribio):**
  - Chini ya `next start`, Next inabundle module ya kipimo mara mbili (instrumentation + routes). Kwa hiyo kila ombi la Gemini lilihesabiwa mara 2 (98 badala ya 49).
  - Sasa kuna kipimo kimoja kwa process nzima.
  - Test mpya inathibitisha: bila fix inaonyesha 2, na fix inaonyesha 1.
- **Uno:** requests na tokens halisi zinasomwa kutoka logs za UnoRouter (`/api/log/token`) kwa kila akaunti.
- **Groq:** requests zinasomwa kutoka headers za Groq zenyewe (`x-ratelimit-remaining-requests`).
- **Session details** sasa inaonyesha tokens za Board kwa kila provider, ili uone 1.2M imetoka wapi.

### Uthibitisho (mock, kila ombi limehesabiwa na mock yenyewe)
| Provider | Pulse (ledger) | Maombi halisi | Mode |
|---|---|---|---|
| Gemini chat | 49 | 49 | `next dev` ✅ |
| Gemini chat | 49 | 49 | `next start` ✅ |
| Embeddings | 7 | 7 | ✅ |
| UnoRouter | 4 | 4 | ✅ |
| OpenRouter | 4 | 4 | ✅ |

Requests za session (63) = maombi yote ya mock (63) ✅.

---

## 2. Pulse card (maombi yako ya UI)
- ✅ Maneno "ya 1.8M tokens (XKiro + Groq) · + OpenRouter, Uno & Gemini" **yameondolewa**.
- ✅ **Pete za Uno** sasa zinaonyesha **idadi ya requests** katikati (mf. "2 req") pale palipokuwa na "tayari".
  - Chini ya pete kuna tokens na "req leo".
  - Ikiwa akaunti inapoa au imekwisha, inaongeza "· inapoa" au "· imekwisha".

---

## 3. Endeleza (resume) inayokamilisha KILA kilichobaki

### Mtandao ukikatika (hatua yoyote)
- Kosa la mtandao halichomi lanes wala keys.
- Board inasimama na chip **"📡 Mtandao umekatika — Board inasubiri mtandao urudi (hakuna kinachopotea)…"**.
- Inakagua mtandao kila sekunde 10. Mtandao ukirudi, inaonyesha **"📶 Mtandao umerudi"** na inaendelea pale pale (zamu ileile, kipande kilekile).
- Hifadhi za Appwrite zilizoshindwa zinajaribiwa tena mtandao ukirudi.
- Usomaji na uandishi wa checkpoints za memory pia husubiri mtandao. Hazichukuliwi kama "hazipo".

### Session iliyokatika
- **Sessions:** kila session isiyokamilika inaonyesha kwa njano kinachokosekana, mf. *"· haijakamilika: Ripoti: sehemu 6–10, Kuhifadhi ripoti (Reports), Memory ya agents"*.
- **Ukiifungua:** juu ya sehemu ya kuandika kuna bar ya **"Haijakamilika: … [▶ Endeleza]"**. Hakuna kuendelea kiotomatiki, kama ulivyoagiza.
- **Endeleza inakamilisha vinavyokosekana TU:**
  1. mini-report fupi za fallback (mf. A2) zinaandikwa upya;
  2. script ya mwisho, kama haikukamilika;
  3. **sehemu za ripoti zinazokosekana tu** (mf. 6–10). Kipande 1 kilichohifadhiwa hakiandikwi upya;
  4. kuhifadhi ripoti kwenye Reports;
  5. self memory za agents + Board memory ya kampuni, kama hazikuandikwa;
  6. status `completed` inawekwa **tu** baada ya ripoti kuhifadhiwa NA memory kukamilika.
- **Kikikwama tena**, status inakuwa `finale_incomplete`. Bar inabaki, na kubonyeza Endeleza tena kunaendelea kilichobaki tu.

### Session ya Mama Lishe Bora
Nilijaribu Endeleza kwenye nakala ya session yako HALISI (items, ledger, checkpoints 48) ndani ya mock:
- Script (31,321 chars) na Kipande 1 (sehemu 1–5) **vimerukwa**, havikurudiwa.
- Mini-report ya **A2** imeandikwa upya.
- **Agenda 6 haikuguswa.** Bado ni `OBJECTED_OPEN` na imeandikwa UNRESOLVED kwenye ripoti.
- Sehemu 6–10 zimeandikwa. Ripoti ina sehemu 1–10, kila moja mara moja, na imehifadhiwa.
- Memory za agents 5 + ya kampuni zimeandikwa.
- Status: `completed`.

➡️ **Unachofanya:** fungua session ya *Mama Lishe Bora Website Project Plan* (kwenye Sessions au Board) kisha bonyeza **▶ Endeleza**. Itakamilisha sehemu 6–10, kuhifadhi ripoti, na kuandika memory kwa kutumia providers halisi.

---

## 4. Afya ya mjadala (ukaguzi wa conversation)
| Tatizo lililoonekana | Marekebisho |
|---|---|
| Agizo la `<think>` lilivunja jibu la nemotron / OR / Groq (zina reasoning yao) | Agizo linatumwa kwa **XKiro na Gemini tu** |
| `<tool_call>` ilionekana kwenye A10 | Inaondolewa kwenye zamu za agents **na za observers** |
| `READ_SOURCE:` ilionekana kama jibu (A9) | Inaonyeshwa kama "📖 Anasoma chanzo: …" |
| Pendekezo lenye takataka mwanzoni (`. PROPOSED…`) halikusomwa | Parser imerekebishwa |
| Mwenyekiti akijibu bila pendekezo, agenda ikawa UNRESOLVED | Anachukua pendekezo halali la mwisho; kama owners wote walikubali, agenda inafungwa |
| Checkpoints ziliandika "locked" kwa agenda iliyo wazi | Zinapewa hali rasmi ya agenda + model na tokens halisi |

**Objections:** pingamizi pekee lilikuwa la Ultron kwenye A4. Lilikuwa halali na lilishughulikiwa ipasavyo.

---

## 5. Majaribio yaliyofanyika
- **Unit tests:** 230/230 zimepita. usage 37, broker 48, broker-gemini 20, r18 43, r19 24, **r20 58 (mpya)**.
- **`tsc` + `next build`:** ✅
- **E2E (mock yenye swichi ya kukata mtandao):**
  - Mtandao umekatika katikati ya **agenda 2** kwa sekunde 8 → inasubiri → inaendelea → `completed` ✅
  - Mtandao umekatika wakati wa **kipande 2 cha ripoti** → inasubiri → kipande kinaandikwa → ripoti 10/10 ✅
  - Mtandao umekatika wakati wa **memory** → inasubiri → memory 5 + kampuni ✅
  - **Endeleza** kwenye session ya Mama Lishe (njia ya Appwrite baada ya restart + njia ya runner hai) ✅
  - **Board mpya ya kawaida:** `completed`, hakuna "haijakamilika" ya uongo ✅
- **UI (simu, 390px):** lebo ya Sessions, bar ya Endeleza (inatoweka baada ya kukamilika), Pulse bila maneno ya zamani, pete za Uno zenye requests ✅

---

## 6. Ambacho SIKUFANYA (kwa makusudi)
- **Onyo la "Pulse < jumla ya session za leo"** (lilikuwa kwenye mpango).
  - Kila provider anaanza siku upya kwa saa tofauti: Gemini saa 10:00 Dar, OR/Uno saa 03:00 Dar. Kwa hiyo onyo hilo lingetoa kengele za uongo.
  - Badala yake nimerekebisha chanzo, na namba sasa zinalingana kwa kila provider (jedwali la sehemu 1).
- **Tokens za Gemini:** Google haina API ya matumizi, kwa hiyo hizi ni hesabu yetu ya ndani. Sasa ni sahihi, bila kupotea na bila kuhesabu mara mbili.

## 7. Ushauri
- **Badilisha (rotate) Gemini API keys** zote mbili kwenye AI Studio, kisha weka mpya kwenye `.env.local`. Zimeonekana kwenye mazungumzo haya.
- Baada ya kusasisha code: `npm run dev`, fungua Mama Lishe, kisha **▶ Endeleza**.
