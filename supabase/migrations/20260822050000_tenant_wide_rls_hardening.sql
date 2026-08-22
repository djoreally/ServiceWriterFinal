-- Phase 11: tenant-wide RLS hardening
-- Replace legacy public-role policies with authenticated, workspace-scoped policies.
-- Service-role webhook/provider writes remain available through Supabase's service_role bypass.

-- Internal dispatch and service records must never be publicly readable or writable.
drop policy if exists dispatch_events_staff_all on public.dispatch_events;
create policy dispatch_events_staff_all on public.dispatch_events
for all to authenticated
using (public.is_workspace_staff(workspace_id))
with check (public.is_workspace_staff(workspace_id));

 drop policy if exists service_records_staff_all on public.service_records;
create policy service_records_staff_all on public.service_records
for all to authenticated
using (public.is_workspace_staff(workspace_id))
with check (public.is_workspace_staff(workspace_id));

-- Provider callback data is service-role written; staff may inspect only their workspace.
drop policy if exists webhook_events_staff_select on public.webhook_events;
create policy webhook_events_staff_select on public.webhook_events
for select to authenticated
using (workspace_id is not null and public.is_workspace_staff(workspace_id));

-- Inbound messages and delivery receipts are internal operational data.
drop policy if exists inbound_messages_staff_select on public.inbound_messages;
create policy inbound_messages_staff_select on public.inbound_messages
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists inbound_messages_staff_update on public.inbound_messages;
create policy inbound_messages_staff_update on public.inbound_messages
for update to authenticated
using (public.is_workspace_staff(workspace_id))
with check (public.is_workspace_staff(workspace_id));

drop policy if exists delivery_events_staff_select on public.message_delivery_events;
create policy delivery_events_staff_select on public.message_delivery_events
for select to authenticated
using (public.is_workspace_staff(workspace_id));

-- Message logs: staff may create/read within their workspace; only workspace admins may update.
drop policy if exists message_logs_staff_insert on public.message_logs;
create policy message_logs_staff_insert on public.message_logs
for insert to authenticated
with check (public.is_workspace_staff(workspace_id) and created_by = auth.uid());

drop policy if exists message_logs_staff_select on public.message_logs;
create policy message_logs_staff_select on public.message_logs
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists message_logs_admin_update on public.message_logs;
create policy message_logs_admin_update on public.message_logs
for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

-- Templates are workspace configuration; reads are staff-scoped and writes are admin-scoped.
drop policy if exists message_templates_staff_select on public.message_templates;
create policy message_templates_staff_select on public.message_templates
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists message_templates_admin_write on public.message_templates;
create policy message_templates_admin_write on public.message_templates
for all to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

-- Consent and suppression records contain customer contact/compliance data.
drop policy if exists messaging_consents_staff_select on public.messaging_consents;
create policy messaging_consents_staff_select on public.messaging_consents
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists messaging_consents_staff_write on public.messaging_consents;
create policy messaging_consents_staff_write on public.messaging_consents
for insert to authenticated
with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());

drop policy if exists messaging_consents_staff_update on public.messaging_consents;
create policy messaging_consents_staff_update on public.messaging_consents
for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists messaging_consents_admin_delete on public.messaging_consents;
create policy messaging_consents_admin_delete on public.messaging_consents
for delete to authenticated
using (public.is_workspace_admin(workspace_id));

drop policy if exists messaging_suppressions_staff_select on public.messaging_suppressions;
create policy messaging_suppressions_staff_select on public.messaging_suppressions
for select to authenticated
using (public.is_workspace_staff(workspace_id));

drop policy if exists messaging_suppressions_staff_write on public.messaging_suppressions;
create policy messaging_suppressions_staff_write on public.messaging_suppressions
for insert to authenticated
with check (public.is_workspace_admin(workspace_id) and created_by = auth.uid());

drop policy if exists messaging_suppressions_staff_update on public.messaging_suppressions;
create policy messaging_suppressions_staff_update on public.messaging_suppressions
for update to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

drop policy if exists messaging_suppressions_admin_delete on public.messaging_suppressions;
create policy messaging_suppressions_admin_delete on public.messaging_suppressions
for delete to authenticated
using (public.is_workspace_admin(workspace_id));

comment on table public.dispatch_events is 'Workspace-isolated operational dispatch events; authenticated staff only.';
comment on table public.service_records is 'Workspace-isolated service records; authenticated staff only.';
