import { deriveCommandCenterState } from "@/lib/command-center-state";

export interface CommandCenterFilterJob {
  id: string;
  status?: string | null;
  dispatch_status?: string | null;
  assigned_technician_id?: string | null;
  assigned_van_id?: string | null;
}

export interface CommandCenterBuckets<TJob extends CommandCenterFilterJob> {
  queue: TJob[];
  active: TJob[];
  completed: TJob[];
  cancelled: TJob[];
}

/**
 * Canonical command-center filters.
 * - queue: non-terminal + unassigned
 * - active: non-terminal + assigned/dispatched/in_progress
 * - completed: terminal completed
 * - cancelled: terminal cancelled
 *
 * IMPORTANT: No job is ever hidden. Every job lands in exactly one bucket.
 * Dispatch never loses visibility.
 */
export function buildCommandCenterBuckets<TJob extends CommandCenterFilterJob>(jobs: TJob[]): CommandCenterBuckets<TJob> {
  const queue: TJob[] = [];
  const active: TJob[] = [];
  const completed: TJob[] = [];
  const cancelled: TJob[] = [];

  jobs.forEach((job) => {
    const derived = deriveCommandCenterState({
      status: job.status,
      dispatch_status: job.dispatch_status,
    });

    if (derived.isCancelled) {
      cancelled.push(job);
      return;
    }

    if (derived.lifecycleState === "completed") {
      completed.push(job);
      return;
    }

    const hasAssignment = Boolean(job.assigned_technician_id || job.assigned_van_id);

    if (derived.lifecycleState === "unassigned" && !hasAssignment) {
      queue.push(job);
      return;
    }

    // assigned, dispatched, in_progress, or recovered partial assignment rows
    active.push(job);
  });

  return { queue, active, completed, cancelled };
}
