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

function integer(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : fallback;
}

export async function saveAvailabilitySettings(_userId: string, payload: Record<string, unknown>): Promise<void> {
  const id = await workspaceId();
  const db = supabase as any;
  const { error } = await db.rpc("update_workspace_scheduling_settings_v1", {
    p_workspace_id: id,
    p_day_hours: payload.day_hours ?? {},
    p_buffer_time_before: integer(payload.buffer_time_before, 0),
    p_buffer_time_after: integer(payload.buffer_time_after, 0),
    p_min_lead_time_hours: integer(payload.min_lead_time_hours, 2),
    p_max_advance_days: integer(payload.max_advance_days, 30),
    p_allow_multi_day_bookings: payload.allow_multi_day_bookings === true,
    p_slot_duration_minutes: integer(payload.slot_duration_minutes, 30),
    p_require_approval: payload.require_approval === true,
    p_cancellation_window_hours: integer(payload.cancellation_window_hours, 24),
    p_allow_cancellation: payload.allow_cancellation !== false,
    p_allow_rescheduling: payload.allow_rescheduling !== false,
    p_reschedule_window_hours: integer(payload.reschedule_window_hours, 24),
    p_terms_and_conditions: typeof payload.terms_and_conditions === "string" ? payload.terms_and_conditions : "",
    p_require_terms_acceptance: payload.require_terms_acceptance === true,
  });
  if (error) throw error;
}

export async function blockDate(_userId: string, date: string, reason: string | null): Promise<void> {
  const id = await workspaceId();
  const { data: { user } } = await supabase.auth.getUser();
  const db = supabase as any;
  const { error } = await db.from("workspace_blackout_dates").upsert({
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
  const db = supabase as any;
  const { error } = await db.from("workspace_blackout_dates").delete().eq("workspace_id", workspace).eq("id", id);
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
  const db = supabase as any;
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
    const { error } = await db
      .from("workspace_intake_questions")
      .update(values)
      .eq("workspace_id", workspace)
      .eq("id", question.id);
    if (error) throw error;
    return;
  }

  const { error } = await db.from("workspace_intake_questions").insert({
    ...values,
    created_by: user?.id ?? null,
  });
  if (error) throw error;
}

export async function deleteIntakeQuestion(id: string): Promise<void> {
  const workspace = await workspaceId();
  const db = supabase as any;
  const { error } = await db.from("workspace_intake_questions").delete().eq("workspace_id", workspace).eq("id", id);
  if (error) throw error;
}

export async function toggleIntakeQuestionActive(id: string, isActive: boolean): Promise<void> {
  const workspace = await workspaceId();
  const db = supabase as any;
  const { error } = await db
    .from("workspace_intake_questions")
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq("workspace_id", workspace)
    .eq("id", id);
  if (error) throw error;
}
