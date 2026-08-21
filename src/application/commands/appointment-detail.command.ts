/**
 * Appointment Detail Commands — Write operations for appointment records.
 */
import { supabase } from "@/integrations/supabase/client";
import { trackAppointmentStatusChanged } from "@/lib/posthog/analytics";

/**
 * Update the status of an appointment.
 *
 * Returns { data, error } for callers that inspect the error field
 * (e.g. AppointmentDetail). Also uses `.select()` so RLS-blocked updates
 * — which resolve silently with 0 rows — surface as an error to callers
 * that only handle throws (e.g. the optimistic hook on the list page).
 */
export async function updateAppointmentStatus(id: string, status: string) {
  // Best-effort read of previous status for analytics (non-blocking).
  let fromStatus: string | undefined;
  try {
    const { data: prev } = await supabase
      .from("appointments")
      .select("status, user_id")
      .eq("id", id)
      .maybeSingle();
    fromStatus = prev?.status ?? undefined;
    if (prev?.user_id) {
      // Fire-and-forget; safe helper never throws.
      queueMicrotask(() =>
        trackAppointmentStatusChanged({
          appointment_id: id,
          organization_id: prev.user_id ?? undefined,
          from_status: fromStatus,
          to_status: status,
          trigger: "user",
        }),
      );
    }
  } catch {
    // Analytics must never block the mutation.
  }

  const res = await supabase
    .from("appointments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, status")
    .maybeSingle();

  if (res.error) {
    // Preserve the raw supabase error for callers that check `.error`,
    // but also throw so optimistic hooks trigger their rollback path.
    const err = new Error(res.error.message || "Failed to update appointment status");
    (err as any).cause = res.error;
    throw err;
  }
  if (!res.data) {
    throw new Error(
      "You don't have permission to update this appointment, or it no longer exists.",
    );
  }
  return res;
}

/** Permanently delete an appointment. */
export async function deleteAppointment(id: string) {
  return supabase.from("appointments").delete().eq("id", id);
}

/**
 * Start an appointment job. Stamps actual_start_time and flips dispatch_status
 * to 'in_progress'. Idempotent — safe to call repeatedly.
 */
export async function startAppointmentJob(
  appointmentId: string,
): Promise<{ success: boolean; alreadyStarted?: boolean; error?: string }> {
  try {
    const { data, error } = await supabase.rpc(
      "start_appointment_job" as any,
      { p_appointment_id: appointmentId },
    );
    if (error) throw new Error(error.message);
    const result = data as any;
    return {
      success: !!result?.success,
      alreadyStarted: !!result?.already_started,
    };
  } catch (err: any) {
    return { success: false, error: err?.message || "Failed to start job" };
  }
}
