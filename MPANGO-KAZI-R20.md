# MPANGO KAZI R20: Ukweli wa hesabu · Resume kamili · Afya ya mjadala

Session iliyokaguliwa: **"Mama Lishe Bora Website Project Plan"**
- Appwrite session: `6ab8d3a73ef131b9dc08`
- runner: `u2xkpwbh`
- Muda: 27 Sep, 11:28–12:00 Dar

Vyanzo vya ukaguzi:
- Appwrite: session, board_ledger, agent_memory_events, agent_memory, reports.
- Export uliyonitumia.
- **Providers wenyewe:** XKiro `/v1/usage`, OpenRouter `/api/v1/key`, headers za Groq, na **logs za UnoRouter `/api/log/token`** (kila ombi lina tokens na saa yake).

---

## SEHEMU A: Nilichogundua

### A1. Tokens: kipi kinadanganya, kipi ni sahihi

| Kinachoonyeshwa | Namba | Ukweli kutoka provider | Hukumu |
|---|---|---|---|
| **Badge ya session** | 1.2M (1,237,499) | XKiro ≈975k (sehemu ya 996k ya leo) + **Uno 261,706 (requests 26)** + OR chache = ≈1.24M | ✅ **SAHIHI** |
| **Jumla ya Pulse** | 996.2k | Inakosa Uno (leo: Uno 1 = 378,404 · Uno 2 = 128,532), tokens za OR, na Gemini chat | ❌ **IMEPUNGUA** |
| XKiro 1 / 2 | 498.5k / 497.8k | `/v1/usage`: 498,457 / 497,781 | ✅ sahihi |
| OpenRouter 1 / 2 (requests) | 2/50 · 3/50 | `/api/v1/key`: 2 · 3 | ✅ sahihi |
| OpenRouter tokens | 0 | requests 5 zilifanyika, kwa hiyo tokens > 0 | ❌ inadanganya |
| **Groq 1 / 2** | 0 | Header: `remaining-requests 999/1000` baada ya ombi langu 1, yaani **Groq haikutumika leo** | ✅ sahihi (0 ni kweli) |
| **Uno 1 / 2** | "tayari · 0 req leo" | Logs za Uno: session = requests 15 + 11 · leo = 37 + 15 | ❌ **inadanganya** |
| Gemini 1 / 2 | 0/1.1k | Google haina API ya matumizi, kwa hiyo haiwezi kuhakikiwa | ⚠️ haiaminiki (angalia chanzo hapa chini) |
| Embed | 25 | inarekodiwa moja kwa moja na search.ts | ✅ inaaminika |

**Chanzo, nimekizalisha hapa:** pete za Uno, Groq, Gemini chat, na tokens za OR zinahesabiwa na `usageTap`. Tap hiyo inabadilisha `globalThis.fetch` wakati server inaanza.
- Chini ya **`next start`**: ombi moja la agent lilihesabiwa (uno-1 +1, gemini-1 +1).
- Chini ya **`next dev`**: ombi lilelile lilijibiwa, lakini **hakuna kilichohesabiwa**. Next.js dev inaweka `fetch` yake juu ya yetu, kwa hiyo tap inarukwa.
- Kwenye Pulse yako, kila kitu kinachotegemea tap kilikuwa 0, wakati kila kinachosomwa kwa provider (XKiro, requests za OR) au kurekodiwa moja kwa moja (Embed 25) kilikuwa sahihi. Hiyo ni ishara ya dev mode au tap kutofanya kazi.

**Maana ya namba mbili hizo:**
- Badge ya session inahesabu Board hii TU.
- Pulse inahesabu siku nzima kwa akaunti zote, kwa hiyo Pulse inapaswa kuwa ≥ session.
- Pulse ikiwa ndogo kuliko session, ni ishara ya hesabu iliyopotea.

### A2. Resume: ripoti iliyokatika
- Appwrite status imekwama: **`report_part_1/2 (1-5)`**.
  - Ripoti ina sehemu 1–5 tu.
  - **Kipande 2/2 (6. Kurasa & Menu · 7. Safari ya Mteja · 8. Tech Stack · 9. Hatari · 10. Action Plan) hakipo.**
- Ripoti **haikuhifadhiwa** kwenye collection `reports`.
- **agent_memory = 0 documents.** Self memory ya kila agent na Board memory ya kampuni **hazikuandikwa**, kwa sababu zinaandikwa baada ya ripoti.
- Mfululizo (ushahidi):
  - 12:00:11: kipande 1 kilihifadhiwa.
  - 12:01:24: Uno ilipokea ombi la kipande 2 (prompt 16,896, completion 1,969).
  - Mtandao ulikatika hapo. Ombi likashindwa, na hifadhi zote za Appwrite baada ya hapo zikashindwa pia (hakuna mtandao).
  - Hakuna kilichojaribiwa tena mtandao uliporudi.
  - Uliporudi, UI ilifungua session kama **"Historia (Appwrite)"** (kusoma tu), si kama run inayoweza kuendelezwa.
- Resume iliyopo inashughulikia tu:
  - agenda iliyokatizwa;
  - mini-report ya muda;
  - checkpoints;
  - "finale iliyokatizwa" (lakini huiandika upya YOTE);
  - na ni lazima uanzishe mwenyewe kupitia `/sessions`, kitufe cha Resume.
- Haijui:
  - kipande kipi cha ripoti kinakosekana;
  - ripoti isiyohifadhiwa;
  - memories zisizoandikwa;
  - mini-report iliyoandikwa kwa fallback;
  - hifadhi za Appwrite zilizoshindwa.

### A3. Mjadala: kilichovunjika

| # | Tatizo | Ushahidi | Chanzo |
|---|---|---|---|
| 1 | **Mwanzo wa jibu unakatwa**: `.POSED DECISION`, `.REE:`, `agree.REE:` | Agenda 6 (Vextron, Optimus) na Agenda 10 (Vextron). Zote zilitokea dakika ambazo **Uno nemotron** ilijibu (logs za Uno) | Tunaipa nemotron agizo la kuandika `<think>`, na model hiyo tayari ina reasoning channel yake. Model inataja tag `<think>` kwa maandishi, parser ya UnoRouter inazikata, na mpaka kati ya mawazo na jibu unavunjika. **Nimelizalisha mara 2/2**: jibu likaanza na " tags (under 80 words)…" |
| 2 | **Agenda 6 haikufungwa** ingawa owners wote 3 walisema AGREE | Ledger: `OBJECTED_OPEN`, "chair could not produce a proposal" | (a) Proposal ya Vextron ilikatwa (`.POSED`). (b) Proposal ya Optimus ilikuwa sehemu ya MWISHO ya ujumbe, na regex `(?=\n(?:RATIONALE:|…|$))` inahitaji `\n` kabla ya mwisho. **Nimethibitisha:** regex ya sasa = false, iliyorekebishwa = true. (c) Mwenyekiti alipofunga, aliandika AGREE badala ya proposal, na hakuna fallback ya kuchukua proposal iliyopo |
| 3 | **Memory ina uongo** | Checkpoint ya Vextron A6: "Agenda 6 … **locked**", wakati ledger inasema OPEN | Collector haipewi hali rasmi ya agenda (LOCKED/OPEN) |
| 4 | Tags zinavuja kwenye jibu | `<tool_call>` mwanzoni mwa proposal ya Optimus (A10); `READ_SOURCE: https://…` ilionekana kama jibu la Cybertron (A9) | Hakuna usafishaji wa tags hizi kwenye maandishi yanayoonekana |
| 5 | Mini-report ya Agenda 2 ni fupi (1,068 chars; Uamuzi + Observers tu) | Nyingine zote zina sehemu 6 | Mini-report ilianguka kwenye fallback kimya kimya, na haijaribiwi tena |
| 6 | Checkpoints hazina model wala tokens | Zote 48: `model: "rotation"`, `tokens: null` | Checkpoint inaandika jina la zamani badala ya lane halisi |

**Kilichokwenda sawa (kimehakikiwa):**
- Agenda 1–5 na 7–10 zimefungwa (LOCKED), na kila moja ina mini-report kamili kwenye ledger. A2 ni fupi kama ilivyoelezwa hapo juu.
- Pingamizi pekee: **Ultron, Agenda 4** (jina refu la chakula linajifunga mistari miwili kwenye 320px).
  - **Lilikuwa halali**, na **lilishughulikiwa**: v2, CSS Grid ya Cybertron, na Ultron aliridhika.
- Observers walikuwa SILENT kwenye agenda zote 10, kwa hiyo hakuna pingamizi la observer lililoachwa bila jibu.
- Sehemu ya 4 (Maamuzi) ya ripoti: **kila agenda A1–A10 imo**, na maandishi yanalingana na ledger (A1/A2/A3/A8 zimetafsiriwa tu kwa Kiswahili).
  - A6 imeandikwa UNRESOLVED. Hilo ni sahihi kwa ledger, ingawa sababu ni bug #2.
- Code iliyounganishwa (final.txt, vipande 2) imekamilika, na code block inafungwa ipasavyo.
- Checkpoints za memory zipo kwa kila agenda (5 kwa kila agenda; A6 ina 3 kwa sababu observers hawakuitwa).
- XKiro zote mbili ziliisha karibu 11:40. Broker ilihamia Uno bila kukwama. Hakuna ujumbe wa kikomo/quota uliomfikia mtumiaji.

### A4. Pulse card (maombi yako ya UI)
- Maneno "ya 1.8M tokens (XKiro + Groq) · + OpenRouter, Uno & Gemini" yaondolewe.
- Pete za Uno zinazoandika "tayari" zionyeshe **namba ya requests** ndani ya pete.

---

## SEHEMU B: Mpango wa kazi

### B1. Hesabu za kweli (Pulse)
1. **Tap isiyotegemea `globalThis.fetch`.**
   - Kila client wa broker (lanes) anapewa `fetch` yetu yenye kipimo moja kwa moja. Hivyo hivyo embeddings na probes.
   - Itafanya kazi kwenye `next dev` NA `next start`.
   - Jaribio: ombi lilelile chini ya dev, na pete zipande.
2. **Namba kutoka kwa provider pale inapowezekana (reconcile):**
   - **Uno:** `/api/log/token`, yaani requests + tokens halisi za leo (UTC) kwa kila akaunti. Pete ya Uno itaonyesha requests ndani (si "tayari").
   - **Groq:** `x-ratelimit-remaining-requests` ni requests halisi za siku. Tokens ni za ndani (Groq haitoi TPD kwenye headers).
   - **OpenRouter:** requests kutoka `/api/v1/key` (tayari), na tokens kutoka tap iliyorekebishwa.
   - **XKiro:** `/v1/usage` (tayari sahihi).
   - **Gemini:** hesabu ya ndani tu (Google haina API). Tooltip itasema "hesabu ya ndani", pamoja na ledger isiyopotea.
3. **Kulinganisha:**
   - Session details ionyeshe tokens za Board hii kwa kila provider (lane halisi ya kila call), ili 1.2M ionekane imetoka wapi.
   - Pulse ikiwa < jumla ya session za leo, inaonyesha onyo (si namba ya uongo).
4. **UI:**
   - Ondoa maneno ya "ya 1.8M tokens…".
   - Namba za requests ndani ya pete za Uno.

### B2. Resume kamili ("finishing pass")
1. **Mtandao ukikatika (hatua yoyote):**
   - Makosa ya aina ya network (`fetch failed`, `ENOTFOUND`, `ECONNRESET`, timeout) hayatachoma lanes wala hops.
   - Board inasimama yenyewe na chip "📡 Mtandao umekatika — inasubiri".
   - Inakagua mtandao kila sekunde 10, kisha inaendelea pale pale (zamu ileile, kipande kilekile).
2. **Hifadhi za Appwrite zilizoshindwa** zinaingia kwenye foleni na kujaribiwa tena mtandao ukirudi, ili status isibaki ya zamani.
3. **Ukaguzi wa ukamilifu** (wakati wa Resume, na session isiyo `completed` ikifunguliwa). Kila kisichokamilika kinakamilishwa, kwa mpangilio:
   - agenda iliyokatizwa (A=1, kama ilivyo);
   - mini-report ya muda **au ya fallback** (mf. A2);
   - checkpoints zinazokosekana;
   - code ya mwisho (final.txt) isiyokamilika;
   - **sehemu za ripoti zinazokosekana**: zinaandikwa zile zinazokosa TU (mf. 6–10), kwa kutumia kipande 1 kilichohifadhiwa, si kuandika upya yote;
   - ripoti isiyohifadhiwa kwenye `reports`;
   - **self memory + Board memory** ambazo hazikuandikwa;
   - status ya mwisho `completed`.
4. **UI:** session isiyokamilika ikifunguliwa itaonyesha kitufe cha "Endeleza — kinachokosekana: kipande 2 cha ripoti, memory…". Server ikianza, itatafuta session zilizokatizwa.

### B3. Afya ya mjadala
1. **Agizo la `<think>` litatumwa TU kwa lanes zisizo na reasoning channel** (XKiro qwen).
   - Uno nemotron, OR, Groq, na Gemini hazitapewa agizo hilo.
   - Jaribio: nemotron halisi, jibu lianze na "AGREE:/PROPOSED DECISION:" kamili.
2. **Regex ya proposal:** `$` irekebishwe. Kabla ya kusoma stance, maandishi yasafishwe dhidi ya takataka za mwanzo (`.`, `<tool_call>`, herufi ndogo).
3. **Mwenyekiti akifunga:** kama jibu lake si proposal, achukue proposal ya mwisho iliyo halali kwenye mjadala. Kama owners wote waliikubali, ifungwe (LOCKED), si UNRESOLVED.
4. **Usafishaji wa maandishi yanayoonekana:** `<tool_call>` na mistari ya `READ_SOURCE:` iondolewe (engine bado inaisoma).
5. **Checkpoint za memory:** zipewe hali rasmi ya agenda (LOCKED/OPEN/UNRESOLVED), zisiandike "locked" kwa agenda iliyo wazi. Model na tokens halisi viandikwe (si "rotation").

### B4. Session hii ya Mama Lishe Bora (baada ya marekebisho)
Resume ya kukamilisha: kipande 2 cha ripoti (sehemu 6–10), kuhifadhi ripoti kwenye `reports`, mini-report ya A2, na self memory na Board memory za agents wote.

### B5. Majaribio
- Unit tests:
  - regex ya proposal;
  - usafishaji;
  - uchaguzi wa agizo la think kwa kila lane;
  - ukaguzi wa ukamilifu;
  - foleni ya hifadhi;
  - reconcile ya Uno.
- Mock E2E:
  - kukata mtandao katikati ya agenda;
  - kukata katikati ya kipande 2 cha ripoti;
  - kukata wakati wa kuandika memory.
  - Katika kila hali, resume inakamilisha vilivyokosekana TU.
- Live:
  - `next dev` + `next start`, pete zipande;
  - nemotron bila kukatwa;
  - Pulse ionyeshe namba zilezile za logs za Uno.

---

## SEHEMU C: Maamuzi ya Mkuu
1. **Server inaendeshwa kwa `npm run dev`.** Hiyo inathibitisha chanzo cha A1: tap inarukwa na Next.js dev. B1.1 (fetch yenye kipimo ndani ya kila client) ndiyo marekebisho makuu, na yatajaribiwa chini ya `next dev` kwanza, kisha `next start`.
2. **Agenda 6 inabaki UNRESOLVED.** Resume ya session hii haitaigusa. Itakamilisha kipande 2 cha ripoti, kuhifadhi ripoti, mini-report ya A2, na memories tu. Marekebisho ya B3 yatazuia tatizo hili kwenye Board zijazo.
3. **Resume ni kwa kitufe.** Session isiyokamilika ikifunguliwa, UI itaonyesha kitufe cha "Endeleza", pamoja na orodha ya vinavyokosekana. Hakuna kuendelea kiotomatiki.
