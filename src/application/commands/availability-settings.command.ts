/**
 * Availability Settings Commands — All write operations for availability & policies.
 * Extracted from availability-settings.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

export async function saveAvailabilitySettings(userId: string, payload: Record<string, any>): Promise<void> {
  const { error } = await supabase
    .from("business_profiles")
    .update(payload as never)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function blockDate(userId: string, date: string, reason: string | null): Promise<void> {
  const { error } = await supabase
    .from("blocked_dates")
    .insert({ user_id: userId, blocked_date: date, reason });

  if (error && !error.message.includes("duplicate")) throw error;
}

export async function unblockDate(id: string): Promise<void> {
  const { error } = await supabase.from("blocked_dates").delete().eq("id", id);
  if (error) throw error;
}

export async function upsertIntakeQuestion(
  userId: string,
  question: {
    id?: string;
    question_text: string;
    question_type: string;
    options: string[] | null;
    is_required: boolean;
    sort_order?: number;
  },
): Promise<void> {
  if (question.id) {
    const { error } = await supabase
      .from("intake_questions")
      .update({
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.options,
        is_required: question.is_required,
      })
      .eq("id", question.id);
    if (error) throw error;
  } else {
    const { error } = await supabase
      .from("intake_questions")
      .insert({
        user_id: userId,
        question_text: question.question_text,
        question_type: question.question_type,
        options: question.options,
        is_required: question.is_required,
        sort_order: question.sort_order ?? 0,
      });
    if (error) throw error;
  }
}

export async function deleteIntakeQuestion(id: string): Promise<void> {
  const { error } = await supabase.from("intake_questions").delete().eq("id", id);
  if (error) throw error;
}

export async function toggleIntakeQuestionActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from("intake_questions")
    .update({ is_active: isActive })
    .eq("id", id);
  if (error) throw error;
}
