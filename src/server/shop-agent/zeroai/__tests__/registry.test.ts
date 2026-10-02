/**
 * Tests for the sms_agent registry definition.
 */
import {
  AGENT_REGISTRY,
  MAX_SMS_CHARS,
  SMS_AGENT_FORBIDDEN_ACTIONS,
} from "../registry";

const agent = AGENT_REGISTRY["sms_agent"];

describe("sms_agent registry entry", () => {
  test("is present with id and version 1.0.0", () => {
    expect(agent).toBeDefined();
    expect(agent.id).toBe("sms_agent");
    expect(agent.version).toBe("1.0.0");
  });

  test("responsibilities cover the Phase 1 scope", () => {
    expect(agent.responsibilities.length).toBeGreaterThan(0);
    const joined = agent.responsibilities.join(" ").toLowerCase();
    expect(joined).toMatch(/missed-call/);
    expect(joined).toMatch(/sms/);
    expect(joined).toMatch(/vehicle/);
    expect(joined).toMatch(/book/);
    expect(joined).toMatch(/hand off/);
  });

  test("allowedTools are exactly the declared capability set", () => {
    expect(agent.allowedTools).toEqual([
      "send_sms",
      "read_profile",
      "read_availability",
      "create_appointment",
      "create_callback",
      "log_event",
    ]);
  });

  test("forbiddenActions include the full safety list", () => {
    const required = [
      "invent_price",
      "invent_slot",
      "send_outside_quiet_hours",
      "message_opted_out",
      "record_call",
      "offer_discount_without_approval",
    ];
    for (const action of required) {
      expect(agent.forbiddenActions).toContain(action);
    }
    expect(SMS_AGENT_FORBIDDEN_ACTIONS).toEqual(
      expect.arrayContaining(required),
    );
  });

  test("input/output schemas are plain record descriptors matching ReasonInput/ReasonOutput", () => {
    expect(agent.inputSchema.type).toBe("object");
    for (const key of ["intent", "facts", "summary", "profile", "instructionSet"]) {
      expect(agent.inputSchema.properties).toHaveProperty(key);
    }
    expect(agent.outputSchema.type).toBe("object");
    for (const key of ["reply", "suggestedState", "confidence"]) {
      expect(agent.outputSchema.properties).toHaveProperty(key);
    }
  });
});

describe("sms_agent instruction set", () => {
  test("encodes the Phase 1 templates", () => {
    const is = agent.instructionSet;
    expect(is).toMatch(/sorry we missed your call/);
    expect(is).toMatch(/Still need a hand\? Reply here and I'll get you sorted\./);
    expect(is).toMatch(/Reply STOP to opt out/);
    expect(is).toMatch(/opted out/);
    expect(is).toMatch(/handing this to the shop team/);
  });

  test("encodes the Phase 0 fallback matrix", () => {
    const is = agent.instructionSet.toLowerCase();
    expect(is).toMatch(/answer with the fact/);
    expect(is).toMatch(/want me\s+to have the shop call you back/);
    expect(is).toMatch(/never invent a capability/);
    expect(is).toMatch(/angry/);
    expect(is).toMatch(/calm/);
    expect(is).toMatch(/payment happens through the existing invoice/);
  });

  test("encodes handoff triggers", () => {
    const is = agent.instructionSet.toLowerCase();
    expect(is).toMatch(/asks for a human/);
    expect(is).toMatch(/confidence is low/);
    expect(is).toMatch(/outside the service area/);
  });

  test("encodes the hard rules: never invent, ≤ 320 chars", () => {
    const is = agent.instructionSet.toLowerCase();
    expect(is).toMatch(/never invent prices, slots, hours/);
    expect(is).toMatch(/≤ 320 characters/);
    expect(MAX_SMS_CHARS).toBe(320);
  });
});
