import { DISPATCH_LIFECYCLE, type DispatchLifecycleStatus } from "@packages/shared/lifecycle";
import {
  isValidJobTransition,
  normalizeJobStatus,
  type CanonicalJobStatus,
} from "@/domain/jobs/job-lifecycle";

export type TechnicianOperationalStatus =
  | "offline"
  | "available"
  | "busy"
  | "en_route"
  | "on_site"
  | "on_job"
  | "on_break"
  | "unavailable";

export type DispatchStatus = DispatchLifecycleStatus;

const TECH_STATUS_SET = new Set<TechnicianOperationalStatus>([
  "offline",
  "available",
  "busy",
  "en_route",
  "on_site",
  "on_job",
  "on_break",
  "unavailable",
]);

const DISPATCH_STATUS_SET = new Set<DispatchStatus>(DISPATCH_LIFECYCLE);

/**
 * The single "next" status in the happy path (for UI progression buttons).
 */
const DISPATCH_NEXT_HAPPY: Record<DispatchStatus, DispatchStatus | null> = {
  unassigned:    "assigned",
  assigned:      "en_route",
  auto_assigned: "en_route",
  acknowledged:  "en_route",
  en_route:      "arrived",
  arrived:       "in_progress",
  in_progress:   "completed",
  completed:     null,
  cancelled:     null,
};

function normalizeKey(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function toCanonicalDispatchLifecycle(status: DispatchStatus): CanonicalJobStatus {
  if (status === "unassigned") return "scheduled";
  if (status === "auto_assigned" || status === "acknowledged") return "assigned";
  return normalizeJobStatus(status);
}

export function isFiniteCoordinate(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function isValidLatLng(lat: unknown, lng: unknown): boolean {
  return isFiniteCoordinate(lat) && isFiniteCoordinate(lng);
}

export function toLatLng(
  lat: unknown,
  lng: unknown
): { lat: number; lng: number } | null {
  if (!isValidLatLng(lat, lng)) {
    return null;
  }

  return { lat: lat as number, lng: lng as number };
}

export function normalizeTechnicianStatus(value: unknown): TechnicianOperationalStatus {
  const key = normalizeKey(value);

  if (TECH_STATUS_SET.has(key as TechnicianOperationalStatus)) {
    return key as TechnicianOperationalStatus;
  }

  if (key === "arrived") return "on_site";
  if (key === "in_progress") return "on_job";
  if (key === "active") return "available";

  return "offline";
}

export function normalizeDispatchStatus(value: unknown): DispatchStatus {
  const key = normalizeKey(value);

  if (DISPATCH_STATUS_SET.has(key as DispatchStatus)) {
    return key as DispatchStatus;
  }

  if (key === "on_site") return "arrived";
  if (key === "started") return "in_progress";
  if (key === "pending") return "assigned";

  return "assigned";
}

export function deriveDispatchStatusFromAppointment(
  appointmentStatus: unknown,
  dispatchStatus: unknown
): DispatchStatus {
  const normalizedAppointment = normalizeKey(appointmentStatus);

  if (normalizedAppointment === "completed") return "completed";
  if (normalizedAppointment === "cancelled") return "cancelled";

  return normalizeDispatchStatus(dispatchStatus);
}

export function isClosedDispatchStatus(status: unknown): boolean {
  const normalized = normalizeDispatchStatus(status);
  return normalized === "completed" || normalized === "cancelled";
}

export function isClosedDispatchJob(job: {
  status?: unknown;
  dispatch_status?: unknown;
  dispatchStatus?: unknown;
}): boolean {
  if (normalizeKey(job.status) === "completed" || normalizeKey(job.status) === "cancelled") {
    return true;
  }

  const dispatch = job.dispatch_status ?? job.dispatchStatus;
  return isClosedDispatchStatus(dispatch);
}

/**
 * Returns the next status in the happy-path progression (for "Advance" buttons).
 */
export function getNextDispatchStatus(currentStatus: unknown): DispatchStatus | null {
  return DISPATCH_NEXT_HAPPY[normalizeDispatchStatus(currentStatus)];
}

/**
 * Checks whether a specific transition is valid per the FSM.
 */
export function canTransitionDispatchStatus(
  currentStatus: unknown,
  targetStatus: unknown
): boolean {
  const current = normalizeDispatchStatus(currentStatus);
  const target = normalizeDispatchStatus(targetStatus);
  if (current === "unassigned" && (target === "assigned" || target === "auto_assigned" || target === "cancelled")) {
    return true;
  }
  if (current === "assigned" && target === "acknowledged") return true;
  if (current === "auto_assigned" && target === "acknowledged") return true;
  return isValidJobTransition(toCanonicalDispatchLifecycle(current), toCanonicalDispatchLifecycle(target));
}

/**
 * Returns all valid next statuses from the current status.
 */
export function getValidTransitions(currentStatus: unknown): DispatchStatus[] {
  const current = normalizeDispatchStatus(currentStatus);
  if (current === "unassigned") return ["assigned", "auto_assigned", "cancelled"];
  if (current === "assigned") return ["acknowledged", "en_route", "cancelled"];
  if (current === "auto_assigned") return ["acknowledged", "en_route", "cancelled"];

  const candidates = DISPATCH_LIFECYCLE.filter((status) => status !== current);
  return candidates.filter((candidate) => canTransitionDispatchStatus(current, candidate));
}

export function normalizeOperationalTechnicianStatus(opts: {
  technicianStatus: unknown;
  shiftActive: boolean;
  hasCurrentAppointment: boolean;
  currentDispatchStatus?: unknown;
}): TechnicianOperationalStatus {
  const currentTechStatus = normalizeTechnicianStatus(opts.technicianStatus);
  const dispatchStatus = opts.currentDispatchStatus
    ? normalizeDispatchStatus(opts.currentDispatchStatus)
    : null;

  // Shift state is the hard gate; if not clocked in and no active work, technician is treated as offline.
  if (!opts.shiftActive && !opts.hasCurrentAppointment) {
    return "offline";
  }

  if (opts.hasCurrentAppointment) {
    if (dispatchStatus === "in_progress" || dispatchStatus === "arrived") {
      return "on_job";
    }

    if (dispatchStatus === "en_route" || dispatchStatus === "assigned" || dispatchStatus === "auto_assigned" || dispatchStatus === "acknowledged") {
      return currentTechStatus === "on_break" ? "on_break" : "busy";
    }
  }

  if (opts.shiftActive && currentTechStatus === "offline") {
    return "available";
  }

  return currentTechStatus;
}

// ─── Schedule Conflict Detection ──────────────────────────────────────────

export interface ScheduleSlot {
  scheduledTime: string; // "HH:MM" or "HH:MM:SS"
  durationMinutes: number;
}

/**
 * Parse a time string "HH:MM" or "HH:MM:SS" into total minutes from midnight.
 */
function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
}

/**
 * Check whether a proposed job overlaps with any existing jobs for a technician.
 * Returns the first conflicting slot, or null if no conflict.
 * Includes a configurable buffer between jobs (default 15 min).
 */
export function findScheduleConflict(
  existingJobs: ScheduleSlot[],
  proposedJob: ScheduleSlot,
  bufferMinutes = 15
): ScheduleSlot | null {
  const pStart = timeToMinutes(proposedJob.scheduledTime);
  const pEnd = pStart + proposedJob.durationMinutes;

  for (const existing of existingJobs) {
    const eStart = timeToMinutes(existing.scheduledTime);
    const eEnd = eStart + existing.durationMinutes;

    // Check overlap including buffer
    if (pStart < eEnd + bufferMinutes && pEnd + bufferMinutes > eStart) {
      return existing;
    }
  }

  return null;
}

/**
 * Check whether a technician would exceed their daily capacity
 * if assigned an additional job.
 */
export function wouldExceedCapacity(
  currentHours: number,
  additionalMinutes: number,
  maxCapacityHours: number
): boolean {
  return currentHours + additionalMinutes / 60 > maxCapacityHours;
}
