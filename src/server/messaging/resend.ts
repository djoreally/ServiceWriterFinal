import { createHmac, timingSafeEqual } from "node:crypto";
import type { DeliveryStatus, InboundReply, MessagingAdapter, NormalizedDeliveryEvent, ProviderSendResult, SendMessageRequest } from "./types";
import { requiredEnv } from "./types";

const RESEND_API_URL = "https://api.resend.com";
const MAX_WEBHOOK_CLOCK_SKEW_SECONDS = 300;

function header(request: Request, name: string): string {
  return request.headers.get(name) ?? "";
}

function verifySvixSignature(secret: string, request: Request, rawBody: string): boolean {
  const id = header(request, "svix-id");
  const timestamp = header(request, "svix-timestamp");
  const signatures = header(request, "svix-signature");
  if (!id || !timestamp || !signatures) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds) || Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_WEBHOOK_CLOCK_SKEW_SECONDS) return false;
  const secretBytes = Buffer.from(secret.replace(/^whsec_/, ""), "base64");
  const expected = createHmac("sha256", secretBytes).update(`${id}.${timestamp}.${rawBody}`).digest("base64");
  return signatures.split(" ").some((candidate) => {
    const [, value] = candidate.split(",", 2);
    if (!value) return false;
    const left = Buffer.from(value);
    const right = Buffer.from(expected);
    return left.length === right.length && timingSafeEqual(left, right);
  });
}

function mapResendStatus(type: string): DeliveryStatus {
  switch (type) {
    case "email.sent": return "sent";
    case "email.delivered": return "delivered";
    case "email.bounced": return "bounced";
    case "email.complained": return "complained";
    case "email.failed": return "failed";
    default: return "accepted";
  }
}

export class ResendEmailAdapter implements MessagingAdapter {
  readonly providerName = "resend";

  async send(request: SendMessageRequest): Promise<ProviderSendResult> {
    if (!request.recipient.email) throw new Error("Resend requires an email recipient");
    const response = await fetch(`${RESEND_API_URL}/emails`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}`,
        "Content-Type": "application/json",
        "Idempotency-Key": request.idempotencyKey,
      },
      body: JSON.stringify({
        from: requiredEnv("RESEND_FROM_EMAIL"),
        to: [request.recipient.email],
        subject: request.subject ?? request.templateKey,
        text: request.body,
        headers: { "X-Workspace-ID": request.workspaceId },
      }),
    });
    const payload = await response.json().catch(() => ({})) as { id?: string; message?: string };
    if (!response.ok || !payload.id) throw new Error(payload.message || `Resend request failed with ${response.status}`);
    return { providerMessageId: payload.id, providerName: this.providerName, status: "accepted", acceptedAt: new Date().toISOString() };
  }

  async healthCheck() {
    try {
      const response = await fetch(`${RESEND_API_URL}/domains`, { headers: { Authorization: `Bearer ${requiredEnv("RESEND_API_KEY")}` } });
      return { providerName: this.providerName, healthy: response.ok, detail: response.ok ? undefined : `HTTP ${response.status}` };
    } catch (error) {
      return { providerName: this.providerName, healthy: false, detail: error instanceof Error ? error.message : "Health check failed" };
    }
  }

  verifyWebhook(request: Request, rawBody: string): boolean {
    const secret = process.env.RESEND_WEBHOOK_SIGNING_SECRET?.trim();
    return Boolean(secret && verifySvixSignature(secret, request, rawBody));
  }

  normalizeDelivery(rawBody: string): NormalizedDeliveryEvent[] {
    const payload = JSON.parse(rawBody) as { type?: string; created_at?: string; data?: Record<string, unknown> };
    const data = payload.data ?? {};
    const emailId = typeof data.email_id === "string" ? data.email_id : undefined;
    if (!emailId) return [];
    return [{
      providerMessageId: emailId,
      providerEventId: typeof data.id === "string" ? data.id : undefined,
      status: mapResendStatus(payload.type ?? ""),
      occurredAt: payload.created_at || new Date().toISOString(),
      recipient: typeof data.to === "string" ? data.to : Array.isArray(data.to) ? String(data.to[0] ?? "") : undefined,
      failureReason: typeof data.reason === "string" ? data.reason : undefined,
      rawPayload: payload as Record<string, unknown>,
    }];
  }

  normalizeInbound(_rawBody: string, _request: Request): InboundReply[] {
    return [];
  }
}
