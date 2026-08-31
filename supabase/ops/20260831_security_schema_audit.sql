-- Read-only security/schema evidence collection for Service Writer.
-- Run against the intended environment and retain the result with the release.
-- This reports catalog metadata only; it does not read tenant or customer data.

begin transaction read only;

-- SECURITY DEFINER routines exposed to browser roles. Every returned row needs
-- an explicit review; an empty result is the least-privilege target.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  has_function_privilege('anon', p.oid, 'execute') as anon_execute,
  has_function_privilege('authenticated', p.oid, 'execute') as authenticated_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and (
    has_function_privilege('anon', p.oid, 'execute')
    or has_function_privilege('authenticated', p.oid, 'execute')
  )
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- SECURITY DEFINER routines whose configured search_path is not empty. An
-- empty result proves the setting; routine bodies still require qualification review.
select
  n.nspname as function_schema,
  p.proname as function_name,
  pg_get_function_identity_arguments(p.oid) as identity_arguments,
  p.proconfig
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.prosecdef
  and not coalesce(p.proconfig, '{}'::text[]) @> array['search_path=""']
order by p.proname, pg_get_function_identity_arguments(p.oid);

-- Public tables without RLS enabled.
select n.nspname as table_schema, c.relname as table_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind in ('r', 'p')
  and not c.relrowsecurity
order by c.relname;

-- Browser-write policies are emitted for human review. Policy names alone are
-- not treated as proof that workspace isolation is correct.
select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
  and roles && array['anon', 'authenticated', 'public']::name[]
order by tablename, policyname;

-- Foreign keys whose referencing columns have no usable leading-column index.
select
  ns.nspname as table_schema,
  tbl.relname as table_name,
  con.conname as constraint_name,
  array_agg(att.attname order by key_position.ordinality) as referencing_columns
from pg_constraint con
join pg_class tbl on tbl.oid = con.conrelid
join pg_namespace ns on ns.oid = tbl.relnamespace
join unnest(con.conkey) with ordinality as key_position(attnum, ordinality) on true
join pg_attribute att on att.attrelid = con.conrelid and att.attnum = key_position.attnum
where con.contype = 'f'
  and ns.nspname = 'public'
  and not exists (
    select 1
    from pg_index idx
    where idx.indrelid = con.conrelid
      and idx.indisvalid
      and idx.indisready
      and idx.indpred is null
      and (idx.indkey::smallint[])[0:cardinality(con.conkey) - 1] = con.conkey
  )
group by ns.nspname, tbl.relname, con.conname
order by tbl.relname, con.conname;

rollback;
