-- Shot 5: make operational evidence append-only/server-managed.
-- Prepared detached from main; apply only with the final certified release.

begin;

-- Provider callback and delivery evidence is written only by trusted server
-- adapters using the service-role/admin client. Browser roles do not need
-- direct mutation privileges.
revoke all on table public.webhook_events from public, anon, authenticated;
revoke all on table public.message_delivery_events from public, anon, authenticated;
revoke all on table public.inbound_messages from public, anon, authenticated;
revoke all on table public.audit_events from public, anon, authenticated;

grant select, insert, update, delete on table public.webhook_events to service_role;
grant select, insert, update, delete on table public.message_delivery_events to service_role;
grant select, insert, update, delete on table public.inbound_messages to service_role;
grant select, insert, update, delete on table public.audit_events to service_role;

-- CRM audit history may remain workspace-readable, but clients must not be
-- able to manufacture or rewrite audit records.
revoke insert, update, delete on table public.crm_audit_events from authenticated;
grant select on table public.crm_audit_events to authenticated;
grant select, insert, update, delete on table public.crm_audit_events to service_role;

drop policy if exists crm_audit_events_insert on public.crm_audit_events;

comment on table public.webhook_events is
  'Server-managed provider webhook evidence. Browser roles have no direct table access.';
comment on table public.message_delivery_events is
  'Server-managed provider delivery evidence. Browser roles have no direct table access.';
comment on table public.inbound_messages is
  'Server-ingested inbound message evidence. Browser roles have no direct table access.';
comment on table public.audit_events is
  'Server-managed operational audit evidence. Browser roles have no direct table access.';
comment on table public.crm_audit_events is
  'Workspace-readable CRM audit evidence; writes are server/service-role only.';

commit;
