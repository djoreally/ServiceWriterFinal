import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const route = readFileSync(join(process.cwd(), "src/server/hono/routes/moms-booking-sync.ts"), "utf8");
const migration = readFileSync(join(process.cwd(), "supabase/migrations/20261026000100_moms_booking_sync_events.sql"), "utf8");
const app = readFileSync(join(process.cwd(), "src/server/hono/app.ts"), "utf8");

describe("MOMS booking sync boundary", () => {
  it("mounts a dedicated signed server-to-server route", () => {
    expect(app).toContain('app.route("/", momsBookingSyncRouter)');
    expect(route).toContain('momsBookingSyncRouter.post("/v1/integrations/moms/bookings"');
    expect(route).toContain('c.req.header("x-moms-signature")');
    expect(route).toContain("timingSafeEqual");
    expect(route).toContain("MOMS_BOOKING_WEBHOOK_SECRET");
  });

  it("uses a durable unique source-booking ledger and tracks partial progress", () => {
    expect(migration).toContain("source_booking_id text NOT NULL UNIQUE");
    expect(migration).toContain("service_lines_synced boolean NOT NULL DEFAULT false");
    expect(route).toContain('eq("source_booking_id", payload.sourceBookingId)');
    expect(route).toContain("MOMS_SOURCE_BOOKING_ID=");
  });

  it("creates the appointment through the canonical v3 booking function", () => {
    expect(route).toContain('admin.rpc("public_booking_book_appointment_v3"');
    expect(route).toContain("p_location_address:");
    expect(route).toContain("p_vehicle_id: vehicleId");
  });
});
