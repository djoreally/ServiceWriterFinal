-- Phase 2 controlled retirement, stage 1.
--
-- DO NOT apply/merge until the production canonical Hono endpoint has been
-- proven with at least one valid POST and the resulting appointment/location
-- has been verified.
--
-- This migration intentionally DOES NOT drop either v2 overload and DOES NOT
-- drop public_booking_location_intents. It only removes browser-role execution
-- so the compatibility implementation remains available to service_role for
-- rollback/forensics during the retirement window.

-- Legacy staged-location overload.
revoke execute on function public.public_booking_book_appointment_v2(
  text,
  date,
  time,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  uuid,
  uuid,
  text
) from anon, authenticated;

-- Explicit-location compatibility overload.
revoke execute on function public.public_booking_book_appointment_v2(
  text,
  date,
  time,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  text
) from anon, authenticated;

-- Preserve an explicit privileged rollback/forensics path.
grant execute on function public.public_booking_book_appointment_v2(
  text,
  date,
  time,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  uuid,
  uuid,
  text
) to service_role;

grant execute on function public.public_booking_book_appointment_v2(
  text,
  date,
  time,
  integer,
  text,
  text,
  text,
  text,
  text,
  text,
  numeric,
  numeric,
  uuid,
  uuid,
  text,
  numeric,
  numeric,
  text
) to service_role;
