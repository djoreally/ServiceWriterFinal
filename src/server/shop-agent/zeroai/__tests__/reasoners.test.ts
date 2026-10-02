/**
 * Tests for the model boundary: NoopReasoner (safe default) and
 * StubReasoner (deterministic, network-free).
 */
import {
  NOOP_HANDOFF_MESSAGE,
  NoopReasoner,
  StubReasoner,
} from "../reasoners";
import { MAX_SMS_CHARS } from "../registry";
import type { ReasonInput, ReasonOutput, ShopProfile } from "../types";

function profile(): ShopProfile {
  return {
    workspaceId: "ws-test",
    businessName: "Test Shop",
    hours: { timezone: "America/New_York", days: {} },
    serviceArea: { towns: ["Ambler"], zips: ["19002"] },
    services: [],
    completenessScore: 100,
    missingFields: [],
  };
}

function input(summary: string): ReasonInput {
  return {
    intent: {
      intentId: "i1",
      workspaceId: "ws-test",
      channel: "sms",
      actor: "callersha",
      goal: "book a service",
      constraints: [],
      acceptanceCriteria: [],
      permissions: [],
      resources: [],
      riskLevel: "low",
      sourceEvent: {},
      createdAt: "2026-10-01T23:00:00Z",
    },
    facts: { extra: {} },
    summary,
    profile: profile(),
    instructionSet: "do no harm",
  };
}

describe("NoopReasoner — the safe default", () => {
  test("always hands off with confidence 0, never invents a reply", async () => {
    const reasoner = new NoopReasoner();
    expect(reasoner.name).toBe("noop");

    for (const summary of [
      "customer asked for a price",
      "angry customer demanding a manager",
      "",
    ]) {
      const out: ReasonOutput = await reasoner.reason(input(summary));
      expect(out.suggestedState).toBe("handed_off");
      expect(out.confidence).toBe(0);
      expect(out.handoffReason).toBe("no model configured");
      expect(out.reply).toBe(NOOP_HANDOFF_MESSAGE);
      expect(out.reply.length).toBeLessThanOrEqual(MAX_SMS_CHARS);
    }
  });

  test("accepts a custom handoff message but still hands off at confidence 0", async () => {
    const reasoner = new NoopReasoner("Custom handoff text.");
    const out = await reasoner.reason(input("anything"));
    expect(out.reply).toBe("Custom handoff text.");
    expect(out.suggestedState).toBe("handed_off");
    expect(out.confidence).toBe(0);
  });

  test("clamps overlong replies to the SMS limit", async () => {
    const reasoner = new NoopReasoner("x".repeat(MAX_SMS_CHARS + 50));
    const out = await reasoner.reason(input("anything"));
    expect(out.reply.length).toBe(MAX_SMS_CHARS);
    expect(out.confidence).toBe(0);
  });
});

describe("StubReasoner — deterministic scripted behavior", () => {
  const priceRule = {
    match: "price",
    output: {
      reply: "An oil change starts at $79 — want me to book one for you?",
      extractedFacts: { need: "oil change" },
      suggestedState: "need_identified",
      confidence: 0.9,
    } as ReasonOutput,
  };
  const fallbackRule = {
    match: null,
    output: {
      reply: "Thanks — handing this to the shop team.",
      extractedFacts: {},
      suggestedState: "handed_off",
      confidence: 0.1,
      handoffReason: "stub fallback",
    } as ReasonOutput,
  };

  test("name is stub and the first matching rule wins", async () => {
    const reasoner = new StubReasoner([priceRule, fallbackRule]);
    expect(reasoner.name).toBe("stub");

    const out = await reasoner.reason(input("customer asked about the PRICE"));
    expect(out.reply).toBe(priceRule.output.reply);
    expect(out.suggestedState).toBe("need_identified");
    expect(out.extractedFacts.need).toBe("oil change");
  });

  test("matching is case-insensitive; no match falls to the catch-all", async () => {
    const reasoner = new StubReasoner([priceRule, fallbackRule]);
    const out = await reasoner.reason(input("customer wants to talk to a human"));
    expect(out.suggestedState).toBe("handed_off");
    expect(out.handoffReason).toBe("stub fallback");
  });

  test("empty script hands off with a stub-exhausted reason", async () => {
    const reasoner = new StubReasoner([]);
    const out = await reasoner.reason(input("anything at all"));
    expect(out.suggestedState).toBe("handed_off");
    expect(out.confidence).toBe(0);
    expect(out.handoffReason).toBe("stub script exhausted");
  });

  test("behavior is deterministic across repeated calls", async () => {
    const reasoner = new StubReasoner([priceRule, fallbackRule]);
    const a = await reasoner.reason(input("price?"));
    const b = await reasoner.reason(input("price?"));
    expect(a).toEqual(b);
  });

  test("clamps scripted replies to the SMS limit", async () => {
    const reasoner = new StubReasoner([
      {
        match: null,
        output: {
          reply: "y".repeat(MAX_SMS_CHARS + 10),
          extractedFacts: {},
          suggestedState: "closed",
          confidence: 1,
        },
      },
    ]);
    const out = await reasoner.reason(input("anything"));
    expect(out.reply.length).toBe(MAX_SMS_CHARS);
  });
});
