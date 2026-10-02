/**
 * ZeroAI model-provider abstraction for the Shop Agent (Phase 1).
 *
 * One small `chatCompletion(messages, opts)` interface; four wires behind it
 * (OpenAI, Anthropic native Messages, Google Gemini via OpenAI-compat, xAI via
 * OpenAI-compat). The rest of the agent only ever talks to this contract —
 * swapping providers is one env var, never a code change.
 *
 * Note: Fleet-Mail carries an equivalent abstraction in its own repo
 * (`src/server/services/ai/`). Cross-repo import is not possible; the
 * duplication is intentional and noted as a follow-up (shared package).
 *
 * Nothing here is Shop-Agent-specific: no intents, no task graph, no policy.
 * All ZeroAI guardrails live in provider-reasoner.ts.
 */

export type ModelProviderName = "openai" | "anthropic" | "gemini" | "xai";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  /** Overrides the wire's default model. */
  model?: string;
  /** Cap on generated tokens (SMS replies are short; keep this small). */
  maxTokens?: number;
  /** Lower = more deterministic. SMS replies want low temperature. */
  temperature?: number;
  /** Caller-owned abort (used for the request timeout). */
  signal?: AbortSignal;
  /** Injectable fetch for tests (defaults to global fetch). */
  fetchImpl?: typeof fetch;
}

export interface TokenUsage {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ChatCompletionResult {
  content: string;
  /** Model id the provider reports it ran. */
  model: string;
  /** Normalized usage for the ZeroCert cost story. */
  usage?: TokenUsage;
}

export type ProviderWireKind = "openai" | "anthropic";

export interface ProviderWireConfig {
  name: ModelProviderName;
  label: string;
  baseUrl: string;
  wire: ProviderWireKind;
  /**
   * Cheap/fast tier default — SMS conversations need low latency and low
   * cost, not frontier reasoning. Best-effort as of 2026-10; override with
   * SHOP_AGENT_MODEL_NAME and verify against current provider docs.
   */
  defaultModel: string;
}

export const PROVIDER_WIRES: Record<ModelProviderName, ProviderWireConfig> = {
  openai: {
    name: "openai",
    label: "OpenAI",
    baseUrl: "https://api.openai.com/v1",
    wire: "openai",
    defaultModel: "gpt-4o-mini",
  },
  anthropic: {
    name: "anthropic",
    label: "Anthropic",
    baseUrl: "https://api.anthropic.com/v1",
    wire: "anthropic",
    defaultModel: "claude-haiku-4-5",
  },
  gemini: {
    name: "gemini",
    label: "Google Gemini",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
    wire: "openai",
    defaultModel: "gemini-2.5-flash",
  },
  xai: {
    name: "xai",
    label: "xAI",
    baseUrl: "https://api.x.ai/v1",
    wire: "openai",
    defaultModel: "grok-3-mini",
  },
};

/** Thrown for transport and provider-side failures. Never leaks the key. */
export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly provider: ModelProviderName,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}

async function throwForStatus(
  response: Response,
  provider: ModelProviderName,
): Promise<void> {
  if (response.ok) return;
  let detail = "";
  try {
    const text = await response.text();
    detail = text.slice(0, 400);
  } catch {
    // ignore
  }
  throw new ProviderError(
    `${provider} request failed with ${response.status}${detail ? `: ${detail}` : ""}`,
    provider,
    response.status,
  );
}

interface OpenAIWireResult {
  choices?: Array<{ message?: { content?: string | null } }>;
  model?: string;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

async function openaiWire(
  config: ProviderWireConfig,
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const model = opts.model ?? config.defaultModel;
  const doFetch = opts.fetchImpl ?? fetch;
  const response = await doFetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      max_tokens: opts.maxTokens ?? 300,
      temperature: opts.temperature ?? 0.2,
    }),
    signal: opts.signal,
  });
  await throwForStatus(response, config.name);
  const data = (await response.json()) as OpenAIWireResult;
  const content = data.choices?.[0]?.message?.content ?? "";
  return {
    content: typeof content === "string" ? content : "",
    model: data.model ?? model,
    usage: data.usage
      ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        }
      : undefined,
  };
}

interface AnthropicWireResult {
  content?: Array<{ type?: string; text?: string }>;
  model?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

async function anthropicWire(
  config: ProviderWireConfig,
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatCompletionOptions,
): Promise<ChatCompletionResult> {
  const model = opts.model ?? config.defaultModel;
  const system = messages
    .filter((m) => m.role === "system")
    .map((m) => m.content)
    .join("\n\n");
  const rest = messages
    .filter((m) => m.role !== "system")
    .map((m) => ({ role: m.role, content: m.content }));
  const doFetch = opts.fetchImpl ?? fetch;
  const response = await doFetch(`${config.baseUrl.replace(/\/+$/, "")}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: opts.maxTokens ?? 300,
      system: system || undefined,
      messages: rest,
    }),
    signal: opts.signal,
  });
  await throwForStatus(response, config.name);
  const data = (await response.json()) as AnthropicWireResult;
  const content = (data.content ?? [])
    .filter((b) => b?.type === "text")
    .map((b) => String(b.text ?? ""))
    .join("");
  return {
    content,
    model: data.model ?? model,
    usage: data.usage
      ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens:
            data.usage.input_tokens != null && data.usage.output_tokens != null
              ? data.usage.input_tokens + data.usage.output_tokens
              : undefined,
        }
      : undefined,
  };
}

/**
 * One normalized chat-completion call across all four providers.
 * Throws ProviderError on transport/provider failures (caller decides:
 * the reasoner treats these as handoff). Never logs or returns the key.
 */
export async function chatCompletion(
  provider: ModelProviderName,
  apiKey: string,
  messages: ChatMessage[],
  opts: ChatCompletionOptions = {},
): Promise<ChatCompletionResult> {
  const config = PROVIDER_WIRES[provider];
  if (!config) {
    throw new ProviderError(`unknown model provider: ${provider}`, provider);
  }
  if (!apiKey || !apiKey.trim()) {
    throw new ProviderError(`no API key configured for ${provider}`, provider);
  }
  return config.wire === "anthropic"
    ? anthropicWire(config, apiKey.trim(), messages, opts)
    : openaiWire(config, apiKey.trim(), messages, opts);
}
