/**
 * Availability Settings Commands — canonical workspace-scoped scheduling writes.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. The server resolves the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";

export async function saveAvailabilitySettings(_userId: string, payload: Record<string, unknown>): Promise<void> {
  await apiClient.post("/v1/appointments/availability-settings", { payload });
}

export async function blockDate(_userId: string, date: string, reason: string | null): Promise<void> {
  await apiClient.post("/v1/appointments/blackout-dates", { date, reason });
}

export async function unblockDate(id: string): Promise<void> {
  await apiClient.delete(`/v1/appointments/blackout-dates/${encodeURIComponent(id)}`);
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
  const questionText = question.question_text.trim();
  if (!questionText) throw new Error("Question text is required.");
  await apiClient.post("/v1/appointments/intake-questions", {
    question: {
      id: question.id,
      question_text: questionText,
      question_type: question.question_type,
      options: question.options,
      is_required: question.is_required,
      sort_order: question.sort_order ?? 0,
    },
  });
}

export async function deleteIntakeQuestion(id: string): Promise<void> {
  await apiClient.delete(`/v1/appointments/intake-questions/${encodeURIComponent(id)}`);
}

export async function toggleIntakeQuestionActive(id: string, isActive: boolean): Promise<void> {
  await apiClient.patch(`/v1/appointments/intake-questions/${encodeURIComponent(id)}`, { is_active: isActive });
}
