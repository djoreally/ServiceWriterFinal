-- Keep suppression eligibility evaluation inside trusted server-side send workflows.
begin;
revoke execute on function public.messaging_has_active_suppression(uuid, text, text, citext, text) from public, anon, authenticated;
grant execute on function public.messaging_has_active_suppression(uuid, text, text, citext, text) to service_role;
commit;
