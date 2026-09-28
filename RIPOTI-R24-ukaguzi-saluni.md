# Ukaguzi R24 — "Optimus Saluni Nuru Web Project"

Chanzo: export uliyotuma + Appwrite (session `6ab929846a5a6edb69ac`, ledger `30j0exgn`, report `6ab93bdd39f74f63ff23`, `agent_memory`).
Providers wa session: Gemini 155 req · UnoRouter 50 · OpenRouter 3.

## ✅ Kilichokuwa sahihi
| Hatua | Matokeo |
|---|---|
| Agenda | 10 hasa, mada na mpangilio ule ule wa brief |
| Ledger (Appwrite) | LOCKED 10 · SUPERSEDED 2 · OPEN 0, zote chini ya `project_id=30j0exgn` (hazichanganyiki na Mama Lishe) |
| Session (Appwrite) | Items 184, zinalingana na export. Thinking kwenye export ni sahihi (ilikuwa kwenye chat) |
| Anwani | Neno kwa neno ("Mtaa wa Shekilango, Sinza Mori, Jengo la Nuru Plaza, Ghorofa ya 1") |
| WhatsApp (A6) | `2557XXXXXXXX` kutoka `config.json`, `wa.me` na template ya Kiswahili |
| Rangi (A2) | Tokens mpya za Saluni, contrast imekaguliwa |
| Ripoti (Appwrite) | Imehifadhiwa, pamoja na script ya mwisho, ukaguzi 10.2 na mini-reports 10 |
| Memory | Agents 5 + company memory zimeandikwa (15:53–15:55) |
| Usage | Requests 208 = jumla ya agents wote (90+25+50+20+23) |

## ❌ Makosa yaliyopatikana (kwa uzito)

### 1. Data rasmi imebuniwa kwenye code — KUBWA
- **Huduma na bei (A4):** code na ledger (`approved_code`) zina huduma na bei za kubuni: "Kusuka Mabutu / Rasta 25,000", "Steaming 15,000", "Facial Scrub 20,000", n.k. Kati ya huduma 8 rasmi, ni **Manicure 10,000 tu** iliyo sahihi.
- **Saa (A5):** zimebadilishwa kuwa saa za Kiswahili, na mbili si sahihi:
  - Jumamosi: "Saa 3 Asubuhi – Saa 3 Usiku" (09:00–21:00); rasmi ni 08:00–22:00.
  - Jumapili: "Saa 4 Asubuhi – Saa 1 Jioni" (10:00–19:00); rasmi ni 10:00–18:00.
- **Script ya mwisho:** ina `whatsappNumber: "255700000000"`. Namba hii ya kubuni iliingizwa na Vextron kwenye code ya Agenda 3.
- **Chanzo (kwenye code):** prompt za **code-writer**, **reviewer**, **fix** na **assembly** zinapewa LOCKED DECISION, ledger na jina la agenda tu. **Brief/DATA RASMI haimo.** Decision ilisema "exact 8 services from the official data", lakini aliyeandika code hakuiona data hiyo.
- **Madhara:**
  - Optimus aliipa APPROVE (hakuwa na data ya kulinganisha).
  - Ripoti inadai "Huduma 8 na bei zake halisi".
  - Ukaguzi 10.2 hauku-flag kwa sababu unalinganisha na `approved_code`, si na DATA RASMI.

### 2. Memory ya Mama Lishe ilitumika kama "LOCKED" kwa Saluni — KUBWA
- Company Board memory ina rekodi za `[Mama Lishe]` zilizoandikwa "Frontend locked: Astro…", "Locked Layout Spec… Sticky header… `#saa`, `#mahali`", "≤50KB".
- **Agenda 1:** Hugo ilikubaliwa na owners wote. Ultron aliipinga kwa kutaja "locked Board memory" (ya Mama Lishe), na uamuzi ukabadilishwa kuwa Astro.
- **Agenda 3:** "no sticky header" ilipinduliwa kwa sababu ya "Board Memory [imp:5] explicitly locks: Sticky header… `#saa`, `#mahali`", ambayo ni spec ya Mama Lishe.
- **Bajeti:** brief inasema <60KB. Board ilitumia ≤50KB ya Mama Lishe, na ripoti inaiita "Stricter budget".
- **Chanzo:** `recall.ts` inaweka memory zote chini ya "BOARD (company-wide)" na agizo "use it", bila kutenganisha **mradi huu** na **miradi iliyopita**. Rekodi `imp:5` zinapata bonus, kwa hiyo zinaingia kila mara.

### 3. Majibu yanakatika mwishoni (si mwanzoni) — KUBWA
- Zamu ~17 zilikatika au hazikuwa na jibu. Mifano:
  - Vextron (A1) PROPOSED "…haitoshi Node.js toolchain," (thinking chars 5,189).
  - Optimus (A1) "relevant. It" (chars 12).
  - Ultron (A2) "…-apple-system, Blink".
  - Cybertron (A9) "…matches Ag".
- **Maamuzi yaliyofungwa yamehifadhiwa yakiwa yamekatika:**
  - A1 v1 kwenye ledger.
  - A3 v2: "Header (sticky top: `position: sticky; top: 0; z-index" (ledger).
- **Chanzo:** budget ya tokens ni ndogo kwa models za reasoning, na thinking inazila zote:
  - owner 1,100;
  - reviewer **600**;
  - observer 220.
- Code haisomi `finish_reason: "length"`, kwa hiyo jibu nusu linakubaliwa kama kamili.

### 4. Reviews 8 hazikuwa na verdict, zikahesabiwa REJECT
- **Zamu zilizoathirika:**
  - A2: Ultron ×2.
  - A3: Optimus ×2.
  - A5: Ultron ×2.
  - A7: Optimus.
  - A9: Optimus, ambaye jibu lake lilikuwa "ci.yml" tu.
- Kwenye Appwrite maandishi haya ("The user wants me to act as…") yako kwenye **content** (thinking = 0). Maana yake: jibu lilikatika kabla ya APPROVE/REJECT.
- Code inahesabu "si APPROVE" kuwa REJECT. Matokeo yake ni rounds za fix zisizo na maana ("hakuna mabadiliko yanayohitajika"), kisha code inaendelea "kama ilivyo".
- (Maandishi "The user…" yenyewe hayaguswi, kwa agizo lako la R18. Tatizo ni verdict.)

### 5. Deliverable ya Agenda 3 imeharibika
- Majaribio 3 ya Vextron:
  - #1 lilikatika (chars 407).
  - #2 lilikamilika (chars 5,284).
  - #3 lilikatika tena (chars 4,136); mtandao ulikatika hapo.
- Code inaunganisha majaribio yote (`soFar += …`). Jaribio #2 lilianza upya badala ya kuendelea, kwa hiyo fence zikawa witiri na loop haikusimama.
- **Matokeo:** deliverable ya chars 9,907 = kipande + nakala kamili + kipande kilichokatika. Inaisha katikati ya CSS. Vivyo hivyo `approved_code` ya A3 kwenye ledger.

### 6. Script ya mwisho haijakamilika
- **Haina:** ukurasa wa Kuhusu Sisi (A7), tests/CI (A9), na sitemap/compression configs (A8).
- Hakuna alama `NYONGEZA (haikujadiliwa)` kwa vitu vilivyoongezwa (siteUrl `saluninuru.co.tz`, maandishi ya hero).

### 7. Madogo
- **Muda:** "Muda: 10 min" kwenye export. Session halisi ni 14:34→15:55; muda unahesabiwa tangu Endeleza tu.
- **Jina la token:** ripoti inaita `--gold-text`, lakini code ni `--glow-dark`.
- **Jina la layout:** A7 ilidai layout `Base.astro` (jina la Mama Lishe), lakini code ni `BaseLayout.astro`.
- **Lebo ya export:** "🔎 _Ultron ametafuta:_ 📄 Imesomwa kamili…" inachanganya lebo za search na kusoma chanzo.
- **Memory tupu:** Megatron self_memory ina rekodi tupu `[imp:3][Mama Lishe] `.

## Mapendekezo ya fix (yanasubiri ruhusa)
1. **DATA RASMI kwenye kila hatua ya code:**
   - Brief inaingia kwenye prompt za code-writer, reviewer, fix na assembly.
   - Reviewer anaagizwa kulinganisha kila bei, saa, namba na anwani na brief.
2. **Guard ya data (bila LLM):**
   - Bei, saa, namba na anwani zinatolewa kutoka brief.
   - Script yenye bei, saa au namba ya simu isiyo kwenye brief inarudishwa kwa marekebisho kiotomatiki.
   - Ukaguzi 10.2 unalinganisha na DATA RASMI pia.
3. **Memory ya miradi mingine = rejea tu:**
   - `recall.ts` inatenganisha "MRADI HUU" na "MIRADI ILIYOPITA (lessons — si maamuzi ya mradi huu; brief na ledger ya sasa ndizo zinazotawala)".
   - Neno "locked" la mradi mwingine halichukuliwi kama sharti.
4. **Jibu lililokatika halikubaliwi:**
   - Kusoma `finish_reason: "length"` → kuendelea pale lilipoishia (continuation iliyopo).
   - Kupandisha budget: owner 1,100 → ~2,500; reviewer 600 → ~2,000.
5. **Review bila verdict:** si REJECT. Inarudiwa kwenye lane nyingine; ikishindikana mara 2, inaandikwa "haikukaguliwa", si "REJECT".
6. **Majaribio ya code:** jaribio lililoanza upya na kukamilika linachukuliwa peke yake, halichanganywi na vipande vilivyokatika.
7. **Script ya mwisho:**
   - Inajumuisha deliverables za agenda zote zenye code.
   - Inaweka alama NYONGEZA.
   - Script ya majaribio (`test-agenda`) inaongezewa ukaguzi wa DATA RASMI.
8. **Madogo:** muda halisi wa session, na lebo ya export.
