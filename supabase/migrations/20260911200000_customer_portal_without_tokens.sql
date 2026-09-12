-- Shot 19: remove bearer secrets from authenticated customer portal payloads.
begin;

create or replace function public.get_customer_portal_appointments_v2()
returns table(
  id uuid,
  title text,
  scheduled_date date,
  scheduled_time time without time zone,
  duration_minutes integer,
  status text,
  estimated_cost numeric,
  guest_name text,
  location_address text,
  notes text,
  description text,
  payment_status text,
  service_catalog_name text,
  created_at timestamptz,
  assigned_at timestamptz,
  actual_start_time timestamptz,
  actual_end_time timestamptz,
  can_manage boolean
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt() ->> 'email', ''));
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  perform 1 from public.link_customer_portal_account_v1();

  return query
  select
    a.id,
    coalesce(nullif(a.metadata ->> 'title',''),nullif(ai.description,''),'Service appointment') as title,
    (a.starts_at at time zone coalesce(w.timezone,'UTC'))::date,
    (a.starts_at at time zone coalesce(w.timezone,'UTC'))::time,
    greatest(0,round(extract(epoch from (a.ends_at-a.starts_at))/60.0)::integer),
    a.status::text,
    nullif(a.metadata ->> 'estimated_cost','')::numeric,
    coalesce(nullif(a.metadata ->> 'guest_name',''),nullif(trim(concat_ws(' ',c.first_name,c.last_name)),''),v_email),
    coalesce(nullif(a.metadata ->> 'location_address',''),nullif(a.metadata ->> 'service_address','')),
    a.notes,
    nullif(a.metadata ->> 'description',''),
    nullif(a.metadata ->> 'payment_status',''),
    sc.name,
    a.created_at,
    null::timestamptz,
    null::timestamptz,
    null::timestamptz,
    a.status not in ('cancelled','completed','no_show','in_progress')
  from public.appointments a
  join public.workspaces w on w.id=a.workspace_id
  left join public.customers c on c.id=a.customer_id and c.workspace_id=a.workspace_id
  left join lateral (
    select i.description,i.service_catalog_id
    from public.appointment_items i
    where i.appointment_id=a.id and i.workspace_id=a.workspace_id
    order by i.sort_order,i.created_at
    limit 1
  ) ai on true
  left join public.service_catalog sc on sc.id=ai.service_catalog_id and sc.workspace_id=a.workspace_id
  where exists (
    select 1 from public.customer_users cu
    where cu.user_id=v_user_id
      and cu.customer_id=a.customer_id
      and cu.workspace_id=a.workspace_id
  )
  order by a.starts_at desc;
end;
$function$;

create or replace function public.cancel_customer_portal_appointment_v1(
  p_appointment_id uuid,
  p_cancellation_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode='28000';
  end if;

  select a.* into v_appointment
  from public.appointments a
  where a.id=p_appointment_id
    and exists (
      select 1 from public.customer_users cu
      where cu.user_id=v_user_id
        and cu.workspace_id=a.workspace_id
        and cu.customer_id=a.customer_id
    )
  for update;

  if not found then
    return jsonb_build_object('success',false,'message','Appointment is unavailable.');
  end if;

  if v_appointment.status in ('cancelled','completed','no_show') then
    return jsonb_build_object('success',false,'message','This appointment can no longer be cancelled.');
  end if;

  select * into v_settings from public.workspace_settings where workspace_id=v_appointment.workspace_id;

  if coalesce(v_settings.allow_cancellation,true) is false then
    return jsonb_build_object('success',false,'message','Online cancellation is disabled for this shop.');
  end if;

  if v_appointment.starts_at <= v_now + make_interval(hours=>coalesce(v_settings.cancellation_window_hours,24)) then
    return jsonb_build_object('success',false,'message',format('Cancellations must be made at least %s hours before the appointment.',coalesce(v_settings.cancellation_window_hours,24)));
  end if;

  update public.appointments
  set status='cancelled',
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
        'cancellation_reason',nullif(trim(coalesce(p_cancellation_reason,'')),''),
        'cancelled_at',v_now,
        'cancelled_by','authenticated_customer_portal'
      ),
      updated_at=v_now
  where id=v_appointment.id;

  update public.appointment_management_tokens
  set revoked_at=coalesce(revoked_at,v_now),updated_at=v_now
  where appointment_id=v_appointment.id and revoked_at is null;

  return jsonb_build_object('success',true,'appointment_id',v_appointment.id,'status','cancelled');
end;
$function$;

create or replace function public.reschedule_customer_portal_appointment_v1(
  p_appointment_id uuid,
  p_new_date date,
  p_new_time time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_workspace public.workspaces%rowtype;
  v_timezone text;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_duration interval;
  v_now timestamptz:=now();
  v_day text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='28000'; end if;

  select a.* into v_appointment
  from public.appointments a
  where a.id=p_appointment_id
    and exists (
      select 1 from public.customer_users cu
      where cu.user_id=v_user_id and cu.workspace_id=a.workspace_id and cu.customer_id=a.customer_id
    )
  for update;

  if not found then return jsonb_build_object('success',false,'message','Appointment is unavailable.'); end if;
  if v_appointment.status in ('cancelled','completed','no_show','in_progress') then return jsonb_build_object('success',false,'message','This appointment can no longer be rescheduled.'); end if;

  select * into v_settings from public.workspace_settings where workspace_id=v_appointment.workspace_id;
  select * into v_workspace from public.workspaces where id=v_appointment.workspace_id;

  if coalesce(v_settings.allow_rescheduling,true) is false then return jsonb_build_object('success',false,'message','Online rescheduling is disabled for this shop.'); end if;
  if v_appointment.starts_at <= v_now + make_interval(hours=>coalesce(v_settings.reschedule_window_hours,24)) then return jsonb_build_object('success',false,'message',format('Rescheduling must be done at least %s hours before the appointment.',coalesce(v_settings.reschedule_window_hours,24))); end if;

  v_timezone:=coalesce(nullif(v_workspace.timezone,''),'UTC');
  v_new_start:=(p_new_date+p_new_time) at time zone v_timezone;
  v_duration:=v_appointment.ends_at-v_appointment.starts_at;
  v_new_end:=v_new_start+v_duration;
  v_day:=lower(to_char(p_new_date,'FMDay'));

  if v_new_start<=v_now then return jsonb_build_object('success',false,'message','Choose a future appointment time.'); end if;
  if v_new_start < v_now + make_interval(hours=>coalesce(v_settings.min_lead_time_hours,0)) then return jsonb_build_object('success',false,'message','The selected time is inside the shop minimum lead-time window.'); end if;
  if p_new_date > (v_now at time zone v_timezone)::date + coalesce(v_settings.max_advance_days,30) then return jsonb_build_object('success',false,'message','The selected date is outside the booking window.'); end if;
  if v_settings.working_days is not null and array_length(v_settings.working_days,1) is not null and not exists(select 1 from unnest(v_settings.working_days)d where lower(d)=v_day) then return jsonb_build_object('success',false,'message','The shop is closed on the selected day.'); end if;
  if p_new_time < coalesce(v_settings.opening_time,time '00:00') or p_new_time >= coalesce(v_settings.closing_time,time '23:59:59') then return jsonb_build_object('success',false,'message','The selected time is outside business hours.'); end if;
  if exists(select 1 from public.appointments a where a.workspace_id=v_appointment.workspace_id and a.id<>v_appointment.id and a.status not in ('cancelled','no_show') and tstzrange(a.starts_at,a.ends_at,'[)')&&tstzrange(v_new_start,v_new_end,'[)')) then return jsonb_build_object('success',false,'message','That time is no longer available. Please choose another time.'); end if;

  update public.appointments
  set starts_at=v_new_start,ends_at=v_new_end,
      metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object('rescheduled_at',v_now,'rescheduled_by','authenticated_customer_portal','previous_starts_at',v_appointment.starts_at),
      updated_at=v_now
  where id=v_appointment.id;

  return jsonb_build_object('success',true,'appointment_id',v_appointment.id,'starts_at',v_new_start,'ends_at',v_new_end);
end;
$function$;

revoke all on function public.get_customer_portal_appointments_v2() from public,anon;
revoke all on function public.cancel_customer_portal_appointment_v1(uuid,text) from public,anon;
revoke all on function public.reschedule_customer_portal_appointment_v1(uuid,date,time without time zone) from public,anon;
grant execute on function public.get_customer_portal_appointments_v2() to authenticated,service_role;
grant execute on function public.cancel_customer_portal_appointment_v1(uuid,text) to authenticated,service_role;
grant execute on function public.reschedule_customer_portal_appointment_v1(uuid,date,time without time zone) to authenticated,service_role;

commit;
