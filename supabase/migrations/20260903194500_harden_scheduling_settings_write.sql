-- Restrict broad workspace_settings writes and provide a narrow scheduling RPC
-- for operational roles that need to manage availability without gaining access
-- to unrelated business, financial, or integration settings.

create or replace function public.update_workspace_scheduling_settings_v1(
  p_workspace_id uuid,
  p_day_hours jsonb,
  p_buffer_time_before integer,
  p_buffer_time_after integer,
  p_min_lead_time_hours integer,
  p_max_advance_days integer,
  p_allow_multi_day_bookings boolean,
  p_slot_duration_minutes integer,
  p_require_approval boolean,
  p_cancellation_window_hours integer,
  p_allow_cancellation boolean,
  p_allow_rescheduling boolean,
  p_reschedule_window_hours integer,
  p_terms_and_conditions text,
  p_require_terms_acceptance boolean
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '28000';
  end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role in ('owner','admin','manager','service_advisor','dispatcher','receptionist')
  ) then
    raise exception 'Insufficient permission to manage scheduling settings' using errcode = '42501';
  end if;

  if p_buffer_time_before < 0 or p_buffer_time_after < 0
     or p_min_lead_time_hours < 0 or p_max_advance_days < 1
     or p_slot_duration_minutes < 5 or p_slot_duration_minutes > 1440
     or p_cancellation_window_hours < 0 or p_reschedule_window_hours < 0 then
    raise exception 'Invalid scheduling settings' using errcode = '22023';
  end if;

  update public.workspace_settings
     set day_hours = coalesce(p_day_hours, '{}'::jsonb),
         buffer_time_before = p_buffer_time_before,
         buffer_time_after = p_buffer_time_after,
         min_lead_time_hours = p_min_lead_time_hours,
         max_advance_days = p_max_advance_days,
         allow_multi_day_bookings = p_allow_multi_day_bookings,
         slot_duration_minutes = p_slot_duration_minutes,
         require_approval = p_require_approval,
         cancellation_window_hours = p_cancellation_window_hours,
         allow_cancellation = p_allow_cancellation,
         allow_rescheduling = p_allow_rescheduling,
         reschedule_window_hours = p_reschedule_window_hours,
         terms_and_conditions = nullif(trim(coalesce(p_terms_and_conditions, '')), ''),
         require_terms_acceptance = p_require_terms_acceptance,
         updated_at = now()
   where workspace_id = p_workspace_id;

  if not found then
    raise exception 'Workspace settings not found' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.update_workspace_scheduling_settings_v1(uuid,jsonb,integer,integer,integer,integer,boolean,integer,boolean,integer,boolean,boolean,integer,text,boolean) from public;
grant execute on function public.update_workspace_scheduling_settings_v1(uuid,jsonb,integer,integer,integer,integer,boolean,integer,boolean,integer,boolean,boolean,integer,text,boolean) to authenticated, service_role;

-- Direct writes to the full settings row are management-only. Operational roles
-- use narrow RPCs such as update_workspace_scheduling_settings_v1 instead.
drop policy if exists workspace_settings_staff_write on public.workspace_settings;
create policy workspace_settings_management_write on public.workspace_settings
  for all to authenticated
  using (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_settings.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role in ('owner','admin','manager')
  ))
  with check (exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = workspace_settings.workspace_id
      and wm.user_id = auth.uid()
      and wm.is_active
      and wm.role in ('owner','admin','manager')
  ));
