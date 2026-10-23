# SUPABASE — MUUNDO KAMILI WA HIFADHI (bila data)

> **Kwa nini hati hii ipo:** Supabase imeonya (23 Okt 2026) kwamba org `atupelegeorge81-spec's Org` imetumia
> **egress ya 11.46 GB** wakati kikomo cha bure ni **5.5 GB**. Tusipochukua hatua kufikia **25 Okt 2026**, project
> zitazuiliwa (zitajibu `402`). Hati hii inaeleza **KILA KITU** kilichojengwa ndani ya Supabase — tables, columns,
> aina zake, defaults, keys, indexes, ruhusa (RLS/grants), functions, buckets, extensions — ili tuweze kujenga
> **upya kitu kilekile** mahali pengine bila kukosa chochote.
>
> **Hakuna data (rows) ndani ya hati hii.** Ni muundo tu. Idadi za rows zimeandikwa kama taarifa ya ukubwa tu.

| Kitu | Thamani |
|---|---|
| Project | `pgxjepplhmyurkgohngn` (URL: `https://pgxjepplhmyurkgohngn.supabase.co`) |
| Database | PostgreSQL **17.11**, db `postgres`, ukubwa ≈ **26 MB** |
| Schema yetu | `public` pekee (schema nyingine ni za Supabase yenyewe: `auth`, `storage`, `realtime`, `vault`, `extensions`…) |
| Tables | **13** |
| Functions zetu | **3** (`db_size`, `storage_stats`, `xmd_table_security`) |
| Storage buckets | **2** (`professor-xmd-files`, `6ac2935d0038fbd47d5d`) — faili 503, ≈ **674 MB** |
| Ilisomwa lini | 2026-10-23 08:45 UTC, moja kwa moja kutoka catalog ya Postgres (si kwa kubahatisha) |

**Faili za kuambatana na hati hii:**

| Faili | Ni nini |
|---|---|
| `docs/sql/supabase-schema-recreate.sql` | **Script moja ya kujenga upya kila kitu** (tables + keys + indexes + comments + RLS + grants + functions + buckets). Endesha kwenye project mpya → muundo unakuwa sawa 100%. |
| `docs/sql/supabase-schema.json` | Matokeo ghafi ya ukaguzi wa catalog (muundo tu, bila data) — ushahidi/rejea ya mashine. |
| `docs/sql/xmd_table_security.sql` | (ilikuwepo tangu T29) function ya ukaguzi wa RLS — imejumuishwa pia ndani ya recreate script. |

> ✅ **Script imejaribiwa kweli:** iliendeshwa ndani ya Supabase hii hii kwenye schema ya majaribio
> (`xmdtest_schemacheck`) ndani ya transaction, kisha ikalinganishwa na `public`: columns 73/73, indexes 22/22,
> constraints 13/13, RLS 13/13, grants 39/39, functions 3/3 — **zote SAWA**. Kisha `ROLLBACK` — hakuna kilichobaki.
> (Ushahidi: `docs/tests/task-38.md`.)

---

## 0. Picha kubwa — app inaitumiaje Supabase

- App (Next.js kwenye Koyeb) inaongea na Supabase kupitia **`@supabase/supabase-js`** kwa **service key** (inapita RLS).
  Faili kuu: `src/lib/server/supabase.ts`.
- Zamani hifadhi ilikuwa **Appwrite**. Ili files 30+ za zamani zisibadilishwe, kuna "shim": `src/lib/server/appwrite.ts`
  inaiga API ya Appwrite (`listDocuments`, `createDocument`, `updateDocument`, `getDocument`, `deleteDocument`,
  `storage.createFile`…) lakini nyuma yake ni Supabase.
- **Mtindo wa tables (muhimu kwa kujenga upya):** kila table ina aina mbili za columns:
  1. **Columns halisi** — zile zinazotafutwa/kupangwa/kusasishwa moja kwa moja (mf. `session_id`, `status`, `created_at`).
  2. **Column moja ya JSONB (`data`)** — inabeba fields nyingine zote za "document". Shim ina-*flatten* wakati wa kusoma
     (fields za `data` zinaonekana kama fields za kawaida) na ina-*merge* wakati wa kuandika.
  Ramani hii iko kwenye `TABLES` ndani ya `src/lib/server/supabase.ts`. Table isiyo kwenye ramani inachukuliwa kama
  `cols: [session_id, created_at] + jsonb: data`.
- **ID za Appwrite za zamani** bado zinatumika kwenye code (aliases): `6ab6d7990026978d4ba9` → `agent_conversations`,
  `6ab4f030002f1cf234b8` → `agent_memory`, `6ab74616000856116332` → `memory_events`.
- **Maandishi makubwa yanabanwa** (`src/lib/server/packed.ts`): maandishi ≥ 16,000 herufi yanahifadhiwa kama
  `gz1:` + base64(gzip). Kusoma: kama yanaanza na `gz1:` → fungua; vinginevyo ni maandishi/JSON ya kawaida.
  Hii inatumika kwenye `boardroom_sessions.items` (sessions zote 10 zimebanwa) na maudhui ya ripoti.
- **Mfumo wa `id`:** `id` za tables nyingi ni **text** inayotengenezwa na app (mtindo wa Appwrite "unique()" / UUID) —
  database haitengenezi id yenyewe (hakuna default kwenye `id`). Hakuna sequences.

### Ramani: table → inatumiwa na code gani

| Table | Hali | Files kuu zinazoitumia |
|---|---|---|
| `boardroom_sessions` | ✅ inatumika (moyo wa mfumo) | `src/lib/server/appwrite.ts`, `src/lib/reports.ts`, `src/lib/server/sessionIndex.ts`, `src/lib/cu/autoResume.ts`, `src/lib/milestone/store.ts`, `src/app/api/health/route.ts` |
| `reports` | ✅ inatumika | `src/lib/server/sessionIndex.ts`, `src/lib/reports.ts` (REPORTS_COL) |
| `project_plans` | ✅ inatumika | `src/lib/server/plans.ts`, `src/lib/cu/engine.ts`, `src/lib/cu/planGate.ts`, `src/lib/board/finale.ts`, `src/lib/brain/memory/avoid.ts`, `src/lib/server/sessionIndex.ts` |
| `mini_reports` | ✅ inatumika | `src/lib/server/miniReports.ts`, `src/lib/boardRunner.ts` |
| `board_ledger` | ✅ inatumika | `src/lib/ledger.ts`, `src/lib/ledgerUpdate.ts`, `src/lib/server/miniReports.ts` |
| `agent_memory` | ✅ inatumika | `src/lib/brain/memory/store.ts` (+ `recall.ts`, `rolling.ts`, `consolidate.ts`, `checkpoint.ts`, `chat.ts`, `hooks.ts`) |
| `memory_events` | ✅ inatumika | `src/lib/brain/memory/events.ts` (+ `rolling.ts`, `consolidate.ts`, `checkpoint.ts`) |
| `agent_conversations` | ✅ inatumika | `src/lib/server/agentChats.ts`, `src/lib/server/agentChatsSchema.ts`, `src/app/api/agent-chats/route.ts`, `src/lib/chat/useAgentChat.ts` |
| `search_cache` | ✅ inatumika | `src/lib/search.ts` |
| `cu_files` | ✅ inatumika | `src/lib/cu/mirror.ts`, `src/lib/cu/engine.ts`, `src/app/api/boardroom/cu-event/route.ts` |
| `board_items` | ⚠️ **LEGACY** — code ya sasa haiiandiki wala kuisoma | ilitumiwa na R42 (`92a2475`), R42 ilirudishwa nyuma (`b45e4c1`). Ina data ya sessions 2 za zamani tu. |
| `cu_events` | ⚠️ **LEGACY** — kama juu | session 1 ya zamani tu |
| `cu_state` | ⚠️ **LEGACY** — kama juu | row 1 ya zamani. (Hali ya Computer sasa inaishi ndani ya `boardroom_sessions.items` kama chip `__PROFESSOR_XMD_CU_STATE__`.) |

> Tables 3 za LEGACY **zimejumuishwa** kwenye recreate script ili muundo uwe sawa kabisa. Ukitaka kuziacha kwenye
> platform mpya, app haitaathirika (ila ni uamuzi wa CEO).

---

## 1. `boardroom_sessions` — kila session ya Boardroom (mjadala + Computer)

**Inahifadhi nini:** row moja kwa kila session/kazi aliyotoa CEO. Ndani ya `items` kuna **historia nzima** ya session:
ujumbe wa agents, chips za hali, events za Computer, milestones, n.k. (Rows: 10 · ≈ 2.9 MB.)
**Inatumika kwa:** kuonyesha sessions kwenye UI, kuendeleza (resume) session iliyosimama, auto-resume, kukagua
kama kuna session inaendelea kabla ya deploy, ripoti, milestone mode.

Comment ya table (kwenye DB): *"Session META tu (project/title/status). Discussion items -> board_items. Computer events -> cu_events. Legacy packed items column: text (∞) kwa sessions za zamani za Appwrite."*
(Comment hii iliandikwa wakati wa R42; kwa sasa `items` ndiyo inayotumika kwa sessions zote.)

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** ID ya session (UUID inayotengenezwa na app, mf. `0dc37405-…`). |
| `project` | text | ndiyo | — | Jina la project/kazi (maandishi ya CEO kwa ufupi). |
| `title` | text | ndiyo | — | Kichwa cha session kinachoonekana kwenye UI. |
| `status` | text | ndiyo | — | Hali: `running`, `paused`, `completed`, `stopped`, `error`. (`running` = inaendelea — **usideploy**.) |
| `mode` | text | ndiyo | `'code'` | Aina ya session: `code` (kujenga code) au `plan` (Mpango Kazi tu). |
| `items` | text | ndiyo | — | **Historia nzima ya session** kama JSON array, mara nyingi imebanwa (`gz1:`+base64 gzip). Tazama muundo hapa chini. |
| `created_at` | timestamptz | ndiyo | `now()` | Ilipoanzishwa. |
| `updated_at` | timestamptz | ndiyo | `now()` | Ilipobadilishwa mwisho (app inaisasisha kila inapoandika `items`). |

**Keys/Indexes:** PK `boardroom_sessions_pkey (id)` · index `idx_brs_status (status)`.

**Muundo wa `items` (baada ya kufungua):** array ya objects; kila object ina `kind` na `id`:

| `kind` | Fields | Maana |
|---|---|---|
| `title` | `id, text` | Kichwa/kazi ya session. |
| `msg` | `id, agentId, thinking, content, sources[], done` | Ujumbe wa agent kwenye mjadala (mawazo, jibu, vyanzo vya search, umemaliza?). |
| `chip` | `id, text` | Taarifa fupi ya hali. Chips maalum (zinaanza na `__…__` + JSON) ni **hali ya mfumo**: `__PROFESSOR_XMD_RESUME_STATE__` (pa kuendelea), `__PROFESSOR_XMD_BRIEF__` (brief ya kazi), `__PROFESSOR_XMD_USAGE__` (matumizi ya tokens), `__PROFESSOR_XMD_CU_STATE__` (sandbox/token/maxI ya Computer), `__PROFESSOR_XMD_MILESTONE__` (hali ya milestone), `__PROFESSOR_XMD_FACTS__` (facts rasmi), `__XMD_MSUI__` (UI ya milestones). |
| `cu` | `id, cu, i, …` (≈50 fields: `task, model, lane, provider, account, step, ms, text, ok, tool, command, path, output, exit, preview, lines, chars, summary, files, filesCount, hookKind, streak, status, steps, tokens, requests, total, budget, oldStr, newStr, fileId, bucketId, label, url, github, live, tree, milestone, finalState, finalReason, resumeAt, reason, execId, kindX, message, partial`) | **Event ya XMD Computer** (amri ya terminal, kuandika faili, screenshot, ripoti, n.k.). `cu` = aina ya event, `i` = namba ya mfuatano. `fileId/bucketId` zinaelekeza kwenye faili la Storage (screenshot/snapshot). |
| `msMap` | `id, total, pending, fallback, milestones` | Ramani ya milestones (milestone mode). |
| `msStart` | `id, milestone, shown, createdAt` | Mwanzo wa milestone fulani. |

---

## 2. `reports` — ripoti za mwisho za sessions

**Inahifadhi nini:** ripoti iliyoandikwa mwishoni mwa session (Markdown). (Rows: 16.)
**Inatumika kwa:** ukurasa wa Reports, Feed ya Overview, Finale.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** ID ya ripoti. |
| `session_id` | text | ndiyo | — | Session iliyozaa ripoti hii (`boardroom_sessions.id` — hakuna foreign key rasmi). |
| `data` | jsonb | NOT NULL | `'{}'` | Maudhui ya ripoti (tazama keys). |
| `created_at` | timestamptz | ndiyo | `now()` | Ilipoandikwa. |

**Keys ndani ya `data`:** `title` (kichwa) · `project` (jina la project) · `agents` (agents walioshiriki, maandishi) ·
`content` (ripoti nzima, Markdown — inaweza kuwa imebanwa `gz1:`).
**Keys/Indexes:** PK `reports_pkey (id)` · `idx_reports_created (created_at DESC)`.

---

## 3. `project_plans` — Mpango Kazi wa kila session

**Inahifadhi nini:** mpango ulioandikwa na Optimus baada ya mjadala (hatua, malengo, vikwazo). Session moja = mpango
mmoja. (Rows: 12.)
**Inatumika kwa:** Computer inafuata mpango huu (`engine.ts`), plan gate inaukagua (`planGate.ts`), Finale,
"avoid-list" ya ubunifu (T36, `avoid.ts`), `/api/plans?session=<id>`.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** |
| `session_id` | text | ndiyo | — | Session ya mpango. **UNIQUE** (unique index `idx_plans_session`) — mpango mmoja tu kwa session. |
| `data` | jsonb | NOT NULL | `'{}'` | Mpango wenyewe (tazama keys). |
| `created_at` | timestamptz | ndiyo | `now()` | |
| `updated_at` | timestamptz | ndiyo | `now()` | |

**Keys ndani ya `data`:** `title` · `project_id` · `objective` (lengo) · `plan_content` (mpango mzima, Markdown) ·
`constraints` (vikwazo) · `official_data` (data rasmi/facts zilizotolewa) · `total_steps` (namba) ·
`status` (mf. `active`) · `warnings` (array ya tahadhari — si kila mpango una hii).
**Keys/Indexes:** PK `project_plans_pkey (id)` · UNIQUE index `idx_plans_session (session_id)`.

---

## 4. `mini_reports` — ripoti fupi kwa kila kipengele cha agenda

**Inahifadhi nini:** muhtasari wa uamuzi wa kila agenda item (kipengele) cha mjadala. (Rows: 162.)
**Inatumika kwa:** `boardRunner.ts` kuwapa agents muhtasari wa yaliyokwisha amuliwa; UI.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** |
| `session_id` | text | ndiyo | — | Session husika (haina index). |
| `data` | jsonb | NOT NULL | `'{}'` | |
| `created_at` | timestamptz | ndiyo | `now()` | |

**Keys ndani ya `data`:** `project_id` · `agenda_index` (namba ya kipengele) · `agenda_item` (jina la kipengele) ·
`status` (mf. `LOCKED`) · `decision_summary` (uamuzi kwa ufupi) · `detail` (maelezo zaidi) ·
`carried_constraints` (vikwazo vinavyobebwa kwenda mbele) · `updated_at`.
**Keys/Indexes:** PK `mini_reports_pkey (id)` pekee.

---

## 5. `board_ledger` — daftari rasmi la maamuzi ya Board

**Inahifadhi nini:** kila uamuzi uliofungwa (LOCKED) kwenye mjadala, pamoja na sababu, ushahidi, code iliyoidhinishwa.
(Rows: 278.)
**Inatumika kwa:** agents kusoma maamuzi ya zamani ya project, kuzuia kurudia mjadala, ripoti.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** |
| `status` | text | ndiyo | `'ACTIVE'` | Hali ya uamuzi: `LOCKED` (umefungwa), `SUPERSEDED` (umebadilishwa na mwingine), `OBJECTED_OPEN`, `FAILED_REVIEW`. (Index `idx_ledger_status`.) |
| `data` | jsonb | NOT NULL | `'{}'` | |
| `created_at` | timestamptz | ndiyo | `now()` | |

**Keys ndani ya `data`:** `session_id` · `project_id` · `agenda_index` · `agenda_item` · `decision_summary` ·
`decision_detail` · `approved_code` (code iliyoidhinishwa) · `carried_constraints` · `rationale` (sababu) ·
`trade_off` (gharama/ubadilishanaji) · `evidence` (ushahidi) · `sources` (vyanzo) · `owners` (wahusika) ·
`objections` (pingamizi) · `supersedes` (uamuzi unaobadilishwa) · `locked_at`. (Code pia inaweza kuandika
`code_status`: `approved | unreviewed | data_errors | rejected`.)
**Keys/Indexes:** PK `board_ledger_pkey (id)` · `idx_ledger_status (status)`.

---

## 6. `agent_memory` — kumbukumbu ya kudumu ya kila agent

**Inahifadhi nini:** row **moja kwa kila agent** (`optimus`, `ultron`, `vextron`, `megatron`, `cybertron`) + row
`company` (kumbukumbu ya Board ya kampuni nzima, inaandikwa na Optimus, wote wanaisoma). (Rows: 6.)
**Inatumika kwa:** agents kukumbuka mafunzo yao kati ya sessions. ⚠️ **Agizo la CEO: usifute kumbukumbu za agents.**

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `agent_id` | text | NOT NULL | — | **Primary key.** Jina la agent au `company`. |
| `data` | jsonb | NOT NULL | `'{}'` | Kumbukumbu (tazama keys). |
| `updated_at` | timestamptz | ndiyo | `now()` | |

**Keys ndani ya `data`:** `self_memory` (mafunzo ya agent mwenyewe) · `board_memory` (kumbukumbu za Board) ·
`self_updated_at` · `board_updated_at` · `last_project` (project ya mwisho).
**Keys/Indexes:** PK `agent_memory_pkey (agent_id)`.

---

## 7. `memory_events` — matukio ya kumbukumbu (working memory)

**Inahifadhi nini:** kila checkpoint/reflection/consolidation ambayo agent alifanya wakati wa session. (Rows: 1,925.)
**Inatumika kwa:** resume salama, ukaguzi (audit) wa jinsi kumbukumbu zilivyojengwa, skill candidates.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** |
| `agent_id` | text | ndiyo | — | Agent husika. (Index `idx_me_agent`.) |
| `data` | jsonb | NOT NULL | `'{}'` | |
| `created_at` | timestamptz | ndiyo | `now()` | |

**Keys ndani ya `data`:** `session_id` · `project` · `kind` (`checkpoint` / `reflection` / `consolidated` /
`skill_candidate`) · `status` (`memory` / `no_memory` / `failed`) · `agenda_index` · `agenda_item` ·
`self_note` (dokezo la agent) · `board_note` (dokezo la Board) · `model` · `ms` (muda) · `tokens`.
**Keys/Indexes:** PK `memory_events_pkey (id)` · `idx_me_agent (agent_id)`.

---

## 8. `agent_conversations` — chat binafsi ya CEO na agent mmoja

**Inahifadhi nini:** kila ujumbe kwenye ukurasa wa Agent (`/agents/[id]`) — swali la CEO na jibu la agent. (Rows: 7.)
**Inatumika kwa:** historia ya chat, 👍/👎, "Today's usage" (tokens). Hii ndiyo table pekee yenye columns halisi
zote (haina `data` JSONB).

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** ID ya ujumbe. |
| `agent_id` | text | NOT NULL | — | `optimus` / `ultron` / `vextron` / `megatron` / `cybertron`. |
| `thread_id` | text | NOT NULL | — | Mazungumzo (Clear = thread mpya). |
| `seq` | integer | NOT NULL | — | Mpangilio ndani ya thread. |
| `role` | text | NOT NULL | — | `user` (CEO) au `agent`. |
| `content` | text | ndiyo | — | Swali / jibu (Markdown + code). |
| `thinking` | text | ndiyo | — | Mawazo ya agent (aya zimetenganishwa kwa mstari mtupu). |
| `search_query` | text | ndiyo | — | Search iliyofanywa (kama ipo). |
| `sources` | text | ndiyo | — | JSON: `[{title,url,snippet}]` (hadi 12). |
| `status` | text | ndiyo | — | Hali ya jibu: `done` / `stopped` / `error` (null kwa ujumbe wa CEO). |
| `seconds` | integer | ndiyo | — | Muda wa kufikiri hadi jibu. |
| `feedback` | text | ndiyo | — | `up` / `down` (👍/👎 ya CEO). |
| `model` | text | ndiyo | — | Model iliyojibu. |
| `prompt_tokens` | integer | ndiyo | — | Tokens za input. |
| `completion_tokens` | integer | ndiyo | — | Tokens za output. |
| `total_tokens` | integer | ndiyo | — | Jumla. |
| `tokens_exact` | boolean | ndiyo | — | `true` = hesabu halisi ya provider; `false` = makadirio. |
| `requests` | integer | ndiyo | — | Idadi ya API calls kwa jibu hili. |
| `created_at` | timestamptz | ndiyo | `now()` | |

**Keys/Indexes:** PK `agent_conversations_pkey (id)` · `idx_agent_thread_seq (agent_id, thread_id, seq)` ·
`idx_role_created (role, created_at)` · `idx_agent_created (created_at)`.
(Muundo wa asili pia uko `scripts/agent-chats.schema.json`.)

---

## 9. `search_cache` — akiba ya matokeo ya web search (semantic cache)

**Inahifadhi nini:** search zilizowahi kufanywa + "vector" (embedding) ya swali + matokeo. Swali jipya linalofanana
kimaana linapata matokeo ya akiba badala ya kutafuta upya (siku 7). (Rows: 128.)
**Inatumika kwa:** `src/lib/search.ts` — kuokoa quota ya search.

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `id` | text | NOT NULL | — | **Primary key.** |
| `space` | text | ndiyo | — | "Nafasi" ya vector = `<model>@<dims>`, mf. `gemini-embedding-001@768`. Vectors za models tofauti hazilinganishwi. |
| `query` | text | ndiyo | — | Swali la search (maandishi). |
| `vector` | text | ndiyo | — | Embedding kama JSON array ya namba (768). Ni **text**, si pgvector. |
| `results` | text | ndiyo | — | Matokeo ya search kama JSON. |
| `hits` | integer | ndiyo | — | Mara ngapi akiba hii imetumika. |
| `dims` | integer | ndiyo | — | Urefu wa vector (768). |
| `created_at` | timestamptz | ndiyo | `now()` | (Inatumika kwa kikomo cha siku 7.) |

**Keys/Indexes:** PK `search_cache_pkey (id)` · `idx_sc_space (space, created_at DESC)`.

---

## 10. `cu_files` — "kiovu" cha faili za XMD Computer (R44-A)

**Inahifadhi nini:** kila faili ambalo agent wa Computer anaandika/kurekebisha ndani ya sandbox (`/home/user/ws/…`),
linanakiliwa hapa **mara moja**. Faili za install (node_modules, .git, dist, build, lockfiles…) haziwekwi.
(Rows: 367.)
**Inatumika kwa:** sandbox ikifa, sandbox mpya inarudishiwa faili zote za session kutoka hapa kabla kazi haijaendelea.

Comment ya table: *"R44-A: kiovu cha faili za agent (kila write/edit mara moja) — restore ya sandbox mpya"*

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `session_id` | text | NOT NULL | — | Session husika. **PK (sehemu 1)**. |
| `path` | text | NOT NULL | — | Njia ya faili ndani ya workspace (mf. `src/app.js`). **PK (sehemu 2)**. |
| `content` | text | NOT NULL | `''` | Maudhui kamili ya faili. |
| `bytes` | integer | NOT NULL | `0` | Ukubwa (herufi). |
| `updated_at` | timestamptz | NOT NULL | `now()` | |

**Keys/Indexes:** PK `cu_files_pkey (session_id, path)` (kuandika = upsert kwa `session_id,path`).
⚠️ **RLS IMEZIMWA** kwenye table hii pekee (zingine zote RLS iko ON). Recreate script inahifadhi hali hiyohiyo.

---

## 11. `board_items` — ⚠️ LEGACY (R42)

**Ilikusudiwa:** kila item ya mjadala = row moja (badala ya kuweka zote ndani ya `boardroom_sessions.items`).
R42 ilirudishwa nyuma, kwa hiyo **code ya sasa haiitumii**. (Rows: 508, za sessions 2 za zamani.)

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `session_id` | text | NOT NULL | — | **PK (sehemu 1).** |
| `seq` | integer | NOT NULL | — | Mfuatano wa item. **PK (sehemu 2).** |
| `item` | jsonb | NOT NULL | — | Item moja (muundo sawa na `boardroom_sessions.items`: `id, kind, text` au `agentId, content, thinking, sources[], done`). |

**Keys/Indexes:** PK `board_items_pkey (session_id, seq)`. Comment ya table ipo (inaeleza lengo hili).

## 12. `cu_events` — ⚠️ LEGACY (R42)

**Ilikusudiwa:** kila event ya Computer = row moja. Code ya sasa haiitumii. (Rows: 783, session 1 ya zamani.)

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `session_id` | text | NOT NULL | — | **PK (sehemu 1).** |
| `seq` | integer | NOT NULL | — | **PK (sehemu 2).** |
| `ev` | jsonb | NOT NULL | — | Event moja ya Computer (muundo sawa na item `kind: "cu"` hapo juu — `cu, i, id, kind, lane, model, provider, command, output, exit, tool, path, files, tree, step, ms, ok, text, summary, hookKind, streak, budget, total…`). |

**Keys/Indexes:** PK `cu_events_pkey (session_id, seq)`. Comment ya table ipo.

## 13. `cu_state` — ⚠️ LEGACY (R42)

**Ilikusudiwa:** row moja kwa session yenye hali ya Computer. Code ya sasa inaweka hali hii kama chip
`__PROFESSOR_XMD_CU_STATE__` ndani ya `boardroom_sessions.items`. (Rows: 1.)

| Column | Aina | Null? | Default | Maelezo |
|---|---|---|---|---|
| `session_id` | text | NOT NULL | — | **Primary key.** |
| `chip` | jsonb | NOT NULL | — | Keys: `v` (toleo), `sandboxId`, `token` (token ya sandbox — siri), `maxI` (event ya mwisho), `files[]`, `report`, `done`, `pausedOnce`. |
| `updated_at` | timestamptz | ndiyo | `now()` | |

**Keys/Indexes:** PK `cu_state_pkey (session_id)`. Comment ya table ipo.

---

## 14. Ruhusa: RLS na GRANTS (muhimu kwa usalama)

| Kitu | Hali halisi |
|---|---|
| RLS (Row Level Security) | **ON** kwa tables 12 · **OFF** kwa `cu_files` pekee |
| RLS policies | **Hakuna hata moja (0)**. Maana: kwa tables zenye RLS ON, `anon`/`authenticated` hawaoni chochote; ni **service key** pekee (app) inayoweza kusoma/kuandika. |
| Grants | Kila table: `anon`, `authenticated`, `service_role` (na `postgres`) wana ruhusa zote (SELECT, INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER) — hii ni default ya Supabase. |
| ⚠️ Hatari | Kwa sababu `cu_files` ina RLS OFF + grants za `anon`, mtu yeyote mwenye anon key anaweza kuisoma/kuiandika. App haitumii anon key, lakini kwenye platform mpya ni vizuri kuamua (kuwasha RLS kwenye `cu_files` ni salama kwa app, kwa sababu app inatumia service key). **Sijabadilisha chochote** — ni uamuzi wa CEO. |
| Triggers | Hakuna. (`updated_at` inasasishwa na app, si na trigger.) |
| Foreign keys | Hakuna. Uhusiano (mf. `session_id` → `boardroom_sessions.id`) ni wa code tu. |
| Views / sequences / custom types / enums ya DB | Hakuna. |

---

## 15. Functions (3) — zote `SECURITY DEFINER`

| Function | Inarudisha | Inafanya nini | Inatumiwa na | Ruhusa ya kuiita |
|---|---|---|---|---|
| `public.db_size()` | `bigint` | Ukubwa wa database nzima (bytes): `pg_database_size(current_database())`. | `src/lib/server/sysinfo.ts` (dashboard ya mfumo) | PUBLIC, anon, authenticated, service_role |
| `public.storage_stats()` | `json` `{bytes, count, buckets}` | Jumla ya ukubwa wa faili zote za Storage, idadi ya faili, idadi ya buckets. | `src/lib/server/sysinfo.ts` | PUBLIC, anon, authenticated, service_role |
| `public.xmd_table_security(p_schema text, p_table text)` | table `(table_exists, rls_enabled, rls_forced)` | Inakagua kama table ipo na kama RLS imewashwa (T29). | `src/lib/milestone/dbProbe.ts` (gate ya milestones) | service_role pekee |

SQL kamili ya functions zote tatu (pamoja na `search_path` zao) iko ndani ya `docs/sql/supabase-schema-recreate.sql`
sehemu ya 3 — imenakiliwa neno kwa neno kutoka DB.

---

## 16. Storage (faili)

| Bucket | Public? | Kikomo cha faili | MIME | Faili | Ukubwa | Ina nini |
|---|---|---|---|---|---|---|
| `professor-xmd-files` | ✅ public read | 50 MB | zote | 500 | ≈ 674 MB | **Bucket kuu.** Majina ni UUID. Ndani: ≈440 **PNG** (screenshots za Computer `cu-<time>.png`), ≈52 **gzip** (snapshots za workspace `cu-ws-<id>-<time>.tar.gz` — zinatumika kurestore sandbox), ≈7 **JSON**, ≈4 **text/markdown** (ripoti `cu-report-…`). |
| `6ac2935d0038fbd47d5d` | ✅ public read | 50 MB | zote | 3 | ≈ 234 KB | **Legacy** — ID ya bucket ya Appwrite ya zamani (mf. `88ef0a2d-salvage-1010`). |

- **Storage policies:** hakuna. App inapakia/kupakua kwa service key; watu wa nje wanasoma kwa URL ya umma:
  `https://<project>.supabase.co/storage/v1/object/public/<bucket>/<fileId>` (`publicFileUrl` kwenye `supabase.ts`).
  E2B sandbox inahitaji URL hii iwe wazi ili kupakua snapshot wakati wa restore.
- Jina la bucket linaweza kubadilishwa kwa env `CU_SCREENSHOTS_BUCKET` (default `professor-xmd-files`).
- Code ya kupakia: `src/lib/server/appwrite.ts` (upload/download/list) na `src/lib/cu/engine.ts` (`storage.createFile`).
- **Faili zenyewe HAZIMO kwenye recreate script** — buckets zinaundwa tupu. Kuhamisha faili ni hatua tofauti (tazama §19).

---

## 17. Vitu vingine vya Supabase (vilikaguliwa)

| Kitu | Hali |
|---|---|
| Extensions zilizowashwa | `pgcrypto`, `uuid-ossp`, `pg_stat_statements` (schema `extensions`), `plpgsql`, `supabase_vault` — zote ni default za Supabase; app haitegemei hata moja moja kwa moja. |
| Auth (watumiaji) | 0 — app haitumii Supabase Auth. |
| Realtime | Publication `supabase_realtime` ipo lakini **haina table yoyote**. (supabase-js inapakia `ws` kwa ajili ya realtime, ila hakuna subscription.) |
| Vault (siri) | 0 |
| Cron jobs | Hakuna |
| Edge Functions | Hazijatumika |

---

## 18. Env vars (mipangilio ya app inayohusiana na hifadhi)

| Env | Lazima? | Maana |
|---|---|---|
| `SUPABASE_URL` | ✅ | URL ya project. ⚠️ **Code ina default iliyoandikwa ndani:** `https://pgxjepplhmyurkgohngn.supabase.co` — kwenye platform mpya **lazima** uweke env hii, la sivyo app itarudi kwenye project ya zamani. |
| `SUPABASE_SERVICE_KEY` (au `SUPABASE_KEY`) | ✅ | Service key (inapita RLS). |
| `CU_SCREENSHOTS_BUCKET` | hiari | Jina la bucket (default `professor-xmd-files`). |
| `SEARCH_CACHE_COLLECTION`, `REPORTS_COLLECTION_ID`, `AGENT_CHATS_COLLECTION_ID` | hiari | Majina mbadala ya tables (urithi wa Appwrite). Kawaida haziwekwi. |
| `APPWRITE_DATABASE_ID` | hapana | Legacy, haitumiki. |

---

## 19. Jinsi ya kujenga upya mahali pengine (hatua kwa hatua)

**A) Supabase nyingine (project/akaunti mpya) — rahisi zaidi, code haibadiliki:**
1. Unda project mpya ya Supabase.
2. Fungua **SQL Editor** → bandika `docs/sql/supabase-schema-recreate.sql` yote → Run. (Inaunda extensions, tables 13,
   keys, indexes, comments, RLS, grants, functions 3, buckets 2, na kupakia upya schema ya API.)
3. (Kama unataka data pia) hamisha rows table kwa table — kwa `pg_dump --data-only` au script ya node. *(Hati hii ni ya
   muundo tu, kama ulivyoagiza.)*
4. (Kama unataka faili pia) nakili faili za bucket `professor-xmd-files` (screenshots na snapshots). Kumbuka: `fileId`
   ndani ya `items` za sessions za zamani zinaelekeza kwenye majina haya — yahifadhi majina yaleyale.
5. Koyeb: badilisha env `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` → redeploy (**hakikisha hakuna session `running` kwanza**).

**B) Postgres nyingine isiyo Supabase (mf. Neon, Railway, VPS):**
- Tables, indexes, comments, functions → script inafanya kazi (ondoa/ruka mistari ya `grant … to anon/authenticated/service_role`
  na `storage.buckets` kama roles/schema hizo hazipo, au ziunde kwanza).
- ⚠️ App inatumia **supabase-js (PostgREST API + Storage API)**, si muunganiko wa moja kwa moja wa Postgres. Kwa hiyo
  Postgres tupu peke yake haitoshi — utahitaji PostgREST + huduma ya Storage (S3/R2) **au** kubadilisha
  `src/lib/server/supabase.ts` + `appwrite.ts`. Hiyo ni kazi ya code — inahitaji ruhusa ya CEO.

---

## 20. Dokezo: egress imetoka wapi? (ushahidi wa awali — sijabadilisha chochote)

Kutoka `pg_stat_statements` (takwimu za DB tangu 2026-10-09):

| Query | Mara | Maana |
|---|---|---|
| `SELECT boardroom_sessions.* … LIMIT/OFFSET` | **27,359** | Inavuta sessions **pamoja na `items` nzima** (historia iliyobanwa — mamia ya KB kwa session). Inatoka kwa `listDocuments(SESSIONS_COL…)` ya `sessionIndex.ts`, `reports.ts` na `/api/health` (inachukua session 1 nzima kila health check). UI inaomba orodha kila sekunde 60 kwa kila tab iliyo wazi (`AppState.tsx`). |
| `UPDATE boardroom_sessions SET items=…` | 10,570 | Kila uandishi wa session unaandika `items` yote upya. |
| `SELECT items, updated_at … WHERE id=` | 8,244 | Kusoma `items` za session moja. |
| `SELECT * … WHERE status=` | 6,845 | Auto-resume/kukagua sessions zinazoendelea (nazo zinavuta `items`). |

Table nzima ya `boardroom_sessions` ni ≈ 2.9 MB; ikivutwa makumi ya maelfu ya mara, inafika GB nyingi — hii
inaendana na 11.46 GB. Faili za Storage (screenshots PNG zinazoonyeshwa kwenye UI, snapshots za restore) nazo
zinaongeza egress. **Hii ni dalili kubwa, si uthibitisho wa 100%** (Supabase dashboard → Usage inaonyesha mgawanyo
halisi wa DB vs Storage).

Njia za kuchagua (zinahitaji uamuzi wa CEO — sijagusa code wala settings):
- **(a)** Kupandisha kwenda Supabase Pro (egress 250 GB) — haraka zaidi.
- **(b)** Kupunguza egress kwenye code: orodha ya sessions ichague columns tu (bila `items`), health check isivute `items`,
  kuongeza cache.
- **(c)** Kuhamia project/platform nyingine kwa kutumia hati hii + recreate script.
