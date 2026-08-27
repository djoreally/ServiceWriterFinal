/**
 * Guards the slug-bound public booking RPC contract.
 *
 * The public client must never choose a tenant by trusting a caller-supplied
 * business user UUID. The secure RPC resolves the workspace from the booking
 * slug and still requires an explicit p_status argument.
 */

const mockRpc = jest.fn().mockResolvedValue({ data: "appt-1", error: null });

jest.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => mockRpc(...args) },
}));

import { bookAppointmentSafe } from "../booking-submit.command";

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
  p_vehicle_id: null,
};

describe("bookAppointmentSafe", () => {
  beforeEach(() => mockRpc.mockClear());

  it("always sends p_status so the single supported overload resolves", async () => {
    await bookAppointmentSafe(baseParams);
    const [fn, args] = mockRpc.mock.calls[0];
    expect(fn).toBe("public_booking_book_appointment");
    expect(args).toHaveProperty("p_status", "confirmed");
  });

  it("preserves an explicit pending status for shops requiring approval", async () => {
    await bookAppointmentSafe({ ...baseParams, p_status: "pending" });
    expect(mockRpc.mock.calls[0][1]).toHaveProperty("p_status", "pending");
  });
});
