import { createHmac } from "node:crypto";
import { TwilioSmsAdapter } from "@/server/messaging/twilio";

const UUID = "00000000-0000-4000-8000-000000000001";

const ACCOUNT_SID = "AC1234567890";
const AUTH_TOKEN = "test-auth-token";
const FROM_NUMBER = "+15551234567";

function sendRequest(overrides: Record<string, unknown> = {}) {
  return {
    workspaceId: UUID,
    recipient: { phone: "+15550001111" },
    purpose: "transactional",
    templateKey: "appointment_reminders.24_hours_before",
    body: "Your appointment is tomorrow at 10:00 AM.",
    idempotencyKey: "lifecycle:appointment_reminders.24_hours_before:evt-1",
    metadata: {},
    ...overrides,
  };
}

function webhookRequest(rawBody: string, skewSeconds = 0, signatureOverride?: string): Request {
  const url = "https://servicewriter.xyz/api/twilio/webhook";
  const signingPayload =
    url +
    [...new URLSearchParams(rawBody).entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, value]) => `${key}${value}`)
      .join("");
  const signature =
    signatureOverride ?? createHmac("sha1", AUTH_TOKEN).update(signingPayload).digest("base64");
  const headers: Record<string, string> = {
    "content-type": "application/x-www-form-urlencoded",
    "x-twilio-signature": signature,
    "x-twilio-request-timestamp": String(Math.floor(Date.now() / 1000) - skewSeconds),
  };
  return {
    url,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  } as unknown as Request;
}

describe("TwilioSmsAdapter", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.TWILIO_ACCOUNT_SID = ACCOUNT_SID;
    process.env.TWILIO_AUTH_TOKEN = AUTH_TOKEN;
    process.env.TWILIO_FROM_NUMBER = FROM_NUMBER;
    global.fetch = jest
      .fn()
      .mockResolvedValue({ ok: true, status: 201, json: async () => ({ sid: "SM123", status: "sent" }) } as unknown as Response);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_FROM_NUMBER;
  });

  describe("send", () => {
    it("posts a form-encoded message to the Twilio Messages endpoint with Basic auth", async () => {
      const result = await new TwilioSmsAdapter().send(sendRequest());

      const fetchMock = global.fetch as jest.Mock;
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}/Messages.json`);
      expect(init.method).toBe("POST");
      const headers = init.headers as Record<string, string>;
      expect(headers.Authorization).toBe(
        `Basic ${Buffer.from(`${ACCOUNT_SID}:${AUTH_TOKEN}`).toString("base64")}`,
      );
      expect(headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
      expect(headers["Idempotency-Key"]).toBe("lifecycle:appointment_reminders.24_hours_before:evt-1");
      const params = new URLSearchParams(String(init.body));
      expect(params.get("From")).toBe(FROM_NUMBER);
      expect(params.get("To")).toBe("+15550001111");
      expect(params.get("Body")).toBe("Your appointment is tomorrow at 10:00 AM.");

      expect(result).toEqual({
        providerMessageId: "SM123",
        providerName: "twilio",
        status: "sent",
        acceptedAt: expect.any(String),
      });
    });

    it("maps accepted and queued provider statuses", async () => {
      const fetchMock = global.fetch as jest.Mock;
      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ sid: "SM1", status: "queued" }),
      } as unknown as Response);
      await expect(new TwilioSmsAdapter().send(sendRequest())).resolves.toMatchObject({
        providerMessageId: "SM1",
        status: "queued",
      });

      fetchMock.mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ sid: "SM2", status: "sending" }),
      } as unknown as Response);
      await expect(new TwilioSmsAdapter().send(sendRequest())).resolves.toMatchObject({
        status: "sent",
      });
    });

    it("throws when the recipient has no phone number", async () => {
      await expect(
        new TwilioSmsAdapter().send(sendRequest({ recipient: { email: "a@example.com" } })),
      ).rejects.toThrow("Twilio requires a phone recipient");
    });

    it("throws when required env vars are missing", async () => {
      delete process.env.TWILIO_AUTH_TOKEN;
      await expect(new TwilioSmsAdapter().send(sendRequest())).rejects.toThrow(
        "Missing required environment variable: TWILIO_AUTH_TOKEN",
      );
    });

    it("throws a provider error message on non-2xx responses", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: "The 'To' number is invalid.", code: 21211 }),
      } as unknown as Response);
      await expect(new TwilioSmsAdapter().send(sendRequest())).rejects.toThrow(
        "The 'To' number is invalid.",
      );
    });

    it("throws a generic failure when the payload has no sid", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
      } as unknown as Response);
      await expect(new TwilioSmsAdapter().send(sendRequest())).rejects.toThrow(
        "Twilio request failed with 500",
      );

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 201,
        json: async () => ({ status: "sent" }),
      } as unknown as Response);
      await expect(new TwilioSmsAdapter().send(sendRequest())).rejects.toThrow(
        "Twilio request failed with 201",
      );
    });
  });

  describe("healthCheck", () => {
    it("reports healthy when the account endpoint responds", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: true, status: 200 } as unknown as Response);
      const result = await new TwilioSmsAdapter().healthCheck();
      expect(result).toEqual({ providerName: "twilio", healthy: true, detail: undefined });
      const [url] = (global.fetch as jest.Mock).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`https://api.twilio.com/2010-04-01/Accounts/${ACCOUNT_SID}.json`);
    });

    it("reports unhealthy on HTTP errors and on network failures", async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 401 } as unknown as Response);
      await expect(new TwilioSmsAdapter().healthCheck()).resolves.toMatchObject({
        providerName: "twilio",
        healthy: false,
        detail: "HTTP 401",
      });

      (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));
      await expect(new TwilioSmsAdapter().healthCheck()).resolves.toMatchObject({
        providerName: "twilio",
        healthy: false,
        detail: "network down",
      });
    });
  });

  describe("verifyWebhook", () => {
    it("accepts a correctly signed request within the clock skew window", () => {
      const rawBody = "Body=Hello&From=%2B15550001111";
      expect(new TwilioSmsAdapter().verifyWebhook(webhookRequest(rawBody), rawBody)).toBe(true);
    });

    it("rejects stale timestamps, wrong signatures, and missing secrets", () => {
      const rawBody = "Body=Hello&From=%2B15550001111";
      expect(new TwilioSmsAdapter().verifyWebhook(webhookRequest(rawBody, 600), rawBody)).toBe(false);
      expect(new TwilioSmsAdapter().verifyWebhook(webhookRequest(rawBody, 0, "bogus"), rawBody)).toBe(false);

      delete process.env.TWILIO_AUTH_TOKEN;
      expect(new TwilioSmsAdapter().verifyWebhook(webhookRequest(rawBody), rawBody)).toBe(false);
    });
  });

  describe("normalizeDelivery", () => {
    it.each([
      ["queued", "queued"],
      ["accepted", "accepted"],
      ["sending", "sent"],
      ["sent", "sent"],
      ["delivered", "delivered"],
      ["undelivered", "undeliverable"],
      ["failed", "failed"],
      ["canceled", "canceled"],
      ["mystery-status", "accepted"],
    ])("maps %s to %s", (twilioStatus, expected) => {
      const events = new TwilioSmsAdapter().normalizeDelivery(
        JSON.stringify({
          MessageSid: "SM1",
          MessageStatus: twilioStatus,
          EventSid: "EV1",
          To: "+15550001111",
          ErrorCode: "30007",
          ErrorMessage: "Carrier unreachable",
        }),
      );
      expect(events).toHaveLength(1);
      expect(events[0]).toMatchObject({
        providerMessageId: "SM1",
        providerEventId: "EV1",
        status: expected,
        recipient: "+15550001111",
        failureCode: "30007",
        failureReason: "Carrier unreachable",
        occurredAt: expect.any(String),
      });
      expect(events[0].rawPayload).toMatchObject({ MessageSid: "SM1" });
    });

    it("falls back to SmsSid/SmsStatus and returns nothing without a sid", () => {
      const [event] = new TwilioSmsAdapter().normalizeDelivery(
        JSON.stringify({ SmsSid: "SM2", SmsStatus: "failed" }),
      );
      expect(event.providerMessageId).toBe("SM2");
      expect(event.status).toBe("failed");
      expect(new TwilioSmsAdapter().normalizeDelivery(JSON.stringify({ MessageStatus: "sent" }))).toEqual([]);
    });
  });

  describe("normalizeInbound", () => {
    it("normalizes an inbound message payload", () => {
      const replies = new TwilioSmsAdapter().normalizeInbound(
        JSON.stringify({
          MessageSid: "SM3",
          Body: "CONFIRM",
          From: "+15550001111",
          To: FROM_NUMBER,
        }),
      );
      expect(replies).toHaveLength(1);
      expect(replies[0]).toMatchObject({
        providerMessageId: "SM3",
        providerEventId: "SM3",
        from: "+15550001111",
        to: FROM_NUMBER,
        body: "CONFIRM",
        receivedAt: expect.any(String),
      });
    });

    it("returns nothing when body, from, or to is missing", () => {
      expect(
        new TwilioSmsAdapter().normalizeInbound(JSON.stringify({ From: "a", To: "b" })),
      ).toEqual([]);
    });
  });
});
