# Task 36: Kumbukumbu zisiingiliane kati ya miradi + ubunifu + picha za mfano

**Agizo la CEO (2026-10-22):**
- Kwenye majaribio yangu, kazi ileile iliendeshwa mara nyingi (session ilifutwa kila mara), lakini agents walirudia design ileile hadi mwonekano mzima wa web ukawa uleule. CEO yuko sahihi 100%.
- Ni kwa agents WOTE, si designer peke yake.
- Kwenye hero na sehemu za kuona, agents watafute picha za mfano mtandaoni.
- Kumbukumbu zisifutwe.

**Mpango:** `xmd-home/task-docs/MPANGO-KUMBUKUMBU-NA-UBUNIFU.md`, Awamu 1–5. Awamu 0 imejibiwa na ushahidi wa CEO pamoja na data halisi iliyo hapa chini.

## 1. Chanzo (ushahidi halisi, Supabase `agent_memory`, 2026-10-22)

Backup kamili kabla ya kazi yoyote: `xmdtest/t36/agent_memory-backup-2026-10-22.json` (safu 6). **Hakuna mstari uliofutwa wala kubadilishwa.**

Mistari halisi ya Ultron iliyobebwa kwenda kila mradi mpya:
- "Mkuu prefers 'editorial' sharpness … zero border-radius and hairline dividers are the approved aesthetic" (upendeleo uliokisiwa; Mkuu hakuutamka);
- "editorial brutalist language (zero-radius, asymmetrical desktop grid, hair-line borders)";
- "#030712 base with #06b6d4 cyan · Space Grotesk/IBM Plex Sans".

Megatron na Vextron walibeba "Next.js 15 Server Actions + Supabase + Zod" kila mradi.

**Njia ya kuvuja (`recall.ts`, kabla ya T36):** lebo ya kila kikao ni "jina #id", kwa hiyo kila jaribio jipya lilikuwa "mradi mwingine". Mistari yake iliingia kama "lessons" kwa sababu:
- hadi mistari 6 iliruhusiwa;
- **neno 1** tu linalofanana lilitosha (brief ileile = maneno yote yanafanana);
- `maskPastValues` iliondoa hex na px tu, ikaacha maneno ya mtindo.

## 2. Mabadiliko

| Faili | Badiliko |
|---|---|
| `brain/memory/scope.ts` (mpya) | Lango la mipaka; mistari imegawanywa katika aina 4 (tazama chini). |
| `brain/memory/recall.ts` | Mistari ya miradi mingine inapita lango (upeo 3). Ina `trace` (vitambulisho + idadi zilizozuiwa). Lebo inasema: "NEVER carry a look, palette, font, layout style or tech stack". |
| `brain/runtime.ts` | Log ya `memory.recall` sasa ina trace, mf. `zamani M1x2:lesson · zimezuiwa: design 22, weak 3`. Block ya avoid imeongezwa. |
| `brain/memory/avoid.ts` (mpya) | "FRESH START — DO NOT REPEAT" (tazama chini) + `diversityWarning` baada ya Mpango Kazi kuhifadhiwa. |
| `checkpoint.ts`, `reflection.ts`, `consolidate.ts` | Sheria za uandishi za T36: mtindo au stack ya mradi si "sheria"; "Mkuu prefers" ni lazima iwe nukuu yake mwenyewe. |
| Skill `frontend-design` | Mielekeo 3 tofauti → futa inayolingana na orodha ya "usirudie" → chagua moja. Picha za hero kupitia `images:`. |
| `imageSearch.ts` (mpya) + `search.ts` | `RESEARCH_REQUEST: images: <maneno>` → Wikimedia Commons (kisha Openverse kama akiba). Kila tokeo lina IMAGE_URL, ukubwa, leseni na credit. SearXNG yetu haina engines za picha (`/config` categories: general/web/it/repos/q&a). |
| `boardRunner.ts` | Maelekezo ya `images:` kwenye zamu ya owner; picha haziangaliwi kwenye "memory ya mjadala"; Ultron temperature 0.8 (wengine 0.5). Onyo la utofauti baada ya plan. |
| `server/plans.ts` | `listRecentPlans()`. |

**Aina 4 za mistari kwenye lango (`scope.ts`):**

| Aina | Sheria ya kuvuka mradi |
|---|---|
| design (EN + Kiswahili) | Haivuki kamwe. |
| pref iliyokisiwa ("Mkuu prefers…") | Haivuki. Ya Chat inaruhusiwa kwa sababu ni maneno ya Mkuu mwenyewe. |
| tech (Next.js, Supabase, Zod, Zustand…) | Inavuka TU kama teknolojia zote zimo kwenye brief/kazi hii. |
| lesson | Inavuka tu ikiwa na maneno 2+ ya uhusiano. |

**Block ya "FRESH START — DO NOT REPEAT" (`avoid.ts`):**
- Ultron, Vextron na Optimus wanaona muhtasari wa maneno wa mwonekano wa miradi 5 ya karibuni (base / accent / fonts / mitindo). Hex hazionyeshwi, ili zisinakiliwe.
- Vextron, Megatron, Cybertron na Optimus wanaona "STACK HABITS". Wanapaswa kutaja mbadala mmoja halisi kwa kila chaguo kubwa, isipokuwa brief imetaja stack.

## 3. Majaribio

### 3a. Data halisi: mistari YOTE 121 ya `agent_memory` kupitia lango
Script: `xmdtest/t36/realcheck.ts`. Brief mpya ya mfano: landing ya duka la kahawa Mwanza, HTML/CSS. Matokeo:

```
mistari 121
optimus.self       {"lesson":15,"inavuka":15,"design":4,"imezuiwa":7,"pref":1,"tech":2}
ultron.self        {"design":22,"imezuiwa":22}
vextron.self       {"design":10,"imezuiwa":24,"tech":13,"pref":1}
megatron.self      {"tech":13,"imezuiwa":13,"lesson":7,"inavuka":7}
cybertron.self     {"tech":5,"imezuiwa":9,"lesson":6,"inavuka":6,"design":4}
company.board      {"lesson":9,"inavuka":9,"design":8,"imezuiwa":9,"tech":1}
```

- Ultron 22/22 imezuiwa, Vextron 24/24 imezuiwa.
- Mafunzo ya utaratibu (POSIX printf, ushahidi kabla ya kudai, WCAG) bado yanavuka, lakini kwa sharti la uhusiano wa maneno 2+ na upeo wa 3.

### 3b. Picha halisi (mtandao)
Script: `xmdtest/t36/img.mts`.
- Swali `images: coffee shop interior tanzania` lilirudisha picha 8 kutoka Commons (swali lililegezwa kuwa "coffee shop interior"), ndani ya 439ms.
- IMAGE_URL ya kwanza → `200 image/jpeg 527234` bytes.
- Openverse ilikatika kwa timeout kutoka sandbox hii (kwa hiyo ni akiba tu).

### 3c. Unit tests mpya (+18)
- `brain/memory/scope.test.ts` (10): mistari HALISI ya Ultron, Optimus, company (Kiswahili), Megatron na Cybertron. Inajumuisha recall ya Board inayothibitisha mambo haya:
  - design ya miradi mingine haiingii;
  - funzo linaingia;
  - mstari wa mradi huu unabaki;
  - trace `design 4`.
- `brain/memory/avoid.test.ts` (6): hex halisi za `project_plans` (giza #09090B…, KilimoSmart cream). Onyo la utofauti linatokea kwa giza + Inter, na halitokei kwa cream.
- `imageSearch.test.ts` (2).

### Baselines

| | kabla | baada |
|---|---|---|
| tsc | 0 | 0 |
| vitest | 838 + 2 skipped | **856** + 2 skipped |
| eslint | 29 | 29 |
| pytest | 346 | 346 |

## 4. Kilichobaki (kwa CEO)
- **Jaribio halisi la mwisho:** CEO aendeshe kazi ileile mara 2–3 kupitia Koyeb (prompt imetolewa kwenye chat). Kwenye Overview › Logs angalia:
  - `memory.recall … zimezuiwa: design N`;
  - `avoid-list ✓` kwenye `prompt.board`;
  - `🖼️ … picha N kutoka Wikimedia Commons`;
  - `⚠️ Utofauti (T36)` (kama mwonekano umefanana).
- Kumbukumbu za zamani hazijafutwa. Zinabaki kwenye miradi yao, na lango linazizuia kuvuka. Kuzipanga au kuzifuta (Awamu 4) ni uamuzi wa CEO.
