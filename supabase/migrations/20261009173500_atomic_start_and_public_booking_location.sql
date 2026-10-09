-- 1) Keep every appointment-start path in sync.
-- Any transition into in_progress stamps the canonical start metadata. When the
-- actor is a technician, technician presence is updated in the same transaction.
create or replace function public.sync_appointment_start_state_v1()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_is_technician boolean := false;
begin
  if new.status::text = 'in_progress' and old.status::text is distinct from 'in_progress' then
    new.metadata := jsonb_set(
      jsonb_set(
        coalesce(new.metadata, '{}'::jsonb),
        '{dispatch_status}',
        to_jsonb('started'::text),
        true
      ),
      '{actual_start_time}',
      to_jsonb(coalesce(nullif(new.metadata->>'actual_start_time','')::timestamptz, now())),
      true
    );

    if v_actor is not null then
      select exists(
        select 1
        from public.workspace_members wm
        where wm.workspace_id = new.workspace_id
          and wm.user_id = v_actor
          and wm.is_active
          and wm.role::text = 'technician'
      ) into v_is_technician;

      if v_is_technician then
        if new.assigned_user_id is distinct from v_actor then
          raise exception 'appointment_not_assigned_to_technician';
        end if;

        insert into public.technician_presence(
          workspace_id,
          user_id,
          status,
          current_appointment_id,
          last_seen_at,
          updated_at
        ) values (
          new.workspace_id,
          v_actor,
          'on_job',
          new.id,
          now(),
          now()
        )
        on conflict(workspace_id,user_id) do update
        set status = 'on_job',
            current_appointment_id = new.id,
            last_seen_at = now(),
            updated_at = now();
      end if;
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.sync_appointment_start_state_v1() from public, anon, authenticated;

drop trigger if exists trg_sync_appointment_start_state_v1 on public.appointments;
create trigger trg_sync_appointment_start_state_v1
before update of status on public.appointments
for each row
execute function public.sync_appointment_start_state_v1();

-- 2) Public booking creation owns the service location atomically.
-- A public booking cannot be created without a non-empty appointment location.
create or replace function public.public_booking_book_appointment_v3(
  p_booking_slug text,
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
  p_location_address text,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_status text default 'confirmed'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_phone_digits text;
  v_vehicle_workspace uuid;
  v_service_workspace uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_appointment_id uuid;
  v_location_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
begin
  select c.workspace_id into v_workspace_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if length(trim(coalesce(p_guest_email,''))) < 3 or position('@' in p_guest_email) < 2 then raise exception 'INVALID_EMAIL'; end if;

  v_phone_digits := regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
  if length(v_phone_digits) < 10 then raise exception 'INVALID_PHONE'; end if;

  if nullif(trim(coalesce(p_location_address,'')),'') is null then raise exception 'BOOKING_LOCATION_REQUIRED'; end if;
  if length(trim(p_location_address)) > 1000 then raise exception 'BOOKING_LOCATION_TOO_LONG'; end if;
  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  select c.id into v_customer_id
  from public.customers c
  where c.workspace_id = v_workspace_id
    and lower(c.email::text) = lower(trim(p_guest_email))
    and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10) = right(v_phone_digits,10)
  order by c.created_at
  limit 1;
  if v_customer_id is null then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;

  if p_vehicle_id is null then raise exception 'BOOKING_VEHICLE_REQUIRED'; end if;
  select v.workspace_id into v_vehicle_workspace
  from public.vehicles v
  where v.id = p_vehicle_id and v.customer_id = v_customer_id;
  if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;

  if p_service_catalog_id is not null then
    select s.workspace_id into v_service_workspace
    from public.service_catalog s
    where s.id = p_service_catalog_id and s.is_active;
    if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if;
  end if;

  select w.timezone into v_timezone from public.workspaces w where w.id = v_workspace_id;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;

  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);

  if v_starts_at < now() + make_interval(hours => coalesce(v_settings.min_lead_time_hours,0))
     or v_starts_at > now() + make_interval(days => coalesce(v_settings.max_advance_days,365))
  then
    raise exception 'DATE_BLOCKED';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text,0));
  if exists(
    select 1
    from public.appointments a
    where a.workspace_id = v_workspace_id
      and a.status::text not in ('cancelled','no_show')
      and a.starts_at < v_ends_at
      and a.ends_at > v_starts_at
  ) then
    raise exception 'SLOT_UNAVAILABLE';
  end if;

  v_status := case
    when p_status in ('confirmed','scheduled') then 'confirmed'::public.appointment_status
    else 'requested'::public.appointment_status
  end;

  insert into public.locations(
    workspace_id,
    name,
    location_type,
    address_line1,
    latitude,
    longitude
  ) values (
    v_workspace_id,
    'Appointment service location',
    'customer_site'::public.location_type,
    trim(p_location_address),
    p_location_lat,
    p_location_lng
  ) returning id into v_location_id;

  insert into public.appointments(
    workspace_id,
    customer_id,
    vehicle_id,
    location_id,
    status,
    starts_at,
    ends_at,
    source,
    confirmation_code,
    notes,
    metadata
  ) values (
    v_workspace_id,
    v_customer_id,
    p_vehicle_id,
    v_location_id,
    v_status,
    v_starts_at,
    v_ends_at,
    'public_booking',
    upper(substr(replace(gen_random_uuid()::text,'-',''),1,8)),
    p_notes,
    jsonb_strip_nulls(jsonb_build_object(
      'title', left(coalesce(p_title,'Online booking'),500),
      'guest_name', left(p_guest_name,160),
      'guest_email', lower(trim(p_guest_email)),
      'guest_phone', p_guest_phone,
      'description', p_description,
      'location_address', trim(p_location_address),
      'location_lat', p_location_lat,
      'location_lng', p_location_lng,
      'estimated_cost', 0,
      'tax_amount', 0,
      'service_catalog_id', p_service_catalog_id,
      'pricing_state', 'pending_canonical_items',
      'client_estimated_cost', round(greatest(coalesce(p_estimated_cost,0),0),2),
      'client_tax_amount', round(greatest(coalesce(p_tax_amount,0),0),2)
    ))
  ) returning id into v_appointment_id;

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) from public;
grant execute on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) to anon, authenticated;
