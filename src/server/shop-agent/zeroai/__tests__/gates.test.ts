/**
 * Tests for ZeroAI gates.
 *
 * policy_check delegates to `checkPolicy` from `../policy` —
 * mocked here; these tests pin the delegation contract,
 * not the policy table itself.
 */
import { checkGate, PROFILE_GO_LIVE_THRESHOLD } from "../gates";
import type { GateContext, ShopProfile } from "../types";

/**
 * checkPolicy lives in `../policy`; it is mocked here — these tests pin
 * the delegation contract, not the policy table itself.
 */
jest.mock("../policy", () => ({ checkPolicy: jest.fn() }));

const { checkPolicy } = jest.requireMock("../policy") as {
  checkPolicy: jest.Mock;
};
const mockCheckPolicy = checkPolicy;

function profile(overrides: Partial<ShopProfile> = {}): ShopProfile {
  return {
    workspaceId: "ws-test",
    businessName: "Test Shop",
    hours: { timezone: "America/New_York", days: {} },
    serviceArea: { towns: ["Ambler"], zips: ["19002"] },
    services: [],
    completenessScore: 100,
    missingFields: [],
    ...overrides,
  };
}

beforeEach(() => {
  mockCheckPolicy.mockReset();
});

describe("profile_complete", () => {
  test("threshold constant is 80", () => {
    expect(PROFILE_GO_LIVE_THRESHOLD).toBe(80);
  });

  test("79 fails, 80 passes (boundary)", async () => {
    const fail = await checkGate("profile_complete", {
      profile: profile({ completenessScore: 79 }),
    });
    expect(fail.passed).toBe(false);
    expect(fail.reason).toMatch(/79/);

    const pass = await checkGate("profile_complete", {
      profile: profile({ completenessScore: 80 }),
    });
    expect(pass.passed).toBe(true);
    expect(pass.gate).toBe("profile_complete");
  });

  test("100 passes, missing profile fails", async () => {
    const pass = await checkGate("profile_complete", {
      profile: profile({ completenessScore: 100 }),
    });
    expect(pass.passed).toBe(true);

    const fail = await checkGate("profile_complete", {});
    expect(fail.passed).toBe(false);
    expect(fail.reason).toMatch(/no shop profile/);
  });

  test("failure reason names the missing fields", async () => {
    const fail = await checkGate("profile_complete", {
      profile: profile({
        completenessScore: 60,
        missingFields: ["policies", "escalation"],
      }),
    });
    expect(fail.passed).toBe(false);
    expect(fail.reason).toMatch(/policies/);
    expect(fail.reason).toMatch(/escalation/);
  });
});

describe("slot_exists", () => {
  test("empty array fails, non-empty passes", async () => {
    const fail = await checkGate("slot_exists", { slots: [] });
    expect(fail.passed).toBe(false);
    expect(fail.reason).toMatch(/no slots/);

    const pass = await checkGate("slot_exists", {
      slots: [{ startsAt: "2026-10-02T13:00:00", label: "Thu 1:00 PM" }],
    });
    expect(pass.passed).toBe(true);
  });

  test("missing slots fails", async () => {
    const fail = await checkGate("slot_exists", {});
    expect(fail.passed).toBe(false);
  });
});

describe("appointment_verified", () => {
  test("lookup resolving true passes", async () => {
    const result = await checkGate("appointment_verified", {
      appointmentId: "appt-1",
      appointmentLookup: async () => true,
    });
    expect(result.passed).toBe(true);
    expect(result.reason).toMatch(/appt-1/);
  });

  test("lookup resolving false fails", async () => {
    const result = await checkGate("appointment_verified", {
      appointmentId: "appt-ghost",
      appointmentLookup: async () => false,
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/could not be verified/);
  });

  test("missing lookup or id fails closed", async () => {
    expect((await checkGate("appointment_verified", {})).passed).toBe(false);
    expect(
      (await checkGate("appointment_verified", { appointmentId: "x" })).passed,
    ).toBe(false);
  });

  test("lookup receives the appointment id", async () => {
    const lookup = jest.fn(async (_id: string) => true);
    await checkGate("appointment_verified", {
      appointmentId: "appt-42",
      appointmentLookup: lookup,
    });
    expect(lookup).toHaveBeenCalledWith("appt-42");
  });
});

describe("policy_check", () => {
  test("act decision passes the gate", async () => {
    mockCheckPolicy.mockResolvedValue({
      decision: "act",
      ruleId: "r1",
      reason: "within hours and area",
    });
    const result = await checkGate("policy_check", {
      policyAction: "send_message",
      policyCtx: { workspaceId: "ws-test" },
    });
    expect(result.passed).toBe(true);
    expect(mockCheckPolicy).toHaveBeenCalledWith("send_message", {
      workspaceId: "ws-test",
    });
  });

  test("blocked decision fails the gate with the policy reason", async () => {
    mockCheckPolicy.mockResolvedValue({
      decision: "blocked",
      ruleId: "quiet-hours",
      reason: "quiet hours 8am-9pm",
    });
    const result = await checkGate("policy_check", {
      policyAction: "send_message",
      policyCtx: { workspaceId: "ws-test" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/quiet hours 8am-9pm/);
    expect(result.reason).toMatch(/quiet-hours/);
  });

  test("draft decision fails the gate — no proceeding without approval", async () => {
    mockCheckPolicy.mockResolvedValue({
      decision: "draft",
      ruleId: "discount",
      reason: "needs human approval",
    });
    const result = await checkGate("policy_check", {
      policyAction: "offer_discount",
      policyCtx: { workspaceId: "ws-test" },
    });
    expect(result.passed).toBe(false);
    expect(result.reason).toMatch(/needs human approval/);
  });

  test("derives the workspace from the profile when policyCtx is absent", async () => {
    mockCheckPolicy.mockResolvedValue({
      decision: "act",
      ruleId: "r1",
      reason: "ok",
    });
    await checkGate("policy_check", {
      policyAction: "answer_faq",
      profile: profile(),
    });
    expect(mockCheckPolicy).toHaveBeenCalledWith("answer_faq", {
      workspaceId: "ws-test",
    });
  });

  test("missing action or context fails closed", async () => {
    expect((await checkGate("policy_check", {})).passed).toBe(false);
    expect(
      (await checkGate("policy_check", { policyAction: "send_message" })).passed,
    ).toBe(false);
    expect(mockCheckPolicy).not.toHaveBeenCalled();
  });
});

describe("gate results are evidence-shaped", () => {
  test("every failure carries a non-empty reason", async () => {
    const contexts: GateContext[] = [
      {},
      { slots: [] },
      { policyAction: "send_message" },
    ];
    for (const ctx of contexts) {
      const results = await Promise.all([
        checkGate("profile_complete", ctx),
        checkGate("slot_exists", ctx),
        checkGate("policy_check", ctx),
        checkGate("appointment_verified", ctx),
      ]);
      for (const r of results) {
        expect(r.reason.length).toBeGreaterThan(0);
      }
    }
  });
});
