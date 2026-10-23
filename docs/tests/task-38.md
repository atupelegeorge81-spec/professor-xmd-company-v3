# Task 38 — Muundo kamili wa Supabase (bila data) · ushahidi

Tarehe: 2026-10-23 · Agizo: CEO (onyo la egress 11.46 GB / 5.5 GB, mwisho 2026-10-25).
**Hakuna kilichobadilishwa kwenye Supabase.** Kila jaribio liliendeshwa ndani ya `BEGIN … ROLLBACK`.

## 1. Ukaguzi wa catalog (read-only)
- Zana: node `pg` (psql/pg_dump hazipo) → `xmdtest/schema/dump.mjs` → `docs/sql/supabase-schema.json`.
- Matokeo: PostgreSQL 17.11 · tables 13 · columns 73 · indexes 22 · constraints 13 (PK) · functions 3 · buckets 2 ·
  policies 0 · triggers 0 · views/sequences/types 0 · auth users 0 · vault 0 · realtime publication: tables 0.
- Secret scan ya JSON (`eyJ…`, `sk-…`, `postgres://`): **false** (hakuna siri).

## 2. Recreate script inajenga kitu kilekile (`xmdtest/schema/verify.mjs`)
Script (`gensql.mjs`) iliendeshwa kwenye schema ya majaribio `xmdtest_schemacheck`, ikalinganishwa na `public`:
```
cols public=73 recreated=73 SAWA ✓
idx  public=22 recreated=22 SAWA ✓
con  public=13 recreated=13 SAWA ✓
rls  public=13 recreated=13 SAWA ✓
gr   public=39 recreated=39 SAWA ✓
fn   public=3 recreated=3 SAWA ✓
schema ya majaribio imebaki? hapana (rollback ✓)
```

## 3. Inaweza kuendeshwa mara 2 bila kosa (`idem.mjs`)
```
mara 2 mfululizo: SAWA ✓ (hakuna kosa)
baki: 0
```

## 4. Mistari ya buckets inafanya kazi (`bkt.mjs`, majina `xmdtest-*`)
```
buckets za majaribio: [{"id":"xmdtest-6ac2935d0038fbd47d5d","public":true,"file_size_limit":"52428800"},{"id":"xmdtest-professor-xmd-files","public":true,"file_size_limit":"52428800"}]
baki: 0
```

## 5. Matumizi ya code (grep `src/ cu/ scripts/`)
- Zinatumika: boardroom_sessions, reports, project_plans, mini_reports, board_ledger, agent_memory, memory_events,
  agent_conversations, search_cache, cu_files.
- LEGACY (hakuna rejea kwenye code ya sasa): board_items, cu_events, cu_state — ziliundwa na R42 (`92a2475`),
  R42 ilirudishwa (`b45e4c1`).

## 6. Dalili ya chanzo cha egress (`pg_stat_statements`, tangu 2026-10-09)
| calls | query (kifupi) |
|---|---|
| 27,359 | `SELECT boardroom_sessions.* … LIMIT/OFFSET` (inavuta `items` nzima) |
| 10,570 | `UPDATE boardroom_sessions SET items=…` |
| 8,244 | `SELECT items, updated_at … WHERE id=` |
| 6,845 | `SELECT boardroom_sessions.* … WHERE status=` |

Baselines za code: hazihitajiki — hakuna code iliyobadilishwa (docs tu).
