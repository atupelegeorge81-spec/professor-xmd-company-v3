# MPANGO KAZI R24 — Usahihi wa Board (lengo: data rasmi 100%, hakuna kinachopita bila ukaguzi)

> Hali: **ripoti na mpango tu — hakuna code iliyobadilishwa.**
> Ushahidi: session ya Saluni Nuru (`6ab929846a5a6edb69ac`), ledger `30j0exgn`, report `6ab93bdd…`, `agent_memory`, na code ya sasa.
> Maelezo kamili ya makosa ya Saluni yako kwenye `RIPOTI-R24-ukaguzi-saluni.md`.

---

## 0. Kwa ufupi

- **Tatizo si model moja wala provider mmoja.** Mfumo unamtegemea LLM **kunakili** data (bei, saa, namba) na **kujikagua mwenyewe**. Kila nakala ni nafasi ya kosa, na ukaguzi wa LLM kwa LLM hauaminiki.
- **Suluhisho la kudumu:**
  1. Data rasmi inatolewa kwenye brief **mara moja** na kuwa "Fact Sheet" iliyothibitishwa kwa code.
  2. Faili za data (`services.json`, saa, `config.json`) **zinaandikwa na code, si na LLM**.
  3. Kila code, ripoti na script ya mwisho inapita **lango la ukaguzi lisilo la LLM (deterministic)** kabla ya kufungwa. Kitu kisichothibitika kinazuiwa au kinawekwa alama.
- **Ukweli kuhusu "100%":**
  - **Data rasmi (bei, saa, anwani, namba):** 100% inawezekana, kwa sababu inakaguliwa na code, si na LLM.
  - **Ubora wa maamuzi ya mjadala:** hauwezi kuhakikishwa 100% na mfumo wowote wa LLM. Tunachoweza kuhakikisha ni kwamba **hakuna kosa linalopita kimya kimya**: kila kitu kinakaguliwa, kinarudishwa, au kinawekwa alama wazi.
- **Tokens:** 94% ya tokens za Saluni zilikuwa **input** (1,383,529 input dhidi ya 83,040 za majibu). Tunaokoa kwa kupunguza context ya kila call na kuondoa calls zinazopotea (19 zilipotea bure), si kwa kufupisha majibu.

---

## 1. Kanuni kutoka utafiti (deep search)

| # | Kanuni | Chanzo | Tunavyoitumia |
|---|---|---|---|
| K1 | **Chanzo kimoja cha ukweli ("backend-is-truth")** kinachohifadhiwa nje ya LLM huondoa kundi kubwa la hallucination kwa muundo wenyewe | StateGen (arXiv 2606.16307) | Fact Sheet ya mradi = chanzo pekee cha data rasmi |
| K2 | **Ukaguzi wa code (deterministic)** hunasa makosa ambayo LLM mbili "zinakubaliana" kimakosa; validator wa LLM naye anaweza ku-hallucinate | dev.to/aws (Executor→Validator→Critic, maoni); pith.science 2507.01446 | Data Guard kabla ya kila LOCK; LLM reviewer ni wa pili tu |
| K3 | **Namba zinakosewa zaidi** wakati wa kuunganisha context; kagua namba moja moja | MARCH (arXiv 2603.24579) | Guard inakagua kila bei, saa, namba ya simu na URL |
| K4 | **Usimpe LLM kazi ya code** (hesabu, kunakili data) — LLM iamue *nini*, code ifanye *vipi* | medium: determinism techniques | Faili za data na assembly ya script zinafanywa na code |
| K5 | **Context ndefu hupunguza usahihi** (context rot 95%→60–70%; "lost in the middle" −15–30 pts) | Chroma via usewire.io / particula.tech | Context fupi na lengwa kwa kila call; data rasmi mwanzoni au mwishoni mwa prompt |
| K6 | **Memory iwe na scope + provenance; "memory is context, not authority"**; usiruhusu output ya agent kurudi kama ukweli bila uthibitisho | machinelearningmastery; OWASP ASI06; dev.to aws-builders | Memory ya mradi mwingine = somo tu, si sharti |
| K7 | **Thinking tokens za Gemini zinahesabiwa ndani ya max_tokens**; `reasoning_effort` (none/low/medium/high) kwenye OpenAI-compat inadhibiti hili | medium (Gemini 37 tokens); discuss.ai.google.dev | Budget sahihi + `reasoning_effort` kwa review na observers; kusoma `finish_reason` |
| K8 | Implicit caching ya Gemini inahitaji prefix inayofanana (≥4K tokens), lakini kupitia OpenAI-compat haikuwa inasaidiwa (forum 2025) | cloud.google.com context-cache; discuss.ai.google.dev | Hatutegemei caching; tunapunguza context moja kwa moja. Tutapima `cached_tokens` kwenye usage |

---

## 2. Ramani ya matundu (kila sehemu inayoweza kuharibu usahihi)

Kipaumbele: 🔴 lazima · 🟠 muhimu · 🟡 ndogo.
Kila tundu lina **ushahidi** kutoka Saluni au kutoka code.

### A. Brief na data rasmi
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| A1 | **Brief inahifadhiwa Appwrite ikiwa imekatwa chars 500** (`saveSession(project.slice(0,500))`). Resume kutoka Appwrite inarudisha `project: saved.project`, yaani brief nusu. Bei, saa na masharti vinapotea kwa agenda zote zinazofuata na kwa ripoti | Session `project` = 500 chars; brief ni ~2,900 | Brief kamili ihifadhiwe kwenye items (gz, chip iliyofichwa `__PROFESSOR_XMD_BRIEF__`) au field kubwa zaidi. Resume isome kamili. Test: resume → `runner.project.length === brief.length` | 🔴 |
| A2 | **Hakuna Fact Sheet.** Data rasmi ipo ndani ya maandishi ya brief tu; kila agent anainakili kwa kumbukumbu yake | Bei za kubuni A4; saa za Kiswahili A5 | Fact Sheet (angalia §4 Awamu 1) | 🔴 |
| A3 | **Code-writer, reviewer, fix na assembly hawapewi brief kabisa** (prompt: decision + ledger + jina la agenda) | `boardRunner.ts` ~1737, ~1822, `applyReviewFixes`, `assembleFinalScript` | Fact Sheet inaingia kwenye kila prompt ya code (fupi, juu ya prompt) | 🔴 |
| A4 | Vyanzo vya mtandao (search) vinaweza kuleta bei, saa na anwani za saluni nyingine | Search ya kila agenda | Data Guard: data rasmi inashinda chanzo chochote; namba zisizo kwenye Fact Sheet zinakataliwa kwenye code | 🟠 |

### B. Mjadala (owners, observers, pingamizi)
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| B1 | **Jibu linakatika mwishoni:** budget owner 1,100 / reviewer 600 / observer 220, na thinking inazila. `finish_reason: "length"` haisomwi, kwa hiyo jibu nusu linakubaliwa | Zamu ~17 zilikatika (A1 "toolchain,", "relevant. It", A3 "z-index") | Kusoma `finish_reason`. `length` ikitokea: continuation (mfumo upo) au lane nyingine. Budget kwa aina ya model. `reasoning_effort:"low"` kwa Gemini kwenye review na observer | 🔴 |
| B2 | **Pendekezo lililokatika linafungwa (LOCKED)** na linakuwa decision ya ledger | A1 v1 na A3 v2 kwenye ledger | "Lock gate": decision iliyokatika (fence witiri, sentensi haijaisha, `finish=length`) haifungwi. Owner anaombwa aikamilishe kwanza | 🔴 |
| B3 | **Decision iliyobadilishwa inaunganishwa na ya zamani** ("[Previous lock — superseded…]: …") ndani ya maandishi yale yale. Code-writer anapata maagizo mawili yanayopingana | A3 LOCKED ina "sticky" NA "Hakuna sticky header" | Ledger ibebe decision **mpya pekee**. Ya zamani ibaki kwenye row ya SUPERSEDED (tayari ipo) | 🟠 |
| B4 | **Memory ya mradi mwingine inatumiwa kama "LOCKED"** (Ultron alipindua Hugo→Astro; sticky header; ≤50KB badala ya <60KB) | Company memory ina "Frontend locked…" ya Mama Lishe `imp:5` | Angalia C1 | 🔴 |
| B5 | Observer akikatika au akijibu tupu, inawezekana inahesabiwa SILENT, hivyo pingamizi linapotea | Budget 220 | Kuthibitisha kwenye test. Jibu tupu au lililokatika ≠ SILENT; rudia kwenye lane nyingine | 🟠 |
| B6 | Neno la kwanza kukatika (`.REE`) | R23 | Imeshafanyiwa kazi R23 (repairHead). Si kipaumbele | 🟡 |

### C. Memory
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| C1 | `recall.ts` inaweka memory zote chini ya "BOARD (company-wide)… use it", bila kutenganisha mradi huu na miradi iliyopita. `imp:5` inapata bonus | Mama Lishe → Saluni | Makundi mawili: **"MRADI HUU"** na **"MIRADI ILIYOPITA — masomo tu, SI maamuzi ya mradi huu; brief + ledger ya sasa ndizo sheria"**. Maamuzi mahususi ya mradi mwingine (rangi, bei, faili, spec) hayaingii kwenye mjadala wa mradi mpya, masomo tu ndiyo yanaingia | 🔴 |
| C2 | `consolidate.ts` inaagiza company memory ihifadhi "project decisions, constraints, exact values" kwa maneno "Locked …", ambayo ni sumu kwa mradi unaofuata | Rekodi zote za company | Company memory: masomo na conventions (bila neno "locked" kwa mradi mwingine). Maamuzi ya mradi: tag ya mradi, na yanasomwa na mradi huo tu | 🔴 |
| C3 | Memory inaweza kuhifadhi madai ya uongo ("8 services, TZS prices" ingawa bei zilibuniwa) | Company memory ya Saluni | Memory inaandikwa **baada** ya Data Guard. Madai ya data yanayopingana na Fact Sheet hayahifadhiwi | 🟠 |
| C4 | Rekodi tupu ya memory (`[imp:3][Mama Lishe] `) | Megatron self | Kuchuja mistari tupu wakati wa kuandika | 🟡 |

### D. Code (kuandika, review, fix, deliverable)
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| D1 | **LLM anaandika faili za data** (services.json, saa, config) kwa kumbukumbu | Bei za kubuni; saa 2/3 si sahihi; `255700000000` | **Faili za data zinazalishwa na code kutoka Fact Sheet.** Code-writers wanaagizwa ku-import tu, si kuandika data | 🔴 |
| D2 | **Hakuna ukaguzi wa data kabla ya LOCK;** reviewer (LLM) aliidhinisha bei za kubuni | A4 APPROVE | **Data Guard (deterministic)** kwa kila script: bei, saa, namba ya simu, email, URL, anwani vinalinganishwa na Fact Sheet. Kosa → REJECT ya kiotomatiki na orodha kamili, kabla ya LLM reviewer | 🔴 |
| D3 | **Review bila verdict = REJECT** (budget 600 inaisha kwenye thinking) | Reviews 8 + fix calls 8 zisizo na maana | Budget ya review ya kutosha + `reasoning_effort:"low"`. Hakuna APPROVE/REJECT → rudia kwenye lane nyingine; ikishindikana → "HAIKUKAGULIWA" (si REJECT, hakuna fix call) | 🔴 |
| D4 | **Majaribio ya code yanaunganishwa kiholela** (`soFar += …`). Jaribio lililoanza upya linachanganywa na vipande vilivyokatika; fence zinakuwa witiri | Deliverable A3 = kipande + nakala kamili + kipande (inaisha katikati ya CSS) | Jaribio lenye block kamili peke yake linachukuliwa lenyewe. Continuation inaunganishwa tu kama kweli ni mwendelezo (overlap check) | 🔴 |
| D5 | `approved_code` inahifadhiwa hata kama review haikuidhinisha ("inaendelea kama ilivyo") | A3 | Ledger ihifadhi `code_status: approved / not_reviewed / rejected`. Assembly na ripoti ziseme ukweli | 🟠 |
| D6 | Patch haikutumika mara 3 (A3) | Items 57–59 | Kuchunguza wakati wa kazi (inahusiana na D4/B3) | 🟠 |

### E. Mini-report na Resume
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| E1 | **"Agenda 3 kila resume":** haijakaririwa kwenye code. Resume inaandika upya kila mini-report yenye alama ya fallback. A3 ilishindwa kwa sababu transcript yake ndiyo kubwa kuliko zote (code iliyojirudia ~20K chars + reviews). Jaribio la resume (15:46) nalo lilishindwa na kuweka alama ile ile, kwa hiyo **kila resume inarudi A3** | Ledger A3 LOCKED ina `<!-- xmd:mini-fallback -->` baada ya 15:46 | (1) Transcript ya mini-report **bila code blocks** (code iko kwenye ledger). (2) Idadi ya majaribio inahifadhiwa (`tries=n`); resume inajaribu mara 1 tu, na jumla si zaidi ya 2. (3) Sababu ya kushindwa inahifadhiwa. (4) Kushindwa hakuzuii mjadala | 🔴 |
| E2 | Resume ya Appwrite inarudisha brief ya chars 500 | A1 | Angalia A1 | 🔴 |
| E3 | Mtandao ukikatika katikati ya code → continuation → model inaanza upya → nakala mbili | A3 | Angalia D4 | 🟠 |
| E4 | Logs hazihifadhiwi, kwa hiyo baadaye haiwezekani kujua lane gani ilikata jibu au kwa nini mini-report ilishindwa | Ukaguzi huu | Muhtasari mdogo wa matukio muhimu (lane kwa kila zamu, `finish_reason`, fallbacks, guard hits) kwenye chip iliyofichwa ndani ya items (gz) | 🟠 |
| E5 | "Muda: 10 min" (unahesabiwa tangu resume tu) | Export | Kutumia `priorElapsedMs` kwenye export | 🟡 |

### F. Script ya mwisho na Ripoti
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| F1 | **Script ya mwisho inaandikwa upya na LLM** (vipande vyote kwa pasi moja). Loop inasimama fence zikiwa shufwa, hata kama vipande havijaandikwa | A7 na A9 zimekosekana; namba ya kubuni | **Assembly ya code (deterministic):** kila kipande kilichoidhinishwa → faili yake (kwa path), kwa mpangilio wa agenda, na kichwa "Agenda N". LLM inaandika maelezo mafupi ya kuunganisha au migongano tu. Ukaguzi wa ukamilifu: kila kipande kipo | 🔴 |
| F2 | Ukaguzi 10.2 unalinganisha na `approved_code`, si na data rasmi, kwa hiyo haukunasa bei za kubuni | 10.2 ya Saluni | 10.2 = Data Guard dhidi ya Fact Sheet + ukamilifu wa vipande + alama NYONGEZA | 🔴 |
| F3 | **Ripoti inaamini madai** ("Huduma 8 na bei zake halisi") bila kuthibitisha code | Ripoti ya Saluni | Jedwali la data rasmi kwenye ripoti linazalishwa na code kutoka Fact Sheet + matokeo ya Guard. LLM haiandiki namba hizo. Dai la "sahihi" linaruhusiwa tu Guard ikipita | 🔴 |
| F4 | Majina yasiyolingana (ripoti `--gold-text` dhidi ya code `--glow-dark`; `Base.astro` dhidi ya `BaseLayout.astro`) | Ripoti | Guard ya majina: identifiers zinazotajwa kwenye ripoti lazima ziwepo kwenye code au ledger | 🟡 |

### G. Providers na tokens
| # | Tundu | Ushahidi | Fix | |
|---|---|---|---|---|
| G1 | Thinking tokens za Gemini ndani ya max_tokens (Gemini ilibeba requests 155/208) | K7 | `reasoning_effort` kwa kila aina ya kazi + budget inayolingana | 🔴 |
| G2 | Kila call inabeba ~6.6K tokens za input (persona + skills + memory + ledger + transcript) | Usage: input 94% | Context kwa kila aina ya call. Observers (calls 24, zote SILENT) wanapata muhtasari mfupi | 🟠 |
| G3 | Calls zinazopotea: review 8 bila verdict + fix 8 "hakuna mabadiliko" + patch 3 zilizoshindwa | Hesabu ya Saluni | D3 + D4 | 🔴 |

---

## 3. Hitilafu ya "Agenda 3 kila resume" — maelezo kamili

1. Wakati wa LOCK, kila agenda inapata mini-report. LLM ikishindwa, inaandikwa **fallback** yenye alama `<!-- xmd:mini-fallback -->`.
2. Kila resume, mfumo unatafuta agenda zenye alama hiyo na kujaribu kuziandika upya (R18/R20). **Hakuna "3" iliyoandikwa kwenye code.**
3. Kwenye Saluni na Mama Lishe, Agenda 3 ndiyo iliyokuwa na mjadala mkubwa zaidi: layout + code nyingi + pingamizi + majaribio ya code yaliyojirudia. Prompt ya mini-report (transcript hadi chars 26,000, pamoja na code) inashindwa. Jaribio la resume linashindwa kwa sababu ile ile, na alama inabaki.
4. Kwa hiyo **kila resume → A3 tena → inashindwa tena**, na tokens zinapotea kila mara.

**Fix (E1):**
- Transcript bila code.
- Idadi ya majaribio inahifadhiwa.
- Resume inajaribu mara 1 tu (jumla si zaidi ya 2).
- Sababu inahifadhiwa kwa ukaguzi.
- Mjadala unaendelea bila kusubiri.

**Test:** fixture ya Saluni → resume mara 3 → A3 inajaribiwa mara 1 tu.

---

## 4. Mpango wa kazi (awamu, kwa mpangilio)

Kila awamu ina: kazi → vigezo vya kukubalika → tests. Logic ya zamani haivunjwi. Mabadiliko yako nyuma ya flow ile ile ya Board.

### Awamu 0 — Kinga za haraka (hazibadilishi flow)
- A1: brief kamili inahifadhiwa na kurudishwa kwenye resume.
- E1: mini-report bila code + kikomo cha majaribio (hitilafu ya A3).
- B1: `finish_reason` + budgets + `reasoning_effort` kwa Gemini (review, observer).
- D3: review bila verdict ≠ REJECT; hakuna fix call.
- **Kigezo:** resume haipotezi hata herufi moja ya brief. Hakuna review isiyo na verdict inayoanzisha fix. A3 haijirudii.

### Awamu 1 — Fact Sheet (chanzo kimoja cha ukweli)
- Mwanzoni mwa Board (pamoja na agenda, call 1 ya fast route): LLM inatoa **JSON ya data rasmi** (jina, anwani, saa, huduma+bei, simu/placeholder, email = hakuna, masharti kama page weight <60KB).
- **Uthibitisho wa code:** kila thamani lazima ionekane **neno kwa neno** ndani ya brief. Isiyoonekana inatupwa. Kama brief haina data rasmi, Fact Sheet ni tupu na mfumo unaendelea kama zamani.
- Inahifadhiwa kwenye items (gz) → inasalimika resume.
- Inaonyeshwa kwenye UI kama chip moja: "📌 Data rasmi imefungwa: huduma 8, saa 3, anwani 1…".
- **Kigezo:** fixture ya Saluni → huduma 8 na bei sahihi, saa 3 neno kwa neno, placeholder `2557XXXXXXXX`, email = hakuna.

### Awamu 2 — Data files kwa code + Data Guard
- **D1:** faili za data (`services.json`, `hours`, `config.json`) zinazalishwa na code kutoka Fact Sheet na kuwekwa kama "kipande kilichoidhinishwa" cha agenda husika. Code-writers wanaagizwa ku-import tu.
- **D2:** Data Guard kwa kila script kabla ya reviewer:
  - bei na namba (TZS, 3+ digits);
  - saa (HH:MM na maneno ya siku);
  - namba za simu;
  - email;
  - URL;
  - anwani.
  - Thamani isiyo kwenye Fact Sheet/decision → REJECT ya kiotomatiki yenye orodha. Tafsiri ya muundo (mf. saa za Kiswahili) inaruhusiwa tu kama imeamuliwa wazi kwenye decision.
- **A3:** Fact Sheet fupi juu ya prompt za code-writer, reviewer, fix na assembly.
- **Kigezo:** fixture ya Saluni → Guard inakamata bei zote za kubuni, saa 2 zisizo sahihi, na `255700000000`. Code sahihi inapita bila false positive.

### Awamu 3 — Lock gate na ubora wa ledger
- B2: decision iliyokatika haifungwi.
- B3: ledger inabeba decision mpya pekee.
- D4: majaribio ya code hayachanganywi.
- D5: `code_status` halisi.
- **Kigezo:** fixture → decisions za A1 v1 na A3 v2 zinatambuliwa kuwa zimekatika; deliverable ya A3 inatoka kwenye jaribio kamili tu.

### Awamu 4 — Memory salama
- C1: recall ya makundi mawili (mradi huu / masomo ya zamani).
- C2: consolidate haiandiki maamuzi ya mradi kama "locked" kwa kampuni.
- C3: memory baada ya Guard.
- C4: kuchuja mistari tupu.
- **Kigezo:** prompt ya agent wa mradi mpya haina rekodi yoyote "locked" ya mradi mwingine. Test ya Saluni-baada-ya-Mama-Lishe: hakuna "Board memory explicitly locks".

### Awamu 5 — Script ya mwisho na Ripoti
- F1: assembly ya code + ukamilifu.
- F2: 10.2 mpya.
- F3: jedwali la data rasmi linalozalishwa na code.
- F4: majina.
- E5: muda.
- **Kigezo:** vipande vyote 100% vipo kwenye script ya mwisho. Ripoti haina namba isiyo kwenye Fact Sheet. 10.2 inaonyesha "Data rasmi: 100% sahihi" au orodha ya makosa.

### Awamu 6 — Tokens
- G2: context kwa aina ya call; observers wanapata muhtasari.
- E4: kumbukumbu ya matukio.
- Kupima `cached_tokens`.
- **Kigezo:** mjadala wa brief ile ile unatumia tokens chache zaidi kuliko Saluni (1.48M) bila kushusha usahihi. Makadirio (si ahadi): **−30% hadi −45%**, kutokana na calls 19 zilizopotea, observers, mini-report bila code, na context ya code-writers.

### Awamu 7 — Uthibitisho
- **Fixture ya Saluni** (`research/r24/session.json` + ledger) inakuwa **golden test**: guards mpya lazima zikamate makosa yote 7 ya ripoti ya ukaguzi.
- Unit tests kwa kila tundu (A1, B1, B2, C1, D1–D4, E1, F1–F3) + tests zote za zamani (393) zipite.
- `scripts/test-agenda.mjs` inaongezewa ukaguzi wa Appwrite baada ya run: brief kamili, Fact Sheet, bei/saa/namba kwenye code na script ya mwisho, ukamilifu wa vipande, decisions zisizokatika, memory bila "locked" ya mradi mwingine, na resume ya A3.
- Kisha **wewe** unaendesha Board moja halisi (brief ile ile ya Saluni). Script inatoa PASS/FAIL kwa kila kigezo.

---

## 5. Kisichoguswa (kwa maagizo yako ya awali)

- Maandishi ya thinking "The user wants me…" hayaguswi. Kinachorekebishwa ni verdict tu.
- Mama Lishe A6 inabaki UNRESOLVED; data za Appwrite za zamani haziguswi.
- Flow ya Board (agenda → mjadala → observers → code → lock → mini-report → ripoti) inabaki ile ile; tunaongeza malango ya ukaguzi tu.
- Resume inabaki kupitia "Endeleza" tu. Hakuna gemma, HF wala embedding brain mpya.

---

## 6. Maamuzi yanayohitaji ruhusa yako

1. **Faili za data kwa code (D1):** LLM haitaandika tena `services.json`, saa na config. Code itaziandika kutoka brief. (Inapendekezwa sana — ndiyo msingi wa 100%.)
2. **Assembly ya script ya mwisho kwa code (F1):** vipande vilivyoidhinishwa vinaunganishwa kama faili, badala ya LLM kuandika upya kila kitu. LLM inaandika maelezo ya kuunganisha tu.
3. **Memory ya miradi mingine = masomo tu (C1/C2):** maamuzi mahususi ya Mama Lishe (rangi, spec, 50KB) hayataingia tena kwenye mradi mpya.
4. **Saa za Kiswahili:** zinaruhusiwa tu kama Board imeamua wazi. Vinginevyo saa zinabaki neno kwa neno kama brief (08:00 – 20:00).
5. **Mpangilio:** tuanze Awamu 0 → 7 kwa mfuatano, kila awamu na tests zake, au unataka kuanza na zipi kwanza?

---

## ✅ HALI YA UTEKELEZAJI (R26)

| Awamu | Hali | Faili kuu |
|---|---|---|
| 0 — Brief kamili + chips zilizofichwa (resume) | ✅ | `board/factSheet.ts`, `usageChip.ts`, `BoardLive.tsx` |
| 1 — Fact Sheet (parser + LLM iliyothibitishwa) | ✅ | `board/factSheet.ts` |
| 2 — Data Guard (code + maandishi) + faili za data za MFUMO | ✅ | `board/dataGuard.ts`, `board/dataFiles.ts` |
| 3 — Code blocks (kuchagua toleo kamili, kugawa faili nyingi) + `code_status` | ✅ | `board/codeBlocks.ts`, `ledger.ts`, Appwrite `board_ledger.code_status` |
| 4 — Hukumu ya review (hakuna REJECT ya uongo), kikomo cha mini-report (A3) | ✅ | `board/reviewVerdict.ts`, `miniReport.ts` |
| 5 — Script ya mwisho ya kideterministic + Guard ya ripoti (10.3) | ✅ | `board/assemble.ts`, `boardRunner.ts` |
| 6 — Memory kwa mradi (miradi mingine = masomo tu), resume ya muda, cached tokens | ✅ | `brain/memory/recall.ts`, `consolidate.ts`, `checkpoint.ts`, `tokenMeter.ts` |
| 7 — Majaribio ya golden (data halisi ya R24) | ✅ 89 mapya + yote ya zamani yanapita | `research/unit/r26.test.js` |

---

## 🔮 MPANGO WA BAADAYE — Board ya maneno tu (text-based, bila code)

> **Hali:** IMEPANGWA TU — **haijaanzwa**. Mkuu ameagiza iandikwe hapa ili isipotee; itafanyika baadaye, **si sasa**. Usianze kuitekeleza bila ruhusa yake.

**Uamuzi wa Mkuu (R29):** baadaye Board itakuwa ya **maneno tu**:
- Agents **wanajadili mradi kwa maneno**: wanapendekeza, wanakubali, wanapinga na wanatoa pingamizi, kama ilivyo sasa.
- Mwisho **wanaandika ripoti ya kawaida** (Kiswahili).
- **Hakuna code wanayotakiwa kutoa**: hakuna awamu ya kuandika code, review ya code, fix, wala script ya mwisho.

**Kwa nini (ushahidi wa R29 — Mkate Bora Bakery):**
- Mjadala kwa maneno ulikuwa imara: agenda zote 5 zilifungwa, data rasmi ilikuwa sahihi 100%, na kulikuwa na DISAGREE/OBJECTION za kweli.
- Awamu ya code ndiyo ilikuwa dhaifu: code ya agenda zote 4 zenye code (A2–A5) ilikataliwa, kulikuwa na mgongano wa waandishi wawili kwa faili moja, na kosa la API (`new_context`) halikugunduliwa.
- Ripoti ilieleza mpango kana kwamba umetekelezwa (mf. axe-core).

**Ya kukumbuka wakati wa kutekeleza (baadaye):**
- Kanuni ya kudumu: **usivunje logic ya zamani**. Hali ya maneno tu iwe njia mpya au chaguo, si kufuta flow ya code bila maagizo.
- Kinga za maneno zibaki: Fact Sheet / Data Guard ya maandishi, contrast guard, gate ya mradi wa zamani, uthabiti wa pingamizi, mini-report na Ledger.
- Ripoti isitaje script/code; iseme wazi kilichoamuliwa dhidi ya kilichobaki wazi.
- Masuala ya mjadala yaliyobaki (R29), ya kushughulikiwa pamoja na kazi hii:
  - madai ya uongo yanayotolewa kwa kujiamini na kukubaliwa bila ukaguzi ("nimethibitisha");
  - "AGREE … lakini" (kukubali huku ukipinga);
  - memory ya miradi ya zamani;
  - makosa ya Kiswahili kwenye ripoti (mf. "kuoda" → "kuagiza").
