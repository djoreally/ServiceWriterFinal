/**
 * Tests for the provider-backed reasoner: env bootstrap, deterministic
 * guardrails (timeout, turn cap, output validation), and prompt-assembly
 * boundaries. The HTTP boundary is fully mocked — no network, no real
 * calls (there is no sandbox; every call bills).
 */
import { NoopReasoner } from "../reasoners";
import {
  MODEL_MAX_TURNS,
  ProviderReasoner,
  buildSystemPrompt,
  buildUserPrompt,
  createReasonerFromEnv,
  validateModelOutput,
} from "../provider-reasoner";
import { AGENT_REGISTRY } from "../registry";
import type {
  ConversationState,
  ReasonInput,
  ShopProfile,
} from "../types";

function profile(): ShopProfile {
  return {
    workspaceId: "ws-test",
    businessName: "Test Shop",
    publicPhone: "+12155550147",
    hours: { timezone: "America/New_York", days: {} },
    serviceArea: { towns: ["Ambler"], zips: ["19002"] },
    services: [
      { id: "s1", name: "Oil Change", priceMin: 65, priceMax: 65, estimatedMinutes: 30 },
    ],
    completenessScore: 100,
    missingFields: [],
  };
}

function input(overrides: Partial<ReasonInput> = {}): ReasonInput {
  return {
    intent: {
      intentId: "i1",
      workspaceId: "ws-test",
      channel: "sms",
      actor: "+12155559999",
      goal: "book a service",
      constraints: ["no invented prices"],
      acceptanceCriteria: [],
      permissions: [],
      resources: [],
      riskLevel: "low",
      sourceEvent: { conversationState: "greeted" },
      createdAt: "2026-10-01T23:00:00Z",
    },
    facts: { extra: {} },
    summary: "Customer texted in asking about an oil change.",
    profile: profile(),
    instructionSet: AGENT_REGISTRY.sms_agent.instructionSet,
    ...overrides,
  };
}

function openaiResponse(content: string) {
  return {
    choices: [{ message: { content } }],
    model: "gpt-4o-mini",
    usage: { prompt_tokens: 100, completion_tokens: 20, total_tokens: 120 },
  };
}

function mockFetch(payload: unknown) {
  const calls: Array<{ url: string; init: RequestInit }> = [];
  const impl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    return {
      ok: true,
      status: 200,
      json: async () => payload,
      text: async () => JSON.stringify(payload),
    } as unknown as Response;
  }) as typeof fetch;
  return { impl, calls };
}

const VALID_JSON = JSON.stringify({
  reply: "We can do that — what year, make, and model is the car?",
  suggestedState: "need_identified",
  confidence: 0.85,
  extractedFacts: { need: "oil change" },
});

describe("createReasonerFromEnv — fail-closed bootstrap", () => {
  test("no key → NoopReasoner (safe default)", () => {
    const r = createReasonerFromEnv({});
    expect(r).toBeInstanceOf(NoopReasoner);
  });

  test("unknown provider → NoopReasoner", () => {
    const r = createReasonerFromEnv({
      SHOP_AGENT_MODEL_PROVIDER: "skynet",
      SHOP_AGENT_MODEL_API_KEY: "k",
    });
    expect(r).toBeInstanceOf(NoopReasoner);
  });

  test("provider switch is one env var", () => {
    const r = createReasonerFromEnv({
      SHOP_AGENT_MODEL_PROVIDER: "anthropic",
      SHOP_AGENT_MODEL_API_KEY: "k",
    });
    expect(r).toBeInstanceOf(ProviderReasoner);
    expect(r.name).toBe("provider:anthropic");
  });

  test("model name override is honored", () => {
    const { impl, calls } = mockFetch(openaiResponse(VALID_JSON));
    const r = new ProviderReasoner({
      provider: "openai",
      apiKey: "k",
      model: "gpt-4o",
      fetchImpl: impl,
    });
    return r.reason(input()).then(() => {
      const body = JSON.parse(String(calls[0].init.body));
      expect(body.model).toBe("gpt-4o");
    });
  });
});

describe("ProviderReasoner — happy path", () => {
  test("valid model output passes through with usage evidence", async () => {
    const { impl } = mockFetch(openaiResponse(VALID_JSON));
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("need_identified");
    expect(out.confidence).toBe(0.85);
    expect(out.reply).toContain("year, make, and model");
    expect(out.extractedFacts).toMatchObject({ need: "oil change" });
    expect(out.usage?.model).toBe("gpt-4o-mini");
    expect(out.usage?.promptTokens).toBe(100);
    expect(out.usage?.totalTokens).toBe(120);
    expect(out.usage?.latencyMs).toBeGreaterThanOrEqual(0);
  });

  test("unknown extractedFacts keys are dropped", async () => {
    const { impl } = mockFetch(
      openaiResponse(
        JSON.stringify({
          reply: "ok",
          suggestedState: "need_identified",
          confidence: 0.9,
          extractedFacts: { need: "brakes", creditCard: "4111", __proto__: "x" },
        }),
      ),
    );
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.extractedFacts).toMatchObject({ need: "brakes" });
    expect(out.extractedFacts).not.toHaveProperty("creditCard");
  });
});

describe("ProviderReasoner — deterministic guardrails", () => {
  test("request timeout → handoff, never hangs", async () => {
    const impl = ((url: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        const signal = init?.signal as AbortSignal | undefined;
        if (signal?.aborted) {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
          return;
        }
        signal?.addEventListener("abort", () => {
          const e = new Error("aborted");
          e.name = "AbortError";
          reject(e);
        });
      })) as unknown as typeof fetch;
    const r = new ProviderReasoner({
      provider: "openai",
      apiKey: "k",
      timeoutMs: 50,
      fetchImpl: impl,
    });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("handed_off");
    expect(out.handoffReason).toContain("timed out");
  });

  test("provider error → handoff", async () => {
    const impl = (async () => ({
      ok: false,
      status: 500,
      text: async () => "boom",
    })) as unknown as typeof fetch;
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("handed_off");
    expect(out.handoffReason).toContain("failed");
  });

  test("malformed JSON → handoff", async () => {
    const { impl } = mockFetch(openaiResponse("not json at all {{{"));
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("handed_off");
    expect(out.handoffReason).toContain("validation");
  });

  test("unknown state → handoff", async () => {
    const { impl } = mockFetch(
      openaiResponse(JSON.stringify({ reply: "x", suggestedState: "teleport", confidence: 1 })),
    );
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("handed_off");
  });

  test("illegal transition (greeted → booked) → handoff", async () => {
    const { impl } = mockFetch(
      openaiResponse(
        JSON.stringify({ reply: "booked!", suggestedState: "booked", confidence: 0.99 }),
      ),
    );
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input());
    expect(out.suggestedState).toBe("handed_off");
  });

  test(`turn cap (${MODEL_MAX_TURNS}) → handoff without calling the model`, async () => {
    const { impl, calls } = mockFetch(openaiResponse(VALID_JSON));
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    const out = await r.reason(input({ turnCount: MODEL_MAX_TURNS }));
    expect(out.suggestedState).toBe("handed_off");
    expect(out.handoffReason).toContain("turn cap");
    expect(calls).toHaveLength(0);
  });

  test("below-cap turns still call the model", async () => {
    const { impl, calls } = mockFetch(openaiResponse(VALID_JSON));
    const r = new ProviderReasoner({ provider: "openai", apiKey: "k", fetchImpl: impl });
    await r.reason(input({ turnCount: MODEL_MAX_TURNS - 1 }));
    expect(calls).toHaveLength(1);
  });
});

describe("validateModelOutput — task-graph validation", () => {
  const state = "greeted" as ConversationState;

  test("empty reply without handoff is off-spec", () => {
    expect(
      validateModelOutput(
        JSON.stringify({ reply: "", suggestedState: "need_identified", confidence: 0.9 }),
        state,
      ),
    ).toBeNull();
  });

  test("non-object JSON is off-spec", () => {
    expect(validateModelOutput("[1,2,3]", state)).toBeNull();
    expect(validateModelOutput("null", state)).toBeNull();
  });

  test("handoff without explicit reason gets a default", () => {
    const out = validateModelOutput(
      JSON.stringify({ reply: "", suggestedState: "handed_off", confidence: 0.2 }),
      state,
    );
    expect(out?.suggestedState).toBe("handed_off");
    expect(out?.handoffReason).toBeTruthy();
  });

  test("confidence is clamped to 0..1", () => {
    const out = validateModelOutput(
      JSON.stringify({ reply: "hi", suggestedState: "need_identified", confidence: 42 }),
      state,
    );
    expect(out?.confidence).toBe(1);
  });

  test("reply is clamped to the SMS limit", () => {
    const out = validateModelOutput(
      JSON.stringify({
        reply: "x".repeat(500),
        suggestedState: "need_identified",
        confidence: 0.9,
      }),
      state,
    );
    expect(out?.reply.length).toBeLessThanOrEqual(320);
  });
});

describe("prompt assembly — projection boundary", () => {
  test("system prompt carries the registry instruction set", () => {
    const sys = buildSystemPrompt(input());
    expect(sys).toContain("sms_agent v1.0.0");
    expect(sys).toContain("NEVER invent prices");
    expect(sys).toContain("Respond with JSON ONLY");
  });

  test("user prompt carries intent + memory projection + profile", () => {
    const user = buildUserPrompt(input());
    expect(user).toContain("book a service");
    expect(user).toContain("Customer texted in asking about an oil change.");
    expect(user).toContain("Test Shop");
    expect(user).toContain("Oil Change");
    expect(user).toContain("$65");
  });

  test("raw phone number and raw transcripts never enter the prompt", () => {
    const sys = buildSystemPrompt(input());
    const user = buildUserPrompt(input());
    // intent.actor is the caller's raw E.164 — it must not leak into the prompt.
    expect(sys).not.toContain("+12155559999");
    expect(user).not.toContain("+12155559999");
    // The shop's own public number appears only via the profile's templates,
    // not as free text the model could misuse — profile rendering is fine.
  });

  test("missing profile fields render as explicit unknowns, not blanks", () => {
    const p = profile();
    p.services = [];
    const user = buildUserPrompt(input({ profile: p }));
    expect(user).toContain("none listed");
  });
});
