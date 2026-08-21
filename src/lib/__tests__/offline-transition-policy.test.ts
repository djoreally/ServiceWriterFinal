import { buildTransitionIdempotencyKey, hasTransitionVersionConflict } from "@/lib/offline-transition-policy";

describe("offline-transition-policy", () => {
  it("creates deterministic idempotency keys for duplicate device updates", () => {
    const a = buildTransitionIdempotencyKey({
      actorUserId: "tech-1",
      jobId: "job-1",
      nextStatus: "in_progress",
      expectedUpdatedAt: "2026-04-10T10:00:00.000Z",
    });

    const b = buildTransitionIdempotencyKey({
      actorUserId: "tech-1",
      jobId: "job-1",
      nextStatus: "in_progress",
      expectedUpdatedAt: "2026-04-10T10:00:00.000Z",
    });

    expect(a).toBe(b);
  });

  it("flags reassignment/mid-job conflicts when version changed", () => {
    expect(hasTransitionVersionConflict({
      expectedUpdatedAt: "2026-04-10T10:00:00.000Z",
      observedUpdatedAt: "2026-04-10T10:05:00.000Z",
    })).toBe(true);
  });

  it("flags partial submission conflicts when expected version is missing on server", () => {
    expect(hasTransitionVersionConflict({
      expectedUpdatedAt: "2026-04-10T10:00:00.000Z",
      observedUpdatedAt: null,
    })).toBe(true);
  });
});
