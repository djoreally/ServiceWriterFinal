/**
 * Guards the booking submission RPC contract.
 *
 * Regression: production carried two `book_appointment_safe` overloads (with and
 * without `p_status`). Named-argument calls resolved to whichever Postgres
 * preferred, and the extra-argument overload had no EXECUTE grant for guests, so
 * every public booking failed with "permission denied for function
 * book_appointment_safe". The database now has exactly one signature — the one
 * that takes `p_status` — so the client must always send that argument.
 */

const mockRpc = jest.fn().mockResolvedValue({ data: "appt-1", error: null });

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { bookAppointmentSafe } from "../booking-submit.command";

const baseParams = {
  p_business_user_id: "00000000-0000-0000-0000-000000000001",
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
  p_vehicle_id: null,
};

describe("bookAppointmentSafe", () => {
  beforeEach(() => mockRpc.mockClear());

  it("always sends p_status so the single supported overload resolves", async () => {
    await bookAppointmentSafe(baseParams);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("book_appointment_safe");
    expect(args).toHaveProperty("p_status", "confirmed");
  });

  it("preserves an explicit pending status for shops requiring approval", async () => {
    await bookAppointmentSafe({ ...baseParams, p_status: "pending" });
    expect(mockRpc.mock.calls[0][1]).toHaveProperty("p_status", "pending");
  });
});
