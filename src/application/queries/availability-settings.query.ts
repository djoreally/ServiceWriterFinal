/**
 * Availability Settings Query — Read-only data access for availability & policies.
 * All write operations have been moved to availability-settings.command.ts.
 */
import { supabase } from "@/integrations/supabase/client";

export async function getSessionUserId(): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

export async function fetchAvailabilityPageData(userId: string) {
  const [{ data: profile }, { data: blocked }, { data: questions }] = await Promise.all([
    supabase
      .from("business_profiles")
      .select("day_hours, timezone, buffer_time_before, buffer_time_after, min_lead_time_hours, max_advance_days, allow_multi_day_bookings, slot_duration_minutes, require_approval, cancellation_window_hours, allow_cancellation, allow_rescheduling, reschedule_window_hours, terms_and_conditions, require_terms_acceptance")
      .eq("user_id", userId)
      .single(),
    supabase
      .from("blocked_dates")
      .select("*")
      .eq("user_id", userId)
      .order("blocked_date", { ascending: true }),
    supabase
      .from("intake_questions")
      .select("*")
      .eq("user_id", userId)
      .order("sort_order", { ascending: true }),
  ]);

  return { profile, blocked: blocked ?? [], questions: questions ?? [] };
}
