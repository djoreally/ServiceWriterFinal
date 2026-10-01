/**
 * Availability Settings Query — canonical workspace-scoped scheduling reads.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. The server resolves the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";
import { getCurrentAuthUser } from "@/lib/auth/current-user";

export interface AvailabilityBlockedDateRow { id: string; blocked_date: string; reason: string | null; }
export interface AvailabilityIntakeQuestionRow {
  id: string;
  question_text: string;
  question_type: "text" | "textarea" | "select" | "checkbox";
  options: string[] | null;
  is_required: boolean;
  sort_order: number;
  is_active: boolean;
}

export async function getSessionUserId(): Promise<string | null> {
  const { data } = await getCurrentAuthUser();
  return data?.user?.id ?? null;
}

export interface AvailabilityProfileRow {
  day_hours: unknown;
  timezone: string | null;
  buffer_time_before: number | null;
  buffer_time_after: number | null;
  min_lead_time_hours: number | null;
  max_advance_days: number | null;
  allow_multi_day_bookings: boolean | null;
  slot_duration_minutes: number | null;
  require_approval: boolean | null;
  cancellation_window_hours: number | null;
  allow_cancellation: boolean | null;
  allow_rescheduling: boolean | null;
  require_terms_acceptance: boolean | null;
  reschedule_window_hours: number | null;
  terms_and_conditions: string | null;
}

export async function fetchAvailabilityPageData(_userId?: string) {
  const response = await apiClient.get<{
    profile: AvailabilityProfileRow | null;
    blocked: AvailabilityBlockedDateRow[];
    questions: AvailabilityIntakeQuestionRow[];
  }>("/v1/appointments/availability-page");
  return {
    profile: response.profile,
    blocked: response.blocked ?? [],
    questions: response.questions ?? [],
  };
}
