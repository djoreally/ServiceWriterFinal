-- Dispatch S-D2 — the vans family lands (Recon Step 10, pulled forward
-- by the dispatch program, 2026-11-10).
--
-- Creates public.vans, public.van_inventory, public.van_territories —
-- absent in production while their UI, handlers, and tech-app reads have
-- shipped for months (every vans call has failed 42P01). The shapes are
-- the step91012 design's §6–§8, verbatim: vans is workspace-translated
-- (workspace_id is the tenancy key; user_id stays as the legacy creator
-- column the create route stamps); the two child tables carry no tenancy
-- column and their RLS keys through the parent van's workspace.
--
-- Also lands the two FKs that were OWED until vans existed:
-- technicians.assigned_van_id -> vans(id) and dispatch_runs.van_id ->
-- vans(id), in the same conditional idiom (skipped with a NOTICE only if
-- a target is somehow absent; both targets are verified present).
--
-- Paired code (same PR): the vans reads in vehicles.ts (stock, detail,
-- create, map-data, vans-overview) and work-orders.ts (tech-app context,
-- more, inventory) move from .eq("user_id", user.id) to the caller's
-- resolved workspace; the create insert stamps workspace_id; the PATCH
-- strips id / user_id / workspace_id from the passthrough body so a
-- client can never move a van between workspaces or rewrite its creator.

-- §6 — vans  (Step 10 — workspace-translated)
-- Origin shape was user-tenanted (draft: user_id NOT NULL, owner-only
-- policy). Under the ruling: workspace_id is the tenancy key; user_id is
-- kept as the legacy creator column the create route already stamps.
-- Corrections vs draft 20261010000090: is_active gains DEFAULT true and
-- status gains DEFAULT 'active' (the create-van insert at vehicles.ts:3269
-- omits BOTH on every call; 'active' is the fleet-asset status the UI's
-- semantic-status vocabulary evidences — src/lib/semantic-status.ts
-- fleetAsset domain {active, maintenance, inactive}, rendered for van
-- rows by FleetVehiclesPage.tsx:304); updated_at gains
-- DEFAULT now() (the draft's bare NOT NULL would fail the same insert);
-- year is integer (a model year), odometer_miles stays numeric.
-- ============================================================================

create table if not exists public.vans (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id),
  name text not null,
  vin text,
  license_plate text,
  make text,
  model text,
  year integer,
  color text,
  status text not null default 'active',
  is_active boolean not null default true,
  assigned_technician_id uuid,
  odometer_miles numeric,
  capacity_notes text,
  equipment_list jsonb,
  current_location jsonb,
  last_location_update text,
  insurance_expiry text,
  last_service_date text,
  next_service_date text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists vans_workspace_idx
  on public.vans (workspace_id);
create index if not exists vans_assigned_technician_idx
  on public.vans (assigned_technician_id);

-- FK to technicians (Step 4 table; precedes Step 10 in the §6 order, but
-- added through the conditional idiom so this file is safe standalone).
-- If skipped, this constraint is OWED — see the spec's owed-FK register.
do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'vans_assigned_technician_id_fkey') then
    begin
      alter table public.vans
        add constraint vans_assigned_technician_id_fkey
        foreign key (assigned_technician_id) references public.technicians (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'recon steps 9/10/12: FK vans_assigned_technician_id_fkey skipped (%) — OWED once technicians exists', sqlerrm;
    end;
  end if;
end
$do$;

alter table public.vans enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'vans' and policyname = 'vans_staff_all') then
    create policy vans_staff_all on public.vans
      for all to authenticated
      using (public.is_workspace_staff(workspace_id))
      with check (public.is_workspace_staff(workspace_id));
  end if;
end
$do$;

-- ============================================================================
-- §7 — van_inventory  (Step 10 — child of vans; tenancy THROUGH the parent)
-- Types give this table NO tenancy column; its exercised reads/writes all
-- key on van_id. Policies therefore key through the parent van's
-- workspace (sync-pair EXISTS idiom). Corrections vs draft 20261010000103:
-- UNIQUE (van_id, inventory_item_id) added — the insert route maps 23505
-- to a 409 "Item already on this van" (vehicles.ts:2196), so the
-- constraint existed in the origin contract; quantity/min_quantity gain
-- DEFAULT 0 (the insert may pass undefined for both); unit becomes
-- NULLABLE (Row says NOT NULL, but the only live insert omits unit on
-- every call and no default value is evidenced — flagged in the spec);
-- updated_at gains DEFAULT now().
-- ============================================================================

create table if not exists public.van_inventory (
  id uuid primary key default gen_random_uuid(),
  van_id uuid not null references public.vans(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity numeric not null default 0,
  min_quantity numeric not null default 0,
  unit text,
  last_restocked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint van_inventory_van_item_key unique (van_id, inventory_item_id)
);

alter table public.van_inventory enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'van_inventory' and policyname = 'van_inventory_staff_all') then
    create policy van_inventory_staff_all on public.van_inventory
      for all to authenticated
      using (exists (select 1 from public.vans v where v.id = van_inventory.van_id and public.is_workspace_staff(v.workspace_id)))
      with check (exists (select 1 from public.vans v where v.id = van_inventory.van_id and public.is_workspace_staff(v.workspace_id)));
  end if;
end
$do$;

-- ============================================================================
-- §8 — van_territories  (Step 10 — child of vans; tenancy THROUGH the parent)
-- Corrections vs draft 20261010000104: UNIQUE (van_id, zip_code) added —
-- the insert route maps 23505 to a 409 "Zip code already assigned to this
-- van" (vehicles.ts:2136); is_primary gains DEFAULT false (both insert
-- routes omit it on every call; map-data reads it). No updated_at exists
-- in the types contract; none is invented.
-- ============================================================================

create table if not exists public.van_territories (
  id uuid primary key default gen_random_uuid(),
  van_id uuid not null references public.vans(id) on delete cascade,
  zip_code text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  constraint van_territories_van_zip_key unique (van_id, zip_code)
);

alter table public.van_territories enable row level security;

do $do$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'van_territories' and policyname = 'van_territories_staff_all') then
    create policy van_territories_staff_all on public.van_territories
      for all to authenticated
      using (exists (select 1 from public.vans v where v.id = van_territories.van_id and public.is_workspace_staff(v.workspace_id)))
      with check (exists (select 1 from public.vans v where v.id = van_territories.van_id and public.is_workspace_staff(v.workspace_id)));
  end if;
end
$do$;

-- ============================================================================

-- ============================================================================
-- Owed FKs — land now that public.vans exists (Dispatch S-D2).
-- ============================================================================

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'technicians_assigned_van_id_fkey') then
    begin
      alter table public.technicians
        add constraint technicians_assigned_van_id_fkey
        foreign key (assigned_van_id) references public.vans (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'dispatch S-D2: FK technicians_assigned_van_id_fkey skipped (%) — OWED once vans exists', sqlerrm;
    end;
  end if;
end
$do$;

do $do$
begin
  if not exists (select 1 from pg_constraint where conname = 'dispatch_runs_van_id_fkey') then
    begin
      alter table public.dispatch_runs
        add constraint dispatch_runs_van_id_fkey
        foreign key (van_id) references public.vans (id);
    exception when duplicate_object or undefined_table or undefined_column then
      raise notice 'dispatch S-D2: FK dispatch_runs_van_id_fkey skipped (%) — OWED once vans exists', sqlerrm;
    end;
  end if;
end
$do$;
