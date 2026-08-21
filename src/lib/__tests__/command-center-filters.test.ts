import { describe, expect, it } from "@jest/globals";
import { buildCommandCenterBuckets } from "@/lib/command-center-filters";

describe("buildCommandCenterBuckets", () => {
  it("includes assigned/dispatched/in_progress in active bucket", () => {
    const jobs = [
      { id: "a", status: "pending", dispatch_status: "assigned" },
      { id: "b", status: "pending", dispatch_status: "en_route" },
      { id: "c", status: "pending", dispatch_status: "in_progress" },
    ];

    const buckets = buildCommandCenterBuckets(jobs);
    expect(buckets.active.map((j) => j.id)).toEqual(["a", "b", "c"]);
  });

  it("routes completed jobs to completed bucket via canonical lifecycle", () => {
    const jobs = [
      { id: "done1", status: "completed", dispatch_status: "assigned" },
      { id: "done2", status: "pending", dispatch_status: "completed" },
    ];

    const buckets = buildCommandCenterBuckets(jobs);
    expect(buckets.completed.map((j) => j.id)).toEqual(["done1", "done2"]);
  });

  it("uses non-terminal canonical states for queue vs active", () => {
    const jobs = [
      { id: "q1", status: "pending", dispatch_status: "unassigned" },
      { id: "a1", status: "pending", dispatch_status: "assigned" },
      { id: "cancelled", status: "cancelled", dispatch_status: "cancelled" },
    ];

    const buckets = buildCommandCenterBuckets(jobs);
    expect(buckets.queue.map((j) => j.id)).toEqual(["q1"]);
    expect(buckets.active.map((j) => j.id)).toEqual(["a1"]);
    expect(buckets.completed.map((j) => j.id)).toEqual([]);
  });
});
