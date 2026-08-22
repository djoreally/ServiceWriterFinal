-- Move workspace identity helper implementations out of the exposed public
-- schema while preserving the existing public function signatures used by RLS.
-- Also harden the service-record timestamp trigger against search_path changes.
-- This migration is intentionally not applied by this task.

begin;

create schema if not exists private;

-- The private implementations retain SECURITY DEFINER because these helpers are
-- called from RLS policies on the same tables they inspect. Constrain the search
-- path and schema-qualify every application relation and enum reference.
create or replace function private.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
  );
$$;

create or replace function private.is_workspace_staff(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role <> 'customer'::public.member_role
  );
$$;

create or replace function private.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = target_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active = true
      and wm.role in ('owner'::public.member_role, 'admin'::public.member_role)
  );
$$;

create or replace function private.is_customer_for_workspace(
  target_workspace_id uuid,
  target_customer_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, public, pg_temp
as $$
  select exists (
    select 1
    from public.customer_users cu
    join public.workspace_members wm
      on wm.workspace_id = cu.workspace_id
     and wm.user_id = cu.user_id
     and wm.is_active = true
    where cu.workspace_id = target_workspace_id
      and cu.customer_id = target_customer_id
      and cu.user_id = auth.uid()
  );
$$;

-- Compatibility wrappers preserve the signatures referenced by existing RLS
-- policies and legacy callers. They are invoker functions, not privilege-
-- elevating implementations.
create or replace function public.is_workspace_member(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select private.is_workspace_member(target_workspace_id);
$$;

create or replace function public.is_workspace_staff(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select private.is_workspace_staff(target_workspace_id);
$$;

create or replace function public.is_workspace_admin(target_workspace_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select private.is_workspace_admin(target_workspace_id);
$$;

create or replace function public.is_customer_for_workspace(
  target_workspace_id uuid,
  target_customer_id uuid
)
returns boolean
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  select private.is_customer_for_workspace(target_workspace_id, target_customer_id);
$$;

-- The private schema is not intended to be a PostgREST API schema. Authenticated
-- sessions need schema usage only so the invoker wrappers can resolve the
-- qualified private functions; anonymous sessions do not.
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

revoke all on function private.is_workspace_member(uuid) from public, anon;
revoke all on function private.is_workspace_staff(uuid) from public, anon;
revoke all on function private.is_workspace_admin(uuid) from public, anon;
revoke all on function private.is_customer_for_workspace(uuid, uuid) from public, anon;
grant execute on function private.is_workspace_member(uuid) to authenticated;
grant execute on function private.is_workspace_staff(uuid) to authenticated;
grant execute on function private.is_workspace_admin(uuid) to authenticated;
grant execute on function private.is_customer_for_workspace(uuid, uuid) to authenticated;

-- Keep the compatibility RPCs available only to authenticated sessions.
revoke all on function public.is_workspace_member(uuid) from public, anon;
revoke all on function public.is_workspace_staff(uuid) from public, anon;
revoke all on function public.is_workspace_admin(uuid) from public, anon;
revoke all on function public.is_customer_for_workspace(uuid, uuid) from public, anon;
grant execute on function public.is_workspace_member(uuid) to authenticated;
grant execute on function public.is_workspace_staff(uuid) to authenticated;
grant execute on function public.is_workspace_admin(uuid) to authenticated;
grant execute on function public.is_customer_for_workspace(uuid, uuid) to authenticated;

-- Trigger functions should not be security-definer. Fix the search_path and
-- qualify now() so arbitrary role/session search_path settings cannot alter
-- name resolution. Authenticated and service-role writes may fire the trigger;
-- anonymous sessions are not granted direct execution.
create or replace function public.touch_service_records_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at = pg_catalog.now();
  return new;
end;
$$;

revoke all on function public.touch_service_records_updated_at() from public, anon;
grant execute on function public.touch_service_records_updated_at() to authenticated, service_role;

commit;
