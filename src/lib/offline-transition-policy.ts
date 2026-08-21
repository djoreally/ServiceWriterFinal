export interface TechTransitionMutationInput {
  jobId: string;
  nextStatus: string;
  actorUserId: string;
  expectedUpdatedAt?: string | null;
  observedUpdatedAt?: string | null;
}

export function buildTransitionIdempotencyKey(input: TechTransitionMutationInput): string {
  return [
    "tech_transition",
    input.actorUserId,
    input.jobId,
    input.nextStatus,
    input.expectedUpdatedAt ?? "na",
  ].join(":");
}

export function hasTransitionVersionConflict(input: Pick<TechTransitionMutationInput, "expectedUpdatedAt" | "observedUpdatedAt">): boolean {
  if (!input.expectedUpdatedAt) return false;
  if (!input.observedUpdatedAt) return true;
  return new Date(input.expectedUpdatedAt).getTime() !== new Date(input.observedUpdatedAt).getTime();
}
