/** Dispatch Guardrails — canonical appointment schema. */
import { supabase } from "@/integrations/supabase/client";
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
  const db = supabase as any;

  const { data: tech, error: techError } = await db.from("technicians")
    .select("name,status,max_daily_capacity_hours,is_active,auth_user_id")
    .eq("id", technicianId)
    .maybeSingle();
  if (techError) throw techError;
  if (!tech) return { valid: false, errors: ["Technician not found"], warnings: [] };
  if (!tech.is_active) errors.push(`${tech.name} is not active`);
  if (!tech.auth_user_id) errors.push(`${tech.name} is not linked to an authenticated workspace user`);

  const dayStart = new Date(`${jobDate}T00:00:00.000Z`);
  const dayEnd = new Date(dayStart.getTime() + 86400000);
  let query = db.from("appointments")
    .select("id,starts_at,ends_at,status")
    .eq("assigned_user_id", tech.auth_user_id)
    .gte("starts_at", dayStart.toISOString())
    .lt("starts_at", dayEnd.toISOString())
    .not("status", "in", '("cancelled","completed","no_show")');
  if (excludeAppointmentId) query = query.neq("id", excludeAppointmentId);
  const { data: existingJobs, error: jobsError } = await query;
  if (jobsError) throw jobsError;

  const slots: ScheduleSlot[] = (existingJobs ?? []).map((row: any) => ({
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
