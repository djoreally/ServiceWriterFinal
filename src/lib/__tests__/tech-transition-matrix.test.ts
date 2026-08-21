import { toTechLifecycleStage, validateTechLifecycleTransition } from "@/lib/tech-transition-matrix";

describe("tech-transition-matrix", () => {
  it("maps dispatch variants into canonical stages", () => {
    expect(toTechLifecycleStage("scheduled", "assigned")).toBe("assigned");
    expect(toTechLifecycleStage("scheduled", "en_route")).toBe("dispatched");
    expect(toTechLifecycleStage("scheduled", "arrived")).toBe("in_progress");
    expect(toTechLifecycleStage("scheduled", "delayed")).toBe("blocked");
    expect(toTechLifecycleStage("completed", "in_progress")).toBe("completed");
  });

  it("accepts valid and rejects invalid transitions", () => {
    expect(validateTechLifecycleTransition({
      currentStatus: "scheduled",
      currentDispatchStatus: "assigned",
      nextStatus: "en_route",
    })).toEqual({ ok: true });

    const invalid = validateTechLifecycleTransition({
      currentStatus: "scheduled",
      currentDispatchStatus: "assigned",
      nextStatus: "completed",
    });

    expect(invalid.ok).toBe(false);
    if (!invalid.ok && "message" in invalid) {
      expect(invalid.message).toContain("assigned -> completed");
    }
  });
});
