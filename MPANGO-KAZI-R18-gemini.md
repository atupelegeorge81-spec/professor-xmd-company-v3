# MPANGO KAZI v2 — Gemini: Embeddings + Lanes za Broker (R18)

> Hali: **IMETEKELEZWA NA KUHAKIKIWA (27 Sep 2026).** Namba zilizothibitishwa ziko §7. Mahesabu ya mwisho ya §7.3 yanachukua nafasi ya makadirio ya awali ya §2.2–2.3.
> Maamuzi ya Mkuu: **hakuna brain mpya** · UnoRouter na HuggingFace **zinaondolewa kwenye embeddings** · tunatumia **Gemini API key** mpya.
> Vipimo vyote hapa ni HALISI: vilifanywa kwa key yako tarehe 27 Sep 2026.

---

## 1. Vipimo vya key

### 1.1 Key yenyewe
- ✅ HTTP 200, models 61. Inapita pia kupitia **openai SDK** (broker yetu): streaming (kipande cha kwanza 698ms), usage kamili, na embeddings.
- **Quota ni kwa kila PROJECT na kwa kila MODEL.** Hati rasmi inasema "per project, not per API key", na majina ya quota ni `…PerProjectPerModel`.
  - ➡️ Kila model ina hesabu yake tofauti.
  - ➡️ Key ya pili kutoka project ileile haiongezi chochote. Project/akaunti ya pili ya Google ingeongeza mara mbili.
- **RPD inajirudia saa 6 usiku Pacific = saa 10:00 asubuhi Dar** (saa 11:00 kuanzia 1 Nov, PST).
- Google haichapishi tena jedwali la free tier. Namba halisi ziko ndani ya jibu la 429 (`QuotaFailure.quotaValue`), na broker itazisoma kutoka hapo.

### 1.2 Embeddings: jaribio la ubora (jozi 8 za maswali ya cache, Kiswahili + Kiingereza, maandishi 16 katika ombi 1 la batch)
| Model | Muda | Dims | Zinazofanana (min) | Zisizohusiana (max) | Pengo | Input |
|---|---|---|---|---|---|---|
| **gemini-embedding-001 @768** | **413ms** | 768 | **0.924** | 0.827 | **+0.097** | 2K tokens |
| gemini-embedding-001 @3072 | 550ms | 3072 | 0.926 | 0.839 | +0.087 | 2K |
| gemini-embedding-2 @768 | 840ms | 768 | 0.830 | 0.758 | +0.072 | 8K |
| gemini-embedding-2 @3072 | 869ms | 3072 | 0.829 | 0.746 | +0.083 | 8K |

Zote mbili zilitenganisha jozi zote 8 bila kosa. **Chaguo: `gemini-embedding-001` @768** ndiyo msingi, kwa sababu:
- ni ya haraka mara 2 (iko kwenye njia ya kila search);
- ina pengo kubwa zaidi (threshold ≈ 0.88);
- vector ya 768 ni takriban herufi 7K tu kwenye Appwrite.

`gemini-embedding-2` @768 ni **akiba** (quota yake ni tofauti; threshold ≈ 0.80).

### 1.3 Chat models: ombi 1 kwa kila model
| Model | Matokeo | Muda | Quota ya bure (RPD / RPM)* |
|---|---|---|---|
| gemini-3.5-flash-lite | ✅ | **0.8s** (bila thinking) | **500 / ~15** |
| gemini-3.1-flash-lite | ⏳ 503 (imejaa kwa muda) | — | 500 |
| gemini-3-flash-preview | ✅ | 2.0s | 20 / 5 |
| gemini-3.5-flash | ✅ | 3.1s | 20 / 5 |
| gemini-3.6-flash | ✅ | 3.7s | 20 / 5 |
| gemini-3.7-flash · 3.8-flash | ⏳ 503 (imejaa kwa muda) | — | 20 / 5 kila moja |
| gemini-2.5-flash | ✅ | 4.5s | 20 / 5 |
| gemma-4-31b-it | ✅ lakini **49s** | — | haifai (polepole) |
| gemini-2.5-pro · 2.5-flash-lite | ❌ 404 "haipatikani kwa watumiaji wapya" | — | — |
| gemini-3.1-pro-preview | ❌ 429, quota ya bure = 0 (ya kulipia tu) | — | — |

\* Namba zimetoka kwenye kipimo huru cha Sept 2026 (dev.to / scriptbyai). Broker itazihakiki kutoka `quotaValue` ya 429 ya kwanza.

**Muhtasari wa uwezo wa kila siku (project 1):**
- Embeddings: **1,000 + 1,000**.
- Flash lite: **500 + 500**.
- Flash zenye nguvu: **~6 × 20 = ~120** (1M context, output 65K, thinking).

---

## 2. Mahesabu

### 2.1 Embeddings (kutoka log yako)
- **Leo:** embeddings 2 kwa kila search → Board ya agenda 10 ≈ **45**. Kilele ni **6 ndani ya sekunde 60**.
- **Baada ya uboreshaji 3.3** (kuhifadhi kwa vector ya swali ileile): Board ≈ **23**, kilele **3/dak**.
- **Uwezo wa 001:** 100 RPM, ambayo ni mara 16–33 ya kilele. **Hakuna haja ya kuzungusha ndani ya dakika.**
- **Uwezo wa siku:** 1,000 RPD → **Boards 22–43 kwa siku** (+ akiba ya embedding-2: 1,000 zaidi).
- ✅ Kama ulivyosema, hatuwezi kumaliza 1,000 kwa siku kwa matumizi ya kawaida.

### 2.2 Gemini Flash (20/siku kila model): ziende wapi?
Mahali ambapo muda unapotea zaidi (log yako):
- Kuunganisha script ya mwisho: **dakika 5** kwenye Uno.
- Ripoti kipande 1: **dakika 11**.

Flash inajibu kwa sekunde 2–4, ina output ya 65K, na 1M context.

| Kazi (kwa kila Board) | Idadi | Sasa (lane · muda) | Gemini Flash |
|---|---|---|---|
| Kuunganisha script ya mwisho | 1 | Uno · 5 min | ✅ |
| Ripoti (vipande 2) | 2 | Uno · 11 + 1 min | ✅ |
| Mini-reports (1 kila agenda) | 10 | ~50s kila moja | ✅ |
| Review ya script ya Optimus | 10–20 | mbalimbali | ✅ tu kama quota iko juu ya 50% |

- **Assembly + ripoti + mini-reports = 13 kwa Board** → 120/13 ≈ **Boards 9 kwa siku**.
- Ukiongeza na reviews ≈ 25 → **Boards 4–5 kwa siku**, kisha zinarudi Uno/OR kimya kimya.
- **RPM 5 kwa kila model:** kazi hizi zinafuatana (ripoti moja baada ya nyingine, mini-report takriban kila dakika 5), kwa hiyo 5 RPM × models 6 = 30 RPM inatosha kwa urahisi.

### 2.3 Gemini Flash-Lite (500/siku kila moja): ziende wapi?
Kazi za LIGHT / BACKGROUND:

| Kazi | Idadi kwa Board |
|---|---|
| Memory checkpoints | ≈ 30 |
| Observers (prompts za herufi 38–43K; Groq haziwezi kutokana na TPM ya 8K) | ≈ 30 |
| Reflection + consolidation | ≈ 11 |
| Title, scope na nyinginezo | ≈ 3 |
| **Jumla** | **≈ 70–75** |

- 1,000/siku → **Boards 13–14 kwa siku**.
- Hii inaondoa pia shida ya Groq ya 413 (TPM 8K) kwenye kazi hizi. Groq inabaki kama lane ya pili.

---

## 3. Marekebisho ya cache ya search (`src/lib/search.ts`, hakuna file jipya)
1. **Search isome documents sahihi:** mpya kwanza (`orderDesc`), **bado hai** (chujio la `created_at > sasa − TTL` upande wa Appwrite), na **space ileile** (`gemini-001@768`) tu.
2. **TTL: dakika 15 → siku 7** (env `SEARCH_CACHE_TTL_DAYS`).
3. **Kuhifadhi kwa vector ya swali** iliyotengenezwa wakati wa kukagua cache. Hakuna embedding ya pili, kwa hiyo maombi ni nusu.
4. **Threshold kwa kila model:** 001 ≈ 0.88, embedding-2 ≈ 0.80 (kutoka jaribio 1.2). Inaweza kurekebishwa kwa env.
5. **`getEmbedding` → Gemini:**
   - 001 @768 (msingi) → embedding-2 @768 (akiba, space yake).
   - 429 → inasoma `RetryInfo.retryDelay` na `quotaId`: ya dakika = pumzika sekunde X; ya siku = imeisha hadi 10:00 Dar.
   - 503 → jaribu akiba.
   - Zote zikishindwa → search inaenda moja kwa moja SearXNG. Hakuna kosa linalomfikia mtumiaji.
6. **HF na Uno zinaondolewa kabisa kwenye embeddings:** code ya HF inafutwa, na `HUGGINGFACE_API_KEY` haitumiki tena.
7. **Log za kweli:** "🧠 Vextron → Embedding: Gemini · embedding-001 (413ms)".
8. **Appwrite `search_cache`:** kuongeza `space` (string 100) + `dims` (int). **Kufuta documents 532 za zamani** (vectors za HF 1024 haziwezi kulinganishwa na za Gemini, na zote zimekwisha muda). *(Inasubiri ruhusa yako.)*
9. **Hesabu ya matumizi:** kila embedding inaandikwa kwenye usage ledger (siku inaanza 10:00 Dar), ili Pulse ionyeshe "Embeddings 23/1000 leo".

## 4. Gemini kwenye Capacity Broker iliyopo (hakuna brain mpya)
Broker ina lanes 12 sasa. Tunaongeza **account ya 9: Gemini 1**, yenye lanes zifuatazo:

- **`gemini-flash`:** mzunguko wa ndani kwa ubora: 3.8 → 3.7 → 3.6 → 3.5 → 3-preview → 2.5. Kila model ina 20 RPD / 5 RPM zake. Model ikiisha au ikiwa 503, inaruka kwenda inayofuata.
- **`gemini-lite`:** 3.5-flash-lite → 3.1-flash-lite (500 RPD kila moja).

**Njia mpya za kazi (routing):**
- **HEAVY-REPORT** (assembly, ripoti, mini-reports): **Gemini Flash** → Uno → OR → XKiro.
- **HEAVY** (reviews): Uno → OR → Gemini Flash (ikiwa na nafasi juu ya 50%) → XKiro.
- **NORMAL** (zamu za mjadala): XKiro → Uno → OR → Gemini Lite → Groq. *Haibadiliki, isipokuwa Lite inaongezwa.*
- **LIGHT / BACKGROUND** (checkpoints, observers, memory, title): **Gemini Lite** → Groq → XKiro → Uno.

**Sheria za lane:**
- **Kikomo cha siku:** kinasomwa kutoka ledger na 429 `quotaValue`. Siku inaanza 10:00 Dar (si 03:00 kama XKiro/OR).
- **429 ya dakika** → pumzika `retryDelay`.
- **429 ya siku** → exhausted hadi 10:00 Dar.
- **503** → busy kwa sekunde 30, kisha reroute.
- Makosa haya hayamfikii mtumiaji (sheria ya R16).

**Pulse / kadi ya tokens:**
- Pete mpya **"Gemini"**: % kwa requests (kama OpenRouter), yenye mistari "Flash 13/120 · Lite 71/1000 · Embed 23/1000".
- Tokens bado zinahesabiwa.
- Sidebar inajumuisha Gemini kwenye jumla.

**`.env.local`:** `GEMINI_API_KEY_1=…` (hapo tu, kama sheria ya keys inavyotaka).

**Tahadhari (sheria za Google):** kwenye free tier, maandishi yanaweza kutumiwa na Google kuboresha huduma zao. Kwa mradi wa wazi kama Mama Lishe hili si tatizo.

---

## 5. Mpango wa R17-fix (maamuzi: A=1, B=ndiyo, C=1): ✅ YOTE YAMEFANYWA (6 iliondolewa kwa agizo lako)
1. **Session:** kubana data kabla ya kuhifadhi (404K → 156K) + onyo ikishindwa. `items` 500K → 2M.
2. **Ripoti:** kubana data + `reports.content` 100K → 1M.
3. **Resume baada ya server kuanza upya:** skrini ipakie historia yote + title; jina la download liwe sahihi.
4. **A=1:** maneno ya agenda iliyokatizwa na restart yanaondolewa; agenda inaanza upya safi.
5. **Kuandika memory:** 404 inatambuliwa kwa code + fields zinazotakiwa zinajazwa (chat pia).
6. ~~"The user…"~~, imeondolewa.
7. **Kadi ya LOCKED:** sharti lenyewe tu.
8. **Agenda iliyofungwa bila mini-report kabla ya restart** → ikamilishwe kwanza.
9. **C=1:**
   - Kila agent anaandika self memory yake mwenyewe.
   - Optimus anaandika Board memory **moja** ya kampuni, ambayo wote wanaisoma.

## 6. Mpangilio wa kazi (baada ya ruhusa)
1. R17-fix (1–9) → unit tests → tsc → build.
2. Cache + embeddings za Gemini → unit tests (mock za 429 per-minute / per-day, 503) → jaribio la moja kwa moja (embeddings 5).
3. Lanes za Gemini kwenye broker + Pulse → broker tests → e2e ya Board kwenye mock → smoke ya moja kwa moja (ombi 1 kwa kila lane).
4. Ripoti ya R18 + zip moja.

---

## 7. Matokeo yaliyohakikiwa (baada ya utekelezaji)

### 7.1 Vipimo halisi kwa key yako (live, 27 Sep 2026)
| Kipimo | Matokeo |
|---|---|
| Embedding `gemini-embedding-001` · 768 dims | ✅ 282–543 ms |
| Swali jipya → Appwrite `search_cache` | ✅ KAKOSA → search → **SAVE SUCCESS** (vector + `space`/`dims`) |
| Swali linalofanana (maneno yamepangwa upya) | ✅ **KAPATA · similarity 98.8%** (threshold 88%) → hakuna search mpya · 0.9 s badala ya 4.0 s |
| Gemini chat kupitia broker (`gemini-3.5-flash-lite`) | ✅ "GEMINI OK" · 577–843 ms |
| Ledger: embeddings vs chat | ✅ zinahesabiwa **kando kando** (embed 3 · chat 1 · tokens 11) |
| `writeMemory` halisi (create + update, sehemu 6 required) | ✅ (doc ya majaribio `zzsmoke` ilifutwa) |

### 7.2 Vikomo vinavyotumika kwenye code (Pacific day = reset 10:00 Dar)
| Model | RPM | RPD | Kazi |
|---|---|---|---|
| gemini-embedding-001 | 100 | 1,000 | embeddings (ya kwanza) |
| gemini-embedding-2 | 100 | 1,000 | embeddings (akiba) |
| Flash × 6 (3.8, 3.7, 3.6, 3.5, 3-preview, 2.5) | 5 kila moja | 20 kila moja = **120** | HEAVY tu; 4 za mwisho (`FLASH_RESERVE`) ni za script/ripoti |
| Flash-Lite × 2 (3.5, 3.1) | 15 kila moja | 500 kila moja = **1,000** | LIGHT/BACKGROUND kwanza, NORMAL ya dharura |
| **Jumla Gemini chat** | | **1,120/siku** | |

Google ikirudisha 429, code inasoma `quotaValue` halisi (per-day → mpaka 10:00 Dar; per-minute → `retryDelay`). Hakuna gemma.

### 7.3 Mahesabu ya mwisho ya siku (Board ya agenda 10)
- Board 1 ≈ **185** wito wa LLM + **≈23** embeddings.
- Flash ≈ **39** kwa Board → 120/39 ≈ **Boards 3** kwa siku, kisha HEAVY inarudi Uno → OR → XKiro kimya kimya.
- Flash-Lite ≈ **115** kwa Board → 1,000/115 ≈ **Boards 7–8** kwa siku.
- Uwezo wote wa chat (Gemini 1,120 + XKiro + Groq + OR + Uno) ≈ **1,580 requests/siku** ≈ **Boards 8**.
- Embeddings: 23 kwa Board → 2,000/23 ≈ **Boards 85**, kwa hiyo haziwezi kuwa kikwazo.

### 7.4 Majaribio
- Unit: usage 37 · broker 48 · broker-gemini 20 · r18 43 = **148/148**.
- E2E (mock): Detach → server restart → Resume, njia A (katikati ya agenda) na njia B (baada ya LOCK) → **YOTE SAWA**.
- UI (Playwright): baada ya restart na refresh historia ni kamili · download `Mobile-Money-Landing-Page.md` (si `board-room.md`) · kadi ya LOCKED haina "Condition added by" · Pulse ina Gemini + Embed.
- `tsc` safi · `next build` safi.
