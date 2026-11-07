-- EMV history import — foundation: the two schema objects the EMV pour needs
-- that production does not have. Everything else the pour touches (customers,
-- vehicles, appointments, service_records, invoices, payments, fleet_clients,
-- fleet_client_contacts) already exists in production; this migration changes
-- NO existing table.
--
-- WHY: Ty's ruling 2026-11-05 — one job: rebuild the rescued emv backup
-- (moms_260814.backup, 2026-08-14; 188 appointments / 177 customers / 209
-- vehicles / 155 service records / 13,996 vehicle specs) into Service Writer.
-- Inventory + mapping: goals/.../files/emv-rebuild-inventory-2026-11-05.md.
-- The import itself lives in scripts/emv-import/ and is run separately,
-- on Ty's word; this migration only prepares its two landing zones.
--
-- 1) public.appointment_services — ABSENT in production (backend
--    reconciliation addendum 2026-11-05, bucket (i) CREATE). The pour's 30
--    emv line items need this home. Shape is taken VERBATIM from the
--    addendum's approved definition (repo migration
--    20261010000124_reverse_engineered_appointment_services.sql) so this job
--    and Ty's one-pass create the identical table; IF NOT EXISTS makes the
--    two orders interchangeable (whichever lands first wins, the other no-ops).
--    RLS posture mirrors that draft: enabled, no policies (service-role
--    access only) until the one-pass's policy step covers it.
--
-- 2) public.emv_archive_vehicle_specifications — the emv specs dataset
--    (13,996 rows), ARCHIVE-ONLY by Ty's ruling 2026-11-05: Quick Lube Data
--    is the single live spec source (live lookup via the vehicle-data
--    service); these rows ride in as history, never as a serving table.
--    Deliberately NOT named public.vehicle_specifications: that name was
--    STRUCK from the backend pass (addendum bucket S) and existing code
--    paths (spec-resolution.ts, vehicles.ts routes) still query it — giving
--    them a stale 2025 dataset to find would be a silent behavior change.
--    Archive posture: RLS enabled with NO policies (service-role read/write
--    only); no app code references this table.
--
-- Additive only: two new tables, zero existing data touched. Idempotent —
-- safe to re-run in the SQL Editor.
begin;

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- appointment_services — emv + app line items per appointment.
-- Shape verbatim from 20261010000124 (addendum bucket (i) draft).
-- ---------------------------------------------------------------------------
create table if not exists public.appointment_services (
  added_at_service boolean,
  appointment_id uuid not null,
  created_at timestamptz default now(),
  description text,
  id uuid primary key default gen_random_uuid(),
  is_prepaid boolean,
  name text not null,
  price numeric not null,
  quantity numeric not null,
  service_catalog_id uuid,
  updated_at timestamptz,
  vehicle_id uuid
);

alter table public.appointment_services enable row level security;
-- No policies: mirrors the bucket-(i) draft exactly. Service-role access only
-- until the one-pass policy step covers this table.

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'appointment_services_service_catalog_id_fkey') then
    begin
      alter table public.appointment_services
        add constraint appointment_services_service_catalog_id_fkey
        foreign key (service_catalog_id) references public.service_catalog (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'emv foundation: FK appointment_services_service_catalog_id_fkey skipped (%)', sqlerrm;
    end;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'appointment_services_vehicle_id_fkey') then
    begin
      alter table public.appointment_services
        add constraint appointment_services_vehicle_id_fkey
        foreign key (vehicle_id) references public.vehicles (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'emv foundation: FK appointment_services_vehicle_id_fkey skipped (%)', sqlerrm;
    end;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'fk_appointment_services_appointment') then
    begin
      alter table public.appointment_services
        add constraint fk_appointment_services_appointment
        foreign key (appointment_id) references public.appointments (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'emv foundation: FK fk_appointment_services_appointment skipped (%)', sqlerrm;
    end;
  end if;
end
$do$;

-- ---------------------------------------------------------------------------
-- emv_archive_vehicle_specifications — ARCHIVE ONLY. The 13,996-row emv
-- vehicle-spec dataset (years 2000-2025), preserved verbatim as history.
-- Columns mirror the emv source table exactly; workspace_id + import
-- bookkeeping are added for provenance. NOT a live source: Quick Lube Data
-- serves specs. No app code reads this table.
-- ---------------------------------------------------------------------------
create table if not exists public.emv_archive_vehicle_specifications (
  id uuid primary key,                       -- the emv row's own id, preserved
  workspace_id uuid not null,                -- workspace the archive belongs to
  year integer not null,
  make text not null,
  model text not null,
  engine text,
  oil_type text,
  oil_capacity text,
  air_filter text,
  oil_filter text,
  cabin_filter text,
  fuel_filter text,
  wiper_blade_driver text,
  wiper_blade_passenger text,
  wiper_blade_rear text,
  transmission_fluid text,
  coolant_type text,
  brake_fluid text,
  tire_size text,
  additional_specs jsonb default '{}'::jsonb,
  source text,
  created_at timestamptz not null,
  updated_at timestamptz not null,
  imported_at timestamptz not null default now(),
  import_batch text not null
);

alter table public.emv_archive_vehicle_specifications enable row level security;
-- No policies on purpose: archive-only. Service-role access only; nothing in
-- the app can read these rows through the API.

comment on table public.emv_archive_vehicle_specifications is
  'ARCHIVE ONLY — emv backup (2026-08-14) vehicle specifications, preserved as history per Ty''s 2026-11-05 ruling. NOT a live spec source: Quick Lube Data serves specs via the vehicle-data service. Do not wire app reads to this table.';

commit;
