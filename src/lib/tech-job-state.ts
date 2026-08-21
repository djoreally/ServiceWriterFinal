import { deriveCommandCenterState } from "@/lib/command-center-state";

export type TechQueryFilter = "today" | "upcoming" | "in_progress" | "completed" | "issues";
export type TechTodayTabFilter = "today" | "upcoming" | "active" | "done" | "issues";

export interface TechLifecycleJob {
  scheduled_date: string;
  status?: string | null;
  dispatch_status?: string | null;
  job_priority?: string | null;
}

function isIssue(job: TechLifecycleJob): boolean {
  const status = (job.status ?? "").toLowerCase().trim();
  const dispatch = (job.dispatch_status ?? "").toLowerCase().trim();
  const priority = (job.job_priority ?? "").toLowerCase().trim();
  return status === "cancelled" || status === "canceled" || dispatch === "cancelled" || dispatch === "canceled" || dispatch === "delayed" || priority === "urgent";
}

function mapTechQueryFilterToLifecycle(filter: TechQueryFilter): "today" | "upcoming" | "active" | "done" | "issues" {
  if (filter === "in_progress") return "active";
  if (filter === "completed") return "done";
  return filter;
}

export function matchesTechLifecycleFilter(job: TechLifecycleJob, filter: TechTodayTabFilter | TechQueryFilter, today: string, nextWeek?: string): boolean {
  const normalizedFilter = (filter === "in_progress" || filter === "completed")
    ? mapTechQueryFilterToLifecycle(filter)
    : filter;

  const derived = deriveCommandCenterState({
    status: job.status,
    dispatch_status: job.dispatch_status,
  });

  switch (normalizedFilter) {
    case "today":
      return job.scheduled_date === today && derived.lifecycleState !== "completed" && !derived.isCancelled;
    case "upcoming":
      return job.scheduled_date > today
        && (!nextWeek || job.scheduled_date <= nextWeek)
        && derived.lifecycleState !== "completed"
        && !derived.isCancelled;
    case "active":
      return derived.lifecycleState === "dispatched" || derived.lifecycleState === "in_progress";
    case "done":
      return derived.lifecycleState === "completed";
    case "issues":
      return isIssue(job);
    default:
      return true;
  }
}

export function countIssueJobs<TJob extends TechLifecycleJob>(jobs: TJob[]): number {
  return jobs.filter(isIssue).length;
}
