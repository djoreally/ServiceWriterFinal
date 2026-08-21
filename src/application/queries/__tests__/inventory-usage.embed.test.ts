import { readFileSync } from "fs";
import { join } from "path";

/**
 * Guard: services <-> appointments has TWO foreign keys
 * (appointments.service_record_id -> services.id and services.appointment_id -> appointments.id).
 * Any embed of appointments from services MUST name the relationship, otherwise the
 * Data API fails with "more than one relationship was found".
 */
describe("inventory-usage query embed disambiguation", () => {
  const source = readFileSync(
    join(process.cwd(), "src/application/queries/inventory-usage.query.ts"),
    "utf8",
  );

  it("names the services_appointment_id_fkey relationship", () => {
    expect(source).toContain("appointments!services_appointment_id_fkey");
  });

  it("has no bare appointments embed", () => {
    expect(source).not.toMatch(/\n\s*appointments\s*\(/);
  });
});
