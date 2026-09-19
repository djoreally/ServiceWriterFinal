-- Restrict legacy public booking discovery RPCs to authenticated callers.
-- Slug-based v2 endpoints remain the canonical anonymous booking discovery surface.

revoke execute on function public.get_booked_slots(uuid,date) from public,anon;
revoke execute on function public.get_public_blocked_dates(uuid,uuid) from public,anon;
revoke execute on function public.get_public_booking_settings(uuid) from public,anon;
revoke execute on function public.get_public_detailing_pricing_rules(uuid) from public,anon;
revoke execute on function public.get_public_service_catalog(uuid) from public,anon;
revoke execute on function public.get_public_service_catalog_v2(uuid,uuid) from public,anon;
revoke execute on function public.get_public_service_packages(uuid) from public,anon;

grant execute on function public.get_booked_slots(uuid,date),
 public.get_public_blocked_dates(uuid,uuid),
 public.get_public_booking_settings(uuid),
 public.get_public_detailing_pricing_rules(uuid),
 public.get_public_service_catalog(uuid),
 public.get_public_service_catalog_v2(uuid,uuid),
 public.get_public_service_packages(uuid)
to authenticated,service_role;
