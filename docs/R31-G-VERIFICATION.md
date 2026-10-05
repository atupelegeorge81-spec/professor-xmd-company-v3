# R31-G: UTHIBITISHO WA COMPUTER-USE (REAL BOARD TEST) — ✅ IMEPITA

**Tarehe:** 04–05/10/2026 · **Deploy:** `392b2c1` (Koyeb fra, HEALTHY) · **Session kamili:** `6ac2d0f0c9c480927e99`

## Matokeo ya mwisho — session NZIMA imepita end-to-end

| Awamu | Matokeo | Uthibitisho |
|---|---|---|
| Board (agenda 4) | ✓ | ripoti 19,486 chars · memory 5/5 · mini-reports · evidence gate |
| Awamu ya XMD (auto) | ✓ | ilianza YENYEWE @516s hakuna kitufe |
| Sandbox E2B (Koyeb-fra) | ✓ | `i8mllkph…` — 403 fix ilifanya kazi tena |
| Stream open KABISA | ✓ | 788s moja kwa moja (board+CU+summary) — await fix |
| Events LIVE (POST→cu-event) | ✓ | run_start/exec×20/shot×2/github×2/deploy×2/finish/run_end — zote zilifika Appwrite |
| Shots → bucket | ✓ | Desktop 1280×800 (55KB) · Mobile 375×667 (44KB) — cu-file route HTTP 200 image/png |
| GitHub | ✓ | https://github.com/Professor-xmd-company/temeke-fruit-shop (push halisi) |
| Vercel | ✓ | https://temeke-fruit-shop.vercel.app (HTTP 200 · "Duka la Majaribio la Temeke" · simu/anwani sahihi) |
| Ripoti ya CU (document) | ✓ | 3,746 chars · Kiswahili · links + muhtasari wa QA |
| Session status | ✓ | **completed** (sio finale_incomplete) |
| Tokens za CU | ✓ | usage chip: computer {requests 21 · tokens 601,377} pamoja na agents 5 |
| Summary + done BAADA ya CU | ✓ | usage imejumuisha computer · done event @787s |

CU tokens: 30 LLM calls · 601,377 (gemini flash + 2.5-flash fallback). Board: ~233k (Gemini) + emergency (XKiro/Uno) baada ya quota.

## Safari ya G — bugs 3 zimegunduliwa+zimetekiwa (zote kwenye real test)

### Bug 1 — stream ilifunga mapema (d890a8e)
`run()` ilirudi kabla CU kumaliza → Koyeb free lililala (hakuna connection) → runner+watchdog zikapotea → events 394 hazikufika.
**Fix:** engine `phaseDone/phaseResolve` — `run()` ina-await awamu nzima ya CU (launch+attach, cap CU_HARD_CAP_MS 30min) → connection inabaki hai.

### Bug 2 — orphanPersist ilifeli daima (d890a8e)
bridge.py haikuweka `session` kwenye POST body → `ok:false` → events zote za CU zilikuwa orphan.
**Fix:** bridge inatuma `session`; cu-event route: ORPHAN_KEEP filter (run_start/exec/github/deploy/finish/error/run_end/files) + dedupe.

### Bug 3 — thought_signature 400 = kifo cha brain (392b2c1)
Real test #2 (live, stream open 408s): agent alijenga kazi YOTE (gh+vercel ✓) akafa kabla ya ripoti — tool_call MOJA ya history ilikosa signature → Gemini 3.x inakataa → 400 = fatal → 529 → CLI error. (Lane za 2.5-flash zilikuwa zimekwisha quota — hazikuweza kumuokoa.)
**Fix (cu/brain.py):**
- classify_error: 400 + `thought_signature` → kind `signature` (SI fatal)
- recovery: handle() inapokutana nayo → calls zote za history zisizo na signature zinaondolewa (tool_use → text note, tool_result zake zinatupuliwa) → lanes zinarudiwa na history safi — kazi inaendelea
- signatures zina-hifadhi disk (`brain-signatures.json`) — brain/bridge ikianza upya (resume) history ya zamani ina signatures
- engine: text ya "API Error …" ya CLI si ripoti — haihifadhiwi kama report
- tests mpya 3 (classify/translate-drop/unsigned-ids) → python 40/40 · vitest 56/56 · tsc ✓

## Kumbuka (backlog, si blockers)
- Agenda-count bado prompt-borne (session ya kwanza: 7 badala ya 1; ya pili: 4×2)
- run #1 ilibaki `finale_incomplete` kwa sababu ya bug 1+2 (kazi yake ipo GitHub `temeke-majaribio` + vercel `temeke-majaribio.vercel.app` — session ya mwisho ndiyo halisi: `temeke-fruit-shop`)
- Repo za majaribio kwenye GitHub org + Vercel projects — user anaweza kuzifuta
- finish "report" = text ya mwisho ya agent (sio document ndefu kamili) — quality ya content inatosha, muonekano ni document ✓
- futa `cu-ping` route baada ya G (diagnostics)

---

## G2 — UI ya awamu ya CU = TIMELINE (agizo la CEO 05-10) — commit `5b64eb3`

Kosa kikubwa liligunduliwa na CEO: kila kitu cha CU kilikuwa kimefungwa ndani ya card KUBWA
moja. Imerekebishwa kama xmd3:

- **Card ya "XMD Computer"** = card ya HALI/maandalizi ya e2b tu (task, status, step,
  tokens, Files badge) + divider mpya `XMD COMPUTER` (mtindo wa agenda-start).
- **Maneno ya agent** yanamiminika KAWAIDA kwenye mkondo — hakuna avatar, hakuna bubble;
  markdown + MERMAID inarender (`cuText`).
- **Kila kitendo card yake kama xmd3** (muundo+tabia+shimmer KAMA ZILIVO, rangi tu za
  company dark theme): thinking card (`Inafikiri…` shimmer → `Alifikiri (Xs)`),
  terminal card (traffic lights + `$` + output, exit badge), file write/read (skeleton),
  screenshot (scan line → flash + modal zoom), GitHub card, Live card, error card.
- Draft ya command inamiminika kwenye exec card (`tool_draft` → `exec_start` → output → end).
- Replay ya session ZA ZAMANI inarender timeline ileile (engine items zipo tayari).

Uthibitisho (Playwright, headless): page ya maonyesho na data halisi + **session ya CEO
yenyewe 6ac2d4fc kwenye LIVE app** — divider ✓ status card ✓ exec cards 9/9 ✓ error card
✓ Files badge ✓ mermaid svg ✓ picha 2/2 kutoka bucket ✓ modal ✓ shimmer live ✓ console
0 errors. Screenshots: `audit/r31g/ui-preview-done.png · ui-preview-live.png · live-user-session-timeline.png`.

Tests: vitest 60/60 (timeline mpya ya adapter) · tsc ✓ · build ✓.
