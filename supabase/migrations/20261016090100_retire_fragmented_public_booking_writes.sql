-- Retire the fragmented public-booking write surface.
--
-- public_booking_commit_v1 is now the only anonymous/authenticated mutation
-- boundary for creating a public booking. These lower-level SECURITY DEFINER
-- functions remain callable by the commit function itself, but browser roles
-- may no longer orchestrate partial bookings directly.

revoke execute on function public.public_booking_upsert_customer(text,text,text,text,text)
  from anon, authenticated;

revoke execute on function public.public_booking_upsert_vehicle(text,text,integer,text,text,text,text,integer,text,text,text,text,text)
  from anon, authenticated;

revoke execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text)
  from anon, authenticated;

revoke execute on function public.public_booking_book_appointment_v2(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text)
  from anon, authenticated;

revoke execute on function public.public_booking_book_appointment_v3(text,date,time,integer,text,text,text,text,text,text,numeric,numeric,uuid,uuid,text,numeric,numeric,text)
  from anon, authenticated;

revoke execute on function public.public_booking_save_configuration_v2(text,uuid,text,text,jsonb)
  from anon, authenticated;

revoke execute on function public.public_booking_insert_services_v7(text,uuid,text,text,jsonb)
  from anon, authenticated;

revoke execute on function public.public_booking_record_payment_intent_v3(text,uuid,bigint,bigint,bigint,numeric,text,text,text,text)
  from anon, authenticated;
