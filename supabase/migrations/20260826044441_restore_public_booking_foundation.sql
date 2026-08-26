-- Reintroduce the narrow, anonymous-safe read contract used by public booking.
-- Base tables remain fail-closed behind RLS; only explicitly selected fields
-- are exposed through these functions.

create or replace function public.get_public_booking_profile_v2(booking_slug_param text)
returns table (
  user_id uuid,
  business_name text,
  logo_url text,
  phone text,
  email text,
  opening_time time,
  closing_time time,
  working_days text[],
  currency text,
  stripe_charges_enabled boolean,
  service_radius_miles numeric,
  service_address text,
  service_coordinates jsonb,
  buffer_time_before integer,
  buffer_time_after integer,
  min_lead_time_hours integer,
  max_advance_days integer,
  slot_duration_minutes integer,
  google_review_url text,
  yelp_review_url text,
  oil_price_per_quart numeric,
  allow_cancellation boolean,
  allow_rescheduling boolean,
  cancellation_window_hours integer,
  reschedule_window_hours integer,
  require_approval boolean,
  require_terms_acceptance boolean,
  terms_and_conditions text
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.created_by,
    w.name,
    ws.logo_url,
    ws.phone,
    ws.email::text,
    ws.opening_time,
    ws.closing_time,
    ws.working_days,
    trim(w.currency_code),
    coalesce((ws.operational_settings ->> 'stripe_charges_enabled')::boolean, false)
      and nullif(ws.operational_settings ->> 'stripe_account_id', '') is not null,
    ws.service_radius_miles,
    coalesce(nullif(ws.operational_settings ->> 'service_address', ''),
      concat_ws(', ', ws.address_line1, ws.city, ws.region, ws.postal_code)),
    ws.operational_settings -> 'service_coordinates',
    ws.buffer_time_before,
    ws.buffer_time_after,
    ws.min_lead_time_hours,
    ws.max_advance_days,
    ws.slot_duration_minutes,
    ws.operational_settings ->> 'google_review_url',
    ws.operational_settings ->> 'yelp_review_url',
    ws.oil_price_per_quart,
    ws.allow_cancellation,
    ws.allow_rescheduling,
    ws.cancellation_window_hours,
    ws.reschedule_window_hours,
    ws.require_approval,
    ws.require_terms_acceptance,
    ws.terms_and_conditions
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where lower(ws.booking_slug::text) = lower(trim(booking_slug_param))
    and w.is_active
    and ws.booking_enabled;
$$;

create or replace function public.get_public_service_catalog_v2(
  p_business_user_id uuid,
  p_booking_context_id uuid default null
)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  category_id text,
  default_price numeric,
  estimated_duration integer,
  is_upsell boolean,
  service_vertical text,
  service_intent text,
  pricing_mode text,
  booking_requirements text[],
  requires_tire_quantity boolean,
  requires_fitment_lookup boolean,
  requires_inventory_selection boolean,
  allows_manual_fitment boolean,
  configuration_schema_version integer
)
language sql
stable
security definer
set search_path = public
as $$
  select
    sc.id,
    sc.name,
    sc.description,
    sc.category,
    coalesce(nullif(sc.metadata ->> 'category_id', ''), lower(regexp_replace(coalesce(sc.category, 'service'), '[^a-zA-Z0-9]+', '_', 'g'))),
    sc.labor_price,
    coalesce(sc.estimated_minutes, 30),
    coalesce((sc.metadata ->> 'is_upsell')::boolean, false),
    coalesce(nullif(sc.metadata ->> 'service_vertical', ''), 'automotive'),
    coalesce(nullif(sc.metadata ->> 'service_intent', ''), lower(regexp_replace(sc.name, '[^a-zA-Z0-9]+', '_', 'g'))),
    coalesce(nullif(sc.metadata ->> 'pricing_mode', ''), 'fixed'),
    case when jsonb_typeof(sc.metadata -> 'booking_requirements') = 'array'
      then array(select jsonb_array_elements_text(sc.metadata -> 'booking_requirements'))
      else array[]::text[] end,
    coalesce((sc.metadata ->> 'requires_tire_quantity')::boolean, false),
    coalesce((sc.metadata ->> 'requires_fitment_lookup')::boolean, false),
    coalesce((sc.metadata ->> 'requires_inventory_selection')::boolean, false),
    coalesce((sc.metadata ->> 'allows_manual_fitment')::boolean, true),
    coalesce((sc.metadata ->> 'configuration_schema_version')::integer, 1)
  from public.service_catalog sc
  join public.workspaces w on w.id = sc.workspace_id
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id
    and w.is_active
    and ws.booking_enabled
    and sc.is_active
  order by coalesce((sc.metadata ->> 'sort_order')::integer, 9999), sc.name;
$$;

create or replace function public.get_public_service_catalog(business_user_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  category text,
  default_price numeric,
  estimated_duration integer,
  is_upsell boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select id, name, description, category, default_price, estimated_duration, is_upsell
  from public.get_public_service_catalog_v2(business_user_id, null);
$$;

create or replace function public.get_public_booking_settings(p_business_user_id uuid)
returns table (
  waste_oil_fee_enabled boolean,
  waste_oil_fee numeric,
  shop_fee_enabled boolean,
  shop_fee_type text,
  shop_fee_value numeric,
  shop_fee_description text,
  surcharge_enabled boolean,
  surcharge_type text,
  surcharge_value numeric,
  surcharge_description text,
  payment_provider text,
  square_charges_enabled boolean,
  square_merchant_id text,
  oil_price_per_quart numeric,
  weather_guard_enabled boolean,
  weather_guard_settings jsonb,
  day_hours jsonb,
  service_verticals text[]
)
language sql
stable
security definer
set search_path = public
as $$
  select
    ws.waste_oil_fee_enabled,
    ws.waste_oil_fee,
    ws.shop_fee_enabled,
    ws.shop_fee_type,
    ws.shop_fee_value,
    ws.shop_fee_description,
    ws.surcharge_enabled,
    ws.surcharge_type,
    ws.surcharge_value,
    ws.surcharge_description,
    ws.payment_provider,
    false,
    null::text,
    ws.oil_price_per_quart,
    coalesce((ws.operational_settings ->> 'weather_guard_enabled')::boolean, false),
    ws.operational_settings -> 'weather_guard_settings',
    ws.day_hours,
    case when jsonb_typeof(ws.operational_settings -> 'service_verticals') = 'array'
      then array(select jsonb_array_elements_text(ws.operational_settings -> 'service_verticals'))
      else array[]::text[] end
  from public.workspaces w
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = p_business_user_id and w.is_active and ws.booking_enabled;
$$;

create or replace function public.get_booked_slots(business_user_id uuid, booking_date date)
returns table (scheduled_time time, duration_minutes integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    (a.starts_at at time zone w.timezone)::time,
    greatest(1, ceil(extract(epoch from (a.ends_at - a.starts_at)) / 60.0)::integer)
  from public.appointments a
  join public.workspaces w on w.id = a.workspace_id
  join public.workspace_settings ws on ws.workspace_id = w.id
  where w.created_by = business_user_id
    and ws.booking_enabled
    and (a.starts_at at time zone w.timezone)::date = booking_date
    and a.status::text not in ('cancelled', 'no_show')
  order by a.starts_at;
$$;

create or replace function public.get_public_blocked_dates(
  p_business_user_id uuid,
  p_customer_account_id uuid default null
)
returns table (blocked_date date, reason text)
language sql
stable
security definer
set search_path = public
as $$
  select null::date, null::text where false;
$$;

create or replace function public.get_public_service_packages(business_user_id uuid)
returns table (
  id uuid,
  name text,
  description text,
  package_price numeric,
  discount_type text,
  discount_value numeric,
  estimated_duration integer,
  services jsonb
)
language sql
stable
security definer
set search_path = public
as $$
  select null::uuid, null::text, null::text, null::numeric, null::text,
    null::numeric, null::integer, null::jsonb where false;
$$;

revoke all on function public.get_public_booking_profile_v2(text) from public;
revoke all on function public.get_public_service_catalog_v2(uuid, uuid) from public;
revoke all on function public.get_public_service_catalog(uuid) from public;
revoke all on function public.get_public_booking_settings(uuid) from public;
revoke all on function public.get_booked_slots(uuid, date) from public;
revoke all on function public.get_public_blocked_dates(uuid, uuid) from public;
revoke all on function public.get_public_service_packages(uuid) from public;

grant execute on function public.get_public_booking_profile_v2(text) to anon, authenticated, service_role;
grant execute on function public.get_public_service_catalog_v2(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_service_catalog(uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_booking_settings(uuid) to anon, authenticated, service_role;
grant execute on function public.get_booked_slots(uuid, date) to anon, authenticated, service_role;
grant execute on function public.get_public_blocked_dates(uuid, uuid) to anon, authenticated, service_role;
grant execute on function public.get_public_service_packages(uuid) to anon, authenticated, service_role;

comment on function public.get_public_booking_profile_v2(text) is
  'Anonymous-safe booking profile lookup. Deliberately excludes provider account identifiers and internal workspace data.';
