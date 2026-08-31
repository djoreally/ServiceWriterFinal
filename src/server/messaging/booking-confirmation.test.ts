const dispatchLifecycleEvent = jest.fn();
const createSupabaseAdminClient = jest.fn();

jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: (...args: unknown[]) => dispatchLifecycleEvent(...args),
  LIFECYCLE_EVENT_KEYS: {
    bookingCreated: "appointment_booking_sequence.booking_confirmation",
    newAppointmentBooked: "appointment_booking_sequence.new_appointment_booked",
  },
}));

jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: (...args: unknown[]) => createSupabaseAdminClient(...args),
}));

import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";

describe("booking confirmation recipient fanout", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    dispatchLifecycleEvent.mockResolvedValue({ status: "queued" });
    createSupabaseAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { created_by: "owner-1" }, error: null }),
      }),
      auth: {
        admin: {
          getUserById: jest.fn().mockResolvedValue({ data: { user: { email: "owner@example.com" } }, error: null }),
        },
      },
    });
  });

  it("queues customer and owner events with stable, distinct event identities", async () => {
    const input = {
      appointment: {
        id: "00000000-0000-4000-8000-000000000002",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        customer_id: "00000000-0000-4000-8000-000000000003",
        starts_at: "2026-09-01T14:00:00.000Z",
        ends_at: "2026-09-01T15:00:00.000Z",
        status: "confirmed",
        notes: null,
        metadata: { guest_name: "Jordan Smith", guest_email: "customer@example.com" },
      },
      workspaceName: "MOMS",
      workspaceTimezone: "America/New_York",
      recipientEmail: "customer@example.com",
      actionUrl: "https://servicewriter.xyz/booking/moms/confirmation",
    };

    await sendBookingConfirmation(input);
    await sendBookingConfirmation(input);

    const calls = dispatchLifecycleEvent.mock.calls.map(([event]) => event);
    expect(calls).toHaveLength(4);
    expect(calls.filter((event) => event.recipientRole === "customer")).toEqual([
      expect.objectContaining({
        eventId: input.appointment.id,
        recipientEmail: "customer@example.com",
        templateKey: "appointment_booking_sequence.booking_confirmation",
      }),
      expect.objectContaining({ eventId: input.appointment.id }),
    ]);
    expect(calls.filter((event) => event.recipientRole === "shop_owner")).toEqual([
      expect.objectContaining({
        eventId: `${input.appointment.id}:shop-owner`,
        recipientEmail: "owner@example.com",
        templateKey: "appointment_booking_sequence.new_appointment_booked",
      }),
      expect.objectContaining({ eventId: `${input.appointment.id}:shop-owner` }),
    ]);
  });

  it("does not duplicate the owner recipient when the customer is the owner", async () => {
    createSupabaseAdminClient.mockReturnValue({
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { created_by: "owner-1" }, error: null }),
      }),
      auth: { admin: { getUserById: jest.fn().mockResolvedValue({ data: { user: { email: "owner@example.com" } } }) } },
    });

    await sendBookingConfirmation({
      appointment: {
        id: "00000000-0000-4000-8000-000000000002",
        workspace_id: "00000000-0000-4000-8000-000000000001",
        customer_id: null,
        starts_at: "2026-09-01T14:00:00.000Z",
        ends_at: "2026-09-01T15:00:00.000Z",
        status: "confirmed",
        notes: null,
        metadata: null,
      },
      workspaceName: "MOMS",
      workspaceTimezone: "America/New_York",
      recipientEmail: "OWNER@example.com",
      actionUrl: "https://servicewriter.xyz/booking/moms/confirmation",
    });

    expect(dispatchLifecycleEvent).toHaveBeenCalledTimes(1);
  });
});
