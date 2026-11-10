-- Booking merge for website pushes (Fix Cycle 7, S1) -- the website
-- booking's guest name and service address merge into the customer
-- profile at push time.
--
-- Owner's rule (2026-11-09, from the Cody Glenn case): a booking's new
-- service address + last name AUTOMATICALLY merge into the customer's
-- account; the booking's data wins. Proven defect: both push RPCs
-- resolve the customer phone-first, then email, then create -- and on a
-- MATCH neither RPC contains any UPDATE against public.customers, so a
-- returning customer's profile kept its blank last_name and its old
-- address while the booking's guest_name / location_address sat only in
-- appointment metadata. Design + policy: booking-merge dig 2026-11-10
-- §9 (fill-or-complete for last_name with a same-first-name guard;
-- booking-wins structured address; provenance stamp
-- customers.metadata.last_booking_merge; merge writes only at push
-- time, so a later staff edit stands until a later booking).
--
-- WHAT THIS FILE DOES: re-issues BOTH push RPCs as full bodies --
-- public_booking_book_appointment_staff_v1 (from
-- 20261028235900_website_booking_staff_push_rpc.sql) and
-- public_booking_book_appointment_auto_v1 (from
-- 20261029150000_website_booking_auto_push_rpc.sql) -- with exactly
-- these changes and no others:
--   1. three new OPTIONAL trailing params (p_location_city,
--      p_location_region, p_location_postal_code; all DEFAULT NULL) so
--      the caller can supply the structured address parts it derives
--      from the geocode response (Mapbox context) or a comma-parse of
--      the booking address string;
--   2. the booking-merge block immediately after customer resolution
--      (name fill-or-complete + booking-wins address), identical in
--      both bodies;
--   3. the provenance stamp after the appointment insert, written only
--      when the merge actually changed the profile;
--   4. grants re-issued for the new signatures.
-- The twins stay identical by construction: the two bodies differ only
-- in the caller-authorization block and metadata.pushed_by, exactly as
-- before.
--
-- SIGNATURE CHANGE -- the old 25-arg overloads are DROPPED first.
-- CREATE OR REPLACE with added params would leave the 25-arg functions
-- alive alongside the new 28-arg ones, and PostgREST could no longer
-- choose a candidate for callers that send only the original named
-- args. Dropping first keeps exactly one overload per name; existing
-- callers keep working because every new param has a DEFAULT.
--
-- PROD-DRIFT WARNING (chair, before applying): this re-issue is built
-- from the function bodies as they exist in the repo at HEAD. Prod
-- bodies have drifted from repo migrations before (Cycles 1/2). Before
-- applying, capture pg_get_functiondef for both functions from prod
-- and diff against 20261028235900 / 20261029150000. If prod differs,
-- HOLD this migration and rebuild it from the prod bodies.
--
-- Scope: website-push channel ONLY (staff + auto twins). The
-- booking-LINK channel (public_booking_upsert_customer) is untouched --
-- its address behavior is a deliberate 2026-10-09 doctrine and its
-- reversal is an owner decision (dig Q3). No backfill here (dig S5 is
-- an owner-gated data step). No schema change; no new tables; RLS
-- untouched (both functions stay SECURITY DEFINER with search_path='').
--
-- NOT APPLIED by the feature branch -- delivered as a migration file
-- for the owner to apply (supabase migration order: filename timestamp
-- governs).

-- Drop the old 25-arg overloads (see header: signature change).
drop function if exists public.public_booking_book_appointment_staff_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text);
drop function if exists public.public_booking_book_appointment_auto_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text);

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
  p_payment_status text default null,
  p_location_city text default null,
  p_location_region text default null,
  p_location_postal_code text default null
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
  v_booking_first text;
  v_booking_last text;
  v_stored_first text;
  v_stored_last text;
  v_stored_city text;
  v_stored_region text;
  v_stored_postal text;
  v_profile_address text;
  v_has_parts boolean := false;
  v_merged boolean := false;
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

  -- Booking merge (owner's rule, 2026-11-09; booking-merge dig §9): the
  -- booking's guest name and service address merge into the resolved
  -- customer's profile -- the booking's data wins. This runs for the
  -- matched AND the just-created customer, so there is exactly one merge
  -- code path; for a just-created customer the stored values already
  -- equal the booking's, so the writes are no-ops unless the structured
  -- address parts (p_location_city / p_location_region /
  -- p_location_postal_code) refine the profile. The merge writes only at
  -- push time: a staff edit made after this push stands until a later
  -- booking. If any later step in this function raises, the transaction
  -- rolls back and the merge rolls back with it.
  v_booking_first := split_part(trim(p_guest_name), ' ', 1);
  v_booking_last := coalesce(nullif(trim(substr(trim(p_guest_name), length(v_booking_first) + 1)), ''), '');

  select c.first_name, c.last_name, c.city, c.region, c.postal_code,
         nullif(concat_ws(', ',
           nullif(trim(c.address_line1), ''),
           nullif(trim(c.address_line2), ''),
           nullif(trim(c.city), ''),
           nullif(trim(c.region), ''),
           nullif(trim(c.postal_code), '')), '')
    into v_stored_first, v_stored_last, v_stored_city, v_stored_region, v_stored_postal, v_profile_address
  from public.customers c
  where c.id = v_customer_id;

  -- Name (dig §9.1, fill-or-complete): a blank stored surname is filled
  -- from the booking split. A non-blank stored surname is overwritten
  -- only when the booking carries a different non-blank surname for the
  -- SAME first name (same person, fuller or corrected surname). When the
  -- first names differ, the booking may be a guest booking for someone
  -- else -- the profile name is left alone (the appointment metadata
  -- still carries the guest name). The split reuses the create branch's
  -- SQL form verbatim, so a customer created by one push and merged by
  -- the next produces identical values.
  if coalesce(v_stored_last, '') = '' then
    if v_booking_first is distinct from v_stored_first
       or v_booking_last is distinct from coalesce(v_stored_last, '') then
      update public.customers
      set first_name = v_booking_first,
          last_name = v_booking_last
      where id = v_customer_id;
      v_merged := true;
    end if;
  elsif v_booking_last <> ''
        and v_booking_last is distinct from v_stored_last
        and lower(v_booking_first) = lower(coalesce(v_stored_first, '')) then
    update public.customers
    set first_name = v_booking_first,
        last_name = v_booking_last
    where id = v_customer_id;
    v_merged := true;
  end if;

  -- Address (dig §9.2, booking wins, structured): merge when the booking
  -- address differs from the composed profile address (the
  -- [line1, line2, city, region, postal_code] composition every read
  -- model uses), or when structured parts arrive and the stored
  -- structured trio differs from them (a profile holding the same
  -- address as one jammed line still gains its structure). With parts,
  -- address_line1 takes the street line (the booking string's first
  -- comma segment) and the trio takes the parts; without parts,
  -- address_line1 takes the whole booking string and the trio is nulled
  -- so the composed address never mixes two addresses. address_line2 is
  -- never touched (unit numbers live there).
  v_has_parts := nullif(trim(coalesce(p_location_city, '')), '') is not null
              or nullif(trim(coalesce(p_location_region, '')), '') is not null
              or nullif(trim(coalesce(p_location_postal_code, '')), '') is not null;

  if trim(p_location_address) is distinct from coalesce(v_profile_address, '')
     or (v_has_parts and (
           nullif(trim(coalesce(p_location_city, '')), '') is distinct from nullif(trim(coalesce(v_stored_city, '')), '')
           or nullif(trim(coalesce(p_location_region, '')), '') is distinct from nullif(trim(coalesce(v_stored_region, '')), '')
           or nullif(trim(coalesce(p_location_postal_code, '')), '') is distinct from nullif(trim(coalesce(v_stored_postal, '')), ''))) then
    if v_has_parts then
      update public.customers
      set address_line1 = nullif(trim(split_part(trim(p_location_address), ',', 1)), ''),
          city = nullif(trim(coalesce(p_location_city, '')), ''),
          region = nullif(trim(coalesce(p_location_region, '')), ''),
          postal_code = nullif(trim(coalesce(p_location_postal_code, '')), '')
      where id = v_customer_id;
    else
      update public.customers
      set address_line1 = nullif(trim(p_location_address), ''),
          city = null,
          region = null,
          postal_code = null
      where id = v_customer_id;
    end if;
    v_merged := true;
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

  -- Provenance (dig §9): when the booking merge above changed the
  -- profile, stamp the customer with when, which appointment, and the
  -- channel. Written here, after the appointment exists; an unchanged
  -- profile is never stamped.
  if v_merged then
    update public.customers
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
           'last_booking_merge',
           jsonb_build_object(
             'at', now(),
             'appointment_id', v_appointment_id::text,
             'channel', 'website_push'
           )
         )
    where id = v_customer_id;
  end if;

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment_staff_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text,text,text,text) from public, anon;
grant execute on function public.public_booking_book_appointment_staff_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text,text,text,text) to authenticated;

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
  p_payment_status text default null,
  p_location_city text default null,
  p_location_region text default null,
  p_location_postal_code text default null
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
  v_booking_first text;
  v_booking_last text;
  v_stored_first text;
  v_stored_last text;
  v_stored_city text;
  v_stored_region text;
  v_stored_postal text;
  v_profile_address text;
  v_has_parts boolean := false;
  v_merged boolean := false;
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

  -- Booking merge (owner's rule, 2026-11-09; booking-merge dig §9): the
  -- booking's guest name and service address merge into the resolved
  -- customer's profile -- the booking's data wins. This runs for the
  -- matched AND the just-created customer, so there is exactly one merge
  -- code path; for a just-created customer the stored values already
  -- equal the booking's, so the writes are no-ops unless the structured
  -- address parts (p_location_city / p_location_region /
  -- p_location_postal_code) refine the profile. The merge writes only at
  -- push time: a staff edit made after this push stands until a later
  -- booking. If any later step in this function raises, the transaction
  -- rolls back and the merge rolls back with it.
  v_booking_first := split_part(trim(p_guest_name), ' ', 1);
  v_booking_last := coalesce(nullif(trim(substr(trim(p_guest_name), length(v_booking_first) + 1)), ''), '');

  select c.first_name, c.last_name, c.city, c.region, c.postal_code,
         nullif(concat_ws(', ',
           nullif(trim(c.address_line1), ''),
           nullif(trim(c.address_line2), ''),
           nullif(trim(c.city), ''),
           nullif(trim(c.region), ''),
           nullif(trim(c.postal_code), '')), '')
    into v_stored_first, v_stored_last, v_stored_city, v_stored_region, v_stored_postal, v_profile_address
  from public.customers c
  where c.id = v_customer_id;

  -- Name (dig §9.1, fill-or-complete): a blank stored surname is filled
  -- from the booking split. A non-blank stored surname is overwritten
  -- only when the booking carries a different non-blank surname for the
  -- SAME first name (same person, fuller or corrected surname). When the
  -- first names differ, the booking may be a guest booking for someone
  -- else -- the profile name is left alone (the appointment metadata
  -- still carries the guest name). The split reuses the create branch's
  -- SQL form verbatim, so a customer created by one push and merged by
  -- the next produces identical values.
  if coalesce(v_stored_last, '') = '' then
    if v_booking_first is distinct from v_stored_first
       or v_booking_last is distinct from coalesce(v_stored_last, '') then
      update public.customers
      set first_name = v_booking_first,
          last_name = v_booking_last
      where id = v_customer_id;
      v_merged := true;
    end if;
  elsif v_booking_last <> ''
        and v_booking_last is distinct from v_stored_last
        and lower(v_booking_first) = lower(coalesce(v_stored_first, '')) then
    update public.customers
    set first_name = v_booking_first,
        last_name = v_booking_last
    where id = v_customer_id;
    v_merged := true;
  end if;

  -- Address (dig §9.2, booking wins, structured): merge when the booking
  -- address differs from the composed profile address (the
  -- [line1, line2, city, region, postal_code] composition every read
  -- model uses), or when structured parts arrive and the stored
  -- structured trio differs from them (a profile holding the same
  -- address as one jammed line still gains its structure). With parts,
  -- address_line1 takes the street line (the booking string's first
  -- comma segment) and the trio takes the parts; without parts,
  -- address_line1 takes the whole booking string and the trio is nulled
  -- so the composed address never mixes two addresses. address_line2 is
  -- never touched (unit numbers live there).
  v_has_parts := nullif(trim(coalesce(p_location_city, '')), '') is not null
              or nullif(trim(coalesce(p_location_region, '')), '') is not null
              or nullif(trim(coalesce(p_location_postal_code, '')), '') is not null;

  if trim(p_location_address) is distinct from coalesce(v_profile_address, '')
     or (v_has_parts and (
           nullif(trim(coalesce(p_location_city, '')), '') is distinct from nullif(trim(coalesce(v_stored_city, '')), '')
           or nullif(trim(coalesce(p_location_region, '')), '') is distinct from nullif(trim(coalesce(v_stored_region, '')), '')
           or nullif(trim(coalesce(p_location_postal_code, '')), '') is distinct from nullif(trim(coalesce(v_stored_postal, '')), ''))) then
    if v_has_parts then
      update public.customers
      set address_line1 = nullif(trim(split_part(trim(p_location_address), ',', 1)), ''),
          city = nullif(trim(coalesce(p_location_city, '')), ''),
          region = nullif(trim(coalesce(p_location_region, '')), ''),
          postal_code = nullif(trim(coalesce(p_location_postal_code, '')), '')
      where id = v_customer_id;
    else
      update public.customers
      set address_line1 = nullif(trim(p_location_address), ''),
          city = null,
          region = null,
          postal_code = null
      where id = v_customer_id;
    end if;
    v_merged := true;
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

  -- Provenance (dig §9): when the booking merge above changed the
  -- profile, stamp the customer with when, which appointment, and the
  -- channel. Written here, after the appointment exists; an unchanged
  -- profile is never stamped.
  if v_merged then
    update public.customers
    set metadata = coalesce(metadata, '{}'::jsonb)
      || jsonb_build_object(
           'last_booking_merge',
           jsonb_build_object(
             'at', now(),
             'appointment_id', v_appointment_id::text,
             'channel', 'website_push'
           )
         )
    where id = v_customer_id;
  end if;

  return v_appointment_id;
end;
$$;

revoke all on function public.public_booking_book_appointment_auto_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text,text,text,text) from public, anon, authenticated;
grant execute on function public.public_booking_book_appointment_auto_v1(text,date,time,integer,text,text,text,text,text,text,numeric,uuid,text,integer,text,text,text,text,numeric,numeric,text,boolean,text,text,text,text,text,text) to service_role;
