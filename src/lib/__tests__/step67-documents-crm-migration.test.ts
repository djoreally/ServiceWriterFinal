import { readFileSync } from "node:fs";
import { join } from "node:path";

// Pins the Recon Steps 6+7 family migration (documents + CRM/loyalty/
// retention): 14 creates in FK order, the two guarded enum types, the
// load-bearing FKs and unique index, the FKs deliberately OWED to
// Step 8 / the defer bucket (plain columns, no REFERENCES), and the
// three named exceptions created without workspace_id (ai_agents,
// audit_logs, visitor_presence + analytics_events legacy tenant pair).

const SQL = readFileSync(
  join(__dirname, "../../../supabase/migrations/20261110200000_step67_documents_crm.sql"),
  "utf8",
);

const TABLES = [
  "invoice_lifecycle_events",
  "retention_events",
  "retention_signals",
  "retention_action_executions",
  "retention_vehicle_profiles",
  "loyalty_accounts",
  "review_requests",
  "email_marketing_campaigns",
  "service_reminders",
  "testimonials",
  "audit_logs",
  "visitor_presence",
  "analytics_events",
  "ai_agents",
];

function tableBlock(table: string): string {
  const start = SQL.indexOf(`create table if not exists public.${table} (`);
  if (start < 0) throw new Error(`table not found: ${table}`);
  const end = SQL.indexOf("\n);", start);
  return SQL.slice(start, end);
}

describe("step67 migration — family shape", () => {
  it("is one transaction creating exactly the 14 family tables", () => {
    expect(SQL).toContain("begin;");
    expect(SQL.trimEnd().endsWith("commit;")).toBe(true);
    const creates = SQL.match(/create table if not exists public\./g) ?? [];
    expect(creates).toHaveLength(14);
    for (const t of TABLES) {
      expect(SQL).toContain(`create table if not exists public.${t} (`);
      expect(SQL).toContain(`alter table public.${t} enable row level security;`);
    }
  });

  it("creates retention_events before the tables that FK to it", () => {
    const events = SQL.indexOf("create table if not exists public.retention_events (");
    const signals = SQL.indexOf("create table if not exists public.retention_signals (");
    const executions = SQL.indexOf("create table if not exists public.retention_action_executions (");
    expect(events).toBeGreaterThan(-1);
    expect(signals).toBeGreaterThan(events);
    expect(executions).toBeGreaterThan(events);
  });

  it("translated tables carry workspace_id NOT NULL with the workspaces FK", () => {
    for (const t of TABLES.slice(0, 10)) {
      expect(tableBlock(t)).toContain(
        "workspace_id uuid not null references public.workspaces (id) on delete cascade",
      );
    }
  });
});

describe("step67 migration — enums", () => {
  it("creates both enum types guarded, with the contract values", () => {
    expect(SQL).toContain("if not exists (select 1 from pg_type where typname = 'retention_signal_status')");
    expect(SQL).toContain("if not exists (select 1 from pg_type where typname = 'vehicle_lifecycle_status')");
    expect(SQL).toContain("'detected', 'active', 'suppressed', 'resolved', 'expired'");
    expect(SQL).toContain("'active', 'due_soon', 'overdue', 'at_risk', 'lost'");
    expect(tableBlock("retention_signals")).toContain(
      "status public.retention_signal_status not null default 'detected'",
    );
    expect(tableBlock("retention_vehicle_profiles")).toContain(
      "lifecycle_status public.vehicle_lifecycle_status not null",
    );
  });
});

describe("step67 migration — load-bearing contract points", () => {
  it("invoice_lifecycle_events: unique idempotency index (the 23505 path)", () => {
    expect(SQL).toContain(
      "create unique index if not exists invoice_lifecycle_events_idempotency_key_uidx",
    );
    expect(tableBlock("invoice_lifecycle_events")).toContain(
      "invoice_id uuid not null references public.invoices (id) on delete cascade",
    );
    expect(tableBlock("invoice_lifecycle_events")).toContain("details jsonb not null default '{}'::jsonb");
  });

  it("retention_events: aggregate_id is TEXT; source_system stays nullable", () => {
    const b = tableBlock("retention_events");
    expect(b).toContain("aggregate_id text not null");
    expect(b).toContain("source_system text,");
    expect(b).toContain("schema_version integer not null default 1");
  });

  it("retention_action_executions: automation_rules + customers FKs exist (PostgREST embeds)", () => {
    const b = tableBlock("retention_action_executions");
    expect(b).toContain("rule_id uuid references public.automation_rules (id) on delete set null");
    expect(b).toContain("customer_id uuid references public.customers (id) on delete set null");
    expect(b).toContain("status text not null");
  });

  it("retention_vehicle_profiles: unique (workspace_id, vehicle_id)", () => {
    expect(SQL).toContain(
      "create unique index if not exists retention_vehicle_profiles_workspace_vehicle_uidx",
    );
  });
});

describe("step67 migration — FKs owed, deliberately not created", () => {
  it("the four services-bound columns are plain uuid with no REFERENCES", () => {
    expect(tableBlock("review_requests")).toContain("service_id uuid,");
    expect(tableBlock("testimonials")).toContain("service_id uuid,");
    expect(tableBlock("service_reminders")).toContain("last_service_id uuid,");
    expect(tableBlock("retention_vehicle_profiles")).toContain("last_service_id uuid,");
    for (const t of TABLES) {
      expect(tableBlock(t)).not.toContain("references public.services");
    }
  });

  it("defer-bucket FKs are omitted (program_id, campaign_enrollment_id)", () => {
    expect(tableBlock("loyalty_accounts")).toContain("program_id uuid not null,");
    expect(tableBlock("loyalty_accounts")).not.toContain("references public.loyalty_programs");
    expect(tableBlock("retention_action_executions")).toContain("campaign_enrollment_id uuid,");
    expect(tableBlock("retention_action_executions")).not.toContain("retention_campaign_enrollments (id)");
  });

  it("review_requests.email_queue_id carries no FK (types list no relationship)", () => {
    expect(tableBlock("review_requests")).toContain("email_queue_id uuid,");
  });
});

describe("step67 migration — named exceptions", () => {
  it("exception tables carry NO workspace_id", () => {
    for (const t of ["ai_agents", "audit_logs", "visitor_presence", "analytics_events"]) {
      expect(tableBlock(t)).not.toContain("workspace_id");
    }
  });

  it("ai_agents: anon + authenticated SELECT policy exists (the anon catalog read)", () => {
    const b = SQL.slice(SQL.indexOf("create table if not exists public.ai_agents"));
    expect(b).toContain("create policy ai_agents_public_select on public.ai_agents");
    expect(b).toContain("for select to anon, authenticated");
    expect(tableBlock("ai_agents")).toContain("capabilities jsonb not null default '{}'::jsonb");
  });

  it("audit_logs: record_id is TEXT; INSERT policies only, no SELECT policy", () => {
    expect(tableBlock("audit_logs")).toContain("record_id text,");
    expect(tableBlock("audit_logs")).toContain("user_id uuid references auth.users (id) on delete set null");
    expect(SQL).toContain("with check (user_id is null or user_id = auth.uid())");
    expect(SQL).toContain("create policy audit_logs_anon_insert on public.audit_logs");
    expect(SQL).not.toMatch(/create policy \w+ on public\.audit_logs\s+for select/);
  });

  it("visitor_presence: session_id TEXT + the upsert's UNIQUE(tenant_id, session_id)", () => {
    const b = tableBlock("visitor_presence");
    expect(b).toContain("session_id text not null");
    expect(b).toContain("tenant_id uuid not null");
    expect(SQL).toContain(
      "create unique index if not exists visitor_presence_tenant_session_uidx",
    );
    expect(SQL).toContain("on public.visitor_presence (tenant_id, session_id)");
  });

  it("analytics_events: session_id TEXT; metadata defaults to '{}'", () => {
    const b = tableBlock("analytics_events");
    expect(b).toContain("session_id text not null");
    expect(b).toContain("metadata jsonb not null default '{}'::jsonb");
  });

  it("legacy pair joins the realtime publication (guarded)", () => {
    expect(SQL).toContain("alter publication supabase_realtime add table public.visitor_presence;");
    expect(SQL).toContain("alter publication supabase_realtime add table public.analytics_events;");
  });
});
