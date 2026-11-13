-- Provider-sync storage: create payment_provider_records + payment_provider_sync_logs.
--
-- WHY: the native provider sync (src/server/payments/provider-sync.ts, live
-- since the edge-function replacement) records every attempt in these two
-- tables, and the appointment Provider Sync card + Settings panel read and
-- subscribe to them — but the tables were never created in any migration and
-- do not exist in production. Every sync dies at the first SELECT
-- (PostgREST PGRST205 -> 500 "An unexpected error occurred."), and the panel
-- renders its "No sync attempted yet" empty state because its reads throw
-- too. Diagnosis: provider-sync-second-failure-diagnosis-2026-11-05.md
-- (Gate 2; Gate 1 — workspace_settings.payment_provider — verified 'stripe'
-- by live read 2026-11-05, so no config write is part of this change).
--
-- CONTRACT: columns/nullability/defaults are taken from the generated types
-- (src/integrations/supabase/types.ts, payment_provider_records /
-- payment_provider_sync_logs) cross-checked against every code read/write —
-- src/server/payments/provider-sync.ts (insert/update/select payloads),
-- src/server/hono/routes/platform.ts + appointments.ts (admin-client reads),
-- src/application/queries/appointment-sync.query.ts (realtime subscription,
-- filter appointment_id=eq.<id>). No disagreements found. Deliberate
-- contract-faithful choices:
--   * logs.appointment_id has NO FK — the types contract lists only the
--     provider_record_id relationship for the logs table.
--   * user_id DOES reference auth.users — the type generator omits auth FKs
--     (proven by tech_push_subscriptions, whose migration declares the FK
--     and whose types show none); posture mirrors in_app_notifications.
--   * NO unique constraint on idempotency_key and no upserts: the code never
--     writes that column; de-duplication is findSyncRecord's
--     select-then-insert/update per (appointment, provider, sync_mode).
--   * NO CHECK constraints on provider/sync_mode/sync_status/status: the
--     vocabularies live in code (the client union even carries 'throttled',
--     which the server never writes) and the types encode none.
--   * No updated_at trigger: the code sets updated_at explicitly on every
--     update; the DEFAULT covers inserts, which omit it.
--
-- Additive only: two new tables, zero existing data touched. Idempotent —
-- safe to re-run in the SQL Editor.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- payment_provider_records — one evolving sync state per
-- (appointment, provider, sync mode); written/read only via the platform
-- API's service-role client (src/server/payments/provider-sync.ts).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_provider_records (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.appointments(id) on delete cascade,
  payment_record_id uuid references public.payments(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  provider text not null,
  sync_mode text not null,
  sync_status text not null default 'pending',
  attempt_count integer not null default 0,
  last_attempt_at timestamptz,
  last_error text,
  next_retry_at timestamptz,
  synced_at timestamptz,
  external_customer_id text,
  external_invoice_id text,
  external_order_id text,
  external_payment_id text,
  external_transaction_id text,
  idempotency_key text,
  dead_letter boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serves every read path: list/find by appointment (newest first), the
-- (appointment, provider, sync_mode) lookup, and the realtime filter
-- `appointment_id=eq.<id>` in appointment-sync.query.ts.
create index if not exists payment_provider_records_appointment_created_idx
  on public.payment_provider_records(appointment_id, created_at desc);

-- ---------------------------------------------------------------------------
-- payment_provider_sync_logs — append-only attempt history per record.
-- appointment_id intentionally carries NO foreign key: the generated-type
-- contract lists only the provider_record_id relationship for this table
-- (the parent record's cascade governs log lifetime).
-- ---------------------------------------------------------------------------
create table if not exists public.payment_provider_sync_logs (
  id uuid primary key default gen_random_uuid(),
  provider_record_id uuid not null references public.payment_provider_records(id) on delete cascade,
  appointment_id uuid not null,
  attempt_number integer not null,
  status text not null,
  error_message text,
  duration_ms integer,
  sync_mode text not null,
  provider text not null,
  context jsonb not null default '{}'::jsonb,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Serves listSyncRecordLogs: by record, oldest first.
create index if not exists payment_provider_sync_logs_record_created_idx
  on public.payment_provider_sync_logs(provider_record_id, created_at);

-- ---------------------------------------------------------------------------
-- RLS. All writes run through the platform API's service-role client, which
-- bypasses RLS (the src/server/payments/provider-sync.ts header calls these
-- "the user-keyed provider-sync record tables" for exactly this split).
-- Authenticated access is therefore SELECT-only, scoped to workspace staff
-- of the appointment's workspace — the EXISTS-through-the-parent idiom of
-- in_app_notification_push_outbox, with is_workspace_staff from the
-- payments idiom. This SELECT policy is what lets the browser realtime
-- subscription (appointment-sync.query.ts, postgres_changes on
-- payment_provider_records) deliver events to ANY staff member viewing the
-- appointment, not only the user who triggered the sync (rows are keyed by
-- the actor's user_id, so a user_id = auth.uid() policy would blind every
-- other staff member's card). No INSERT/UPDATE/DELETE policies are created
-- for authenticated/anon: no client code writes these tables directly.
-- ---------------------------------------------------------------------------
alter table public.payment_provider_records enable row level security;
alter table public.payment_provider_sync_logs enable row level security;

drop policy if exists payment_provider_records_select_workspace_staff on public.payment_provider_records;
create policy payment_provider_records_select_workspace_staff
on public.payment_provider_records for select to authenticated
using (
  exists (
    select 1 from public.appointments a
    where a.id = appointment_id
      and public.is_workspace_staff(a.workspace_id)
  )
);

drop policy if exists payment_provider_sync_logs_select_workspace_staff on public.payment_provider_sync_logs;
create policy payment_provider_sync_logs_select_workspace_staff
on public.payment_provider_sync_logs for select to authenticated
using (
  exists (
    select 1
    from public.payment_provider_records r
    join public.appointments a on a.id = r.appointment_id
    where r.id = provider_record_id
      and public.is_workspace_staff(a.workspace_id)
  )
);

-- Realtime: the appointment card subscribes to postgres_changes on
-- payment_provider_records (guarded publication add, in_app_notifications
-- idiom). Logs are read through the API only, so they are not published.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'payment_provider_records'
  ) then
    alter publication supabase_realtime add table public.payment_provider_records;
  end if;
end
$$;

commit;
