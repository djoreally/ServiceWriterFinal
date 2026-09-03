/**
 * Availability Settings Commands — canonical workspace-scoped scheduling writes.
 */
import { productionSupabase as supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

async function workspaceId(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before managing availability.");
  return context.workspaceId;
}

export async function saveAvailabilitySettings(_userId: string, payload: Record<string, unknown>): Promise<void> {
  const id = await workspaceId();
  const allowed = {
    day_hours: payload.day_hours,
    buffer_time_before: payload.buffer_time_before,
    buffer_time_after: payload.buffer_time_after,
    min_lead_time_hours: payload.min_lead_time_hours,
    max_advance_days: payload.max_advance_days,
    allow_multi_day_bookings: payload.allow_multi_day_bookings,
    slot_duration_minutes: payload.slot_duration_minutes,
    require_approval: payload.require_approval,
    cancellation_window_hours: payload.cancellation_window_hours,
    allow_cancellation: payload.allow_cancellation,
    allow_rescheduling: payload.allow_rescheduling,
    reschedule_window_hours: payload.reschedule_window_hours,
    terms_and_conditions: payload.terms_and_conditions,
    require_terms_acceptance: payload.require_terms_acceptance,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("workspace_settings").update(allowed).eq("workspace_id", id);
  if (error) throw error;
}

export async function blockDate(_userId: string, date: string, reason: string | null): Promise<void> {
  const id = await workspaceId();
  const { data: { user } } = await supabase.auth.getUser();
  const { error } = await supabase.from("workspace_blackout_dates").upsert({
    workspace_id: id,
    blocked_date: date,
    reason,
    created_by: user?.id ?? null,
    updated_at: new Date().toISOString(),
  }, { onConflict: "workspace_id,blocked_date" });
  if (error) throw error;
}

export async function unblockDate(id: string): Promise<void> {
  const workspace = await workspaceId();
  const { error } = await supabase.from("workspace_blackout_dates").delete().eq("workspace_id", workspace).eq("id", id);
  if (error) throw error;
}

export async function upsertIntakeQuestion(
  _userId: string,
  question: {
    id?: string;
    question_text: string;
    question_type: string;
    options: string[] | null;
    is_required: boolean;
    sort_order?: number;
  },
): Promise<void> {
  const workspace = await workspaceId();
  const { data: { user } } = await supabase.auth.getUser();
  const values = {
    workspace_id: workspace,
    question_text: question.question_text.trim(),
    question_type: question.question_type,
    options: question.options,
    is_required: question.is_required,
    sort_order: question.sort_order ?? 0,
    updated_at: new Date().toISOString(),
  };
  if (!values.question_text) throw new Error("Question text is required.");

  if (question.id) {
    const { error } = await supabase
      .from("workspace_intake_questions")
      .update(values)
      .eq("workspace_id", workspace)
      .eq("id", question.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("workspace_intake_questions").insert({
    ...values,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function deleteIntakeQuestion(id: string): Promise<void> {
  const workspace = await workspaceId();
  const { error } = await supabase.from("workspace_intake_questions").delete().eq("workspace_id", workspace).eq("id", id);
  if (error) throw error;
}

export async function toggleIntakeQuestionActive(id: string, isActive: boolean): Promise<void> {
  const workspace = await workspaceId();
  const { error } = await supabase
    .from("workspace_intake_questions")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspace)
    .eq("id", id);
  if (error) throw error;
}
