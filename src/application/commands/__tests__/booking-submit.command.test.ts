/**
 * Guards the canonical public-booking appointment contract.
 *
 * Browser booking creation goes through a typed Hono endpoint. The browser no
 * longer selects the database appointment RPC name; Hono owns the v3 call and
 * requires the service location in the creation payload.
 */

const mockPost = jest.fn().mockResolvedValue({ data: "appt-1", error: null });

jest.mock("@/lib/api-client", () => ({
  apiClient: { post: (...args: unknown[]) => mockPost(...args) },
}));

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signUp: jest.fn() } },
}));

import { bookAppointmentSafe } from "../booking-submit.command";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const baseParams = {
  p_booking_slug: "test-booking",
  p_scheduled_date: "2026-09-01",
  p_scheduled_time: "10:00",
  p_duration_minutes: 60,
  p_title: "Full Synthetic Oil Change",
  p_guest_name: "Test Guest",
  p_guest_email: "guest@example.com",
  p_guest_phone: "+12155550123",
  p_description: "Oil change",
  p_notes: null,
  p_estimated_cost: 120,
  p_tax_amount: 0,
  p_service_catalog_id: null,
  p_vehicle_id: "11111111-1111-4111-8111-111111111111",
  p_location_address: "123 Test Street, Philadelphia, PA 19103",
  p_location_lat: 39.9526,
  p_location_lng: -75.1652,
} as const;

describe("bookAppointmentSafe", () => {
  beforeEach(() => mockPost.mockClear());

  it("routes booking creation through the canonical Hono public-booking boundary with explicit location", async () => {
    await bookAppointmentSafe(baseParams);

    expect(mockPost).toHaveBeenCalledWith(
      "/v1/public-bookings/appointments",
      expect.objectContaining({
        p_booking_slug: "test-booking",
        p_vehicle_id: "11111111-1111-4111-8111-111111111111",
        p_location_address: "123 Test Street, Philadelphia, PA 19103",
        p_location_lat: 39.9526,
        p_location_lng: -75.1652,
        p_status: "confirmed",
      }),
    );
  });

  it("fails before the API when vehicle persistence is missing", async () => {
    await expect(bookAppointmentSafe({ ...baseParams, p_vehicle_id: null })).rejects.toThrow(
      "BOOKING_VEHICLE_REQUIRED",
    );
    expect(mockPost).not.toHaveBeenCalled();
  });

  it("fails closed when the appointment has no explicit service location", async () => {
    await expect(bookAppointmentSafe({
      ...baseParams,
      p_location_address: "   ",
    })).rejects.toThrow("BOOKING_LOCATION_REQUIRED");
    expect(mockPost).not.toHaveBeenCalled();
  });
});

describe("public booking appointment location contract", () => {
  const canonicalMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20261009173500_atomic_start_and_public_booking_location.sql"),
    "utf8",
  );
  const compatibilityMigration = readFileSync(
    join(process.cwd(), "supabase/migrations/20261009174200_enforce_location_on_legacy_public_booking_v2.sql"),
    "utf8",
  );

  it("creates a dedicated location before inserting the canonical appointment", () => {
    const functionBody = canonicalMigration.match(
      /create or replace function public\.public_booking_book_appointment_v3\([\s\S]*?\n\$\$;/i,
    )?.[0];

    expect(functionBody).toBeDefined();
    expect(functionBody).toMatch(/BOOKING_LOCATION_REQUIRED/i);
    expect(functionBody).toMatch(/insert into public\.locations[\s\S]*?returning id into v_location_id/i);
    expect(functionBody).toMatch(/insert into public\.appointments[\s\S]*?location_id[\s\S]*?v_location_id/i);
    expect(functionBody).toMatch(/returning id into v_appointment_id/i);
  });

  it("keeps the legacy v2 compatibility function safe while older clients drain", () => {
    expect(compatibilityMigration).toMatch(/BOOKING_LOCATION_REQUIRED/i);
    expect(compatibilityMigration).toMatch(/public\.public_booking_book_appointment_v3\(/i);
    expect(compatibilityMigration).not.toMatch(/insert into public\.appointments/i);
  });

  it("keeps SECURITY DEFINER booking functions on an empty search path", () => {
    const canonicalHeader = canonicalMigration.match(
      /create or replace function public\.public_booking_book_appointment_v3\([\s\S]*?as \$\$/i,
    )?.[0];
    const compatibilityHeader = compatibilityMigration.match(
      /create or replace function public\.public_booking_book_appointment_v2\([\s\S]*?as \$\$/i,
    )?.[0];

    expect(canonicalHeader).toMatch(/security definer[\s\S]*?set search_path = ''/i);
    expect(compatibilityHeader).toMatch(/security definer[\s\S]*?set search_path = ''/i);
  });
});
