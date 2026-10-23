-- ============================================================================
-- PROFESSOR-XMD — SUPABASE SCHEMA KAMILI (bila data) · imetolewa moja kwa moja kutoka catalog ya Postgres
-- Chanzo: project pgxjepplhmyurkgohngn · PostgreSQL 17.11 · 2026-10-23T08:45:43.914Z
-- Jinsi ya kutumia: endesha faili hili lote kwenye SQL Editor ya project MPYA ya Supabase (au psql).
-- Ni salama kuendesha mara mbili (IF NOT EXISTS / OR REPLACE / ON CONFLICT).
-- Maelezo ya kila table/column: docs/SUPABASE-SCHEMA.md · Imejaribiwa: docs/tests/task-38.md
-- ============================================================================

-- 1) EXTENSIONS (Supabase huwa nazo kwa default; hizi ndizo zilizowashwa)
create extension if not exists pg_stat_statements with schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists "uuid-ossp" with schema extensions;

-- 2) TABLES (13)

-- ---------------------------------------------------------------- agent_conversations
create table if not exists public.agent_conversations (
  id text not null,
  agent_id text not null,
  thread_id text not null,
  seq integer not null,
  role text not null,
  content text,
  thinking text,
  search_query text,
  sources text,
  status text,
  seconds integer,
  feedback text,
  model text,
  prompt_tokens integer,
  completion_tokens integer,
  total_tokens integer,
  tokens_exact boolean,
  requests integer,
  created_at timestamp with time zone default now(),
  constraint agent_conversations_pkey PRIMARY KEY (id)
);
create index if not exists idx_agent_created on public.agent_conversations USING btree (created_at);
create index if not exists idx_agent_thread_seq on public.agent_conversations USING btree (agent_id, thread_id, seq);
create index if not exists idx_role_created on public.agent_conversations USING btree (role, created_at);
alter table public.agent_conversations enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.agent_conversations to anon;
grant delete, insert, references, select, trigger, truncate, update on public.agent_conversations to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.agent_conversations to service_role;

-- ---------------------------------------------------------------- agent_memory
create table if not exists public.agent_memory (
  agent_id text not null,
  data jsonb default '{}'::jsonb not null,
  updated_at timestamp with time zone default now(),
  constraint agent_memory_pkey PRIMARY KEY (agent_id)
);
alter table public.agent_memory enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.agent_memory to anon;
grant delete, insert, references, select, trigger, truncate, update on public.agent_memory to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.agent_memory to service_role;

-- ---------------------------------------------------------------- board_items
create table if not exists public.board_items (
  session_id text not null,
  seq integer not null,
  item jsonb not null,
  constraint board_items_pkey PRIMARY KEY (session_id, seq)
);
comment on table public.board_items is 'DISCUSSION conversation storage — kila item ya mjadala = row moja (session_id,seq,item). Column ya item: jsonb — HAKUNA kikomo cha herufi (hadi 1GB kwa kila value; proof: 2,000,000 chars tested 2026-10-09). Mwenge wa Mkuu R42.';
alter table public.board_items enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.board_items to anon;
grant delete, insert, references, select, trigger, truncate, update on public.board_items to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.board_items to service_role;

-- ---------------------------------------------------------------- board_ledger
create table if not exists public.board_ledger (
  id text not null,
  status text default 'ACTIVE'::text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  constraint board_ledger_pkey PRIMARY KEY (id)
);
create index if not exists idx_ledger_status on public.board_ledger USING btree (status);
alter table public.board_ledger enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.board_ledger to anon;
grant delete, insert, references, select, trigger, truncate, update on public.board_ledger to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.board_ledger to service_role;

-- ---------------------------------------------------------------- boardroom_sessions
create table if not exists public.boardroom_sessions (
  id text not null,
  project text,
  title text,
  status text,
  mode text default 'code'::text,
  items text,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint boardroom_sessions_pkey PRIMARY KEY (id)
);
create index if not exists idx_brs_status on public.boardroom_sessions USING btree (status);
comment on table public.boardroom_sessions is 'Session META tu (project/title/status). Discussion items -> board_items. Computer events -> cu_events. Legacy packed items column: text (∞) kwa sessions za zamani za Appwrite.';
alter table public.boardroom_sessions enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.boardroom_sessions to anon;
grant delete, insert, references, select, trigger, truncate, update on public.boardroom_sessions to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.boardroom_sessions to service_role;

-- ---------------------------------------------------------------- cu_events
create table if not exists public.cu_events (
  session_id text not null,
  seq integer not null,
  ev jsonb not null,
  constraint cu_events_pkey PRIMARY KEY (session_id, seq)
);
comment on table public.cu_events is 'XMD COMPUTER conversation storage (collection MPYA) — kila event ya Computer = row moja (session_id,seq,ev). Column ya ev: jsonb — HAKUNA kikomo (hadi 1GB kwa value; proof: 2,000,000 chars tested 2026-10-09). Sep na discussion: R42.';
alter table public.cu_events enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.cu_events to anon;
grant delete, insert, references, select, trigger, truncate, update on public.cu_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cu_events to service_role;

-- ---------------------------------------------------------------- cu_files
create table if not exists public.cu_files (
  session_id text not null,
  path text not null,
  content text default ''::text not null,
  bytes integer default 0 not null,
  updated_at timestamp with time zone default now() not null,
  constraint cu_files_pkey PRIMARY KEY (session_id, path)
);
comment on table public.cu_files is 'R44-A: kiovu cha faili za agent (kila write/edit mara moja) — restore ya sandbox mpya';
alter table public.cu_files disable row level security;  -- (hali halisi: RLS IMEZIMWA kwenye table hii)
grant delete, insert, references, select, trigger, truncate, update on public.cu_files to anon;
grant delete, insert, references, select, trigger, truncate, update on public.cu_files to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cu_files to service_role;

-- ---------------------------------------------------------------- cu_state
create table if not exists public.cu_state (
  session_id text not null,
  chip jsonb not null,
  updated_at timestamp with time zone default now(),
  constraint cu_state_pkey PRIMARY KEY (session_id)
);
comment on table public.cu_state is 'XMD COMPUTER state chip (sandbox/token/maxI/snapshot) — row MOJA kwa session, inayoupdate.';
alter table public.cu_state enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.cu_state to anon;
grant delete, insert, references, select, trigger, truncate, update on public.cu_state to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.cu_state to service_role;

-- ---------------------------------------------------------------- memory_events
create table if not exists public.memory_events (
  id text not null,
  agent_id text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  constraint memory_events_pkey PRIMARY KEY (id)
);
create index if not exists idx_me_agent on public.memory_events USING btree (agent_id);
alter table public.memory_events enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.memory_events to anon;
grant delete, insert, references, select, trigger, truncate, update on public.memory_events to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.memory_events to service_role;

-- ---------------------------------------------------------------- mini_reports
create table if not exists public.mini_reports (
  id text not null,
  session_id text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  constraint mini_reports_pkey PRIMARY KEY (id)
);
alter table public.mini_reports enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.mini_reports to anon;
grant delete, insert, references, select, trigger, truncate, update on public.mini_reports to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.mini_reports to service_role;

-- ---------------------------------------------------------------- project_plans
create table if not exists public.project_plans (
  id text not null,
  session_id text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  constraint project_plans_pkey PRIMARY KEY (id)
);
create unique index if not exists idx_plans_session on public.project_plans USING btree (session_id);
alter table public.project_plans enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.project_plans to anon;
grant delete, insert, references, select, trigger, truncate, update on public.project_plans to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.project_plans to service_role;

-- ---------------------------------------------------------------- reports
create table if not exists public.reports (
  id text not null,
  session_id text,
  data jsonb default '{}'::jsonb not null,
  created_at timestamp with time zone default now(),
  constraint reports_pkey PRIMARY KEY (id)
);
create index if not exists idx_reports_created on public.reports USING btree (created_at DESC);
alter table public.reports enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.reports to anon;
grant delete, insert, references, select, trigger, truncate, update on public.reports to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.reports to service_role;

-- ---------------------------------------------------------------- search_cache
create table if not exists public.search_cache (
  id text not null,
  space text,
  query text,
  vector text,
  results text,
  hits integer,
  dims integer,
  created_at timestamp with time zone default now(),
  constraint search_cache_pkey PRIMARY KEY (id)
);
create index if not exists idx_sc_space on public.search_cache USING btree (space, created_at DESC);
alter table public.search_cache enable row level security;
grant delete, insert, references, select, trigger, truncate, update on public.search_cache to anon;
grant delete, insert, references, select, trigger, truncate, update on public.search_cache to authenticated;
grant delete, insert, references, select, trigger, truncate, update on public.search_cache to service_role;

-- 3) FUNCTIONS (3) — zote SECURITY DEFINER

CREATE OR REPLACE FUNCTION public.db_size()
 RETURNS bigint
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$ SELECT pg_database_size(current_database()) $function$;
revoke all on function public.db_size() from public, anon, authenticated;
grant execute on function public.db_size() to anon;
grant execute on function public.db_size() to authenticated;
grant execute on function public.db_size() to service_role;
grant execute on function public.db_size() to public;

CREATE OR REPLACE FUNCTION public.storage_stats()
 RETURNS json
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'storage'
AS $function$ SELECT json_build_object(
  'bytes', (SELECT coalesce(sum((metadata->>'size')::bigint), 0) FROM storage.objects),
  'count', (SELECT count(*) FROM storage.objects),
  'buckets', (SELECT count(*) FROM storage.buckets)
) $function$;
revoke all on function public.storage_stats() from public, anon, authenticated;
grant execute on function public.storage_stats() to anon;
grant execute on function public.storage_stats() to authenticated;
grant execute on function public.storage_stats() to service_role;
grant execute on function public.storage_stats() to public;

CREATE OR REPLACE FUNCTION public.xmd_table_security(p_schema text, p_table text)
 RETURNS TABLE(table_exists boolean, rls_enabled boolean, rls_forced boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
  select count(*) > 0,
         coalesce(bool_or(c.relrowsecurity), false),
         coalesce(bool_or(c.relforcerowsecurity), false)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema and c.relname = p_table and c.relkind in ('r', 'p');
$function$;
revoke all on function public.xmd_table_security(text, text) from public, anon, authenticated;
grant execute on function public.xmd_table_security(text, text) to service_role;

-- 4) STORAGE BUCKETS (2) — faili zenyewe HAZIMO hapa
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('6ac2935d0038fbd47d5d', '6ac2935d0038fbd47d5d', true, 52428800, NULL) on conflict (id) do nothing;
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('professor-xmd-files', 'professor-xmd-files', true, 52428800, NULL) on conflict (id) do nothing;
-- storage policies: hakuna (0) — server inatumia service key; bucket ni public kwa kusoma kupitia /storage/v1/object/public/...

-- 5) PostgREST: pakia schema mpya
notify pgrst, 'reload schema';
