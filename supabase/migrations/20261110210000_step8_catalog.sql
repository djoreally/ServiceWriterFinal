-- ============================================================================
-- Service Writer reconciliation pass — Step 8: Catalog, Pricing &
-- Services (addendum 2026-11-05 FINAL section 6 step 8). Built from the
-- recon-pass design pair (step8-catalog.sql + step8-catalog-spec.md)
-- under TENANCY-RULING.md: full workspace translation, paired code
-- changes in the same PR. The design SQL is carried verbatim except for
-- the one addition named here:
--
-- ADDITION (not in the design file): the four FKs Steps 6+7 owed to this
-- step, added at the end of this file now that services exists —
-- review_requests.service_id, testimonials.service_id,
-- service_reminders.last_service_id,
-- retention_vehicle_profiles.last_service_id, all REFERENCES
-- public.services(id) ON DELETE SET NULL (the family's pointer-column
-- idiom; the Step 6+7 migration named these as owed to Step 8 without
-- fixing an action). Guarded by pg_constraint checks so the file stays
-- idempotent. The review_requests FK is also what makes the review
-- dashboard's services:service_id embed resolve.
-- ============================================================================
-- BACKEND RECONCILIATION — STEP 8: CATALOG, PRICING & SERVICES (11 tables)
-- services, service_images, service_catalog_parts, service_catalog_benchmarks,
-- service_playbooks, service_playbook_templates, shop_pricing_rules,
-- benchmark_pricing, quote_requests, price_quote_requests, recurring_services.
--
-- All 11 verified ABSENT from production (pre-census, 2026-11-09: 92 of the
-- Bucket-(i) 95 still absent; none of these 11 among the 3 already present).
-- Pure schema; every table starts empty; no data loads in this step.
--
-- TENANCY — THE NOV 9 RULING (recon-pass/TENANCY-RULING.md) governs this step:
-- full workspace translation. Every tenant table is created workspace-shaped
-- (workspace_id NOT NULL + FK to public.workspaces) and the exercising code
-- changes in the paired code step (see step8-catalog-spec.md). The Nov 5
-- addendum's `services` exception (create as-exercised, user_id-keyed) is
-- RETIRED by the ruling: services is translated like everything else, and
-- its user_id column is NOT created — workspace_id is the sole tenant key.
-- Three NAMED EXCEPTIONS, each with its evidence in the spec:
--   * benchmark_pricing        — global reference data (no tenancy anywhere
--                                in draft, types, or code; unfiltered reads).
--   * service_playbook_templates — global reference data (system catalog;
--                                sole reader is the admin-client seed).
--   * price_quote_requests     — pre-tenancy platform operational table:
--                                no tenancy key exists in ANY contract
--                                source (absent from generated types;
--                                4-column draft; unfiltered routes; writer
--                                is an out-of-repo edge function). Created
--                                exactly as contracted; ownership model is
--                                an open NEED in the spec, not invented here.
--
-- CONTRACT METHOD (the Nov 5 sync-pair method, per the approved addendum):
-- each shape = the generated types (src/integrations/supabase/types.ts)
-- cross-checked against every .from() payload in the exercising routes,
-- with the Oct 10 reverse-engineered migration drafts as the starting
-- sketch. Where draft and code/types disagreed, CODE/TYPES WON; every
-- disagreement is logged in step8-catalog-spec.md.
--
-- RLS IDIOM: the canonical workspace posture of the present sibling
-- service_catalog (20260907151500_split_staff_read_write_rls.sql): per-table
-- <table>_staff_select (is_workspace_staff) + _staff_insert / _staff_update /
-- _staff_delete (is_workspace_writer), policies dropped-if-exists then
-- created, exactly as in 20261105224500_provider_sync_tables.sql. Where a
-- table's traffic runs on the service-role (admin) client, the policies are
-- the Data-API boundary defense and the server-side membership gate in the
-- paired code step is the operative check — both are specified.
--
-- Guarding style: CREATE TABLE/INDEX IF NOT EXISTS; DROP POLICY IF EXISTS
-- before CREATE POLICY. No CHECK constraints on status/vocabulary columns
-- (idiom: vocabularies live in code). updated_at gets DEFAULT now() where
-- types mark it Insert-optional (the original default was real; values
-- reconstructed only for timestamps — see spec §5 for the two places a
-- non-timestamp default could not be honestly reconstructed and was left
-- off, loudly).
--
-- Additive only. Idempotent — safe to re-run in the SQL Editor.
-- ============================================================================
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- shop_pricing_rules — per-workspace pricing rule store. ALREADY CANONICAL:
-- the one table in this family whose draft, route, and contract all agree.
-- work-orders.ts GET /v1/shop-pricing (:1208) parses ?workspace_id= (uuid),
-- selects rule_key,value,workspace_id filtered by it; PUT (:1217) upserts
-- {workspace_id, rule_key, value} onConflict "workspace_id,rule_key".
-- Absent from generated types — draft + route are the whole contract.
-- Created essentially as drafted; only the policy names are normalized to
-- the canonical <table>_staff_* pattern (policy names are not a contract
-- any code reads). ZERO code changes in the paired step.
-- ---------------------------------------------------------------------------
create table if not exists public.shop_pricing_rules (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  rule_key text not null,
  value jsonb,
  is_system boolean,
  created_by uuid,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint shop_pricing_rules_workspace_rule_key unique (workspace_id, rule_key)
);

create index if not exists shop_pricing_rules_workspace_idx
  on public.shop_pricing_rules (workspace_id);

alter table public.shop_pricing_rules enable row level security;

drop policy if exists shop_pricing_rules_staff_select on public.shop_pricing_rules;
create policy shop_pricing_rules_staff_select
  on public.shop_pricing_rules for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists shop_pricing_rules_staff_insert on public.shop_pricing_rules;
create policy shop_pricing_rules_staff_insert
  on public.shop_pricing_rules for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists shop_pricing_rules_staff_update on public.shop_pricing_rules;
create policy shop_pricing_rules_staff_update
  on public.shop_pricing_rules for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists shop_pricing_rules_staff_delete on public.shop_pricing_rules;
create policy shop_pricing_rules_staff_delete
  on public.shop_pricing_rules for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- benchmark_pricing — GLOBAL REFERENCE DATA (NAMED EXCEPTION to workspace
-- tenancy). work-orders.ts GET /v1/repair-pricing/benchmarks (:1239) reads
-- select * with NO filter for any authenticated user; POST (:1246) inserts
-- {service_name, vehicle_type, low_price, average_price, high_price,
-- data_source: "ServiceWriter benchmarks"}. No tenancy column exists in the
-- draft, the code, or anywhere else (the table is absent from generated
-- types entirely). No in-repo client caller for either endpoint was found.
-- The draft enabled RLS with NO policies, which would make both live
-- endpoints return empty / fail — corrected here per the step-2
-- message_bundles precedent: global catalogs get an authenticated-read
-- policy. POST also runs on the RLS user client, so an authenticated
-- insert policy is required for the exercised write to work at all.
-- ---------------------------------------------------------------------------
create table if not exists public.benchmark_pricing (
  id uuid primary key default gen_random_uuid(),
  service_name text,
  vehicle_type text,
  low_price numeric,
  average_price numeric,
  high_price numeric,
  data_source text,
  created_at timestamptz default now()
);

alter table public.benchmark_pricing enable row level security;

drop policy if exists benchmark_pricing_select_authenticated on public.benchmark_pricing;
create policy benchmark_pricing_select_authenticated
  on public.benchmark_pricing for select to authenticated
  using (true);

drop policy if exists benchmark_pricing_insert_authenticated on public.benchmark_pricing;
create policy benchmark_pricing_insert_authenticated
  on public.benchmark_pricing for insert to authenticated
  with check (true);

-- ---------------------------------------------------------------------------
-- service_playbook_templates — GLOBAL REFERENCE DATA (NAMED EXCEPTION).
-- System template catalog: no tenancy column in draft or types. Sole
-- reader: the playbook seed (platform.ts :4051) on the ADMIN client,
-- filtering is_active, ordering sort_order — RLS is bypassed there, so
-- this table follows the step-2 webhook_event_logs posture: RLS enabled,
-- NO authenticated policies (service-role only). The table starts EMPTY:
-- the seed endpoint returns 0 until a separate DATA step loads templates
-- (owed, named in the spec — not part of this schema pass).
-- ---------------------------------------------------------------------------
create table if not exists public.service_playbook_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  service_category text not null,
  steps jsonb not null,
  is_active boolean not null default true,
  sort_order numeric not null default 0,
  created_at timestamptz not null default now()
);

-- Serves the seed read (is_active filter, sort_order order).
create index if not exists service_playbook_templates_active_sort_idx
  on public.service_playbook_templates (is_active, sort_order);

alter table public.service_playbook_templates enable row level security;
-- No policies by design: service-role access only (see header).

-- ---------------------------------------------------------------------------
-- services — the family's hard case: the legacy service-history table,
-- translated per the Nov 9 ruling (the addendum's create-as-exercised
-- exception is retired). Shape = generated types Row (46 columns) with
-- user_id REPLACED by workspace_id, cross-checked against all four read
-- sites (no in-repo writer exists):
--   * work-orders.ts GET /v1/services (:1093) + GET /v1/services/:id
--     (:1102) — explicit 16-column select, tenant filter, created_at desc.
--   * work-orders.ts GET /v1/tech-app/job-detail (:1916) — select *,
--     filter appointment_id (maybeSingle).
--   * vehicles.ts POST /v1/vehicle-recommendations/generate (:1991) —
--     select *, filter vehicle_id, order service_date desc; consumes
--     service_type, description, service_date.
-- Four columns the types/draft DO NOT have are selected by the /v1/services
-- pair and are created because the exercised contract wins (spec §1.1):
-- title text, estimated_cost numeric, metadata jsonb (canonical metadata
-- idiom: NOT NULL DEFAULT '{}'), assigned_technician text (TYPE UNCERTAIN —
-- nothing writes or joins it anywhere in the repo; text accepts either a
-- name or an id string; flagged in the spec).
-- import_batch_id keeps its column but gets NO foreign key: its target
-- import_batches is a Bucket-(iii) DEFER name, absent and not in this
-- pass (step-2 precedent: email_queue.service_id). Owed FK, flagged.
-- data_origin follows the canonical-migration precedent
-- (20260826210000_reconcile_legacy_contracts.sql: text NOT NULL DEFAULT
-- 'manual'); the types' enum vocabulary (system_created | legacy_import |
-- integration) is recorded in the column comment — no enum type, no CHECK.
-- status and service_date are NOT NULL with no default: types mark both
-- Insert-optional (a default existed) but its value is not recoverable
-- from any source; a guessed default would silently mislabel rows, a
-- missing one fails loudly for a writer. Flagged in spec §5.
-- ---------------------------------------------------------------------------
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  appointment_id uuid references public.appointments(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  vehicle_id uuid references public.vehicles(id) on delete set null,
  import_batch_id uuid,
  title text,
  description text not null,
  service_type text not null,
  service_date text not null,
  status text not null,
  data_origin text not null default 'manual',
  origin_source text,
  service_number text,
  technician text,
  assigned_technician text,
  started_at timestamptz,
  completed_at timestamptz,
  duration_minutes integer,
  mileage numeric,
  odometer_measure text,
  license_plate text,
  vin_captured text,
  vehicle_year numeric,
  vehicle_make text,
  vehicle_model text,
  vehicle_trim text,
  vehicle_engine text,
  oil_quarts_used numeric,
  parts_used text,
  notes text,
  estimated_cost numeric,
  labor_cost numeric,
  labor_hours numeric,
  parts_cost numeric,
  shop_supplies numeric,
  discount_amount numeric,
  discount_type text,
  tax_rate numeric,
  tax_amount numeric,
  total_cost numeric not null,
  paid_amount numeric,
  payment_status text,
  metadata jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  deleted_by uuid,
  deleted_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on column public.services.data_origin is
  'Vocabulary (from the retired data_origin_type enum contract): system_created | legacy_import | integration | manual. Text by canonical precedent; no CHECK.';
comment on column public.services.import_batch_id is
  'FK to import_batches intentionally omitted: target is a Bucket-(iii) deferred table, absent from production. Owed if import_batches is ever created.';

-- Serves GET /v1/services (workspace list, newest first).
create index if not exists services_workspace_created_idx
  on public.services (workspace_id, created_at desc);
-- Serves vehicle-recommendations history read (workspace + vehicle, newest service first).
create index if not exists services_workspace_vehicle_date_idx
  on public.services (workspace_id, vehicle_id, service_date desc);
-- Serves tech-app job-detail (appointment lookup).
create index if not exists services_appointment_idx
  on public.services (appointment_id);

alter table public.services enable row level security;

drop policy if exists services_staff_select on public.services;
create policy services_staff_select
  on public.services for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists services_staff_insert on public.services;
create policy services_staff_insert
  on public.services for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists services_staff_update on public.services;
create policy services_staff_update
  on public.services for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists services_staff_delete on public.services;
create policy services_staff_delete
  on public.services for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- service_images — photos attached to a services row. Contract = types +
-- draft + platform.ts handlers (:4236 GET by service_id order sort_order;
-- :4251 POST multipart insert; :4278 DELETE by id), ALL on the admin
-- client — RLS is bypassed in live traffic; the policies below are the
-- Data-API boundary, and the paired code step adds the server-side
-- membership gate. user_id is KEPT as a stamped actor column because the
-- exercised insert writes it (it is not the tenant key); workspace_id is
-- added as the tenant key, derived by the POST handler from the parent
-- services row (the FK guarantees the parent exists). FK to services —
-- created above in this same transaction.
-- ---------------------------------------------------------------------------
create table if not exists public.service_images (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null,
  service_id uuid not null references public.services(id) on delete cascade,
  image_url text not null,
  caption text,
  image_type text,
  sort_order numeric,
  created_at timestamptz not null default now()
);

-- Serves the GET (service's images in display order).
create index if not exists service_images_service_sort_idx
  on public.service_images (service_id, sort_order);
create index if not exists service_images_workspace_idx
  on public.service_images (workspace_id);

alter table public.service_images enable row level security;

drop policy if exists service_images_staff_select on public.service_images;
create policy service_images_staff_select
  on public.service_images for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists service_images_staff_insert on public.service_images;
create policy service_images_staff_insert
  on public.service_images for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_images_staff_update on public.service_images;
create policy service_images_staff_update
  on public.service_images for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_images_staff_delete on public.service_images;
create policy service_images_staff_delete
  on public.service_images for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- service_catalog_parts — which inventory items a catalog service consumes.
-- Sole in-repo reader: appointments.ts reserve-parts (:1976) on the
-- OPTIONAL-AUTH client — bearer token -> that user's RLS client; NO token
-- -> the ANONYMOUS client ("same as the browser", public booking). It
-- selects inventory_item_id, quantity, use_vehicle_oil_capacity, unit,
-- is_required filtered .in("service_catalog_id", ids from the booking).
-- NO writer exists in this repo (the catalog-admin surface is elsewhere —
-- NEED in the spec): workspace_id is therefore fully derivative of the
-- parent catalog row, and the owed writer must stamp it from the parent.
-- RLS consequence, decided deliberately (spec §1.3): staff policies alone
-- would silently degrade public booking to "no_parts_configured" skips
-- for anonymous AND logged-in non-staff customers, so a public SELECT
-- policy exposes parts only through ACTIVE parent catalog items — the
-- same public surface the catalog itself presents (its own public reads
-- go through the get_public_service_catalog_v2 RPC over active items).
-- Part rows carry quantities/units only — no prices, no PII.
-- ---------------------------------------------------------------------------
create table if not exists public.service_catalog_parts (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid not null references public.service_catalog(id),
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity numeric,
  is_required boolean not null default true,
  use_vehicle_oil_capacity boolean not null default false,
  unit text not null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serves the reserve-parts read (parts for a set of catalog ids).
create index if not exists service_catalog_parts_catalog_idx
  on public.service_catalog_parts (service_catalog_id);
create index if not exists service_catalog_parts_workspace_catalog_idx
  on public.service_catalog_parts (workspace_id, service_catalog_id);

alter table public.service_catalog_parts enable row level security;

drop policy if exists service_catalog_parts_staff_select on public.service_catalog_parts;
create policy service_catalog_parts_staff_select
  on public.service_catalog_parts for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists service_catalog_parts_staff_insert on public.service_catalog_parts;
create policy service_catalog_parts_staff_insert
  on public.service_catalog_parts for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_catalog_parts_staff_update on public.service_catalog_parts;
create policy service_catalog_parts_staff_update
  on public.service_catalog_parts for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_catalog_parts_staff_delete on public.service_catalog_parts;
create policy service_catalog_parts_staff_delete
  on public.service_catalog_parts for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- Public booking read path: parts are visible only through an active
-- parent catalog item (see header). Applies to anon and authenticated.
drop policy if exists service_catalog_parts_public_select on public.service_catalog_parts;
create policy service_catalog_parts_public_select
  on public.service_catalog_parts for select to anon, authenticated
  using (exists (
    select 1 from public.service_catalog sc
    where sc.id = service_catalog_parts.service_catalog_id
      and sc.is_active = true
  ));

-- ---------------------------------------------------------------------------
-- service_catalog_benchmarks — per-shop captured market benchmarks for a
-- catalog service (the SHOP pair of the pricing family; NOT the global
-- benchmark_pricing table — work-orders.ts :2596 comment). GET (:2604)
-- select * order captured_at desc; POST (:2612) upserts the zod body
-- onConflict "service_catalog_id,vin" — the draft carried NO unique
-- constraint for that conflict target, so the exercised upsert would
-- error against the draft shape: the UNIQUE below is code-required
-- (flagged in the spec; Postgres treats NULL vins as distinct, so
-- null-vin saves accumulate instead of deduping — exercised semantics,
-- carried as-is and flagged, not silently redesigned).
-- user_id (the draft/types tenant key) is replaced by workspace_id per
-- the ruling; the paired code step re-keys the route and its client.
-- ---------------------------------------------------------------------------
create table if not exists public.service_catalog_benchmarks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid not null references public.service_catalog(id) on delete cascade,
  vin text,
  vehicle_label text,
  repair_title text not null,
  independent_low numeric not null,
  independent_avg numeric not null,
  independent_high numeric not null,
  dealer_low numeric not null,
  dealer_avg numeric not null,
  dealer_high numeric not null,
  shop_price numeric,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_catalog_benchmarks_catalog_vin_key unique (service_catalog_id, vin)
);

-- Serves the GET (workspace benchmarks, newest capture first).
create index if not exists service_catalog_benchmarks_workspace_captured_idx
  on public.service_catalog_benchmarks (workspace_id, captured_at desc);

alter table public.service_catalog_benchmarks enable row level security;

drop policy if exists service_catalog_benchmarks_staff_select on public.service_catalog_benchmarks;
create policy service_catalog_benchmarks_staff_select
  on public.service_catalog_benchmarks for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists service_catalog_benchmarks_staff_insert on public.service_catalog_benchmarks;
create policy service_catalog_benchmarks_staff_insert
  on public.service_catalog_benchmarks for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_catalog_benchmarks_staff_update on public.service_catalog_benchmarks;
create policy service_catalog_benchmarks_staff_update
  on public.service_catalog_benchmarks for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_catalog_benchmarks_staff_delete on public.service_catalog_benchmarks;
create policy service_catalog_benchmarks_staff_delete
  on public.service_catalog_benchmarks for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- service_playbooks — per-workspace how-to playbooks, optionally attached
-- to a catalog service. Contract = types + platform.ts handlers (:4001
-- GET with service_catalog embed, :4014 POST, :4030 PATCH, :4042 DELETE,
-- :4051 seed), ALL on the ADMIN client with code-level scoping today
-- ("User-scoped like the marketplace dashboard", section header :3989).
-- Translation replaces the user scope with the workspace scope: tenant
-- key workspace_id; the paired code step swaps requirePlaybookUser for a
-- membership gate before any admin-client access (spec §2). steps gets
-- DEFAULT '[]'::jsonb (types mark it Insert-optional; the empty-array
-- reconstruction follows the repo's jsonb-default idiom — flagged).
-- ---------------------------------------------------------------------------
create table if not exists public.service_playbooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid references public.service_catalog(id) on delete set null,
  name text not null,
  description text,
  steps jsonb not null default '[]'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serves the list read (workspace playbooks, newest first).
create index if not exists service_playbooks_workspace_created_idx
  on public.service_playbooks (workspace_id, created_at desc);

alter table public.service_playbooks enable row level security;

drop policy if exists service_playbooks_staff_select on public.service_playbooks;
create policy service_playbooks_staff_select
  on public.service_playbooks for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists service_playbooks_staff_insert on public.service_playbooks;
create policy service_playbooks_staff_insert
  on public.service_playbooks for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_playbooks_staff_update on public.service_playbooks;
create policy service_playbooks_staff_update
  on public.service_playbooks for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists service_playbooks_staff_delete on public.service_playbooks;
create policy service_playbooks_staff_delete
  on public.service_playbooks for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- quote_requests — public quote requests landing in a shop's inbox (the
-- SHOP pair; guest PII: name/email/phone — the staff-only RLS below is
-- the protection). In-repo surface: work-orders.ts GET
-- /v1/repair-pricing/shop-quote-requests (:2632, select * order
-- created_at desc limit 200) + PATCH (:2640, {status,
-- converted_quote_id?} by id), client repair-pricing.query.ts. The
-- WRITER is the out-of-repo `public-quote-request` edge function,
-- invoked by POST /v1/repair-pricing/public-quote-requests (:1284) with
-- a businessUserId — under a workspace_id NOT NULL create it must derive
-- and write the workspace (in-repo precedent for the derivation: the
-- detailing public-rules route resolves workspaces via
-- workspaces.created_by). That function change is a named NEED in the
-- spec; nothing regresses meanwhile (the table does not exist today, so
-- submissions already fail). status DEFAULT 'new' is evidenced by the
-- client status union ("new" | "contacted" | "quoted" | "won" |
-- "lost"); pricing_tier vocabulary = "independent" | "dealer"
-- (src/domain/pricing/repair-estimate.ts PricingTier) — no CHECK.
-- ---------------------------------------------------------------------------
create table if not exists public.quote_requests (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  guest_name text,
  guest_email text,
  guest_phone text,
  vehicle_year numeric,
  vehicle_make text,
  vehicle_model text,
  vin text,
  repair_title text,
  pricing_tier text not null,
  source text not null,
  status text not null default 'new',
  notes text,
  estimate_low numeric,
  estimate_avg numeric,
  estimate_high numeric,
  shop_price numeric,
  converted_quote_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serves the inbox read (workspace requests, newest first).
create index if not exists quote_requests_workspace_created_idx
  on public.quote_requests (workspace_id, created_at desc);

alter table public.quote_requests enable row level security;

drop policy if exists quote_requests_staff_select on public.quote_requests;
create policy quote_requests_staff_select
  on public.quote_requests for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists quote_requests_staff_insert on public.quote_requests;
create policy quote_requests_staff_insert
  on public.quote_requests for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists quote_requests_staff_update on public.quote_requests;
create policy quote_requests_staff_update
  on public.quote_requests for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists quote_requests_staff_delete on public.quote_requests;
create policy quote_requests_staff_delete
  on public.quote_requests for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- price_quote_requests — PRE-TENANCY PLATFORM TABLE (NAMED EXCEPTION).
-- The platform pair of the pricing family, per the work-orders.ts :2596
-- comment. The entire surviving contract is: a 4-column draft (absent
-- from generated types — no types entry exists), GET
-- /v1/repair-pricing/quote-requests (:1263, select * order created_at
-- desc limit 100, NO filter of any kind), PATCH (:1271, {status,
-- quoted_price?} by id), and the same out-of-repo `public-quote-request`
-- edge function as the presumed writer (which of the pair it writes is
-- genuinely ambiguous from this repo — spec §4, NEED 3). No tenancy key
-- exists in any source and no caller supplies one, so none is invented:
-- created exactly as drafted. RLS is enabled with authenticated
-- SELECT/UPDATE policies matching the exercised access (both routes run
-- on the RLS user client; the draft's no-policy posture would break
-- both). No INSERT policy: no in-repo writer; the edge function writes
-- on the service role if it writes here at all.
-- ---------------------------------------------------------------------------
create table if not exists public.price_quote_requests (
  id uuid primary key default gen_random_uuid(),
  status text,
  quoted_price numeric,
  created_at timestamptz default now()
);

alter table public.price_quote_requests enable row level security;

drop policy if exists price_quote_requests_select_authenticated on public.price_quote_requests;
create policy price_quote_requests_select_authenticated
  on public.price_quote_requests for select to authenticated
  using (true);

drop policy if exists price_quote_requests_update_authenticated on public.price_quote_requests;
create policy price_quote_requests_update_authenticated
  on public.price_quote_requests for update to authenticated
  using (true)
  with check (true);

-- ---------------------------------------------------------------------------
-- recurring_services — recurring service plans per workspace. Contract =
-- types + work-orders.ts GET (:985) / POST (:995) + the workspace-ready
-- client (recurring-services.query.ts already resolves the current
-- workspace via resolveCurrentWorkspace; its sibling lookup in the same
-- file already sends workspace_id). POST body supplies every NOT NULL
-- column (frequency enum days|weeks|months|years lives in the route's
-- zod — no CHECK here), and the insert omits updated_at, which is why
-- DEFAULT now() matters (types agree: Insert-optional). is_active is set
-- explicitly by the route; DEFAULT true matches types Insert-optional.
-- user_id is replaced by workspace_id per the ruling — the old GET even
-- accepted user_id as an unauthenticated query parameter naming ANY
-- user; the paired code step closes that (spec §2).
-- ---------------------------------------------------------------------------
create table if not exists public.recurring_services (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid not null references public.service_catalog(id),
  customer_id uuid references public.customers(id),
  vehicle_id uuid references public.vehicles(id),
  frequency text not null,
  interval numeric not null,
  is_active boolean not null default true,
  start_date text not null,
  next_due_date text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Serves the workspace list read.
create index if not exists recurring_services_workspace_idx
  on public.recurring_services (workspace_id);
create index if not exists recurring_services_catalog_idx
  on public.recurring_services (service_catalog_id);

alter table public.recurring_services enable row level security;

drop policy if exists recurring_services_staff_select on public.recurring_services;
create policy recurring_services_staff_select
  on public.recurring_services for select to authenticated
  using (public.is_workspace_staff(workspace_id));

drop policy if exists recurring_services_staff_insert on public.recurring_services;
create policy recurring_services_staff_insert
  on public.recurring_services for insert to authenticated
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists recurring_services_staff_update on public.recurring_services;
create policy recurring_services_staff_update
  on public.recurring_services for update to authenticated
  using (public.is_workspace_writer(workspace_id))
  with check (public.is_workspace_writer(workspace_id));

drop policy if exists recurring_services_staff_delete on public.recurring_services;
create policy recurring_services_staff_delete
  on public.recurring_services for delete to authenticated
  using (public.is_workspace_writer(workspace_id));

-- ---------------------------------------------------------------------------
-- OWED FKs FROM STEPS 6+7 (addition named in the header — not part of the
-- design file). The four columns were created FK-less by
-- 20261110200000_step67_documents_crm.sql with the FKs explicitly owed to
-- this step; services exists now (created above, same transaction).
-- ON DELETE SET NULL: these are pointer columns on records that outlive
-- any single service row (a review request, a testimonial, a reminder,
-- a retention profile), matching the family's reference-column idiom
-- (cf. services.appointment_id, service_playbooks.service_catalog_id).
-- Guarded so a re-run is a no-op.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'review_requests_service_id_fkey') then
    alter table public.review_requests
      add constraint review_requests_service_id_fkey
      foreign key (service_id) references public.services(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'testimonials_service_id_fkey') then
    alter table public.testimonials
      add constraint testimonials_service_id_fkey
      foreign key (service_id) references public.services(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'service_reminders_last_service_id_fkey') then
    alter table public.service_reminders
      add constraint service_reminders_last_service_id_fkey
      foreign key (last_service_id) references public.services(id) on delete set null;
  end if;

  if not exists (select 1 from pg_constraint where conname = 'retention_vehicle_profiles_last_service_id_fkey') then
    alter table public.retention_vehicle_profiles
      add constraint retention_vehicle_profiles_last_service_id_fkey
      foreign key (last_service_id) references public.services(id) on delete set null;
  end if;
end $$;

commit;
