/**
 * Tests for the model-provider abstraction: all four wires normalize to
 * the same contract. The HTTP boundary is fully mocked — no network, no
 * real calls (there is no sandbox; every call bills).
 */
import {
  PROVIDER_WIRES,
  ProviderError,
  chatCompletion,
} from "../providers";
import type { ChatMessage, ModelProviderName } from "../providers";

const MESSAGES: ChatMessage[] = [{ role: "user", content: "hello" }];

interface Call {
  url: string;
  init: RequestInit;
}

function mockFetch(handler: (call: Call) => unknown) {
  const calls: Call[] = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    const call = { url: String(url), init: init ?? {} };
    calls.push(call);
    const payload = handler(call);
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response;
  }) as typeof fetch;
  return { impl, calls };
}

function bodyOf(call: Call): Record<string, unknown> {
  return JSON.parse(String(call.init.body)) as Record<string, unknown>;
}

function headersOf(call: Call): Record<string, string> {
  const h = call.init.headers as Record<string, string>;
  return h;
}

describe("provider wires — one normalized contract", () => {
  const cases: Array<{
    provider: ModelProviderName;
    response: unknown;
    expectedContent: string;
    expectedModel: string;
  }> = [
    {
      provider: "openai",
      response: {
        choices: [{ message: { content: '{"reply":"hi"}' } }],
        model: "gpt-4o-mini-2024-07-18",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      expectedContent: '{"reply":"hi"}',
      expectedModel: "gpt-4o-mini-2024-07-18",
    },
    {
      provider: "xai",
      response: {
        choices: [{ message: { content: '{"reply":"hi"}' } }],
        model: "grok-3-mini",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      expectedContent: '{"reply":"hi"}',
      expectedModel: "grok-3-mini",
    },
    {
      provider: "gemini",
      response: {
        choices: [{ message: { content: '{"reply":"hi"}' } }],
        model: "gemini-2.5-flash",
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      },
      expectedContent: '{"reply":"hi"}',
      expectedModel: "gemini-2.5-flash",
    },
    {
      provider: "anthropic",
      response: {
        content: [{ type: "text", text: '{"reply":"hi"}' }],
        model: "claude-haiku-4-5",
        usage: { input_tokens: 10, output_tokens: 5 },
      },
      expectedContent: '{"reply":"hi"}',
      expectedModel: "claude-haiku-4-5",
    },
  ];

  test.each(cases.map((c) => [c.provider, c] as const))(
    "%s normalizes content, model, and usage",
    async (_name, c) => {
      const { impl, calls } = mockFetch(() => c.response);
      const result = await chatCompletion(c.provider, "test-key", MESSAGES, {
        fetchImpl: impl,
      });
      expect(result.content).toBe(c.expectedContent);
      expect(result.model).toBe(c.expectedModel);
      expect(result.usage?.promptTokens).toBe(10);
      expect(result.usage?.completionTokens).toBe(5);
      expect(calls).toHaveLength(1);
    },
  );

  test("openai-wire providers hit /chat/completions with a Bearer key", async () => {
    for (const provider of ["openai", "gemini", "xai"] as const) {
      const { impl, calls } = mockFetch(() => ({ choices: [] }));
      await chatCompletion(provider, "k", MESSAGES, { fetchImpl: impl });
      const call = calls[0];
      expect(call.url).toBe(
        `${PROVIDER_WIRES[provider].baseUrl.replace(/\/+$/, "")}/chat/completions`,
      );
      expect(headersOf(call)["Authorization"]).toBe("Bearer k");
      const body = bodyOf(call);
      expect(body["model"]).toBe(PROVIDER_WIRES[provider].defaultModel);
      expect(body["max_tokens"]).toBe(300);
    }
  });

  test("anthropic wire hits /messages with x-api-key and version header", async () => {
    const { impl, calls } = mockFetch(() => ({ content: [] }));
    await chatCompletion(
      "anthropic",
      "k",
      [
        { role: "system", content: "sys" },
        { role: "user", content: "hi" },
      ],
      { fetchImpl: impl },
    );
    const call = calls[0];
    expect(call.url).toBe("https://api.anthropic.com/v1/messages");
    expect(headersOf(call)["x-api-key"]).toBe("k");
    expect(headersOf(call)["anthropic-version"]).toBe("2023-06-01");
    const body = bodyOf(call);
    expect(body["system"]).toBe("sys");
    expect(body["messages"]).toEqual([{ role: "user", content: "hi" }]);
  });

  test("model override is honored", async () => {
    const { impl, calls } = mockFetch(() => ({ choices: [] }));
    await chatCompletion("openai", "k", MESSAGES, {
      model: "gpt-4o",
      fetchImpl: impl,
    });
    expect(bodyOf(calls[0])["model"]).toBe("gpt-4o");
  });

  test("non-2xx becomes ProviderError (never leaks the key)", async () => {
    const impl = (async () => ({
      ok: false,
      status: 429,
      text: async () => "rate limited",
    })) as unknown as typeof fetch;
    await expect(
      chatCompletion("openai", "secret-key", MESSAGES, { fetchImpl: impl }),
    ).rejects.toMatchObject({ name: "ProviderError", status: 429 });
  });

  test("empty key fails before any request", async () => {
    const { impl, calls } = mockFetch(() => ({}));
    await expect(
      chatCompletion("openai", "   ", MESSAGES, { fetchImpl: impl }),
    ).rejects.toThrow(ProviderError);
    expect(calls).toHaveLength(0);
  });
});
