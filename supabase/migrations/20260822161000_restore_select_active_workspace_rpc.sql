-- Restore the authenticated workspace-selection boundary used by role routing.

create or replace function public.select_active_workspace_v1(
  p_owner_user_id uuid,
  p_role text default null
)
returns table (
  workspace_user_id uuid,
  role text,
  landing_path text
)
language sql
stable
security invoker
set search_path = public
as $function$
  select
    wm.user_id as workspace_user_id,
    case
      when w.created_by = auth.uid() and coalesce(p_role, wm.role::text) = 'owner' then 'owner'
      else wm.role::text
    end as role,
    case
      when coalesce(p_role, wm.role::text) = 'technician' then '/tech-app'
      when coalesce(p_role, wm.role::text) in ('dispatcher', 'fleet_manager') then '/dispatch'
      else '/dashboard'
    end as landing_path
  from public.workspace_members wm
  join public.workspaces w on w.id = wm.workspace_id
  where wm.user_id = p_owner_user_id
    and wm.user_id = auth.uid()
    and wm.is_active = true
    and w.is_active = true
    and (
      p_role is null
      or wm.role::text = p_role
      or (p_role = 'technician' and w.created_by = auth.uid())
    )
  order by
    case coalesce(p_role, wm.role::text)
      when 'owner' then 0
      when 'admin' then 0
      when 'manager' then 1
      when 'dispatcher' then 1
      when 'fleet_manager' then 1
      when 'technician' then 2
      else 3
    end,
    w.name
  limit 1;
$function$;

revoke all on function public.select_active_workspace_v1(uuid, text) from public;
revoke all on function public.select_active_workspace_v1(uuid, text) from anon;
grant execute on function public.select_active_workspace_v1(uuid, text) to authenticated;
