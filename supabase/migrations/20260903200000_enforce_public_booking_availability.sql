-- Module 1 certification: public booking must enforce the same scheduling
-- invariants as authenticated staff booking. UI filtering is not a security
-- boundary; direct anonymous RPC calls must still respect per-day hours,
-- blackout dates, lead/advance windows, buffers, and slot conflicts.

begin;

create or replace function public.public_booking_book_appointment(
  p_booking_slug text,
  p_scheduled_date date,
  p_scheduled_time time,
  p_duration_minutes integer,
  p_title text,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_description text,
  p_notes text,
  p_estimated_cost numeric,
  p_tax_amount numeric,
  p_service_catalog_id uuid,
  p_vehicle_id uuid,
  p_status text default 'confirmed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_business_user_id uuid;
  v_workspace_id uuid;
  v_vehicle_workspace uuid;
  v_service_workspace uuid;
  v_guest_customer_id uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_appointment_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
  v_weekday text;
  v_day jsonb;
  v_is_open boolean;
  v_open_time time;
  v_close_time time;
  v_local_start time;
  v_local_end time;
  v_query_start timestamptz;
  v_query_end timestamptz;
begin
  select c.workspace_id, c.business_user_id
    into v_workspace_id, v_business_user_id
    from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if coalesce(p_estimated_cost, 0) < 0 or coalesce(p_tax_amount, 0) < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if length(trim(coalesce(p_guest_email, ''))) < 3 or position('@' in p_guest_email) < 2 then raise exception 'INVALID_EMAIL'; end if;

  select w.timezone into v_timezone from public.workspaces w where w.id = v_workspace_id;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;
  v_timezone := coalesce(nullif(v_timezone, ''), 'UTC');
  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);

  if v_starts_at < now() + make_interval(hours => coalesce(v_settings.min_lead_time_hours, 0))
     or v_starts_at > now() + make_interval(days => coalesce(v_settings.max_advance_days, 365)) then
    raise exception 'DATE_BLOCKED';
  end if;

  -- Per-day hours are authoritative. Flat opening/closing + working_days remain
  -- compatibility fallbacks only when a weekday has no day_hours entry.
  v_weekday := lower(trim(to_char(v_starts_at at time zone v_timezone, 'FMDay')));
  v_day := case when jsonb_typeof(v_settings.day_hours) = 'object' then v_settings.day_hours -> v_weekday else null end;
  if v_day is not null then
    v_is_open := coalesce((v_day ->> 'is_open')::boolean, (v_day ->> 'isOpen')::boolean, false);
    v_open_time := coalesce(nullif(v_day ->> 'open', '')::time, v_settings.opening_time, '09:00'::time);
    v_close_time := coalesce(nullif(v_day ->> 'close', '')::time, v_settings.closing_time, '17:00'::time);
  else
    v_is_open := exists (
      select 1 from unnest(coalesce(v_settings.working_days, array[]::text[])) d
      where lower(d) = v_weekday
    );
    v_open_time := coalesce(v_settings.opening_time, '09:00'::time);
    v_close_time := coalesce(v_settings.closing_time, '17:00'::time);
  end if;

  v_local_start := (v_starts_at at time zone v_timezone)::time;
  v_local_end := (v_ends_at at time zone v_timezone)::time;
  if (v_starts_at at time zone v_timezone)::date <> (v_ends_at at time zone v_timezone)::date
     or not v_is_open
     or v_local_start < v_open_time
     or v_local_end > v_close_time then
    raise exception 'DATE_BLOCKED';
  end if;

  if exists (
    select 1
      from public.workspace_blackout_dates b
     where b.workspace_id = v_workspace_id
       and b.blocked_date = p_scheduled_date
  ) then
    raise exception 'DATE_BLOCKED';
  end if;

  select c.id into v_guest_customer_id
    from public.customers c
   where c.workspace_id = v_workspace_id
     and lower(c.email::text) = lower(trim(p_guest_email))
   order by c.created_at
   limit 1;
  if v_guest_customer_id is null then
    insert into public.customers(workspace_id, first_name, last_name, email, phone, metadata)
    values (
      v_workspace_id,
      split_part(trim(p_guest_name), ' ', 1),
      coalesce(nullif(trim(substr(trim(p_guest_name), length(split_part(trim(p_guest_name), ' ', 1)) + 1)), ''), ''),
      lower(trim(p_guest_email)),
      nullif(trim(p_guest_phone), ''),
      jsonb_build_object('source', 'public_booking')
    )
    returning id into v_guest_customer_id;
  end if;

  if p_vehicle_id is not null then
    select v.workspace_id into v_vehicle_workspace
      from public.vehicles v
     where v.id = p_vehicle_id
       and v.customer_id is not distinct from v_guest_customer_id;
    if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
  end if;

  if p_service_catalog_id is not null then
    select s.workspace_id into v_service_workspace
      from public.service_catalog s
     where s.id = p_service_catalog_id
       and s.is_active;
    if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if;
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text, 0));

  v_query_start := v_starts_at - make_interval(mins => greatest(0, coalesce(v_settings.buffer_time_after, 0)));
  v_query_end := v_ends_at + make_interval(mins => greatest(0, coalesce(v_settings.buffer_time_before, 0)));
  if exists (
    select 1
      from public.appointments a
     where a.workspace_id = v_workspace_id
       and a.status::text not in ('cancelled', 'no_show')
       and a.starts_at < v_query_end
       and a.ends_at > v_query_start
  ) then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  v_status := case
    when p_status in ('confirmed', 'scheduled') then 'confirmed'::public.appointment_status
    else 'requested'::public.appointment_status
  end;

  insert into public.appointments(
    workspace_id, customer_id, vehicle_id, status, starts_at, ends_at,
    source, confirmation_code, notes, metadata
  )
  values (
    v_workspace_id,
    v_guest_customer_id,
    p_vehicle_id,
    v_status,
    v_starts_at,
    v_ends_at,
    'public_booking',
    upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
    p_notes,
    jsonb_strip_nulls(jsonb_build_object(
      'title', left(coalesce(p_title, 'Online booking'), 500),
      'guest_name', left(p_guest_name, 160),
      'guest_email', lower(trim(p_guest_email)),
      'guest_phone', p_guest_phone,
      'description', p_description,
      'estimated_cost', round(coalesce(p_estimated_cost, 0), 2),
      'tax_amount', round(coalesce(p_tax_amount, 0), 2),
      'service_catalog_id', p_service_catalog_id
    ))
  )
  returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public;
grant execute on function public.public_booking_book_appointment(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon, authenticated;

commit;
