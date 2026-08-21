import { DefaultMessagingRegistry } from "../registry";
import type { MessagingAdapter, ProviderSendResult, SendMessageRequest } from "../contracts";

const request: SendMessageRequest = {
  workspaceId: "00000000-0000-4000-8000-000000000001",
  recipient: { email: "customer@example.com" },
  channel: "email",
  purpose: "transactional",
  templateKey: "appointment.confirmed",
  variables: {},
  idempotencyKey: "idempotency-key-000001",
  metadata: {},
};

function adapter(providerName: string): MessagingAdapter {
  return {
    providerName,
    channel: "email",
    capabilities: {
      channels: ["email"],
      supportsScheduling: false,
      supportsInboundReplies: false,
      supportsDeliveryEvents: true,
      supportsAttachments: true,
      supportsTemplates: true,
    },
    async send(): Promise<ProviderSendResult> {
      return { providerMessageId: "provider-message-1", acceptedAt: new Date().toISOString(), status: "accepted", providerName };
    },
    async healthCheck() {
      return { providerName, healthy: true, checkedAt: new Date().toISOString() };
    },
  };
}

describe("DefaultMessagingRegistry", () => {
  it("uses the first registered provider as the channel default", async () => {
    const registry = new DefaultMessagingRegistry();
    registry.register(adapter("provider-a"));
    registry.register(adapter("provider-b"));
    await expect(registry.send(request)).resolves.toMatchObject({ providerName: "provider-a" });
  });

  it("supports switching the default provider without changing the request contract", async () => {
    const registry = new DefaultMessagingRegistry();
    registry.register(adapter("provider-a"));
    registry.register(adapter("provider-b"));
    registry.setDefault("email", "provider-b");
    await expect(registry.send(request)).resolves.toMatchObject({ providerName: "provider-b" });
  });

  it("rejects an unregistered provider explicitly", async () => {
    const registry = new DefaultMessagingRegistry();
    registry.register(adapter("provider-a"));
    await expect(registry.send({ ...request, metadata: { providerName: "missing" } })).rejects.toThrow("not registered");
  });
});
