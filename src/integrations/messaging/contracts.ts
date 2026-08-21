import { z } from "zod";

export const messagingChannelSchema = z.enum(["email", "sms"]);
export type MessagingChannel = z.infer<typeof messagingChannelSchema>;

export const messagePurposeSchema = z.enum([
  "transactional",
  "service_reminder",
  "appointment_update",
  "payment_request",
  "marketing",
  "authentication",
]);
export type MessagePurpose = z.infer<typeof messagePurposeSchema>;

export const messageAddressSchema = z.object({
  email: z.string().trim().email().optional(),
  phone: z.string().trim().min(7).max(32).optional(),
}).refine((value) => Boolean(value.email || value.phone), {
  message: "A valid email address or phone number is required",
});

export const sendMessageRequestSchema = z.object({
  workspaceId: z.string().uuid(),
  recipient: messageAddressSchema,
  channel: messagingChannelSchema,
  purpose: messagePurposeSchema,
  templateKey: z.string().trim().min(1).max(120),
  variables: z.record(z.string(), z.union([z.string(), z.number(), z.boolean(), z.null()])).default({}),
  idempotencyKey: z.string().trim().min(16).max(200),
  scheduledAt: z.string().datetime().optional(),
  metadata: z.record(z.string(), z.string()).default({}),
});
export type SendMessageRequest = z.infer<typeof sendMessageRequestSchema>;

export const providerMessageStatusSchema = z.enum([
  "queued",
  "accepted",
  "sent",
  "delivered",
  "failed",
  "bounced",
  "complained",
  "undeliverable",
  "canceled",
]);
export type ProviderMessageStatus = z.infer<typeof providerMessageStatusSchema>;

export const deliveryEventSchema = z.object({
  providerMessageId: z.string().trim().min(1),
  status: providerMessageStatusSchema,
  occurredAt: z.string().datetime(),
  channel: messagingChannelSchema,
  recipient: messageAddressSchema,
  failureCode: z.string().trim().max(120).optional(),
  failureReason: z.string().trim().max(500).optional(),
  rawEventId: z.string().trim().max(200).optional(),
  rawPayload: z.record(z.string(), z.unknown()).optional(),
});
export type DeliveryEvent = z.infer<typeof deliveryEventSchema>;

export interface MessagingCapabilities {
  channels: readonly MessagingChannel[];
  supportsScheduling: boolean;
  supportsInboundReplies: boolean;
  supportsDeliveryEvents: boolean;
  supportsAttachments: boolean;
  supportsTemplates: boolean;
}

export interface ProviderSendResult {
  providerMessageId: string;
  acceptedAt: string;
  status: Extract<ProviderMessageStatus, "queued" | "accepted" | "sent">;
  providerName: string;
}

export interface ProviderHealth {
  providerName: string;
  healthy: boolean;
  checkedAt: string;
  detail?: string;
}

export interface MessagingAdapter {
  readonly providerName: string;
  readonly channel: MessagingChannel;
  readonly capabilities: MessagingCapabilities;
  send(request: SendMessageRequest): Promise<ProviderSendResult>;
  verifyWebhook?(request: Request): Promise<boolean>;
  normalizeDeliveryEvent?(request: Request): Promise<DeliveryEvent[]>;
  healthCheck(): Promise<ProviderHealth>;
}

export function assertChannelMatchesRequest(adapter: MessagingAdapter, request: SendMessageRequest): void {
  if (adapter.channel !== request.channel) {
    throw new Error(`Adapter ${adapter.providerName} does not support ${request.channel}`);
  }
  if (request.purpose === "marketing" && !adapter.capabilities.supportsTemplates) {
    throw new Error(`Adapter ${adapter.providerName} cannot send templated marketing messages`);
  }
}
