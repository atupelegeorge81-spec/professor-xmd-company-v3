# RIPOTI R19: Gemini akaunti ya pili (project 2)

## 1. Uhakiki kabla ya kuongeza
| Jaribio | Matokeo |
|---|---|
| Key A (AIza…) na Key B (`GEMINI_API_KEY_1`): burst ya 3.1-flash-lite | A ilipata 15 OK kisha 429. B nayo ikapata **429 papo hapo** ×5, na retry ileile ya 49s. Kinyume chake pia: B ilipata 17 OK, kisha A ikapata 429. |
| quotaId ya 429 | `GenerateRequestsPerMinutePerProjectPerModel-FreeTier = 15`: kikomo ni cha **PROJECT**, si cha key |
| Key C (project mpya) dhidi ya P1 | P1 ilipata 22 OK kisha 429, wakati C ilipata **5/5 × 200**. Kinyume chake: P2 ilipata 16 OK kisha 429, wakati P1 ilipata 5/5 × 200 |
| embedContent (001 na embedding-2, 768 dims) | 200 kwenye P1 na P2 |

**Hitimisho:** key ya project ileile haiongezi uwezo wowote. Key ya project nyingine ni ndoo mpya kamili, ndiyo sababu C iliongezwa kama `GEMINI_API_KEY_2`.

## 2. Uwezo mpya (free tier, kwa siku)
| | Project 1 | + Project 2 | Jumla |
|---|---|---|---|
| Flash (6 models × 20) | 120 | 120 | **240** |
| Lite (2 models × 500) | 1,000 | 1,000 | **2,000** |
| Embeddings (2 models × 1,000) | 2,000 | 2,000 | **4,000** |

Reset ni 10:00 Dar (saa 6 usiku Pacific). RPM pia ni ya kila project, kwa hiyo broker ina lanes mara mbili.

## 3. Mabadiliko
- `usage/accounts.ts`: akaunti mpya `gemini-2` ("Gemini 2", teal `#2dd4bf`), `GemAccountId`, `GEM_ACCOUNTS`. Jumla sasa ni akaunti 10.
- `server/usageKeys.ts`: `gemini-2 ← GEMINI_API_KEY_2`. Tap inatambua key 2 na kuhesabu kwenye akaunti yake.
- `server/usageLedger.ts`: `gem` (gemini-1, jina la R18, kwa hiyo data ya zamani inabaki) na `gem2` (gemini-2). `gemState/gemModel/noteGemResult/noteGemError` zinapokea akaunti.
- `server/usageTap.ts`: majibu na makosa ya Gemini chat yanaandikwa kwenye ledger ya akaunti iliyotumika.
- `broker/policy.ts`:
  - `flashRemaining()` inajumlisha Flash zilizobaki kwenye akaunti zote zilizosanidiwa (FLASH_RESERVE = 4 bado ni jumla).
  - Admission inasoma ledger ya akaunti ya lane (P1 ikiisha, lane ya P2 ya model ileile inakubaliwa).
- `broker/lanes.ts`: haikubadilishwa. Lanes zinaundwa kiotomatiki kwa kila akaunti iliyo na key (`gemini-2:<model>`).
- `search.ts` `getEmbedding`: mpangilio ni **001·k1, 001·k2, embedding-2·k1, embedding-2·k2**.
  - Model ileile kwenye project nyingine ina vector space ileile (`<model>@768`), kwa hiyo cache ya Appwrite inaendelea kulinganishwa bila kuchanganya spaces.
  - (model, akaunti) iliyokwisha au inayopumzika inarukwa bila kutuma ombi.
- `server/usageSnapshot.ts`:
  - `geminiView(id)` inashughulikia kila akaunti.
  - `embedView` inajumlisha akaunti zote (kikomo 4,000), na kila model ina lebo "key 1/2".
- **Pulse** (`TokenAccounts.tsx`): safu 4, yaani XKiro 1/2 · Groq 1/2 / OR 1/2 · Uno 1/2 / **Gemini 1 · Gemini 2** · Embed. Sidebar inajirekebisha yenyewe (vipande 10).
- Env: `GEMINI_API_KEY_2` iko kwenye `.env.local`, na placeholder kwenye `.env.example`.

## 4. Majaribio
- `tsc` safi · `next build` imepita.
- Unit tests: usage 37 · broker 48 · broker-gemini 20 · r18 43 · **r19 24 (mpya)**, jumla **172/172**.
  - r19 inajaribu migration ya `gem` ya R18, lanes 2×, ledger zilizotengana, 429 ya siku P1 wakati P2 iko hai, admission, `flashRemaining`, snapshot, na embeddings fallback kwa mpangilio sahihi.
- **Live** (keys halisi):
  - Lite za P1 ziliwekwa "zimekwisha", na broker ikaenda `gemini-2:gemini-3.5-flash-lite` ikajibu "sawa". Ledger `gem2` ina requests 1.
  - Embedding 001 ya P1 iliwekwa "imekwisha", na ombi likaenda `gemini-embedding-001` kwenye **key 2**: 768 dims, 222ms, space `gemini-embedding-001@768`.
- UI: screenshots za desktop na simu. Pete ya Gemini 2 inaonekana, na `/api/usage/accounts` inarudisha Gemini 1 na 2 (1,120/siku kila moja) pamoja na Embeddings 4,000.

## 5. Kumbuka
- Majaribio ya leo yametumia sehemu ndogo ya quota: P1 3.1-flash-lite ≈70, P2 ≈25, 3.5-lite chache. Zitarudi 10:00 Dar.
- Key A (AIza…) haikuongezwa kwa sababu ni project ileile na P1.
- Keys zilibandikwa kwenye chat, kwa hiyo inashauriwa kuzizungusha (rotate) kwenye AI Studio na kuweka mpya kwenye `.env.local`.
