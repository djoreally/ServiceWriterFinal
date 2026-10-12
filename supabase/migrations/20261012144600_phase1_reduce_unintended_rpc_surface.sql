-- Phase 1: reduce accidental browser-callable SECURITY DEFINER surface.
-- Public-booking RPCs remain intentionally callable because they validate
-- booking slug/customer identity inside the function. The helpers below are
-- internal or authenticated-only and must not be anonymously executable.

revoke execute on function public.get_tech_fleet_assignments_v1(uuid)
  from anon, public;

revoke execute on function public.quote_items_sync_totals_trigger_v1()
  from anon, authenticated, public;

revoke execute on function public.sync_quote_totals_v1(uuid)
  from anon, public;
