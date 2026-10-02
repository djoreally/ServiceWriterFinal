/**
 * Tests for src/server/shop-agent/agentphone.ts.
 *
 * The HTTP boundary is fully mocked via fetchImpl — no network, no real
 * money. Signature tests assert the EXACT verified scheme:
 * X-Webhook-Signature: sha256=<hex> over "{timestamp}.{raw_body}".
 */
import { createHmac } from "node:crypto";
import {
  AGENTPHONE_API_BASE,
  AgentPhoneAdapter,
  StubAgentPhoneAdapter,
  isMissedCall,
} from "../../agentphone";

function mockFetch(responses: Array<{ status: number; body: unknown }>) {
  const calls: Array<{ url: string; init: any }> = [];
  const impl = jest.fn(async (url: string, init: any) => {
    calls.push({ url, init });
    const next = responses.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body,
    };
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function sign(secret: string, timestamp: string, rawBody: string): string {
  return `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex")}`;
}

describe("AgentPhoneAdapter construction", () => {
  it("fails closed with a clear message when the API key is absent", () => {
    const saved = process.env.AGENTPHONE_API_KEY;
    delete process.env.AGENTPHONE_API_KEY;
    try {
      expect(() => new AgentPhoneAdapter({})).toThrow(/AGENTPHONE_API_KEY is not configured/);
    } finally {
      if (saved !== undefined) process.env.AGENTPHONE_API_KEY = saved;
    }
  });

  it("accepts an explicit apiKey", () => {
    expect(() => new AgentPhoneAdapter({ apiKey: "test-key" })).not.toThrow();
  });
});

describe("sendSms", () => {
  it("POSTs to /v1/messages with agent_id, to_number, and body", async () => {
    const { impl, calls } = mockFetch([{ status: 200, body: { id: "msg-123" } }]);
    const adapter = new AgentPhoneAdapter({ apiKey: "test-key", agentId: "ag-1", fetchImpl: impl });
    const result = await adapter.sendSms({ to: "+15551234567", body: "hello" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${AGENTPHONE_API_BASE}/messages`);
    expect(calls[0].init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      agent_id: "ag-1",
      to_number: "+15551234567",
      body: "hello",
    });
    expect(result).toMatchObject({
      providerMessageId: "msg-123",
      providerName: "agentphone",
      status: "accepted",
    });
  });

  it("includes number_id when provided", async () => {
    const { impl, calls } = mockFetch([{ status: 200, body: { id: "msg-1" } }]);
    const adapter = new AgentPhoneAdapter({ apiKey: "k", agentId: "ag-1", fetchImpl: impl });
    await adapter.sendSms({ to: "+1555", body: "hi", numberId: "num-9" });
    expect(JSON.parse(calls[0].init.body).number_id).toBe("num-9");
  });

  it("surfaces provider 4xx errors with their message intact (e.g. 10DLC)", async () => {
    const { impl } = mockFetch([
      { status: 422, body: { message: "Outbound SMS requires 10DLC registration" } },
    ]);
    const adapter = new AgentPhoneAdapter({ apiKey: "k", agentId: "ag-1", fetchImpl: impl });
    await expect(adapter.sendSms({ to: "+1555", body: "hi" })).rejects.toThrow(
      /Outbound SMS requires 10DLC registration/,
    );
  });

  it("requires an agent_id", async () => {
    const { impl } = mockFetch([{ status: 200, body: { id: "x" } }]);
    const adapter = new AgentPhoneAdapter({ apiKey: "k", fetchImpl: impl });
    await expect(adapter.sendSms({ to: "+1555", body: "hi" })).rejects.toThrow(/agent_id is required/);
  });
});

describe("verifyWebhookSignature (verified scheme)", () => {
  const secret = "whsec-test";
  const rawBody = '{"event":"agent.message","data":{}}';
  const timestamp = String(Math.floor(Date.now() / 1000));

  it("accepts a valid signature", () => {
    expect(
      AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, sign(secret, timestamp, rawBody), timestamp),
    ).toBe(true);
  });

  it("rejects a wrong secret", () => {
    expect(
      AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, sign("wrong", timestamp, rawBody), timestamp),
    ).toBe(false);
  });

  it("rejects a stale timestamp (>5min)", () => {
    const stale = String(Math.floor(Date.now() / 1000) - 601);
    expect(
      AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, sign(secret, stale, rawBody), stale),
    ).toBe(false);
  });

  it("accepts a millisecond timestamp within the window", () => {
    const ms = String(Date.now());
    expect(
      AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, sign(secret, ms, rawBody), ms),
    ).toBe(true);
  });

  it("rejects a malformed signature header (missing sha256= prefix)", () => {
    const hex = sign(secret, timestamp, rawBody).replace("sha256=", "");
    expect(AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, hex, timestamp)).toBe(false);
  });

  it("rejects missing headers", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, null, timestamp)).toBe(false);
    expect(AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody, sig, null)).toBe(false);
    expect(AgentPhoneAdapter.verifyWebhookSignature("", rawBody, sig, timestamp)).toBe(false);
  });

  it("rejects a tampered body", () => {
    const sig = sign(secret, timestamp, rawBody);
    expect(
      AgentPhoneAdapter.verifyWebhookSignature(secret, rawBody + "tampered", sig, timestamp),
    ).toBe(false);
  });
});

describe("normalizeInboundEvent", () => {
  it("normalizes agent.message (sms)", () => {
    const event = AgentPhoneAdapter.normalizeInboundEvent(
      {
        event: "agent.message",
        channel: "sms",
        agentId: "ag-1",
        data: {
          conversationId: "c1",
          numberId: "n1",
          from: "+15551234567",
          to: "+12157672125",
          message: "I need an oil change",
          direction: "inbound",
        },
      },
      "agent.message",
    );
    expect(event).toMatchObject({
      eventType: "agent.message",
      channel: "sms",
      direction: "inbound",
      from: "+15551234567",
      to: "+12157672125",
      body: "I need an oil change",
      agentId: "ag-1",
      numberId: "n1",
      conversationId: "c1",
    });
  });

  it("prefers the X-Webhook-Event header for the event type", () => {
    const event = AgentPhoneAdapter.normalizeInboundEvent({ data: {} }, "agent.call_ended");
    expect(event.eventType).toBe("agent.call_ended");
  });

  it("normalizes agent.message (voice turn)", () => {
    const event = AgentPhoneAdapter.normalizeInboundEvent({
      event: "agent.message",
      channel: "voice",
      data: { from: "+1555", to: "+1215", message: "hello?", direction: "inbound" },
    });
    expect(event.channel).toBe("voice");
    expect(event.body).toBe("hello?");
  });

  it("normalizes agent.call_ended with and without transcript", () => {
    const withTranscript = AgentPhoneAdapter.normalizeInboundEvent({
      event: "agent.call_ended",
      channel: "voice",
      data: {
        callId: "call-1",
        durationSeconds: 45,
        transcript: "hello thanks bye",
        summary: "quick call",
        userSentiment: "neutral",
      },
    });
    expect(withTranscript).toMatchObject({
      eventType: "agent.call_ended",
      callId: "call-1",
      durationSeconds: 45,
      transcript: "hello thanks bye",
      summary: "quick call",
      userSentiment: "neutral",
    });
    const without = AgentPhoneAdapter.normalizeInboundEvent({
      event: "agent.call_ended",
      data: { callId: "call-2", durationSeconds: 0 },
    });
    expect(without.transcript).toBeUndefined();
    expect(without.durationSeconds).toBe(0);
  });

  it("marks unknown event types", () => {
    expect(AgentPhoneAdapter.normalizeInboundEvent({ event: "agent.reaction" }).eventType).toBe(
      "agent.reaction",
    );
    expect(AgentPhoneAdapter.normalizeInboundEvent({ nope: 1 }).eventType).toBe("unknown");
  });
});

describe("isMissedCall", () => {
  it("treats empty/missing transcript as missed", () => {
    expect(isMissedCall({ transcript: "", durationSeconds: 30 })).toBe(true);
    expect(isMissedCall({ transcript: "   ", durationSeconds: 30 })).toBe(true);
    expect(isMissedCall({ durationSeconds: 30 })).toBe(true);
  });

  it("treats very short calls as missed", () => {
    expect(isMissedCall({ transcript: "hi", durationSeconds: 5 })).toBe(true);
  });

  it("treats explicit unanswered signals as missed", () => {
    expect(isMissedCall({ transcript: "hello", durationSeconds: 60, status: "no-answer" })).toBe(true);
    expect(isMissedCall({ transcript: "hello", durationSeconds: 60, status: "busy" })).toBe(true);
    expect(isMissedCall({ transcript: "hello", durationSeconds: 60, answered: false })).toBe(true);
  });

  it("treats a real conversation as answered", () => {
    expect(
      isMissedCall({ transcript: "hi i need an oil change tomorrow please", durationSeconds: 120 }),
    ).toBe(false);
  });
});

describe("setup helpers", () => {
  it("createAgent sets voiceMode=webhook explicitly", async () => {
    const { impl, calls } = mockFetch([{ status: 200, body: { id: "ag-9" } }]);
    const adapter = new AgentPhoneAdapter({ apiKey: "k", fetchImpl: impl });
    const created = await adapter.createAgent({ name: "Shop SMS Agent" });
    expect(created.id).toBe("ag-9");
    expect(JSON.parse(calls[0].init.body).voiceMode).toBe("webhook");
  });

  it("setWebhook posts the URL and returns the secret", async () => {
    const { impl, calls } = mockFetch([{ status: 200, body: { secret: "whsec-abc" } }]);
    const adapter = new AgentPhoneAdapter({ apiKey: "k", fetchImpl: impl });
    const result = await adapter.setWebhook("https://example.com/api/v1/shop-agent/agentphone");
    expect(JSON.parse(calls[0].init.body)).toEqual({
      url: "https://example.com/api/v1/shop-agent/agentphone",
    });
    expect(result.secret).toBe("whsec-abc");
  });
});

describe("StubAgentPhoneAdapter", () => {
  it("captures sends without touching the network", async () => {
    const stub = new StubAgentPhoneAdapter({ agentId: "ag-1" });
    const result = await stub.sendSms({ to: "+1555", body: "hi", templateKey: "t" });
    expect(result.providerMessageId).toBe("stub-sm-1");
    expect(stub.sent).toHaveLength(1);
    expect(stub.sent[0]).toMatchObject({ to: "+1555", body: "hi", agentId: "ag-1" });
  });
});
