jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { EnginemailerEmailAdapter } from "@/server/messaging/enginemailer";
import { ResendEmailAdapter } from "@/server/messaging/resend";
import { lifecycleAdapterForPurpose, sendLifecycleEmail } from "@/server/messaging/lifecycle-sender";

const bookingVariables = {
  "business.name": "MOMS Mobile Oil Change",
  "business.timezone": "America/New_York",
  "customer.first_name": "Jordan",
  "appointment.service": "Full synthetic oil change",
  "appointment.date": "Friday, August 28, 2026",
  "appointment.time": "10:00 AM",
  "appointment.address": "123 Market Street",
  "appointment.total": "$99.00",
  "appointment.payment_method": "Pay at time of service",
  "appointment.confirmation_code": "ABC12345",
  "vehicle.description": "2019 Honda Civic",
  "email.primary_action_url": "https://servicewriter.xyz/appointments/ABC12345",
};

function messageLogUpsertResult() {
  return {
    upsert: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        single: jest.fn().mockResolvedValue({ data: { id: "log-1" }, error: null }),
      }),
    }),
  };
}

describe("lifecycle sender policy", () => {
  afterEach(() => jest.restoreAllMocks());

  it("records a suppressed transactional recipient without contacting the provider", async () => {
    const messageLogs = messageLogUpsertResult();
    (createSupabaseAdminClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: true, error: null }),
      from: jest.fn((table: string) => {
        if (table === "message_logs") return messageLogs;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    const providerSend = jest.spyOn(EnginemailerEmailAdapter.prototype, "send");

    const result = await sendLifecycleEmail({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipientEmail: "customer@example.com",
      templateKey: "appointment_booking_sequence.booking_confirmation",
      idempotencyKey: "booking:ABC12345:customer@example.com",
      variables: bookingVariables,
    });

    expect(result.status).toBe("suppressed");
    expect(providerSend).not.toHaveBeenCalled();
    expect(messageLogs.upsert).toHaveBeenCalledWith(expect.objectContaining({
      status: "canceled",
      failure_code: "suppressed",
    }), { onConflict: "workspace_id,idempotency_key" });
  });

  it("requires current marketing consent before contacting Enginemailer", async () => {
    const messageLogs = messageLogUpsertResult();
    const consentQuery = {
      select: jest.fn().mockReturnThis(),
      eq: jest.fn().mockReturnThis(),
      order: jest.fn().mockReturnThis(),
      limit: jest.fn().mockReturnThis(),
      maybeSingle: jest.fn().mockResolvedValue({ data: { status: "revoked" }, error: null }),
    };
    (createSupabaseAdminClient as jest.Mock).mockReturnValue({
      rpc: jest.fn().mockResolvedValue({ data: false, error: null }),
      from: jest.fn((table: string) => {
        if (table === "messaging_consents") return consentQuery;
        if (table === "message_logs") return messageLogs;
        throw new Error(`Unexpected table ${table}`);
      }),
    });
    const providerSend = jest.spyOn(ResendEmailAdapter.prototype, "send");
    const marketingSend = jest.spyOn(EnginemailerEmailAdapter.prototype, "send");

    const result = await sendLifecycleEmail({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipientEmail: "customer@example.com",
      templateKey: "service_completion_and_follow_up.review_and_satisfaction_request",
      idempotencyKey: "review:ABC12345:customer@example.com",
      variables: {
        "business.name": "MOMS Mobile Oil Change",
        "appointment.confirmation_code": "ABC12345",
        "email.primary_action_url": "https://servicewriter.xyz/reviews/ABC12345",
        "email.preferences_url": "https://servicewriter.xyz/messaging-preferences?token=test",
      },
    });

    expect(result.status).toBe("suppressed");
    expect(providerSend).not.toHaveBeenCalled();
    expect(marketingSend).not.toHaveBeenCalled();
    expect(messageLogs.upsert).toHaveBeenCalledWith(expect.objectContaining({
      status: "canceled",
      failure_code: "consent_required",
    }), { onConflict: "workspace_id,idempotency_key" });
  });

  it("routes both transactional and marketing email to Enginemailer", () => {
    expect(lifecycleAdapterForPurpose("transactional")).toBeInstanceOf(EnginemailerEmailAdapter);
    expect(lifecycleAdapterForPurpose("appointment_update")).toBeInstanceOf(EnginemailerEmailAdapter);
    expect(lifecycleAdapterForPurpose("marketing")).toBeInstanceOf(EnginemailerEmailAdapter);
    expect(lifecycleAdapterForPurpose("transactional")).not.toBeInstanceOf(ResendEmailAdapter);
  });
});
