import { countIssueJobs, matchesTechLifecycleFilter, type TechLifecycleJob } from "@/lib/tech-job-state";

export interface TechMissionJob extends TechLifecycleJob {
  id: string;
  scheduled_date: string;
  scheduled_time: string;
  dispatch_status: string;
  status: string;
  job_priority: string;
  location_address?: string | null;
  notes?: string | null;
  title?: string;
  customers?: { name: string; phone?: string | null } | null;
  service_catalog?: { name: string } | null;
  is_fleet?: boolean;
}

export interface TechMissionBoard {
  currentJob: TechMissionJob | null;
  nextJob: TechMissionJob | null;
  todayJobs: TechMissionJob[];
  scheduleChanges: TechMissionJob[];
  blockers: TechMissionJob[];
  evidenceRequired: TechMissionJob[];
  counts: {
    today: number;
    active: number;
    blockers: number;
    completed: number;
    issues: number;
  };
}

const ACTIVE_STATUSES = new Set(["en_route", "arrived", "in_progress", "waiting_customer", "waiting_issue", "ready_review"]);
const BLOCKED_STATUSES = new Set(["delayed", "waiting_customer", "waiting_issue", "could_not_complete"]);
const EVIDENCE_STATUSES = new Set(["arrived", "in_progress", "ready_review"]);

function jobSortKey(job: TechMissionJob): string {
  return `${job.scheduled_date || "9999-12-31"} ${job.scheduled_time || "23:59"}`;
}

export function getTechMissionEffectiveStatus(job: Pick<TechMissionJob, "status" | "dispatch_status">): string {
  return job.status === "completed" ? "completed" : (job.dispatch_status || job.status || "assigned");
}

export function buildTechMissionBoard(jobs: TechMissionJob[], today: string): TechMissionBoard {
  const sorted = [...jobs].sort((a, b) => jobSortKey(a).localeCompare(jobSortKey(b)));
  const todayJobs = sorted.filter((job) => matchesTechLifecycleFilter(job, "today", today));
  const activeJobs = sorted.filter((job) => ACTIVE_STATUSES.has(getTechMissionEffectiveStatus(job)));
  const currentJob = activeJobs[0] ?? todayJobs[0] ?? null;
  const nextJob = sorted.find((job) => job.id !== currentJob?.id && matchesTechLifecycleFilter(job, "today", today))
    ?? sorted.find((job) => job.id !== currentJob?.id && matchesTechLifecycleFilter(job, "upcoming", today));
  const blockers = sorted.filter((job) => {
    const effectiveStatus = getTechMissionEffectiveStatus(job);
    return BLOCKED_STATUSES.has(effectiveStatus) || (job.job_priority ?? "").toLowerCase() === "urgent";
  });
  const scheduleChanges = sorted.filter((job) => {
    const effectiveStatus = getTechMissionEffectiveStatus(job);
    return effectiveStatus === "delayed" || job.status === "cancelled" || job.dispatch_status === "cancelled";
  });
  const evidenceRequired = sorted.filter((job) => EVIDENCE_STATUSES.has(getTechMissionEffectiveStatus(job)) && job.status !== "completed");

  return {
    currentJob,
    nextJob,
    todayJobs,
    scheduleChanges,
    blockers,
    evidenceRequired,
    counts: {
      today: todayJobs.length,
      active: activeJobs.length,
      blockers: blockers.length,
      completed: sorted.filter((job) => matchesTechLifecycleFilter(job, "done", today)).length,
      issues: countIssueJobs(sorted),
    },
  };
}

export function getTechPrimaryAction(job: TechMissionJob | null, isClockedIn: boolean): { label: string; targetStatus: string | null; intent: "shift" | "job" | "review" } {
  if (!isClockedIn) return { label: "Start shift", targetStatus: null, intent: "shift" };
  if (!job) return { label: "Review schedule", targetStatus: null, intent: "review" };

  const status = getTechMissionEffectiveStatus(job);
  if (status === "assigned" || status === "scheduled" || status === "unassigned") return { label: "Go en route", targetStatus: "en_route", intent: "job" };
  if (status === "en_route") return { label: "Mark arrived", targetStatus: "arrived", intent: "job" };
  if (status === "arrived") return { label: "Start work", targetStatus: "in_progress", intent: "job" };
  if (status === "in_progress" || status === "ready_review") return { label: "Complete job", targetStatus: "completed", intent: "job" };
  if (status === "waiting_customer" || status === "waiting_issue" || status === "delayed") return { label: "Resolve blocker", targetStatus: "in_progress", intent: "job" };
  if (status === "completed") return { label: "Review handoff", targetStatus: null, intent: "review" };
  return { label: "Open job", targetStatus: null, intent: "job" };
}
