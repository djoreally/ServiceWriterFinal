import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Step 8 family migration (catalog, pricing & services):
// 11 creates in FK order under the Nov 9 tenancy ruling — 8 tables
// workspace-translated, 3 named exceptions (benchmark_pricing and
// service_playbook_templates global, price_quote_requests pre-tenancy) —
// plus the four FKs Steps 6+7 owed to this step, added now that
// services exists.

const SQL = readFileSync(
  join(__dirname, "../../../supabase/migrations/20261110210000_step8_catalog.sql"),
  "utf8",
);

const TABLES = [
  "shop_pricing_rules",
  "benchmark_pricing",
  "service_playbook_templates",
  "services",
  "service_images",
  "service_catalog_parts",
  "service_catalog_benchmarks",
  "service_playbooks",
  "quote_requests",
  "price_quote_requests",
  "recurring_services",
];

const TRANSLATED = [
  "shop_pricing_rules",
  "services",
  "service_images",
  "service_catalog_parts",
  "service_catalog_benchmarks",
  "service_playbooks",
  "quote_requests",
  "recurring_services",
];

function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table if not exists public.${table} (`);
  if (start < 0) throw new Error(`table not found: ${table}`);
  const end = SQL.indexOf("\n);", start);
  return SQL.slice(start, end);
}

describe("step8 migration — family shape", () => {
  it("is one transaction creating exactly the 11 family tables, all RLS-enabled", () => {
    expect(SQL).toContain("begin;");
    expect(SQL.trimEnd().endsWith("commit;")).toBe(true);
    const creates = SQL.match(/create table if not exists public\./g) ?? [];
    expect(creates).toHaveLength(11);
    for (const t of TABLES) {
      expect(SQL).toContain(`create table if not exists public.${t} (`);
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("creates services before service_images (the FK child)", () => {
    const services = SQL.indexOf("create table if not exists public.services (");
    const images = SQL.indexOf("create table if not exists public.service_images (");
    expect(services).toBeGreaterThan(-1);
    expect(images).toBeGreaterThan(services);
  });

  it("translated tables carry workspace_id NOT NULL with the workspaces FK", () => {
    for (const t of TRANSLATED) {
      expect(tableBlock(t)).toContain(
        "workspace_id uuid not null references public.workspaces(id) on delete cascade",
      );
    }
  });

  it("translated tables get the canonical staff policy set", () => {
    for (const t of TRANSLATED) {
      for (const verb of ["select", "insert", "update", "delete"]) {
        expect(SQL).toContain(`create policy ${t}_staff_${verb}`);
      }
      expect(SQL).toContain(`on public.${t} for select to authenticated`);
    }
  });
});

describe("step8 migration — services, the hard case", () => {
  it("has NO user_id column — workspace_id is the sole tenant key", () => {
    expect(tableBlock("services")).not.toContain("user_id");
  });

  it("creates the four code-exercised columns the types never had", () => {
    const b = tableBlock("services");
    expect(b).toContain("title text");
    expect(b).toContain("estimated_cost numeric");
    expect(b).toContain("metadata jsonb not null default '{}'::jsonb");
    expect(b).toContain("assigned_technician text");
  });

  it("keeps status and service_date NOT NULL with no invented default", () => {
    const b = tableBlock("services");
    expect(b).toContain("status text not null,");
    expect(b).toContain("service_date text not null");
    expect(b).not.toContain("status text not null default");
    expect(b).not.toContain("service_date text not null default");
  });

  it("gives import_batch_id no FK (target is a deferred table)", () => {
    expect(tableBlock("services")).toContain("import_batch_id uuid,");
    expect(tableBlock("services")).not.toContain("import_batch_id uuid references");
  });

  it("keeps service_images' user_id as a stamped actor column, not the tenant key", () => {
    const b = tableBlock("service_images");
    expect(b).toContain("user_id uuid not null,");
    expect(b).toContain("service_id uuid not null references public.services(id) on delete cascade");
  });
});

describe("step8 migration — the three named exceptions", () => {
  it("benchmark_pricing is global: no tenancy key, authenticated read + insert", () => {
    expect(tableBlock("benchmark_pricing")).not.toContain("workspace_id");
    expect(SQL).toContain("create policy benchmark_pricing_select_authenticated");
    expect(SQL).toContain("create policy benchmark_pricing_insert_authenticated");
  });

  it("service_playbook_templates is global and service-role only (no policies)", () => {
    expect(tableBlock("service_playbook_templates")).not.toContain("workspace_id");
    expect(SQL).not.toContain("on public.service_playbook_templates for select");
    expect(SQL).not.toContain("on public.service_playbook_templates for insert");
  });

  it("price_quote_requests is created exactly as contracted: 4 columns, no tenancy key", () => {
    const b = tableBlock("price_quote_requests");
    expect(b).not.toContain("workspace_id");
    for (const col of ["id uuid", "status text", "quoted_price numeric", "created_at timestamptz"]) {
      expect(b).toContain(col);
    }
    expect(SQL).toContain("create policy price_quote_requests_select_authenticated");
    expect(SQL).toContain("create policy price_quote_requests_update_authenticated");
    expect(SQL).not.toContain("create policy price_quote_requests_insert");
  });
});

describe("step8 migration — pricing pairs", () => {
  it("shop_pricing_rules carries the unique key its upsert targets", () => {
    expect(tableBlock("shop_pricing_rules")).toContain(
      "constraint shop_pricing_rules_workspace_rule_key unique (workspace_id, rule_key)",
    );
  });

  it("service_catalog_benchmarks carries the code-required UNIQUE(service_catalog_id, vin)", () => {
    expect(tableBlock("service_catalog_benchmarks")).toContain(
      "constraint service_catalog_benchmarks_catalog_vin_key unique (service_catalog_id, vin)",
    );
  });

  it("quote_requests defaults status to 'new' (the client status union's initial state)", () => {
    expect(tableBlock("quote_requests")).toContain("status text not null default 'new'");
  });

  it("service_catalog_parts is readable publicly ONLY through an active parent catalog item", () => {
    expect(SQL).toContain("create policy service_catalog_parts_public_select");
    expect(SQL).toContain("on public.service_catalog_parts for select to anon, authenticated");
    expect(SQL).toContain("and sc.is_active = true");
  });
});

describe("step8 migration — the four FKs owed from Steps 6+7", () => {
  it("adds all four, guarded, pointing at services with ON DELETE SET NULL", () => {
    for (const [table, col, fk] of [
      ["review_requests", "service_id", "review_requests_service_id_fkey"],
      ["testimonials", "service_id", "testimonials_service_id_fkey"],
      ["service_reminders", "last_service_id", "service_reminders_last_service_id_fkey"],
      ["retention_vehicle_profiles", "last_service_id", "retention_vehicle_profiles_last_service_id_fkey"],
    ] as const) {
      expect(SQL).toContain(`if not exists (select 1 from pg_constraint where conname = '${fk}')`);
      expect(SQL).toContain(`alter table public.${table}`);
      expect(SQL).toContain(`add constraint ${fk}`);
      expect(SQL).toContain(
        `foreign key (${col}) references public.services(id) on delete set null`,
      );
    }
  });

  it("adds the FKs after services is created", () => {
    const services = SQL.indexOf("create table if not exists public.services (");
    const fk = SQL.indexOf("add constraint review_requests_service_id_fkey");
    expect(fk).toBeGreaterThan(services);
  });
});
