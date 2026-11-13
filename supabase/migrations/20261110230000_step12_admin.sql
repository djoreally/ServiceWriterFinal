-- ============================================================================
-- Service Writer reconciliation pass — Step 12: Admin & Misc
-- (addendum 2026-11-05 FINAL section 6 step 12). Built from the recon-pass
-- design pair (step91012-vehicle-admin.sql + step91012-vehicle-admin-
-- spec.md) under TENANCY-RULING.md: full workspace translation, paired
-- code changes in the same PR.
--
-- This migration is the STEP 12 EXTRACT of the combined steps 9+10+12
-- design file: the design's section SQL is carried verbatim, but only
-- this family's five tables are created here —
--   training_modules, training_reward_policy               (GLOBAL, §3–§4)
--   shop_agent_ledger                        (already workspace-shaped, §5)
--   onboarding_site_imports, weather_risk_logs              (step 12, §15–§16)
-- The design's §1–§2 and §9–§14 belong to Step 9 and its §6–§8 to
-- Step 10 (the vans family) — all already landed separately
-- (20261110220000_step9_vehicle.sql, PR #227;
-- 20261110190000_dispatch_sd2_vans_family.sql, PR #212).
--
-- ENUM TRIM (deviation from the design file, named): the design's §0
-- declares four types-declared enums. Only training_surface and
-- training_credit_applies_to are used by this family's tables, so only
-- those two are created here; filter_brand and filter_type landed with
-- Step 9 (PR #227).
--
-- All 5 verified ABSENT from production (recon census, 2026-11-09/10).
-- Pure schema; every table starts empty; no data loads in this step
-- (the training catalog + singleton policy row are a separate data
-- step, flagged in the spec — the admin Training Rewards tab renders
-- empty states until then).
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- §0 — Types-declared enums (existence-guarded; values verbatim from
-- src/integrations/supabase/types.ts Enums). Only this family's pair is
-- carried here (see the header's enum-trim note).
-- ============================================================================

do $do$
begin
  create type public.training_surface as enum ('fleet_os','customer_portal');
exception when duplicate_object then null;
end
$do$;

do $do$
begin
  create type public.training_credit_applies_to as enum ('subscription','services','both');
exception when duplicate_object then null;
end
$do$;

-- ============================================================================
-- §3 — training_modules  (GLOBAL platform catalog — named exception)
-- Platform-wide training catalog edited from the platform AdminDashboard
-- (AdminTrainingRewards.tsx). No tenancy in types/draft/code. Money is
-- integer cents (the component converts with Math.round). Draft:
-- 20261010000066 (numeric reward_cents/sort_order + no-default NOT NULLs
-- corrected per types Insert-optionality).
-- ============================================================================

create table if not exists public.training_modules (
  id uuid primary key default gen_random_uuid(),
  surface public.training_surface not null,
  slug text not null,
  title text not null,
  description text,
  reward_cents integer not null default 0,
  currency text not null default 'USD',
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.training_modules enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_modules' and policyname = 'training_modules_auth_select') then
    create policy training_modules_auth_select on public.training_modules
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_modules' and policyname = 'training_modules_admin_update') then
    create policy training_modules_admin_update on public.training_modules
      for update to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end
$do$;

-- ============================================================================
-- §4 — training_reward_policy  (GLOBAL platform singleton — named exception)
-- ONE platform-wide row (the component reads it with maybeSingle()). The
-- `singleton` flag column exists to enforce that; a partial unique index
-- gives the flag its evident meaning. The row itself is seeded by a data
-- step (outside this pass), so no defaults are invented for its values.
-- Draft: 20261010000067.
-- ============================================================================

create table if not exists public.training_reward_policy (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true,
  enabled boolean not null,
  monthly_cap_cents integer not null,
  lifetime_cap_cents integer not null,
  applies_to public.training_credit_applies_to not null,
  currency text not null default 'USD',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists training_reward_policy_singleton_key
  on public.training_reward_policy (singleton) where singleton;

alter table public.training_reward_policy enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_reward_policy' and policyname = 'training_reward_policy_auth_select') then
    create policy training_reward_policy_auth_select on public.training_reward_policy
      for select to authenticated using (true);
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'training_reward_policy' and policyname = 'training_reward_policy_admin_update') then
    create policy training_reward_policy_admin_update on public.training_reward_policy
      for update to authenticated
      using (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'))
      with check (exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin'));
  end if;
end
$do$;

-- ============================================================================
-- §5 — shop_agent_ledger  (ALREADY workspace-shaped in its hand-written
-- draft — created as drafted, ledger portion ONLY. The same phase-1 file
-- also creates a conversations table, which is bucket (iii) DEFERRED
-- and is deliberately NOT created here.)
-- Hash-chained, append-only agent event log; the zeroai ledger module
-- (src/server/shop-agent/zeroai/ledger.ts) is the contract: it inserts
-- workspace_id/event_id/actor/action/occurred_at/input_hash/output_hash/
-- parent_hash/event_hash/evidence and reads by workspace_id. Draft:
-- 20261002000000_shop_agent_phase1.sql. RLS on, no policies: only the
-- service-role agent runtime reads or writes.
-- ============================================================================

create table if not exists public.shop_agent_ledger (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  event_id text not null,
  actor text not null,
  action text not null,
  occurred_at timestamptz not null default now(),
  input_hash text not null,
  output_hash text,
  parent_hash text not null,
  event_hash text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint shop_agent_ledger_workspace_event_key unique (workspace_id, event_id)
);

create index if not exists shop_agent_ledger_workspace_occurred_idx
  on public.shop_agent_ledger (workspace_id, occurred_at desc);

alter table public.shop_agent_ledger enable row level security;
-- No policies by design (service-role only), exactly as the draft specifies.

-- ============================================================================
-- §15 — onboarding_site_imports  (Step 12 — workspace-translated)
-- Written by the out-of-repo onboarding-site-import edge function (its
-- write shape rests on types + draft only — flagged in the spec); the one
-- in-repo reader is platform.ts GET /v1/platform/onboarding/site-import/
-- latest. Corrections vs draft 20261010000037: workspace_id added as
-- tenancy (user_id kept as the legacy creator column); payload gains
-- DEFAULT '{}' and warnings DEFAULT '[]' (types: both Insert-optional,
-- Row non-null); created_at/updated_at gain DEFAULT now(). status stays
-- NOT NULL with NO default: the reader proves the terminal value
-- 'completed' and the writer owns the lifecycle — inventing a start value
-- would be guessing (flagged in the spec).
-- ============================================================================

create table if not exists public.onboarding_site_imports (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  source_url text not null,
  status text not null,
  payload jsonb not null default '{}'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_site_imports_workspace_status_idx
  on public.onboarding_site_imports (workspace_id, status, created_at desc);

alter table public.onboarding_site_imports enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'onboarding_site_imports' and policyname = 'onboarding_site_imports_staff_all') then
    create policy onboarding_site_imports_staff_all on public.onboarding_site_imports
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §16 — weather_risk_logs  (Step 12 — workspace-translated)
-- Weather-guard audit trail beside the appointments weather_* columns.
-- Writers are out-of-repo edge functions (weather-guard-evaluate /
-- -action / -check-slot); the in-repo readers are an UNSCOPED route read
-- (platform.ts — RLS does the scoping) and a realtime subscription from
-- the browser client (weather-guard.query.ts), so the table also joins
-- the supabase_realtime publication below. snapshot_id deliberately has
-- NO foreign key: its types-declared target, weather_snapshots, is
-- bucket (iii) DEFERRED and is not created in this pass. Corrections vs
-- draft 20261010000130: workspace_id added as tenancy (user_id kept as
-- the legacy actor column); evaluated_at gains DEFAULT now() and
-- risk_score DEFAULT 0 (types: both Insert-optional, Row non-null; the
-- draft's bare NOT NULL evaluated_at would fail any insert omitting it).
-- The types contract has NO created_at for this table; none is invented.
-- ============================================================================

create table if not exists public.weather_risk_logs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  appointment_id uuid not null references public.appointments(id),
  snapshot_id uuid,
  risk_level text not null,
  risk_score numeric not null default 0,
  decision text not null,
  reason text,
  evaluated_at timestamptz not null default now()
);

create index if not exists weather_risk_logs_workspace_evaluated_idx
  on public.weather_risk_logs (workspace_id, evaluated_at desc);
create index if not exists weather_risk_logs_appointment_idx
  on public.weather_risk_logs (appointment_id);

alter table public.weather_risk_logs enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'weather_risk_logs' and policyname = 'weather_risk_logs_staff_all') then
    create policy weather_risk_logs_staff_all on public.weather_risk_logs
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- Realtime: weather-guard.query.ts subscribes to INSERTs on this table
-- from the browser client (guarded add, sync-pair idiom).
do $do$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'weather_risk_logs'
     ) then
    alter publication supabase_realtime add table public.weather_risk_logs;
  end if;
end
$do$;

commit;
