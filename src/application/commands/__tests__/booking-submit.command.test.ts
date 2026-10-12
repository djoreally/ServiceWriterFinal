/**
 * Guards the current public-booking appointment contract.
 *
 * Browser booking writes go through the Hono appointments boundary. The live
 * compatibility name (v2) is intentionally retained until the UI passes the
 * address directly to v3, but the database v2 contract must fail closed when
 * no staged service address exists and delegate creation to v3.
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
} as const;

describe("bookAppointmentSafe", () => {
  beforeEach(() => mockPost.mockClear());

  it("routes booking creation through the Hono appointments boundary", async () => {
    await bookAppointmentSafe(baseParams);

    expect(mockPost).toHaveBeenCalledWith(
      "/v1/appointments/booking-rpc",
      {
        fn: "public_booking_book_appointment_v2",
        params: expect.objectContaining({
          p_booking_slug: "test-booking",
          p_vehicle_id: "11111111-1111-4111-8111-111111111111",
          p_status: "confirmed",
        }),
      },
    );
  });

  it("fails before the RPC when vehicle persistence is missing", async () => {
    await expect(bookAppointmentSafe({ ...baseParams, p_vehicle_id: null })).rejects.toThrow(
      "BOOKING_VEHICLE_REQUIRED",
    );
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

  it("forces the legacy v2 signature through the location-aware v3 contract", () => {
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
