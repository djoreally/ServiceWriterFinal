import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard: services <-> appointments has TWO foreign keys
 * (appointments.service_record_id -> services.id and services.appointment_id -> appointments.id).
 * Any embed of appointments from services MUST name the relationship, otherwise the
 * Data API fails with "more than one relationship was found".
 *
 * The oil-usage bundle now comes from GET /v1/inventory/oil-usage (Hono
 * route in src/server/hono/routes/work-orders.ts), which sidesteps the
 * ambiguity entirely: it reads service_records plainly and fetches the
 * appointments in a separate by-id query. These assertions pin that —
 * the handler must never reintroduce an appointments embed.
 */
describe("inventory-usage query embed disambiguation", () => {
  const clientSource = readFileSync(
    join(process.cwd(), "src/application/queries/inventory-usage.query.ts"),
    "utf8",
  );
  const routeSource = readFileSync(
    join(process.cwd(), "src/server/hono/routes/work-orders.ts"),
    "utf8",
  );
  const handlerStart = routeSource.indexOf('"/v1/inventory/oil-usage"');
  const handler = routeSource.slice(
    handlerStart,
    routeSource.indexOf("workOrdersRouter.", handlerStart),
  );

  it("fetches appointments in a separate query instead of an ambiguous embed", () => {
    expect(handlerStart).toBeGreaterThan(-1);
    expect(handler).toContain('.from("appointments")');
    expect(handler).not.toMatch(/appointments\s*\(/);
    expect(handler).not.toMatch(/appointments!/);
  });

  it("has no bare appointments embed", () => {
    expect(clientSource).not.toMatch(/\n\s*appointments\s*\(/);
    expect(handler).not.toMatch(/\n\s*appointments\s*\(/);
  });
});
