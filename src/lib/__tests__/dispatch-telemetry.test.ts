import { describe, expect, it, jest, beforeEach } from "@jest/globals";
import {
  emitCommandCenterStateDegradedCount,
  emitDispatchCommandVisibilityDelta,
  trackUnknownStateComboPerTenantDay,
} from "@/lib/dispatch-telemetry";

describe("dispatch telemetry", () => {
  beforeEach(() => {
    window.localStorage.clear();
    jest.restoreAllMocks();
  });

  it("tracks unknown combos per tenant/day", () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);

    trackUnknownStateComboPerTenantDay({
      tenantId: "tenant_1",
      dayKey: "2026-04-10",
      status: "pending",
      dispatchStatus: "mystery",
      source: "command_center",
    });
    trackUnknownStateComboPerTenantDay({
      tenantId: "tenant_1",
      dayKey: "2026-04-10",
      status: "pending",
      dispatchStatus: "mystery",
      source: "command_center",
    });

    const persisted = JSON.parse(window.localStorage.getItem("dispatch_visibility_metrics_v1") || "{}");
    const key = "tenant_1:2026-04-10:pending:mystery:command_center";
    expect(persisted.unknownCombos[key]).toBe(2);
    expect(infoSpy).toHaveBeenCalled();
  });

  it("emits command-center degraded metric and visibility delta metric", () => {
    const infoSpy = jest.spyOn(console, "info").mockImplementation(() => undefined);

    emitCommandCenterStateDegradedCount({
      tenantId: "tenant_1",
      dayKey: "2026-04-10",
      degradedCount: 3,
    });

    emitDispatchCommandVisibilityDelta({
      tenantId: "tenant_1",
      dayKey: "2026-04-10",
      source: "dispatch_board",
      activeCount: 10,
    });
    emitDispatchCommandVisibilityDelta({
      tenantId: "tenant_1",
      dayKey: "2026-04-10",
      source: "command_center",
      activeCount: 8,
    });

    expect(infoSpy).toHaveBeenCalled();
  });
});
