import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 12 family migration (admin & misc): 5 creates
// under the Nov 9 tenancy ruling — the training pair is GLOBAL (named
// exceptions, platform-admin gated writes), shop_agent_ledger is
// already workspace-shaped in its hand-written draft (ledger portion
// ONLY — the deferred conversations table is pinned absent), and
// onboarding_site_imports / weather_risk_logs are workspace-translated
// (legacy user_id kept as the creator/actor column). This migration is
// the Step 12 extract of the combined steps 9+10+12 design file: the
// Step 9 / Step 10 tables are pinned ABSENT, and only this family's
// two enums are created (the filter pair landed with Step 9).

const SQL = readFileSync(
  join(__dirname, "../../../supabase/migrations/20261110230000_step12_admin.sql"),
  "utf8",
);

const TABLES = [
  "training_modules",
  "training_reward_policy",
  "shop_agent_ledger",
  "onboarding_site_imports",
  "weather_risk_logs",
];

const GLOBAL = ["training_modules", "training_reward_policy"];
const TRANSLATED = ["onboarding_site_imports", "weather_risk_logs"];

function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table if not exists public.${table} (`);
  if (start < 0) throw new Error(`table not found: ${table}`);
  const end = SQL.indexOf("\n);", start);
  return SQL.slice(start, end);
}

describe("step12 migration — family shape", () => {
  it("is one transaction creating exactly the 5 family tables, all RLS-enabled", () => {
    expect(SQL).toContain("begin;");
    expect(SQL.trimEnd().endsWith("commit;")).toBe(true);
    const creates = SQL.match(/create table if not exists public\./g) ?? [];
    expect(creates).toHaveLength(5);
    for (const t of TABLES) {
      expect(SQL).toContain(`create table if not exists public.${t} (`);
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("creates the tables in the design's landing order (globals, ledger, onboarding, weather)", () => {
    const at = (t: string) => SQL.indexOf(`create table if not exists public.${t} (`);
    expect(at("training_modules")).toBeGreaterThan(-1);
    expect(at("training_reward_policy")).toBeGreaterThan(at("training_modules"));
    expect(at("shop_agent_ledger")).toBeGreaterThan(at("training_reward_policy"));
    expect(at("onboarding_site_imports")).toBeGreaterThan(at("shop_agent_ledger"));
    expect(at("weather_risk_logs")).toBeGreaterThan(at("onboarding_site_imports"));
  });

  it("creates only this family's two enums from the design's §0 (the filter pair landed with Step 9)", () => {
    expect(SQL).toContain("create type public.training_surface as enum ('fleet_os','customer_portal')");
    expect(SQL).toContain(
      "create type public.training_credit_applies_to as enum ('subscription','services','both')",
    );
    expect(SQL).not.toContain("create type public.filter_brand");
    expect(SQL).not.toContain("create type public.filter_type");
  });

  it("does NOT create the other families' tables (Steps 9/10 sets, deferred targets)", () => {
    for (const t of [
      "filter_applications",
      "filter_cross_references",
      "vans",
      "van_inventory",
      "van_territories",
      "vehicle_part_assignments",
      "vehicle_recommendations",
      "vehicle_intelligence_profiles",
      "vehicle_import_batches",
      "vehicle_import_rows",
      "vehicle_import_audit_log",
      "fleet_vehicles",
      "weather_snapshots",
    ]) {
      expect(SQL).not.toContain(`create table if not exists public.${t} (`);
    }
  });

  it("does NOT create the bucket-(iii) DEFERRED conversations table from the ledger's phase-1 file", () => {
    expect(SQL).not.toContain("shop_agent_conversations");
  });
});

describe("step12 migration — the global training pair (named exceptions)", () => {
  it("carries no tenancy column of either generation", () => {
    for (const t of GLOBAL) {
      expect(tableBlock(t)).not.toContain("workspace_id");
      expect(tableBlock(t)).not.toContain("user_id");
    }
  });

  it("gets an authenticated read policy and a platform-admin UPDATE policy — and no other policies", () => {
    for (const t of GLOBAL) {
      expect(SQL).toContain(`create policy ${t}_auth_select on public.${t}`);
      expect(SQL).toContain(`create policy ${t}_admin_update on public.${t}`);
      expect(SQL).toContain(
        "exists (select 1 from public.user_roles ur where ur.user_id = auth.uid() and ur.role = 'admin')",
      );
      const policies = SQL.match(new RegExp(`create policy ${t}_`, "g")) ?? [];
      expect(policies).toHaveLength(2);
      expect(SQL).not.toContain(`${t}_staff_all`);
    }
  });

  it("types the catalog/policy columns with the §0 enums and integer cents", () => {
    expect(tableBlock("training_modules")).toContain("surface public.training_surface not null");
    expect(tableBlock("training_modules")).toContain("reward_cents integer not null default 0");
    expect(tableBlock("training_modules")).toContain("sort_order integer not null default 0");
    expect(tableBlock("training_modules")).toContain("currency text not null default 'USD'");
    expect(tableBlock("training_modules")).toContain("active boolean not null default true");
    expect(tableBlock("training_reward_policy")).toContain(
      "applies_to public.training_credit_applies_to not null",
    );
    expect(tableBlock("training_reward_policy")).toContain("monthly_cap_cents integer not null");
    expect(tableBlock("training_reward_policy")).toContain("lifetime_cap_cents integer not null");
  });

  it("keeps the singleton's value columns default-free (the seed data step owns the values)", () => {
    const b = tableBlock("training_reward_policy");
    expect(b).toContain("singleton boolean not null default true");
    expect(b).toContain("enabled boolean not null,");
    expect(b).not.toContain("enabled boolean not null default");
    expect(b).not.toContain("monthly_cap_cents integer not null default");
    expect(b).not.toContain("lifetime_cap_cents integer not null default");
    expect(SQL).toContain("create unique index if not exists training_reward_policy_singleton_key");
    expect(SQL).toContain("on public.training_reward_policy (singleton) where singleton");
  });
});

describe("step12 migration — shop_agent_ledger (already workspace-shaped; zero translation)", () => {
  it("carries workspace tenancy from its hand-written draft, verbatim in shape", () => {
    const b = tableBlock("shop_agent_ledger");
    expect(b).toContain(
      "workspace_id uuid not null references public.workspaces(id) on delete cascade",
    );
    expect(b).toContain("constraint shop_agent_ledger_workspace_event_key unique (workspace_id, event_id)");
    expect(b).toContain("evidence jsonb not null default '{}'::jsonb");
    expect(b).toContain("output_hash text,");
    expect(SQL).toContain("create index if not exists shop_agent_ledger_workspace_occurred_idx");
    expect(SQL).toContain("on public.shop_agent_ledger (workspace_id, occurred_at desc)");
  });

  it("enables RLS with NO policies (service-role agent runtime only)", () => {
    expect(SQL).toContain("alter table public.shop_agent_ledger enable row level security;");
    expect(SQL).not.toContain("create policy shop_agent_ledger");
    expect(SQL).not.toContain("shop_agent_ledger_staff");
    expect(SQL).not.toContain("shop_agent_ledger_auth");
  });
});

describe("step12 migration — translated tables", () => {
  it("carry workspace_id NOT NULL with the workspaces FK, and keep the legacy user_id actor column", () => {
    for (const t of TRANSLATED) {
      expect(tableBlock(t)).toContain(
        "workspace_id uuid not null references public.workspaces(id) on delete cascade",
      );
      expect(tableBlock(t)).toContain("user_id uuid not null references auth.users(id)");
    }
  });

  it("get the canonical staff FOR ALL policy (USING + WITH CHECK on is_workspace_staff)", () => {
    for (const t of TRANSLATED) {
      expect(SQL).toContain(`create policy ${t}_staff_all on public.${t}`);
    }
    expect(SQL).toContain("using (public.is_workspace_staff(workspace_id))");
    expect(SQL).toContain("with check (public.is_workspace_staff(workspace_id))");
  });

  it("onboarding carries the evidenced defaults; status stays NOT NULL with NO invented default", () => {
    const b = tableBlock("onboarding_site_imports");
    expect(b).toContain("payload jsonb not null default '{}'::jsonb");
    expect(b).toContain("warnings jsonb not null default '[]'::jsonb");
    expect(b).toContain("status text not null,");
    expect(b).not.toContain("status text not null default");
    expect(SQL).toContain("create index if not exists onboarding_site_imports_workspace_status_idx");
    expect(SQL).toContain("on public.onboarding_site_imports (workspace_id, status, created_at desc)");
  });

  it("weather logs FK the appointment, leave snapshot_id a plain uuid, and invent no created_at", () => {
    const b = tableBlock("weather_risk_logs");
    expect(b).toContain("appointment_id uuid not null references public.appointments(id)");
    expect(b).toContain("snapshot_id uuid,");
    expect(b).not.toContain("references public.weather_snapshots");
    expect(b).toContain("risk_score numeric not null default 0");
    expect(b).toContain("evaluated_at timestamptz not null default now()");
    expect(b).not.toContain("created_at");
  });

  it("weather logs join the realtime publication through the guarded add", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.weather_risk_logs");
    expect(SQL).toContain("select 1 from pg_publication where pubname = 'supabase_realtime'");
    expect(SQL).toContain("tablename = 'weather_risk_logs'");
  });
});
