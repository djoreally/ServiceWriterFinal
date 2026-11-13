import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 9 family migration (vehicle depth & import):
// 8 creates under the Nov 9 tenancy ruling — the two filter catalogs are
// GLOBAL named exceptions; the other six are workspace-translated (the
// legacy user_id / created_by / actor_id columns stay as actor markers).
// This migration is the Step 9 extract of the combined steps 9+10+12
// design file: Step 12's tables and the already-landed vans family are
// pinned ABSENT, and only this family's two enums are created.

const SQL = readFileSync(
  join(__dirname, "../../../supabase/migrations/20261110220000_step9_vehicle.sql"),
  "utf8",
);

const TABLES = [
  "filter_applications",
  "filter_cross_references",
  "vehicle_part_assignments",
  "vehicle_recommendations",
  "vehicle_intelligence_profiles",
  "vehicle_import_batches",
  "vehicle_import_rows",
  "vehicle_import_audit_log",
];

const TRANSLATED = [
  "vehicle_part_assignments",
  "vehicle_recommendations",
  "vehicle_intelligence_profiles",
  "vehicle_import_batches",
  "vehicle_import_rows",
  "vehicle_import_audit_log",
];

const GLOBAL = ["filter_applications", "filter_cross_references"];

function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table if not exists public.${table} (`);
  if (start < 0) throw new Error(`table not found: ${table}`);
  const end = SQL.indexOf("\n);", start);
  return SQL.slice(start, end);
}

describe("step9 migration — family shape", () => {
  it("is one transaction creating exactly the 8 family tables, all RLS-enabled", () => {
    expect(SQL).toContain("begin;");
    expect(SQL.trimEnd().endsWith("commit;")).toBe(true);
    const creates = SQL.match(/create table if not exists public\./g) ?? [];
    expect(creates).toHaveLength(8);
    for (const t of TABLES) {
      expect(SQL).toContain(`create table if not exists public.${t} (`);
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("creates only this family's two enums from the design's §0 (Step 12's land with Step 12)", () => {
    expect(SQL).toContain("create type public.filter_brand as enum");
    expect(SQL).toContain("create type public.filter_type as enum");
    expect(SQL).not.toContain("create type public.training_surface");
    expect(SQL).not.toContain("create type public.training_credit_applies_to");
  });

  it("does NOT create the other families' tables (Step 12 set + the landed vans family)", () => {
    for (const t of [
      "training_modules",
      "training_reward_policy",
      "shop_agent_ledger",
      "onboarding_site_imports",
      "weather_risk_logs",
      "vans",
      "van_inventory",
      "van_territories",
      "fleet_vehicles",
    ]) {
      expect(SQL).not.toContain(`create table if not exists public.${t} (`);
    }
  });

  it("creates the import trio in FK order: batches, then rows, then audit log", () => {
    const batches = SQL.indexOf("create table if not exists public.vehicle_import_batches (");
    const rows = SQL.indexOf("create table if not exists public.vehicle_import_rows (");
    const audit = SQL.indexOf("create table if not exists public.vehicle_import_audit_log (");
    expect(batches).toBeGreaterThan(-1);
    expect(rows).toBeGreaterThan(batches);
    expect(audit).toBeGreaterThan(rows);
  });
});

describe("step9 migration — the global pair (named exceptions)", () => {
  it("carries no tenancy column and an authenticated read policy", () => {
    for (const t of GLOBAL) {
      expect(tableBlock(t)).not.toContain("workspace_id");
      expect(tableBlock(t)).not.toContain("user_id");
      expect(SQL).toContain(`create policy ${t}_auth_select on public.${t}`);
      expect(SQL).toContain("for select to authenticated using (true)");
      expect(SQL).not.toContain(`${t}_staff_all`);
    }
  });

  it("types the catalog columns with the §0 enums (cross-refs' filter_type stays nullable)", () => {
    expect(tableBlock("filter_applications")).toContain("brand public.filter_brand not null");
    expect(tableBlock("filter_applications")).toContain("filter_type public.filter_type not null");
    expect(tableBlock("filter_applications")).toContain("year_start integer not null");
    expect(tableBlock("filter_cross_references")).toContain("filter_type public.filter_type,");
    expect(tableBlock("filter_cross_references")).toContain("confidence_score numeric");
  });
});

describe("step9 migration — translated tables", () => {
  it("carry workspace_id NOT NULL with the workspaces FK", () => {
    for (const t of TRANSLATED) {
      expect(tableBlock(t)).toContain(
        "workspace_id uuid not null references public.workspaces(id) on delete cascade",
      );
    }
  });

  it("get the canonical staff FOR ALL policy (USING + WITH CHECK on is_workspace_staff)", () => {
    for (const t of TRANSLATED) {
      expect(SQL).toContain(`create policy ${t}_staff_all on public.${t}`);
      expect(SQL).toContain("using (public.is_workspace_staff(workspace_id))");
      expect(SQL).toContain("with check (public.is_workspace_staff(workspace_id))");
    }
  });

  it("keep the legacy actor columns — tenancy moved, actors did not", () => {
    expect(tableBlock("vehicle_part_assignments")).toContain("user_id uuid not null references auth.users(id)");
    expect(tableBlock("vehicle_recommendations")).toContain("user_id uuid not null references auth.users(id)");
    expect(tableBlock("vehicle_intelligence_profiles")).toContain("user_id uuid not null references auth.users(id)");
    expect(tableBlock("vehicle_import_batches")).toContain("created_by uuid not null references auth.users(id)");
    expect(tableBlock("vehicle_import_audit_log")).toContain("actor_id uuid not null references auth.users(id)");
  });
});

describe("step9 migration — load-bearing defaults and uniques", () => {
  it("part assignments carry the insert's own fallbacks as defaults", () => {
    const b = tableBlock("vehicle_part_assignments");
    expect(b).toContain("quantity numeric not null default 1");
    expect(b).toContain("is_required boolean not null default true");
  });

  it("part assignments carry the two partial uniques inferred from the 23505 -> 409 mapping", () => {
    expect(SQL).toContain("create unique index if not exists vehicle_part_assignments_vehicle_part_key");
    expect(SQL).toContain("on public.vehicle_part_assignments (vehicle_id, part_number)");
    expect(SQL).toContain("where vehicle_id is not null");
    expect(SQL).toContain("create unique index if not exists vehicle_part_assignments_fleet_part_key");
    expect(SQL).toContain("on public.vehicle_part_assignments (fleet_vehicle_id, part_number)");
    expect(SQL).toContain("where fleet_vehicle_id is not null");
  });

  it("recommendations default is_dismissed to false (the list filter is = false; NULL rows would vanish)", () => {
    const b = tableBlock("vehicle_recommendations");
    expect(b).toContain("is_dismissed boolean not null default false");
    expect(b).toContain("priority text not null,");
    expect(b).not.toContain("priority text not null default");
    // vehicle_id deliberately has NO foreign key (types declare Relationships []).
    expect(b).toContain("vehicle_id uuid not null,");
    expect(b).not.toContain("vehicle_id uuid not null references");
  });

  it("intelligence profiles carry UNIQUE(vehicle_id) — the upsert's onConflict target", () => {
    const b = tableBlock("vehicle_intelligence_profiles");
    expect(b).toContain("constraint vehicle_intelligence_profiles_vehicle_key unique (vehicle_id)");
    expect(b).toContain("derived_defaults jsonb not null default '{}'::jsonb");
    expect(b).toContain("source_profile jsonb not null");
  });

  it("import batches default the seven counters to 0 and updated_at to now()", () => {
    const b = tableBlock("vehicle_import_batches");
    for (const col of [
      "total_rows",
      "parsed_rows",
      "ready_rows",
      "warning_rows",
      "error_rows",
      "duplicate_rows",
      "committed_rows",
    ]) {
      expect(b).toContain(`${col} integer not null default 0`);
    }
    expect(b).toContain("mapping_payload jsonb not null");
    expect(b).toContain("headers_payload jsonb not null");
    expect(b).toContain("context_payload jsonb not null");
  });

  it("import rows and audit log carry their timestamp/details defaults", () => {
    const rows = tableBlock("vehicle_import_rows");
    expect(rows).toContain("batch_id uuid not null references public.vehicle_import_batches(id) on delete cascade");
    expect(rows).toContain("row_index integer not null");
    const audit = tableBlock("vehicle_import_audit_log");
    expect(audit).toContain("details jsonb not null default '{}'::jsonb");
    expect(audit).toContain("row_id uuid references public.vehicle_import_rows(id) on delete cascade");
    expect(audit).toContain("event_type text not null");
  });
});

describe("step9 migration — fleet_vehicles FKs stay conditional (Step 11 owns the target)", () => {
  it("adds the three FKs only through the guarded conditional idiom, with the OWED notice", () => {
    for (const fk of [
      "vehicle_part_assignments_fleet_vehicle_id_fkey",
      "vehicle_intelligence_profiles_vehicle_id_fkey",
      "vehicle_import_rows_existing_vehicle_id_fkey",
    ]) {
      expect(SQL).toContain(`add constraint ${fk}`);
      expect(SQL).toContain(`foreign key`);
      expect(SQL).toContain("references public.fleet_vehicles (id)");
    }
    expect(SQL).toContain("exception when duplicate_object or undefined_table or undefined_column");
    expect(SQL).toContain("OWED once fleet_vehicles exists");
    // The DDL itself never hard-references fleet_vehicles in a CREATE TABLE.
    for (const t of TRANSLATED) {
      expect(tableBlock(t)).not.toContain("references public.fleet_vehicles");
    }
  });
});
