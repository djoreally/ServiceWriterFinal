import { canCompleteJob, canPauseJob, canStartJob, getExecutionBlockingReasons } from "@/domain/jobs/job-execution-policy";
import type { JobRuntime } from "@/domain/jobs/job-runtime";

function makeRuntime(overrides: Partial<JobRuntime> = {}): JobRuntime {
  return {
    id: "job-1",
    orgId: "org-1",
    customer: { id: "c1", name: "Customer" },
    vehicle: { id: "v1" },
    service: { appointmentId: "job-1" },
    lifecycle: { status: "in_progress", updatedAt: "2026-01-01T00:00:00Z" },
    execution: { checklistStatus: "complete", blockingIssues: [] },
    dispatch: {},
    financials: {
      subtotalCents: 1000,
      taxCents: 0,
      totalCents: 1000,
      paidCents: 0,
      refundedCents: 0,
      balanceCents: 1000,
      invoiceStatus: "none",
      paymentStatus: "unpaid",
    },
    parts: { status: "not_required", required: [] },
    trust: { visibleToUser: true, editableByUser: true },
    timestamps: { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
    ...overrides,
  };
}

describe("job-execution-policy", () => {
  it("allows completion only when runtime is execution-ready", () => {
    expect(canCompleteJob(makeRuntime())).toBe(true);
    expect(canCompleteJob(makeRuntime({ execution: { checklistStatus: "in_progress" } }))).toBe(false);
    expect(canCompleteJob(makeRuntime({ parts: { status: "ordered", required: [] } }))).toBe(false);
  });

  it("reports blocking reasons for incomplete jobs", () => {
    const reasons = getExecutionBlockingReasons(makeRuntime({
      execution: { checklistStatus: "in_progress", blockingIssues: ["missing tool"] },
      parts: { status: "pending_review", required: [] },
    }));
    expect(reasons.length).toBeGreaterThan(0);
    expect(reasons.join(" ")).toContain("checklist");
  });

  it("enforces start/pause lifecycle rules", () => {
    expect(canStartJob(makeRuntime({ lifecycle: { status: "scheduled", updatedAt: "x" } }))).toBe(true);
    expect(canPauseJob(makeRuntime())).toBe(true);
    expect(canPauseJob(makeRuntime({ lifecycle: { status: "assigned", updatedAt: "x" } }))).toBe(false);
  });
});
