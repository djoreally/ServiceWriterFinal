import { isValidJobTransition, normalizeJobStatus } from "@/domain/jobs/job-lifecycle";

export type TechLifecycleStage = "assigned" | "dispatched" | "in_progress" | "blocked" | "completed" | "verified";

export function toTechLifecycleStage(status?: string | null, dispatchStatus?: string | null): TechLifecycleStage {
  const s = (status ?? "").toLowerCase().trim();
  const d = (dispatchStatus ?? "").toLowerCase().trim();

  if (s === "completed" || d === "completed") return "completed";
  if (d === "verified") return "verified";
  if (d === "in_progress" || d === "arrived") return "in_progress";
  if (d === "en_route" || d === "acknowledged" || d === "dispatched") return "dispatched";
  if (d === "delayed" || d === "blocked") return "blocked";
  return "assigned";
}

export function canTransitionTechLifecycle(current: TechLifecycleStage, next: TechLifecycleStage): boolean {
  if (current === next) return true;
  if (current === "completed" && next === "verified") return true;

  const toCanonical = (stage: TechLifecycleStage) => {
    if (stage === "dispatched") return "en_route";
    if (stage === "blocked") return "paused";
    if (stage === "verified") return "completed";
    return normalizeJobStatus(stage);
  };

  return isValidJobTransition(toCanonical(current), toCanonical(next));
}

export function validateTechLifecycleTransition(params: {
  currentStatus?: string | null;
  currentDispatchStatus?: string | null;
  nextStatus: string;
}): { ok: true } | { ok: false; message: string } {
  const from = toTechLifecycleStage(params.currentStatus, params.currentDispatchStatus);
  const to = toTechLifecycleStage(params.nextStatus, params.nextStatus);

  if (from === to) return { ok: true };
  if (!canTransitionTechLifecycle(from, to)) {
    return {
      ok: false,
      message: `Invalid transition: ${from} -> ${to}.`,
    };
  }

  return { ok: true };
}
