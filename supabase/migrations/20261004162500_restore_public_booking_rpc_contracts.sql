-- Restore compatibility between the current public-booking application contract
-- and the canonical secure public-booking RPCs already present in production.
--
-- The application currently calls versioned RPC names and includes customer
-- phone/email context on several writes. Production migrations created the
-- secure canonical functions under earlier names/signatures. PostgREST resolves
-- RPCs by exact function name + named arguments, so the drift causes PGRST202
-- and breaks real public bookings before appointment creation.
--
-- These wrappers are intentionally thin. They preserve the existing security
-- boundary by delegating to the already-hardened SECURITY DEFINER functions.

begin;

-- Current browser payload includes p_customer_phone. The canonical secure
-- function does not need it for vehicle ownership because ownership is resolved
-- from booking slug + customer email.
create or replace function public.public_booking_upsert_vehicle(
  p_booking_slug text,
  p_customer_email text,
  p_customer_phone text,
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
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_upsert_vehicle(
    p_booking_slug,
    p_customer_email,
    p_year,
    p_make,
    p_model,
    p_license_plate,
    p_vin,
    p_mileage,
    p_oil_type,
    p_oil_capacity,
    p_image_url,
    p_engine
  )
$$;

create or replace function public.public_booking_book_appointment_v2(
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
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_book_appointment(
    p_booking_slug,
    p_scheduled_date,
    p_scheduled_time,
    p_duration_minutes,
    p_title,
    p_guest_name,
    p_guest_email,
    p_guest_phone,
    p_description,
    p_notes,
    p_estimated_cost,
    p_tax_amount,
    p_service_catalog_id,
    p_vehicle_id,
    p_status
  )
$$;

create or replace function public.public_booking_update_appointment_context_v2(
  p_booking_slug text,
  p_appointment_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_dispatch_notes text default null,
  p_location_address text default null,
  p_location_lat numeric default null,
  p_location_lng numeric default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_update_appointment_context(
    p_booking_slug,
    p_appointment_id,
    p_dispatch_notes,
    p_location_address,
    p_location_lat,
    p_location_lng
  )
$$;

create or replace function public.public_booking_save_configuration_v2(
  p_booking_slug text,
  p_appointment_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_configuration jsonb
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_save_configuration(
    p_booking_slug,
    p_appointment_id,
    p_configuration
  )
$$;

create or replace function public.public_booking_insert_services_v7(
  p_booking_slug text,
  p_appointment_id uuid,
  p_customer_email text,
  p_customer_phone text,
  p_services jsonb
)
returns integer
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_insert_services(
    p_booking_slug,
    p_appointment_id,
    p_services
  )
$$;

create or replace function public.public_booking_record_payment_intent_v3(
  p_booking_slug text,
  p_appointment_id uuid,
  p_amount bigint,
  p_subtotal bigint,
  p_tax_amount bigint,
  p_tax_rate numeric,
  p_currency text,
  p_customer_email text,
  p_customer_phone text,
  p_customer_name text
)
returns uuid
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_record_payment_intent_v2(
    p_booking_slug,
    p_appointment_id,
    p_amount,
    p_subtotal,
    p_tax_amount,
    p_tax_rate,
    p_currency,
    p_customer_email,
    p_customer_name
  )
$$;

create or replace function public.public_booking_set_vehicle_tire_spec_v3(
  p_booking_slug text,
  p_customer_email text,
  p_customer_phone text,
  p_vehicle_id uuid,
  p_tire_size text,
  p_tire_size_source text default null,
  p_tire_size_front text default null,
  p_tire_size_rear text default null,
  p_tire_load_index text default null,
  p_tire_speed_rating text default null
)
returns void
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_set_vehicle_tire_spec_v2(
    p_booking_slug,
    p_customer_email,
    p_vehicle_id,
    p_tire_size,
    p_tire_size_source,
    p_tire_size_front,
    p_tire_size_rear,
    p_tire_load_index,
    p_tire_speed_rating
  )
$$;

-- PostgreSQL grants EXECUTE to PUBLIC by default for new functions. Remove that
-- implicit privilege and grant only the roles used by the public booking path.
revoke all on function public.public_booking_upsert_vehicle(text,text,text,integer,text,text,text,text,integer,text,text,text,text) from public;
revoke all on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) from public;
revoke all on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) from public;
revoke all on function public.public_booking_save_configuration_v2(text,uuid,text,text,jsonb) from public;
revoke all on function public.public_booking_insert_services_v7(text,uuid,text,text,jsonb) from public;
revoke all on function public.public_booking_record_payment_intent_v3(text,uuid,bigint,bigint,bigint,numeric,text,text,text,text) from public;
revoke all on function public.public_booking_set_vehicle_tire_spec_v3(text,text,text,uuid,text,text,text,text,text,text) from public;

grant execute on function public.public_booking_upsert_vehicle(text,text,text,integer,text,text,text,text,integer,text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text) to anon, authenticated, service_role;
grant execute on function public.public_booking_update_appointment_context_v2(text,uuid,text,text,text,text,numeric,numeric) to anon, authenticated, service_role;
grant execute on function public.public_booking_save_configuration_v2(text,uuid,text,text,jsonb) to anon, authenticated, service_role;
grant execute on function public.public_booking_insert_services_v7(text,uuid,text,text,jsonb) to anon, authenticated, service_role;
grant execute on function public.public_booking_record_payment_intent_v3(text,uuid,bigint,bigint,bigint,numeric,text,text,text,text) to anon, authenticated, service_role;
grant execute on function public.public_booking_set_vehicle_tire_spec_v3(text,text,text,uuid,text,text,text,text,text,text) to anon, authenticated, service_role;

commit;
