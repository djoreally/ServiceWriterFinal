/**
 * Public Booking Commands — Write operations for the public booking flow.
 * Extracted from public-booking.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

/** Track abandoned booking. */
export async function trackAbandonedBooking(data: Record<string, unknown>) {
  const { sessionId, session_id, lastAttemptedAt, last_attempted_at, attemptCount, attempt_count, userId, user_id, ...rest } = data;
  const targetSessionId = (session_id || sessionId || crypto.randomUUID()) as string;
  const targetUserId = (user_id || userId || "anonymous") as string;

  const { data: row, error } = await supabase
    .from("abandoned_bookings")
    .upsert(
      {
        session_id: targetSessionId,
        user_id: targetUserId,
        status: "pending",
        last_attempted_at: (last_attempted_at || lastAttemptedAt || new Date().toISOString()) as string,
        attempt_count: Number(attempt_count || attemptCount || 1),
        metadata: rest as any,
      },
      { onConflict: "session_id" },
    )
    .select("id")
    .single();

  if (error) throw error;

  // Fire-and-forget enqueue signal. Cron sweep remains the reliability backstop.
  void supabase.rpc("notify_abandoned_booking", { row_id: row.id });

  return row;
}
