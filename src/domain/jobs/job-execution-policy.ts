import type { JobRuntime } from "@/domain/jobs/job-runtime";

const COMPLETION_ALLOWED_PARTS = new Set<JobRuntime["parts"]["status"]>([
  "not_required",
  "ready",
  "installed",
]);

function hasUnresolvedBlockers(runtime: JobRuntime): boolean {
  return (runtime.execution.blockingIssues?.length || 0) > 0;
}

export function getExecutionBlockingReasons(runtime: JobRuntime): string[] {
  const reasons: string[] = [];

  if (hasUnresolvedBlockers(runtime)) {
    reasons.push("Unresolved execution blockers must be cleared.");
  }

  if (!COMPLETION_ALLOWED_PARTS.has(runtime.parts.status)) {
    reasons.push(`Parts status '${runtime.parts.status}' is not completion-ready.`);
  }

  if (runtime.execution.checklistStatus !== "complete") {
    reasons.push("Execution checklist is not complete.");
  }

  const proof = runtime.execution.proofOfWork;
  if (proof) {
    if (!proof.photos?.length && !proof.notes?.trim()) {
      reasons.push("Proof of work is missing (add photos or notes).");
    }
    if (proof.technicianConfirmedSpecs === false) {
      reasons.push("Technician specs confirmation is required.");
    }
    if (proof.technicianConfirmedParts === false) {
      reasons.push("Technician parts confirmation is required.");
    }
  }

  return reasons;
}

export function canStartJob(runtime: JobRuntime): boolean {
  if (hasUnresolvedBlockers(runtime)) return false;
  return ["scheduled", "assigned", "en_route", "arrived", "paused"].includes(runtime.lifecycle.status);
}

export function canPauseJob(runtime: JobRuntime): boolean {
  if (hasUnresolvedBlockers(runtime)) return false;
  return runtime.lifecycle.status === "in_progress";
}

export function canCompleteJob(runtime: JobRuntime): boolean {
  if (!["in_progress", "arrived", "paused"].includes(runtime.lifecycle.status)) return false;
  return getExecutionBlockingReasons(runtime).length === 0;
}
