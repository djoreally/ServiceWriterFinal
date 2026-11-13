import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Dispatch S-D2 vans-family migration (20261110190000) — Recon
// Step 10 pulled forward. The three tables were absent in production
// (census 2026-11-10: 176 tables, no vans family) while their handlers
// shipped; this migration creates them workspace-translated per the
// step91012 design §6–§8 and lands the two FKs owed until vans existed.

const MIGRATIONS = join(__dirname, "../../../supabase/migrations");
const SQL = readFileSync(
  join(MIGRATIONS, "20261110190000_dispatch_sd2_vans_family.sql"),
  "utf8",
);

describe("dispatch S-D2 vans family migration", () => {
  it("creates the three tables", () => {
    expect(SQL).toContain("create table if not exists public.vans (");
    expect(SQL).toContain("create table if not exists public.van_inventory (");
    expect(SQL).toContain("create table if not exists public.van_territories (");
  });

  it("vans is workspace-tenanted with the load-bearing defaults", () => {
    // workspace_id is the tenancy key; user_id stays as creator stamp.
    expect(SQL).toContain("workspace_id uuid not null references public.workspaces(id) on delete cascade");
    expect(SQL).toContain("user_id uuid not null references auth.users(id)");
    // The create route omits both on every call; without these defaults
    // the insert fails outright / reads back a null status.
    expect(SQL).toContain("status text not null default 'active'");
    expect(SQL).toContain("is_active boolean not null default true");
    expect(SQL).toContain("updated_at timestamptz not null default now()");
  });

  it("child tables key on the parent van with the evidenced uniques", () => {
    expect(SQL).toContain("van_id uuid not null references public.vans(id) on delete cascade");
    // The insert routes map 23505 to 409s — the uniques are contractual.
    expect(SQL).toContain("constraint van_inventory_van_item_key unique (van_id, inventory_item_id)");
    expect(SQL).toContain("constraint van_territories_van_zip_key unique (van_id, zip_code)");
    // Both territory inserts omit is_primary; the default is load-bearing.
    expect(SQL).toContain("is_primary boolean not null default false");
    // unit: the only live insert omits it and no default is evidenced —
    // it must stay nullable, never NOT NULL.
    expect(SQL).toContain("unit text,");
    expect(SQL).not.toContain("unit text not null");
  });

  it("RLS: staff policy on vans, parent-keyed policies on the children", () => {
    expect(SQL).toContain("alter table public.vans enable row level security;");
    expect(SQL).toContain("alter table public.van_inventory enable row level security;");
    expect(SQL).toContain("alter table public.van_territories enable row level security;");
    expect(SQL).toContain("create policy vans_staff_all on public.vans");
    expect(SQL).toContain("using (public.is_workspace_staff(workspace_id))");
    expect(SQL).toContain("create policy van_inventory_staff_all on public.van_inventory");
    expect(SQL).toContain("create policy van_territories_staff_all on public.van_territories");
    // Children carry no tenancy column — policies key through the parent.
    expect(SQL).toContain("exists (select 1 from public.vans v where v.id = van_inventory.van_id and public.is_workspace_staff(v.workspace_id))");
    expect(SQL).toContain("exists (select 1 from public.vans v where v.id = van_territories.van_id and public.is_workspace_staff(v.workspace_id))");
  });

  it("lands the three FKs in the conditional idiom", () => {
    expect(SQL).toContain("vans_assigned_technician_id_fkey");
    expect(SQL).toContain("foreign key (assigned_technician_id) references public.technicians (id)");
    expect(SQL).toContain("technicians_assigned_van_id_fkey");
    expect(SQL).toContain("foreign key (assigned_van_id) references public.vans (id)");
    expect(SQL).toContain("dispatch_runs_van_id_fkey");
    expect(SQL).toContain("foreign key (van_id) references public.vans (id)");
  });
});
