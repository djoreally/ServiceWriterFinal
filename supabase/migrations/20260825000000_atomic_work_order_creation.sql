create or replace function public.create_work_order_v1(
  p_workspace_id uuid,
  p_payload jsonb
) returns table(id uuid, number bigint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_customer_id uuid := nullif(p_payload->>'customer_id','')::uuid;
  v_vehicle_id uuid := nullif(p_payload->>'vehicle_id','')::uuid;
  v_appointment_id uuid := nullif(p_payload->>'appointment_id','')::uuid;
  v_location_id uuid := nullif(p_payload->>'location_id','')::uuid;
  v_technician_id uuid := nullif(p_payload->>'technician_id','')::uuid;
  v_priority public.work_order_priority := coalesce(nullif(p_payload->>'priority','')::public.work_order_priority, 'normal'::public.work_order_priority);
  v_number bigint;
  v_id uuid;
  v_vehicle_customer uuid;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  if v_customer_id is null then raise exception 'Customer is required'; end if;

  perform 1 from public.customers where workspace_id=p_workspace_id and id=v_customer_id and status <> 'archived';
  if not found then raise exception 'Customer does not belong to this workspace'; end if;

  if v_vehicle_id is not null then
    select customer_id into v_vehicle_customer from public.vehicles
    where workspace_id=p_workspace_id and id=v_vehicle_id and status <> 'archived';
    if not found then raise exception 'Vehicle does not belong to this workspace'; end if;
    if v_vehicle_customer is not null and v_vehicle_customer <> v_customer_id then
      raise exception 'Vehicle does not belong to the selected customer';
    end if;
  end if;

  if v_appointment_id is not null then
    perform 1 from public.appointments where workspace_id=p_workspace_id and id=v_appointment_id;
    if not found then raise exception 'Appointment does not belong to this workspace'; end if;
  end if;

  if v_location_id is not null then
    perform 1 from public.locations where workspace_id=p_workspace_id and id=v_location_id;
    if not found then raise exception 'Location does not belong to this workspace'; end if;
  end if;

  if v_technician_id is not null then
    perform 1 from public.workspace_members
    where workspace_id=p_workspace_id and user_id=v_technician_id and is_active=true;
    if not found then raise exception 'Assigned technician is not an active workspace member'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_workspace_id::text, 0));
  select coalesce(max(wo.number),0)+1 into v_number
  from public.work_orders wo where wo.workspace_id=p_workspace_id;

  insert into public.work_orders(
    workspace_id, appointment_id, customer_id, vehicle_id, location_id,
    status, priority, number, complaint, diagnosis, technician_notes,
    opened_at, created_by, metadata
  ) values (
    p_workspace_id, v_appointment_id, v_customer_id, v_vehicle_id, v_location_id,
    case when v_technician_id is null then 'draft'::public.work_order_status else 'assigned'::public.work_order_status end,
    v_priority, v_number,
    nullif(p_payload->>'complaint',''), nullif(p_payload->>'diagnosis',''), nullif(p_payload->>'technician_notes',''),
    now(), v_actor, coalesce(p_payload->'metadata','{}'::jsonb)
  ) returning work_orders.id into v_id;

  if v_technician_id is not null then
    insert into public.work_order_assignments(workspace_id,work_order_id,user_id,assigned_by,assigned_at)
    values(p_workspace_id,v_id,v_technician_id,v_actor,now());
  end if;

  if v_appointment_id is not null then
    update public.appointments
    set status='in_progress', updated_at=now()
    where workspace_id=p_workspace_id and appointments.id=v_appointment_id;
  end if;

  return query select v_id, v_number;
end;
$$;

grant execute on function public.create_work_order_v1(uuid,jsonb) to authenticated;
revoke execute on function public.create_work_order_v1(uuid,jsonb) from anon;
