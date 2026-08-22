import { z } from "zod";

export const messagePurposeSchema = z.enum([
  "transactional",
  "service_reminder",
  "appointment_update",
  "payment_request",
  "marketing",
  "authentication",
]);
export type MessagePurpose = z.infer<typeof messagePurposeSchema>;

export const sendMessageSchema = z.object({
  workspaceId: z.string().uuid(),
  recipient: z.object({
    email: z.string().email().optional(),
    phone: z.string().min(7).max(32).optional(),
  }).refine((value) => Boolean(value.email || value.phone)),
  purpose: messagePurposeSchema,
  templateKey: z.string().trim().min(1).max(120),
  subject: z.string().trim().max(200).optional(),
  body: z.string().trim().min(1).max(100_000),
  idempotencyKey: z.string().trim().min(16).max(200),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type SendMessageRequest = z.infer<typeof sendMessageSchema>;

export type DeliveryStatus = "queued" | "accepted" | "sent" | "delivered" | "failed" | "bounced" | "complained" | "undeliverable" | "canceled";

export interface ProviderSendResult {
  providerMessageId: string;
  providerName: string;
  status: Extract<DeliveryStatus, "queued" | "accepted" | "sent">;
  acceptedAt: string;
}

export interface NormalizedDeliveryEvent {
  providerMessageId: string;
  providerEventId?: string;
  status: DeliveryStatus;
  occurredAt: string;
  recipient?: string;
  failureCode?: string;
  failureReason?: string;
  rawPayload: Record<string, unknown>;
}

export interface InboundReply {
  providerMessageId?: string;
  providerEventId?: string;
  from: string;
  to: string;
  body: string;
  receivedAt: string;
  rawPayload: Record<string, unknown>;
}

export interface MessagingAdapter {
  readonly providerName: string;
  send(request: SendMessageRequest): Promise<ProviderSendResult>;
  healthCheck(): Promise<{ providerName: string; healthy: boolean; detail?: string }>;
  verifyWebhook(request: Request, rawBody: string): boolean;
  normalizeDelivery(rawBody: string, request: Request): NormalizedDeliveryEvent[];
  normalizeInbound?(rawBody: string, request: Request): InboundReply[];
}

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}
