import { deriveCommandCenterState } from "@/lib/command-center-state";

export interface DispatchBoardVisibilityJob {
  id: string;
  status?: string | null;
  dispatch_status?: string | null;
}

/**
 * A job should stay visible in active dispatch lanes until it is terminal.
 * Terminal means canonical completed/cancelled only.
 */
export function isVisibleInActiveDispatchLanes(job: DispatchBoardVisibilityJob): boolean {
  const derived = deriveCommandCenterState({
    status: job.status,
    dispatch_status: job.dispatch_status,
  });
  return derived.isActive;
}

export function isTerminalDispatchLaneState(job: DispatchBoardVisibilityJob): boolean {
  return !isVisibleInActiveDispatchLanes(job);
}
