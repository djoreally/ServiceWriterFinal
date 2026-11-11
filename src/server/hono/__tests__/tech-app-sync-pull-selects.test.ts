/**
 * Schema contract for the tech-app sync pull (SYNC-1, 2026-11-11):
 * GET /v1/tech-app/sync/pull in src/server/hono/routes/work-orders.ts.
 *
 * The door is the server half of the Watermelon synchronize()
 * protocol the external tech app calls. Its selects are pinned to
 * the LIVE production census (2026-11-10, same guard style as
 * tech-app-jobs-selects.test.ts) because mocked-supabase tests
 * cannot see phantom columns. The handler must:
 * - register exactly once,
 * - resolve the caller's workspace server-side and scope every read
 *   to it,
 * - key the assignment filter on assigned_user_id (the column the
 *   canonical assign write stamps), never a phantom user_id key,
 * - select only live columns on every table it touches, including
 *   appointments.updated_at (the incremental change stamp) and
 *   vehicles.mileage (the local schema's mileage_in source),
 * - answer in the protocol shape: { data: { changes, timestamp } }.
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
  const start = SOURCE.indexOf('workOrdersRouter.get("/v1/tech-app/sync/pull"');
  expect(start).toBeGreaterThan(-1);
  const rest = SOURCE.slice(start + 10);
  const next = rest.indexOf("workOrdersRouter.");
  return next === -1 ? rest : rest.slice(0, next);
}

describe("GET /v1/tech-app/sync/pull — registration + scoping", () => {
  it("registers exactly once", () => {
    const matches = SOURCE.match(/workOrdersRouter\.get\("\/v1\/tech-app\/sync\/pull"/g) ?? [];
    expect(matches).toHaveLength(1);
  });

  it("resolves the caller's workspace server-side and scopes to it", () => {
    const block = handlerBlock();
    expect(block).toContain("requireCallerWorkspaceId(c)");
    expect(block).toContain('.eq("workspace_id", workspaceId)');
  });

  it("keys assignment on assigned_user_id, never a user_id column", () => {
    const block = handlerBlock();
    expect(block).toContain('.eq("assigned_user_id", user.id)');
    expect(block).not.toContain('.eq("user_id", user.id)');
  });
});

describe("GET /v1/tech-app/sync/pull — live-census selects", () => {
  it("selects appointments.updated_at for incremental bucketing", () => {
    expect(handlerBlock()).toContain(
      "id, workspace_id, customer_id, vehicle_id, assigned_user_id, status, dispatch_status, starts_at, ends_at, source, confirmation_code, notes, metadata, created_at, updated_at",
    );
  });

  it("selects vehicles.mileage for the local mileage_in column", () => {
    expect(handlerBlock()).toContain("id, vin, year, make, model, trim, mileage");
  });

  it("reuses the jobs door's customer and item selects verbatim", () => {
    const block = handlerBlock();
    expect(block).toContain(
      "id, first_name, last_name, company_name, email, phone, address_line1, address_line2, city, region, postal_code",
    );
    expect(block).toContain(
      "id, appointment_id, service_catalog_id, item_type, description, quantity, unit_price, sort_order, service_catalog(id, name)",
    );
  });
});

describe("GET /v1/tech-app/sync/pull — protocol shape", () => {
  it("buckets through the pure sync query module and returns changes + timestamp", () => {
    const block = handlerBlock();
    expect(block).toContain("bucketJobChanges(composed, lastPulledAt, extraDeletedIds)");
    expect(block).toContain("json({ data: { changes: { jobs: changes }, timestamp } })");
    expect(block).toContain('searchParams.get("last_pulled_at")');
  });
});
