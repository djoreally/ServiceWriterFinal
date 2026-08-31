-- Secure public booking RPC context migration.
-- Public callers provide the canonical booking slug; the database resolves the
-- workspace and business owner. Caller-supplied business_user_id is removed
-- from the public contract and legacy mutation RPCs become server-only.

begin;

create or replace function public.resolve_public_booking_context(p_booking_slug text)
returns table (workspace_id uuid, business_user_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select w.id, w.created_by
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where lower(ws.booking_slug::text) = lower(trim(p_booking_slug))
    and w.is_active
    and ws.booking_enabled
  limit 1
$$;

revoke all on function public.resolve_public_booking_context(text) from public, anon, authenticated;

create or replace function public.public_booking_upsert_customer(
  p_booking_slug text,
  p_email text,
  p_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_workspace_id uuid; v_customer_id uuid; v_first_name text; v_last_name text;
begin
  select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if length(trim(coalesce(p_email, ''))) < 3 or length(trim(coalesce(p_email, ''))) > 320
     or position('@' in p_email) < 2 then raise exception 'INVALID_EMAIL'; end if;
  if length(trim(coalesce(p_name, ''))) < 1 or length(trim(p_name)) > 160 then raise exception 'INVALID_NAME'; end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || lower(trim(p_email)), 0));
  select c.id into v_customer_id from public.customers c
  where c.workspace_id = v_workspace_id and lower(c.email::text) = lower(trim(p_email))
  order by c.created_at limit 1 for update;
  if v_customer_id is not null then return v_customer_id; end if;
  v_first_name := split_part(trim(p_name), ' ', 1);
  v_last_name := nullif(trim(substr(trim(p_name), length(v_first_name) + 1)), '');
  insert into public.customers(workspace_id, first_name, last_name, email, phone, address_line1, metadata)
  values (v_workspace_id, v_first_name, coalesce(v_last_name, ''), lower(trim(p_email)),
    nullif(trim(p_phone), ''), nullif(trim(p_address), ''), jsonb_build_object('source', 'public_booking'))
  returning id into v_customer_id;
  return v_customer_id;
end;
$$;

create or replace function public.public_booking_upsert_vehicle(
  p_booking_slug text,
  p_customer_email text,
  p_year integer,
  p_make text,
  p_model text,
  p_license_plate text default null,
  p_vin text default null,
  p_mileage integer default null,
  p_oil_type text default null,
  p_oil_capacity text default null,
  p_image_url text default null,
  p_engine text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_user_id uuid; v_workspace_id uuid; v_customer_id uuid;
begin
  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  select c.id into v_customer_id from public.customers c
  where c.workspace_id = v_workspace_id and lower(c.email::text) = lower(trim(p_customer_email))
  order by c.created_at limit 1;
  if v_customer_id is null then raise exception 'CUSTOMER_CONTEXT_INVALID'; end if;
  return public.upsert_booking_vehicle(v_business_user_id, v_customer_id, p_year, p_make, p_model,
    p_license_plate, p_vin, p_mileage, p_oil_type, p_oil_capacity, p_image_url, p_engine);
end;
$$;

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
  v_business_user_id uuid; v_workspace_id uuid; v_vehicle_workspace uuid; v_service_workspace uuid;
  v_guest_customer_id uuid; v_timezone text; v_settings public.workspace_settings%rowtype;
  v_appointment_id uuid; v_starts_at timestamptz; v_ends_at timestamptz; v_status public.appointment_status;
begin
  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  if p_duration_minutes is null or p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if coalesce(p_estimated_cost, 0) < 0 or coalesce(p_tax_amount, 0) < 0 then raise exception 'INVALID_AMOUNT'; end if;
  if length(trim(coalesce(p_guest_email, ''))) < 3 or position('@' in p_guest_email) < 2 then raise exception 'INVALID_EMAIL'; end if;
  select w.timezone into v_timezone from public.workspaces w where w.id = v_workspace_id;
  select * into v_settings from public.workspace_settings where workspace_id = v_workspace_id;
  v_starts_at := (p_scheduled_date + p_scheduled_time) at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => p_duration_minutes);
  if v_starts_at < now() + make_interval(hours => coalesce(v_settings.min_lead_time_hours, 0)) or v_starts_at > now() + make_interval(days => coalesce(v_settings.max_advance_days, 365)) then raise exception 'DATE_BLOCKED'; end if;
  select c.id into v_guest_customer_id from public.customers c where c.workspace_id = v_workspace_id and lower(c.email::text) = lower(trim(p_guest_email)) order by c.created_at limit 1;
  if v_guest_customer_id is null then
    insert into public.customers(workspace_id, first_name, last_name, email, phone, metadata)
    values (v_workspace_id, split_part(trim(p_guest_name), ' ', 1), coalesce(nullif(trim(substr(trim(p_guest_name), length(split_part(trim(p_guest_name), ' ', 1)) + 1)), ''), ''), lower(trim(p_guest_email)), nullif(trim(p_guest_phone), ''), jsonb_build_object('source', 'public_booking'))
    returning id into v_guest_customer_id;
  end if;
  if p_vehicle_id is not null then
    select v.workspace_id into v_vehicle_workspace from public.vehicles v where v.id = p_vehicle_id and v.customer_id is not distinct from v_guest_customer_id;
    if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
  end if;
  if p_service_catalog_id is not null then
    select s.workspace_id into v_service_workspace from public.service_catalog s where s.id = p_service_catalog_id and s.is_active;
    if v_service_workspace is distinct from v_workspace_id then raise exception 'INVALID_SERVICE'; end if;
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || v_starts_at::text, 0));
  if exists (select 1 from public.appointments a where a.workspace_id = v_workspace_id and a.status::text not in ('cancelled', 'no_show') and a.starts_at < v_ends_at and a.ends_at > v_starts_at) then raise exception 'SLOT_UNAVAILABLE'; end if;
  v_status := case when p_status in ('confirmed', 'scheduled') then 'confirmed'::public.appointment_status else 'requested'::public.appointment_status end;
  insert into public.appointments(workspace_id, customer_id, vehicle_id, status, starts_at, ends_at, source, confirmation_code, notes, metadata)
  values (v_workspace_id, v_guest_customer_id, p_vehicle_id, v_status, v_starts_at, v_ends_at, 'public_booking', upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)), p_notes, jsonb_strip_nulls(jsonb_build_object('title', left(coalesce(p_title, 'Online booking'), 500), 'guest_name', left(p_guest_name, 160), 'guest_email', lower(trim(p_guest_email)), 'guest_phone', p_guest_phone, 'description', p_description, 'estimated_cost', round(coalesce(p_estimated_cost, 0), 2), 'tax_amount', round(coalesce(p_tax_amount, 0), 2), 'service_catalog_id', p_service_catalog_id)))
  returning id into v_appointment_id;
  return v_appointment_id;
end;
$$;

create or replace function public.public_booking_save_configuration(
  p_booking_slug text,
  p_appointment_id uuid,
  p_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_user_id uuid; v_workspace_id uuid; v_appointment_workspace uuid;
begin
  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  select a.workspace_id into v_appointment_workspace from public.appointments a
  where a.id = p_appointment_id and a.source = 'public_booking' and a.created_at > now() - interval '30 minutes';
  if v_appointment_workspace is distinct from v_workspace_id then raise exception 'INVALID_APPOINTMENT'; end if;
  perform public.save_appointment_booking_configuration(p_appointment_id, v_business_user_id, p_configuration);
end;
$$;

create or replace function public.public_booking_insert_services(
  p_booking_slug text,
  p_appointment_id uuid,
  p_services jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare v_workspace_id uuid; v_appointment_workspace uuid;
begin
  select c.workspace_id into v_workspace_id from public.resolve_public_booking_context(p_booking_slug) c;
  if v_workspace_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  select a.workspace_id into v_appointment_workspace from public.appointments a
  where a.id = p_appointment_id and a.source = 'public_booking' and a.created_at > now() - interval '30 minutes';
  if v_appointment_workspace is distinct from v_workspace_id then raise exception 'INVALID_APPOINTMENT'; end if;
  return public.insert_booking_appointment_services(p_appointment_id, p_services);
end;
$$;

create or replace function public.public_booking_record_payment_intent_v2(
  p_booking_slug text,
  p_appointment_id uuid,
  p_amount bigint,
  p_subtotal bigint,
  p_tax_amount bigint,
  p_tax_rate numeric,
  p_currency text,
  p_customer_email text,
  p_customer_name text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_user_id uuid; v_workspace_id uuid; v_appointment_workspace uuid;
begin
  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  select a.workspace_id into v_appointment_workspace from public.appointments a where a.id = p_appointment_id;
  if v_appointment_workspace is distinct from v_workspace_id then raise exception 'INVALID_APPOINTMENT'; end if;
  return public.record_public_booking_payment_intent_v1(v_business_user_id, p_appointment_id, p_amount,
    p_subtotal, p_tax_amount, p_tax_rate, p_currency, p_customer_email, p_customer_name);
end;
$$;

create or replace function public.public_booking_set_vehicle_tire_spec_v2(
  p_booking_slug text,
  p_customer_email text,
  p_vehicle_id uuid,
  p_tire_size text,
  p_tire_size_source text default null,
  p_tire_size_front text default null,
  p_tire_size_rear text default null,
  p_tire_load_index text default null,
  p_tire_speed_rating text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare v_business_user_id uuid; v_workspace_id uuid; v_vehicle_workspace uuid; v_customer_id uuid;
begin
  select c.workspace_id, c.business_user_id into v_workspace_id, v_business_user_id
  from public.resolve_public_booking_context(p_booking_slug) c;
  if v_business_user_id is null then raise exception 'BOOKING_CONTEXT_INVALID'; end if;
  select c.id into v_customer_id from public.customers c
  where c.workspace_id = v_workspace_id and lower(c.email::text) = lower(trim(p_customer_email))
  order by c.created_at limit 1;
  select v.workspace_id into v_vehicle_workspace from public.vehicles v where v.id = p_vehicle_id and v.customer_id is not distinct from v_customer_id;
  if v_vehicle_workspace is distinct from v_workspace_id then raise exception 'INVALID_VEHICLE'; end if;
  perform public.set_vehicle_tire_spec_v1(v_business_user_id, p_vehicle_id, p_tire_size,
    p_tire_size_source, p_tire_size_front, p_tire_size_rear, p_tire_load_index, p_tire_speed_rating);
end;
$$;

-- Legacy public mutation functions are retained only for trusted server-side
-- compatibility. They must not be callable by browser roles.
revoke all on function public.upsert_customer(uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text) from public, anon, authenticated;
revoke all on function public.book_appointment_safe(uuid,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.save_appointment_booking_configuration(uuid,uuid,jsonb) from public, anon, authenticated;
revoke all on function public.insert_booking_appointment_services(uuid,jsonb) from public, anon, authenticated;
revoke all on function public.record_public_booking_payment_intent_v1(uuid,uuid,bigint,bigint,bigint,numeric,text,text,text) from public, anon, authenticated;
revoke all on function public.set_vehicle_tire_spec_v1(uuid,uuid,text,text,text,text,text,text) from public, anon, authenticated;

-- New public contracts are explicitly allowlisted. PostgreSQL grants EXECUTE to
-- PUBLIC by default for functions, so remove that implicit privilege first.
revoke all on function public.public_booking_upsert_customer(text,text,text,text,text) from public;
revoke all on function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text) from public;
revoke all on function public.public_booking_book_appointment(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public;
revoke all on function public.public_booking_save_configuration(text,uuid,jsonb) from public;
revoke all on function public.public_booking_insert_services(text,uuid,jsonb) from public;
revoke all on function public.public_booking_record_payment_intent_v2(text,uuid,bigint,bigint,bigint,numeric,text,text,text) from public;
revoke all on function public.public_booking_set_vehicle_tire_spec_v2(text,text,uuid,text,text,text,text,text,text) from public;

grant execute on function public.public_booking_upsert_customer(text,text,text,text,text) to anon, authenticated;
grant execute on function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text) to anon, authenticated;
grant execute on function public.public_booking_book_appointment(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon, authenticated;
grant execute on function public.public_booking_save_configuration(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.public_booking_insert_services(text,uuid,jsonb) to anon, authenticated;
grant execute on function public.public_booking_record_payment_intent_v2(text,uuid,bigint,bigint,bigint,numeric,text,text,text) to anon, authenticated;
grant execute on function public.public_booking_set_vehicle_tire_spec_v2(text,text,uuid,text,text,text,text,text,text) to anon, authenticated;

-- Avoid search_path hijacking in every new SECURITY DEFINER function.
alter function public.resolve_public_booking_context(text) set search_path = '';
alter function public.public_booking_upsert_customer(text,text,text,text,text) set search_path = '';
alter function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text) set search_path = '';
alter function public.public_booking_book_appointment(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) set search_path = '';
alter function public.public_booking_save_configuration(text,uuid,jsonb) set search_path = '';
alter function public.public_booking_insert_services(text,uuid,jsonb) set search_path = '';
alter function public.public_booking_record_payment_intent_v2(text,uuid,bigint,bigint,bigint,numeric,text,text,text) set search_path = '';
alter function public.public_booking_set_vehicle_tire_spec_v2(text,text,uuid,text,text,text,text,text,text) set search_path = '';

commit;
