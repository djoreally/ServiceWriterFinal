/**
 * Dispatch Guardrails — Pre-assignment validation for the dispatch system.
 * Prevents overbooking, time conflicts, and unrealistic assignments.
 */

import { supabase } from "@/integrations/supabase/client";
import { findScheduleConflict, wouldExceedCapacity, type ScheduleSlot } from "./dispatch-state";

export interface AssignmentValidation {
  valid: boolean;
  warnings: string[];
  errors: string[];
}

/**
 * Validate whether a job can be assigned to a technician.
 * Checks: time conflicts, capacity, and basic availability.
 */
export async function validateAssignment(
  technicianId: string,
  jobDate: string,
  jobTime: string,
  jobDurationMinutes: number,
  excludeAppointmentId?: string
): Promise<AssignmentValidation> {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Fetch technician info
  const { data: tech } = await supabase
    .from("technicians")
    .select("name, status, max_daily_capacity_hours, is_active")
    .eq("id", technicianId)
    .single();

  if (!tech) {
    return { valid: false, errors: ["Technician not found"], warnings: [] };
  }

  if (!tech.is_active) {
    errors.push(`${tech.name} is not active`);
  }

  // 2. Fetch existing assignments for the day
  let query = supabase
    .from("appointments")
    .select("id, scheduled_time, estimated_duration_minutes, duration_minutes")
    .eq("assigned_technician_id", technicianId)
    .eq("scheduled_date", jobDate)
    .not("status", "in", '("cancelled","completed")')
    .not("dispatch_status", "in", '("cancelled","completed")');

  if (excludeAppointmentId) {
    query = query.neq("id", excludeAppointmentId);
  }

  const { data: existingJobs } = await query;

  const slots: ScheduleSlot[] = (existingJobs ?? []).map((j) => ({
    scheduledTime: j.scheduled_time?.substring(0, 5) ?? "09:00",
    durationMinutes: j.estimated_duration_minutes || j.duration_minutes || 60,
  }));

  // 3. Check time conflicts
  const proposed: ScheduleSlot = {
    scheduledTime: jobTime.substring(0, 5),
    durationMinutes: jobDurationMinutes || 60,
  };

  const conflict = findScheduleConflict(slots, proposed, 15);
  if (conflict) {
    errors.push(
      `Time conflict: overlaps with existing job at ${conflict.scheduledTime} (${conflict.durationMinutes}min)`
    );
  }

  // 4. Check capacity
  const totalExistingMinutes = slots.reduce((sum, s) => sum + s.durationMinutes, 0);
  const maxHours = tech.max_daily_capacity_hours ?? 8;

  if (wouldExceedCapacity(totalExistingMinutes / 60, jobDurationMinutes, maxHours)) {
    warnings.push(
      `${tech.name} would be at ${((totalExistingMinutes + jobDurationMinutes) / 60).toFixed(1)}h / ${maxHours}h capacity`
    );
  }

  // 5. Status warning
  if (tech.status === "offline" || tech.status === "unavailable") {
    warnings.push(`${tech.name} is currently ${tech.status}`);
  }

  return {
    valid: errors.length === 0,
    warnings,
    errors,
  };
}
