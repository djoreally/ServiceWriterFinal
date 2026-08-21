import { countIssueJobs, matchesTechLifecycleFilter } from "@/lib/tech-job-state";

describe("tech-job-state", () => {
  const today = "2026-04-10";
  const nextWeek = "2026-04-17";

  it("matches active jobs via canonical lifecycle mapping", () => {
    const active = {
      scheduled_date: today,
      status: "scheduled",
      dispatch_status: "en_route",
      job_priority: "normal",
    };

    expect(matchesTechLifecycleFilter(active, "in_progress", today, nextWeek)).toBe(true);
  });

  it("treats completed appointment status as done even when dispatch status is active", () => {
    const completed = {
      scheduled_date: today,
      status: "completed",
      dispatch_status: "in_progress",
      job_priority: "normal",
    };

    expect(matchesTechLifecycleFilter(completed, "completed", today, nextWeek)).toBe(true);
    expect(matchesTechLifecycleFilter(completed, "today", today, nextWeek)).toBe(false);
  });

  it("flags issues for urgent priority and cancelled/canceled variants", () => {
    const jobs = [
      { scheduled_date: today, status: "scheduled", dispatch_status: "assigned", job_priority: "urgent" },
      { scheduled_date: today, status: "cancelled", dispatch_status: "assigned", job_priority: "normal" },
      { scheduled_date: today, status: "scheduled", dispatch_status: "canceled", job_priority: "normal" },
    ];

    expect(countIssueJobs(jobs)).toBe(3);
    expect(matchesTechLifecycleFilter(jobs[1], "issues", today, nextWeek)).toBe(true);
    expect(matchesTechLifecycleFilter(jobs[2], "issues", today, nextWeek)).toBe(true);
  });
});
