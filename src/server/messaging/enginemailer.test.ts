import { createHmac } from "node:crypto";
import { EnginemailerEmailAdapter } from "./enginemailer";

describe("Enginemailer marketing adapter", () => {
  const originalFetch = global.fetch;
  const jsonResponse = (payload: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(payload),
  });
  const webhookRequest = (headers: Record<string, string>) => ({
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  }) as Request;

  beforeEach(() => {
    process.env.ENGINEMAILER_API_KEY = "test-enginemailer-key";
    process.env.ENGINEMAILER_FROM_EMAIL = "updates@servicewriter.xyz";
    process.env.ENGINEMAILER_MARKETING_SUBCATEGORY_IDS = "12, 34";
    process.env.ENGINEMAILER_WEBHOOK_SIGNING_SECRET = "test-webhook-secret";
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.ENGINEMAILER_API_KEY;
    delete process.env.ENGINEMAILER_FROM_EMAIL;
    delete process.env.ENGINEMAILER_MARKETING_SUBCATEGORY_IDS;
    delete process.env.ENGINEMAILER_WEBHOOK_SIGNING_SECRET;
    jest.restoreAllMocks();
  });

  it("syncs the consented subscriber before sending marketing HTML", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ Result: { Status: "OK", StatusCode: "200" } }))
      .mockResolvedValueOnce(jsonResponse({ Result: { Status: "OK", StatusCode: "200", TransactionID: "em-123" } })) as typeof fetch;

    const result = await new EnginemailerEmailAdapter().send({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipient: { email: "customer@example.com" },
      purpose: "marketing",
      templateKey: "service_completion_and_follow_up.review_and_satisfaction_request",
      subject: "How did your service go?",
      body: "Plain text",
      html: "<html><body>Marketing message</body></html>",
      fromName: "MOMS Mobile Oil Change",
      idempotencyKey: "review:ABC12345:customer@example.com",
      metadata: {},
    });

    expect(result).toEqual(expect.objectContaining({ providerName: "enginemailer", providerMessageId: "em-123", status: "accepted" }));
    expect(global.fetch).toHaveBeenNthCalledWith(1, expect.stringMatching(/\/addupdatesubscriber$/), expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ APIKey: "test-enginemailer-key" }),
    }));
    expect(JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))).toEqual(expect.objectContaining({
      email: "customer@example.com",
      subcategories: ["12", "34"],
    }));
    expect(global.fetch).toHaveBeenNthCalledWith(2, expect.stringMatching(/\/sendemail$/), expect.objectContaining({ method: "POST" }));
  });

  it("submits transactional email through Enginemailer V2 without syncing a marketing subscriber", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ Result: { Status: "OK", StatusCode: "200", TransactionID: "tx-456" } })) as typeof fetch;

    const result = await new EnginemailerEmailAdapter().send({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipient: { email: "customer@example.com" },
      purpose: "transactional",
      templateKey: "booking_confirmation",
      subject: "Booking confirmed",
      body: "Confirmed",
      html: "<html><body>Confirmed</body></html>",
      idempotencyKey: "booking:ABC12345:customer@example.com",
      metadata: {},
    });

    expect(result).toEqual(expect.objectContaining({ providerName: "enginemailer", providerMessageId: "tx-456" }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://api.enginemailer.com/RESTAPI/V2/Submission/SendEmail",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String((global.fetch as jest.Mock).mock.calls[0][1].body))).toEqual(expect.objectContaining({
      ToEmail: "customer@example.com",
      SenderEmail: "updates@servicewriter.xyz",
      CampaignName: "booking_confirmation",
    }));
  });

  it("records a successful submission without a transaction ID as accepted and does not invite a retry", async () => {
    global.fetch = jest.fn()
      .mockResolvedValueOnce(jsonResponse({ Result: { Status: "OK", StatusCode: "200" } }))
      .mockResolvedValueOnce(jsonResponse({ Result: { Status: "OK", StatusCode: "200" } })) as typeof fetch;

    const request = {
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipient: { email: "customer@example.com" },
      purpose: "marketing",
      templateKey: "review_request",
      subject: "Review request",
      body: "Plain text",
      html: "<html><body>Review request</body></html>",
      idempotencyKey: "review:ABC12345:customer@example.com",
      metadata: {},
    } as const;

    const result = await new EnginemailerEmailAdapter().send(request);

    expect(result).toEqual(expect.objectContaining({
      providerName: "enginemailer",
      providerMessageId: expect.stringMatching(/^accepted-untracked:[a-f0-9]{32}$/),
      status: "accepted",
    }));
  });

  it.each([
    [{ Result: { Status: "OK", StatusCode: "200", TxID: 12345 } }, "12345"],
    [{ CampaignTxID: "campaign-789" }, "campaign-789"],
  ])("normalizes alternate Enginemailer transaction ID fields", async (payload, expectedId) => {
    global.fetch = jest.fn().mockResolvedValueOnce(jsonResponse(payload)) as typeof fetch;

    const result = await new EnginemailerEmailAdapter().send({
      workspaceId: "00000000-0000-4000-8000-000000000001",
      recipient: { email: "customer@example.com" },
      purpose: "transactional",
      templateKey: "booking_confirmation",
      subject: "Booking confirmed",
      body: "Confirmed",
      idempotencyKey: `booking:ABC12345:${expectedId}:customer@example.com`,
      metadata: {},
    });

    expect(result.providerMessageId).toBe(expectedId);
  });

  it("verifies signed webhooks and normalizes unsubscribe events", () => {
    const rawBody = JSON.stringify({
      event: "unsubscribed",
      details: {
        txid: 12345,
        email: "Customer@Example.com",
        unsubscribedate: "2026-08-27 15:30:00.0000000",
      },
    });
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = `sha256=${createHmac("sha256", "test-webhook-secret").update(`${timestamp}.${rawBody}`, "utf8").digest("base64")}`;
    const request = webhookRequest({ "x-timestamp": timestamp, "x-signature": signature });
    const adapter = new EnginemailerEmailAdapter();

    expect(adapter.verifyWebhook(request, rawBody)).toBe(true);
    expect(adapter.normalizeDelivery(rawBody, request)).toEqual([
      expect.objectContaining({
        providerMessageId: "12345",
        status: "canceled",
        recipient: "customer@example.com",
        failureReason: "Recipient unsubscribed from marketing email",
      }),
    ]);
  });

  it.each([
    ["delivery", "delivered"],
    ["delivered", "delivered"],
    ["spam", "complained"],
    ["spam-complaint", "complained"],
    ["unsubscribe", "canceled"],
    ["unsubscribed", "canceled"],
  ] as const)("normalizes the %s webhook alias", (event, status) => {
    const rawBody = JSON.stringify({
      event,
      details: { txid: 12345, email: "customer@example.com" },
    });

    expect(new EnginemailerEmailAdapter().normalizeDelivery(rawBody, webhookRequest({}))).toEqual([
      expect.objectContaining({ providerMessageId: "12345", status }),
    ]);
  });

  it.each(["open", "click"])("accepts %s as a non-delivery-state event", (event) => {
    const rawBody = JSON.stringify({ event, details: { txid: 12345, email: "customer@example.com" } });
    expect(new EnginemailerEmailAdapter().normalizeDelivery(rawBody, webhookRequest({}))).toEqual([]);
  });

  it("rejects replayed Enginemailer webhooks", () => {
    const rawBody = JSON.stringify({ event: "delivered", details: { txid: 12345 } });
    const staleTimestamp = String(Math.floor(Date.now() / 1000) - 301);
    const signature = `sha256=${createHmac("sha256", "test-webhook-secret").update(`${staleTimestamp}.${rawBody}`, "utf8").digest("base64")}`;
    const request = webhookRequest({ "x-timestamp": staleTimestamp, "x-signature": signature });

    expect(new EnginemailerEmailAdapter().verifyWebhook(request, rawBody)).toBe(false);
  });
});
