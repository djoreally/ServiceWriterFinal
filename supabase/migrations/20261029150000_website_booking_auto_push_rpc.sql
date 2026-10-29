-- Website Bookings AUTO-push (prepaid) — service-role variant of the
-- staff push RPC (20261028235900_website_booking_staff_push_rpc.sql).
--
-- Why this exists: Ty's rule (2026-10-29) is that a website booking that
-- PREPAYS is pushed to Service Writer automatically. The automatic path
-- has no staff session: the website backend calls a Service Writer
-- internal endpoint (shared-secret authenticated), which runs the same
-- push pipeline with the service-role client. The staff RPC requires
-- auth.uid() + an active workspace membership, so it cannot serve that
-- caller.
--
-- This function is the staff RPC with ONLY the caller authorization
-- changed:
--   * the caller must present the service_role JWT (auth.role()); the
--     function is granted to service_role only;
--   * metadata.pushed_by records 'auto_prepaid' instead of a staff uid.
-- Everything else is identical by construction — same canonical create
-- (atomic location row via the same context resolution), same
-- phone-first customer resolution, same vehicle upsert helper, same
-- availability override semantics (the website promised the window),
-- same website-quote lock stamps (source 'moms_website',
-- pricing_state 'website_quote_locked', estimated_cost = quote,
-- tax_amount = 0, one appointment_items row at unit_price = quote with
-- price_source 'website_quote'), and the same per-booking idempotency
-- (metadata.website_booking_id returns the existing appointment instead
-- of creating a duplicate). No customer-facing side effects.
--
-- NOT APPLIED by the feature branch — delivered as a migration file for
-- the owner to apply (supabase migration order: filename timestamp
-- governs; apply after 20261028235900 and 20261029130000).

create or replace function public.public_booking_book_appointment_auto_v1(
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
  -- Service-role only: this variant is called by the Service Writer
  -- server itself (via the service-role client) from the internal
  -- auto-push endpoint, which has already authenticated the website
  -- backend with the shared push secret. There is no staff session, so
  -- authorization is the caller's JWT role instead of a membership row.
  if coalesce(auth.role(), '') <> 'service_role' then raise exception 'SERVICE_ROLE_REQUIRED'; end if;
  v_caller := auth.uid();

  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
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
      'pushed_by', 'auto_prepaid'
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

revoke all on function public.public_booking_book_appointment_auto_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text) from public, anon, authenticated;
grant execute on function public.public_booking_book_appointment_auto_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text) to service_role;
