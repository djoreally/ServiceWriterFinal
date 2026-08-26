-- Keep the atomic public-booking write boundary aligned with the hours shown
-- by the public calendar. Per-day hours are authoritative when configured.
create or replace function public.book_appointment_safe(
  p_business_user_id uuid,
  p_scheduled_date date,
  p_scheduled_time time without time zone,
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
  p_status text default 'confirmed'::text
) returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_workspace_id uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
  v_day_key text;
  v_day_config jsonb;
  v_open_time time;
  v_close_time time;
begin
  if p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if coalesce(p_estimated_cost, 0) < 0 or coalesce(p_tax_amount, 0) < 0 then raise exception 'INVALID_AMOUNT'; end if;

  select w.id, w.timezone into v_workspace_id, v_timezone
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id and w.is_active and ws.booking_enabled
  order by w.created_at limit 1;
  if v_workspace_id is null then raise exception 'BOOKING_PROVIDER_UNAVAILABLE'; end if;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;

  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);
  if v_starts_at < now() + make_interval(hours => v_settings.min_lead_time_hours)
    or v_starts_at > now() + make_interval(days => v_settings.max_advance_days) then
    raise exception 'DATE_BLOCKED';
  end if;

  v_day_key := lower(to_char(v_starts_at at time zone v_timezone, 'FMDay'));
  v_day_config := v_settings.day_hours -> v_day_key;
  if v_day_config is not null then
    if coalesce((v_day_config ->> 'is_open')::boolean, (v_day_config ->> 'isOpen')::boolean, true) is false then
      raise exception 'DATE_BLOCKED';
    end if;
    v_open_time := coalesce(nullif(v_day_config ->> 'open', '')::time, v_settings.opening_time, '00:00'::time);
    v_close_time := coalesce(nullif(v_day_config ->> 'close', '')::time, v_settings.closing_time, '23:59'::time);
  else
    if not exists (
      select 1 from unnest(v_settings.working_days) x where lower(x) = v_day_key
    ) then raise exception 'DATE_BLOCKED'; end if;
    v_open_time := coalesce(v_settings.opening_time, '00:00'::time);
    v_close_time := coalesce(v_settings.closing_time, '23:59'::time);
  end if;
  if p_scheduled_time < v_open_time
    or (p_scheduled_time + make_interval(mins => p_duration_minutes))::time > v_close_time then
    raise exception 'DATE_BLOCKED';
  end if;

  v_customer_id := public.upsert_customer(p_business_user_id, p_guest_email, p_guest_name, p_guest_phone, null);
  if p_vehicle_id is not null and not exists (
    select 1 from public.vehicles v where v.id = p_vehicle_id and v.workspace_id = v_workspace_id
      and (v.customer_id is null or v.customer_id = v_customer_id)
  ) then raise exception 'INVALID_VEHICLE'; end if;
  if p_service_catalog_id is not null and not exists (
    select 1 from public.service_catalog s where s.id = p_service_catalog_id
      and s.workspace_id = v_workspace_id and s.is_active
  ) then raise exception 'INVALID_SERVICE'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text, 0));
  if exists (
    select 1 from public.appointments a
    where a.workspace_id = v_workspace_id and a.status::text not in ('cancelled','no_show')
      and tstzrange(a.starts_at, a.ends_at, '[)') && tstzrange(v_starts_at, v_ends_at, '[)')
  ) then raise exception 'SLOT_UNAVAILABLE'; end if;

  v_status := case when p_status in ('confirmed','scheduled') then 'confirmed'::public.appointment_status else 'requested'::public.appointment_status end;
  insert into public.appointments(
    workspace_id, customer_id, vehicle_id, status, starts_at, ends_at, source,
    confirmation_code, notes, metadata
  ) values (
    v_workspace_id, v_customer_id, p_vehicle_id, v_status, v_starts_at, v_ends_at,
    'public_booking', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), p_notes,
    jsonb_strip_nulls(jsonb_build_object(
      'title', left(coalesce(p_title, 'Online booking'), 500),
      'guest_name', left(p_guest_name, 160), 'guest_email', lower(trim(p_guest_email)),
      'guest_phone', p_guest_phone, 'description', p_description,
      'estimated_cost', round(coalesce(p_estimated_cost, 0), 2),
      'tax_amount', round(coalesce(p_tax_amount, 0), 2),
      'service_catalog_id', p_service_catalog_id,
      'booking_fingerprint', encode(extensions.digest(v_workspace_id::text || ':' || lower(trim(p_guest_email)) || ':' || v_starts_at::text, 'sha256'), 'hex')
    ))
  ) returning id into v_appointment_id;
  return v_appointment_id;
end;
$function$;
