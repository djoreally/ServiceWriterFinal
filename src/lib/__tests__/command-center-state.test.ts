import { describe, expect, it, jest } from "@jest/globals";
import { deriveCommandCenterState, logUnknownOperationalStateForTriage } from "@/lib/command-center-state";

describe("deriveCommandCenterState", () => {
  it("treats assigned jobs as active", () => {
    const result = deriveCommandCenterState({ status: "pending", dispatch_status: "assigned" });
    expect(result.lifecycleState).toBe("assigned");
    expect(result.isActive).toBe(true);
    expect(result.isCompleted).toBe(false);
  });

  it("uses dispatch_status to classify in-progress work", () => {
    const result = deriveCommandCenterState({ status: "pending", dispatch_status: "in_progress" });
    expect(result.lifecycleState).toBe("in_progress");
    expect(result.isActive).toBe(true);
    expect(result.normalizedDispatchStatus).toBe("in_progress");
  });

  it("prioritizes completed appointment status", () => {
    const result = deriveCommandCenterState({ status: "completed", dispatch_status: "assigned" });
    expect(result.lifecycleState).toBe("completed");
    expect(result.isCompleted).toBe(true);
    expect(result.isActive).toBe(false);
  });

  it("flags unknown dispatch mappings", () => {
    const result = deriveCommandCenterState({ status: "pending", dispatch_status: "mystery_state" });
    expect(result.hasUnknownMapping).toBe(true);
    expect(result.isActive).toBe(true);
  });

  it("treats canceled appointment aliases as cancelled lifecycle", () => {
    const result = deriveCommandCenterState({ status: "canceled", dispatch_status: "assigned" });
    expect(result.lifecycleState).toBe("cancelled");
    expect(result.isCancelled).toBe(true);
    expect(result.isActive).toBe(false);
  });
});

describe("logUnknownOperationalStateForTriage", () => {
  it("logs unknown mapping once per context/state combination", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => undefined);

    logUnknownOperationalStateForTriage(
      { jobId: "a", status: "pending", dispatch_status: "weird_state" },
      "command_center"
    );
    logUnknownOperationalStateForTriage(
      { jobId: "b", status: "pending", dispatch_status: "weird_state" },
      "command_center"
    );

    expect(warnSpy).toHaveBeenCalledTimes(1);
    warnSpy.mockRestore();
  });
});
