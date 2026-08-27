jest.mock("@/lib/supabase", () => ({
  createSupabaseAdminClient: jest.fn(),
}));

import { createSupabaseAdminClient } from "@/lib/supabase";
import { ingestDeliveryWebhook } from "@/server/messaging/webhook";
import type { MessagingAdapter } from "@/server/messaging/types";

describe("delivery webhook ingestion", () => {
  afterEach(() => jest.restoreAllMocks());

  it("records an Enginemailer unsubscribe and revokes marketing consent", async () => {
    const webhookUpsert = jest.fn();
    const deliveryUpsert = jest.fn().mockResolvedValue({ error: null });
    const webhookUpdate = jest.fn().mockReturnValue({ eq: jest.fn().mockResolvedValue({ error: null }) });
    const rpc = jest.fn().mockResolvedValue({ data: null, error: null });

    const messageLogQuery = () => ({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockReturnValue({
          eq: jest.fn().mockReturnValue({
            maybeSingle: jest.fn().mockResolvedValue({
              data: { workspace_id: "00000000-0000-4000-8000-000000000001", id: "message-log-1" },
              error: null,
            }),
          }),
        }),
      }),
    });
    webhookUpsert.mockReturnValue({
      select: jest.fn().mockReturnValue({
        maybeSingle: jest.fn().mockResolvedValue({ data: { id: "webhook-1" }, error: null }),
      }),
    });

    (createSupabaseAdminClient as jest.Mock).mockReturnValue({
      rpc,
      from: jest.fn((table: string) => {
        if (table === "message_logs") return messageLogQuery();
        if (table === "webhook_events") return { upsert: webhookUpsert, update: webhookUpdate };
        if (table === "message_delivery_events") return { upsert: deliveryUpsert };
        throw new Error(`Unexpected table ${table}`);
      }),
    });

    const adapter: MessagingAdapter = {
      providerName: "enginemailer",
      send: jest.fn(),
      healthCheck: jest.fn(),
      verifyWebhook: jest.fn().mockReturnValue(true),
      normalizeDelivery: jest.fn().mockReturnValue([{
        providerMessageId: "12345",
        providerEventId: "unsubscribe-event-1",
        status: "canceled",
        occurredAt: "2026-08-27T15:30:00.000Z",
        recipient: "customer@example.com",
        rawPayload: { event: "unsubscribed" },
      }]),
    };
    const rawBody = JSON.stringify({
      event: "unsubscribed",
      details: { txid: 12345, email: "customer@example.com" },
    });
    const request = {
      headers: {
        get: (name: string) => name.toLowerCase() === "x-timestamp" ? "1787844600" : null,
      },
    } as Request;

    const result = await ingestDeliveryWebhook("enginemailer", adapter, request, rawBody);

    expect(result).toEqual({ accepted: true, duplicate: false, count: 1 });
    expect(webhookUpsert).toHaveBeenCalledWith(expect.objectContaining({
      provider: "enginemailer",
      event_type: "enginemailer.unsubscribed",
      signature_verified: true,
    }), expect.objectContaining({ onConflict: "provider,external_event_id" }));
    expect(rpc).toHaveBeenCalledWith("messaging_record_marketing_opt_out", {
      target_workspace_id: "00000000-0000-4000-8000-000000000001",
      target_email: "customer@example.com",
      target_source: "enginemailer",
    });
  });
});
