-- ============================================================================
-- Service Writer reconciliation pass — Step 9: Vehicle Depth & Import
-- (addendum 2026-11-05 FINAL section 6 step 9). Built from the recon-pass
-- design pair (step91012-vehicle-admin.sql + step91012-vehicle-admin-
-- spec.md) under TENANCY-RULING.md: full workspace translation, paired
-- code changes in the same PR.
--
-- This migration is the STEP 9 EXTRACT of the combined steps 9+10+12
-- design file: the design's section SQL is carried verbatim, but only
-- this family's eight tables are created here —
--   filter_applications, filter_cross_references          (GLOBAL, §1–§2)
--   vehicle_part_assignments, vehicle_recommendations,
--   vehicle_intelligence_profiles                         (step 9, §9–§11)
--   vehicle_import_batches, vehicle_import_rows,
--   vehicle_import_audit_log                              (step 9, §12–§14)
-- The design's §3–§5 and §15–§16 belong to Step 12 and are NOT created
-- here; its §6–§8 (vans family, Step 10) already landed separately
-- (20261110190000_dispatch_sd2_vans_family.sql, PR #212).
--
-- ENUM TRIM (deviation from the design file, named): the design's §0
-- declares four types-declared enums. Only filter_brand and filter_type
-- are used by this family's tables, so only those two are created here;
-- training_surface and training_credit_applies_to belong to Step 12's
-- training tables and land with that step.
--
-- All 8 verified ABSENT from production (recon census, 2026-11-09/10).
-- Pure schema; every table starts empty; no data loads in this step
-- (the filter catalogs have no in-repo writer — seeding is a separate
-- data step, flagged in the spec).
-- ============================================================================

begin;

create extension if not exists pgcrypto;

-- ============================================================================
-- §0 — Types-declared enums (existence-guarded; values verbatim from
-- src/integrations/supabase/types.ts Enums).
-- ============================================================================

do $do$
begin
  create type public.filter_brand as enum ('fram','wix','purolator','ac_delco','motorcraft','bosch','k_n','mobil1','other');
exception when duplicate_object then null;
end
$do$;

do $do$
begin
  create type public.filter_type as enum ('oil','air','cabin','fuel','transmission','hydraulic','pcv','breather');
exception when duplicate_object then null;
end
$do$;


-- ============================================================================
-- §1 — filter_applications  (GLOBAL reference data — named exception)
-- Fitment catalog: which filter part fits which vehicle application. No
-- tenancy column in types or draft; the only in-repo reader is a route
-- whose own section header declares "reference tables are global, not
-- user-scoped" (vehicles.ts:1591). Draft: 20261010000021.
-- ============================================================================

create table if not exists public.filter_applications (
  id uuid primary key default gen_random_uuid(),
  brand public.filter_brand not null,
  filter_type public.filter_type not null,
  make text not null,
  model text not null,
  engine text not null,
  year_start integer not null,
  year_end integer not null,
  part_number text not null,
  part_number_alt text,
  oem_number text,
  engine_code text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.filter_applications enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'filter_applications' and policyname = 'filter_applications_auth_select') then
    create policy filter_applications_auth_select on public.filter_applications
      for select to authenticated using (true);
  end if;
end
$do$;

-- ============================================================================
-- §2 — filter_cross_references  (GLOBAL reference data — named exception)
-- Brand-to-brand part-number cross-reference catalog; same global evidence
-- as §1 (vehicles.ts:1638 searches it unscoped). Draft: 20261010000022.
-- ============================================================================

create table if not exists public.filter_cross_references (
  id uuid primary key default gen_random_uuid(),
  source_brand public.filter_brand not null,
  source_part_number text not null,
  target_brand public.filter_brand not null,
  target_part_number text not null,
  filter_type public.filter_type,
  confidence_score numeric,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists filter_cross_references_source_part_idx
  on public.filter_cross_references (source_part_number);
create index if not exists filter_cross_references_target_part_idx
  on public.filter_cross_references (target_part_number);

alter table public.filter_cross_references enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'filter_cross_references' and policyname = 'filter_cross_references_auth_select') then
    create policy filter_cross_references_auth_select on public.filter_cross_references
      for select to authenticated using (true);
  end if;
end
$do$;

-- ============================================================================
-- §9 — vehicle_part_assignments  (Step 9 — workspace-translated)
-- One row per part assigned to a retail vehicle (vehicle_id) or a fleet
-- vehicle (fleet_vehicle_id), discriminated by vehicle_kind. Corrections
-- vs draft 20261010000121: workspace_id added as tenancy (user_id kept as
-- the legacy owner marker the insert already stamps from the parent
-- vehicle row); quantity DEFAULT 1 and is_required DEFAULT true (the
-- insert's own fallbacks, vehicles.ts POST — `quantity ?? 1`,
-- `is_required ?? true`); updated_at DEFAULT now(); two partial UNIQUE
-- indexes inferred from the insert route's 23505 -> 409 mapping and its
-- error text ("That part number is already assigned to this vehicle") —
-- FLAGGED in the spec as inferred, not types-proven.
-- ============================================================================

create table if not exists public.vehicle_part_assignments (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  vehicle_kind text not null,
  vehicle_id uuid references public.vehicles(id),
  fleet_vehicle_id uuid,
  inventory_item_id uuid references public.inventory_items(id),
  part_category text not null,
  part_number text not null,
  brand text,
  oem_number text,
  quantity numeric not null default 1,
  unit text,
  is_required boolean not null default true,
  notes text,
  verified_by uuid,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_part_assignments_workspace_idx
  on public.vehicle_part_assignments (workspace_id);
create index if not exists vehicle_part_assignments_vehicle_idx
  on public.vehicle_part_assignments (vehicle_id);
create index if not exists vehicle_part_assignments_fleet_vehicle_idx
  on public.vehicle_part_assignments (fleet_vehicle_id);
create unique index if not exists vehicle_part_assignments_vehicle_part_key
  on public.vehicle_part_assignments (vehicle_id, part_number)
  where vehicle_id is not null;
create unique index if not exists vehicle_part_assignments_fleet_part_key
  on public.vehicle_part_assignments (fleet_vehicle_id, part_number)
  where fleet_vehicle_id is not null;

-- FK to fleet_vehicles (Step 11 — lands AFTER Step 9; conditional idiom).
-- If skipped, this constraint is OWED — see the spec's owed-FK register.
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_part_assignments_fleet_vehicle_id_fkey') then
    begin
      alter table public.vehicle_part_assignments
        add constraint vehicle_part_assignments_fleet_vehicle_id_fkey
        foreign key (fleet_vehicle_id) references public.fleet_vehicles (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'recon steps 9/10/12: FK vehicle_part_assignments_fleet_vehicle_id_fkey skipped (%) — OWED once fleet_vehicles exists', sqlerrm;
    end;
  end if;
end
$do$;

alter table public.vehicle_part_assignments enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_part_assignments' and policyname = 'vehicle_part_assignments_staff_all') then
    create policy vehicle_part_assignments_staff_all on public.vehicle_part_assignments
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §10 — vehicle_recommendations  (Step 9 — workspace-translated)
-- Due-service recommendations per vehicle. vehicle_id deliberately carries
-- NO foreign key: types declare Relationships [] for this table and the
-- exercised rows span the vehicle population without a declared parent.
-- due_date / last_service_date stay TEXT — the generate route writes
-- date-fns "yyyy-MM-dd" strings (vehicles.ts POST /generate). Corrections
-- vs draft 20261010000069: workspace_id added as tenancy (user_id kept as
-- legacy marker); is_dismissed DEFAULT false (the list read filters
-- is_dismissed = false — a NULL would silently hide rows); updated_at
-- DEFAULT now(). priority stays NOT NULL with NO default: types require
-- it and every exercised writer supplies it; no value is evidenced for a
-- default (flagged in the spec).
-- ============================================================================

create table if not exists public.vehicle_recommendations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  vehicle_id uuid not null,
  recommendation_type text not null,
  title text not null,
  description text,
  priority text not null,
  due_date text,
  due_mileage numeric,
  interval_miles numeric,
  interval_months numeric,
  last_service_date text,
  last_service_mileage numeric,
  created_from_service_id uuid,
  is_dismissed boolean not null default false,
  dismissed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_recommendations_workspace_vehicle_idx
  on public.vehicle_recommendations (workspace_id, vehicle_id, is_dismissed);

alter table public.vehicle_recommendations enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_recommendations' and policyname = 'vehicle_recommendations_staff_all') then
    create policy vehicle_recommendations_staff_all on public.vehicle_recommendations
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §11 — vehicle_intelligence_profiles  (Step 9 — workspace-translated)
-- Derived service defaults per fleet vehicle. UNIQUE (vehicle_id) is
-- LOAD-BEARING: the client upserts with onConflict "vehicle_id"
-- (vehicle-intelligence.service.ts) and types mark the vehicle
-- relationship isOneToOne. Corrections vs draft 20261010000114:
-- workspace_id added as tenancy (user_id kept as legacy marker);
-- derived_defaults gains DEFAULT '{}' (types: Insert-optional, Row
-- non-null); created_at/updated_at gain DEFAULT now() (the upsert omits
-- both; the draft's bare NOT NULL updated_at would fail every upsert).
-- ============================================================================

create table if not exists public.vehicle_intelligence_profiles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  vehicle_id uuid not null,
  vin text,
  source_profile jsonb not null,
  derived_defaults jsonb not null default '{}'::jsonb,
  effective_defaults jsonb,
  override_defaults jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_intelligence_profiles_vehicle_key unique (vehicle_id)
);

create index if not exists vehicle_intelligence_profiles_workspace_idx
  on public.vehicle_intelligence_profiles (workspace_id);

-- FK to fleet_vehicles (Step 11 — lands AFTER Step 9; conditional idiom).
-- Types declare vehicle_id -> fleet_vehicles. If skipped, this constraint
-- is OWED — see the spec's owed-FK register.
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_intelligence_profiles_vehicle_id_fkey') then
    begin
      alter table public.vehicle_intelligence_profiles
        add constraint vehicle_intelligence_profiles_vehicle_id_fkey
        foreign key (vehicle_id) references public.fleet_vehicles (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'recon steps 9/10/12: FK vehicle_intelligence_profiles_vehicle_id_fkey skipped (%) — OWED once fleet_vehicles exists', sqlerrm;
    end;
  end if;
end
$do$;

alter table public.vehicle_intelligence_profiles enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_intelligence_profiles' and policyname = 'vehicle_intelligence_profiles_staff_all') then
    create policy vehicle_intelligence_profiles_staff_all on public.vehicle_intelligence_profiles
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §12 — vehicle_import_batches  (Step 9 — workspace-translated)
-- Client-side import staging (src/features/vehicle-import). The exercised
-- contract has NO tenancy column at all: created_by is the importing user
-- (an actor), and reads key on id / created_by. workspace_id is therefore
-- ADDED as the tenancy key and the feature must thread it in — the exact
-- client gap and its proven source (getSelectedWorkspaceId) are specified
-- in the spec as a NEED. Corrections vs draft 20261010000068: the seven
-- row counters gain DEFAULT 0 (types: Insert-optional, Row non-null);
-- updated_at gains DEFAULT now() (the persist upsert omits it on every
-- call — the draft's bare NOT NULL would fail the upsert); the three
-- payload columns stay NOT NULL (the upsert always supplies them).
-- ============================================================================

create table if not exists public.vehicle_import_batches (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  source_file_name text not null,
  source_file_type text not null,
  status text not null,
  total_rows integer not null default 0,
  parsed_rows integer not null default 0,
  ready_rows integer not null default 0,
  warning_rows integer not null default 0,
  error_rows integer not null default 0,
  duplicate_rows integer not null default 0,
  committed_rows integer not null default 0,
  mapping_payload jsonb not null,
  headers_payload jsonb not null,
  context_payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_import_batches_workspace_created_idx
  on public.vehicle_import_batches (workspace_id, created_at desc);
create index if not exists vehicle_import_batches_created_by_idx
  on public.vehicle_import_batches (created_by);

alter table public.vehicle_import_batches enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_import_batches' and policyname = 'vehicle_import_batches_staff_all') then
    create policy vehicle_import_batches_staff_all on public.vehicle_import_batches
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §13 — vehicle_import_rows  (Step 9 — workspace-translated, after batches)
-- workspace_id is denormalized onto the rows (the staging service has the
-- batch — and thus its workspace — in hand when it upserts rows), keeping
-- the trio uniformly workspace-shaped per the ruling instead of keying
-- RLS through the parent. Corrections vs draft 20261010000113:
-- created_at/updated_at gain DEFAULT now() (the persist upsert omits
-- both); row_index is integer (an ordinal). existing_vehicle_id points at
-- fleet_vehicles — the commit service inserts imported vehicles into
-- fleet_vehicles and stamps the new id back onto the row
-- (commit.service.ts) — so its FK is conditional on Step 11, OWED if
-- skipped (spec register).
-- ============================================================================

create table if not exists public.vehicle_import_rows (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.vehicle_import_batches(id) on delete cascade,
  row_index integer not null,
  raw_payload jsonb not null,
  normalized_payload jsonb not null,
  mapped_payload jsonb not null,
  decoded_payload jsonb,
  spec_payload jsonb,
  resolution_payload jsonb,
  validation_status text not null,
  previous_validation_status text,
  validation_messages jsonb not null,
  duplicate_status text not null,
  decode_status text not null,
  commit_status text not null,
  existing_vehicle_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vehicle_import_rows_batch_row_idx
  on public.vehicle_import_rows (batch_id, row_index);
create index if not exists vehicle_import_rows_existing_vehicle_idx
  on public.vehicle_import_rows (existing_vehicle_id);

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'vehicle_import_rows_existing_vehicle_id_fkey') then
    begin
      alter table public.vehicle_import_rows
        add constraint vehicle_import_rows_existing_vehicle_id_fkey
        foreign key (existing_vehicle_id) references public.fleet_vehicles (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'recon steps 9/10/12: FK vehicle_import_rows_existing_vehicle_id_fkey skipped (%) — OWED once fleet_vehicles exists', sqlerrm;
    end;
  end if;
end
$do$;

alter table public.vehicle_import_rows enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_import_rows' and policyname = 'vehicle_import_rows_staff_all') then
    create policy vehicle_import_rows_staff_all on public.vehicle_import_rows
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §14 — vehicle_import_audit_log  (Step 9 — workspace-translated)
-- Append-only import event trail; actor_id is the acting user (an actor,
-- not tenancy). workspace_id denormalized from the batch, as §13.
-- Corrections vs draft 20261010000120: details gains DEFAULT '{}'
-- (types: Insert-optional, Row non-null); created_at DEFAULT now().
-- ============================================================================

create table if not exists public.vehicle_import_audit_log (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  batch_id uuid not null references public.vehicle_import_batches(id) on delete cascade,
  row_id uuid references public.vehicle_import_rows(id) on delete cascade,
  actor_id uuid not null references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists vehicle_import_audit_log_batch_created_idx
  on public.vehicle_import_audit_log (batch_id, created_at);

alter table public.vehicle_import_audit_log enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vehicle_import_audit_log' and policyname = 'vehicle_import_audit_log_staff_all') then
    create policy vehicle_import_audit_log_staff_all on public.vehicle_import_audit_log
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

commit;
