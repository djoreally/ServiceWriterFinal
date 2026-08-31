import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type {
  InboundReply,
  MessagingAdapter,
  NormalizedDeliveryEvent,
  ProviderSendResult,
  SendMessageRequest,
} from "./types";
import { requiredEnv } from "./types";

const ENGINEMAILER_CONNECT_API_URL = "https://connect.enginemailer.com/api/N8N/v1";
const ENGINEMAILER_TRANSACTIONAL_API_URL = "https://api.enginemailer.com/RESTAPI/V2/Submission/SendEmail";
const MAX_WEBHOOK_CLOCK_SKEW_SECONDS = 300;

type EnginemailerResult = {
  Result?: {
    TransactionID?: string;
    TransactionId?: string;
    transaction_id?: string;
    Status?: string;
    StatusCode?: string | number;
    ErrorMessage?: string;
  };
  TransactionID?: string;
  TransactionId?: string;
  transaction_id?: string;
  id?: string;
  message?: string;
};

function providerMessageId(payload: EnginemailerResult): string | undefined {
  const result = payload.Result;
  return result?.TransactionID
    ?? result?.TransactionId
    ?? result?.transaction_id
    ?? payload.TransactionID
    ?? payload.TransactionId
    ?? payload.transaction_id
    ?? payload.id;
}

function responseError(payload: EnginemailerResult, status: number): string {
  return payload.Result?.ErrorMessage
    ?? payload.message
    ?? `Enginemailer request failed with ${status}`;
}

function configuredSubcategories(): string[] {
  return (process.env.ENGINEMAILER_MARKETING_SUBCATEGORY_IDS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
}

function verifyHmac(secret: string, request: Request, rawBody: string): boolean {
  const timestamp = request.headers.get("x-timestamp") ?? "";
  const received = request.headers.get("x-signature") ?? "";
  const timestampSeconds = Number(timestamp);
  if (!timestamp || !received || !Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_WEBHOOK_CLOCK_SKEW_SECONDS) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("base64")}`;
  const left = Buffer.from(received);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function webhookDate(value: unknown): string {
  if (typeof value !== "string" || !value.trim()) return new Date().toISOString();
  const normalized = value.trim()
    .replace(" ", "T")
    .replace(/(\.\d{3})\d+$/, "$1")
    .replace(/(\.\d{3})$/, "$1Z")
    .replace(/(\d{2}:\d{2}:\d{2})$/, "$1Z");
  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}

function firstConfiguredEnv(names: string[]): string {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}

async function requestEnginemailer(
  url: string,
  init: RequestInit = {},
  apiKey = requiredEnv("ENGINEMAILER_API_KEY"),
): Promise<EnginemailerResult> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      APIKey: apiKey,
      ...init.headers,
    },
  });
  const payload = await response.json().catch(() => ({})) as EnginemailerResult;
  const statusCode = Number(payload.Result?.StatusCode ?? response.status);
  if (!response.ok || (Number.isFinite(statusCode) && statusCode >= 400)) {
    throw new Error(responseError(payload, response.status));
  }
  return payload;
}

/**
 * Enginemailer is the primary provider for both transactional and consented
 * marketing email. The two purposes use separate submission paths and may use
 * separate API keys/sending identities to preserve least privilege and sender
 * reputation, while sharing one delivery-event contract.
 */
export class EnginemailerEmailAdapter implements MessagingAdapter {
  readonly providerName = "enginemailer";

  async send(request: SendMessageRequest): Promise<ProviderSendResult> {
    if (!request.recipient.email) throw new Error("Enginemailer requires an email recipient");
    const content = request.html ?? request.body;
    const payload = request.purpose === "marketing"
      ? await this.sendMarketing(request, content)
      : await this.sendTransactional(request, content);
    const messageId = providerMessageId(payload);
    if (!messageId) throw new Error("Enginemailer accepted the request without a transaction ID");
    return {
      providerMessageId: messageId,
      providerName: this.providerName,
      status: "accepted",
      acceptedAt: new Date().toISOString(),
    };
  }

  private async sendMarketing(request: SendMessageRequest, content: string): Promise<EnginemailerResult> {
    const primaryApiKey = requiredEnv("ENGINEMAILER_API_KEY");
    await requestEnginemailer(`${ENGINEMAILER_CONNECT_API_URL}/addupdatesubscriber`, {
      method: "POST",
      body: JSON.stringify({
        email: request.recipient.email,
        sourcetype: "Service Writer consented marketing",
        subcategories: configuredSubcategories(),
        customfields: [],
        updatetype: "Ignore",
      }),
    }, primaryApiKey);
    return requestEnginemailer(`${ENGINEMAILER_CONNECT_API_URL}/sendemail`, {
      method: "POST",
      body: JSON.stringify({
        email: request.recipient.email,
        type: "html",
        html: content,
        subject: request.subject ?? request.templateKey,
        sender_email: firstConfiguredEnv(["ENGINEMAILER_MARKETING_FROM_EMAIL", "ENGINEMAILER_FROM_EMAIL"]),
        sender_name: request.fromName ?? "Service Writer",
        substitution_tags: [],
      }),
    }, primaryApiKey);
  }

  private async sendTransactional(request: SendMessageRequest, content: string): Promise<EnginemailerResult> {
    const apiKey = process.env.ENGINEMAILER_TRANSACTIONAL_API_KEY?.trim()
      || requiredEnv("ENGINEMAILER_API_KEY");
    return requestEnginemailer(ENGINEMAILER_TRANSACTIONAL_API_URL, {
      method: "POST",
      body: JSON.stringify({
        CampaignName: request.templateKey,
        ToEmail: request.recipient.email,
        Subject: request.subject ?? request.templateKey,
        SenderEmail: firstConfiguredEnv(["ENGINEMAILER_TRANSACTIONAL_FROM_EMAIL", "ENGINEMAILER_FROM_EMAIL"]),
        SubmittedContent: content,
        SenderName: request.fromName ?? "Service Writer",
        SubstitutionTags: [],
      }),
    }, apiKey);
  }

  async healthCheck() {
    try {
      await requestEnginemailer(`${ENGINEMAILER_CONNECT_API_URL}/connect`, { method: "GET" });
      return { providerName: this.providerName, healthy: true };
    } catch (error) {
      return {
        providerName: this.providerName,
        healthy: false,
        detail: error instanceof Error ? error.message : "Health check failed",
      };
    }
  }

  verifyWebhook(request: Request, rawBody: string): boolean {
    const secret = process.env.ENGINEMAILER_WEBHOOK_SIGNING_SECRET?.trim();
    return Boolean(secret && verifyHmac(secret, request, rawBody));
  }

  normalizeDelivery(rawBody: string, _request: Request): NormalizedDeliveryEvent[] {
    const payload = JSON.parse(rawBody) as { event?: string; details?: Record<string, unknown> };
    const event = String(payload.event ?? "").toLowerCase();
    const details = payload.details ?? {};
    const messageId = details.txid
      ?? details.CampaignTxID
      ?? details.campaigntxid
      ?? details.autorespondertxid;
    if (messageId === undefined || messageId === null) return [];
    const status = (event === "delivery" || event === "delivered") ? "delivered"
      : event === "bounce" ? "bounced"
      : (event === "spam" || event === "spam-complaint") ? "complained"
      : (event === "unsubscribe" || event === "unsubscribed") ? "canceled"
      : null;
    // Open and click webhooks are valid engagement events, but they do not
    // change the delivery state tracked by message_logs.
    if (event === "open" || event === "click") return [];
    if (!status) return [];
    const occurredAt = webhookDate(
      details.deliverydate
      ?? details.bouncedate
      ?? details.spamcomplaintdate
      ?? details.unsubscribedate,
    );
    const recipient = typeof details.email === "string" ? details.email.trim().toLowerCase() : undefined;
    const providerEventId = createHash("sha256")
      .update(`${event}:${String(messageId)}:${occurredAt}:${recipient ?? ""}`)
      .digest("hex");
    return [{
      providerMessageId: String(messageId),
      providerEventId,
      status,
      occurredAt,
      recipient,
      failureCode: typeof details.bouncecode === "string" ? details.bouncecode : undefined,
      failureReason: typeof details.bouncereason === "string"
        ? details.bouncereason
        : typeof details.spamcomplaintreason === "string"
          ? details.spamcomplaintreason
          : event === "unsubscribed"
            ? "Recipient unsubscribed from marketing email"
            : undefined,
      rawPayload: payload as Record<string, unknown>,
    }];
  }

  normalizeInbound(_rawBody: string, _request: Request): InboundReply[] {
    return [];
  }
}
