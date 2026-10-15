# TASK 1 — PauseOrigin (evidence) · LIVE ya Koyeb (2026-10-15 UTC)

Baselines (isha nafasi baada ya mabadiliko, commit 57cf7ac):
- tsc --noEmit: **0 errors**
- vitest: **183/183 PASS** (18 files)
- python unittest: **186/186 OK** (run moja ya kwanza ilipata flake 5/19 — rerun OK; sio kuhusiana)

Environment: Koyeb app `professor-xmd` (deployment af92b000+), v3/main=57cf7ac,
env: XMD_TEST_HOOKS=1 + XMD_TEST_SECRET (hall of docs mlasts). Public hook URL:
`POST /api/_test/system-pause` (rewrite → /api/xtest/*; `_folda` haziruti kwenye App Router —
ushahidi: node_modules/next/dist/build/entries.js `ignorePartFilter: (part)=>part.startsWith('_')`).

- **T0** — imeruka: hook hakuwepo pre-change (46d27c1); bug iko historically (screenshots za CEO, resume storms). Rejesha hwovu.
- **T1 user Detach stays paused (PASS)** — run `t4w1jmfp`/sid `0b08e7a3`, Detach 20:22:04 →
  `/active` paused, buffer la mwisho lina pause-chip 20:22:03 pekee, DB `boardroom_sessions.status=paused`,
  hadi 20:41+ hakuna tukio (19 min > 6 min ilivyohitajika).
- **T2 system pause during user pause (PASS)** — sid `7babf8cc` user-paused; hook `resumeMs=20000`
  20:59:44 → 21:00:14/21:00:44/21:01:14 = `paused` tena; hakuna resume.
- **T3 system pause recovers (PASS)** — resume (CEO) 21:01:38 → hook(20s) 21:01:39 → paused 21:01:51 →
  **running 21:02:06** (~20s) na bado running 21:03:07.
- **T4 bug mkuu (PASS)** — hook(30s) 20:56:33 → paused 20:56:36 → DETACH 20:56:40 (ok:true);
  timer ilifaulu 20:57:06; `/active` bado paused 20:57:22/20:57:48/20:58:14/20:58:44; log:
  cooldown pekee — HAKUNA resume/autoResume baada.
- **T5 restart while user-paused (PASS)** — redeploy (d6221dd1→af92b000) ilisikiliza old instance
  20:44; baada ya boot: `/active` null/null, DB status=paused (boot-scan haku-resume) →
  POST resume 20:45:30 → runner huo huo `t4w1jmfp` running, token zikichuruzika kutoka hapo hapo.
- **T6 SIGTERM while running (REPORTED, sio fix)** — redeploy 21:03:24, SIGTERM 21:07:05
  ("[watchdog] 📜 SIGTERM … runner anahifadhiwa kama paused (auto-resume +60s)"), ila DB status
  ilibaki `agenda_2_mini` (persist ya discussion haifikii neema ya ~1.5s) → checkPausedDue inaruka
  (kawaida: `!resumeAt` / status si paused). Baseline ilikuwa hivyo hivyo pre-change → imerejelewa, HAISAHISHWILI.
- **T7 Resume clears origin (PASS)** — baada ya resume ya 20:45, hook(20s) 20:46:11 → paused 20:46:18 →
  auto-RESUMED 20:46:31 (log `[watchdog] resume · mjadala umeendelea pale pale`).
- **T8 CU-chip paths (PASS)**
  - system + resumeAt past → **resumes**: organic `[cu/autoResume] ♻️ 0b08e7a3… imeanza tena` 20:48:09 + 20:50:06.
  - chip crafted `pauseOrigin:"user"` + resumeAt past → **harudi** (row `xmdtest-chip-user0` baki paused
    tick 6+ za /active kati ya 21:10–21:12).
  - chip crafted `resumeAt:0` → **harudi** (`xmdtest-chip-zero` baki paused). + T1 (discussion detach isiyoparti).
- **Post-deploy smoke (PASS)** — = T1+T5 juu ya URL live: Detach → 19 min → Resume → inaendelea. Session zimifutwa.

Cleanup: sessions xmdtest (`0b08e7a3`, `7babf8cc`) + rows (`xmdtest-chip-*`) ZIMEFUTWA (DB inalinda sessions za CEO).
