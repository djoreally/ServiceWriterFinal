/**
 * Fix 3 parity pins for the Hono appointments handlers.
 *
 * Production serves GET /v1/appointments from the legacy shadow route
 * (app/api/v1/appointments/route.ts); the Hono twin must stay in step
 * until the migration removes the shadow (the Nov 6 list-card holdout
 * was exactly a drift between these two). The shadow's window behavior
 * is covered behaviorally in
 * src/server/__tests__/api-routes/appointments.test.ts; these pins keep
 * the Hono list window and the service-lines scoping from drifting.
 */
import { describe, it, expect } from "@jest/globals";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const repoRoot = join(__dirname, "..", "..", "..", "..");
const source = readFileSync(
  join(repoRoot, "src/server/hono/routes/appointments.ts"),
  "utf8",
);

function handlerSlice(route: string, length = 1600): string {
  const idx = source.indexOf(route);
  if (idx < 0) throw new Error(`handler ${route} not found`);
  return source.slice(idx, idx + length);
}

describe("Hono appointments window parity (Fix 3)", () => {
  it("GET /v1/appointments applies the optional from/to starts_at window", () => {
    const slice = handlerSlice('appointmentsRouter.get("/v1/appointments"');
    expect(slice).toContain('searchParams.get("from")');
    expect(slice).toContain('searchParams.get("to")');
    expect(slice).toContain('gte("starts_at", from)');
    expect(slice).toContain('lt("starts_at", to)');
  });

  it("GET /v1/appointments/service-lines scopes by appointment_ids when given", () => {
    const slice = handlerSlice('"/v1/appointments/service-lines"', 2000);
    expect(slice).toContain('searchParams.get("appointment_ids")');
    expect(slice).toContain('in("appointment_id", appointmentIds)');
  });
});
