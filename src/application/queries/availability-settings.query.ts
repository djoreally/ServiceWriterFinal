/**
 * Availability Settings Query — canonical workspace-scoped scheduling reads.
 */
import { productionSupabase as supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export async function getSessionUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function fetchAvailabilityPageData(_userId?: string) {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before managing availability.");

  const [settingsResult, workspaceResult, blockedResult, questionsResult] = await Promise.all([
    supabase
      .from("workspace_settings")
      .select("day_hours, buffer_time_before, buffer_time_after, min_lead_time_hours, max_advance_days, allow_multi_day_bookings, slot_duration_minutes, require_approval, cancellation_window_hours, allow_cancellation, allow_rescheduling, reschedule_window_hours, terms_and_conditions, require_terms_acceptance")
      .eq("workspace_id", context.workspaceId)
      .maybeSingle(),
    supabase
      .from("workspaces")
      .select("timezone")
      .eq("id", context.workspaceId)
      .maybeSingle(),
    supabase
      .from("workspace_blackout_dates")
      .select("id, blocked_date, reason")
      .eq("workspace_id", context.workspaceId)
      .order("blocked_date", { ascending: true }),
    supabase
      .from("workspace_intake_questions")
      .select("id, question_text, question_type, options, is_required, sort_order, is_active")
      .eq("workspace_id", context.workspaceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (settingsResult.error) throw settingsResult.error;
  if (workspaceResult.error) throw workspaceResult.error;
  if (blockedResult.error) throw blockedResult.error;
  if (questionsResult.error) throw questionsResult.error;

  const profile = settingsResult.data
    ? { ...settingsResult.data, timezone: workspaceResult.data?.timezone ?? "UTC" }
    : null;

  return {
    profile,
    blocked: blockedResult.data ?? [],
    questions: questionsResult.data ?? [],
  };
}
