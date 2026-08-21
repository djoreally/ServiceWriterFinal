import { canEditJob, canTransitionJob, canViewFinancials, canViewJob } from "@/domain/auth/job-authorization";
import type { JobRuntime } from "@/domain/jobs/job-runtime";
import type { TrustContext } from "@/domain/auth/build-trust-context";

const runtime: JobRuntime = {
  id: "job-1",
  orgId: "org-1",
  customer: { id: "c1", name: "Customer" },
  vehicle: { id: "v1" },
  service: {},
  lifecycle: { status: "in_progress", updatedAt: "2026-01-01T00:00:00Z" },
  execution: { checklistStatus: "in_progress" },
  dispatch: {},
  financials: {
    subtotalCents: 1000,
    taxCents: 0,
    totalCents: 1000,
    paidCents: 0,
    refundedCents: 0,
    balanceCents: 1000,
    invoiceStatus: "issued",
    paymentStatus: "unpaid",
  },
  parts: { status: "not_required", required: [] },
  trust: { visibleToUser: true, editableByUser: true },
  timestamps: { createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z" },
};

const owner: TrustContext = {
  userId: "org-1",
  orgId: "org-1",
  role: "owner",
  permissions: ["jobs.read", "jobs.write", "jobs.transition", "financials.read"],
};

describe("job-authorization", () => {
  it("allows owner to view/edit/transition/see financials", () => {
    expect(canViewJob(runtime, owner)).toBe(true);
    expect(canEditJob(runtime, owner)).toBe(true);
    expect(canTransitionJob(runtime, owner)).toBe(true);
    expect(canViewFinancials(runtime, owner)).toBe(true);
  });

  it("blocks transition for terminal lifecycle states", () => {
    const terminal = { ...runtime, lifecycle: { ...runtime.lifecycle, status: "completed" as const } };
    expect(canTransitionJob(terminal, owner)).toBe(false);
  });
});
