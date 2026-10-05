# R31-G4 · Quota-Pause + Auto-Resume + File-Tree Real-Time (05-10 jioni — idhini ya CEO)

## Agizo (kama lilivyo)
1. **max_turns ONDOLEWA KABISA** — kama Claude Code: agent anajimanage kwa maelekezo/harness, si kikomo cha turns.
2. **Quota-pause + auto-resume**: tokens zikiisha kwa accounts ZOTE → run ijipause; kesho limit ikirudi → ijiresume YENYEWE. Test ya fake traffic inayothibitisha hii.
3. **File tree**: ionekane + REAL-TIME inapoundwa.
4. **Icon ya files**: 📂 (`Folder`), rangi zambarau ile ile.
5. Fixes zilizogunduliwa (github ya uwongo, streaming, thoughts, status) — HAKUNA kubadilisha vingine.

## Mtiririko mzima (pause → resume)

```
brain.py: quota-fatal (accounts zote)  →  BrainFatal "…XMD-PAUSE:<resume_at_ms>"
   ↓  (do_POST → 529)
bridge.py: PAUSE_RX inakuta marker (ResultMessage AU exception)
   →  status="paused_quota"
   →  make_snapshot(workspace) → tar.gz base64 (≤20MB, bila node_modules/.git)
   →  emit("snapshot", big_data, path="ws-snapshot.tar.gz")
   →  emit("run_end", status="paused_quota", resume_at, …)
   ↓  (POST cu-event)
engine.ts:
   snapshot  →  storage.createFile(CU_BUCKET) → cu.snapshot={fileId,bucketId}
   run_end(paused_quota) → pauseComputer():
        item cu:"pause" + chip + blog + persist("paused")
        phaseResolve → run() early-return (status error, bila chips za "haijakamilika")
        scheduleAutoResume(sessionId, resumeAt)  [timer ya ndani]
   ↓
autoResume.ts (njia 3):
   (1) timer ya ndani (instance ikiishi)
   (2) instrumentation: scan boot + kila dakika 10
   (3) /api/boardroom/active: kila ombi (throttle 60s ndani ya checkPausedDue)
   →  autoResumeSession: resumeRun → live? startLoop : rebuild kutoka Appwrite
   →  streamRunner ina-drain (client wa kimya — kazi inaendelea server-side)
   ↓
run() → cuOnlyMissing → startComputerPhase (resume)
   →  cu state kutoka chip (maxI/pausedOnce/snapshot/filesItemId…)
   →  bridgeCommand + --restore-url (URL ya bucket, public read)
   →  sandbox mpya inarejesha tar.gz → kazi ya jana ipo → inaendelea
```

**Guard ya mara-moja**: `test_quota_pause_ms` inaandikwa kwenye cu-config.json ikiwa `cu.pausedOnce` ni false TAYARI (chip ya run ya awali). Brain pia ina `_test_pause_fired`. Kwa hiyo resume ya kwanza inaendelea na KAZI HALISI (Gemini ya kweli), si pause nyingine.

## File-tree: magonjwa mawili yaliyoponywa
1. **Engine/orphan storage**: item ya "files" ilihifadhiwa TU kwenye bucket boundaries (25/50/…) — mradi mdogo ulibaki na snapshot ya KWANZA (workspace tupu). Sasa: item MOJA (`filesItemId`) inayosasishwa kila tukio; replay ina tree ya MWISHO.
2. **Live socket**: bridge inatuma uwanja `tree`; adapter ilisoma `cu.files` → tree haikuwa ionekani LIVE kamwe. Sasa inasoma `cu.tree ?? cu.files`.

## Icon
`FolderTree` (folda mbili) → `Folder` (📂) — `text-[#a78bfa]` zambarau ile ile (FilesSheet header + Files badge).

## Streaming (xmd3 verbatim)
- `useSettledStatus`: toleo la xmd3 (wasPendingRef + shownAtRef + timerRef, minVisibleMs 450) — replay ya items zilizo settled inaonyeshwa MARA MOJA (ya zamani ilichelewa 450ms hata bila running frame).
- `tokenize/TOKEN_CLASS` (lib/highlight.ts ya xmd3, 45-line, dependency-free) + `CodeStreamBlock` — ported kwenye kit.tsx.
- `CuFileWriteCard`: code area = CodeStreamBlock (streaming wakati run — "Writing" shimmer + caret; settled — highlighted).
- `tool_draft` (adapter): `content` kwanza (code halisi inayomiminika); `preview` ni label tu — ndiyo ilikuwa inaonyeshwa.

## Status ya session (kosa la "running" ya milele)
- `finishComputer`: `persist(ok ? "completed" : "finale_incomplete")` (ilikuwa inaendelea "running").
- `schedulePersist`: status halisi (`paused` ikirudi kutoka pause haivurugwi).
- Ripoti "(hakuna ripoti)" / "^API Error" haipewi `done:true` — Endeleza inabaki.

## Kojesheni za ujenzi (sandbox 2GB)
`next build` ya 15.5 inazalisha build-worker + mchakato mkuu → OOM ya pande zote (dmesg: global_oom, node 1.4GB+1.7GB).
Fix: `next.config.mjs` — `webpack: (cfg) => cfg` (identity → in-process build, worker haitumiki), `experimental.cpus:1`, `webpackMemoryOptimizations:true`; build: `node --max-old-space-size=1250 node_modules/next/dist/bin/next build`.

## Test ya fake-traffic (mpango — Koyeb, baada ya deploy)
1. Weka env `CU_TEST_QUOTA_PAUSE_MS=60000` kwenye service ya app (Koyeb) → redeploy.
2. Anzisha board session mpya (plan mode) hadi awamu ya CU.
3. Expect: hatua ya KWANZA ya brain → pause card "Tokens za siku zimeisha" + status doc "paused" + snapshot bucket (kama workspace ina files).
4. Ngawa sekunde 60 → auto-resume (timer/active-check) → bridge relaunch na --restore-url → pausedOnce=true → kazi halisi inaendelea hadi kumaliza.
5. Ondoa env ya test → redeploy safi.

## Files zilizobadilishwa
`cu/brain.py` `cu/bridge.py` `cu/tests/test_brain.py` (45/45 ✓) · `src/lib/cu/engine.ts` `src/lib/cu/autoResume.ts` (mpya) `src/lib/boardRunner.ts` `src/lib/board/adapter.ts` `src/lib/stage/types.ts` `src/app/api/boardroom/cu-event/route.ts` `src/app/api/boardroom/active/route.ts` `src/instrumentation.ts` `src/components/board/stage/Computer.tsx` `StageStream.tsx` `cu/cards.tsx` `cu/kit.tsx` `next.config.mjs` · vitest 61/61 ✓ · tsc ✓

---

## E2E RESULT (05-10 jioni — IMEFAULU ✓)

**Session ya uthibitisho: `6ac3ce60088b8b0557b2`** — cycle nzima imeproofika:

1. Board (agenda 3, plan, reports) ✓
2. CU run #1 (run_start i:1) → test hook (multi-shot 529) → SDK retries zinaisha → bridge inakamata XMD-PAUSE → error+files+pause items + chip + doc **"paused"** + **snapshot → Appwrite bucket** + CU_STATE(pausedOnce/resumeAt/snapshot) ✓
3. Auto-resume inawaka (timer at resumeAt — proven test 4; boot-scan — proven 17:23) ✓
4. **Endeleza (njia ya "usiku" — instance restart → rebuild from Appwrite)**: chip ya CU inaseed → fast-path (CU moja kwa moja) → sandbox timeboxed → zombie/pgrep safi → bridge mpya `--restore-url` → **kazi halisi: 15 LLM calls · 94,999 tokens · exec×3 · think×4 · files · report** → run_end(i:78, done) → doc **completed** ✓

### Fixes za E2E (deploy chain, zote kwenye `14c5775`):
| Commit | Fix |
|---|---|
| `9a58962` | brain test hook **multi-shot** (SDK ya Anthropic ina-retry 529 — one-shot ilimezwa) |
| `3058a70` | mtego wa replay (paused_quota run_end ilire-pause kila 5s = loop) + pause inaua sandbox (snapshot ndiyo hali) + persistTimer race ("running" ya milele) |
| `475d3df` | pause ina-clear `cu.sandbox` (cache ya sandbox iliyouawa → "not found") + cuError → "finale_incomplete" |
| `0c6086c` | **quota-resume fast-path** (CU moja kwa moja — finale hairodiwi) + phaseDone mpya kila awamu + run() error trail kwenye doc |
| `7f2d698` | E2B timebox (connect 25s/create 90s — hang ya dakika 22) + dynamic imports alias @/ (timer/interval hazikufika) |
| `c1282ab` | fast-path inafika na kwa rebuilt runner (ensureCuState kabla) + /active hook kwenye GET (module-level = mara moja tu) |
| `a7394b8` | **FIX F**: rebuild inaseed chip ya CU_STATE kwenye items (isHiddenChip ilikuwa inaichuja → cu mpya: pausedOnce=false/maxI=0 → test hook ilirudi + events i:1..7 zikarudiwa → loop ya re-pause) |
| `07e9c8d` | **FIX G**: bridge "hai" baada ya pause = ZOMBIE — inauawa, si attach (attach ilisubiri milele) |
| `14c5775` | **FIX H**: `pgrep/pkill -f '[c]u_bridge.py'` (bash -lc inajimatch → false ALIVE kila resume; pkill iliua bridge mpya) + zombie block KABLA ya launch |

### Usalishaji (baada ya test):
- `CU_TEST_QUOTA_PAUSE_MS` **IMEONDOLEWA** kwenye Koyeb (PATCH definition) — production safi, `14c5775` HEALTHY.
