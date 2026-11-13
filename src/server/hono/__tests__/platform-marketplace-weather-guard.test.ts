/**
 * Schema contract for the platform marketplace + weather-guard reads
 * (phantom fix, 2026-11-10): GET /v1/platform/marketplace/metrics,
 * GET /v1/platform/marketplace/leads, PATCH
 * /v1/platform/marketplace/lead-status, GET
 * /v1/platform/weather-guard/at-risk.
 *
 * All four keyed appointment reads on columns production does not have
 * (live census 2026-11-10: appointments has 17 columns — no user_id, title,
 * scheduled_date/time, guest_*, estimated_cost, location_address,
 * weather_*, deleted_at; customers has no `name`):
 * - metrics filtered appointments by user_id and selected estimated_cost,
 *   so the whole payload 42703'd. Heal: scope by the owner's workspace
 *   (resolveOwnedWorkspaceId, the listing sibling's resolution) and source
 *   estimated_cost from the appointment's invoice total — invoices links
 *   to appointments only via metadata->>'appointment_id'. The
 *   analytics_events count legs were already live (tenant_id is the Step 7
 *   DDL column) and are untouched.
 * - leads selected the full legacy column set. Heal: live select, then map
 *   each row back to the legacy shape the consumer
 *   (marketplace-provider.query.ts fetchMarketplaceLeads) reads.
 * - lead-status looked the appointment up by user_id; the 42703 lookup
 *   error converted every call — including the owner's own leads — into a
 *   misleading 403 "Not authorized for this lead". Heal: compare the
 *   appointment's workspace_id against the caller's owned workspace; the
 *   403 now only fires on a genuine mismatch.
 * - weather-guard at-risk selected the phantom set, filtered a
 *   scheduled_date window, and filtered .is("deleted_at", null). Heal:
 *   compose the AtRiskAppointment DTO from starts_at/ends_at, the
 *   locations embed (metadata fallback), the customer embed, and the first
 *   appointment service; weather_risk_score / weather_decision /
 *   weather_evaluated_at return null — there is no live source (no weather
 *   columns, no weather_risk_logs table, no writer in the repo).
 *
 * This guard pins the selects and the mappings, because mocked-supabase
 * tests cannot see this defect class (the Strip S2 lesson, same as the
 * job-runtime and tech-app workspace guards).
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/platform.ts"),
  "utf8",
);

const LIVE_COLUMNS: Record<string, ReadonlySet<string>> = {
  appointments: new Set([
    "assigned_user_id", "confirmation_code", "created_at", "created_by",
    "customer_id", "dispatch_status", "ends_at", "id", "location_id",
    "metadata", "notes", "source", "starts_at", "status", "updated_at",
    "vehicle_id", "workspace_id",
  ]),
  customers: new Set([
    "address_line1", "address_line2", "city", "company_name",
    "country_code", "created_at", "created_by", "email", "first_name",
    "id", "last_name", "metadata", "notes", "phone", "postal_code",
    "region", "status", "updated_at", "workspace_id",
  ]),
  vehicles: new Set([
    "color", "created_at", "customer_id", "id", "license_plate", "make",
    "metadata", "mileage", "mileage_unit", "model", "notes",
    "plate_region", "status", "trim", "updated_at", "vin", "workspace_id",
    "year",
  ]),
  locations: new Set([
    "address_line1", "address_line2", "city", "country_code",
    "created_at", "id", "is_active", "latitude", "location_type",
    "longitude", "name", "phone", "postal_code", "region", "updated_at",
    "workspace_id",
  ]),
  appointment_services: new Set([
    "added_at_service", "appointment_id", "created_at", "description",
    "id", "is_prepaid", "name", "price", "quantity", "service_catalog_id",
    "updated_at", "vehicle_id",
  ]),
  invoices: new Set([
    "amount_paid", "created_at", "created_by", "customer_id", "due_at",
    "id", "invoice_number", "issued_at", "metadata", "status", "subtotal",
    "tax_total", "total", "updated_at", "vehicle_id", "work_order_id",
    "workspace_id",
  ]),
};

function handlerSource(registration: string): string {
  const start = SOURCE.indexOf(registration);
  if (start < 0) throw new Error(`route not found: ${registration}`);
  const end = SOURCE.indexOf("platformRouter.", start + registration.length);
  if (end < 0) throw new Error(`handler is unterminated: ${registration}`);
  return SOURCE.slice(start, end);
}

function splitSelect(select: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of select) {
    if (ch === "(") depth += 1;
    if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function expectSelectLive(handler: string, table: string) {
  const fromIdx = handler.indexOf(`.from("${table}")`);
  if (fromIdx < 0) throw new Error(`handler has no ${table} query`);
  const select = handler.slice(fromIdx).match(/\.select\(\s*"([^"]+)"/);
  if (!select) throw new Error(`handler's ${table} query has no select`);
  for (const part of splitSelect(select[1])) {
    const embed = part.match(/^([a-z_]+)\(([^)]*)\)$/);
    if (embed) {
      const live = LIVE_COLUMNS[embed[1]];
      expect(live).toBeDefined();
      for (const col of embed[2].split(",").map((s) => s.trim())) {
        expect(live!.has(col)).toBe(true);
      }
    } else {
      expect(LIVE_COLUMNS[table].has(part)).toBe(true);
    }
  }
  return select[1];
}

const metrics = handlerSource('platformRouter.get("/v1/platform/marketplace/metrics"');
const leads = handlerSource('platformRouter.get("/v1/platform/marketplace/leads"');
const leadStatus = handlerSource('platformRouter.patch("/v1/platform/marketplace/lead-status"');
const atRisk = handlerSource('platformRouter.get("/v1/platform/weather-guard/at-risk"');

describe("marketplace metrics", () => {
  it("scopes appointments by the owned workspace and selects live columns", () => {
    expectSelectLive(metrics, "appointments");
    expect(metrics).toContain("resolveOwnedWorkspaceId(admin, userId)");
    expect(metrics).toContain('.eq("workspace_id", workspaceId)');
    expect(metrics).not.toContain('.eq("user_id", userId)');
  });

  it("sources estimated_cost from invoice totals and keeps the analytics legs", () => {
    expect(metrics).toContain("invoiceTotalsByAppointmentId(admin, workspaceId)");
    expect(metrics).toContain("estimated_cost: invoiceTotals.get(row.id) ?? null");
    expect(metrics).toContain('.eq("tenant_id", userId)');
    expect(metrics).toContain("MARKETPLACE_FUNNEL_EVENTS");
  });
});

describe("marketplace leads", () => {
  it("selects live columns, workspace-scoped, ordered by starts_at", () => {
    expectSelectLive(leads, "appointments");
    expect(leads).toContain('.eq("workspace_id", workspaceId)');
    expect(leads).toContain('.order("starts_at", { ascending: true })');
    expect(leads).not.toContain('.order("scheduled_date"');
    expect(leads).not.toContain("customers(name)");
  });

  it("maps rows back to the legacy lead shape the consumer reads", () => {
    expect(leads).toContain("title: null,");
    expect(leads).toContain("scheduled_date: startsAt.slice(0, 10)");
    expect(leads).toContain("scheduled_time: startsAt.slice(11, 19)");
    expect(leads).toContain("guest_name: displayName");
    expect(leads).toContain("guest_email: customer?.email ?? null");
    expect(leads).toContain("guest_phone: customer?.phone ?? null");
    expect(leads).toContain("estimated_cost: invoiceTotals.get(row.id as string) ?? null");
    expect(leads).toContain("customers: { name: displayName }");
  });
});

describe("marketplace lead-status", () => {
  it("authorizes on workspace ownership, not the phantom user_id", () => {
    expect(leadStatus).toContain('.from("appointments").select("workspace_id")');
    expect(leadStatus).toContain("appt.workspace_id !== ownedWorkspaceId");
    expect(leadStatus).not.toContain('.select("user_id")');
    expect(leadStatus).toContain('"Not authorized for this lead"');
  });
});

describe("weather-guard at-risk", () => {
  it("selects live columns with embeds and windows on starts_at", () => {
    expectSelectLive(atRisk, "appointments");
    expect(atRisk).toContain('.gte("starts_at", `${today}T00:00:00`)');
    expect(atRisk).not.toContain('.is("deleted_at", null)');
    expect(atRisk).not.toContain('.order("scheduled_date"');
  });

  it("composes the DTO and returns the unsourceable weather fields as null", () => {
    expect(atRisk).toContain("scheduled_date: startsAt.slice(0, 10)");
    expect(atRisk).toContain("duration_minutes:");
    expect(atRisk).toContain("guest_name: customerDisplayName(customer)");
    expect(atRisk).toContain("weather_risk_score: null");
    expect(atRisk).toContain("weather_decision: null");
    expect(atRisk).toContain("weather_evaluated_at: null");
  });
});

describe("shared helpers", () => {
  it("invoice totals hop through metadata.appointment_id, first invoice wins", () => {
    const start = SOURCE.indexOf("async function invoiceTotalsByAppointmentId");
    expect(start).toBeGreaterThan(-1);
    const helper = SOURCE.slice(start, SOURCE.indexOf("}", SOURCE.indexOf("return totals;", start)) + 1);
    expect(helper).toContain('.from("invoices")');
    expect(helper).toContain('.select("total, metadata")');
    expect(helper).toContain("metadata.appointment_id");
    expect(helper).toContain("!totals.has(appointmentId)");
  });
});
