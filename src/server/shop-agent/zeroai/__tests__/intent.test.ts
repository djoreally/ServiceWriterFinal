import {
  buildInboundSmsIntent,
  buildMissedCallIntent,
  IntentContractSchema,
  validateIntent,
} from "../intent";

describe("buildMissedCallIntent", () => {
  it("returns a zod-valid contract for the text-back goal", () => {
    const intent = buildMissedCallIntent("+12155550123", "+12155550123", {
      callSid: "CA123",
      callStatus: "no-answer",
      to: "+12155559999",
    });
    expect(() => IntentContractSchema.parse(intent)).not.toThrow();
    expect(intent.goal).toBe("send missed-call text-back");
    expect(intent.channel).toBe("sms");
    expect(intent.riskLevel).toBe("low");
    expect(intent.permissions).toEqual(
      expect.arrayContaining(["sms.send", "profile.read"]),
    );
    expect(intent.resources).toEqual(
      expect.arrayContaining([
        { kind: "workspace", id: "+12155550123" },
        { kind: "caller", id: "+12155550123" },
      ]),
    );
    expect(intent.constraints.join(" ")).toMatch(/quiet hours/i);
    expect(intent.constraints.join(" ")).toMatch(/never invent/i);
    expect(intent.constraints.join(" ")).toMatch(/STOP/i);
    expect(intent.acceptanceCriteria.length).toBeGreaterThan(0);
    expect(intent.intentId).toContain("CA123");
  });
});

describe("buildInboundSmsIntent", () => {
  it("returns a valid contract with medium risk for booking-progress states", () => {
    const intent = buildInboundSmsIntent(
      "ws-1",
      "+12155550123",
      "Yes, tomorrow at 9 works",
      "slot_offered",
    );
    expect(() => IntentContractSchema.parse(intent)).not.toThrow();
    expect(intent.goal).toBe("respond to customer SMS and advance booking");
    expect(intent.riskLevel).toBe("medium");
  });

  it("returns low risk for early conversation states", () => {
    const intent = buildInboundSmsIntent(
      "ws-1",
      "+12155550123",
      "What are your hours?",
      "greeted",
    );
    expect(intent.riskLevel).toBe("low");
  });

  it("does not store the raw message body in the contract", () => {
    const body = "my name is Tyreese and my card number is 1234";
    const intent = buildInboundSmsIntent("ws-1", "+12155550123", body, "greeted");
    const serialized = JSON.stringify(intent);
    expect(serialized).not.toContain("card number");
    expect(serialized).not.toContain("Tyreese");
    expect(intent.sourceEvent.bodyHash).toBeDefined();
    expect(intent.sourceEvent.bodyLength).toBe(body.length);
  });
});

describe("validateIntent / schema", () => {
  it("rejects contracts missing required fields", () => {
    expect(() => validateIntent({})).toThrow();
    expect(() =>
      validateIntent({
        intentId: "x",
        workspaceId: "w",
        channel: "pigeon",
        actor: "a",
        goal: "g",
        constraints: ["c"],
        acceptanceCriteria: [{ id: "i", description: "d" }],
        permissions: ["p"],
        resources: [{ kind: "k", id: "i" }],
        riskLevel: "low",
        sourceEvent: {},
        createdAt: "2026-01-01T00:00:00.000Z",
      }),
    ).toThrow();
  });

  it("rejects an invalid risk level", () => {
    const intent = buildMissedCallIntent("w", "p", {
      callSid: "CA1",
      callStatus: "no-answer",
      to: "t",
    });
    expect(() =>
      validateIntent({ ...intent, riskLevel: "critical" }),
    ).toThrow();
  });
});
