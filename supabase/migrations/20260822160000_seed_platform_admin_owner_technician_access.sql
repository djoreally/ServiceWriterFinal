-- Seed the explicitly authorized multi-access account and align the identity RPC.
-- This migration is intentionally limited to djoreally@gmail.com and one workspace.

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default timezone('utc'::text, now())
);

alter table public.user_roles enable row level security;

revoke all on table public.user_roles from public;
revoke all on table public.user_roles from anon;
grant select on table public.user_roles to authenticated;

drop policy if exists user_roles_self_select on public.user_roles;
create policy user_roles_self_select
on public.user_roles
for select
to authenticated
using (user_id = auth.uid());

insert into public.user_roles (user_id, role)
select u.id, 'admin'::public.app_role
from auth.users u
where lower(u.email) = lower('djoreally@gmail.com')
on conflict (user_id) do update
set role = excluded.role;

insert into public.workspaces (name, slug, kind, app_role, timezone, currency_code, is_active, created_by)
select
  'DJ Mobile Oil Change',
  'dj-mobile-oil-change',
  'shop'::public.workspace_kind,
  'user'::public.app_role,
  'UTC',
  'USD',
  true,
  u.id
from auth.users u
where lower(u.email) = lower('djoreally@gmail.com')
on conflict do nothing;

update public.workspaces w
set
  name = 'DJ Mobile Oil Change',
  app_role = 'user'::public.app_role,
  is_active = true,
  created_by = u.id,
  updated_at = timezone('utc'::text, now())
from auth.users u
where w.slug = 'dj-mobile-oil-change'
  and lower(u.email) = lower('djoreally@gmail.com');

insert into public.workspace_members (workspace_id, user_id, role, is_active)
select w.id, u.id, 'owner'::public.member_role, true
from public.workspaces w
cross join auth.users u
where w.slug = 'dj-mobile-oil-change'
  and lower(u.email) = lower('djoreally@gmail.com')
on conflict do nothing;

update public.workspace_members wm
set role = 'owner'::public.member_role,
    is_active = true,
    updated_at = timezone('utc'::text, now())
from public.workspaces w, auth.users u
where wm.workspace_id = w.id
  and wm.user_id = u.id
  and w.slug = 'dj-mobile-oil-change'
  and lower(u.email) = lower('djoreally@gmail.com');

create or replace function public.get_workforce_identity_v1()
returns table (
  workspace_user_id uuid,
  workspace_name text,
  role text,
  landing_path text,
  is_default boolean
)
language sql
stable
security invoker
set search_path = public
as $function$
  with memberships as (
    select
      wm.user_id as workspace_user_id,
      w.name as workspace_name,
      case when w.created_by = auth.uid() then 'owner' else wm.role::text end as role,
      case
        when w.created_by = auth.uid() then '/dashboard'
        when wm.role::text = 'technician' then '/tech-app'
        when wm.role::text in ('dispatcher', 'fleet_manager') then '/dispatch'
        else '/dashboard'
      end as landing_path,
      (w.created_by = auth.uid()) as is_default
    from public.workspace_members wm
    join public.workspaces w on w.id = wm.workspace_id
    where wm.user_id = auth.uid()
      and wm.is_active = true
      and w.is_active = true

    union all

    select
      w.created_by as workspace_user_id,
      w.name as workspace_name,
      'owner' as role,
      '/dashboard' as landing_path,
      true as is_default
    from public.workspaces w
    where w.created_by = auth.uid()
      and w.is_active = true
      and not exists (
        select 1
        from public.workspace_members wm
        where wm.workspace_id = w.id
          and wm.user_id = auth.uid()
          and wm.is_active = true
      )

    union all

    -- A single-member owner is also the technician for that workspace.
    select
      w.created_by as workspace_user_id,
      w.name as workspace_name,
      'technician' as role,
      '/tech-app' as landing_path,
      false as is_default
    from public.workspaces w
    where w.created_by = auth.uid()
      and w.is_active = true
  )
  select distinct on (workspace_user_id, workspace_name, role)
    workspace_user_id,
    workspace_name,
    role,
    landing_path,
    is_default
  from memberships
  order by
    workspace_user_id,
    workspace_name,
    role,
    is_default desc;
$function$;

revoke all on function public.get_workforce_identity_v1() from public;
revoke all on function public.get_workforce_identity_v1() from anon;
grant execute on function public.get_workforce_identity_v1() to authenticated;
