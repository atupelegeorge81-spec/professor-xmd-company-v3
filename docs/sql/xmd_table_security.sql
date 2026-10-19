-- TASK 29 (maelezo29) — DB checks za technical review: hali ya table (ipo? RLS ON?) kupitia Supabase client.
-- PostgREST haionyeshi pg_catalog, kwa hiyo function hii (service_role PEKEE) inasoma relrowsecurity.
-- Inatumika na src/lib/milestone/dbProbe.ts → supabase.rpc("xmd_table_security", { p_schema, p_table }).
create or replace function public.xmd_table_security(p_schema text, p_table text)
returns table (table_exists boolean, rls_enabled boolean, rls_forced boolean)
language sql
stable
security definer
set search_path = pg_catalog
as $$
  select count(*) > 0,
         coalesce(bool_or(c.relrowsecurity), false),
         coalesce(bool_or(c.relforcerowsecurity), false)
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = p_schema and c.relname = p_table and c.relkind in ('r', 'p');
$$;
revoke all on function public.xmd_table_security(text, text) from public, anon, authenticated;
grant execute on function public.xmd_table_security(text, text) to service_role;
notify pgrst, 'reload schema';
