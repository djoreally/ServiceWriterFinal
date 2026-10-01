const sendLifecycleEmail = jest.fn();
const createSupabaseAdminClient = jest.fn();

jest.mock("@/server/messaging/lifecycle-sender", () => ({
  sendLifecycleEmail: (...args: unknown[]) => sendLifecycleEmail(...args),
}));

jest.mock("@/server/messaging/lifecycle-events", () => ({
  dispatchLifecycleEvent: jest.fn().mockResolvedValue({ status: "queued" }),
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
    sendLifecycleEmail.mockResolvedValue({ status: "sent" });
    createSupabaseAdminClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { created_by: "owner-1" }, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
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

    const calls = sendLifecycleEmail.mock.calls.map(([event]) => event);
    expect(calls).toHaveLength(4);
    expect(calls.filter((event) => event.variables["email.recipient_role"] === "customer")).toEqual([
      expect.objectContaining({
        recipientEmail: "customer@example.com",
        templateKey: "appointment_booking_sequence.booking_confirmation",
      }),
      expect.objectContaining({
        recipientEmail: "customer@example.com",
      }),
    ]);
    expect(calls.filter((event) => event.variables["email.recipient_role"] === "shop_owner")).toEqual([
      expect.objectContaining({
        recipientEmail: "owner@example.com",
        templateKey: "appointment_booking_sequence.new_appointment_booked",
      }),
      expect.objectContaining({
        recipientEmail: "owner@example.com",
      }),
    ]);
  });

  it("does not duplicate the owner recipient when the customer is the owner", async () => {
    createSupabaseAdminClient.mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
      from: jest.fn().mockReturnValue({
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { created_by: "owner-1" }, error: null }),
        maybeSingle: jest.fn().mockResolvedValue({ data: null, error: null }),
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

    expect(sendLifecycleEmail).toHaveBeenCalledTimes(1);
  });
});
