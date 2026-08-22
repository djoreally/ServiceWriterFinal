-- Restore the authenticated workforce identity boundary used by the login shell.
-- The function is intentionally invoker-secured so workspace RLS remains authoritative.

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
      case
        when w.created_by = auth.uid() then 'owner'
        else wm.role::text
      end as role,
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
  )
  select
    memberships.workspace_user_id,
    memberships.workspace_name,
    memberships.role,
    memberships.landing_path,
    memberships.is_default
  from memberships
  order by
    case memberships.role
      when 'owner' then 0
      when 'admin' then 0
      when 'manager' then 1
      when 'dispatcher' then 1
      when 'fleet_manager' then 1
      when 'technician' then 2
      else 3
    end,
    memberships.workspace_name nulls last;
$function$;

revoke all on function public.get_workforce_identity_v1() from public;
grant execute on function public.get_workforce_identity_v1() to authenticated;
