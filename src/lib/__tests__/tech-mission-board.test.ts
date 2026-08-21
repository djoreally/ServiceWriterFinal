import { buildTechMissionBoard, getTechPrimaryAction, type TechMissionJob } from "@/lib/tech-mission-board";

const baseJob = (overrides: Partial<TechMissionJob>): TechMissionJob => ({
  id: "job-1",
  scheduled_date: "2026-07-30",
  scheduled_time: "09:00",
  dispatch_status: "assigned",
  status: "scheduled",
  job_priority: "normal",
  ...overrides,
});

describe("tech-mission-board", () => {
  it("prioritizes the active job before the next scheduled job", () => {
    const board = buildTechMissionBoard([
      baseJob({ id: "next", scheduled_time: "08:00" }),
      baseJob({ id: "current", scheduled_time: "10:00", dispatch_status: "in_progress" }),
    ], "2026-07-30");

    expect(board.currentJob?.id).toBe("current");
    expect(board.nextJob?.id).toBe("next");
    expect(board.counts.active).toBe(1);
  });

  it("surfaces blockers, schedule changes, and evidence-required work", () => {
    const board = buildTechMissionBoard([
      baseJob({ id: "urgent", job_priority: "urgent" }),
      baseJob({ id: "delayed", dispatch_status: "delayed" }),
      baseJob({ id: "evidence", dispatch_status: "in_progress" }),
    ], "2026-07-30");

    expect(board.blockers.map((job) => job.id)).toEqual(["urgent", "delayed"]);
    expect(board.scheduleChanges.map((job) => job.id)).toEqual(["delayed"]);
    expect(board.evidenceRequired.map((job) => job.id)).toEqual(["evidence"]);
  });

  it("maps clock and job status into the primary action", () => {
    expect(getTechPrimaryAction(baseJob({}), false)).toEqual({ label: "Start shift", targetStatus: null, intent: "shift" });
    expect(getTechPrimaryAction(baseJob({ dispatch_status: "en_route" }), true)).toEqual({ label: "Mark arrived", targetStatus: "arrived", intent: "job" });
    expect(getTechPrimaryAction(baseJob({ dispatch_status: "in_progress" }), true)).toEqual({ label: "Complete job", targetStatus: "completed", intent: "job" });
  });
});
