create or replace function public.complete_appointment_v1(
  p_workspace_id uuid,
  p_appointment_id uuid
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_appt public.appointments%rowtype;
  v_record_id uuid;
  v_subtotal numeric;
  v_tax numeric;
  v_tax_rate numeric;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if not public.is_workspace_staff(p_workspace_id) then
    raise exception 'Workspace staff access required';
  end if;

  select * into v_appt
  from public.appointments
  where id = p_appointment_id and workspace_id = p_workspace_id
  for update;
  if not found then
    raise exception 'Appointment not found';
  end if;

  update public.appointments
  set status = 'completed', updated_at = now()
  where id = p_appointment_id and workspace_id = p_workspace_id;

  select id into v_record_id
  from public.service_records
  where workspace_id = p_workspace_id and appointment_id = p_appointment_id
  order by created_at asc
  limit 1;

  if v_record_id is not null then
    update public.service_records
    set status = 'completed', completed_by = coalesce(completed_by, v_actor),
        completed_at = coalesce(completed_at, now()), updated_at = now()
    where id = v_record_id;
    return v_record_id;
  end if;

  v_subtotal := case when jsonb_typeof(v_appt.metadata->'estimated_cost') = 'number'
    then (v_appt.metadata->>'estimated_cost')::numeric else null end;
  v_tax := case when jsonb_typeof(v_appt.metadata->'tax_amount') = 'number'
    then (v_appt.metadata->>'tax_amount')::numeric else null end;
  select tax_rate into v_tax_rate from public.workspace_settings where workspace_id = p_workspace_id;

  insert into public.service_records(
    workspace_id, appointment_id, customer_id, vehicle_id,
    completed_by, status, work_performed, customer_notes, metadata,
    completed_at, subtotal, tax_rate, tax_amount, total_amount, currency_code
  ) values (
    p_workspace_id, p_appointment_id, v_appt.customer_id, v_appt.vehicle_id,
    v_actor, 'completed',
    coalesce(nullif(v_appt.metadata->>'description',''), nullif(v_appt.metadata->>'title',''), v_appt.notes, 'Completed appointment'),
    v_appt.notes,
    jsonb_build_object('source','appointment_completion','appointment_metadata',coalesce(v_appt.metadata,'{}'::jsonb)),
    now(), v_subtotal, v_tax_rate, v_tax,
    case when v_subtotal is null and v_tax is null then null else coalesce(v_subtotal,0)+coalesce(v_tax,0) end,
    'USD'
  ) returning id into v_record_id;

  return v_record_id;
end;
$$;

revoke all on function public.complete_appointment_v1(uuid, uuid) from public;
grant execute on function public.complete_appointment_v1(uuid, uuid) to authenticated;
