-- ============================================================================
-- Service Menu (2026-11-12): McDonald's-style psychological pricing
-- presentation of a shop's EXISTING service catalog.
--
-- ADDITIVE ONLY. Nothing in this migration alters an existing table,
-- column, policy, or row. The feature is OFF by default for every
-- workspace (service_menus.enabled defaults false, and a workspace with
-- no service_menus row has no menu at all), so applying it changes zero
-- existing behavior.
--
-- DESIGN — no parallel concepts (per AGENTS.md):
--   * Prices are NEVER stored here. Core/side prices resolve at read time
--     from public.service_catalog (labor_price), combo prices from the
--     EXISTING public.service_packages (package_price) — the same rows
--     that feed booking, work orders, and invoices. One source of truth.
--   * Combos ARE service_packages; this feature only places them on a
--     menu (service_menu_items.package_id). No new bundle tables.
--   * service_menus: one settings row per workspace (enabled, headline,
--     ONE hero — hero_package_id is a single column, so a second hero is
--     structurally impossible).
--   * service_menu_items: menu placement for catalog services / packages
--     (role core|combo|side, most-popular flag, with-service price for
--     sides, sort order). Template-applied entries that match nothing in
--     the shop's catalog are stored as drafts (is_draft, display_name,
--     no catalog/package FK) — drafts carry NO price anywhere.
--   * A partial unique index enforces at most one Most Popular per
--     workspace at the database level; the single-hero rule is
--     structural (one column on the one settings row).
--
-- TENANCY / RLS: workspace-shaped like the sibling catalog family
-- (20260901162000_canonical_service_packages.sql): workspace_id NOT NULL
-- + FK to public.workspaces, policies via public.is_workspace_member,
-- drop-if-exists then create. Public (anonymous) menu reads do NOT go
-- through these tables directly — the server resolves an enabled menu
-- with the service-role client after resolving the workspace by its
-- public booking slug, returning names/prices of active catalog rows
-- only (the same data the public booking catalog RPC already exposes).
-- ============================================================================


create table if not exists public.service_menus (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null unique references public.workspaces(id) on delete cascade,
  enabled boolean not null default false,
  headline text,
  hero_package_id uuid references public.service_packages(id) on delete set null,
  hero_label text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.service_menu_items (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  service_catalog_id uuid references public.service_catalog(id) on delete cascade,
  package_id uuid references public.service_packages(id) on delete cascade,
  role text not null check (role in ('core', 'combo', 'side')),
  is_most_popular boolean not null default false,
  with_service_price numeric(12,2) check (with_service_price is null or with_service_price >= 0),
  display_name text,
  is_draft boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_menu_items_single_target check (
    not (service_catalog_id is not null and package_id is not null)
  ),
  constraint service_menu_items_target_or_draft check (
    service_catalog_id is not null
    or package_id is not null
    or (is_draft and display_name is not null)
  ),
  constraint service_menu_items_package_is_combo check (
    package_id is null or role = 'combo'
  )
);

create index if not exists service_menus_workspace_idx
  on public.service_menus(workspace_id);
create index if not exists service_menu_items_workspace_idx
  on public.service_menu_items(workspace_id, role, sort_order);
create index if not exists service_menu_items_catalog_idx
  on public.service_menu_items(service_catalog_id);
create index if not exists service_menu_items_package_idx
  on public.service_menu_items(package_id);

-- At most ONE Most Popular per workspace (database-level guardrail).
create unique index if not exists service_menu_items_one_most_popular_idx
  on public.service_menu_items(workspace_id)
  where is_most_popular;

alter table public.service_menus enable row level security;
alter table public.service_menu_items enable row level security;

drop policy if exists service_menus_member_select on public.service_menus;
create policy service_menus_member_select on public.service_menus
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists service_menus_member_insert on public.service_menus;
create policy service_menus_member_insert on public.service_menus
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists service_menus_member_update on public.service_menus;
create policy service_menus_member_update on public.service_menus
  for update to authenticated using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists service_menus_member_delete on public.service_menus;
create policy service_menus_member_delete on public.service_menus
  for delete to authenticated using (public.is_workspace_member(workspace_id));

drop policy if exists service_menu_items_member_select on public.service_menu_items;
create policy service_menu_items_member_select on public.service_menu_items
  for select to authenticated using (public.is_workspace_member(workspace_id));
drop policy if exists service_menu_items_member_insert on public.service_menu_items;
create policy service_menu_items_member_insert on public.service_menu_items
  for insert to authenticated with check (public.is_workspace_member(workspace_id));
drop policy if exists service_menu_items_member_update on public.service_menu_items;
create policy service_menu_items_member_update on public.service_menu_items
  for update to authenticated using (public.is_workspace_member(workspace_id))
  with check (public.is_workspace_member(workspace_id));
drop policy if exists service_menu_items_member_delete on public.service_menu_items;
create policy service_menu_items_member_delete on public.service_menu_items
  for delete to authenticated using (public.is_workspace_member(workspace_id));

grant select, insert, update, delete on public.service_menus to authenticated;
grant select, insert, update, delete on public.service_menu_items to authenticated;
grant all on public.service_menus, public.service_menu_items to service_role;

