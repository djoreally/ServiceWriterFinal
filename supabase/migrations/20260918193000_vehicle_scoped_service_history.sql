-- Non-fleet appointments remain the work-order boundary, but service history is per vehicle.
-- One appointment may therefore own multiple service_records while retaining one aggregate invoice/payment.
alter table public.service_records
  drop constraint if exists service_records_workspace_appointment_key;

create unique index if not exists service_records_workspace_appointment_vehicle_uidx
  on public.service_records(workspace_id, appointment_id, vehicle_id)
  where appointment_id is not null and vehicle_id is not null;

-- Prevent ambiguous multi-vehicle history: every appointment item in a multi-vehicle
-- appointment must carry its vehicle attribution before closeout.
create or replace function public.assert_appointment_vehicle_attribution_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns uuid[]
language plpgsql
security definer
set search_path=public
as $$
declare
  v_default_vehicle uuid;
  v_vehicle_ids uuid[];
  v_vehicle_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;

  select vehicle_id into v_default_vehicle
  from public.appointments
  where workspace_id=p_workspace_id and id=p_appointment_id;
  if not found then raise exception 'Appointment not found'; end if;

  if exists(
    select 1 from public.appointment_items ai
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and ai.metadata->>'vehicle_id' is not null
      and not exists(
        select 1 from public.vehicles v
        where v.workspace_id=p_workspace_id
          and v.id=(ai.metadata->>'vehicle_id')::uuid
      )
  ) then raise exception 'Appointment item references a vehicle outside the workspace'; end if;

  select array_agg(distinct coalesce((ai.metadata->>'vehicle_id')::uuid,v_default_vehicle))
  into v_vehicle_ids
  from public.appointment_items ai
  where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id;

  v_vehicle_count := coalesce(array_length(v_vehicle_ids,1),0);
  if v_vehicle_count=0 and v_default_vehicle is not null then
    v_vehicle_ids := array[v_default_vehicle];
  end if;
  if v_vehicle_ids is null or array_length(v_vehicle_ids,1)=0 then
    raise exception 'Appointment has no vehicle attribution';
  end if;
  return v_vehicle_ids;
end $$;

revoke all on function public.assert_appointment_vehicle_attribution_v1(uuid,uuid) from public,anon;
grant execute on function public.assert_appointment_vehicle_attribution_v1(uuid,uuid) to authenticated,service_role;

create or replace function public.sync_appointment_vehicle_service_records_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns uuid[]
language plpgsql
security definer
set search_path=public
as $$
declare
  v_actor uuid:=auth.uid();
  v_appt public.appointments%rowtype;
  v_vehicle_ids uuid[];
  v_vehicle_id uuid;
  v_record_id uuid;
  v_record_ids uuid[]:='{}'::uuid[];
  v_work text;
begin
  if v_actor is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;
  select * into v_appt from public.appointments
   where workspace_id=p_workspace_id and id=p_appointment_id for update;
  if not found then raise exception 'Appointment not found'; end if;

  v_vehicle_ids:=public.assert_appointment_vehicle_attribution_v1(p_workspace_id,p_appointment_id);

  foreach v_vehicle_id in array v_vehicle_ids loop
    select string_agg(ai.description, ', ' order by ai.sort_order,ai.created_at)
      into v_work
      from public.appointment_items ai
     where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
       and coalesce((ai.metadata->>'vehicle_id')::uuid,v_appt.vehicle_id)=v_vehicle_id;

    select id into v_record_id from public.service_records
     where workspace_id=p_workspace_id and appointment_id=p_appointment_id and vehicle_id=v_vehicle_id
     order by created_at asc limit 1 for update;

    if v_record_id is null then
      insert into public.service_records(
        workspace_id,appointment_id,customer_id,vehicle_id,completed_by,status,
        work_performed,customer_notes,metadata,completed_at,currency_code
      ) values(
        p_workspace_id,p_appointment_id,v_appt.customer_id,v_vehicle_id,v_actor,'completed',
        coalesce(nullif(v_work,''),nullif(v_appt.metadata->>'description',''),nullif(v_appt.metadata->>'title',''),v_appt.notes,'Completed appointment'),
        v_appt.notes,
        jsonb_build_object('source','appointment_completion','vehicle_scoped',true),
        now(),'USD'
      ) returning id into v_record_id;
    else
      update public.service_records set
        status='completed',completed_by=coalesce(completed_by,v_actor),
        completed_at=coalesce(completed_at,now()),
        work_performed=coalesce(nullif(v_work,''),work_performed),
        metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('vehicle_scoped',true),
        updated_at=now()
      where id=v_record_id;
    end if;
    v_record_ids:=array_append(v_record_ids,v_record_id);
  end loop;
  return v_record_ids;
end $$;

revoke all on function public.sync_appointment_vehicle_service_records_v1(uuid,uuid) from public,anon;
grant execute on function public.sync_appointment_vehicle_service_records_v1(uuid,uuid) to authenticated,service_role;
