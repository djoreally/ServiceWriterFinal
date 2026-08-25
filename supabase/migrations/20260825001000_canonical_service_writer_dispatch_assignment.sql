create or replace function public.assign_dispatch_job_v1(
  p_workspace_id uuid,
  p_job_source text,
  p_job_id uuid,
  p_technician_id uuid default null,
  p_notes text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_old_tech uuid;
  v_old_status text;
  v_new_status text;
  v_event text;
begin
  if v_actor is null or not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = v_actor
      and wm.is_active
      and wm.role::text = any(array['owner','admin','manager','service_advisor','dispatcher'])
  ) then
    raise exception 'dispatch_assignment_access_denied';
  end if;

  if p_technician_id is not null and not exists (
    select 1 from public.workspace_members wm
    where wm.workspace_id = p_workspace_id
      and wm.user_id = p_technician_id
      and wm.is_active
      and wm.role::text = any(array['technician','owner','manager'])
  ) then
    raise exception 'technician_unavailable';
  end if;

  if p_job_source = 'appointment' then
    select a.assigned_user_id, a.status::text into v_old_tech, v_old_status
    from public.appointments a
    where a.workspace_id = p_workspace_id and a.id = p_job_id
    for update;
    if not found then raise exception 'appointment_not_found'; end if;

    update public.appointments a
    set assigned_user_id = p_technician_id,
        metadata = jsonb_set(
          jsonb_set(coalesce(a.metadata,'{}'::jsonb), '{dispatch_status}', to_jsonb(case when p_technician_id is null then 'unassigned' else 'assigned' end::text), true),
          '{assigned_at}', case when p_technician_id is null then 'null'::jsonb else to_jsonb(now()::text) end, true
        ) || case when p_notes is null then '{}'::jsonb else jsonb_build_object('dispatch_notes',p_notes) end
    where a.workspace_id = p_workspace_id and a.id = p_job_id;

    v_event := case when p_technician_id is null then 'unassigned' when v_old_tech is null then 'assigned' when v_old_tech = p_technician_id then 'assignment_confirmed' else 'reassigned' end;
    insert into public.dispatch_events(workspace_id,appointment_id,technician_id,event_type,previous_status,new_status,notes,performed_by)
    values(p_workspace_id,p_job_id,p_technician_id,v_event,v_old_status,v_old_status,p_notes,v_actor);

    return jsonb_build_object('job_source','appointment','job_id',p_job_id,'technician_id',p_technician_id,'event',v_event);
  elsif p_job_source = 'work_order' then
    select wo.status::text into v_old_status
    from public.work_orders wo
    where wo.workspace_id = p_workspace_id and wo.id = p_job_id
    for update;
    if not found then raise exception 'work_order_not_found'; end if;

    select woa.user_id into v_old_tech
    from public.work_order_assignments woa
    where woa.workspace_id = p_workspace_id and woa.work_order_id = p_job_id and woa.unassigned_at is null
    order by woa.assigned_at desc
    limit 1;

    update public.work_order_assignments
    set unassigned_at = now()
    where workspace_id = p_workspace_id and work_order_id = p_job_id and unassigned_at is null;

    if p_technician_id is not null then
      insert into public.work_order_assignments(workspace_id,work_order_id,user_id,assigned_by,assigned_at,unassigned_at)
      values(p_workspace_id,p_job_id,p_technician_id,v_actor,now(),null)
      on conflict(work_order_id,user_id) do update
        set assigned_by = excluded.assigned_by, assigned_at = excluded.assigned_at, unassigned_at = null;
    end if;

    v_new_status := case
      when p_technician_id is not null and v_old_status in ('draft','scheduled') then 'assigned'
      when p_technician_id is null and v_old_status = 'assigned' then 'scheduled'
      else v_old_status
    end;

    update public.work_orders wo
    set status = v_new_status::public.work_order_status,
        metadata = jsonb_set(
          jsonb_set(coalesce(wo.metadata,'{}'::jsonb), '{dispatch_status}', to_jsonb(case when p_technician_id is null then 'unassigned' else 'assigned' end::text), true),
          '{assigned_at}', case when p_technician_id is null then 'null'::jsonb else to_jsonb(now()::text) end, true
        ) || case when p_notes is null then '{}'::jsonb else jsonb_build_object('dispatch_notes',p_notes) end
    where wo.workspace_id = p_workspace_id and wo.id = p_job_id;

    v_event := case when p_technician_id is null then 'unassigned' when v_old_tech is null then 'assigned' when v_old_tech = p_technician_id then 'assignment_confirmed' else 'reassigned' end;
    insert into public.dispatch_events(workspace_id,work_order_id,technician_id,event_type,previous_status,new_status,notes,performed_by)
    values(p_workspace_id,p_job_id,p_technician_id,v_event,v_old_status,v_new_status,p_notes,v_actor);

    return jsonb_build_object('job_source','work_order','job_id',p_job_id,'technician_id',p_technician_id,'event',v_event,'status',v_new_status);
  else
    raise exception 'unsupported_dispatch_source';
  end if;
end;
$$;

grant execute on function public.assign_dispatch_job_v1(uuid,text,uuid,uuid,text) to authenticated;
revoke execute on function public.assign_dispatch_job_v1(uuid,text,uuid,uuid,text) from anon, public;
