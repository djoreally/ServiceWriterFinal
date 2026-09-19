-- Harden vehicle attribution before multi-vehicle closeout/history generation.
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
  v_customer_id uuid;
  v_vehicle_ids uuid[];
  v_vehicle_count integer;
  v_unattributed_count integer;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if not public.is_workspace_staff(p_workspace_id) then raise exception 'Workspace staff access required'; end if;

  select vehicle_id,customer_id into v_default_vehicle,v_customer_id
  from public.appointments
  where workspace_id=p_workspace_id and id=p_appointment_id;
  if not found then raise exception 'Appointment not found'; end if;

  if exists(
    select 1 from public.appointment_items ai
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and nullif(ai.metadata->>'vehicle_id','') is not null
      and (ai.metadata->>'vehicle_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'Appointment item contains invalid vehicle attribution';
  end if;

  if exists(
    select 1
    from public.appointment_items ai
    left join public.vehicles v
      on v.workspace_id=p_workspace_id
     and v.id=(nullif(ai.metadata->>'vehicle_id',''))::uuid
    where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id
      and nullif(ai.metadata->>'vehicle_id','') is not null
      and (
        v.id is null
        or (v_customer_id is not null and v.customer_id is distinct from v_customer_id)
      )
  ) then
    raise exception 'Appointment item vehicle does not belong to this appointment customer/workspace';
  end if;

  select
    array_agg(distinct coalesce((nullif(ai.metadata->>'vehicle_id',''))::uuid,v_default_vehicle)),
    count(*) filter(where nullif(ai.metadata->>'vehicle_id','') is null)
  into v_vehicle_ids,v_unattributed_count
  from public.appointment_items ai
  where ai.workspace_id=p_workspace_id and ai.appointment_id=p_appointment_id;

  v_vehicle_count:=coalesce(array_length(v_vehicle_ids,1),0);
  if v_vehicle_count=0 and v_default_vehicle is not null then
    v_vehicle_ids:=array[v_default_vehicle];
    v_vehicle_count:=1;
  end if;

  if v_vehicle_ids is null or v_vehicle_count=0 then
    raise exception 'Appointment has no vehicle attribution';
  end if;

  if v_vehicle_count>1 and coalesce(v_unattributed_count,0)>0 then
    raise exception 'Multi-vehicle appointment requires explicit vehicle attribution on every appointment item';
  end if;

  return v_vehicle_ids;
end $$;

revoke all on function public.assert_appointment_vehicle_attribution_v1(uuid,uuid) from public,anon;
grant execute on function public.assert_appointment_vehicle_attribution_v1(uuid,uuid) to authenticated,service_role;
