/**
 * Push-stamp payload contract for the website backend client.
 *
 * The stamp tells the MOMS website backend that a booking now lives in
 * Service Writer. Since the booking-notifications build, the stamp also
 * carries the appointment's customer-portal management token (when the
 * appointment has one) so the backend can store it as
 * bookings.sw_management_token and drive reschedule-by-token from its
 * customer manage page. A tokenless stamp must stay byte-identical to
 * the original payload — the token is an addition, never a gate.
 */
import { stampWebsiteBookingPushed, type WebsiteBookingsConfig } from "../../website-bookings/client";

const config: WebsiteBookingsConfig = { baseUrl: "https://backend.test", secret: "test-secret" };

describe("stampWebsiteBookingPushed", () => {
  let fetchMock: jest.Mock;

  beforeEach(() => {
    fetchMock = jest.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { id: "booking-1", pushed_sw_appointment_id: "appt-1", pushed_at: "2026-11-04T00:00:00Z" } }),
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  function lastRequestBody(): Record<string, unknown> {
    const [, init] = fetchMock.mock.calls[0] as [string, { body: string }];
    return JSON.parse(init.body) as Record<string, unknown>;
  }

  it("includes managementToken when the appointment has one", async () => {
    await stampWebsiteBookingPushed(config, "booking-1", "appt-1", "a".repeat(48));

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; headers: Record<string, string> }];
    expect(url).toBe("https://backend.test/internal/website-bookings/booking-1/push-stamp");
    expect(init.method).toBe("POST");
    expect(init.headers["x-sw-push-secret"]).toBe("test-secret");
    expect(lastRequestBody()).toEqual({
      sw_appointment_id: "appt-1",
      managementToken: "a".repeat(48),
    });
  });

  it("omits managementToken when no token is provided", async () => {
    await stampWebsiteBookingPushed(config, "booking-1", "appt-1");

    expect(lastRequestBody()).toEqual({ sw_appointment_id: "appt-1" });
    expect(lastRequestBody()).not.toHaveProperty("managementToken");
  });

  it("omits managementToken when the token is null or empty", async () => {
    await stampWebsiteBookingPushed(config, "booking-1", "appt-1", null);
    expect(lastRequestBody()).not.toHaveProperty("managementToken");

    fetchMock.mockClear();
    await stampWebsiteBookingPushed(config, "booking-1", "appt-1", "");
    expect(lastRequestBody()).not.toHaveProperty("managementToken");
  });
});
