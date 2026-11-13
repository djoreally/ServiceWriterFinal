-- Management tokens for website bookings (2026-11-04).
--
-- Why this exists: the customer-portal reschedule/cancel-by-token flow
-- (get/reschedule/cancel_appointment_by_token) keys off
-- appointments.metadata ->> 'management_token', minted at insert by
-- ensure_appointment_management_token_v1() (20260907155000, crypto
-- access qualified in 20260909205000). The mint condition only covers
-- source = 'public_booking'. Appointments pushed from the MOMS website
-- are inserted with source = 'moms_website', so website customers never
-- received a token and could not use the portal links at all. The
-- booking-notifications build (the website's token appointment page
-- proxying reschedule-by-token) needs those tokens, and the push-stamp
-- callback now carries the token back to the website backend
-- (bookings.sw_management_token) at push time.
--
-- The ONLY behavioral change: the mint condition also covers
-- source = 'moms_website'. Everything else is byte-for-byte the current
-- function (20260909205000): same trigger (appointments_ensure_
-- management_token, BEFORE INSERT, not recreated here), same token
-- generation (extensions.gen_random_bytes(24) hex-encoded = 48 chars),
-- same "only when no token is already present" guard, same empty
-- search_path. The EXECUTE revoke from 20260909205000 is re-applied
-- because CREATE OR REPLACE FUNCTION resets the function's privileges.
-- Every other source remains unminted, exactly as before.
--
-- Backfill scope mirrors the 20260907155000 backfill (statuses
-- 'requested'/'confirmed' — the live, not-yet-started states, so
-- completed / cancelled / no_show / in_progress rows are excluded),
-- restricted to moms_website appointments that start in the future and
-- have no token yet. Metadata is merged with the same || shape the
-- trigger writes.


create or replace function public.ensure_appointment_management_token_v1()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if new.source in ('public_booking', 'moms_website')
     and nullif(new.metadata ->> 'management_token','') is null then
    new.metadata := coalesce(new.metadata,'{}'::jsonb)
      || pg_catalog.jsonb_build_object(
        'management_token',
        pg_catalog.encode(extensions.gen_random_bytes(24),'hex')
      );
  end if;
  return new;
end;
$function$;

revoke execute on function public.ensure_appointment_management_token_v1()
  from public, anon, authenticated;

update public.appointments
   set metadata = coalesce(metadata,'{}'::jsonb)
     || pg_catalog.jsonb_build_object(
          'management_token',
          pg_catalog.encode(extensions.gen_random_bytes(24),'hex')
        )
 where source = 'moms_website'
   and status in ('requested','confirmed')
   and starts_at > now()
   and nullif(metadata ->> 'management_token','') is null;

