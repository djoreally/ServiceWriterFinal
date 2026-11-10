-- ============================================================================
-- Service Writer reconciliation pass - Step 4: Booking, dispatch & team
-- (the Command Center family; addendum 2026-11-05 FINAL section 6 step 4,
-- symptom P3-3). Built from the recon-pass design pair
-- (step4-dispatch.sql + step4-dispatch-spec.md) under TENANCY-RULING.md:
-- full workspace translation + paired code changes; schema and code
-- land as one sequence, platform-wide - never a MOMS-only patch.
-- Section numbers below follow the design file.
--
-- Census basis (2026-11-09): all family tables verified ABSENT in
-- production; spot re-confirmed 2026-11-10 (SQL-lane captures:
-- technicians + team_members absent individually). appointment_services
-- already exists and is NOT part of this step.
--
-- Shape rule: every CREATE is the code-exercised contract - the
-- reverse-engineered draft migration cross-checked against
-- src/integrations/supabase/types.ts and every live .from()
-- payload/select in the Hono routes - translated to workspace tenancy:
-- workspace_id uuid NOT NULL + FK to workspaces(id), canonical staff
-- RLS (20260907151500 idiom). Exercised legacy columns (user_id,
-- business_user_id, owner/member ids, auth_user_id) are KEPT as data
-- columns wherever live code writes or filters them; tenancy moves to
-- workspace_id, it is not deleted out from under live code.
--
-- FK reality: workspaces, work_orders, customers exist. teams,
-- team_invitations and import_batches are Bucket (iii) DEFERRED and
-- vans is Step 10, so the columns that would FK to them are created as
-- plain uuid columns; the FKs (and the PostgREST embeds that depend on
-- them: technicians -> vans(name), dispatch_runs -> vans(name),
-- platform team_members -> teams!inner) are OWED (spec NEED-S4-3).
-- In-family FKs use the canonical composite form (workspace_id, x_id)
-- -> parent (workspace_id, id) (messaging idiom, 20260822000000).
--
-- DEVIATIONS FROM THE DESIGN FILE, named plainly:
--  1. blocked_dates is NOT created (chair's reversible call,
--     2026-11-10; spec NEED-S4-1): workspace_blackout_dates exists and
--     is canonical (confirmed in prod by the 2026-11-10 captures);
--     the design's blocked_dates block was a separable first block and
--     is struck, so design section 1 is absent here. The one live read
--     (platform.ts public-booking availability) is deliberately
--     untouched by the paired code PR - the strike package (migrating
--     that read to workspace_blackout_dates) is the owner's call,
--     staged separately. => 15 CREATEs, not 16.
--  2. The family RPCs are AUTHORED in section 17. Production captures
--     (2026-11-10, pg_proc, queried twice) prove clock_in, clock_out
--     and create_team_os_technician_v1 DO NOT EXIST in prod - the repo
--     holds only reverse-engineered stubs that RAISE. Per the Step 3
--     log_cash_drawer_event precedent, the bodies are written fresh
--     under the exact types.ts signatures, from the code-exercised
--     contract (their call sites define args/returns). start_break /
--     end_break are authored alongside: same route family, same
--     table, signatures from types.ts (Args: never, Returns:
--     undefined); leaving them as raising stubs would ship the
--     time-clock surface half-broken.
--  3. manage_team_os_technician_access_v1 is NOT authored (carried
--     NEED-S4-4 remainder): its exercised lifecycle vocabulary
--     (lock/offboard/revoke semantics on technicians.status /
--     account_status, invitation persistence) is NOT pinned by repo
--     code, and its invitation state belongs to the deferred
--     team_invitations family. Its call site keeps failing loudly
--     (function absent) rather than behind an invented state machine.
--  4. UNION RE-BASED on the current tree (build-time finding): the
--     design pair was evidenced against the PR #186 snapshot's
--     types.ts; origin/main's types.ts has since drifted (technicians
--     62 columns there vs 66 in the design tree, with a different
--     column set, and similar drift on payroll cycles, skills,
--     time-clock, availability, onboarding, dispatch runs). Per the
--     governing shape rule (draft + generated types + exercised code,
--     live code wins), every table below carries the FULL union:
--     design columns + current-types columns + exercised columns.
--     Columns added by the re-base are flagged inline ("re-base").
--     Two consequences are named, not hidden: (a) booking_contexts
--     gains service_context - the live PATCH writes it and the design
--     missed it; (b) technician_payroll_cycles carries BOTH period
--     generations (period_* from the draft/design types, cycle_* from
--     the current types) and period_start/period_end are NULLABLE -
--     with NOT NULL on both generations' date pairs, one of the two
--     exercised insert shapes would fail on the other's columns.
--
-- Every statement is existence-guarded; the whole step is one
-- transaction. Tables start empty; no data loads in this step.
-- ============================================================================

begin;

-- gen_random_uuid() lives in pgcrypto (also core in PG13+); guard matches
-- the provider-sync idiom migration (20261105224500).
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pgcrypto') then
    create extension pgcrypto;
  end if;
end $$;

-- ============================================================================
-- 2. booking_contexts
-- Draft: 20261010000008. Public booking flow state (anonymous-capable
-- routes in appointments.ts). Deviations from the draft, both flagged in
-- the spec: session_id is TEXT (the route's zod schema accepts any
-- string up to 200 chars; a uuid column would reject live values), and
-- expires_at carries an assumed default (types: Row NOT NULL, but the
-- only insert omits it, so a default existed; value unknowable from the
-- repo — 2 hours mirrors the booking session's working lifetime).
-- business_user_id stays: it is the public flow's exercised handle, and
-- the paired code change resolves workspace_id from it (owner's
-- workspace_members row) at insert time.
-- RLS: canonical staff set PLUS an anon insert policy. Settled by
-- code: optionalAuthClient (appointments.ts:1520) falls back to the
-- ANON-key browser client when no bearer token is present, so the
-- public create runs as the anon role under RLS — without an anon
-- insert policy the booking front door fails. Anon SELECT/UPDATE (the
-- guest progress read/patch, same client) stay commented out below:
-- they would make context rows enumerable by anyone holding the
-- public anon key. NEED-S4-6 owns that decision.
-- ============================================================================
create table if not exists public.booking_contexts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  business_user_id uuid not null,     -- exercised insert column (the business owner's user id)
  session_id text,                    -- DEVIATION from draft uuid: zod insert schema is z.string().max(200)
  status text not null default 'active',  -- the only value live code writes
  location_context jsonb,
  vehicle_context jsonb,
  service_context jsonb,              -- re-base: current types + the live PATCH writes it (design missed it)
  selected_date text,                 -- exercised: the progress PATCH writes it; NOT in types/draft
  selected_time text,                 -- exercised: the progress PATCH writes it; NOT in types/draft
  expires_at timestamptz not null default (now() + interval '2 hours'),  -- ASSUMED default, flagged
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists booking_contexts_workspace_status_idx
  on public.booking_contexts (workspace_id, status);
create index if not exists booking_contexts_business_user_idx
  on public.booking_contexts (business_user_id);

alter table public.booking_contexts enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_contexts' and policyname = 'booking_contexts_staff_select') then
    create policy booking_contexts_staff_select on public.booking_contexts
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_contexts' and policyname = 'booking_contexts_staff_insert') then
    create policy booking_contexts_staff_insert on public.booking_contexts
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_contexts' and policyname = 'booking_contexts_staff_update') then
    create policy booking_contexts_staff_update on public.booking_contexts
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_contexts' and policyname = 'booking_contexts_staff_delete') then
    create policy booking_contexts_staff_delete on public.booking_contexts
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- Anon INSERT is LIVE (not optional): optionalAuthClient falls back
-- to the anon-key client, so a guest's create runs as anon under RLS.
-- The route returns the new row's uuid id to its creator; nothing else
-- about the row is exposed by the insert itself.
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'booking_contexts' and policyname = 'booking_contexts_anon_insert') then
    create policy booking_contexts_anon_insert on public.booking_contexts
      for insert to anon with check (true);
  end if;
end $$;

-- NEED-S4-6 (do NOT enable blindly): guest SELECT/UPDATE by id (the
-- progress read/patch at appointments.ts:1755/:1770, same anon client)
-- are deliberately NOT enabled here. A USING (true) anon policy makes
-- every context row enumerable by anyone holding the public anon key
-- (rows carry guest location/vehicle context; the 2-hour expires_at
-- default bounds but does not remove the exposure). The parent lane
-- chooses: enable these, or give the code PR a context-token design.
-- create policy booking_contexts_anon_select on public.booking_contexts
--   for select to anon using (true);
-- create policy booking_contexts_anon_update on public.booking_contexts
--   for update to anon using (true) with check (true);

-- ============================================================================
-- 3. dispatch_rules
-- Draft: 20261010000017. Weather-guard automation rules (platform.ts —
-- the only reader/writer; the GET is unscoped today, the paired code
-- change scopes both handlers to the weather site's workspace; see
-- NEED-S4-7). user_id kept as an exercised data column (types NOT NULL
-- is relaxed to NULL: no live insert exists in the repo to satisfy it).
-- ============================================================================
create table if not exists public.dispatch_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid,                       -- legacy owner key from types/draft; no live writer in repo
  name text not null,
  condition jsonb not null,
  action text not null,
  active boolean not null default true,        -- Insert-optional in types: a default existed
  auto_execute boolean not null default false, -- Insert-optional in types: a default existed
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists dispatch_rules_workspace_active_idx
  on public.dispatch_rules (workspace_id, active);

alter table public.dispatch_rules enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_rules' and policyname = 'dispatch_rules_staff_select') then
    create policy dispatch_rules_staff_select on public.dispatch_rules
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_rules' and policyname = 'dispatch_rules_staff_insert') then
    create policy dispatch_rules_staff_insert on public.dispatch_rules
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_rules' and policyname = 'dispatch_rules_staff_update') then
    create policy dispatch_rules_staff_update on public.dispatch_rules
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_rules' and policyname = 'dispatch_rules_staff_delete') then
    create policy dispatch_rules_staff_delete on public.dispatch_rules
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 4. operational_jobs
-- Draft: 20261010000038 (code-derived; NOT in types.ts). The exercised
-- contract is minimal: one live read (work-orders.ts tech-app job
-- bundle) selects * by (job_id, job_source) with .maybeSingle() — so
-- the pair is unique. NO writer exists in the repo (NEED-S4-5: the
-- row's creator — trigger or out-of-repo process — must be identified
-- before apply; if it does not stamp workspace_id, the NOT NULL below
-- is where that surfaces). created_at/updated_at are idiom-added, not
-- exercised. This table is NOT the dispatch_operational_jobs_v1 view
-- (Bucket iv — create none); the Command Center reads appointments
-- through the API endpoint, not this table.
-- ============================================================================
create table if not exists public.operational_jobs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  job_id uuid not null,
  job_source text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (job_id, job_source)         -- exercised: the single read is .maybeSingle() on this pair
);

create index if not exists operational_jobs_workspace_idx
  on public.operational_jobs (workspace_id);

alter table public.operational_jobs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operational_jobs' and policyname = 'operational_jobs_staff_select') then
    create policy operational_jobs_staff_select on public.operational_jobs
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operational_jobs' and policyname = 'operational_jobs_staff_insert') then
    create policy operational_jobs_staff_insert on public.operational_jobs
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operational_jobs' and policyname = 'operational_jobs_staff_update') then
    create policy operational_jobs_staff_update on public.operational_jobs
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'operational_jobs' and policyname = 'operational_jobs_staff_delete') then
    create policy operational_jobs_staff_delete on public.operational_jobs
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 5. team_members
-- Draft: 20261010000060. Exercised union: types (id, team_id, user_id,
-- role, created_at) + workspace_id + full_name (the Command Center
-- team read selects * filtered by workspace_id and orders by
-- full_name). team_id is a plain column — its FK target teams is
-- Bucket (iii) deferred (FK owed, NEED-S4-3; the platform.ts member
-- read's teams!inner embed depends on it). user_id is the member's
-- auth user id (insert bodies provide it; types NOT NULL kept).
-- ============================================================================
create table if not exists public.team_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  team_id uuid,                       -- FK owed -> teams(id) when/if teams lands (Bucket iii)
  user_id uuid not null,
  role text not null,
  full_name text,                     -- exercised: Command Center read orders by full_name
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_members_workspace_idx
  on public.team_members (workspace_id);
create index if not exists team_members_user_idx
  on public.team_members (user_id);

alter table public.team_members enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and policyname = 'team_members_staff_select') then
    create policy team_members_staff_select on public.team_members
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and policyname = 'team_members_staff_insert') then
    create policy team_members_staff_insert on public.team_members
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and policyname = 'team_members_staff_update') then
    create policy team_members_staff_update on public.team_members
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_members' and policyname = 'team_members_staff_delete') then
    create policy team_members_staff_delete on public.team_members
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 6. team_user_links  *** NAMED EXCEPTION to workspace_id NOT NULL ***
-- Draft: 20261010000061. This table IS the legacy tenancy bridge: it
-- maps a member user to the workspace OWNER's user id, and live code
-- resolves tenancy FROM it (tenant-workspace.ts fallback when the
-- current_workspace_owner_user_id RPC misses; team-login membership
-- check). Two exercised generations must both fit:
--   (a) types shape: owner_user_id, member_user_id, invitation_id,
--       role — read by tenant-workspace.ts, team-login.query.ts,
--       platform.ts (owner head-count);
--   (b) messaging.ts participant resolution selects user_id and
--       linked_customer_id — columns absent from types/draft.
-- workspace_id is therefore NULLABLE here (the one exception in this
-- step, flagged as NEED-S4-2): no in-repo writer exists to stamp it
-- (the invite writer is out-of-repo), and the table's readers discover
-- the workspace through it, so forcing NOT NULL would break the bridge
-- on first insert. Tighten to NOT NULL in a later step once the invite
-- writer is workspace-translated and rows are backfilled from the
-- owner's home workspace. RLS is self-scoped, not staff-scoped: its
-- readers are browser-client calls made AS the member, before any
-- workspace context exists.
-- ============================================================================
create table if not exists public.team_user_links (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references public.workspaces(id),  -- EXCEPTION: nullable, see header + NEED-S4-2
  owner_user_id uuid not null,
  member_user_id uuid not null,
  user_id uuid,                       -- exercised by messaging.ts (generation b)
  linked_customer_id uuid references public.customers(id),  -- exercised by messaging.ts; customers exists
  invitation_id uuid,                 -- FK owed -> team_invitations(id) (Bucket iii)
  role text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists team_user_links_member_idx
  on public.team_user_links (member_user_id);
create index if not exists team_user_links_owner_idx
  on public.team_user_links (owner_user_id);
create index if not exists team_user_links_user_idx
  on public.team_user_links (user_id);

alter table public.team_user_links enable row level security;

do $$
begin
  -- Self-scoped read: a member/owner reads their own bridge rows.
  -- No authenticated write policies: no in-repo writer exists; the
  -- out-of-repo invite writer's posture is NEED-S4-2's business.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'team_user_links' and policyname = 'team_user_links_self_select') then
    create policy team_user_links_self_select on public.team_user_links
      for select to authenticated
      using (member_user_id = auth.uid() or owner_user_id = auth.uid() or user_id = auth.uid());
  end if;
end $$;

-- ============================================================================
-- 7. technicians — the family's center; created before its satellites.
-- Draft: 20261010000064, cross-checked against types.ts (66 columns)
-- and every live route. The exercised contract is a UNION of two live
-- generations, and both must fit or live selects 500 the day the table
-- lands:
--   (a) the types/draft shape (name, user_id, payroll_type, address…),
--       read/written by typed and `as any` routes alike;
--   (b) columns live `as any` selects use that types/draft LACK:
--       workspace_id, first_name, last_name, full_name, role,
--       home_address, home_latitude, home_longitude, current_latitude,
--       current_longitude, location_updated_at, assigned_van_id,
--       pay_type, drivers_license_url, performance_score,
--       customer_rating_avg (work-orders.ts tech locations / tech-app
--       reads / license upload; appointments.ts dispatch-capacity read).
-- Keying columns that MUST survive translation (all exercised):
--   user_id      — the owning business user; insert column on the one
--                  direct insert route and a filter on reads across
--                  work-orders.ts, vehicles.ts, messaging.ts.
--   auth_user_id — the technician's own login; identity resolution for
--                  team-login, the dispatch board's member matching,
--                  and every tech-app self read.
--   workspace_id — added NOT NULL per the ruling; already filtered by
--                  live code (work-orders.ts, appointments.ts).
-- Assumed defaults (types marks the columns Insert-optional, so
-- defaults existed; values unknowable from the repo — flagged in the
-- spec): status 'active', account_status 'active', is_active true,
-- data_origin 'system_created' (TEXT carrying the data_origin_type
-- enum's vocabulary — the enum itself is an unsettled prod question,
-- addendum R3, so the column is text, not the enum type).
-- FKs owed (plain columns until their steps land): team_id -> teams,
-- invitation_id -> team_invitations, import_batch_id -> import_batches
-- (all Bucket iii), assigned_van_id -> vans (Step 10; the vans(name)
-- embeds in two tech-app selects depend on it — NEED-S4-3).
-- deleted_at is load-bearing: src/lib/soft-delete.ts lists this table.
-- ============================================================================
create table if not exists public.technicians (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,              -- owning business user (exercised insert + filters)
  auth_user_id uuid,                  -- the technician's own auth user (identity link)
  team_id uuid,                       -- FK owed -> teams(id) (Bucket iii)
  name text not null,                 -- with user_id, the only Insert-required columns in types
  first_name text,                    -- exercised (generation b)
  last_name text,                     -- exercised (generation b)
  full_name text,                     -- exercised (generation b)
  email text,
  phone text,
  avatar_url text,
  role text,                          -- exercised (generation b)
  status text not null default 'active',          -- ASSUMED default, flagged
  account_status text not null default 'active',  -- ASSUMED default, flagged
  is_active boolean not null default true,
  address text,
  city text,
  state text,
  zip_code text,
  country text,
  home_address text,                  -- exercised (generation b)
  latitude numeric,
  longitude numeric,
  home_latitude numeric,              -- exercised (generation b)
  home_longitude numeric,             -- exercised (generation b)
  current_latitude numeric,           -- exercised (generation b)
  current_longitude numeric,          -- exercised (generation b)
  location_updated_at timestamptz,    -- exercised (generation b)
  assigned_van_id uuid,               -- FK owed -> vans(id) (Step 10)
  hire_date date,
  termination_date date,
  employment_type text,
  employee_id text,
  hourly_rate numeric,
  salary numeric,
  pay_type text,                      -- exercised (generation b)
  payroll_type text,                  -- types/draft shape (generation a) — both carried, see spec
  skills text[],
  certifications jsonb,
  emergency_contact_name text,
  emergency_contact_phone text,
  emergency_contact_relationship text,
  drivers_license_number text,
  drivers_license_state text,
  drivers_license_expiration date,
  drivers_license_url text,           -- exercised: the license-upload route updates it; not in types/draft
  performance_score numeric,          -- exercised: tech-app profile reads select it; not in types/draft
  customer_rating_avg numeric,        -- exercised: tech-app profile reads select it; not in types/draft
  insurance_info jsonb,
  background_check_status text,
  background_check_date date,
  drug_test_status text,
  drug_test_date date,
  notes text,
  invitation_id uuid,                 -- FK owed -> team_invitations(id) (Bucket iii)
  invited_at timestamptz,
  accepted_at timestamptz,
  invited_by uuid,
  import_batch_id uuid,               -- FK owed -> import_batches(id) (Bucket iii)
  origin_source text,
  data_origin text not null default 'system_created',  -- enum vocabulary as text; see header
  -- Re-base (header deviation 4): columns the CURRENT tree's types.ts
  -- carries that the design tree's types lacked. All nullable, no
  -- defaults (current types proves no insert supplies them by name
  -- except through the passthrough profile payloads). Exercised among
  -- them: current_location (vehicles.ts fleet map-data select + the
  -- fleet work-order embed), max_daily_capacity_hours
  -- (appointments.ts dispatch-capacity select), deactivated_at
  -- (messaging.ts participant filters), working_hours +
  -- drivers_license_expiry (team-dashboard profile payload).
  display_name text,
  bio text,
  assigned_at timestamptz,
  deactivated_at timestamptz,
  deactivated_by uuid,
  retained_auth_user_id uuid,
  current_location jsonb,
  last_location_update timestamptz,
  location_tracking_enabled boolean,
  home_lat numeric,
  home_lng numeric,
  home_zip text,
  drivers_license_expiry date,
  license_expiration_date date,
  insurance_verified boolean,
  base_hourly_rate numeric,
  overtime_rate numeric,
  commission_percentage numeric,
  max_daily_capacity_hours numeric,
  max_jobs_per_day integer,
  weekly_capacity_hours numeric,
  avg_job_duration_minutes numeric,
  service_radius_miles numeric,
  working_hours jsonb,
  jobs_completed_mtd integer,
  revenue_generated_mtd numeric,
  callback_rate numeric,
  redo_rate numeric,
  upsell_rate numeric,
  offboarding_notes text,
  onboarding_completed boolean,
  last_clock_in timestamptz,
  last_clock_out timestamptz,
  preferences jsonb,
  custom_fields jsonb,
  deleted_at timestamptz,             -- soft-delete.ts lists technicians
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id)           -- canonical: composite FK target for the satellites
);

create index if not exists technicians_workspace_status_idx
  on public.technicians (workspace_id, status);
create index if not exists technicians_workspace_active_idx
  on public.technicians (workspace_id, is_active);
create index if not exists technicians_auth_user_idx
  on public.technicians (auth_user_id);
create index if not exists technicians_user_idx
  on public.technicians (user_id);

alter table public.technicians enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_staff_select') then
    create policy technicians_staff_select on public.technicians
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_staff_insert') then
    create policy technicians_staff_insert on public.technicians
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_staff_update') then
    create policy technicians_staff_update on public.technicians
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_staff_delete') then
    create policy technicians_staff_delete on public.technicians
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
  -- Self-read arm: team-login.query.ts reads this table through the
  -- BROWSER client as the technician, before workspace context exists;
  -- the row that proves membership must be readable by its own auth user.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technicians' and policyname = 'technicians_self_select') then
    create policy technicians_self_select on public.technicians
      for select to authenticated using (auth_user_id = auth.uid());
  end if;
end $$;

-- ============================================================================
-- 8. technician_availability
-- Draft: 20261010000085. Already workspace-shaped in live code:
-- appointments.ts reads by (workspace_id, technician_id) and inserts
-- { workspace_id, technician_id, user_id, weekday, start_time,
-- end_time, is_available } — the only satellite whose insert already
-- stamps workspace_id. user_id stays NOT NULL: the insert always
-- provides it (types agrees).
-- ============================================================================
create table if not exists public.technician_availability (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  technician_id uuid not null,
  user_id uuid not null,
  weekday text not null,              -- RE-BASE correction (header deviation 4): the design said integer (draft), but the live client sends day-name strings ('monday'...'sunday', WeeklyAvailabilityGrid) and keys read-backs by them; current types agree (string). An integer column would reject every availability save.
  start_time text not null,           -- types/draft: text time strings; code passes them through opaquely
  end_time text not null,
  is_available boolean not null default true,
  max_jobs_per_day integer,           -- re-base: current types only (not exercised by name)
  service_radius_miles numeric,       -- re-base: current types only (not exercised by name)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id)
);

create index if not exists technician_availability_ws_tech_day_idx
  on public.technician_availability (workspace_id, technician_id, weekday);

alter table public.technician_availability enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_availability' and policyname = 'technician_availability_staff_select') then
    create policy technician_availability_staff_select on public.technician_availability
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_availability' and policyname = 'technician_availability_staff_insert') then
    create policy technician_availability_staff_insert on public.technician_availability
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_availability' and policyname = 'technician_availability_staff_update') then
    create policy technician_availability_staff_update on public.technician_availability
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_availability' and policyname = 'technician_availability_staff_delete') then
    create policy technician_availability_staff_delete on public.technician_availability
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 9. technician_clock_entries
-- Draft: 20261010000062 — the one draft already in canonical shape
-- (workspace_id + canonical staff/writer policies, from code
-- references + scripts/schema-contract.json). NOT in types.ts. The one
-- live read (appointments.ts dispatch bundle) filters workspace_id +
-- user_id and orders by clock_in desc.
-- NEED-S4-4: the clock_in/clock_out RPCs exist in the repo only as
-- reverse-engineered stubs that raise; their production bodies — and
-- whether they write THIS table with workspace_id stamped — are
-- unverifiable from the repo. Capture them (Step 14 off-books reads)
-- BEFORE this family's apply; if the RPC does not stamp workspace_id,
-- its re-creation rides this step's migration package.
-- ============================================================================
create table if not exists public.technician_clock_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,              -- the clocking user; the live read filters it
  clock_in timestamptz,
  clock_out timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists technician_clock_entries_ws_user_in_idx
  on public.technician_clock_entries (workspace_id, user_id, clock_in desc);

alter table public.technician_clock_entries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_clock_entries' and policyname = 'technician_clock_entries_staff_select') then
    create policy technician_clock_entries_staff_select on public.technician_clock_entries
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_clock_entries' and policyname = 'technician_clock_entries_staff_insert') then
    create policy technician_clock_entries_staff_insert on public.technician_clock_entries
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_clock_entries' and policyname = 'technician_clock_entries_staff_update') then
    create policy technician_clock_entries_staff_update on public.technician_clock_entries
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_clock_entries' and policyname = 'technician_clock_entries_staff_delete') then
    create policy technician_clock_entries_staff_delete on public.technician_clock_entries
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 10. technician_notification_preferences — the family's split contract.
-- Draft: 20261010000063 / types: keyed by user_id ONLY, no id column,
-- five boolean toggles. Live code exercises THREE keyings:
--   (a) typed upsert { user_id, ...toggles } onConflict "user_id"
--       (work-orders.ts) — requires UNIQUE (user_id);
--   (b) technician-settings read/upsert keyed by technician_id with
--       columns enabled + notification_types that types/draft LACK —
--       requires UNIQUE (technician_id);
--   (c) reads by user_id selecting the toggles.
-- The create carries the union. A surrogate id PK is added (flagged:
-- no code selects it; upserts key on the two uniques, and PG unique
-- indexes admit multiple NULLs, so user-keyed and technician-keyed
-- rows coexist). The five toggles default FALSE — assumed, flagged:
-- types proves defaults existed but not their values, and these
-- toggles gate CUSTOMER-facing email/SMS, so the safe default is off;
-- both upsert paths write the toggles explicitly. notification_types
-- is text[] (the route validates z.array(z.string())); jsonb is the
-- alternative if a future payload needs objects — flagged in the spec.
-- ============================================================================
create table if not exists public.technician_notification_preferences (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  user_id uuid unique,                -- onConflict target of the typed upsert
  technician_id uuid unique,          -- onConflict target of the settings upsert
  customer_email_enabled boolean not null default false,   -- ASSUMED default, flagged
  customer_sms_enabled boolean not null default false,     -- ASSUMED default, flagged
  dispatch_push_enabled boolean not null default false,    -- ASSUMED default, flagged
  offline_cache_enabled boolean not null default false,    -- ASSUMED default, flagged
  push_notifications_enabled boolean not null default false, -- ASSUMED default, flagged
  enabled boolean,                    -- exercised by the technician-settings upsert; not in types
  notification_types text[],          -- exercised by the technician-settings upsert; not in types
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id),
  check (user_id is not null or technician_id is not null)
);

create index if not exists technician_notification_preferences_ws_idx
  on public.technician_notification_preferences (workspace_id);

alter table public.technician_notification_preferences enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_notification_preferences' and policyname = 'technician_notification_preferences_staff_select') then
    create policy technician_notification_preferences_staff_select on public.technician_notification_preferences
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_notification_preferences' and policyname = 'technician_notification_preferences_staff_insert') then
    create policy technician_notification_preferences_staff_insert on public.technician_notification_preferences
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_notification_preferences' and policyname = 'technician_notification_preferences_staff_update') then
    create policy technician_notification_preferences_staff_update on public.technician_notification_preferences
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_notification_preferences' and policyname = 'technician_notification_preferences_staff_delete') then
    create policy technician_notification_preferences_staff_delete on public.technician_notification_preferences
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 11. technician_onboarding_tasks
-- Draft: 20261010000086. The one insert (work-orders.ts) provides
-- { technician_id, user_id, task_name, category } per task; the paired
-- code change stamps workspace_id from the technician's row. is_completed
-- defaults false (types: Insert-optional; a task starts incomplete —
-- the only sane reading). user_id NOT NULL per types + the insert.
-- ============================================================================
create table if not exists public.technician_onboarding_tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  technician_id uuid not null,
  user_id uuid not null,
  task_name text not null,
  category text not null,
  description text,
  is_completed boolean not null default false,
  completed_at timestamptz,
  completed_by uuid,                  -- re-base: current types only
  notes text,                         -- re-base: current types only (design carried description instead; both kept)
  due_date date,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id)
);

create index if not exists technician_onboarding_tasks_ws_tech_idx
  on public.technician_onboarding_tasks (workspace_id, technician_id);

alter table public.technician_onboarding_tasks enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_onboarding_tasks' and policyname = 'technician_onboarding_tasks_staff_select') then
    create policy technician_onboarding_tasks_staff_select on public.technician_onboarding_tasks
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_onboarding_tasks' and policyname = 'technician_onboarding_tasks_staff_insert') then
    create policy technician_onboarding_tasks_staff_insert on public.technician_onboarding_tasks
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_onboarding_tasks' and policyname = 'technician_onboarding_tasks_staff_update') then
    create policy technician_onboarding_tasks_staff_update on public.technician_onboarding_tasks
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_onboarding_tasks' and policyname = 'technician_onboarding_tasks_staff_delete') then
    create policy technician_onboarding_tasks_staff_delete on public.technician_onboarding_tasks
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 12. technician_payroll_cycles
-- Draft: 20261010000087. Exercised writes: the generic tech-OS insert
-- ({ technician_id, user_id, ...data }) and one PATCH that sets
-- payout_status = 'paid' by id (work-orders.ts). Shape otherwise from
-- types. The paired code change stamps workspace_id (from the
-- technician's row in the generic insert; the PATCH gains a workspace
-- scope guard).
-- ============================================================================
create table if not exists public.technician_payroll_cycles (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  technician_id uuid not null,
  user_id uuid not null,
  period_start date,                  -- NULLABLE per header deviation 4(b): two period generations are carried
  period_end date,                    -- NULLABLE per header deviation 4(b)
  cycle_start date,                   -- re-base: current types' generation
  cycle_end date,                     -- re-base: current types' generation
  total_hours numeric,
  total_jobs integer,
  regular_hours numeric,              -- re-base: current types only
  overtime_hours numeric,             -- re-base: current types only
  base_pay numeric,                   -- re-base: current types only
  overtime_pay numeric,               -- re-base: current types only
  bonuses numeric,                    -- re-base: current types only
  commission_earned numeric,          -- re-base: current types only
  gross_revenue_generated numeric,    -- re-base: current types only
  final_payout numeric,               -- re-base: current types only
  gross_pay numeric,
  deductions numeric,
  net_pay numeric,
  payout_status text,
  payout_date date,
  payout_method text,
  payout_reference text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id)
);

create index if not exists technician_payroll_cycles_ws_tech_idx
  on public.technician_payroll_cycles (workspace_id, technician_id, period_start);

alter table public.technician_payroll_cycles enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_payroll_cycles' and policyname = 'technician_payroll_cycles_staff_select') then
    create policy technician_payroll_cycles_staff_select on public.technician_payroll_cycles
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_payroll_cycles' and policyname = 'technician_payroll_cycles_staff_insert') then
    create policy technician_payroll_cycles_staff_insert on public.technician_payroll_cycles
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_payroll_cycles' and policyname = 'technician_payroll_cycles_staff_update') then
    create policy technician_payroll_cycles_staff_update on public.technician_payroll_cycles
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_payroll_cycles' and policyname = 'technician_payroll_cycles_staff_delete') then
    create policy technician_payroll_cycles_staff_delete on public.technician_payroll_cycles
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 13. technician_skills
-- Draft: 20261010000088. Reads key by technician_id (work-orders.ts);
-- writes flow through the generic tech-OS insert ({ technician_id,
-- user_id, ...data }). is_active defaults true (types: Insert-optional,
-- reads filter on it). user_id NOT NULL per types + the insert.
-- ============================================================================
create table if not exists public.technician_skills (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  technician_id uuid not null,
  user_id uuid not null,
  skill_type text not null,
  certification_level text,
  certification_number text,
  certification_expiry date,
  certified_by text,                  -- re-base: current types only
  issue_date date,                    -- re-base: current types only
  expiration_date date,               -- re-base: current types only (the other generation's spelling of certification_expiry; both kept)
  years_experience integer,
  is_active boolean not null default true,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id)
);

create index if not exists technician_skills_ws_tech_idx
  on public.technician_skills (workspace_id, technician_id);

alter table public.technician_skills enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_skills' and policyname = 'technician_skills_staff_select') then
    create policy technician_skills_staff_select on public.technician_skills
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_skills' and policyname = 'technician_skills_staff_insert') then
    create policy technician_skills_staff_insert on public.technician_skills
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_skills' and policyname = 'technician_skills_staff_update') then
    create policy technician_skills_staff_update on public.technician_skills
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'technician_skills' and policyname = 'technician_skills_staff_delete') then
    create policy technician_skills_staff_delete on public.technician_skills
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 14. time_clock_entries
-- Draft: 20261010000089. Every read keys by user_id (the technician's
-- auth id) — work-orders.ts tech-app routes, vehicles.ts, and the
-- BROWSER hook useTechShiftManagement.ts. There is NO direct insert in
-- the repo: writes flow through the clock_in RPC family (see
-- NEED-S4-4, shared with technician_clock_entries). clock_in/clock_out
-- stay TEXT: types and draft agree, and code string-compares and
-- orders them as ISO strings (flagged in the spec — a timestamptz
-- conversion is a future cleanup, not this pass). technician_id is a
-- PLAIN FK (not composite): the RPC writer cannot be shown to supply
-- a matching (workspace_id, technician_id) pair. RLS: canonical staff
-- set + a self-read arm for the browser hook.
-- ============================================================================
create table if not exists public.time_clock_entries (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id),
  user_id uuid not null,              -- the technician's auth user; every read filters it
  technician_id uuid references public.technicians(id),
  clock_in text,                      -- text per types + draft; code compares ISO strings
  clock_out text,
  break_start text,
  break_end text,
  status text,                        -- exercised values: 'active', 'on_break'
  total_hours numeric,
  regular_hours numeric,              -- re-base: current types + the time-clock client contract
  overtime_hours numeric,             -- re-base: current types + the time-clock client contract
  break_duration_minutes numeric,     -- re-base: current types; stamped by end_break (section 17)
  clock_in_location jsonb,            -- re-base: current types; stamped by clock_in from p_location objects
  clock_out_location jsonb,           -- re-base: current types; stamped by clock_out from p_location objects
  approved_by uuid,                   -- re-base: current types only (approval workflow; no writer in this pass)
  approved_at timestamptz,            -- re-base: current types only
  edit_reason text,                   -- re-base: current types only
  notes text,
  location_data jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists time_clock_entries_ws_user_in_idx
  on public.time_clock_entries (workspace_id, user_id, clock_in desc);

alter table public.time_clock_entries enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_clock_entries' and policyname = 'time_clock_entries_staff_select') then
    create policy time_clock_entries_staff_select on public.time_clock_entries
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_clock_entries' and policyname = 'time_clock_entries_staff_insert') then
    create policy time_clock_entries_staff_insert on public.time_clock_entries
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_clock_entries' and policyname = 'time_clock_entries_staff_update') then
    create policy time_clock_entries_staff_update on public.time_clock_entries
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_clock_entries' and policyname = 'time_clock_entries_staff_delete') then
    create policy time_clock_entries_staff_delete on public.time_clock_entries
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
  -- Self-read arm: the browser shift hook reads the tech's own entries
  -- as the tech, keyed by user_id.
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'time_clock_entries' and policyname = 'time_clock_entries_self_select') then
    create policy time_clock_entries_self_select on public.time_clock_entries
      for select to authenticated using (user_id = auth.uid());
  end if;
end $$;

-- ============================================================================
-- 15. dispatch_runs
-- Draft: 20261010000094, unioned with the exercised contract in
-- appointments.ts: the insert stamps workspace_id and writes
-- start_location + created_by (NEITHER in types/draft); the list read
-- selects total_distance_meters and total_travel_time_seconds (also
-- not in types) and filters .eq("user_id", userId) — a column the
-- insert never writes. Both distance spellings are carried (types'
-- total_distance + exercised total_distance_meters; flagged). The
-- paired code change resolves the user_id/created_by mismatch: the
-- insert also stamps user_id (see spec). van_id is a plain column —
-- FK owed to vans (Step 10), and the list read's vans(name) embed
-- depends on it (NEED-S4-3). status defaults 'draft' (the insert's
-- only value). run_date is text (types + code compare date strings).
-- ============================================================================
create table if not exists public.dispatch_runs (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  technician_id uuid not null,
  user_id uuid,                       -- legacy filter column on the list read; insert stamps it after the paired fix
  created_by uuid,                    -- exercised: the insert writes created_by = the caller's user id
  van_id uuid,                        -- FK owed -> vans(id) (Step 10)
  run_date text not null,
  status text not null default 'draft',
  start_location jsonb,               -- exercised insert/select; not in types/draft. Type assumed jsonb, flagged
  start_location_lat numeric,         -- exercised: the route-optimize handler reads them off the run row
  start_location_lng numeric,         -- exercised: same read; only the start pair is exercised
  end_location jsonb,
  end_location_lat numeric,           -- re-base: current types only (the end pair; only the start pair is exercised)
  end_location_lng numeric,           -- re-base: current types only
  route_polyline text,
  total_distance numeric,             -- types shape
  total_distance_meters numeric,      -- exercised list select
  total_duration_seconds integer,
  total_travel_time_seconds integer,  -- exercised list select
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workspace_id, id),
  foreign key (workspace_id, technician_id)
    references public.technicians (workspace_id, id)
);

create index if not exists dispatch_runs_workspace_date_idx
  on public.dispatch_runs (workspace_id, run_date);
create index if not exists dispatch_runs_workspace_tech_idx
  on public.dispatch_runs (workspace_id, technician_id);

alter table public.dispatch_runs enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_runs' and policyname = 'dispatch_runs_staff_select') then
    create policy dispatch_runs_staff_select on public.dispatch_runs
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_runs' and policyname = 'dispatch_runs_staff_insert') then
    create policy dispatch_runs_staff_insert on public.dispatch_runs
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_runs' and policyname = 'dispatch_runs_staff_update') then
    create policy dispatch_runs_staff_update on public.dispatch_runs
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'dispatch_runs' and policyname = 'dispatch_runs_staff_delete') then
    create policy dispatch_runs_staff_delete on public.dispatch_runs
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 16. route_stops — last in the family: its parents (dispatch_runs,
-- work_orders) must exist first.
-- Draft: 20261010000140. Tenancy is carried DIRECTLY (workspace_id NOT
-- NULL, stamped by the add-stop handler, which resolves the workspace
-- via requireStaffWorkspace before inserting) with a composite FK to
-- the parent run — the ruling's shape, chosen over the sync-logs
-- EXISTS-through-parent alternative (considered and set aside in the
-- spec; the exercised list read already scopes through the parent's
-- workspace join and keeps working either way).
-- Column union: selects use actual_arrival/actual_departure (types),
-- but the status PATCH writes arrival_time/departure_time (NOT in
-- types/draft) — both pairs are carried; the split is flagged in the
-- spec as an exercised inconsistency, not silently resolved.
-- ============================================================================
create table if not exists public.route_stops (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null,
  dispatch_run_id uuid not null,
  work_order_id uuid not null references public.work_orders(id),
  sequence_order integer not null,
  status text not null default 'pending',  -- the insert's only value
  estimated_arrival timestamptz,
  actual_arrival timestamptz,
  estimated_departure timestamptz,
  actual_departure timestamptz,
  arrival_time timestamptz,           -- exercised: the status PATCH writes it; not in types/draft
  departure_time timestamptz,         -- exercised: the status PATCH writes it; not in types/draft
  estimated_duration_minutes integer,
  actual_duration_minutes integer,
  distance_to_next_meters integer,    -- exercised: the route-optimize handler writes it; not in types/draft
  travel_time_to_next_seconds integer, -- exercised: the route-optimize handler writes it; not in types/draft
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (workspace_id, dispatch_run_id)
    references public.dispatch_runs (workspace_id, id)
);

create index if not exists route_stops_ws_run_seq_idx
  on public.route_stops (workspace_id, dispatch_run_id, sequence_order);

alter table public.route_stops enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'route_stops' and policyname = 'route_stops_staff_select') then
    create policy route_stops_staff_select on public.route_stops
      for select to authenticated using (public.is_workspace_staff(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'route_stops' and policyname = 'route_stops_staff_insert') then
    create policy route_stops_staff_insert on public.route_stops
      for insert to authenticated with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'route_stops' and policyname = 'route_stops_staff_update') then
    create policy route_stops_staff_update on public.route_stops
      for update to authenticated using (public.is_workspace_writer(workspace_id))
      with check (public.is_workspace_writer(workspace_id));
  end if;
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'route_stops' and policyname = 'route_stops_staff_delete') then
    create policy route_stops_staff_delete on public.route_stops
      for delete to authenticated using (public.is_workspace_writer(workspace_id));
  end if;
end $$;

-- ============================================================================
-- 17. Family RPCs — AUTHORED FRESH (header deviation 2). Production
-- captures (2026-11-10) prove none of these exist in prod; the repo's
-- reverse-engineered stubs (20261010000166/167/176/180/239) only RAISE.
-- Bodies are written under the exact types.ts signatures from the
-- code-exercised contract, SECURITY INVOKER per the Step 3
-- log_cash_drawer_event precedent, so the tables' RLS above governs
-- every write these functions make.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 17a. clock_in / clock_out / start_break / end_break — the time-clock
-- family (work-orders.ts: the /v1/time-clock/* routes and the
-- /v1/tech-app/clock-in|out routes).
--
-- Exercised contract:
--   clock_in(p_location jsonb = null) RETURNS text — the open entry's
--     id; both handlers return the value verbatim and otherwise only
--     check the error.
--   clock_out(p_location jsonb = null) RETURNS void — closes the
--     caller's open entry and stamps total_hours.
--   start_break() / end_break() RETURNS void — flip the open entry's
--     break window and status ('on_break' / 'active'; the status
--     vocabulary is exercised by the table's readers).
--
-- Write target is time_clock_entries ONLY: it is the table whose reads
-- sit in the same route family as these calls (GET /v1/time-clock
-- reads it by user_id directly above the clock routes; the browser
-- shift hook useTechShiftManagement reads it by user_id).
-- technician_clock_entries' writer stays UNIDENTIFIED (NEED-S4-4
-- remainder, the operational_jobs NEED-S4-5 pattern): the dispatch
-- mobile-state bundle reads it tolerantly — empty until a writer is
-- pinned — and no dual-write is invented here.
--
-- Clock stamps are TEXT in ISO-8601 UTC with the 'T' separator: the
-- readers string-compare them against Date.toISOString() output
-- (.gte("clock_in", startOfDay.toISOString())). A timestamptz::text
-- rendering (space separator) would sort BEFORE the 'T' form and
-- silently drop same-day rows from those reads.
--
-- Workspace resolution: the caller's own technicians row
-- (auth_user_id = auth.uid(), readable through the
-- technicians_self_select arm above) names workspace + technician.
-- With no technician row, the caller's ACTIVE workspace_members rows
-- must number exactly one — zero or several fails loud (the legacy
-- single-shop assumption, stated rather than hidden; same rule as
-- Step 3's authored function). A technician with rows in several
-- workspaces likewise fails loud instead of guessing a shop
-- (NEED-S4-10's hazard, surfaced at the write).
--
-- Locations: object-shaped p_location payloads land in the typed
-- clock_in_location / clock_out_location columns (the time-clock
-- client's {lat, lng} contract) as well as the generic location_data
-- column the design carried; scalar payloads (the /v1/time-clock
-- route passes a plain string) land in location_data only.
-- ----------------------------------------------------------------------------
create or replace function public.clock_in(p_location jsonb default null)
returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workspace_id uuid;
  v_technician_id uuid;
  v_tech_rows integer;
  v_memberships integer;
  v_entry_id uuid;
  v_now_text text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  -- Already clocked in: return the open entry rather than stacking a
  -- second open row (GET /v1/time-clock defines "current" as an entry
  -- with clock_out null; duplicates would corrupt that read).
  select id into v_entry_id
  from public.time_clock_entries
  where user_id = v_user and clock_out is null
  order by clock_in desc
  limit 1;
  if v_entry_id is not null then
    return v_entry_id::text;
  end if;

  select count(*), min(t.workspace_id), min(t.id)
    into v_tech_rows, v_workspace_id, v_technician_id
  from public.technicians t
  where t.auth_user_id = v_user;

  if v_tech_rows is null or v_tech_rows = 0 then
    v_technician_id := null;
    select count(*), min(wm.workspace_id)
      into v_memberships, v_workspace_id
    from public.workspace_members wm
    where wm.user_id = v_user and wm.is_active;
    if v_memberships is null or v_memberships <> 1 then
      raise exception 'Clock-in workspace is ambiguous for this caller';
    end if;
  elsif v_tech_rows > 1 then
    raise exception 'Clock-in workspace is ambiguous for this caller';
  end if;

  insert into public.time_clock_entries (
    workspace_id, user_id, technician_id, clock_in, status, location_data,
    clock_in_location
  ) values (
    v_workspace_id, v_user, v_technician_id, v_now_text, 'active', p_location,
    -- The typed location columns carry object-shaped locations (the
    -- {lat, lng} contract of the time-clock client); a scalar payload
    -- (the /v1/time-clock route passes a plain string) lands only in
    -- the generic location_data column.
    case when jsonb_typeof(p_location) = 'object' then p_location end
  )
  returning id into v_entry_id;

  return v_entry_id::text;
end;
$$;

create or replace function public.clock_out(p_location jsonb default null)
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_entry_id uuid;
  v_clock_in text;
  v_now_text text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select id, clock_in into v_entry_id, v_clock_in
  from public.time_clock_entries
  where user_id = v_user and clock_out is null
  order by clock_in desc
  limit 1;

  -- No open entry: the exercised callers assert a state, they do not
  -- command a transition with a failure mode — succeed quietly.
  if v_entry_id is null then
    return;
  end if;

  update public.time_clock_entries
    set clock_out = v_now_text,
        status = 'completed',
        total_hours = round(
          (extract(epoch from (v_now_text::timestamptz - v_clock_in::timestamptz)) / 3600.0)::numeric,
          2
        ),
        clock_out_location = case
          when jsonb_typeof(p_location) = 'object' then p_location
          else clock_out_location
        end,
        updated_at = now()
    where id = v_entry_id;
end;
$$;

create or replace function public.start_break()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_entry_id uuid;
  v_now_text text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select id into v_entry_id
  from public.time_clock_entries
  where user_id = v_user and clock_out is null and break_start is null
  order by clock_in desc
  limit 1;

  if v_entry_id is null then
    return;
  end if;

  update public.time_clock_entries
    set break_start = v_now_text,
        status = 'on_break',
        updated_at = now()
    where id = v_entry_id;
end;
$$;

create or replace function public.end_break()
returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_entry_id uuid;
  v_break_start text;
  v_now_text text := to_char(timezone('utc', now()), 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;

  select id, break_start into v_entry_id, v_break_start
  from public.time_clock_entries
  where user_id = v_user and clock_out is null
    and break_start is not null and break_end is null
  order by clock_in desc
  limit 1;

  if v_entry_id is null then
    return;
  end if;

  update public.time_clock_entries
    set break_end = v_now_text,
        status = 'active',
        break_duration_minutes = round(
          (extract(epoch from (v_now_text::timestamptz - v_break_start::timestamptz)) / 60.0)::numeric,
          2
        ),
        updated_at = now()
    where id = v_entry_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- 17b. create_team_os_technician_v1 — the create-with-invite route
-- (work-orders.ts POST /v1/tech-os/technicians/create-with-invite).
--
-- Exercised contract: args (p_email, p_name, p_phone, p_profile,
-- p_role, p_send_invite) per types.ts; returns jsonb of which the
-- route reads invitation_token / email / name, and the client type
-- pins technician_id. The insert stamps user_id = auth.uid() and the
-- caller's workspace (active memberships must number exactly one —
-- the Step 3 rule) — the direct-insert sibling route takes user_id
-- from its request body for the same column; the RPC path has no body
-- user, so the caller IS the owner key.
--
-- p_profile is the route's zod record bag of extra profile fields.
-- It is read key-by-key against columns that exist on the translated
-- table — never splatted into the insert — so a stray or hostile key
-- can neither break the insert nor smuggle tenancy keys (workspace_id
-- and user_id in the bag are ignored by construction). Numeric/date
-- profile values arrive as JSON scalars or strings and are cast
-- through nullif so an empty string cannot become a bogus value; a
-- genuinely uncastable value raises instead of storing garbage.
--
-- Invitation: when p_send_invite is set, invited_at is stamped and a
-- token is generated and RETURNED (the route hands it straight to
-- the invite-team-member edge function). Token persistence and the
-- acceptance flow belong to the deferred team_invitations family —
-- no invitations table exists in this pass, and none is invented
-- here (see header deviation 3).
--
-- Seat limits are NOT enforced here: the one seat mechanism proven in
-- prod is the workspace_members entitlement trigger (captures,
-- 2026-11-10). The technicians-side 'seat_limit_reached' error string
-- the direct-insert route handles has no proven prod source; no
-- limit is invented in this body (carried NEED-S4-4 remainder).
-- ----------------------------------------------------------------------------
create or replace function public.create_team_os_technician_v1(
  p_email text default null,
  p_name text,
  p_phone text default null,
  p_profile jsonb default null,
  p_role text default null,
  p_send_invite boolean default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_workspace_id uuid;
  v_memberships integer;
  v_profile jsonb := coalesce(p_profile, '{}'::jsonb);
  v_trimmed_name text := btrim(coalesce(p_name, ''));
  v_first_name text;
  v_last_name text;
  v_technician_id uuid;
  v_token text;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if v_trimmed_name = '' then
    raise exception 'technician_name_required';
  end if;

  select count(*), min(wm.workspace_id)
    into v_memberships, v_workspace_id
  from public.workspace_members wm
  where wm.user_id = v_user and wm.is_active;

  if v_memberships is null or v_memberships <> 1 then
    raise exception 'Technician-create workspace is ambiguous for this caller';
  end if;

  v_first_name := split_part(v_trimmed_name, ' ', 1);
  v_last_name := nullif(btrim(substr(v_trimmed_name, length(v_first_name) + 1)), '');

  insert into public.technicians (
    workspace_id, user_id, name, first_name, last_name,
    email, phone, role,
    address, city, state, zip_code, country,
    hire_date, employment_type, employee_id,
    hourly_rate, salary, pay_type, payroll_type,
    skills, certifications,
    emergency_contact_name, emergency_contact_phone, emergency_contact_relationship,
    drivers_license_number, drivers_license_state,
    notes, invited_at
  ) values (
    v_workspace_id, v_user, v_trimmed_name, v_first_name, v_last_name,
    p_email, p_phone, p_role,
    v_profile ->> 'address', v_profile ->> 'city', v_profile ->> 'state',
    v_profile ->> 'zip_code', v_profile ->> 'country',
    nullif(v_profile ->> 'hire_date', '')::date,
    v_profile ->> 'employment_type', v_profile ->> 'employee_id',
    nullif(v_profile ->> 'hourly_rate', '')::numeric,
    nullif(v_profile ->> 'salary', '')::numeric,
    v_profile ->> 'pay_type', v_profile ->> 'payroll_type',
    case when jsonb_typeof(v_profile -> 'skills') = 'array'
      then array(select jsonb_array_elements_text(v_profile -> 'skills')) end,
    case when jsonb_typeof(v_profile -> 'certifications') = 'object'
      then v_profile -> 'certifications' end,
    v_profile ->> 'emergency_contact_name',
    v_profile ->> 'emergency_contact_phone',
    v_profile ->> 'emergency_contact_relationship',
    v_profile ->> 'drivers_license_number',
    v_profile ->> 'drivers_license_state',
    v_profile ->> 'notes',
    case when coalesce(p_send_invite, false) then now() end
  )
  returning id into v_technician_id;

  if coalesce(p_send_invite, false) then
    v_token := replace(gen_random_uuid()::text, '-', '')
            || replace(gen_random_uuid()::text, '-', '');
  end if;

  return jsonb_build_object(
    'technician_id', v_technician_id,
    'name', v_trimmed_name,
    'email', p_email,
    'invitation_token', v_token
  );
end;
$$;

revoke all on function public.clock_in(jsonb) from public, anon;
grant execute on function public.clock_in(jsonb) to authenticated, service_role;
revoke all on function public.clock_out(jsonb) from public, anon;
grant execute on function public.clock_out(jsonb) to authenticated, service_role;
revoke all on function public.start_break() from public, anon;
grant execute on function public.start_break() to authenticated, service_role;
revoke all on function public.end_break() from public, anon;
grant execute on function public.end_break() to authenticated, service_role;
revoke all on function public.create_team_os_technician_v1(text, text, text, jsonb, text, boolean) from public, anon;
grant execute on function public.create_team_os_technician_v1(text, text, text, jsonb, text, boolean) to authenticated, service_role;

commit;
