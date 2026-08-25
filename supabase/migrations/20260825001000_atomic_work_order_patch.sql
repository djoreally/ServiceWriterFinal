create or replace function public.patch_work_order_v1(
  p_workspace_id uuid,
  p_work_order_id uuid,
  p_patch jsonb
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_current public.work_orders%rowtype;
  v_technician_id uuid;
  v_assignment_time timestamptz := now();
  v_new_status public.work_order_status;
  v_metadata jsonb;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if jsonb_typeof(coalesce(p_patch,'{}'::jsonb)) <> 'object' then raise exception 'p_patch must be a JSON object'; end if;

  select * into v_current
  from public.work_orders
  where workspace_id=p_workspace_id and id=p_work_order_id
  for update;
  if not found then raise exception 'Work order not found'; end if;

  v_new_status := case when p_patch ? 'status' then (p_patch->>'status')::public.work_order_status else v_current.status end;
  v_metadata := coalesce(v_current.metadata,'{}'::jsonb);

  if p_patch ? 'signature_url' then v_metadata := jsonb_set(v_metadata,'{signature_url}',coalesce(p_patch->'signature_url','null'::jsonb),true); end if;
  if p_patch ? 'vin_captured' then v_metadata := jsonb_set(v_metadata,'{vin_captured}',coalesce(p_patch->'vin_captured','null'::jsonb),true); end if;
  if p_patch ? 'mileage_captured' then v_metadata := jsonb_set(v_metadata,'{mileage_captured}',coalesce(p_patch->'mileage_captured','null'::jsonb),true); end if;
  if p_patch ? 'started_at' then v_metadata := jsonb_set(v_metadata,'{started_at}',coalesce(p_patch->'started_at','null'::jsonb),true); end if;
  if p_patch ? 'tech_notes' then v_metadata := jsonb_set(v_metadata,'{tech_notes}',coalesce(p_patch->'tech_notes','null'::jsonb),true); end if;

  update public.work_orders
  set
    status = v_new_status,
    priority = case when p_patch ? 'priority' then (p_patch->>'priority')::public.work_order_priority else priority end,
    complaint = case when p_patch ? 'complaint' then p_patch->>'complaint' else complaint end,
    diagnosis = case when p_patch ? 'diagnosis' then p_patch->>'diagnosis' else diagnosis end,
    technician_notes = case
      when p_patch ? 'technician_notes' then p_patch->>'technician_notes'
      when p_patch ? 'tech_notes' then p_patch->>'tech_notes'
      else technician_notes end,
    completed_at = case
      when p_patch ? 'completed_at' then nullif(p_patch->>'completed_at','')::timestamptz
      when v_new_status='completed'::public.work_order_status and v_current.status <> 'completed'::public.work_order_status then now()
      else completed_at end,
    metadata = v_metadata,
    updated_at = now()
  where workspace_id=p_workspace_id and id=p_work_order_id;

  if p_patch ? 'technician_id' then
    v_technician_id := nullif(p_patch->>'technician_id','')::uuid;
    if v_technician_id is not null then
      perform 1 from public.workspace_members
      where workspace_id=p_workspace_id and user_id=v_technician_id and is_active=true;
      if not found then raise exception 'Assigned technician is not an active workspace member'; end if;
    end if;

    update public.work_order_assignments
    set unassigned_at=v_assignment_time
    where workspace_id=p_workspace_id and work_order_id=p_work_order_id and unassigned_at is null;

    if v_technician_id is not null then
      insert into public.work_order_assignments(workspace_id,work_order_id,user_id,assigned_by,assigned_at,unassigned_at)
      values(p_workspace_id,p_work_order_id,v_technician_id,v_actor,v_assignment_time,null)
      on conflict (work_order_id,user_id) do update
      set assigned_by=excluded.assigned_by, assigned_at=excluded.assigned_at, unassigned_at=null;
    end if;
  end if;

  if v_new_status is distinct from v_current.status then
    insert into public.work_order_events(workspace_id,work_order_id,actor_user_id,event_type,from_status,to_status,payload)
    values(p_workspace_id,p_work_order_id,v_actor,'status_changed',v_current.status,v_new_status,'{}'::jsonb);
  end if;

  return p_work_order_id;
end;
$$;

grant execute on function public.patch_work_order_v1(uuid,uuid,jsonb) to authenticated;
revoke execute on function public.patch_work_order_v1(uuid,uuid,jsonb) from anon;
