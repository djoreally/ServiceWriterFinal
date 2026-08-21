import { describe, expect, it } from "@jest/globals";
import {
  isTerminalDispatchLaneState,
  isVisibleInActiveDispatchLanes,
} from "@/lib/dispatch-board-visibility";

describe("dispatch-board visibility hardening", () => {
  it("keeps assigned jobs visible in active lanes", () => {
    const job = { id: "j1", status: "pending", dispatch_status: "assigned" };
    expect(isVisibleInActiveDispatchLanes(job)).toBe(true);
    expect(isTerminalDispatchLaneState(job)).toBe(false);
  });

  it("keeps in-progress jobs visible in active lanes", () => {
    const job = { id: "j2", status: "in_progress", dispatch_status: "in_progress" };
    expect(isVisibleInActiveDispatchLanes(job)).toBe(true);
    expect(isTerminalDispatchLaneState(job)).toBe(false);
  });

  it("only removes jobs from active lanes when terminal", () => {
    const completed = { id: "j3", status: "completed", dispatch_status: "completed" };
    const cancelled = { id: "j4", status: "cancelled", dispatch_status: "cancelled" };
    const notTerminal = { id: "j5", status: "pending", dispatch_status: "en_route" };

    expect(isVisibleInActiveDispatchLanes(completed)).toBe(false);
    expect(isVisibleInActiveDispatchLanes(cancelled)).toBe(false);
    expect(isVisibleInActiveDispatchLanes(notTerminal)).toBe(true);
  });
});
