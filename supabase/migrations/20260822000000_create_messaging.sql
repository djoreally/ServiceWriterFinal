-- ServiceWriterFinal messaging subsystem
-- Requires the replacement template tables: workspaces, profiles, workspace_members,
-- provider_connections, webhook_events, and audit_events.
-- Apply only after the core replacement-template migration.

begin;

create extension if not exists pgcrypto;

create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('transactional', 'service_reminder', 'appointment_update', 'payment_request', 'marketing', 'authentication')),
  template_key text not null,
  version integer not null default 1 check (version > 0),
  subject text,
  body text not null,
  variables_schema jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, template_key, version),
  unique (workspace_id, id)
);

create table if not exists public.messaging_consents (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid,
  contact_email citext,
  contact_phone text,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('transactional', 'service_reminder', 'appointment_update', 'payment_request', 'marketing', 'authentication')),
  status text not null check (status in ('granted', 'revoked', 'unknown')) default 'unknown',
  source text not null check (source in ('customer', 'staff', 'import', 'checkout', 'portal', 'api', 'unknown')) default 'unknown',
  legal_basis text,
  consented_at timestamptz,
  revoked_at timestamptz,
  evidence jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  check (contact_email is not null or contact_phone is not null),
  check (not (status = 'granted' and consented_at is null)),
  check (not (status = 'revoked' and revoked_at is null)),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete cascade
);

create index if not exists messaging_consents_lookup_idx
  on public.messaging_consents(workspace_id, channel, purpose, status, contact_email, contact_phone);

create table if not exists public.messaging_suppressions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  customer_id uuid,
  channel text check (channel in ('email', 'sms')),
  purpose text check (purpose in ('transactional', 'service_reminder', 'appointment_update', 'payment_request', 'marketing', 'authentication')),
  email citext,
  phone text,
  reason text not null check (reason in ('unsubscribe', 'hard_bounce', 'complaint', 'invalid_destination', 'manual', 'legal', 'provider')),
  source text not null default 'system',
  active boolean not null default true,
  suppressed_at timestamptz not null default timezone('utc', now()),
  lifted_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  check (email is not null or phone is not null),
  check (not (active = true and lifted_at is not null)),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete cascade
);

create index if not exists messaging_suppressions_active_email_idx
  on public.messaging_suppressions(workspace_id, email, channel, purpose) where active and email is not null;
create index if not exists messaging_suppressions_active_phone_idx
  on public.messaging_suppressions(workspace_id, phone, channel, purpose) where active and phone is not null;

create table if not exists public.message_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  customer_id uuid,
  channel text not null check (channel in ('email', 'sms')),
  purpose text not null check (purpose in ('transactional', 'service_reminder', 'appointment_update', 'payment_request', 'marketing', 'authentication')),
  provider text not null,
  provider_connection_id uuid references public.provider_connections(id) on delete set null,
  provider_message_id text,
  idempotency_key text not null,
  recipient_email citext,
  recipient_phone text,
  template_key text not null,
  template_version integer,
  subject text,
  body_redacted text,
  status text not null check (status in ('queued', 'accepted', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'undeliverable', 'canceled')) default 'queued',
  failure_code text,
  failure_reason text,
  consent_checked_at timestamptz,
  suppression_checked_at timestamptz,
  queued_at timestamptz not null default timezone('utc', now()),
  sent_at timestamptz,
  delivered_at timestamptz,
  failed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (workspace_id, id),
  unique (workspace_id, idempotency_key),
  check (recipient_email is not null or recipient_phone is not null),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete set null
);

create index if not exists message_logs_workspace_status_idx on public.message_logs(workspace_id, status, created_at desc);
create index if not exists message_logs_provider_message_idx on public.message_logs(provider, provider_message_id) where provider_message_id is not null;
create index if not exists message_logs_customer_idx on public.message_logs(workspace_id, customer_id, created_at desc);

create table if not exists public.message_delivery_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  message_log_id uuid,
  provider text not null,
  provider_event_id text not null,
  provider_message_id text,
  status text not null check (status in ('queued', 'accepted', 'sent', 'delivered', 'failed', 'bounced', 'complained', 'undeliverable', 'canceled')),
  recipient_email citext,
  recipient_phone text,
  failure_code text,
  failure_reason text,
  raw_payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null,
  received_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_event_id),
  foreign key (workspace_id, message_log_id) references public.message_logs(workspace_id, id) on delete set null
);

create index if not exists message_delivery_events_message_idx on public.message_delivery_events(message_log_id, occurred_at desc);

create table if not exists public.inbound_messages (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  customer_id uuid,
  channel text not null check (channel in ('email', 'sms')),
  provider text not null,
  provider_event_id text not null,
  provider_message_id text,
  from_address text not null,
  to_address text not null,
  body text not null,
  status text not null check (status in ('received', 'processed', 'ignored', 'failed')) default 'received',
  raw_payload jsonb not null default '{}'::jsonb,
  received_at timestamptz not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (provider, provider_event_id),
  foreign key (workspace_id, customer_id) references public.customers(workspace_id, id) on delete set null
);

create index if not exists inbound_messages_workspace_time_idx on public.inbound_messages(workspace_id, received_at desc);

create or replace function public.messaging_apply_delivery_event(
  target_provider text,
  target_provider_message_id text,
  target_status text,
  target_occurred_at timestamptz,
  target_failure_code text default null,
  target_failure_reason text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  updated_id uuid;
begin
  update public.message_logs
  set status = target_status,
      failure_code = coalesce(target_failure_code, failure_code),
      failure_reason = coalesce(target_failure_reason, failure_reason),
      delivered_at = case when target_status = 'delivered' then coalesce(delivered_at, target_occurred_at) else delivered_at end,
      sent_at = case when target_status in ('sent', 'delivered') then coalesce(sent_at, target_occurred_at) else sent_at end,
      failed_at = case when target_status in ('failed', 'bounced', 'complained', 'undeliverable') then coalesce(failed_at, target_occurred_at) else failed_at end,
      updated_at = timezone('utc', now())
  where provider = target_provider and provider_message_id = target_provider_message_id
    and status not in ('delivered', 'canceled')
  returning id into updated_id;
  return updated_id;
end;
$$;

create or replace function public.messaging_has_active_suppression(
  target_workspace_id uuid,
  target_channel text,
  target_purpose text,
  target_email citext default null,
  target_phone text default null
) returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.messaging_suppressions s
    where s.active
      and (s.workspace_id is null or s.workspace_id = target_workspace_id)
      and (s.channel is null or s.channel = target_channel)
      and (s.purpose is null or s.purpose = target_purpose)
      and ((target_email is not null and s.email = target_email) or (target_phone is not null and s.phone = target_phone))
  );
$$;

-- Timestamp maintenance.
drop trigger if exists message_templates_set_updated_at on public.message_templates;
create trigger message_templates_set_updated_at before update on public.message_templates for each row execute function public.set_updated_at();
drop trigger if exists messaging_consents_set_updated_at on public.messaging_consents;
create trigger messaging_consents_set_updated_at before update on public.messaging_consents for each row execute function public.set_updated_at();
drop trigger if exists messaging_suppressions_set_updated_at on public.messaging_suppressions;
create trigger messaging_suppressions_set_updated_at before update on public.messaging_suppressions for each row execute function public.set_updated_at();
drop trigger if exists message_logs_set_updated_at on public.message_logs;
create trigger message_logs_set_updated_at before update on public.message_logs for each row execute function public.set_updated_at();
drop trigger if exists inbound_messages_set_updated_at on public.inbound_messages;
create trigger inbound_messages_set_updated_at before update on public.inbound_messages for each row execute function public.set_updated_at();

alter table public.message_templates enable row level security;
alter table public.messaging_consents enable row level security;
alter table public.messaging_suppressions enable row level security;
alter table public.message_logs enable row level security;
alter table public.message_delivery_events enable row level security;
alter table public.inbound_messages enable row level security;

create policy message_templates_staff_select on public.message_templates for select using (public.is_workspace_member(workspace_id));
create policy message_templates_admin_write on public.message_templates for all using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy messaging_consents_staff_select on public.messaging_consents for select using (public.is_workspace_staff(workspace_id));
create policy messaging_consents_staff_write on public.messaging_consents for insert with check (public.is_workspace_staff(workspace_id));
create policy messaging_consents_staff_update on public.messaging_consents for update using (public.is_workspace_staff(workspace_id)) with check (public.is_workspace_staff(workspace_id));
create policy messaging_consents_admin_delete on public.messaging_consents for delete using (public.is_workspace_admin(workspace_id));

create policy messaging_suppressions_staff_select on public.messaging_suppressions for select using (workspace_id is not null and public.is_workspace_staff(workspace_id));
create policy messaging_suppressions_staff_write on public.messaging_suppressions for insert with check (workspace_id is not null and public.is_workspace_staff(workspace_id));
create policy messaging_suppressions_staff_update on public.messaging_suppressions for update using (workspace_id is not null and public.is_workspace_staff(workspace_id)) with check (workspace_id is not null and public.is_workspace_staff(workspace_id));
create policy messaging_suppressions_admin_delete on public.messaging_suppressions for delete using (workspace_id is not null and public.is_workspace_admin(workspace_id));

create policy message_logs_staff_select on public.message_logs for select using (public.is_workspace_staff(workspace_id));
create policy message_logs_staff_insert on public.message_logs for insert with check (public.is_workspace_staff(workspace_id));
create policy message_logs_admin_update on public.message_logs for update using (public.is_workspace_admin(workspace_id)) with check (public.is_workspace_admin(workspace_id));

create policy delivery_events_staff_select on public.message_delivery_events for select using (workspace_id is not null and public.is_workspace_staff(workspace_id));
create policy inbound_messages_staff_select on public.inbound_messages for select using (workspace_id is not null and public.is_workspace_staff(workspace_id));
create policy inbound_messages_staff_update on public.inbound_messages for update using (workspace_id is not null and public.is_workspace_staff(workspace_id)) with check (workspace_id is not null and public.is_workspace_staff(workspace_id));

revoke all on public.message_templates, public.messaging_consents, public.messaging_suppressions, public.message_logs, public.message_delivery_events, public.inbound_messages from anon;
grant select, insert, update, delete on public.message_templates, public.messaging_consents, public.messaging_suppressions, public.message_logs, public.message_delivery_events, public.inbound_messages to authenticated;

grant execute on function public.messaging_apply_delivery_event(text, text, text, timestamptz, text, text) to service_role;
grant execute on function public.messaging_has_active_suppression(uuid, text, text, citext, text) to authenticated, service_role;

commit;
