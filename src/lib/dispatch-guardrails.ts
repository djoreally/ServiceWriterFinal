/**
 * Dispatch Guardrails — canonical appointment schema.
 *
 * Phase 2: the technician + same-day job reads run server-side in the
 * appointments Hono router (`POST /v1/dispatch/validate-assignment`); the
 * pure conflict/capacity checks in `./dispatch-state` stay client-side.
 * Exported signature is unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { findScheduleConflict, wouldExceedCapacity, type ScheduleSlot } from "./dispatch-state";

export interface AssignmentValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

export async function validateAssignment(
  technicianId: string,
  jobDate: string,
  jobTime: string,
  jobDurationMinutes: number,
  excludeAppointmentId?: string,
): Promise<AssignmentValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const response = await apiClient.post<{
    data: {
      technician: {
        id: string;
        name: string;
        status: string | null;
        max_daily_capacity_hours: number | null;
        is_active: boolean | null;
        auth_user_id: string | null;
      };
      existingJobs: Array<{ id: string; starts_at: string | null; ends_at: string | null; status: string | null }>;
    };
  }>("/v1/dispatch/validate-assignment", {
    technician_id: technicianId,
    job_date: jobDate,
    job_time: jobTime,
    job_duration_minutes: jobDurationMinutes,
    exclude_appointment_id: excludeAppointmentId,
  });

  const tech = response.data.technician;
  const existingJobs = response.data.existingJobs ?? [];
  if (!tech) return { valid: false, errors: ["Technician not found"], warnings: [] };
  if (!tech.is_active) errors.push(`${tech.name} is not active`);
  if (!tech.auth_user_id) errors.push(`${tech.name} is not linked to an authenticated workspace user`);

  const slots: ScheduleSlot[] = existingJobs.map((row) => ({
    scheduledTime: row.starts_at?.slice(11, 16) ?? "09:00",
    durationMinutes: row.starts_at && row.ends_at
      ? Math.max(5, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000))
      : 60,
  }));
  const proposed: ScheduleSlot = { scheduledTime: jobTime.substring(0, 5), durationMinutes: jobDurationMinutes || 60 };
  const conflict = findScheduleConflict(slots, proposed, 15);
  if (conflict) errors.push(`Time conflict: overlaps with existing job at ${conflict.scheduledTime} (${conflict.durationMinutes}min)`);

  const totalExistingMinutes = slots.reduce((sum, slot) => sum + slot.durationMinutes, 0);
  const maxHours = tech.max_daily_capacity_hours ?? 8;
  if (wouldExceedCapacity(totalExistingMinutes / 60, jobDurationMinutes, maxHours)) {
    warnings.push(`${tech.name} would be at ${((totalExistingMinutes + jobDurationMinutes) / 60).toFixed(1)}h / ${maxHours}h capacity`);
  }
  if (tech.status === "offline" || tech.status === "unavailable") warnings.push(`${tech.name} is currently ${tech.status}`);
  return { valid: errors.length === 0, warnings, errors };
}
