import type {
  MessagingAdapter,
  MessagingChannel,
  ProviderHealth,
  ProviderSendResult,
  SendMessageRequest,
} from "./contracts";
import { assertChannelMatchesRequest } from "./contracts";

export interface MessagingRegistry {
  register(adapter: MessagingAdapter): void;
  resolve(channel: MessagingChannel, providerName?: string): MessagingAdapter;
  send(request: SendMessageRequest): Promise<ProviderSendResult>;
  healthCheck(): Promise<ProviderHealth[]>;
}

export class DefaultMessagingRegistry implements MessagingRegistry {
  private readonly adapters = new Map<string, MessagingAdapter>();
  private readonly defaults = new Map<MessagingChannel, string>();

  register(adapter: MessagingAdapter): void {
    const key = `${adapter.channel}:${adapter.providerName}`;
    this.adapters.set(key, adapter);
    if (!this.defaults.has(adapter.channel)) this.defaults.set(adapter.channel, adapter.providerName);
  }

  setDefault(channel: MessagingChannel, providerName: string): void {
    this.resolve(channel, providerName);
    this.defaults.set(channel, providerName);
  }

  resolve(channel: MessagingChannel, providerName?: string): MessagingAdapter {
    const selectedProvider = providerName ?? this.defaults.get(channel);
    if (!selectedProvider) throw new Error(`No messaging provider configured for ${channel}`);
    const adapter = this.adapters.get(`${channel}:${selectedProvider}`);
    if (!adapter) throw new Error(`Messaging provider ${selectedProvider} is not registered for ${channel}`);
    return adapter;
  }

  async send(request: SendMessageRequest): Promise<ProviderSendResult> {
    const adapter = this.resolve(request.channel, request.metadata.providerName);
    assertChannelMatchesRequest(adapter, request);
    return adapter.send(request);
  }

  async healthCheck(): Promise<ProviderHealth[]> {
    return Promise.all([...this.adapters.values()].map((adapter) => adapter.healthCheck()));
  }
}

export const messagingRegistry = new DefaultMessagingRegistry();
