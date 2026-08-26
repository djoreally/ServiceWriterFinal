import { ResendEmailAdapter } from "@/server/messaging/resend";

describe("Resend lifecycle adapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.RESEND_API_KEY = "test-resend-key";
    process.env.RESEND_FROM_EMAIL = "noreply@servicewriter.xyz";
    global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ id: "re_123" }) } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM_EMAIL;
  });

  it("sends HTML and text alternatives with sender and reply-to metadata", async () => {
    await new ResendEmailAdapter().send({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipient: { email: "customer@example.com" },
      purpose: "transactional",
      templateKey: "test.template",
      subject: "Test message",
      body: "Plain text fallback",
      html: "<p>HTML message</p>",
      fromName: "MOMS Mobile Oil Change",
      replyTo: "shop@example.com",
      idempotencyKey: "lifecycle:test:recipient@example.com",
      metadata: {},
    });
    const request = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const payload = JSON.parse(String(request.body));
    expect(payload.from).toBe("MOMS Mobile Oil Change <noreply@servicewriter.xyz>");
    expect(payload.html).toBe("<p>HTML message</p>");
    expect(payload.text).toBe("Plain text fallback");
    expect(payload.reply_to).toBe("shop@example.com");
  });

  it("normalizes provider suppression and delay events", () => {
    const adapter = new ResendEmailAdapter();
    const delayed = adapter.normalizeDelivery(JSON.stringify({ type: "email.delivery_delayed", created_at: "2026-08-26T12:00:00Z", data: { email_id: "re_1", to: ["customer@example.com"], id: "evt_1" } }), {} as Request);
    const suppressed = adapter.normalizeDelivery(JSON.stringify({ type: "email.suppressed", created_at: "2026-08-26T12:00:00Z", data: { email_id: "re_2", to: ["customer@example.com"], id: "evt_2" } }), {} as Request);
    expect(delayed[0].status).toBe("accepted");
    expect(suppressed[0].status).toBe("undeliverable");
  });
});
