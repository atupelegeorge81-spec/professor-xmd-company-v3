# R38 — DEEP INSPECTION v2 (USHAHIDI 100%, hakuna makadirio)

**Session:** 6ac78bc6 "Multi-Dashboard BI Platform Specification" (08-10, 12:25–~14:00) · tokens 2.64M · cu events hadi i=905.
**Ushahidi uliotumika:** (1) live probe ya Gemini API kwa model ZOTE × accounts ZOTE (requests halisi), (2) session items 336 kamili, (3) usomaji wa code ya brain.py/bridge/engine line-by-line, (4) 429 body halisi ya leo iliyotestwa dhidi ya classifier ya brain.py.

---

## 1. QUOTA YA GEMINI LEO (ulichoagiwa kwanza) — live probe, 08-10 ~15:10 EAT

| Model | gemini-1 | gemini-2 |
|---|---|---|
| gemini-3.8-flash | ✅ 200 | ✅ 200 |
| gemini-3.7-flash | ⚠️ 503 high demand | ✅ 200 |
| gemini-3.6-flash | ⏱️ timeout | ⚠️ 503 high demand |
| gemini-3.5-flash | ✅ 200 | ✅ 200 |
| **gemini-3-flash-preview** | ❌ **429 QUOTA YA SIKU IMEISHA** — quotaId=`GenerateRequestsPerDayPerProjectPerModel-FreeTier`, **quotaValue=20/day**, retryDelay=34170s (~9.5h) | ✅ 200 |
| gemini-2.5-flash | ✅ 200 | ❌ 404 (haipatikani kwa akaunti hii) |
| gemini-3.5-flash-lite | ✅ 200 | ✅ 200 |
| gemini-3.1-flash-lite | ⏱️ timeout | ⚠️ 503 high demand |

**Hitimishu:** Gemini HAIJAISHA kwa ujumla — model 7/16 zina 200 OK. Ilimalizika **model MOJA tu** (3-flash-preview@gemini-1, 20 requests/day FreeTier) — nayo ni lane ya "preferred" ya CU run. Vilevile: 503 "high demand" si quota; ni mzigo wa Google (temporary).

---

## 2. LOGIC YA UTAFUTAJI WA MODEL — inafanya kazi (ushahidi)

**Classifier ya 429 (brain.py `parse_gem_error`):** nime-test na 429 body halisi ya leo — quotaId ina "PerDay" → inaclassifiwa **"daily"** → lane inawekwa izima hadi Pacific midnight. ✅ Sahihi.

**Mzunguko wa lanes (session items — kila call ina rekodi):** run nzima ilionyeshwa rotation sahihi: mwanzoni [195-197] 3.6-flash@g2 + 3-flash@both zilifeli → [198] 2.5-flash@g1 ilichukua; katikati i=82/83 fails → switch; mwishoni 752/788/868 fails → 2.5-flash@g1 + 3-flash@g2 zilichukua. **Hakuna wakati ilipotea bila kujaribu lane nyingine.** ✅

**Lakini kuna BUG MOJA HALISI kwenye logic (root cause #1 — tazama §3).**

---

## 3. ROOT CAUSE ya "Gemini inathink tu, hakifanyi chochote" — IMETHIBITISHWA kwa code + data

**Ushahidi wa data:**
- Rekodi ya mwisho ya usage: i=872 (3-flash-preview@g2 OK).
- Baada yake: thinks 4 (i=877, 887, 896, 905) — **HAKUNA usage record hata moja** (usage inarekodiwa kila call inapokamilika AU kufeli — hata fail inaandikwa).
- Hakuna error, hakuna run_end, hakuna paused_quota. Sandbox sasa ipo **Paused** (E2B auto-pause ya idle — imethibitishwa: connect inarudisha "Paused sandbox … not found").

**Ushahidi wa code (brain.py `open_stream`, mstari ~920-944):**
```python
for raw in resp:
    if not line or not line.startswith("data:"):
        continue                      # ← (A) non-data lines ZINARUKA idle-check
    last_data = time.time()           # ← (B) inasasishwa SASA
    ...
    if time.time() - last_data > IDLE_ABORT_MS/1000:   # ← (C) diff ≈ 0.0001s — HAIWEZI kambe kuwa > 180s
        raise LaneError("busy", ...)
```
- (B) inasasa `last_data` MARA MOJA kabla ya (C) → check ni **DEAD CODE** hata kwa data lines.
- (A) SSE keep-alive/ping lines (": ping", mistari tupu) zinazidi ku-iterate bila check → **hang ya milele bila kosa wala rekodi**.
- Socket ikiwa kimya KABISA: urllib timeout=30 → transient → lane switch (hiyo inafanya kazi) — kwa hiyo hang inawezekana tu kwenye **stream inayotuma pings/trickle bila content**.

**Mnyororo kamili (100% consistent na kila artifact):** Call ya mwisho ilianza → 4 thinking blocks zilitiririka (i=877-905) → stream iliisha kutuma content lakini connection iliendelea (pings/trickle) → idle-check (dead code) haikuwahi fire → hakuna completion, hakuna error, hakuna usage record → CLI ilisubiri brain milele → E2B ili-pause sandbox (idle) → UI ikabaki "Thinking". Kila kitu kiko sawa na data.

---

## 4. HATUA YA KWANZA YA AGENT (workspace) — uliuliza

Ushahidi (items 199-217): Agent KWELI alianza na workspace — [199] think "Initiating Clarion's Foundation — my first task is the monorepo" → `pnpm init -y --workspace` → **iliangukia mazingira ya sandbox**: pnpm haipo (exit 127 [200]) → `npm install -g pnpm` → permission denied [206] → fix ya `~/.npm-global` + PATH (steps 2-4) → step 5 monorepo+tokens zikajengwa. Hakuna hatua aliyo-ruka; ilipoteza zamu 3-4 kurekebisha mazingira (pnpm) — si kosa la logic ya utafutaji wa model.

---

## 5. ILE "AUTO-PAUSE" YA DISCUSSION (wakati wa Mpango Kazi) — imethibitishwa ni kifo cha process

Chips [179] "Mpango Kazi — Kipande 1/2" → (hakuna chip yoyote ya pause/error) → [181] "♻️ Board Room imeendelea" + [182] "Mini-report ya A3 ilikuwa fupi (fallback — LLM haikupatikana wakati huo)" + [183] "♻️ Endeleza: vipande vilivyokamilika havirudwi" → [184] "Kipande 2/2". Hii ni njia ya REHYDRATE (R16.1/R18) — inawaka TU process ikifa na kuanza upya. **Process ya server ilikufa katikati ya kuandika work-plan.** Cause kamili (OOM/restart) haiwezi kuthibitishwa — Koyeb logs API inarudisha 404. Recovery ilifanya kazi (work-plan + ripoti zilikamilika baada ya kuendelea). ✅ Ulikubali ni server issue — suluhisho tazama §7.

## 6. PAUSE YAKO (computer) — imethibitishwa + BUG iliyoonekana

Ulipause wewe (baada ya kuona thinking bila kitu). Pause ilitoa chip [243] "hakuna agent anayeendelea" — **ila CU agent ILIENDELEA** (events ~600 baada yake, mpaka i=905). Ushahidi: `pauseRun()` inasimamisha Board loop tu; `cu-event` route + `handleCuEvent` hazina check ya `runner.status === "paused"` kabisa. Chip inadanganya.

---

## 7. ROOT CAUSES KAMILI + FIX (zinasubiri ruhusa)

| # | Root cause | Ushahidi | Fix |
|---|---|---|---|
| RC1 | **Idle-check ya stream ni dead code** (brain.py) → stream ya pings/trickle inahanga milele bila kosa/rekodi → "thinking forever" | code (B-before-C, A-continue) + 0 usage records baada ya i=872 + sandbox paused | (1) idle-check kwenye KILA iteration (pamoja na non-data) kwa `last_data` halisi; (2) deadline ya jumla ya stream (mf. 5min); (3) watchdog ya bridge: hakuna event kwa dakika 4 → fatal/pause na sababu (si kimya) |
| RC2 | **Supply: 20 req/day FreeTier kwa model moja** (3-flash-preview@g1) ililiwa na session ya 2.64M tokens (CU pekee 730K) | live 429 (quotaValue=20, retry 9.5h) | (1) RC1 fix inazuia kupoteza muda kwenye streams; (2) chaguo: punguza R37-C (window 16→12, results 12→10) au baki (logic ya rotation inafanya kazi; kikomo halisi ni FreeTier) — uamuzi wako |
| RC3 | **Kifo cha process ya Koyeb katikati ya work-plan** (ndiyo "ilijipause yenyewe") | chips rehydrate pattern [179]→[181]; logs 404 (cause haiwezi thibitishwa) | Maelewano: (a) endpoint ya keep-alive/heartbeat + kupima, (b) Koyeb plan/instance kubwa (uamuzi wa gharama), (c) Kazi ya recovery tayari inafanya kazi — hasara ilikuwa ndogo |
| RC4 | **Orphan think cards** (adapter.ts:1197 — think_start haifungi card iliyotangulia) | thinks zilizo-duplicate [311]/[314], [328]/[329] | mstari mmoja: funga orphan kwenye think_start |
| RC5 | **Pause haishiki Computer** | events ~600 baada ya chip [243] | pauseRun ikuta CU hai → snapshot + kuzima sandbox (njia ya quota-pause ipo tayari); Resume inarejesha |

**Kumbuka:** sandbox i8enconulojjgoyqrtw6v ipo Paused kwenye E2B (haiwezi ku-resume na SDK 2.8.0; brain-usage.jsonl ya ndani haipatikani) — ushahidi wote hapo juu umetoka kwenye data ya session + live API + code, si kutoka sandbox.

**Pia (dogo):** /api/usage/accounts ina-hang >90s (health ni 0.4s) — inayopaswa kuangaliwa baadaye.
