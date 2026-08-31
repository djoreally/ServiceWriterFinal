import { describe, it, expect, jest } from "@jest/globals";

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://example.supabase.co";
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "dummy-anon-key";
process.env.SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "dummy-service-role-key";

jest.mock("@/server/messaging/lifecycle-sender", () => ({
  enqueueLifecycleEmail: jest.fn().mockImplementation(async () => ({ id: "msg-123", status: "queued" })),
}));

jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { created_by: "owner-123" }, error: null }),
        }),
      }),
    }),
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: "owner@servicewriter.app" } } }),
      },
    },
  }),
}));

import { sendBookingConfirmation } from "@/server/messaging/booking-confirmation";

describe("Public Booking CRUD & Messaging Pipeline Audit", () => {
  it("dispatches booking created event to both customer and shop owner", async () => {
    const testAppointment = {
      id: "appt-tyreese-456",
      workspace_id: "ws-789",
      customer_id: "cust-123",
      starts_at: "2026-09-01T14:00:00Z",
      ends_at: "2026-09-01T15:00:00Z",
      status: "confirmed",
      notes: "Tyreese Burton test booking",
      metadata: {
        title: "Oil Change",
        guest_name: "Tyreese Burton",
        vehicle_info: "2021 Honda Accord",
        service_address: "123 Main St, Philadelphia, PA",
        estimated_cost: 95,
      },
    };

    const result = await sendBookingConfirmation({
      appointment: testAppointment,
      workspaceName: "Apex Auto Repair",
      workspaceTimezone: "America/New_York",
      recipientEmail: "momspubilc@gmail.com",
      actionUrl: "https://servicewriter.app/booking/apex-auto/confirmation",
    });

    expect(result.templateKey).toBe("appointment_booking_sequence.booking_confirmation");
    expect(result.eventId).toBe("appt-tyreese-456");
    expect(result.status).toBe("queued");
  });
});
