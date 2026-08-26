-- Atomic, narrow write contract for anonymous public bookings against the
-- canonical workspace schema. Every function resolves the workspace from the
-- public provider id and validates ownership before writing.

create or replace function public.upsert_customer(
  p_user_id uuid,
  p_email text,
  p_name text,
  p_phone text default null,
  p_address text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_customer_id uuid;
  v_name text := trim(coalesce(p_name, ''));
  v_first_name text;
  v_last_name text;
begin
  if nullif(trim(p_email), '') is null or position('@' in p_email) < 2 then
    raise exception 'INVALID_CUSTOMER_EMAIL';
  end if;
  if length(v_name) < 1 or length(v_name) > 160 then
    raise exception 'INVALID_CUSTOMER_NAME';
  end if;

  select w.id into v_workspace_id
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_user_id and w.is_active and ws.booking_enabled
  order by w.created_at limit 1;
  if v_workspace_id is null then raise exception 'BOOKING_PROVIDER_UNAVAILABLE'; end if;

  v_first_name := split_part(v_name, ' ', 1);
  v_last_name := nullif(trim(substr(v_name, length(v_first_name) + 1)), '');
  v_last_name := coalesce(v_last_name, '');

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || lower(trim(p_email)), 0));
  select c.id into v_customer_id
  from public.customers c
  where c.workspace_id = v_workspace_id and lower(c.email::text) = lower(trim(p_email))
  order by c.created_at limit 1 for update;

  if v_customer_id is null then
    insert into public.customers(
      workspace_id, first_name, last_name, email, phone, address_line1, metadata
    ) values (
      v_workspace_id, v_first_name, v_last_name, lower(trim(p_email)),
      nullif(trim(p_phone), ''), nullif(trim(p_address), ''),
      jsonb_build_object('source', 'public_booking', 'full_name', v_name)
    ) returning id into v_customer_id;
  else
    update public.customers
    set first_name = v_first_name,
        last_name = v_last_name,
        phone = coalesce(nullif(trim(p_phone), ''), phone),
        address_line1 = coalesce(nullif(trim(p_address), ''), address_line1),
        metadata = metadata || jsonb_build_object('last_public_booking_at', now()),
        updated_at = now()
    where id = v_customer_id and workspace_id = v_workspace_id;
  end if;
  return v_customer_id;
end;
$$;

create or replace function public.upsert_booking_vehicle(
  p_business_user_id uuid,
  p_customer_id uuid,
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
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_vehicle_id uuid;
  v_vin text := upper(nullif(regexp_replace(coalesce(p_vin, ''), '[^A-Za-z0-9]', '', 'g'), ''));
begin
  select w.id into v_workspace_id
  from public.workspaces w join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id and w.is_active and ws.booking_enabled
  order by w.created_at limit 1;
  if v_workspace_id is null then raise exception 'BOOKING_PROVIDER_UNAVAILABLE'; end if;
  if p_year < 1886 or p_year > extract(year from now())::integer + 2
    or nullif(trim(p_make), '') is null or nullif(trim(p_model), '') is null then
    raise exception 'INVALID_VEHICLE';
  end if;
  if p_customer_id is not null and not exists (
    select 1 from public.customers c where c.id = p_customer_id and c.workspace_id = v_workspace_id
  ) then raise exception 'INVALID_CUSTOMER'; end if;
  if v_vin is not null and length(v_vin) <> 17 then raise exception 'INVALID_VIN'; end if;

  perform pg_advisory_xact_lock(hashtextextended(v_workspace_id::text || ':' || coalesce(v_vin, p_customer_id::text || ':' || p_year || ':' || lower(p_make) || ':' || lower(p_model) || ':' || coalesce(lower(p_license_plate), '')), 0));
  select v.id into v_vehicle_id
  from public.vehicles v
  where v.workspace_id = v_workspace_id and (
    (v_vin is not null and upper(v.vin) = v_vin) or
    (v_vin is null and v.customer_id is not distinct from p_customer_id and v.year = p_year
      and lower(v.make) = lower(trim(p_make)) and lower(v.model) = lower(trim(p_model))
      and coalesce(lower(v.license_plate), '') = coalesce(lower(nullif(trim(p_license_plate), '')), ''))
  ) order by v.created_at limit 1 for update;

  if v_vehicle_id is null then
    insert into public.vehicles(
      workspace_id, customer_id, vin, year, make, model, license_plate, mileage, metadata
    ) values (
      v_workspace_id, p_customer_id, v_vin, p_year, trim(p_make), trim(p_model),
      upper(nullif(trim(p_license_plate), '')), p_mileage,
      jsonb_strip_nulls(jsonb_build_object('source','public_booking','image_url',p_image_url))
    ) returning id into v_vehicle_id;
  else
    update public.vehicles set
      customer_id = coalesce(p_customer_id, customer_id),
      license_plate = coalesce(upper(nullif(trim(p_license_plate), '')), license_plate),
      mileage = coalesce(p_mileage, mileage), updated_at = now()
    where id = v_vehicle_id and workspace_id = v_workspace_id;
  end if;

  if p_engine is not null or p_oil_type is not null or p_oil_capacity is not null then
    insert into public.vehicle_service_specs(workspace_id, vehicle_id, engine, oil_type, oil_capacity, source, metadata)
    values (v_workspace_id, v_vehicle_id, p_engine, p_oil_type, p_oil_capacity, 'public_booking', '{}'::jsonb)
    on conflict (workspace_id, vehicle_id) do update set
      engine = coalesce(excluded.engine, public.vehicle_service_specs.engine),
      oil_type = coalesce(excluded.oil_type, public.vehicle_service_specs.oil_type),
      oil_capacity = coalesce(excluded.oil_capacity, public.vehicle_service_specs.oil_capacity),
      source = 'public_booking', updated_at = now();
  end if;
  return v_vehicle_id;
end;
$$;

create or replace function public.book_appointment_safe(
  p_business_user_id uuid,
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
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_timezone text;
  v_settings public.workspace_settings%rowtype;
  v_customer_id uuid;
  v_appointment_id uuid;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_status public.appointment_status;
begin
  if p_duration_minutes < 1 or p_duration_minutes > 1440 then raise exception 'INVALID_DURATION'; end if;
  if coalesce(p_estimated_cost, 0) < 0 or coalesce(p_tax_amount, 0) < 0 then raise exception 'INVALID_AMOUNT'; end if;

  select w.id, w.timezone into v_workspace_id, v_timezone
  from public.workspaces w join public.workspace_settings ws on ws.workspace_id = w.id
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
  if lower(to_char(v_starts_at at time zone v_timezone, 'FMDay')) <> all(
    select lower(x) from unnest(v_settings.working_days) x
  ) then raise exception 'DATE_BLOCKED'; end if;
  if p_scheduled_time < coalesce(v_settings.opening_time, '00:00'::time)
    or (p_scheduled_time + make_interval(mins => p_duration_minutes))::time > coalesce(v_settings.closing_time, '23:59'::time) then
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
$$;

create or replace function public.save_appointment_booking_configuration(
  p_appointment_id uuid,
  p_business_user_id uuid,
  p_configuration jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_workspace_id uuid;
begin
  select id into v_workspace_id from public.workspaces where created_by = p_business_user_id and is_active order by created_at limit 1;
  if jsonb_typeof(p_configuration) <> 'object' then raise exception 'INVALID_BOOKING_CONFIGURATION'; end if;
  update public.appointments set metadata = metadata || jsonb_build_object('booking_configuration', p_configuration), updated_at = now()
  where id = p_appointment_id and workspace_id = v_workspace_id and source = 'public_booking' and created_at > now() - interval '15 minutes';
  if not found then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
end;
$$;

create or replace function public.insert_booking_appointment_services(p_appointment_id uuid, p_services jsonb)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_workspace_id uuid;
  v_count integer := 0;
  v_service jsonb;
  v_catalog_id uuid;
begin
  select workspace_id into v_workspace_id from public.appointments
  where id = p_appointment_id and source = 'public_booking' and created_at > now() - interval '30 minutes';
  if v_workspace_id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if jsonb_typeof(p_services) <> 'array' or jsonb_array_length(p_services) > 25 then raise exception 'INVALID_SERVICE_ITEMS'; end if;
  if exists (select 1 from public.appointment_items where workspace_id=v_workspace_id and appointment_id=p_appointment_id) then
    return 0;
  end if;
  for v_service in select value from jsonb_array_elements(p_services)
  loop
    v_catalog_id := nullif(v_service ->> 'service_catalog_id', '')::uuid;
    if v_catalog_id is not null and not exists (
      select 1 from public.service_catalog where id=v_catalog_id and workspace_id=v_workspace_id and is_active
    ) then raise exception 'INVALID_SERVICE'; end if;
    if coalesce((v_service ->> 'price')::numeric, 0) < 0 or coalesce((v_service ->> 'quantity')::numeric, 0) <= 0 then
      raise exception 'INVALID_SERVICE_AMOUNT';
    end if;
    insert into public.appointment_items(workspace_id,appointment_id,service_catalog_id,description,quantity,unit_price,is_prepaid,sort_order,metadata)
    values (v_workspace_id,p_appointment_id,v_catalog_id,left(coalesce(v_service->>'name','Service'),250),
      coalesce((v_service->>'quantity')::numeric,1),coalesce((v_service->>'price')::numeric,0),
      coalesce((v_service->>'is_prepaid')::boolean,false),v_count,
      jsonb_strip_nulls(jsonb_build_object('vehicle_id',v_service->>'vehicle_id','source','public_booking')));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

create or replace function public.record_public_booking_payment_intent_v1(
  p_business_user_id uuid,
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
set search_path = public
as $$
declare v_workspace_id uuid; v_customer_id uuid; v_payment_id uuid;
begin
  select a.workspace_id,a.customer_id into v_workspace_id,v_customer_id
  from public.appointments a join public.workspaces w on w.id=a.workspace_id
  where a.id=p_appointment_id and w.created_by=p_business_user_id and a.source='public_booking'
    and a.created_at > now()-interval '30 minutes' and lower(a.metadata->>'guest_email')=lower(trim(p_customer_email));
  if v_workspace_id is null then raise exception 'APPOINTMENT_NOT_FOUND'; end if;
  if p_amount < 0 or p_subtotal < 0 or p_tax_amount < 0 then raise exception 'INVALID_AMOUNT'; end if;
  select id into v_payment_id from public.payments
  where workspace_id=v_workspace_id and metadata->>'appointment_id'=p_appointment_id::text
    and metadata->>'payment_type'='pay_at_service' order by created_at limit 1;
  if v_payment_id is null then
    insert into public.payments(workspace_id,customer_id,status,amount,currency_code,metadata)
    values (v_workspace_id,v_customer_id,'pending',round(p_amount::numeric/100,2),upper(left(coalesce(p_currency,'USD'),3)),
      jsonb_build_object('appointment_id',p_appointment_id,'payment_type','pay_at_service','subtotal_cents',p_subtotal,
        'tax_amount_cents',p_tax_amount,'tax_rate',p_tax_rate,'customer_email',lower(trim(p_customer_email)),
        'customer_name',left(p_customer_name,160),'collected_amount',0,'source','public_booking'))
    returning id into v_payment_id;
  end if;
  return v_payment_id;
end;
$$;

create or replace function public.set_vehicle_tire_spec_v1(
  p_business_user_id uuid,
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
set search_path = public
as $$
declare v_workspace_id uuid;
begin
  select id into v_workspace_id from public.workspaces where created_by=p_business_user_id and is_active order by created_at limit 1;
  update public.vehicles set metadata=metadata||jsonb_strip_nulls(jsonb_build_object(
    'tire_size',p_tire_size,'tire_size_source',p_tire_size_source,'tire_size_front',p_tire_size_front,
    'tire_size_rear',p_tire_size_rear,'tire_load_index',p_tire_load_index,'tire_speed_rating',p_tire_speed_rating)),updated_at=now()
  where id=p_vehicle_id and workspace_id=v_workspace_id;
  if not found then raise exception 'INVALID_VEHICLE'; end if;
end;
$$;

revoke all on function public.upsert_customer(uuid,text,text,text,text) from public;
revoke all on function public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text) from public;
revoke all on function public.book_appointment_safe(uuid,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public;
revoke all on function public.save_appointment_booking_configuration(uuid,uuid,jsonb) from public;
revoke all on function public.insert_booking_appointment_services(uuid,jsonb) from public;
revoke all on function public.record_public_booking_payment_intent_v1(uuid,uuid,bigint,bigint,bigint,numeric,text,text,text) from public;
revoke all on function public.set_vehicle_tire_spec_v1(uuid,uuid,text,text,text,text,text,text) from public;

grant execute on function public.upsert_customer(uuid,text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.upsert_booking_vehicle(uuid,uuid,integer,text,text,text,text,integer,text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.book_appointment_safe(uuid,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon, authenticated, service_role;
grant execute on function public.save_appointment_booking_configuration(uuid,uuid,jsonb) to anon, authenticated, service_role;
grant execute on function public.insert_booking_appointment_services(uuid,jsonb) to anon, authenticated, service_role;
grant execute on function public.record_public_booking_payment_intent_v1(uuid,uuid,bigint,bigint,bigint,numeric,text,text,text) to anon, authenticated, service_role;
grant execute on function public.set_vehicle_tire_spec_v1(uuid,uuid,text,text,text,text,text,text) to anon, authenticated, service_role;
