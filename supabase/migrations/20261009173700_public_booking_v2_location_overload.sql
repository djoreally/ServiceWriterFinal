-- Location-aware v2 overload used by upgraded clients while preserving the
-- existing allowlisted RPC name. The legacy signature is hardened separately.
create or replace function public.public_booking_book_appointment_v2(
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
language sql
security definer
set search_path = ''
as $$
  select public.public_booking_book_appointment_v3(
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
    p_location_address,
    p_location_lat,
    p_location_lng,
    p_status
  );
$$;

revoke all on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) from public;
grant execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text) to anon, authenticated;
