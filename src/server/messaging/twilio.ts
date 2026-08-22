import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus, InboundReply, MessagingAdapter, NormalizedDeliveryEvent, ProviderSendResult, SendMessageRequest } from "./types";
import { requiredEnv } from "./types";

const TWILIO_API_URL = "https://api.twilio.com/2010-04-01";
const MAX_WEBHOOK_CLOCK_SKEW_SECONDS = 300;

function twilioSignature(request: Request, rawBody: string): boolean {
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = request.headers.get("x-twilio-signature")?.trim();
  if (!authToken || !signature) return false;
  const url = request.url;
  const contentType = request.headers.get("content-type") || "";
  const signingPayload = contentType.includes("application/x-www-form-urlencoded")
    ? url + [...new URLSearchParams(rawBody).entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, value]) => `${key}${value}`).join("")
    : url + rawBody;
  const expected = createHmac("sha1", authToken).update(signingPayload).digest("base64");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function mapTwilioStatus(status: string): DeliveryStatus {
  switch (status.toLowerCase()) {
    case "queued": return "queued";
    case "accepted": return "accepted";
    case "sending":
    case "sent": return "sent";
    case "delivered": return "delivered";
    case "undelivered": return "undeliverable";
    case "failed": return "failed";
    case "canceled": return "canceled";
    default: return "accepted";
  }
}

function formBody(values: Record<string, string>): string {
  return new URLSearchParams(values).toString();
}

export class TwilioSmsAdapter implements MessagingAdapter {
  readonly providerName = "twilio";

  async send(request: SendMessageRequest): Promise<ProviderSendResult> {
    if (!request.recipient.phone) throw new Error("Twilio requires a phone recipient");
    const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
    const authToken = requiredEnv("TWILIO_AUTH_TOKEN");
    const from = requiredEnv("TWILIO_FROM_NUMBER");
    const response = await fetch(`${TWILIO_API_URL}/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        "Idempotency-Key": request.idempotencyKey,
      },
      body: formBody({ From: from, To: request.recipient.phone, Body: request.body }),
    });
    const payload = await response.json().catch(() => ({})) as { sid?: string; status?: string; message?: string; code?: number };
    if (!response.ok || !payload.sid) throw new Error(payload.message || `Twilio request failed with ${response.status}${payload.code ? ` (${payload.code})` : ""}`);
    return { providerMessageId: payload.sid, providerName: this.providerName, status: mapTwilioStatus(payload.status || "accepted") as "queued" | "accepted" | "sent", acceptedAt: new Date().toISOString() };
  }

  async healthCheck() {
    try {
      const accountSid = requiredEnv("TWILIO_ACCOUNT_SID");
      const response = await fetch(`${TWILIO_API_URL}/Accounts/${accountSid}.json`, {
        headers: { Authorization: `Basic ${Buffer.from(`${accountSid}:${requiredEnv("TWILIO_AUTH_TOKEN")}`).toString("base64")}` },
      });
      return { providerName: this.providerName, healthy: response.ok, detail: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      return { providerName: this.providerName, healthy: false, detail: error instanceof Error ? error.message : "Health check failed" };
    }
  }

  verifyWebhook(request: Request, rawBody: string): boolean {
    const timestamp = request.headers.get("x-twilio-request-timestamp");
    if (timestamp && Math.abs(Date.now() / 1000 - Number(timestamp)) > MAX_WEBHOOK_CLOCK_SKEW_SECONDS) return false;
    return twilioSignature(request, rawBody);
  }

  normalizeDelivery(rawBody: string): NormalizedDeliveryEvent[] {
    const payload = JSON.parse(rawBody) as Record<string, string>;
    const sid = payload.MessageSid || payload.SmsSid;
    if (!sid) return [];
    return [{
      providerMessageId: sid,
      providerEventId: payload.EventSid,
      status: mapTwilioStatus(payload.MessageStatus || payload.SmsStatus || "accepted"),
      occurredAt: new Date().toISOString(),
      recipient: payload.To,
      failureCode: payload.ErrorCode,
      failureReason: payload.ErrorMessage,
      rawPayload: payload as Record<string, unknown>,
    }];
  }

  normalizeInbound(rawBody: string): InboundReply[] {
    const payload = JSON.parse(rawBody) as Record<string, string>;
    if (!payload.Body || !payload.From || !payload.To) return [];
    return [{
      providerMessageId: payload.MessageSid || payload.SmsSid,
      providerEventId: payload.MessageSid || payload.SmsSid,
      from: payload.From,
      to: payload.To,
      body: payload.Body,
      receivedAt: new Date().toISOString(),
      rawPayload: payload as Record<string, unknown>,
    }];
  }
}
