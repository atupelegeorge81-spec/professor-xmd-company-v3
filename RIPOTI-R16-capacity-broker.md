# Ripoti R16 — Capacity Broker (ubongo mpya wa kugawa uwezo)

## 1. Kilichobadilika kwa ufupi
- **Ubongo wa zamani wa "swap" umeondolewa kabisa.** Uliokuwa ukibadilisha stage baada ya kosa kutokea. Mahali pake kuna **Capacity Broker** (`src/lib/broker/*`) inayoamua **KABLA** ya kila ombi ni lane gani ina nafasi. Hakuna logic mbili zinazofanya kazi moja.
  - Faili zilizofutwa: `modelArbiter.ts`, `thProbe.ts`, `keySlot` kwenye `agents.ts`, na `meterClient` (haikutumika).
- **TokenHarbor imeondolewa kwenye logic yote** kwa sababu allowance yake inareset kwa wiki. Key yake imebaki `.env.local` ikiwa imeandikwa "haitumiki tena".
- **Keys 4 mpya ziko ndani ya `.env.local`:** OpenRouter 1/2 na UnoRouter 1/2, pamoja na models zao. Nimeondoa pia mstari uliokuwa umejirudia wa `XTROUTER_BASE_URL` (ulikuwa na thamani ileile).

## 2. Lanes (akaunti 8 · lanes 12)
| Provider | Akaunti | Model | Kikomo halisi |
|---|---|---|---|
| XKiro | 1, 2 | qwen3.8-max:free | tokens 500K/siku kwa akaunti |
| Groq | 1, 2 | qwen3.8-27b + gpt-oss-120b | 8K TPM, 200K/siku kwa model (400K kwa akaunti) |
| OpenRouter | 1, 2 | nemotron-3-ultra:free | requests 50/siku kwa akaunti (100 jumla) |
| UnoRouter | 1, 2 | space-bunny-alpha + nemotron-ultra | ombi 1/dakika kwa kila model |

Zote zinareset kila siku saa **03:00 usiku (saa za Dar)**. Uno haina kikomo cha siku kilichotangazwa.

## 3. Jinsi broker anavyoamua
Kila ombi hupewa **darasa** (class):

| Darasa | Kazi | Mpangilio |
|---|---|---|
| **HEAVY** | ripoti, code | Uno → OpenRouter → XKiro |
| **NORMAL** | zamu za mjadala, majibu ya chat | XKiro → Uno → OpenRouter → Groq (Groq ikiwa tu TPM inatosha) |
| **LIGHT** | title, understanding, maamuzi madogo | Groq → XKiro → Uno (OpenRouter kamwe) |
| **BACKGROUND** | memory, checkpoints | Groq → Uno → XKiro (OpenRouter kamwe) |

- **OpenRouter ni "adimu".** Kwa kazi nzito, broker husubiri hadi sekunde 8 slot ya Uno ifunguke kabla ya kutumia ombi la OpenRouter. Wakati anasubiri, UI inaonyesha shimmer ya **"anasubiri nafasi…"** na thinking inaendelea.
- **Groq inapewa kazi tu ikiwa prompt + jibu vinatosha ndani ya 8K TPM.** Ndiyo sababu kosa la Groq 413/TPM halitokei tena. Hiki ndicho kilikuwa chanzo cha Groq kuonyesha 0 / 0%.
- **Akaunti iliyoisha huwekwa kando moja kwa moja:**
  - XKiro 429 ya quota → mpaka reset.
  - OpenRouter 50/50 → mpaka 03:00.
  - Uno 429 → sekunde za `retry-after`.
  - Lane inayoanguka mara 3 → mapumziko mafupi.
- **Kosa likitokea katikati ya stream**, jibu linaendelea kwenye lane nyingine bila kuanza upya.
- **Mtumiaji haoni kamwe** ujumbe wa quota au TPM. Unaandikwa kwenye log ya server tu.

**Marekebisho baada ya majaribio (tofauti na mpango v2):** Mpango v2 ulikuwa unaanza BACKGROUND na Uno. Majaribio yalionyesha memory checkpoints zilikuwa zinamaliza slots 4 za Uno kwa dakika, na ripoti ikalazimika kwenda OpenRouter. Sasa background inaanza na Groq, na Uno inabaki kwa ripoti/code. Pia nimelainisha alama za headroom ili NORMAL ibaki XKiro mpaka iishe kweli, badala ya kuhamia Uno mapema.

## 4. UI
- **Pulse (Overview):** kadi mbili (Decisions, Sources) zimerudi saizi ndogo ya kawaida. **Today's tokens** sasa iko chini yake: kubwa, upana mzima, na pete 8.
  - Kila pete inaonyesha tokens za leo na % ya kikomo cha provider huyo.
  - OpenRouter: % inahesabiwa kwa requests (x/50 kwa akaunti), lakini tokens zake bado zinaonyeshwa.
  - Uno: haina kikomo cha siku, kwa hiyo pete inaonyesha hali halisi ya slot, **tayari / inapoa**, badala ya % ya kubuni.
  - Groq sasa inaonyesha % sahihi.
- **Sidebar:** bar ya "Today's usage" ina sehemu 8 (akaunti zote), pamoja na "x% ya uwezo wa leo · 8/8 hai".
- **Chat ya agent:** shimmer ya Hourglass "anasubiri nafasi…" inaonekana wakati broker anasubiri lane.

## 5. Majaribio yaliyofanyika
- **Unit tests:** usage 37/37 ✅, broker 41/41 ✅. tsc 0 errors ✅. Build safi ✅.
- **Mock e2e** (providers wa kuigwa wenye tabia halisi: Groq TPM/413, Uno 1/dak, OpenRouter 50/siku, XKiro quota):
  - Chat: Groq (light) + XKiro (jibu), makosa 0.
  - Board kamili: ripoti + summary vimekamilika, makosa 0 kwa mtumiaji.
  - Board kamili ikiwa **XKiro 1 imeisha quota**: 429 moja tu ilitokea, kisha akaunti ikawekwa kando. Zamu zote zikaenda XKiro 2, na kazi nzito zikaenda Uno ×4 + OpenRouter ×1. UI safi.
- **Live** (keys halisi):
  - Groq 1/2, OpenRouter 1/2 na Uno 1/2 zote zinajibu HTTP 200.
  - **XKiro 1 na 2 zimeisha quota ya leo** (503K/500K na 505K/500K; zitareset 03:00). Chat halisi ilipita hata hivyo:
    - Broker aliona XKiro imeisha na kupeleka understanding kwa Groq na jibu kwa Uno.
    - Uno 1 ilipotoa 429 (nilikuwa nimeitumia sekunde chache kabla kwenye jaribio), broker alihamisha kimya kimya.
    - Jibu lilifika baada ya sekunde 12, makosa 0 kwenye UI.

## 6. Ushauri
- **XKiro ndiyo chanzo kikubwa cha tokens** (1M/siku). Ikiisha, Board nzima inabebwa na Uno (4/dak), OpenRouter (100/siku) na Groq (kwa kazi ndogo). Kazi itaendelea, lakini polepole zaidi, na kwa kusubiri kidogo kunakoonekana kama "anasubiri nafasi…".
- **space-bunny-alpha ni model ya "stealth"** kwenye UnoRouter na inaweza kuondolewa bila taarifa. Ikitoweka, broker ataiona kama `model_not_found` na kuiweka kando; nemotron-ultra ya Uno itaendelea.
- **Kuendesha:** `npm install`, kisha `npm run build && npm start`. Faili la `.env.local` liko ndani ya zip.

---

# R16.1 — Detach / Resume + provider aliyekwama

## 1. Detach sasa inasimamisha KABISA
- **Kabla:** Detach ilikata stream ya kivinjari tu, na engine iliendelea background.
- **Sasa:** Detach (`POST /api/boardroom/pause`) inafanya yafuatayo:
  - Inakata zamu inayoendelea **papo hapo**.
  - Inasimamisha engine. Hakuna agent, search wala memory inayoendelea.
  - Inahifadhi session kwenye Appwrite kama `paused`.
- **Imethibitishwa:** stream ilifungwa sekunde 0.16 baada ya Detach, na hakukuwa na simu **0** kwa providers katika sekunde 12 za kusimama.
- **Refresh au kufungua ukurasa mwingine:** mjadala uliosimamishwa **haujiunganishi wenyewe**. Board Room inaonyesha banner ya "Mjadala umesimamishwa · Resume".
- **Ukiwa umesimamisha,** unaweza kuanzisha session mpya. Mjadala uliosimamishwa unabaki ukisubiri Resume.

## 2. Resume inaendelea PALE PALE
- **Hali yote ya mjadala inabaki hai kwenye server** wakati imesimamishwa: zamu, mapendekezo, agrees, transcript na observers.
- **Resume inaendelea kwenye zamu ileile.** Kama agent alikatizwa katikati ya jibu, maandishi yaliyokwisha onekana yanabaki na jibu linaendelea kutoka hapo (log inaonyesha `🔌 Vextron → … · inaendelea`).
- **Majaribio:**
  - Detach katikati ya zamu (Agenda 2), kisha Resume kwa session id: zamu ileile iliendelea, kisha Agenda 3. Hakuna agenda iliyorudiwa, na Ledger ina entry 1 kwa kila agenda.
  - Detach wakati Optimus anaunda agenda, kisha Resume kwa runner id: iliendelea pale pale, kisha Agenda 1→3 mara moja kila moja.
- **Kwenye UI**, historia inachorwa papo hapo bila animation, kisha live inaendelea. Zamani ilionekana kama "imerudi agenda 1".

## 3. Chanzo cha tatizo la zamani ("nilikuwa agenda 7 ikarudi 1")
1. **Resume kutoka Sessions** ilituma *session id*, lakini engine ilitafuta runner kwa *runner id*. Haikumpata, kwa hiyo iliunda **runner wa pili** kutoka Appwrite, wakati wa kwanza bado anaendelea. Loops mbili zilikuwa zikiendesha agenda sambamba kwenye Ledger ileile. **Sasa:** runner anatafutwa kwa id yoyote kati ya hizo mbili, na hakuna runner wa pili kamwe.
2. **Stop ya zamani haikusimamisha engine.** Resume iliunganisha tena na kucheza buffer yote kwa animation tangu agenda 1. **Sasa:** kuna Detach ya kweli, pamoja na tukio la `sync`.
3. **Ledger ikishindwa kusomeka** (Appwrite/mtandao), orodha ilirudi tupu kimya kimya na mjadala ukaanza agenda 1. **Sasa:** progress inahifadhiwa pia ndani ya session (`done`). Vyote viwili vikishindwa, Resume inasimama na kukuambia ujaribu tena, badala ya kuanza upya.
- **Server ikianzishwa upya (restart) ukiwa umesimamisha:** Resume bado inafanya kazi kutoka Appwrite. Agenda zilizofungwa zinarukwa, na agenda iliyokatizwa inaanza mwanzo wake.

## 4. Provider aliyekwama (ile "Optimus anaunda agenda" ya dakika 4)
- **Tatizo:** wito ulisubiri hadi dakika 10 (timeout ya SDK) bila dalili yoyote kwenye UI.
- **Sasa:** kila wito wa LLM (Board, chat, agenda, mini-report, memory) una saa mbili:
  - Data ya kwanza lazima ifike ndani ya **90s**.
  - Pengo kati ya vipande lisizidi **60s**.
  - Ikizidi, lane inapumzika 60s na broker anahamisha kazi kwenda lane nyingine kimya kimya.
- **Imethibitishwa kwenye mock:** `XKiro 1 · agenda · busy 60s → reroute · stalled`, na Board ilikamilika bila kosa.
- **Pia imerekebishwa:** openai SDK ilikuwa ikimeza "abort" na kukubali jibu nusu kama kamili. Pia Stop ya chat ilikuwa ikihesabiwa kama kosa la kuzungusha lane.

## 5. Kadi ya tokens
- **Maandishi madogo ya maelezo chini ya kadi yameondolewa.**
- **"tayari"** kwenye pete ya Uno maana yake slot ya ombi 1/dakika iko wazi sasa hivi. Ikitumika, inaonyesha **"inapoa"** hadi dakika ipite.

**Majaribio:** unit 37/37 + 48/48 ✅ · tsc 0 ✅ · build ✅ · e2e pause/resume ×2 ✅ · stall ✅ · UI (Detach → refresh → Resume) ✅.
