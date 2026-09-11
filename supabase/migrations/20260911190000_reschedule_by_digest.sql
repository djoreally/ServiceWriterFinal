-- Shot 18: verify appointment reschedule links by digest.
begin;

create or replace function public.reschedule_appointment_by_token(
  p_management_token text,
  p_new_date date,
  p_new_time time without time zone
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_appointment public.appointments%rowtype;
  v_settings public.workspace_settings%rowtype;
  v_workspace public.workspaces%rowtype;
  v_token_id uuid;
  v_timezone text;
  v_new_start timestamptz;
  v_new_end timestamptz;
  v_duration interval;
  v_now timestamptz := now();
  v_day text;
  v_digest text;
begin
  if nullif(trim(p_management_token),'') is null then
    return pg_catalog.jsonb_build_object('success',false,'message','Appointment link is invalid.');
  end if;

  v_digest := pg_catalog.encode(
    extensions.digest(trim(p_management_token), 'sha256'),
    'hex'
  );

  select a.*, t.id
    into v_appointment, v_token_id
  from public.appointment_management_tokens t
  join public.appointments a on a.id = t.appointment_id
  where t.token_digest = v_digest
    and t.revoked_at is null
    and (t.expires_at is null or t.expires_at > v_now)
  limit 1
  for update of t, a;

  if not found then
    return pg_catalog.jsonb_build_object('success',false,'message','Appointment link is invalid or expired.');
  end if;

  if v_appointment.status in ('cancelled','completed','no_show','in_progress') then
    return pg_catalog.jsonb_build_object('success',false,'message','This appointment can no longer be rescheduled.');
  end if;

  select * into v_settings
  from public.workspace_settings
  where workspace_id=v_appointment.workspace_id;

  select * into v_workspace
  from public.workspaces
  where id=v_appointment.workspace_id;

  if coalesce(v_settings.allow_rescheduling,true) is false then
    return pg_catalog.jsonb_build_object('success',false,'message','Online rescheduling is disabled for this shop.');
  end if;

  if v_appointment.starts_at <= v_now + pg_catalog.make_interval(hours=>coalesce(v_settings.reschedule_window_hours,24)) then
    return pg_catalog.jsonb_build_object(
      'success',false,
      'message',pg_catalog.format('Rescheduling must be done at least %s hours before the appointment.',coalesce(v_settings.reschedule_window_hours,24))
    );
  end if;

  v_timezone:=coalesce(nullif(v_workspace.timezone,''),'UTC');
  v_new_start:=(p_new_date+p_new_time) at time zone v_timezone;
  v_duration:=v_appointment.ends_at-v_appointment.starts_at;
  v_new_end:=v_new_start+v_duration;
  v_day:=lower(pg_catalog.to_char(p_new_date,'FMDay'));

  if v_new_start<=v_now then
    return pg_catalog.jsonb_build_object('success',false,'message','Choose a future appointment time.');
  end if;

  if v_new_start < v_now + pg_catalog.make_interval(hours=>coalesce(v_settings.min_lead_time_hours,0)) then
    return pg_catalog.jsonb_build_object('success',false,'message','The selected time is inside the shop minimum lead-time window.');
  end if;

  if p_new_date > (v_now at time zone v_timezone)::date + coalesce(v_settings.max_advance_days,30) then
    return pg_catalog.jsonb_build_object('success',false,'message','The selected date is outside the booking window.');
  end if;

  if v_settings.working_days is not null
     and pg_catalog.array_length(v_settings.working_days,1) is not null
     and not exists(
       select 1 from pg_catalog.unnest(v_settings.working_days)d where lower(d)=v_day
     ) then
    return pg_catalog.jsonb_build_object('success',false,'message','The shop is closed on the selected day.');
  end if;

  if p_new_time < coalesce(v_settings.opening_time,time '00:00')
     or p_new_time >= coalesce(v_settings.closing_time,time '23:59:59') then
    return pg_catalog.jsonb_build_object('success',false,'message','The selected time is outside business hours.');
  end if;

  if exists(
    select 1
    from public.appointments a
    where a.workspace_id=v_appointment.workspace_id
      and a.id<>v_appointment.id
      and a.status not in ('cancelled','no_show')
      and pg_catalog.tstzrange(a.starts_at,a.ends_at,'[)') &&
          pg_catalog.tstzrange(v_new_start,v_new_end,'[)')
  ) then
    return pg_catalog.jsonb_build_object('success',false,'message','That time is no longer available. Please choose another time.');
  end if;

  update public.appointments
  set starts_at=v_new_start,
      ends_at=v_new_end,
      metadata=coalesce(metadata,'{}'::jsonb) ||
        pg_catalog.jsonb_build_object(
          'rescheduled_at',v_now,
          'rescheduled_by','customer_management_token',
          'previous_starts_at',v_appointment.starts_at
        ),
      updated_at=v_now
  where id=v_appointment.id;

  update public.appointment_management_tokens
  set last_used_at=v_now,
      use_count=use_count+1,
      updated_at=v_now
  where id=v_token_id;

  return pg_catalog.jsonb_build_object(
    'success',true,
    'appointment_id',v_appointment.id,
    'starts_at',v_new_start,
    'ends_at',v_new_end
  );
end;
$function$;

revoke all on function public.reschedule_appointment_by_token(text,date,time without time zone) from public;
grant execute on function public.reschedule_appointment_by_token(text,date,time without time zone) to anon, authenticated, service_role;

commit;
