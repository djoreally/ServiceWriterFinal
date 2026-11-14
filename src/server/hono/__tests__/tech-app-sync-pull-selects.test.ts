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
    // The appointments reads must never key on user_id (appointments
    // has no such live column for assignment). The technicians read
    // in SYNC-1b legitimately keys on technicians.user_id — that is
    // that table's real column — so the negative check is scoped to
    // the appointments segments only.
    const appointmentSegments = block.split('.from("appointments")').slice(1);
    expect(appointmentSegments.length).toBeGreaterThan(0);
    for (const segment of appointmentSegments) {
      const statement = segment.slice(0, segment.indexOf(";"));
      expect(statement).not.toContain('.eq("user_id", user.id)');
    }
  });
});

describe("GET /v1/tech-app/sync/pull — live-census selects", () => {
  it("selects appointments.updated_at for incremental bucketing", () => {
    expect(handlerBlock()).toContain(
      "id, workspace_id, customer_id, vehicle_id, assigned_user_id, status, dispatch_status, starts_at, ends_at, source, confirmation_code, notes, metadata, created_at, updated_at, completed_at",
    );
  });

  it("composes the persisted completion stamp onto the sync row (SW-87)", () => {
    expect(handlerBlock()).toContain(
      "completedAt: (appt.completed_at as string | null) ?? null",
    );
  });

  it("selects vehicles.mileage + license_plate for the local mileage_in / plate columns", () => {
    expect(handlerBlock()).toContain("id, vin, year, make, model, trim, mileage, license_plate");
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
    expect(block).toContain("jobs: jobChanges");
    expect(block).toContain('searchParams.get("last_pulled_at")');
  });
});

describe("tech-app window horizon (Ty's ruling, 2026-11-11)", () => {
  it("both tech-app doors look +31 days out, never +8", () => {
    // At +8 days the Nov 21 and Nov 23 jobs were invisible on the
    // phone no matter their assignment; Ty ruled the phone shows
    // the whole coming month. Pin the horizon so it cannot shrink
    // back silently.
    expect(SOURCE).not.toContain("8 * 24 * 60 * 60 * 1000");
  });

  it("both tech-app doors look −31 days back, symmetric with the horizon (2026-11-14)", () => {
    // At the old −36 hours a job completed earlier in the month
    // fell out of every full pull and vanished off the phone
    // (Dave's Nov 12 completed jobs, lost on the Nov 13 redeploys'
    // fresh pulls — the server records never changed). The
    // look-back widened to match the forward month on both doors:
    // the 31-day span now appears exactly four times in this file
    // (windowStart + windowEnd on the jobs door and on the pull).
    expect(SOURCE.match(/31 \* 24 \* 60 \* 60 \* 1000/g) ?? []).toHaveLength(4);
    expect(SOURCE.match(/new Date\((now|timestamp) - 31 \* 24 \* 60 \* 60 \* 1000\)/g) ?? [])
      .toHaveLength(2);
  });

  it("the only 36h look-back left is the location pings' own window", () => {
    // GPS history is a live trail, not a job record: when the
    // appointment window widened, the pings kept their transient
    // 36h look-back on a dedicated variable so they never widen.
    expect(SOURCE.match(/36 \* 60 \* 60 \* 1000/g) ?? []).toHaveLength(1);
    expect(SOURCE).toContain(
      "const locationWindowStart = new Date(timestamp - 36 * 60 * 60 * 1000).toISOString();",
    );
  });
});

describe("GET /v1/tech-app/sync/pull — SYNC-1b child selects (live census)", () => {
  it("selects service_inspections by appointment scope", () => {
    const block = handlerBlock();
    expect(block).toContain(
      "id, appointment_id, user_id, notes, status, created_at, updated_at",
    );
    expect(block).toContain('.from("service_inspections")');
    expect(block).toContain('.in("appointment_id", scopedAppointmentIds)');
  });

  it("selects inspection_results by inspection scope, ordered by sort_order", () => {
    const block = handlerBlock();
    expect(block).toContain(
      "id, inspection_id, item_name, item_category, status, notes, sort_order, created_at",
    );
    expect(block).toContain('.from("inspection_results")');
    expect(block).toContain('.in("inspection_id", inspectionIds)');
  });

  it("selects service_recommendations and job_photos by appointment scope", () => {
    const block = handlerBlock();
    expect(block).toContain(
      "id, appointment_id, inspection_id, inspection_result_id, description, technician_notes, price, created_at, updated_at",
    );
    expect(block).toContain('.from("service_recommendations")');
    expect(block).toContain(
      "id, appointment_id, technician_id, user_id, photo_type, photo_url, storage_path, caption, created_at",
    );
    expect(block).toContain('.from("job_photos")');
  });

  it("scopes locations to the caller's technicians row, never a workspace column location_history lacks", () => {
    const block = handlerBlock();
    expect(block).toContain(
      "id, technician_id, latitude, longitude, accuracy, heading, speed, recorded_at",
    );
    expect(block).toContain('.from("location_history")');
    expect(block).toContain('.eq("technician_id", technicianRes.data.id as string)');
    expect(block).toContain('.gte("recorded_at", locationWindowStart)');
  });

  it("returns all six synced tables in the change set", () => {
    const block = handlerBlock();
    expect(block).toContain("inspection_reports: reportChanges");
    expect(block).toContain("inspection_steps: stepChanges");
    expect(block).toContain("recommendations: recommendationChanges");
    expect(block).toContain("job_photos: photoChanges");
    expect(block).toContain("technician_locations: locationChanges");
  });
});
