export * from "./contracts";
export * from "./registry";

import type {
  MessagingAdapter,
  ProviderHealth,
  ProviderSendResult,
  SendMessageRequest,
} from "./contracts";
import { messagingRegistry } from "./registry";

class DisconnectedAdapter implements MessagingAdapter {
  get capabilities() {
    return {
      channels: [this.channel] as const,
      supportsScheduling: false,
      supportsInboundReplies: false,
      supportsDeliveryEvents: false,
      supportsAttachments: false,
      supportsTemplates: true,
    };
  }

  constructor(
    readonly providerName: string,
    readonly channel: "email" | "sms",
  ) {}

  async send(_request: SendMessageRequest): Promise<ProviderSendResult> {
    throw new Error(`${this.channel} provider is not configured. Configure a server-side adapter before sending messages.`);
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      providerName: this.providerName,
      healthy: false,
      checkedAt: new Date().toISOString(),
      detail: "No provider credentials configured",
    };
  }
}

// Explicit defaults make missing integration setup observable and safe. Replace
// these registrations with Resend/Twilio/etc. adapters in the server package;
// domain code remains unchanged.
messagingRegistry.register(new DisconnectedAdapter("unconfigured-email", "email"));
messagingRegistry.register(new DisconnectedAdapter("unconfigured-sms", "sms"));
