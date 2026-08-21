export const CANONICAL_JOB_STATUSES = [
  "draft",
  "scheduled",
  "assigned",
  "en_route",
  "arrived",
  "in_progress",
  "paused",
  "completed",
  "cancelled",
  "no_show",
] as const;

export type CanonicalJobStatus = (typeof CANONICAL_JOB_STATUSES)[number];

const STATUS_SET = new Set<CanonicalJobStatus>(CANONICAL_JOB_STATUSES);

export const JOB_LIFECYCLE_TRANSITIONS: Record<CanonicalJobStatus, CanonicalJobStatus[]> = {
  draft: ["scheduled", "cancelled"],
  scheduled: ["assigned", "cancelled", "no_show"],
  assigned: ["en_route", "cancelled"],
  en_route: ["arrived", "cancelled"],
  arrived: ["in_progress", "cancelled"],
  in_progress: ["paused", "completed", "cancelled"],
  paused: ["in_progress", "cancelled"],
  completed: [],
  cancelled: [],
  no_show: [],
};

const LEGACY_STATUS_ALIASES: Record<string, CanonicalJobStatus> = {
  pending: "scheduled",
  confirmed: "scheduled",
  unassigned: "scheduled",
  auto_assigned: "assigned",
  acknowledged: "assigned",
  dispatched: "en_route",
  on_site: "arrived",
  started: "in_progress",
  canceled: "cancelled",
  delayed: "paused",
  blocked: "paused",
  verified: "completed",
};

export function normalizeJobStatus(rawStatus: unknown): CanonicalJobStatus {
  const key = typeof rawStatus === "string" ? rawStatus.trim().toLowerCase() : "";
  if (STATUS_SET.has(key as CanonicalJobStatus)) {
    return key as CanonicalJobStatus;
  }
  return LEGACY_STATUS_ALIASES[key] ?? "scheduled";
}

export function isValidJobTransition(
  currentStatus: CanonicalJobStatus,
  nextStatus: CanonicalJobStatus,
): boolean {
  if (currentStatus === nextStatus) return true;
  return JOB_LIFECYCLE_TRANSITIONS[currentStatus].includes(nextStatus);
}

export function transitionJobLifecycle(
  currentStatus: unknown,
  nextStatus: unknown,
  context?: { reasonCode?: string; updatedBy?: string },
): { ok: true; status: CanonicalJobStatus; reasonCode?: string; updatedBy?: string }
  | { ok: false; status: CanonicalJobStatus; message: string } {
  const current = normalizeJobStatus(currentStatus);
  const next = normalizeJobStatus(nextStatus);

  if (!isValidJobTransition(current, next)) {
    return {
      ok: false,
      status: current,
      message: `Invalid transition: ${current} -> ${next}. Allowed: ${JOB_LIFECYCLE_TRANSITIONS[current].join(", ") || "none"}.`,
    };
  }

  return {
    ok: true,
    status: next,
    reasonCode: context?.reasonCode,
    updatedBy: context?.updatedBy,
  };
}
