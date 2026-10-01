-- Repair tenant-scoped composite foreign keys that used ON DELETE SET NULL
-- across both workspace_id and the nullable relationship column.
-- PostgreSQL supports a column list for SET NULL, allowing workspace_id
-- to remain stable while only the nullable reference is cleared.

do $$
declare
  r record;
  nullable_cols text;
  corrected_def text;
begin
  for r in
    select
      c.oid,
      c.conrelid,
      n.nspname as schema_name,
      cls.relname as table_name,
      c.conname,
      c.conkey,
      pg_get_constraintdef(c.oid) as constraint_def
    from pg_constraint c
    join pg_class cls on cls.oid = c.conrelid
    join pg_namespace n on n.oid = cls.relnamespace
    where c.contype = 'f'
      and n.nspname = 'public'
      and array_length(c.conkey, 1) > 1
      and pg_get_constraintdef(c.oid) ilike '%ON DELETE SET NULL%'
      and exists (
        select 1
        from unnest(c.conkey) as key(attnum)
        join pg_attribute a
          on a.attrelid = c.conrelid
         and a.attnum = key.attnum
        where a.attnotnull
      )
  loop
    select string_agg(quote_ident(a.attname), ', ' order by ord.n)
      into nullable_cols
    from unnest(r.conkey) with ordinality ord(attnum, n)
    join pg_attribute a
      on a.attrelid = r.conrelid
     and a.attnum = ord.attnum
    where not a.attnotnull;

    if nullable_cols is null then
      raise exception 'Cannot repair %.%: no nullable child FK columns', r.table_name, r.conname;
    end if;

    corrected_def := replace(
      r.constraint_def,
      'ON DELETE SET NULL',
      'ON DELETE SET NULL (' || nullable_cols || ')'
    );

    execute format(
      'alter table %I.%I drop constraint %I',
      r.schema_name, r.table_name, r.conname
    );
    execute format(
      'alter table %I.%I add constraint %I %s',
      r.schema_name, r.table_name, r.conname, corrected_def
    );
  end loop;
end $$;
