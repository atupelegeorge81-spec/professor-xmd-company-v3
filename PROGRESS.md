# PROGRESS — maelezo pack (maelezo0.md rules)

## TASK 1 (maelezo1.md) — PauseOrigin · DONE ✅ (2026-10-15 UTC)

Branch: `task/1-pause-origin` (commits 6409702, 1fd4435) → merged into v3 main = **57cf7ac**.
Deployed: Koyeb `professor-xmd` af92b000 → 44398457 (env change), smoke LIVE PASS.

Impl (6 files + next.config.mjs):
- `PauseOrigin = "user" | "system"` kwenye `Runner` (boardRunner.ts) + `CuChip` (engine.ts); hakuna
  column mpya ya DB (resume-state chip JSON inabeba pauseOrigin kwa discussion phase).
- `pauseRun(id, origin="user")`: system→user upgrade ni STICKY — resumeAt=0, systemResumeTimer +
  `__xmdWdtResumers` (watchdog) + `cancelAutoResume` zinafutwa, chip + persist via cuHooks (CU tu).
- `unpauseRun(r, by)` / `resumeRun(id, by)`: `by==="system"` + origin user → refuse/`"user_paused"`.
- `scheduleAutoResume`: timers kwenye Map ya globalThis (`__xmdAutoResumeTimers`), `cancelAutoResume`,
  fire-time re-check ya origin ya runner.
- `checkPausedDue`: skip `chip.pauseOrigin==="user"` au `!resumeAt`.
- watchdog cooldown/SIGTERM = origin "system"; user-paused haigusiwi; `runSystemPauseForTest` (test-only).
- Test hook: `POST /api/_test/system-pause` — inafanya kazi TU na `XMD_TEST_HOOKS=1` + header
  `x-xmd-test: $XMD_TEST_SECRET`, sivyo 404. NB: App Router haiteini `_folda` → rewrite kwenye
  next.config.mjs `/api/_test/* → /api/xtest/*` (file: `src/app/api/xtest/system-pause/route.ts`).
  `XMD_TEST_SECRET` iko `/home/user/SECRETS-KEEP/xmd-test-secret` (Koyeb env vars zimewekwa).

Baselines (mwisho): tsc 0 · vitest 183/183 · python 186/186.
Known noise (HAIFANYI kazi mpaka zichunge): container /tmp imejaa (TMPDIR workaround),
python run ya kwanza ilipat flake order-dependent (rerun OK), pause ya T4 kuashiria 404 mara moja
iliyofuatishwa na infra (scale-to-zero wake+cu transitions) — T4-real ilitokata bila shaka.

Evidence: `docs/tests/task-1.md` (T1–T8 + smoke zote PASS, Koyeb LIVE).
T0 imeruka (hook haikuwepo pre-change — imerejelewa). T6 discussion-SIGTERM persist-gap = baseline,
IMEREJELEWA, sio fix (agizo la spec).
Next: TASK 2 (maelezo2.md) — ngonja CEO.
