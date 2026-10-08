# R37 — MPANGO WA KAZI: ITIFAKI YA KUFUNGA (unresolved inafutwa kabisa)

**Tarehe:** 08-10-2026 · **Hali:** PLAN TU — hakuna code imebadilishwa. Subiri neno "ANZA".

**Lengo moja:** Katika mradi huu, hali ya "OPEN / UNRESOLVED / hakuna consensus ya kutosha" **haizalishwi tena kabisa**. Kila agenda inafungwa na uamuzi — consensus, rough consensus (dissent inarekodiwa), fallback, au defer ya ndani. Agents wa coding/computer-use hawatapata tena shimo la kubuni.

---

## 1. UAMUZI UMESHAWEKWA (uliouweka wewe mwenyewe kwenye majadiliano yetu)

| # | Uamuzi |
|---|---|
| U1 | Agents wafanye kazi zao wenyewe — **hakuna kuuliza Mkuu maswali**. Wasipopata data, wana-craft toleo lao na ASSUMPTION wazi, kazi inaendelea kwenye computer |
| U2 | Fallback ya mwenyekiti = **chaguo (a): toleo la chini, salama, linalowezekana** kutoka yaliyojadiliwa tu (si kuvumbua) |
| U3 | Kura ya mwisho inakuwa **binding**; DISAGREE haizuii kufunga — inajibiwa kwanza, kisha inarekodiwa kama dissent |
| U4 | Research: **searches 12 kwa agenda (owner mmoja) · dirisha la evidence 16 · deep-read 5 · matokeo 12 kwa query** (SearXNG yenyewe haina limit; vizuizi vyote ni vya code yetu) |
| U5 | Vitu vya sasa visivyoguswa: DATA RASMI, Export kamili, UI ya R36 (hooks background, speed halisi), mlinzi wa wizi halisi |

---

## 2. SEHEMU A — Mlinzi asimue makubaliano halisi ( Roots za A3 yako)

### A1. Bug ya "enterprise" (neno la kikao cha sasa ≠ alama ya zamani)
- **Faili:** `src/lib/board/memoryAuthority.ts` (`pastAuthorityHits` ~66, heads ~75)
- **Tatizo:** Neno la kwanza la jina la mradi wa zamani (mf. "enterprise" kutoka "Enterprise BI Platform Blueprint") linatumika kama "alama ya kidole" (head). Ila "enterprise" pia ni neno la kwanza la title ya kikao CHA SASA — agent yeyote akilitaja kwa kawaida (TRADE-OFF ya designer), mlinzi aliua proposal kwa udanganyifu.
- **Rekebisho:** Neno lolote linalojitokeza kwenye title/brief/agenda ya kikao cha sasa **haliwezi** kutumika kama head/alama ya mradi wa zamani.
- **Mfano halisi (nime-replay live):** leo heads = `['enterprise','saluni','gereji']` → proposal ya A3 inauawa. Baada: heads = `['saluni','gereji']` → proposal inaisha hai → AGREE 12 zahesabiwa → 🔒 LOCKED kwa zamu ya kawaida.

### A2. Guard ikiua proposal — quote ya sentensi iliyotrigga inarekodiwa
- **Faili:** `src/lib/boardRunner.ts` (R27 LOCK GATE, ~1828–1836)
- **Tatizo:** Mlinzi aliua proposal kwenye giza — hakuna ushahidi wa kwanini (ndiyo maana uchunguzi wa A3 ulichukua muda).
- **Rekebisho:** Guard AKIUA, inaacha **QUOTE kamili ya sentensi iliyotrigga + jina la alama + jina la guard** — inaingia blog + note ya mfumo + Ledger. Ukiona "🧱" popote, kwa dakika moja unajua nini kilichotokea.

### A3. AGREE ikitoa kimya — note wazi
- **Faili:** `src/lib/boardRunner.ts` (~1871–1889, approval section)
- **Tatizo:** AGREE ikifika wakati hakuna proposal hai (kwa sababu ya A2/guards nyingine), ilitupwa kimya — kura 12 za A3 ziliangulia hapa bila alama.
- **Rekebisho:** System note wazi inaandikwa: "AGREE ya X haikusababisha chochote — hakuna pendekezo hai (sababu: …)". Hakuna silent discard tena.

---

## 3. SEHEMU B — ITIFAKI YA KUFUNGA (OPEN inafutwa kama hali)

### B1. Mwenyekiti haishi kipofu tena
- **Faili:** `src/lib/boardRunner.ts` (chair fallback ~1850) + `src/lib/brain/deliberation.ts` (chair mode)
- **Tatizo:** Karantini ya `cutTexts` ilificha proposals zilizouliwa na guards hata kwa mwenyekiti → "chair could not produce a proposal" → OPEN.
- **Rekebisho:** Mwenyekiti anapoingia hatua ya kufunga, **anaona proposals zilizofichwa + sababu zote za kuziua** (A2). Anachagua au kutoa upya kwa usafi. "Chair could not produce a proposal" inakuwa haiwezekani.

### B2. Kura ya mwisho inakuwa BINDING
- **Faili:** `src/lib/brain/deliberation.ts` (vote mode) + `src/lib/boardRunner.ts` (consensus gate ~1981)
- **Mpya:** Kila owner anapiga mara moja: `AGREE` (na sharti moja) au `DISAGREE` (na KOSO MOJA konkreti). Matokeo:

| Matokeo ya kura | Hali ya kufunga |
|---|---|
| Wote AGREE | 🔒 **LOCKED (consensus)** — kama sasa |
| Wingi AGREE + kosa la wachache **limejibiwa** | 🔒 **LOCKED (rough consensus)** + `DISSENT: <agent> — <kosa>` inaingia Ledger |
| Kosa **halijibiwa** | Zamu MOJA ya marekebisho (UPDATED DECISION) → kura moja tena |
| Bado hakuna wingi | 🔒 **LOCKED (rejected + fallback)** — mwenyekiti huchagua toleo la chini salama kutoka yaliyojadiliwa tu + ASSUMPTION wazi |
| Hakuna lolote linalowezekana kwa ushahidi uliopo | 🔒 **LOCKED (defer ya ndani)** — "tunakosa X" inaingia Ledger + ripoti; **kamwe haiendi kwako kama swali**; kazi inaendelea kwenye computer na fallback/assumptions |

### B3. Hali mpya za Ledger (bila kubadilisha schema ya Appwrite)
- `status` inabaki `"LOCKED"` kwa kila agenda inayofungwa (kukataa kwa mafupisho hakuna — kuamua ni uamuzi). Aina ya kufunga (consensus / rough / rejected+fallback / defer) inaandikwa **ndani** ya decision_summary + detail.
- `OBJECTED_OPEN` ya zamani haizalishwi tena kwa sessions mpya. **Sessions zilizopo (ikiwemo 6ac7576d yenye A3 OPEN) hazirekebishwi** — historia haipitiwi; Resume ya session hioo inaendelea na protocol mpya kwa agenda zilizobaki.

### B4. Mpango kazi / coding agents / computer-use — hakuna "OPEN" kama neno
- **Faili:** `src/lib/boardRunner.ts` (~3502 template ya work plan) + prompts za coding (`brain.prompt`) + `src/lib/board/openRecord.ts` (inapanuliwa kuwa close-record: dissent + assumptions + fallback reason)
- **Mpya:** Kila agenda kwenye mpango wa kazi inaonekana: `A5 [LOCKED rough consensus] <uamuzi> · dissent: Vextron — pooling · assumption: single-region DB`. Agents za coding/computer-use zinapata **maagazi kamili** — hakuna "not discussed", hakuna "[~]", hakuna shimo la kubuni.

---

## 4. SEHEMU C — Research caps (uwanja wa token tunatumia)

| Kikomo | Leo | Kuwa | Faili |
|---|---|---|---|
| Searches kwa owner kwa agenda | 6 | **12** | `src/lib/brain/deliberation.ts:11` |
| Zamu za owners kwa agenda | 12 | 12 (haibadiliki) | `deliberation.ts:10` |
| Matokeo kwa query moja | 8 | **12** | `src/lib/search.ts:407` |
| Dirisha la evidence kwenye prompt | 8 za mwisho | **16 za mwisho** | `src/lib/boardRunner.ts:1671` |
| Deep-read kwa agenda | 3 | **5** | `src/lib/board/sourceDesk.ts` |

**Madhara:** evidence ya mwanzo wa mjadala haipotei tena (leo `slice(-8)` inafuta sources za searches za awali); agents wanatafuta mpaka wapate. Gharama ya token: ~+1.4K tokens kwa zamu — fichu kwa Gemini.

---

## 5. SEHEMU D — Uwazi wa Ledger (kila kufunga kina sababu yake)

Kila agenda inayofunga na aina yoyote isipokuwa consensus rahati, Ledger + ripoti inaonyesha: jinsi ilivyofunga · nani alipinga na kosa gani · assumptions zilizo (zilizoandikwa na wao wenyewe) · fallback ilitokea wapi kwenye mjadala. Hii ni continuation ya `openRecord.ts` (R21) — sasa inaita kila kufunga, si tu OPEN.

---

## 6. VISIVYOBADILIKA (nimejifunga mimi mwenyewe)

- ✋ DATA RASMI na Data Guard — haigusiwi
- ✋ Mlinzi wa wizi halisi: "previous Saluni Nuru project chose…", "proven on Mama Lishe Bora" — **unabaki anakata** (regression lazima ipite)
- ✋ Exemption halali: "locked in Agenda 1" (rejea ya kikao hiki) — inabaki inapita
- ✋ Export kamili (R35), hooks zote zikihifadhiwa — haigusiwi
- ✋ UI ya R36: hook cards background, speed halisi ya model — haigusiwi
- ✋ Session 6ac4c32c — haigusiwi (agizo lako la 06-10)
- ✋ Historia ya sessions zilizopo — hairekebishwi
- ✋ Hakuna kuongeza kikomo cha zamu za uchaguzi wa wote — Itifaki inawaka TU kwenye agenda iliyokwama (stall 3 / cap 12); agenda za kawaida (90%) hazipati tofauti yoyote isipokuwa A1 fix

---

## 7. UTHIBITISHO (nitakachofanya mwenyewe kabla ya kukupa ripoti)

1. **Regression ya A3 (kabla/baada):** replay ya msgs 15 halisi za A3 ya session 6ac7576d kwa logic mpya — msg #17 (designer) lazima isisimame tena; agenda lazima ifunge 🔒 LOCKED kwa AGREE za owners.
2. **Regression ya wizi:** "Saluni Nuru" + "Mama Lishe Bora" samples — lazima bado zikatwe (nimeisha-rehearsew kwa Python; sasa kwa code halisi).
3. **Unit tests mpya:** state machine ya Itifaki (kura binding, dissent inarekodiwa, fallback kutoka yaliyojadiliwa tu, defer ya ndani, hakuna njia ya kufikia OPEN) — faili jipya `closingProtocol.test.ts`.
4. **Tests zote:** `npm install` → `./node_modules/.bin/tsc` (clean) → `vitest run` (71 za sasa + mpya = zote pass).
5. **Ukaguzi wangu wa macho:** kila diff nafungua naisome mwenyewe; hakuna kubadilishwa nje ya plan hii.
6. **Ripoti kwako:** nini kimebadilika (faili:mstari), results za tests, replay za mfano — kisha **subiri ruhusa yako ya deploy**.

---

## 8. MPANGILIO WA UTEKELEZAJI (nitakaporuhusiwa)

| Hatua | Kazi | Tokeo |
|---|---|---|
| 1 | Sehemu A (A1+A2+A3) | mlinzi sahihi + uwazi |
| 2 | Sehemu B (B1+B2+B3+B4) | Itifaki kamili, OPEN haizalishwi |
| 3 | Sehemu C (namba 4) | research inatosha |
| 4 | Sehemu D (close-record) | Ledger yenye sababu |
| 5 | Tests + regression + replay | zote green |
| 6 | Ukaguzi + ripoti kwako | unaisoma |
| 7 | **Deploy** (commit → push v3 → Koyeb → health) | **baada ya ruhusa yako pekee** |

---

## 9. RISIKI TATU (kutoka research) NA ULINZI WAKE

| Hatari | Ulinzi |
|---|---|
| Agents zinaridhisha kwa urahisi (conformity) — kura ya "unanimous" isiyo ya kweli | DISAGREE haigharimu kitu (haizuii kufunga, inarekodiwa); kusema "ndiyo" bila msingi ndiyo gharama |
| Wingi unaficha kosa la pamoja | Wingi PEKE yAKE haitoshi: kosa la DISAGREE lazima lijibiwe kabla ya rough consensus; fallback inajengwa kutoka yaliyojadiliwa tu + ASSUMPTION wazi |
| Zamu za ziada | Itifaki inawaka tu kwenye agenda iliyokwama; worst case +4 zamu kwa agenda moja |

---

## 10. SWALI LILOBAKI

Hakuna — uamuzi wote (U1–U5) umewekwa. **Subiri neno lako: "ANZA".**
