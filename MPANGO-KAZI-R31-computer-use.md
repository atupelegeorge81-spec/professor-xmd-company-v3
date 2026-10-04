# MPANGO KAZI R31 — COMPUTER-USE INTEGRATION: "XMD Computer" ndani ya Professor-XMD Company

> **Hali: IMEIDHINISHWA NA CEO (04-10-2026) — "ANZA".** Marekebisho ya idhini: (a) ripoti ya mwisho ya computer = DOCUMENT kawaida (si card) — kama XMD ilivyoandika; (b) model akitaka kuandika TABLE inaandika table normal — HATUM-DIRECTIWI aandike draw nyingine; renderer inashughulikia kila kitu.
> Tarehe: 4 Oktoba 2026 · Chanzo: XMD3 (maabara ya testing — logic inachukuliwa, UI yake inatupuliwa).
> CEO amethibitisha: bucket ✅ · template v3 ✅ · renderer access ✅ · uamuzi zote 14 za chini ✅

---

## 0. Picha kwa ufupi (executive summary)

Pale **Board Room inapokamilika KABISA** (mjadala → LOCK → Mpango Kazi → Ripoti → Memory — card ya mwisho kabisa), **computer-use phase inaanza YENYEWE** — bila kitufe, bila kwenda app nyingine:

```
[Board Room kama kawaida] → … → Memory inakamilika (kila kitu kimeisha)
        ↓  moja kwa moja
═══════════ 🖥️ XMD COMPUTER ═══════════   ← divider mpya (badge + mistari miwili, mtindo wa agenda-start)
        ↓
Agent MMOJA (hana jina, hana persona) anaingia kwenye E2B sandbox:
  1. Anasoma MPANGO KAZI (§2 Official Data verbatim + hatua 9-15 + QA checklist)
  2. Anatekeleza Step 1..N — kila hatua ina Verification yake
  3. Mawazo yake yanatiririka LIVE (card ya thinking — shimmer)
  4. Kila tool: draft (code ikimiminika) → exec card (read/write/edit/bash/grep)
  5. Anajipima MWEWE kwa Playwright (localhost NDANI ya sandbox — SISI HATUIONI):
     screenshots desktop 1280×800 + mobile 375×667, tab zote → BUCKET ya Appwrite → cards
  6. QA ya mpango (§7) kwa browser_evaluate — ushahidi halisi, si madai
  7. git init + gh push (GitHub) → card ya GitHub
  8. Vercel deploy --prod → card ya LINK YA LIVE
  9. Ripoti ya mwisho KWA KISWAHILI (link live + repo + muhtasari wa majaribio +
     picha + muundo wa faili — na MERMAID diagrams zinarender kwa urahisi)
        ↓
Mradi UNAISHA. Tokens zake ziko kwenye Overview, Sessions, Stats — KILA MAHALI.
```

**Vyakuingia:** logic ya Claude Agent SDK + Playwright MCP + workflow (jenga→jipime→GitHub→Vercel→ripoti) + file-tree logic + cards za matukio — **zote zinajengwa upya kwa theme, shimmer na Lugha ya Professor-XMD.**
**Vyatupuliwa:** UI nzima nyeupe ya XMD, preview panel ya localhost/Site (kabisa!), LiteLLM, Termux launcher, mode za OpenHands/local.

---

## 1. Uamuzi zilizofungwa na CEO (LOCKED — hazibadilishwi)

| # | Uamuzi |
|---|---|
| 1 | Computer-use inaanza **baada ya card ya mwisho kabisa ya Board Room** (memory kamili) — inaendelea yenyewe, **hakuna kitufe "Tekeleza"** |
| 2 | Divider mpya: **"XMD COMPUTER"** — badge + mistari miwili kushoto/kulia (mtindo uleule wa agenda-start) — inaonekana baada ya discussion kuisha |
| 3 | Agent ni **MMOJA na HANA JINA** — hakuna Optimus, hakuna persona yoyote kwenye phase hii. Muonekano: "XMD Computer" + icon ya kompyute |
| 4 | Badges za session-details (Elapsed · 5/5 · Locked · 440.3k Tokens) **zinapunguzwa ukubwa+upana**; nafasi inapanuliwa kulia **bila scroll**; **badge mpya "Files" mwisho kulia** → card yote inabadilika kuwa **file tree**; **back ya simu inarudi** session details |
| 5 | Models **kawaida: GEMINI TU** — flash NA flash-lite ZOTE, keys zote mbili (Gemini 1 + 2) |
| 6 | **EMERGENCY** (Gemini zote zimeisha kwenye keys zote mbili): **XKiro kwanza** (kama kuna nafasi) → **OpenRouter** → **Groq** → nyinginezo — mpangilio: **akili kubwa kwanza, kisha ndogo na ndogo zaidi** |
| 7 | **Hakuna chip/card ya "quota imeisha" wala 503** — swapping na retries zote **nyuma ya pazia** (silent). Fatal tu (lanes ZOTE zimekufa): card MOJA ya kosa + Endeleza |
| 8 | Tokens za computer-use **zinaingia kila mahali** hesabu za token zinapatikana: Overview, Sessions, Stats, usage chip |
| 9 | Screenshots → **bucket "Professor-xmd-company" (ID `6ac2935d0038fbd47d5d`)** — imethibitishwa: upload/view/delete ✅, public read ✅ |
| 10 | Sandbox: **E2B tu**, template **`professor-xmd-browser-v3`** (imethibitishwa: ready, spawned 95×, RAM 2GB, disk 14GB, Chromium ndani) — **hakuna kitu kinaingizwa Koyeb** (Koyeb inabaki host ya app inayo-connect E2B) |
| 11 | **Hakuna preview ya localhost kwa mtumiaji** — agent anaona mwenyewe ndani ya sandbox, anajipiga screenshots, anarudisha **link ya live (Vercel)** |
| 12 | **LiteLLM inatupuliwa** — "Gemini Swap Brain" yetu ndiyo proxy (Anthropic-format kwa SDK, ndani yake inaroute Gemini keys/models) |
| 13 | **Mermaid access** — mradi wetu una MermaidDiagram/ReportBody tayari; cards mpya (hasa ripoti ya mwisho ya computer-use) zina-render mermaid kwa urahisi |
| 14 | Events zote za computer-use zinaingia **Appwrite kwenye session ILEILE** → refresh haipotezi kitu; kama ikikatika → **Endeleza** inarudisha (resume-safe kama kila kitu chetu) |

---

## 2. Awamu A — GEMINI SWAP BRAIN (`cuBrain` — proxy ndani ya sandbox)

**Umbizo:** module ndogo (Python, kama bridge) inayesikiliza `localhost:PORT` kwa lugha ya **Anthropic Messages API** ( SDK ya Claude Agent SDK inaunganisha `ANTHROPIC_BASE_URL` kwake — mfumo uleule wa XMD, ila LiteLLM imetolewa).

### A1. Lanes za kawaida (Gemini tu)
- Kila mchanganyiko (key, model) = lane moja: **Gemini 1 × [3.8-flash, 3.7-flash, 3.6-flash, 3.5-flash, 3.5-flash-lite, …] + Gemini 2 × [ileile]** — orodha ya models inasomwa kutoka config moja (kama `GEMINI_FLASH_MODELS`/`GEMINI_LITE_MODELS` zetu — inaruhusu models mpya bila kubadilisha code).
- **Mpangilio wa uteuzi: akili kubwa kwanza** (flash kubwa → ndogo → flash-lite mwisho).
- Kila jibu linakuja na `usage` halisi (prompt/completion tokens) → inapelekwa kwenye event `usage` (Awamu D).

### A2. Quota state (kweli, si makadirio)
- Kabla ya kila run, Koyeb inatuma **snapshot ya quota** (kutoka `usageLedger` yetu — gemState: requests/tokens za leo, exhaustedUntil, busyUntil) kwenda sandbox.
- Sandbox brain ina **hesabu yake ya ndani** kwa siku hiyo (kwa kukopa logic: siku mpya **Pacific midnight** = reset — ileile ya Google).
- Baada ya kila call, event ya usage inarudi Koyeb → Koyeb inasasisha `noteGemResult`/`noteXkiroResult`/… → **meters za `/api/usage/accounts` zinabaki sahihi** (hii ni "shimo" ningeliacha — nimeziba: calls za sandbox nje ya Koyeb hazingeonekana kwenye meters).

### A3. EMERGENCY tier (msururu wa akili kubwa → ndogo)
```
Gemini (keys 2 × models zote, flash kubwa → flash-lite)
  ↓ zote zimeisha quota (au zote 429/busy muda mrefu)
XKIRO (kama kuna nafasi — lanes zetu za xkiro-1/2, model zao yenye akili)
  ↓
OPENROUTER (or-1/or-2 — models za akili kubwa kwanza, kisha ndogo)
  ↓
GROQ (groq-1/2 — kwa mpangilio uleule)
  ↓
nyinginezo (UnoRouter — akili kubwa kwanza)
```
- Emergency inaanza **kimya** — hakuna chip, hakuna card (uamuzi #7). Inaonekana kwenye **logs za server pekee** (`blog("warning", "🖥️ cuBrain: Gemini zote zimeisha — emergency XKiro…")`).
- Inakaa kwenye emergency hadi run inaisha (hakuna kurejea kila call — isiPingekeleze).

### A4. 503 / retries — NYUMA YA PAZIA
- OpenRouter (na nyingine) zikijibu 503/empty: **retry kwenye lane nyingine mara moja** — hakuna event ya UI kwa jaribio lililoshindikana; only matokeo ya mwisho (jibu halisi) inaonekana.
- 429 quota: lane inaalamishwa `exhaustedUntil` (kwa mujibu wa siku ya provider: Pacific/UTC/24h-bucket ya Groq) na inarukwa.
- Fatal (lanes ZOTE hazijibu): event MOJA `cu_error` → card moja ya kosa (na sababu halisi) + kitufe cha Endeleza. Hakuna loop ya kosa.

### A5. Verification ya Awamu A
- Unit tests: mpangilio wa uteuzi (kubwa→ndogo), kushuka emergency kwa mpangilio (XKiro→OR→Groq), 503-suppression (hakuna event ya kwa UI), Pacific reset, usage event kila jibu.
- Test halisi: script ndogo inayopiga calls 3 kupitia brain (Koyeb-local) na kuthibitisha routing + usage events.

---

## 3. Awamu B — ENGINE YA COMPUTER-USE (boardRunner + E2B)

### B1. Trigger (lini inaanza)
- `mode === "plan"` + `finale.planId` ipo + **memory phase imekamilika** ( Reflection + self + company — card ya mwisho kabisa ya Board) → **hapa ndipo** badala ya kufunga session kama "completed", runner inaingia phase mpya: `computer`.
- Session status: `"completed"` inakuja **baada** ya ripoti ya computer-use (au baada ya kosa fatal lililothibitishwa).

### B2. Uunganishaji wa sandbox (Koyeb → E2B)
- `Sandbox.create(professor-xmd-browser-v3)` (au `connect` ya iliyohifadhiwa — `sandbox.id` inaingia kwenye RESUME chip).
- Kila run: bridge + cuBrain **zinapakiwa fresh** (mfumo wa XMD — sandbox ya zamani isibaki na code ya zamani).
- Chromium path inatafutwa kama XMD (`ls ~/.cache/ms-playwright/chromium-*/chrome-linux*/chrome`) → `--executable-path` kwa Playwright MCP (isisakinishi nyingine).
- **Heartbeat**: `sbx.setTimeout(60min)` inaongezwa wakati run inaendelea (kila dakika); mwisho wa run → timeout ndogo (cost control) na kama kila kitu kimekamilika → sandbox inafutwa (`sbx.kill()`).

### B3. Task ya agent (anapewa nini)
- Server inamwachia **mpango KAMILI** (inasoma `project_plans` yenyewe — si link ya nje: sandbox isiwe na dependency ya network ya Koyeb kwa kila step) + instructions:
  - FUATA hatua 1..N kwa mpangilio; kila hatua: fuata **Instructions**, nakili **Official Data verbatim** (usibuni!), thibitisha **Verification** kabla ya kuendelea; ripoti ya picha pale Verification inahitaji browser.
  - Workflow ya mwisho (kutoka XMD, imethibitishwa): server ya local ndani ya sandbox → Playwright screenshots 4-5 (desktop/mobile/tab2) → `git init + gh repo create "<slug>-<session-short>" --source=. --push` → `npx vercel deploy --prod` → **ripoti ya Kiswahili** (link live + repo + muhtasari wa majaribio + muundo wa faili + picha + mermaid kama inasaidia).
- `MAX_TURNS` (env `CU_MAX_STEPS`, default 60) — kutosha kwa hatua 9-15.
- Zana (kutoka XMD, verified): Bash/Read/Write/Edit/Glob/Grep + `mcp__pw__browser_*` 15 (navigate, click, type, fill_form, press_key, resize, wait_for, console, evaluate, select_option, hover, tabs, back, screenshot, close). `disallowed`: TodoWrite/Task*/WebSearch/WebFetch (mpango ndio mwongozo — si utafuti mpya).

### B4. Mtiririko wa events (usiofeki)
```
bridge (sandbox)  →  @XMD lines  →  njia MBILI (belt + suspenders):
  (a) LIVE: ina-POST kwa Koyeb /api/boardroom/cu-event (token ya run — secret ya ndani)
  (b) FILE: inaandika events.jsonl NDANI ya sandbox (source of truth ya resume)
Koyeb (cu-event):  → persist kwenye session items (Appwrite, cap 24K/event kama XMD)
                   → broadcast SSE (clients wote wa session)
                   → usage → usageLedger + usage chip (Awamu D)
```
- Mtu akifunga browser: run **inaendelea** (server-side); anaporudi — replay ya events zote (session items zipo).
- **Endeleza (resume)**: Koyeb ina-connect sandbox → inasoma `events.jsonl` → inareplay yaliyokosekana → inaendelea ku-sstream. Sandbox ikifa kabisa → ina-create mpya, kusoma plan + yaliyofanyika, kuendelea hatua zilizobaki (hatua zilizokamilika zinarukwa kwa mujibu wa events za exec zilizopo — kama mini-checkpoint).
- Kikomo: run MMOJA kwa wakati kwa session (kama Board — 409 kama kuna nyingine).

### B5. Verification ya Awamu B
- Test halisi wa mtiririko mzima kwenye sandbox halisi (mpango wa "Duka la Matunda la Temeke" — hatua 9, upo) hadi gh push + vercel URL.
- Resume test: run ikatishwa katikati → Endeleza → inaendelea bila kurudia hatua zilizokamilika.
- Fatal test: tokens zote za gh/vercel zikiondolewa → ripoti inasema UKWELI ("deploy haikufanyika — token haipo") — hakuna madai ya uongo (masomo ya R29!).

---

## 4. Awamu C — UI (theme ya Professor-XMD, shimmer zetu, Kiswahili chetu)

### C1. Divider: "XMD COMPUTER" (kipengele kipya)
- Muundo uleule wa **agenda-start mark** (badge katikati + mistari miwili kushoto/kulia) — maneno: **🖥️ XMD COMPUTER**. Inaonekana mara moja baada ya memory-card ya mwisho.
- `LiveStage`: `scope: "computer"` mpya; **StageRail**: hatua ya computer inaonekana (Validator → Mpango → Ripoti → **Computer** → Imekamilika).

### C2. Cards mpya (kama XMD ilivyoiona — ila NYUMBANI kwetu)
| Card | Chanzo (XMD) | Muonekano wetu |
|---|---|---|
| **ThinkingCard** | think_start/delta/end | mawazo yanayotiririka herufi kwa herufi, shimmer, collapsible — actor: XMD Computer |
| **ToolDraftCard** | tool_draft (input_json_delta) | code/command ikimiminika LIVE (shimmer ya kuandika) — kama PlanWriter inavyomiminika |
| **ExecCard** | exec_start/exec_end | read/list/grep/write/edit/bash/git/deploy/server — output capped, ms+, status ok/fail — muundo wa cards zetu za sasa |
| **ScreenshotCard** | shot (kutoka bucket) | picha halisi + label (Desktop 1280×800 / Mobile 375×667 / Tab 2) — lightbox kama ScreenshotModal ya XMD ilivyo, ila theme yetu |
| **GitHubCard / DeployCard** | exec ya gh/vercel | repo link + link ya Vercel live (badge yaani " LIVE") |
| **CUReportCard** | text ya mwisho | ripoti ya Kiswahili — **ReportBody ya sasa (mermaid inarender!)** + links + picha ndogo |
| **CUErrorCard** | cu_error | kosa fatal MOJA tu + Endeleza |

- Hakuna cards za: 503, quota, retry, lane-swapping (uamuzi #7) — hizo ni logs tu.
- Actor wa kila card: **"XMD Computer"** (icon ya monitor, gradient ya kompyuta) — hakuna avatar za optimus/ultron/…

### C3. Session-details card: badges + "Files"
- Badges 4 (Elapsed · 5/5 · Locked · 440.3k Tokens): **font/padding/width zinapunguzwa**; flex container inapanuka kulia; **hakuna horizontal scroll, hakuna wrap mbaya** (white-space: nowrap + gap ndogo).
- **Badge mpya "Files" 📁 mwisho kulia** → click: card YOTE inabadilika kuwa **file-tree view** (files za `/home/user/ws` za sandbox — mti, icon za aina za faili, ukubwa, live wakati run inaendelea — poll / push kwenye file_change event).
- **Back ya simu (Android)**: `popstate`/history state — inarudi kwenye session-details view. (Na back tena inatoka kama kawaida — hakuna trap ya user.)

### C4. exportMarkdown + sessionIndex
- exportMarkdown: kila card mpya ina line zake (thinking collapsed, exec → code block + output, screenshot → link ya bucket, ripoti → doc).
- sessionIndex: session yenye computer phase inaonyesha state (live/stopped/complete) na `hasPlan` etc. zinaendelea kufanya kazi; tokens za computer zinaingia (Awamu D).

### C5. Verification ya Awamu C
- Storybook-style check haiwezekani — tuna-rely kwa: build ✓ + test halisi wa UI (session ya majaribio) + screenshots za ukaguzi wangu (naziweka audit/).
- Back-navigation test kwenye Chrome mobile emulation.

---

## 5. Awamu D — TOKEN ACCOUNTING (kila mahali)

- Event ya `usage` kutoka cuBrain (kila LLM call: lane, model, tokens, ok) → Koyeb:
  - **usage chip** (RESUME JSON v2 usage map): entry mpya `computer` (idadi ya requests + tokens — inaonekana kwenye summary card ya Board kama ilivyo kwa agents 5).
  - **`/api/stats` + Overview + Sessions**: tokens zinaongezwa automatic (zinasoma usage chip) ✅
  - **`/api/usage/accounts`**: Koyeb inasasisha usageLedger (noteGemResult/noteXkiro/… ) kwa kila event — meters za Gemini/XKiro/OR/Groq zinaonyesha calls za computer-use pia (shimo lililozibwa).
- Emergency lanes zina label zao (mf. `computer (XKiro)`) kwenye logs; kwenye UI ni "XMD Computer" moja tu.

---

## 6. Awamu E — APPWRITE STORAGE (bucket — imethibitishwa)

- Bucket: **`6ac2935d0038fbd47d5d`** ("Professor-xmd-company") — public read, upload/view/delete zimeprooviwa live ✅ (faili ya test imefutwa baada ya kuthibitisha).
- Mtiririko: bridge (sandbox) ina-POST screenshot kwa Koyeb `cu-event` (base64, **cap 4MB** kama XMD) → **Koyeb** ina-upload bucket (server SDK) → event inashika `fileId` + `bucketId` tu → UI inasoma URL ya umma (`/storage/buckets/…/files/…/view`).
- **Kwa nini kupitia Koyeb:** keys za Appwrite **HAZIINGII sandbox kamwe** (agent asiweze kuzisoma) — security decision. Gh/Vercel tokens ndizo zinazoingia sandbox (zinahitajika na CLI zao) — hazichapishwi kwenye events/logs kamwe.

---

## 7. MATAUNDU NIMEYAFUNA NA NIMEYAZIBA (audit yangu mwenyewe — "jiulize kama user")

| # | Shimo | Jinsi limezibwa |
|---|---|---|
| 1 | Koyeb restart wakati run inaendelea → handle ya E2B inafa | events.jsonl NDANI ya sandbox = source of truth; re-attach + replay (B4) |
| 2 | Sandbox inakaa hai bila kufutwa → gharama ya E2B | heartbeat wakati run hai; mwisho → `kill()`; fatal → timeout fupi |
| 3 | Calls za sandbox hazionekani kwenye meters za usage | usage event kila call → Koyeb inasasisha usageLedger (A2, D) |
| 4 | gh repo collision kwa re-run | slug + session-short (`<project-slug>-<8char>`) |
| 5 | Exec output kubwa kuvuruga session | cap 24K/event (kama XMD) + screenshot cap 4MB |
| 6 | Agent adai "nimejaribu" bila ushahidi (ugonjwa wa R29) | QA inahitaji ushahidi: screenshot au output halisi kwa kila Verification; ripoti ya mwisho inataja picha zilizopo tu |
| 7 | Plan status `guard_failed` | inaendelea + event MOJA ya taarifa mwanzoni ("mpango una alama za tofauti za data — fuata §2 Official Data") — si kizuizi |
| 8 | Token za gh/vercel zikosekana | agent anaripoti UKWELI (hakuna deploy hakuna link) — hakuna crash wala uongo |
| 9 | Browser zana zisipatikane (Chromium) | template v3 ipo (verified 95 spawns) + --executable-path; MCP isi-download |
| 10 | Mermaid kwenye ripoti ya mwisho | ReportBody ya sasa ina MermaidDiagram — inatumika direct (verified: MermaidDiagram.tsx ipo) |
| 11 | Mtu abonyeze "Files" wakati hakuna sandbox | file-tree inaonyesha state halisi (bado hakuna faili / imekufa — na retry ya kupakia upya) |
| 12 | Events mbili (POST + replay) zirudiane | replay ina-dedupe kwa `(type, i)` idempotency — event ya jsonl ndiyo kanuni |
| 13 | Screenshot ileile inarudiwa (XMD ilikuwa na dedup) | md5 dedupile narration haipotei — logic ya XMD inabebwa |
| 14 | E2B account quota/credit ikiisha mid-run | fatal card moja + Endeleza (sandbox mpya inaendelea) — na log ya wazi |

---

## 8. SHERIA (haziguswi — masomo yetu)

1. Board flow iliyopo **haivurugwi** — computer-use ni phase MBELE ya maamuzi (mjalada/Mpango/Ripoti haviguswi).
2. Resume **kwa "Endeleza" pekee** (kanuni ya R20+) — sandbox + events.jsonl wanarudisha kila kitu.
3. **Logs kila hatua** (kama R30): sandbox create/connect, brain lane changes (emergency!), kila exec, upload za bucket, gh/vercel, mwisho.
4. Tests + `tsc` + `next build` lazima zipite kabla ya push; push kwenda **v3** (auto-deploy Koyeb).
5. Keys ZOTE (E2B, Gemini ×2, gh, Vercel, Appwrite) — `.env.local` tu, hazitoki nje, hazitawi commit. Appwrite keys hazijaingi sandbox.
6. Data za zamani haziguswi. Mama Lishe A6 inabaki UNRESOLVED. Hakuna gemma/HF.
7. **DATA RASMI ni sheria** — agent anapewa §2 verbatim + "never invent".
8. UI ya XMD (mwili) HAINGII — logic pekee; theme/shimmer/Lugha zetu.
9. Computer-use inakwisha → session status "completed" + summary card (tokens zote, pamoja na za computer).
10. **Backup za files KABLA ya kila push** (kopi kwenda `backups/R31/step-<X>/` + tarball ya pre-A), kisha push kwenda **v3 pekee** kwa SSH key yetu (`~/.ssh/id_ed25519_github`) — origin (v2) HAITAGUSWI kamwe.

---

## 9. HATUA ZA UTEKELEZAJI (mpangilio + kikomo cha kila moja)

| # | Hatua | Inatoa | Verification |
|---|---|---|---|
| A | `cuBrain` (Python proxy ndani ya sandbox): lanes Gemini, emergency XKiro→OR→Groq→nyingine (akili kubwa→ndogo), 503-silent, Pacific reset, usage events | module + unit tests | tests za mpangilio/suppression/reset ✅ + live 3 calls |
| B | Bridge (adaptation ya claude_bridge.py): events zetu (think/tool_draft/exec/shot/usage), events.jsonl, POST cu-event, plan ingestion + workflow ya mwisho | bridge + endpoint `/api/boardroom/cu-event` | run ya majaribio kwenye sandbox halisi |
| C | Engine (boardRunner): trigger baada ya memory, sandbox lifecycle (create/connect/heartbeat/kill), resume (Endeleza), fatal handling | phase "computer" kamili | resume test + fatal test |
| D | UI: divider "XMD COMPUTER", cards 7 mpya (theme+shimmer), StageStream/Rail/exportMarkdown/sessionIndex, badges ndogo + badge "Files" + file tree + back ya simu | UI kamili | build + screenshots za ukaguzi + mobile back test |
| E | Tokens: usage chip `computer`, stats/Overview/Sessions, meters za accounts | accounting kamili | namba zinapatikana kila mahali (kuilinganisha na events) |
| F | Bucket: upload via Koyeb, URL za umma kwenye cards, dedup | screenshots live | upload/view/delete imeprooviwa + card inaonyesha picha halisi |
| G | Ukaguzi wa mwisho: run KAMILI ya "Duka la Matunda la Temeke" (hatua 9) kwenye production → GitHub + Vercel + ripoti + picha + tokens | session kamili ya kumbukumbu | CEO anapima kwenye simu 🔥 |

**Kila hatua ina: code + logs + test + commit moja maalum + push v3 (auto-deploy). Hakuna hatua inayovuka nyingine bila ile ya nyuma kupita.**

---

## 10. NINI KINABAKI NJE (out of scope)

- UI ya XMD (CopilotKit/LeanApp/ui_dist) — inatupuliwa, haiingii.
- Preview panel ya localhost/Site — haiingii (uamuzi #11).
- OpenHands mode + xmd_lean.py (local mode) — haihitajiki.
- Termux launcher (xmd.mjs) — Koyeb ndiyo launcher.
- Chat Room kuwa na computer-use — baadaye (sio sasa).
- Kubadilisha mjadala/Lock/Mpango/Ripoti — miguso HAPANA.

---

## 11. MAHITAJIJI YAKO (baada ya idhini)

**Hakuna kitu kipya — kila kitu kipo tayari:**
- ✅ Bucket ID + jina (ulipa — verified full functioning)
- ✅ Template v3 (verified ready)
- ✅ Tokens zote kwenye `.env.local` / `.env` ya XMD (naziweka mwenyewe — E2B, Gemini ×2, gh, Vercel)
- 🔲 Idhini yako ya mpango huu ("ANZA") — na baada ya G, upimaji wako wa mwisho kwenye simu

---

*Imeandaliwa kwa ukaribu wa files halisi za XMD3 (zimesomwa zote: xmd.mjs, server.mjs 685, claude_bridge.py 456, openhands.mjs, ui structure) na ukaguzi halisi wa bucket + template. Hakuna code iliyoguswa.*
