-- Shot 11: make invitation audit events server-authoritative.
-- Prepared detached from main; apply only with the final certified release.

begin;

revoke insert, update, delete on table public.invitation_events from authenticated;
grant select on table public.invitation_events to authenticated;
grant select, insert, update, delete on table public.invitation_events to service_role;

drop policy if exists invitation_events_admin_insert on public.invitation_events;

comment on table public.invitation_events is
  'Append-only invitation lifecycle audit evidence. Browser clients may read authorized rows; writes are server/service-role only.';

commit;
