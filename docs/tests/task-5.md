# Task 5 (maelezo5) — Orphan recovery: session iliyobaki "inaendelea" baada ya crash inarudi yenyewe

Branch: `task/5-orphan-sweeper` · main `abf222a` (deploy `c1e287c7`) + `aa97ee7` (deploy `36bfb80e` HEALTHY) · 2026-10-17

## Kilichotekelezwa
- `sweepOrphans(force?)` (src/lib/cu/autoResume.ts). Sessions 10 za karibuni (bila completed/error/finale_incomplete/stopped).
  ORPHAN = masharti YOTE yafuatayo:
  - status ni ya kazi inayoendelea. **Uamuzi wa CEO (A):** `running` + `title_created|agenda_created|facts_locked|report_saved|plan_saved|agenda_N_(locked|open|mini|mini_resume)|report_part_*|plan_part_*`;
    kwenye code `running` huwekwa TU awamu ya Computer.
    **Uamuzi wa CEO (pengo la SIGTERM):** pia `paused` ya SYSTEM bila `resumeAt`;
  - hakuna runner hai (`findRunner(sessionId)` au `findRunner(resumeState.runnerId)`);
  - `updated_at` imepita `ORPHAN_STALE_MS` = 10 dk (`XMD_TEST_ORPHAN_STALE_MS` inafanya kazi TU na `XMD_TEST_HOOKS=1`);
  - ina resume state (`__PROFESSOR_XMD_RESUME_STATE__`, au CU chip yenye sandbox/snapshot).
- Orphan → `status=paused`, `pauseOrigin=system`, `resumeAt=now+60s` (CU chip ikiwa awamu ya Computer, vinginevyo resume state), na chip
  `♻️ Recovered after crash — auto-resume in 60 s`. Sweeper HAIENDELEZI yenyewe: timer moja → `checkPausedDue(true)` (njia iliyopo).
- HAIGUSWI: completed · error · finale_incomplete · stopped · user-paused (Detach) · paused yenye resumeAt · runner hai · status isiyojulikana.
- Callers: `instrumentation.ts` (boot +20s, tick 10 dk) na `GET /api/boardroom/active` (throttle 60s). Session isiyo na runner ambayo bado
  ni "fresh" → sweep nyingine inapangwa itakapopitwa na muda (haisubiri tick ya dk 10).
- Log: `[orphan] <id8> stale <min>min -> recovered` / `-> skipped (<reason>)`.

### Marekebisho ya ziada (yalihitajika ili recovery ifanye kazi kweli; idhini ya CEO kwa 2 na 3)
1. **`checkPausedDue` haikuwahi kuona chip yoyote baada ya reboot:** items huhifadhiwa `gz1:` (≥16k), lakini code ilitumia `Array.isArray(d.items)`.
   Sasa inatumia `itemsOfDoc` (unpack).
2. **`cu-event` → `orphanPersist` ilifuta chips zote zilizofichwa** (resume state + CU state) kila tukio la bridge lilipofika bila runner hai.
   Ilithibitishwa kwenye production (G1) na sasa chips zinabaki.
3. **SIGTERM (restart/redeploy) awamu ya mjadala** iliacha `paused/system` bila `resumeAt`, na hakuna kitu kilichoiendeleza. Sasa sweeper inaishughulikia.
4. **Next.js hupakia `autoResume.ts` mara 2** (bundle ya instrumentation + route): sweeps na auto-resume zilitokea mara mbili (smoke 1).
   Sasa hali (inflight/throttle/timers) iko kwenye `globalThis`, pamoja na kizuizi cha sweep sambamba.

## Unit tests — `src/lib/cu/orphan.test.ts` → 24/24 PASS
Status allowlist · decideOrphan (masharti yote, runner hai, fresh, bila resume state, CU chip, user-paused, completed/stopped, computer done)
· markRecovered (mjadala + Computer) · pauseMetaOf · itemsOfDoc (gz1/JSON/array) · hook inert bila env · paused/system bila resumeAt (6)
· nakala 2 za module zinashiriki hali.

## Real tests — server halisi (next dev ya ndani, Supabase halisi, XMD_TEST_HOOKS=1, XMD_TEST_ORPHAN_STALE_MS=30000, R43_WATCHDOG=off kwa RAM ya 2GB)
**T1 — recover baada ya kill -9** (`4d8491e8`, brief `xmdtest-orphan`):
```
before kill  status=plan_part_1 resume_state=true done=[1]        (Optimus anaandika Mpango Kazi; stream curl exit 18)
KILL -9 09:58:11 · RESTART 09:58:19
[orphan] 4d8491e8 stale 0.8min -> recovered
DB: status=paused pauseOrigin=system resumeAt=09:59:47Z + chip "♻️ Recovered after crash — auto-resume in 60 s"
[cu/autoResume] ♻️ 4d8491e8… imeanza tena (auto-resume).
DB 10:00:18: status=plan_saved items 21→27 · chip "♻️ Endeleza: inakamilisha Mpango Kazi wa Agent · Ripoti…" (agenda 1 HAIKURUDIWA)
```
**T3 — runner hai haiguswi:** `PATCH updated_at = -60min` (DB halisi) → `[orphan] 4d8491e8 stale 60min -> skipped (live runner)`; status/updated_at hazikubadilika.
**T4 — completed haiguswi:** `173f0435` (completed, saa 2, ina resume chip) haikuorodheshwa; status/updated_at hazikubadilika.
**T5 — bila resume state:** `57042eb6` (running, saa 2) → `[orphan] 57042eb6 stale 121min -> skipped (no resume state)`; haikubadilishwa.
**T2 — user-paused haiguswi** (imerudiwa kwa code ya mwisho aa97ee7; `832fd253`): Detach → `paused pauseOrigin=user` → kill -9 → restart →
`/active` kila dk kwa dk 5+:
```
[orphan] 832fd253 stale 0.8min -> skipped (user paused)   … 2.5 · 3.5 · 4.6 · 5.6min -> skipped (user paused)
DB baada ya dk 5.6: status=paused pauseOrigin=user updated_at=11:07:22 (haikubadilika) · hakuna auto-resume
```
(Jaribio la kwanza la T2 lilifichua pengo 2 hapo juu: Detach wakati CU inaanza → orphanPersist ilifuta resume state.)
**G1 — cu-event inabakiza chips:** production ya ZAMANI (fb57bb0): resume_state true → tukio 1 la orphan → **false** (bug).
Ndani (fix): resume_state true → matukio 2 → **true**, items 2→4.
**G2 — paused/system bila resumeAt:** `bfdc1f08 stale 120.7min -> recovered` (resumeAt +60s + chip); `67cba953` (user) `-> skipped (user paused)`.

## Smoke — Koyeb (production)
- Boot ya deploy mpya: `[orphan] 88ef0a2d stale 9788min -> skipped (paused (not system))` — session HALISI ya zamani haikuguswa.
**Smoke 1 — redeploy kupitia API wakati agents wanaongea** (`995d7f4a`, deploy d7f3356b):
```
10:28:27 redeploy (status agenda_1_locked)
10:29:07 [orphan] 995d7f4a stale 0.6min -> skipped (fresh)    ← instance MPYA, ya zamani bado hai (deploy overlap): staleness ilizuia "wizi"
10:29:28 [watchdog] SIGTERM → DB: status=paused pauseOrigin=system resumeAt=-   (pengo 2 halisi)
10:39:35 [orphan] 995d7f4a stale 10min -> recovered
10:40:38 [cu/autoResume] ♻️ 995d7f4a… imeanza tena  → status report_saved → running (CU) · runner MMOJA (chip 1 ya "imeendelea")
```
Ilionyesha kwamba sweep na auto-resume zilitokea mara 2 (fix 4).
**Smoke 2 — deploy ya fix 4 wakati wa awamu ya Computer** (deploy 36bfb80e):
```
10:47:00 SIGTERM · bridge ya E2B iliendelea: finish/run_end vimehifadhiwa kwa orphanPersist (chips zimebaki) → session "fresh" mpaka 10:48:39
10:58:44 [orphan] 995d7f4a stale 10min -> recovered          (mara MOJA)
10:59:47 [cu/autoResume] ♻️ 995d7f4a… imeanza tena            (mara MOJA)
CU: run_end COMPLETED_UNVERIFIED · "🖥️ XMD Computer: completed, NOT yet verified — ripoti"
```
- Usafi: sessions/reports/ledger za majaribio zimefutwa (find.mjs → 0); sessions 9 + plans 9 halisi hazikuguswa.

## Baselines (baada)
tsc 0 · vitest 261 passed + 2 skipped (237 za awali + 24 mpya) · unittest 238 OK (SDK imerudishwa baada ya restore) · eslint (files zilizoguswa) 0.

## Dhana ya instance MOJA
Instance mbili zikiendesha sweeper, moja ingeweza kuiba session ya nyingine. Runner hai + staleness ya dk 10 vinapunguza hatari hii
(smoke 1: wakati wa deploy overlap instance mpya iliona `fresh` na haikugusa), lakini HAVITOI kabisa.

## Known issues (nje ya wigo — kwa uamuzi wa CEO)
- Baada ya resume ya awamu ya Computer (smoke 2), status ya session ilibaki `running` ingawa CU chip ni `done=true` / COMPLETED_UNVERIFIED.
  Sababu inayowezekana: `schedulePersist` ya engine huandika "running" (fire-and-forget + timer 2.5s isiyofutwa na `finishComputer`) baada ya `completed`.
  Sweeper inairuka salama (`computer done`).
- `POST /api/boardroom/cu-event` njia ya orphan haina auth (mtu yeyote anaweza kuongeza tukio kwa session isiyo na runner hai).
  Fix 2 inazuia kufutwa kwa hali, lakini auth haijaongezwa.
- `findRunner` inahesabu runner aliyemaliza (bado yuko memory) kama "runner hai", kama spec inavyosema. Hii ni salama (inaruka, haiibi).
- Default ya production ni dk 10: crash → recovery ~dk 11 baada ya update ya mwisho (bridge ikiendelea kutuma matukio, inasubiri inyamaze).
