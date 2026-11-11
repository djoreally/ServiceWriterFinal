/**
 * Schema contract for the tech-app jobs list (S1 jobs wire, 2026-11-11):
 * GET /v1/tech-app/jobs in src/server/hono/routes/work-orders.ts.
 *
 * The door serves the external tech app the caller's OWN assigned
 * appointments. Its selects are pinned to the LIVE production census of
 * 2026-11-10 (appointments / customers / vehicles / appointment_items /
 * service_catalog), because mocked-supabase tests cannot see phantom
 * columns (the Strip S2 lesson — same guard style as
 * tech-app-workspace-selects.test.ts). The handler must:
 * - register exactly once,
 * - scope every read to the caller's workspace,
 * - key the assignment filter on assigned_user_id (the column the
 *   canonical assign write stamps), never a phantom user_id key,
 * - select only live columns on every table it touches.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const SOURCE = readFileSync(
  join(repoRoot, "src/server/hono/routes/work-orders.ts"),
  "utf8",
);

function handlerBlock(): string {
  const start = SOURCE.indexOf('workOrdersRouter.get("/v1/tech-app/jobs"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("workOrdersRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("GET /v1/tech-app/jobs — registration + scoping", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/workOrdersRouter\.get\("\/v1\/tech-app\/jobs"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("resolves the caller's workspace before reading", () => {
    expect(handlerBlock()).toContain("requireCallerWorkspaceId(c)");
  });

  it("scopes appointments to the workspace and the caller's assignments", () => {
    const block = handlerBlock();
    expect(block).toContain('.eq("workspace_id", workspaceId)');
    expect(block).toContain('.eq("assigned_user_id", user.id)');
    expect(block).not.toContain('.eq("user_id"');
  });

  it("excludes cancelled jobs and windows on starts_at", () => {
    const block = handlerBlock();
    expect(block).toContain('.neq("status", "cancelled")');
    expect(block).toContain('.gte("starts_at", windowStart)');
    expect(block).toContain('.lt("starts_at", windowEnd)');
  });
});

describe("GET /v1/tech-app/jobs — live-column selects", () => {
  it("appointments select names only live columns", () => {
    expect(handlerBlock()).toContain(
      '.select("id, workspace_id, customer_id, vehicle_id, assigned_user_id, status, dispatch_status, starts_at, ends_at, source, confirmation_code, notes, metadata, created_at")',
    );
  });

  it("customers select names only live columns", () => {
    expect(handlerBlock()).toContain(
      '.select("id, first_name, last_name, company_name, email, phone, address_line1, address_line2, city, region, postal_code")',
    );
  });

  it("vehicles select names only live columns", () => {
    expect(handlerBlock()).toContain('.select("id, vin, year, make, model, trim")');
  });

  it("appointment_items select + catalog embed name only live columns", () => {
    const block = handlerBlock();
    expect(block).toContain(
      '.select("id, appointment_id, service_catalog_id, item_type, description, quantity, unit_price, sort_order, service_catalog(id, name)")',
    );
    // The phantom the healed v2 handler documents: never regress to it.
    // (The exact-string pins above lock the selects themselves; a blanket
    // "duration_minutes" ban would false-positive on the canonical DTO
    // field estimated_duration_minutes, which is not a column.)
    expect(block).not.toContain("base_price");
  });
});
