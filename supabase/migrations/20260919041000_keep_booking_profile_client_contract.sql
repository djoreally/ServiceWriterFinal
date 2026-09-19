drop function if exists public.get_public_booking_profile_v3(text);
create function public.get_public_booking_profile_v3(booking_slug_param text)
returns table(user_id uuid,business_name text,logo_url text,phone text,email text,opening_time time,closing_time time,working_days text[],currency text,
stripe_charges_enabled boolean,service_radius_miles numeric,service_address text,service_coordinates jsonb,buffer_time_before integer,buffer_time_after integer,
min_lead_time_hours integer,max_advance_days integer,slot_duration_minutes integer,google_review_url text,yelp_review_url text,oil_price_per_quart numeric,
allow_cancellation boolean,allow_rescheduling boolean,cancellation_window_hours integer,reschedule_window_hours integer,require_approval boolean,
require_terms_acceptance boolean,terms_and_conditions text)
language sql stable security definer set search_path='' as $$
 select w.created_by,w.name,ws.logo_url,ws.phone,ws.email::text,ws.opening_time,ws.closing_time,ws.working_days,trim(w.currency_code),
 coalesce((ws.operational_settings->>'stripe_charges_enabled')::boolean,false) and nullif(ws.operational_settings->>'stripe_account_id','') is not null,
 ws.service_radius_miles,coalesce(nullif(ws.operational_settings->>'service_address',''),concat_ws(', ',ws.address_line1,ws.city,ws.region,ws.postal_code)),
 ws.operational_settings->'service_coordinates',ws.buffer_time_before,ws.buffer_time_after,ws.min_lead_time_hours,ws.max_advance_days,ws.slot_duration_minutes,
 ws.operational_settings->>'google_review_url',ws.operational_settings->>'yelp_review_url',ws.oil_price_per_quart,ws.allow_cancellation,ws.allow_rescheduling,
 ws.cancellation_window_hours,ws.reschedule_window_hours,ws.require_approval,ws.require_terms_acceptance,ws.terms_and_conditions
 from public.workspaces w join public.workspace_settings ws on ws.workspace_id=w.id
 where lower(ws.booking_slug::text)=lower(trim(booking_slug_param)) and w.is_active and ws.booking_enabled
$$;
revoke all on function public.get_public_booking_profile_v3(text) from public,anon,authenticated;
grant execute on function public.get_public_booking_profile_v3(text) to anon,authenticated,service_role;