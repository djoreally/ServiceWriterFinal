/**
 * SW-68: POST /v1/public-bookings/recall-lookup — the booking
 * recall door.
 *
 * Contract under test:
 * - Public: no session is required (booking guests carry none),
 *   unlike the auth-mounted /v1/vin/* sibling routes.
 * - Fail-soft, always: a lookup failure, an invalid VIN, or a
 *   garbage body all answer 200 with { data: { success: false } }
 *   — "no data" — so the booking UI shows nothing and a lookup
 *   problem can never block a booking.
 * - A successful lookup rides the standard { data } envelope with
 *   the decoded vehicle and its campaigns.
 */
import { describe, it, expect, jest } from "@jest/globals";
import { installWebGlobals as mockInstallWebGlobals } from "../test-support/webGlobals";
import { makeSupabaseLibMock as mockMakeSupabaseLibMock } from "../test-support/moduleMocks";

jest.mock("next/server", () => {
  mockInstallWebGlobals();
  return jest.requireActual("next/server");
});
jest.mock("@/lib/supabase", () => mockMakeSupabaseLibMock());
jest.mock("@/server/appointments/auto-dispatch", () => ({
  attemptAutoDispatchNewAppointment: jest.fn(async () => null),
}));
jest.mock("@/server/hono/lib/nhtsa-recalls", () => ({
  lookupRecallsByVin: jest.fn(),
}));

import { publicBookingRouter } from "../routes/public-booking";
import { lookupRecallsByVin } from "@/server/hono/lib/nhtsa-recalls";
import { testRouter } from "../test-support/routerTest";

const lookupMock = lookupRecallsByVin as unknown as jest.Mock;

const app = testRouter(publicBookingRouter);
const PATH = "/v1/public-bookings/recall-lookup";
const TRANSIT_VIN = "1FTBR1Y86PKB51521";

function post(body: unknown, rawBody?: string) {
  return app.request(PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: rawBody ?? JSON.stringify(body),
  });
}

describe("POST /v1/public-bookings/recall-lookup", () => {
  it("answers a successful lookup in the { data } envelope, no session required", async () => {
    lookupMock.mockResolvedValue({
      success: true,
      vehicle: { year: 2023, make: "FORD", model: "Transit" },
      campaigns: [
        {
          campaignNumber: "22V791000",
          component: "ELECTRICAL SYSTEM",
          summary: "S",
          consequence: "C",
          remedy: "R",
          reportReceivedDate: "20/10/2022",
        },
      ],
    });
    // Deliberately no Authorization header: booking guests have none.
    const res = await post({ vin: TRANSIT_VIN });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean; campaigns: unknown[] } };
    expect(body.data.success).toBe(true);
    expect(body.data.campaigns).toHaveLength(1);
    expect(lookupMock).toHaveBeenCalledWith(TRANSIT_VIN);
  });

  it("answers a failed lookup as 200 + success:false (fail-soft, never a 500)", async () => {
    lookupMock.mockResolvedValue({ success: false, error: "Recalls unavailable" });
    const res = await post({ vin: TRANSIT_VIN });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(false);
  });

  it("answers a garbage JSON body as 200 + success:false", async () => {
    lookupMock.mockResolvedValue({ success: false, error: "Invalid VIN" });
    const res = await post(null, "{not json");
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(false);
    expect(lookupMock).toHaveBeenCalledWith("");
  });

  it("answers a missing vin field as 200 + success:false", async () => {
    lookupMock.mockResolvedValue({ success: false, error: "Invalid VIN" });
    const res = await post({});
    expect(res.status).toBe(200);
    const body = (await res.json()) as { data: { success: boolean } };
    expect(body.data.success).toBe(false);
  });
});
