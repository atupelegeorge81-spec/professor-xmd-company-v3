# Task 13 — Roster ya kila milestone (maelezo13)

Branch: `task/13-roster` · code merge: main `ffbfa1d` · deploy Koyeb `67cd4c98` HEALTHY.

## Kilichobadilika
- `src/lib/milestone/roster.ts` (mpya): `activeAgentsFor(map, agendaIndex)`, `rosterOwners(owners, active)`, `participantNames`, `milestoneOf`, `AGENT_ID_BY_ROSTER`.
- `src/lib/boardRunner.ts`: flag ON + ramani → owners wa agenda wanachujwa kwa roster ya milestone; observers ni wasio-owners ndani ya roster tu; header ya agenda ina mstari `Participants: …`; log `👥 Roster ya milestone …`. `runner.msMap` inawekwa na map hook na kwenye resume (`readMsMap`).
- `src/lib/milestone/store.ts`: `readMsMap(items)` (inasoma ramani kutoka chip iliyofichwa).
- `src/lib/milestone/map.ts`: test hook `XMD_TEST_MAP_FORCE` (XMD_TEST_HOOKS=1 pekee; inert vinginevyo).
- Flag OFF: hakuna njia mpya inayoguswa (`activeIds = null` → owners/observers kama zamani).

## Maamuzi niliyojifanyia (CEO alikuwa amelala — kanuni ya batch 13–20)
1. **rosterOwners**: agents wote wakiwa active → owners hawabadiliki. Vinginevyo owners ∩ roster; ikiwa tupu → hadi 2 wa roster wasio pm; wakikosekana → pm.
2. **Optimus (pm) yupo daima** kama mwenyekiti (hata ramani isipomtaja).
3. **Observers** = wasio-owners ndani ya roster tu.
4. Mstari `Participants:` unaonekana tu flag ON + ramani ipo.
5. **Resume**: ramani inasomwa kutoka chip iliyofichwa kwenye items zilizohifadhiwa (`readMsMap`).
6. **Forced-map hook** ni ya majaribio tu. Milestone moja + UI haipiti validator (milestone ya mwisho lazima iwe quality_deploy) → hook inarudi kwa ramani ya LLM. Tumia ≥2 entries.
7. Generator ya agenda haitii idadi iliyoombwa (ilitoa 5); runs zilisimamishwa (pause) baada ya agenda 2 kuokoa quota.

## Majaribio HALISI
Local `next dev` (port 3100), flag ON, `XMD_TEST_HOOKS=1`, brief `briefT13.json` (xmdtest-roster), Supabase + keys halisi.

### T1 — roster ndogo (ramani halisi ya LLM) — PASS
Session `43b1dbb2-b90a-46a0-a199-392063b73cec`. Ramani: M1 agenda 1–2 [optimus, ultron, vextron] · M2 3–4 [optimus, megatron] · M3 [optimus, cybertron].
- Headers: agenda 1–2 `Participants: Optimus, Ultron, Vextron`; agenda 3 `Participants: Optimus, Megatron`.
- Zamu (msg_start.agentId, `turns.py runT13a.log`): A1 designer 4 · frontend 3 · pm 1 — A2 frontend 5 · pm 3 · designer 1 — A3 backend 2.
- **Megatron na Cybertron: zamu 0 kwenye agenda 1–2.**
- Ledger #1 `53ff3831`, #2 `8ba3ce4c` LOCKED. Observers SILENT: Optimus (A1), Ultron (A2).

### T2 — roster kamili (forced map, agents wote 5) — PASS
Session `81618e70-b3a0-445d-9555-12a381aa555b`. `🧪 … M1 1–2 [wote 5] · M2 3–7 [wote 5]`; Participants = wote 5.
- Zamu: A1 designer 8 · frontend 6 · pm 1 · backend 1 · qa 1 — A2 frontend 3 · pm 3 · designer 1 · backend 1 · qa 1.
- Ledger `d7d94248`, `4599029f` LOCKED. Megatron/Cybertron walipata zamu za observer (SILENT).

### T3 — mjadala unafungwa kwa makubaliano — PASS
T1 na T2: agenda 1–2 zote zilifungwa kwa consensus; R37 non-consensus closes 0; fallback/defer 0.

### T4 — flag OFF (Koyeb production build, deploy `67cd4c98`) — PASS
Session `3c94f606-0767-44c0-a375-df15241cb575` (briefA) → `completed`, finalState COMPLETED_UNVERIFIED.
- `runsig` vs baseline `sigT12c.json`: status/mode/kinds `[chip,cu,msg,title]`/hiddenChips/`milestoneChips 0`/finalState **sawa**.
  cuEventTypes: T12c ilikuwa na `error`,`pause` za ziada (quota pause ya wakati ule) — si tofauti ya code.
- SSE kinds: hakuna kind mpya; hakuna `milestone*`, `Participants:` wala `Roster ya milestone` (grep = 0).
  T13c ina `cu/done/report/summary` kwa sababu SSE haikukatika (T12c ilikatika curl 92 kabla ya CU).
- Usafi: session 1, cu_files 204, ledger/mini_reports/plans 0 (find.mjs), snapshots za bucket 0 (hakuna mpya).
- E2B: sandboxes 16 zinazoendesha ni za zamani (Sep 13 – Oct 17, kabla ya task hii), si za majaribio — **hazikuguswa**
  (kanuni ya CEO "usifute kingine chochote"). Run za local hazikufika CU.

## Baselines (branch)
tsc 0 · vitest **448 passed + 2 skipped** (439 + 9 mpya) · pytest 308 · unittest OK (238) · eslint 0 (`src/lib/milestone`, `boardRunner.ts`).

## Usafi
Sessions zote mbili za majaribio zimefutwa (`clean.mjs --go`, `cleanstore.mjs` cu_files 0, `find.mjs --go` hakuna mabaki). Dev server imezimwa.
