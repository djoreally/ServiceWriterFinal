-- ============================================================================
-- Service Writer reconciliation pass - Steps 6+7: Documents (invoice
-- lifecycle) + CRM / loyalty / retention (addendum 2026-11-05 FINAL
-- section 6 steps 6-7). Built from the recon-pass design pair
-- (step67-crm.sql + step67-crm-spec.md) under TENANCY-RULING.md: full
-- workspace translation + paired code changes; schema and code land as
-- one sequence, platform-wide - never a MOMS-only patch. The per-table
-- section comments below are the design file's own, carried verbatim
-- except where a deviation says otherwise. (Step 6's second table,
-- document_intake, already exists in production from the Fleet S2
-- slice and is NOT part of this file.)
--
-- Census basis (2026-11-09): all 14 family tables verified ABSENT in
-- production. Expected post-apply census: the chair's count +14 public
-- tables, all 14 empty.
--
-- Shape rule: every CREATE is the code-exercised contract - the design
-- cross-checked against src/integrations/supabase/types.ts and every
-- live .from() payload/select in src/server/hono/routes/documents.ts,
-- crm.ts, platform.ts, vehicles.ts and src/lib, translated to workspace
-- tenancy. Translated tables carry workspace_id uuid NOT NULL + FK to
-- workspaces(id) ON DELETE CASCADE with the messaging idiom's RLS
-- (20260822000000_create_messaging.sql): staff policies keyed on
-- public.is_workspace_staff(workspace_id), split by operation to what
-- the code actually does on the RLS client; read-only-in-repo tables
-- get SELECT only. user_id is KEPT wherever the contract has it, as the
-- actor/creator key with its auth.users FK. No CHECK constraints on
-- code-vocabulary columns; the two vocabularies the generated types
-- declare as Postgres enums (retention_signals.status,
-- retention_vehicle_profiles.lifecycle_status) are created as guarded
-- enum types, per the design.
--
-- THREE NAMED EXCEPTIONS (no workspace_id invented; evidence in the
-- design spec section 4): ai_agents (global catalog, anon-client read);
-- audit_logs (actor-keyed platform trail; five writers, two of which
-- can never carry a workspace); visitor_presence + analytics_events
-- (the legacy tenant pair - keyed on tenant_id, the workspace OWNER's
-- auth user id; writers are anonymous public-funnel visitors).
--
-- FK reality: workspaces, customers, vehicles, invoices and
-- automation_rules pre-date this pass (automation_rules is a hard FK
-- target below BY DESIGN - the apply lane's before-census confirms it;
-- if it were absent this file fails loudly rather than creating a
-- table whose PostgREST embeds can never resolve). OWED FKs (plain
-- columns here, FKs added by the owning step if ever): review_requests
-- .service_id, retention_vehicle_profiles.last_service_id,
-- service_reminders.last_service_id, testimonials.service_id -> all
-- Step 8 (services); loyalty_accounts.program_id -> loyalty_programs
-- and retention_action_executions.campaign_enrollment_id ->
-- retention_campaign_enrollments (defer bucket iii, only if ever
-- created). review_requests.email_queue_id carries NO FK (the types
-- list no relationship - unlisted relationships are not invented).
--
-- DEVIATIONS FROM THE DESIGN FILE, named plainly:
--  1. UNION RE-BASE on the current tree (build-time): the design pair
--     was evidenced against sw-cleanbuild @ a51e265d5 (2026-11-09);
--     every site was re-verified against origin/main e257009b8 at
--     build time. Line numbers drifted (documents.ts lifecycle route
--     :896 vs design :892; platform.ts automation executions :1941 vs
--     :1875, ai/agents :4386 vs :4301); shapes held at every site.
--     The per-table comments below keep the design's line cites as the
--     evidence record.
--  2. NEED-1 (testimonials workspace attribution) is STILL OPEN and
--     GATES THE APPLY of this file. State at build time: Step 3 has
--     landed, so business_profiles is workspace-keyed - but the
--     public submit path still identifies the shop only by the owner's
--     user_id: get_public_booking_profile_v2 returns user_id
--     (workspaces.created_by) and no workspace_id, and the submit
--     handler + its client chain pass only that user_id. This PR
--     deliberately leaves the submit handler and client chain
--     byte-identical and creates testimonials with workspace_id NOT
--     NULL per the design. DO NOT APPLY this migration until the
--     chair lands a NEED-1 mechanism (profile payload gains
--     workspace_id, or the handler resolves it server-side from the
--     booking slug, which maps deterministically to one workspace via
--     workspace_settings/business_profiles) - applying first breaks
--     every public testimonial submission on the NOT NULL.
--  3. NEED-4 verified NEGATIVE at build time: requirePlatformAdmin
--     (src/server/hono/routes/platform.ts) returns the caller's
--     RLS-bound client from requireAuth, NOT a service-role client.
--     The audit_logs section below therefore carries INSERT policies
--     only, per the design, and the platform admin audit read will
--     return zero rows until the chair adds a platform-admin SELECT
--     policy at apply time (or accepts the empty read). Named here
--     rather than silently widened, per the design spec section 6.
--  4. The campaign send handler already stamps workspace_id on its
--     email_queue inserts on current main (the Step 2 code follow-up
--     landed it); this family's paired change there is only the
--     campaign fetch filter swap + the post-send update scoping.
--
-- Additive only: fourteen new tables + two enum types, zero existing
-- data touched. Idempotent - safe to re-run in the SQL Editor.
begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- Enum types the generated types declare for this family. Guarded: if either
-- type already exists in prod (the addendum §3 enum census returned 21 public
-- enums), the create no-ops and the columns bind to the existing type. The
-- apply lane's before-census must confirm the existing values match the
-- contract below — a same-named type with different values would surface at
-- the behavior probe, not here.
-- ============================================================================

do $$
begin
  if not exists (select 1 from pg_type where typname = 'retention_signal_status') then
    create type public.retention_signal_status as enum (
      'detected', 'active', 'suppressed', 'resolved', 'expired'
    );
  end if;
  if not exists (select 1 from pg_type where typname = 'vehicle_lifecycle_status') then
    create type public.vehicle_lifecycle_status as enum (
      'active', 'due_soon', 'overdue', 'at_risk', 'lost'
    );
  end if;
end $$;

-- ============================================================================
-- STEP 6 — invoice_lifecycle_events
-- ============================================================================
-- Exercised contract (documents.ts:892-915): the append-invoice-event route
-- runs requireWorkspaceAuth on body.workspace_id — the workspace context is
-- already in hand — and inserts {invoice_id, user_id (actor), event_type,
-- idempotency_key, details}. The handler catches Postgres 23505 and returns
-- the existing event, which is only possible with a UNIQUE constraint on
-- idempotency_key: the guarded unique index below is load-bearing contract,
-- not decoration. amount is in the types (numeric, nullable) but never
-- written by the route; kept for the contract's other (out-of-repo) writers.

create table if not exists public.invoice_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete cascade,
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_type text not null,
  amount numeric,
  details jsonb not null default '{}'::jsonb,
  idempotency_key text,
  created_at timestamptz not null default now()
);

-- Postgres UNIQUE treats NULLs as distinct: keyless events never collide.
create unique index if not exists invoice_lifecycle_events_idempotency_key_uidx
  on public.invoice_lifecycle_events (idempotency_key);
create index if not exists invoice_lifecycle_events_workspace_created_idx
  on public.invoice_lifecycle_events (workspace_id, created_at desc);
create index if not exists invoice_lifecycle_events_invoice_created_idx
  on public.invoice_lifecycle_events (invoice_id, created_at desc);

alter table public.invoice_lifecycle_events enable row level security;

drop policy if exists invoice_lifecycle_events_staff_select on public.invoice_lifecycle_events;
create policy invoice_lifecycle_events_staff_select on public.invoice_lifecycle_events
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists invoice_lifecycle_events_staff_insert on public.invoice_lifecycle_events;
create policy invoice_lifecycle_events_staff_insert on public.invoice_lifecycle_events
  for insert to authenticated
  with check (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — retention_events (created first: signals and executions FK to it)
-- ============================================================================
-- Exercised contract (crm.ts:1296-1312): POST /retention/events inserts
-- zod-validated rows (retentionEventSchema) with user_id stamped as actor.
-- aggregate_id is TEXT by evidence: the schema accepts any trimmed string of
-- 1..200 chars (event_name/aggregate vocabulary includes non-uuid
-- aggregates), where the draft guessed uuid. schema_version takes DEFAULT 1
-- (Insert-optional in types, so a default existed; 1 is the only sane initial
-- schema version — flagged in the spec). source_system stays NULLABLE: the
-- route omits it and no default value is evidenced anywhere (step2
-- email_queue.source precedent — a NULL beats an invented default; flagged
-- as a deliberate deviation from the Row type's non-null).

create table if not exists public.retention_events (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  event_name text not null,
  aggregate_type text not null,
  aggregate_id text not null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  payload_jsonb jsonb,
  occurred_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  schema_version integer not null default 1,
  source_system text,
  idempotency_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retention_events_workspace_occurred_idx
  on public.retention_events (workspace_id, occurred_at desc);
create index if not exists retention_events_aggregate_idx
  on public.retention_events (aggregate_type, aggregate_id);

alter table public.retention_events enable row level security;

drop policy if exists retention_events_staff_select on public.retention_events;
create policy retention_events_staff_select on public.retention_events
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists retention_events_staff_insert on public.retention_events;
create policy retention_events_staff_insert on public.retention_events
  for insert to authenticated
  with check (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — retention_signals
-- ============================================================================
-- Exercised contract (crm.ts, 13 sites): reads and status updates only — no
-- in-repo insert exists (the detection writer is out-of-repo and runs as a
-- worker). status is the retention_signal_status ENUM the types declare;
-- DEFAULT 'detected' (Insert-optional in types, so a default existed, and
-- 'detected' is the lifecycle's entry state — the code's own
-- RETENTION_ACTIVE_STATUSES treats detected as the birth state; flagged).
-- definition_version DEFAULT 1 (same reasoning as schema_version; flagged).
-- score stays numeric (scores are compared against a numeric threshold).

create table if not exists public.retention_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_type text not null,
  definition_version integer not null default 1,
  status public.retention_signal_status not null default 'detected',
  score numeric not null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  source_event_id uuid references public.retention_events (id) on delete set null,
  source_fact_id uuid references public.retention_events (id) on delete set null,
  payload_jsonb jsonb,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retention_signals_workspace_status_detected_idx
  on public.retention_signals (workspace_id, status, detected_at desc);
create index if not exists retention_signals_customer_idx
  on public.retention_signals (customer_id);

alter table public.retention_signals enable row level security;

drop policy if exists retention_signals_staff_select on public.retention_signals;
create policy retention_signals_staff_select on public.retention_signals
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists retention_signals_staff_update on public.retention_signals;
create policy retention_signals_staff_update on public.retention_signals
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — retention_action_executions
-- ============================================================================
-- Exercised contract (crm.ts:3094-3105, platform.ts:1869-1886): reads only,
-- both embedding related names through PostgREST — automation_rules(name)
-- and customers(name) — so the rule_id and customer_id FKs are load-bearing
-- for those embeds, not decoration. automation_rules is exercised across the
-- CRM routes and is NOT in the absent census: treated as present (the apply
-- lane confirms it in the before-census; if it were absent, this CREATE's FK
-- would fail the whole transaction loudly, by design). status is NOT NULL
-- with NO default (Insert-optional in types, but no value is evidenced
-- anywhere in the repo — step2 message_bundles.renewal_period precedent;
-- the out-of-repo executor must supply it; flagged).

create table if not exists public.retention_action_executions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  signal_id uuid references public.retention_signals (id) on delete set null,
  rule_id uuid references public.automation_rules (id) on delete set null,
  -- FK to retention_campaign_enrollments deliberately omitted: that table is
  -- in the defer bucket and is not created in this pass. Owed (spec §7).
  campaign_enrollment_id uuid,
  customer_id uuid references public.customers (id) on delete set null,
  source_event_id uuid references public.retention_events (id) on delete set null,
  action_type text not null,
  status text not null,
  scheduled_for text,
  executed_at timestamptz,
  result_jsonb jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists retention_action_executions_workspace_executed_idx
  on public.retention_action_executions (workspace_id, executed_at desc);
create index if not exists retention_action_executions_signal_idx
  on public.retention_action_executions (signal_id);

alter table public.retention_action_executions enable row level security;

drop policy if exists retention_action_executions_staff_select on public.retention_action_executions;
create policy retention_action_executions_staff_select on public.retention_action_executions
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — retention_vehicle_profiles
-- ============================================================================
-- Exercised contract (crm.ts:942-948, 1157): reads only (select *; the
-- impact read projects vehicle_id + days_overdue). No in-repo writer — the
-- retention engine maintains these out-of-repo. The types mark the
-- vehicle_id relationship isOneToOne: the profile is the vehicle's single
-- retention shadow, so uniqueness is per (workspace_id, vehicle_id) after
-- translation. lifecycle_status is the vehicle_lifecycle_status ENUM; NOT
-- NULL with NO default (Insert-optional means a default existed, but no
-- value is evidenced — the engine supplies it; flagged). last_service_date /
-- predicted_next_service_date stay TEXT (types: string; the draft agrees;
-- nothing in code parses them). avg_interval_days / days_overdue stay
-- numeric (fractional averages); the three *_cents / count columns go
-- INTEGER per the cents/count idiom (flagged in the spec).

create table if not exists public.retention_vehicle_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  vehicle_id uuid not null references public.vehicles (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  lifecycle_status public.vehicle_lifecycle_status not null,
  -- FK to services deliberately omitted: services is created in Step 8. Owed.
  last_service_id uuid,
  last_service_date text,
  predicted_next_service_date text,
  avg_interval_days numeric,
  avg_spend_cents integer,
  days_overdue numeric,
  services_completed integer,
  lifetime_value_cents integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists retention_vehicle_profiles_workspace_vehicle_uidx
  on public.retention_vehicle_profiles (workspace_id, vehicle_id);

alter table public.retention_vehicle_profiles enable row level security;

drop policy if exists retention_vehicle_profiles_staff_select on public.retention_vehicle_profiles;
create policy retention_vehicle_profiles_staff_select on public.retention_vehicle_profiles
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — loyalty_accounts
-- ============================================================================
-- Exercised contract (crm.ts:1158): a single head-count read (status =
-- 'active'). No in-repo writer — enrollment runs out-of-repo. The four
-- counters are Insert-optional in types (defaults existed) and integral:
-- INTEGER DEFAULT 0. status DEFAULT 'active' (Insert-optional, and 'active'
-- is the only value evidenced anywhere in the repo; flagged). tier is NOT
-- NULL with NO default (Insert-optional, but no tier value is evidenced
-- anywhere — step2 renewal_period precedent; the enrolling writer supplies
-- it; flagged). program_id is NOT NULL per types, with NO FK: its target
-- loyalty_programs is in the defer bucket and is not created in this pass.
-- Owed if that table ever lands (spec §7).

create table if not exists public.loyalty_accounts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  program_id uuid not null,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  status text not null default 'active',
  tier text not null,
  points_balance integer not null default 0,
  lifetime_points_earned integer not null default 0,
  lifetime_spend_cents integer not null default 0,
  visit_count integer not null default 0,
  last_visit_at timestamptz,
  enrolled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists loyalty_accounts_workspace_status_idx
  on public.loyalty_accounts (workspace_id, status);
create index if not exists loyalty_accounts_customer_idx
  on public.loyalty_accounts (customer_id);

alter table public.loyalty_accounts enable row level security;

drop policy if exists loyalty_accounts_staff_select on public.loyalty_accounts;
create policy loyalty_accounts_staff_select on public.loyalty_accounts
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — review_requests
-- ============================================================================
-- Exercised contract (crm.ts:2057-2090): reads only — the review dashboard
-- (select * with a services embed) and review analytics. No in-repo writer;
-- requests are minted out-of-repo (the Step 2 email_queue writer family is
-- the plausible producer). platform and status are NOT NULL with NO defaults
-- (Insert-optional in types, but no default value is evidenced in the repo —
-- the zod vocabulary for platform is google/yelp/both, noted in the spec;
-- no CHECK constraint, per the sync-pair no-CHECK precedent; flagged).
-- service_id carries NO FK until Step 8 creates services — that FK is also
-- what makes the dashboard's services:service_id embed resolve (spec §7).
-- deleted_at kept: src/lib/soft-delete.ts lists this table for soft deletes.

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  service_id uuid,
  email_queue_id uuid,
  recipient_email text not null,
  recipient_name text,
  platform text not null,
  status text not null,
  review_url text,
  clicked_at timestamptz,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists review_requests_workspace_created_idx
  on public.review_requests (workspace_id, created_at desc);

alter table public.review_requests enable row level security;

drop policy if exists review_requests_staff_select on public.review_requests;
create policy review_requests_staff_select on public.review_requests
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — email_marketing_campaigns
-- ============================================================================
-- Exercised contract (crm.ts, 7 sites): full staff CRUD on the RLS client —
-- list, create (inserts user_id as creator + status draft/scheduled),
-- delete by id, test send, and the workspace-gated send flow which updates
-- status/sent_at/recipient_count by campaign id. The five NOT NULL counters
-- in the types are omitted by the create insert (defaults existed):
-- INTEGER DEFAULT 0. click/open/recipient counts are nullable in the types
-- and stay nullable integers. recipient_type and status are always supplied
-- by the create insert (status: scheduled ? "scheduled" : "draft"), so NOT
-- NULL with no DB default — the contract's values live in the route.

create table if not exists public.email_marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  subject text not null,
  content text not null,
  recipient_type text not null,
  status text not null,
  recipient_ids text[],
  scheduled_at timestamptz,
  sent_at timestamptz,
  recipient_count integer,
  open_count integer,
  click_count integer,
  conversion_count integer not null default 0,
  delivered_count integer not null default 0,
  failed_count integer not null default 0,
  opt_out_count integer not null default 0,
  reply_count integer not null default 0,
  last_engagement_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists email_marketing_campaigns_workspace_created_idx
  on public.email_marketing_campaigns (workspace_id, created_at desc);

alter table public.email_marketing_campaigns enable row level security;

drop policy if exists email_marketing_campaigns_staff_select on public.email_marketing_campaigns;
create policy email_marketing_campaigns_staff_select on public.email_marketing_campaigns
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists email_marketing_campaigns_staff_insert on public.email_marketing_campaigns;
create policy email_marketing_campaigns_staff_insert on public.email_marketing_campaigns
  for insert to authenticated
  with check (public.is_workspace_staff(workspace_id));

drop policy if exists email_marketing_campaigns_staff_update on public.email_marketing_campaigns;
create policy email_marketing_campaigns_staff_update on public.email_marketing_campaigns
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

drop policy if exists email_marketing_campaigns_staff_delete on public.email_marketing_campaigns;
create policy email_marketing_campaigns_staff_delete on public.email_marketing_campaigns
  for delete to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — service_reminders
-- ============================================================================
-- Exercised contract (crm.ts:2365-2387): one read (created_at,
-- reminder_date, service_type, status, customer_id since a timestamp). No
-- in-repo writer. reminder_date and last_service_date stay TEXT: the types
-- type them as string and the zod ServiceReminderSchema validates
-- reminder_date as a plain string, not a datetime. mileage_interval goes
-- INTEGER (a whole-miles interval; flagged in the spec). status NOT NULL,
-- no default (zod vocabulary: scheduled/sent; the minting writer is
-- out-of-repo and supplies it; flagged). last_service_id: FK owed after
-- Step 8 creates services.

create table if not exists public.service_reminders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  vehicle_id uuid references public.vehicles (id) on delete set null,
  last_service_id uuid,
  service_type text not null,
  reminder_date text not null,
  last_service_date text,
  mileage_interval integer,
  status text not null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists service_reminders_workspace_created_idx
  on public.service_reminders (workspace_id, created_at desc);

alter table public.service_reminders enable row level security;

drop policy if exists service_reminders_staff_select on public.service_reminders;
create policy service_reminders_staff_select on public.service_reminders
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- STEP 7 — testimonials
-- ============================================================================
-- Exercised contract (crm.ts 2053/2084/2272/2281/2855; platform.ts
-- 3847/3878/3881): CRM list + status/featured patches run on the RLS client;
-- the public submit (crm.ts:2855) inserts through the ADMIN client with
-- status 'pending' always supplied, and the platform marketplace surface
-- reads/replies through the admin client keyed by the shop owner's user_id.
-- status is therefore NOT NULL with no default needed. rating goes INTEGER
-- (the submit schema constrains it to an integer 1..5; flagged). user_id is
-- retained NOT NULL: the public caller chain identifies the shop BY the
-- owner's user_id today — supplying workspace_id on that path is a named
-- NEED (spec §6), and the family does not land until it is resolved.
-- deleted_at kept (soft-delete.ts lists testimonials; the platform read
-- filters on it). service_id FK owed after Step 8.

create table if not exists public.testimonials (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  customer_id uuid references public.customers (id) on delete set null,
  service_id uuid,
  customer_name text not null,
  customer_email text,
  content text,
  rating integer,
  status text not null,
  featured boolean,
  video_url text,
  provider_reply text,
  provider_replied_at timestamptz,
  submission_token text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists testimonials_workspace_created_idx
  on public.testimonials (workspace_id, created_at desc);

alter table public.testimonials enable row level security;

drop policy if exists testimonials_staff_select on public.testimonials;
create policy testimonials_staff_select on public.testimonials
  for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists testimonials_staff_update on public.testimonials;
create policy testimonials_staff_update on public.testimonials
  for update to authenticated
  using (public.is_workspace_staff(workspace_id))
  with check (public.is_workspace_staff(workspace_id));

-- ============================================================================
-- NAMED EXCEPTION — audit_logs (actor-keyed platform trail; no workspace_id)
-- ============================================================================
-- Evidence (spec §4.2): the types give user_id NULLABLE and NO relationships;
-- the five writers are lib/auditLog.ts (browser; the caller's user_id is the
-- whole identity), lib/security/audit.ts (browser; user_id may be null for
-- pre-auth events), vehicles.ts logFleetAudit (its callers' workspaceId is
-- nullable and is not passed in), platform.ts's admin explorer insert (no
-- user, no workspace — platform scope by design) and the platform admin read.
-- Forcing workspace_id NOT NULL would break every writer; two of them can
-- never have a workspace. record_id is TEXT (deliberate deviation from the
-- draft's uuid: security/audit.ts types resource_id as an unconstrained
-- string, and both lib helpers swallow insert errors, so a uuid column
-- would drop those rows silently). deleted_at kept (soft-delete.ts lists
-- audit_logs). ip_address/user_agent stay plain text (types carry no inet
-- cast; the writers pass request strings).
-- RLS: the browser libs insert directly, including pre-auth events — anon
-- may insert only user-less rows; authenticated users may insert rows keyed
-- to themselves or user-less rows. NO select policy: the only read path is
-- the platform admin surface (service-role client; the apply lane verifies
-- requirePlatformAdmin's client bypasses RLS — spec §6 NEED).

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  action text not null,
  table_name text,
  record_id text,
  ip_address text,
  user_agent text,
  old_data jsonb,
  new_data jsonb,
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists audit_logs_user_created_idx
  on public.audit_logs (user_id, created_at desc);
create index if not exists audit_logs_action_created_idx
  on public.audit_logs (action, created_at desc);

alter table public.audit_logs enable row level security;

drop policy if exists audit_logs_authenticated_insert on public.audit_logs;
create policy audit_logs_authenticated_insert on public.audit_logs
  for insert to authenticated
  with check (user_id is null or user_id = auth.uid());

drop policy if exists audit_logs_anon_insert on public.audit_logs;
create policy audit_logs_anon_insert on public.audit_logs
  for insert to anon
  with check (user_id is null);

-- ============================================================================
-- NAMED EXCEPTION — visitor_presence (legacy tenant pair, 1 of 2)
-- ============================================================================
-- Presence is ephemeral funnel state, not workspace records: the writers are
-- anonymous visitors on public pages (PublicBooking.tsx starts presence with
-- the business owner's user_id as tenantId; src/lib/livePresence.ts upserts
-- on the browser client, keyed onConflict "tenant_id,session_id"). Three
-- draft errors corrected by code evidence: session_id is TEXT (the code
-- composes `${visitorId}:${tabId}`); connected_at needs DEFAULT now() (the
-- upsert omits it and the column is NOT NULL); and the UNIQUE(tenant_id,
-- session_id) the upsert targets did not exist in the draft at all — without
-- it the upsert fails. heartbeat_at / last_activity_at take DEFAULT now()
-- as insert-safety (types mark them Insert-optional; the upsert supplies
-- them). primary_tab DEFAULT false (Insert-optional; the upsert supplies
-- it). tenant_id carries NO FK (types list no relationships for this table;
-- the value is the owner's auth id — flagged in the spec).
-- RLS is by-design public-write: any visitor announces presence and
-- heartbeats. SELECT is owner-keyed (tenant_id = auth.uid()), which serves
-- both the CRM live-visitors read (owner-self enforced in the handler) and
-- the browser realtime subscription in src/lib/crm-realtime.ts. Staff who
-- are not the owner do not see presence under this policy — that matches
-- the exercised contract (the read endpoint 403s non-owners); widening it
-- needs a tenant->workspace resolution that does not exist yet (spec §6).

create table if not exists public.visitor_presence (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  visitor_id uuid not null,
  session_id text not null,
  current_path text,
  referrer text,
  country text,
  device_type text,
  browser text,
  state text not null,
  primary_tab boolean not null default false,
  connected_at timestamptz not null default now(),
  disconnected_at timestamptz,
  heartbeat_at timestamptz not null default now(),
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

create unique index if not exists visitor_presence_tenant_session_uidx
  on public.visitor_presence (tenant_id, session_id);
create index if not exists visitor_presence_tenant_heartbeat_idx
  on public.visitor_presence (tenant_id, heartbeat_at desc);

alter table public.visitor_presence enable row level security;

drop policy if exists visitor_presence_public_insert on public.visitor_presence;
create policy visitor_presence_public_insert on public.visitor_presence
  for insert to anon, authenticated
  with check (true);

drop policy if exists visitor_presence_public_update on public.visitor_presence;
create policy visitor_presence_public_update on public.visitor_presence
  for update to anon, authenticated
  using (true)
  with check (true);

drop policy if exists visitor_presence_owner_select on public.visitor_presence;
create policy visitor_presence_owner_select on public.visitor_presence
  for select to authenticated
  using (tenant_id = auth.uid());

-- src/lib/crm-realtime.ts subscribes to postgres_changes on this table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'visitor_presence'
  ) then
    alter publication supabase_realtime add table public.visitor_presence;
  end if;
end $$;

-- ============================================================================
-- NAMED EXCEPTION — analytics_events (legacy tenant pair, 2 of 2)
-- ============================================================================
-- Funnel events keyed by the same legacy tenant_id (owner's user id).
-- Writers: livePresence.trackEvent (public pages) and
-- marketplaceTracking.ts (its own comment: "Legacy column name on
-- analytics_events for the workspace owner id"). session_id is TEXT twice
-- over: presence composes a composite string, and marketplace tracking
-- falls back to the literal string "anonymous" when storage is unavailable.
-- metadata takes the idiom DEFAULT '{}' (Insert-optional in types; both
-- writers always supply an object). RLS mirrors visitor_presence: public
-- insert by design, owner-keyed select for the realtime subscription and
-- the CRM live-visitors read; the platform metrics read runs on the admin
-- client and bypasses RLS.

create table if not exists public.analytics_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null,
  session_id text not null,
  event_name text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists analytics_events_tenant_created_idx
  on public.analytics_events (tenant_id, created_at desc);
create index if not exists analytics_events_tenant_event_created_idx
  on public.analytics_events (tenant_id, event_name, created_at desc);

alter table public.analytics_events enable row level security;

drop policy if exists analytics_events_public_insert on public.analytics_events;
create policy analytics_events_public_insert on public.analytics_events
  for insert to anon, authenticated
  with check (true);

drop policy if exists analytics_events_owner_select on public.analytics_events;
create policy analytics_events_owner_select on public.analytics_events
  for select to authenticated
  using (tenant_id = auth.uid());

-- src/lib/crm-realtime.ts subscribes to postgres_changes on this table.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public'
      and tablename = 'analytics_events'
  ) then
    alter publication supabase_realtime add table public.analytics_events;
  end if;
end $$;

-- ============================================================================
-- NAMED EXCEPTION — ai_agents (global catalog; no tenancy)
-- ============================================================================
-- Exercised contract (platform.ts:4297-4306): the sole reader uses the ANON
-- client and selects active agents (slug, name, role, avatar, color,
-- display_order) with no tenancy filter of any kind. There is no writer in
-- the repo — the catalog is seed-maintained. A workspace_id here would be
-- invented tenancy; the table is created exactly as the contract exercises
-- it. display_order goes INTEGER (an ordering key; flagged). capabilities
-- takes the idiom DEFAULT '{}' (Insert-optional in types; the seed supplies
-- real values). temperature stays numeric — model temperatures are
-- fractional, and the draft is right here. RLS must carry an anon SELECT
-- policy: without one the anon reader gets an empty catalog (the step2
-- message_bundles lesson).

create table if not exists public.ai_agents (
  id uuid primary key default gen_random_uuid(),
  slug text not null,
  name text not null,
  role text not null,
  avatar text,
  color text,
  system_prompt text not null,
  model text not null,
  temperature numeric,
  capabilities jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.ai_agents enable row level security;

drop policy if exists ai_agents_public_select on public.ai_agents;
create policy ai_agents_public_select on public.ai_agents
  for select to anon, authenticated
  using (true);

commit;
