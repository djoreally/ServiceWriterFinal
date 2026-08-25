import {
  deriveDispatchStatusFromAppointment,
  normalizeDispatchStatus,
  type DispatchStatus,
} from "@/lib/dispatch-state";
import { normalizeJobStatus } from "@/domain/jobs/job-lifecycle";
import { trackUnknownStateComboPerTenantDay } from "@/lib/dispatch-telemetry";

type MaybeString = string | null | undefined;

export interface CommandCenterJobStateInput {
  status?: MaybeString;
  dispatch_status?: MaybeString;
}

export type CommandCenterLifecycleState =
  | "unassigned"
  | "assigned"
  | "dispatched"
  | "in_progress"
  | "completed"
  | "cancelled";

export interface CommandCenterDerivedState {
  lifecycleState: CommandCenterLifecycleState;
  isCompleted: boolean;
  isCancelled: boolean;
  isActive: boolean;
  hasUnknownMapping: boolean;
  normalizedAppointmentStatus: "completed" | "cancelled" | "active";
  normalizedDispatchStatus: DispatchStatus;
}

function normalizeAppointmentStatus(status: MaybeString): "completed" | "cancelled" | "active" {
  const normalized = normalizeJobStatus(status);
  if (normalized === "completed") return "completed";
  if (normalized === "cancelled" || normalized === "no_show") return "cancelled";
  return "active";
}

function mapDispatchToLifecycle(dispatchStatus: DispatchStatus): CommandCenterLifecycleState {
  if (dispatchStatus === "completed") return "completed";
  if (dispatchStatus === "cancelled") return "cancelled";
  if (dispatchStatus === "in_progress" || dispatchStatus === "arrived") return "in_progress";
  if (dispatchStatus === "en_route" || dispatchStatus === "acknowledged") return "dispatched";
  if (dispatchStatus === "assigned" || dispatchStatus === "auto_assigned") return "assigned";
  return "unassigned";
}

export function deriveCommandCenterState(input: CommandCenterJobStateInput): CommandCenterDerivedState {
  const rawDispatch = (input.dispatch_status ?? "").toLowerCase().trim();
  const knownRawDispatch = rawDispatch.length === 0 || [
    "unassigned",
    "assigned",
    "auto_assigned",
    "acknowledged",
    "en_route",
    "arrived",
    "in_progress",
    "completed",
    "cancelled",
    "canceled",
    "on_site",
    "started",
    "pending",
  ].includes(rawDispatch);
  const appointmentStatus = normalizeAppointmentStatus(input.status);
  const normalizedDispatch = normalizeDispatchStatus(input.dispatch_status);
  const effectiveDispatch = deriveDispatchStatusFromAppointment(appointmentStatus, normalizedDispatch);

  const lifecycleState = appointmentStatus === "cancelled"
    ? "cancelled"
    : mapDispatchToLifecycle(effectiveDispatch);

  const isCancelled = lifecycleState === "cancelled";
  const isCompleted = lifecycleState === "completed";
  const isActive = !isCancelled && !isCompleted;
  const hasUnknownMapping = !knownRawDispatch;

  return {
    lifecycleState,
    isCompleted,
    isCancelled,
    isActive,
    hasUnknownMapping,
    normalizedAppointmentStatus: appointmentStatus,
    normalizedDispatchStatus: effectiveDispatch,
  };
}

const unknownStateSeen = new Set<string>();

export function logUnknownOperationalStateForTriage(
  input: CommandCenterJobStateInput & { jobId?: string; tenantId?: string | null },
  context: "dispatch_board" | "command_center"
) {
  const derived = deriveCommandCenterState(input);
  if (!derived.hasUnknownMapping) return;

  const rawStatus = (input.status ?? "null").toString();
  const rawDispatchStatus = (input.dispatch_status ?? "null").toString();
  const key = `${context}:${rawStatus}:${rawDispatchStatus}`;
  if (unknownStateSeen.has(key)) return;
  unknownStateSeen.add(key);

  console.warn("[DispatchStateTriage] Unknown status mapping detected", {
    context,
    jobId: input.jobId ?? null,
    status: rawStatus,
    dispatch_status: rawDispatchStatus,
    normalizedAppointmentStatus: derived.normalizedAppointmentStatus,
    normalizedDispatchStatus: derived.normalizedDispatchStatus,
  });

  trackUnknownStateComboPerTenantDay({
    tenantId: input.tenantId,
    status: rawStatus,
    dispatchStatus: rawDispatchStatus,
    source: context,
  });
}
