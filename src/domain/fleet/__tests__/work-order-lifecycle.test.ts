import { FLEET_WORK_ORDER_TRANSITIONS, getNextFleetWorkOrderStatus } from "../work-order-lifecycle";

describe("fleet work-order lifecycle", () => {
  it("defines one deterministic transition for every supported operational state", () => {
    expect(FLEET_WORK_ORDER_TRANSITIONS).toEqual({
      pending_review: "scheduled",
      draft: "scheduled",
      scheduled: "in_progress",
      assigned: "in_progress",
      en_route: "arrived",
      arrived: "in_progress",
      in_progress: "completed",
      completed: "invoiced",
      invoiced: "paid",
    });
  });

  it("does not invent transitions for terminal or legacy states", () => {
    expect(getNextFleetWorkOrderStatus("paid")).toBeNull();
    expect(getNextFleetWorkOrderStatus("cancelled")).toBeNull();
    expect(getNextFleetWorkOrderStatus("oil_drain_started")).toBeNull();
  });
});
