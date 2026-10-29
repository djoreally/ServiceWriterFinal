-- Website Bookings selective push — staff variant of the canonical public
-- booking create (public_booking_book_appointment_v3).
--
-- Why this exists: staff selectively push MOMS-website bookings into Service
-- Writer from the Website Bookings queue. The public v3 RPC cannot serve
-- that flow:
--   * it is anonymous and resolves the customer by email+phone on one row,
--     while the push spec matches customers phone-first, then email;
--   * it hard-blocks lead-time / max-advance windows (DATE_BLOCKED) and any
--     overlap (SLOT_UNAVAILABLE), while website bookings legitimately exist
--     outside the public link's hours and lead time (8 AM starts, same-day)
--     and may stack into an occupied window at the owner's direction;
--   * it stores estimated_cost = 0 with pricing_state
--     'pending_canonical_items', delegating the total to a later
--     catalog-priced services insert — which re-prices the appointment at
--     catalog rates (the Oct 2026 import scar: a $122.57 website quote
--     became $144.41 in-app). The push must lock the website quote.
--
-- This variant mirrors v3's validations and its atomic location creation
-- exactly, and changes only what the staff flow requires:
--   * authenticated staff only — auth.uid() must be an active workspace
--     member in a scheduling role (same role list as POST /v1/appointments);
--   * p_override_availability (mirrors the appointment UPDATE path's
--     override_availability): when true, the lead/max-advance window check
--     and the overlap check are skipped — the website promised the time and
--     a staff member confirmed the push after seeing the queue's warnings.
--     When false, both checks behave exactly as v3;
--   * customer resolution is phone-first, then email, then create
--     (spec §4: phone is the primary dedupe key);
--   * vehicle resolution reuses the canonical upsert_booking_vehicle helper
--     the public upsert path delegates to;
--   * the appointment is created with source 'moms_website' and the website
--     quote locked at insert: metadata.estimated_cost = quote, and one
--     appointment_items row at unit_price = quote (price_source
--     'website_quote'), so item-based totals and invoice sync agree with
--     the quote to the cent;
--   * idempotent per website booking: metadata.website_booking_id is the
--     idempotency key — a retry returns the existing appointment instead of
--     creating a duplicate;
--   * no customer-facing side effects: this function sends nothing; the
--     confirmation email endpoint stays an explicit staff action elsewhere.
--
-- NOT APPLIED by the feature branch — delivered as a migration file for the
-- owner to apply (supabase migration order: filename timestamp governs).

create or replace function public.public_booking_book_appointment_staff_v1(
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
  p_quoted_total numeric,
  p_service_catalog_id uuid,
  p_service_name text,
  p_vehicle_year integer,
  p_vehicle_make text,
  p_vehicle_model text,
  p_vehicle_engine text,
  p_location_address text,
  p_location_lat numeric default null,
  p_location_lng numeric default null,
  p_status text default 'confirmed',
  p_override_availability boolean default false,
  p_website_booking_id text default null,
  p_source_channel text default null,
  p_payment_status text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workspace_id uuid;
  v_business_user_id uuid;
  v_customer_id uuid;
  v_vehicle_id uuid;
  v_phone_digits text;
  v_service_workspace uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_appointment_id uuid;
  v_location_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
  v_caller uuid;
  v_quote numeric;
begin
  v_caller := auth.uid();
  if v_caller is null then raise exception 'STAFF_AUTH_REQUIRED'; end if;

  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;

  if not exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = v_workspace_id
      and wm.user_id = v_caller
      and wm.is_active
      and wm.role::text = any (array['owner','admin','manager','service_advisor','receptionist','dispatcher'])
  ) then
    raise exception 'WORKSPACE_ACCESS_DENIED';
  end if;

  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if length(trim(coalesce(p_guest_email,''))) < 3 or position('@' in p_guest_email) < 2 then raise exception 'INVALID_EMAIL'; end if;

  v_phone_digits := regexp_replace(coalesce(p_guest_phone,''),'[^0-9]','','g');
  if length(v_phone_digits) < 10 then raise exception 'INVALID_PHONE'; end if;

  if nullif(trim(coalesce(p_location_address,'')),'') is null then raise exception 'BOOKING_LOCATION_REQUIRED'; end if;
  if length(trim(p_location_address)) > 1000 then raise exception 'BOOKING_LOCATION_TOO_LONG'; end if;
  if p_location_lat is not null and (p_location_lat < -90 or p_location_lat > 90) then raise exception 'INVALID_LATITUDE'; end if;
  if p_location_lng is not null and (p_location_lng < -180 or p_location_lng > 180) then raise exception 'INVALID_LONGITUDE'; end if;

  v_quote := round(greatest(coalesce(p_quoted_total,0),0),2);

  select w.timezone into v_timezone from public.workspaces w where w.id = v_workspace_id;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;

  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);

  -- Serialize create + idempotency check per workspace/window, as v3 does.
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text,0));

  -- Idempotency: one appointment per website booking, ever.
  if p_website_booking_id is not null then
    select a.id into v_appointment_id
    from public.appointments a
    where a.workspace_id = v_workspace_id
      and a.metadata->>'website_booking_id' = p_website_booking_id
    order by a.created_at
    limit 1;
    if v_appointment_id is not null then return v_appointment_id; end if;
  end if;

  -- Customer resolution (spec §4): phone first, then email, then create.
  select c.id into v_customer_id
  from public.customers c
  where c.workspace_id = v_workspace_id
    and right(regexp_replace(coalesce(c.phone,''),'[^0-9]','','g'),10) = right(v_phone_digits,10)
  order by c.created_at
  limit 1;

  if v_customer_id is null then
    select c.id into v_customer_id
    from public.customers c
    where c.workspace_id = v_workspace_id
      and lower(c.email::text) = lower(trim(p_guest_email))
    order by c.created_at
    limit 1;
  end if;

  if v_customer_id is null then
    insert into public.customers(workspace_id, first_name, last_name, email, phone, address_line1, metadata)
    values (
      v_workspace_id,
      split_part(trim(p_guest_name), ' ', 1),
      coalesce(nullif(trim(substr(trim(p_guest_name), length(split_part(trim(p_guest_name), ' ', 1)) + 1)), ''), ''),
      lower(trim(p_guest_email)),
      nullif(trim(p_guest_phone), ''),
      nullif(trim(p_location_address), ''),
      jsonb_build_object('source', 'website_push')
    )
    returning id into v_customer_id;
  end if;

  -- Vehicle resolution via the same helper the canonical public upsert uses.
  v_vehicle_id := public.upsert_booking_vehicle(
    v_business_user_id,
    v_customer_id,
    p_vehicle_year,
    p_vehicle_make,
    p_vehicle_model,
    null, null, null, null, null, null,
    nullif(trim(coalesce(p_vehicle_engine,'')), '')
  );

  if p_service_catalog_id is not null then
    select s.workspace_id into v_service_workspace
    from public.service_catalog s
    where s.id = p_service_catalog_id and s.is_active;
    if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if;
  end if;

  if not coalesce(p_override_availability, false) then
    if v_starts_at < now() + make_interval(hours => coalesce(v_settings.min_lead_time_hours,0))
       or v_starts_at > now() + make_interval(days => coalesce(v_settings.max_advance_days,365))
    then
      raise exception 'DATE_BLOCKED';
    end if;

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
    v_vehicle_id,
    v_location_id,
    v_status,
    v_starts_at,
    v_ends_at,
    'moms_website',
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
      'estimated_cost', v_quote,
      'tax_amount', 0,
      'service_catalog_id', p_service_catalog_id,
      'pricing_state', 'website_quote_locked',
      'client_estimated_cost', v_quote,
      'client_tax_amount', 0,
      'website_booking_id', p_website_booking_id,
      'source_channel', p_source_channel,
      'website_payment_status', p_payment_status,
      'override_availability', coalesce(p_override_availability, false),
      'pushed_by', v_caller
    ))
  ) returning id into v_appointment_id;

  -- One canonical billable item at the locked website quote, so item-based
  -- totals and invoice sync agree with the quote to the cent. Deliberately
  -- NOT public_booking_insert_services_v7: that path re-prices catalog
  -- services at service_catalog.labor_price and would break the price lock.
  insert into public.appointment_items(
    workspace_id,
    appointment_id,
    service_catalog_id,
    description,
    quantity,
    unit_price,
    is_prepaid,
    sort_order,
    metadata
  ) values (
    v_workspace_id,
    v_appointment_id,
    p_service_catalog_id,
    left(coalesce(nullif(trim(coalesce(p_service_name,'')), ''), 'Website booking'), 250),
    1,
    v_quote,
    false,
    0,
    jsonb_strip_nulls(jsonb_build_object(
      'vehicle_id', v_vehicle_id,
      'source', 'website_push',
      'price_source', 'website_quote',
      'website_booking_id', p_website_booking_id
    ))
  );

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment_staff_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text) from public, anon;
grant execute on function public.public_booking_book_appointment_staff_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text) to authenticated;
