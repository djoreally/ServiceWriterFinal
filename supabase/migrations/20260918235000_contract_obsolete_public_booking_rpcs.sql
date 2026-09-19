-- Contract obsolete public booking/rewards RPCs after recovery client cutover.
-- Hardened endpoints remain executable: insert_services_v6, payment_intent_v3,
-- save_configuration_v2, update_context_v2, tire_spec_v3, rewards *_v2.
do $$
begin
  revoke all on function public.public_booking_insert_services(text,uuid,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_insert_services_v2(text,uuid,text,text,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_insert_services_v3(text,uuid,text,text,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_insert_services_v4(text,uuid,text,text,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_insert_services_v5(text,uuid,text,text,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_record_payment_intent_v2(text,uuid,bigint,bigint,bigint,numeric,text,text,text) from public,anon,authenticated;
  revoke all on function public.public_booking_save_configuration(text,uuid,jsonb) from public,anon,authenticated;
  revoke all on function public.public_booking_update_appointment_context(text,uuid,text,text,numeric,numeric) from public,anon,authenticated;
  revoke all on function public.public_booking_set_vehicle_tire_spec_v2(text,text,uuid,text,text,text,text,text,text) from public,anon,authenticated;
  revoke all on function public.lookup_booking_rewards(uuid,text,uuid) from public,anon,authenticated;
  revoke all on function public.reserve_booking_reward(uuid,uuid,uuid,text,text,integer) from public,anon,authenticated;
end $$;
