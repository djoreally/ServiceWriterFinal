/**
 * Public Booking Commands — Write operations for the public booking flow.
 * Extracted from public-booking.query.ts to enforce command/query separation.
 */
import { supabase } from "@/integrations/supabase/client";

/** Track abandoned booking through the session-bound database contract. */
export async function trackAbandonedBooking(data: Record<string, unknown>) {
  const {
    sessionId,
    session_id,
    lastAttemptedAt: _lastAttemptedAt,
    last_attempted_at: _lastAttemptedAtSnake,
    attemptCount: _attemptCount,
    attempt_count: _attemptCountSnake,
    userId,
    user_id,
    guestEmail,
    guest_email,
    guestName,
    guest_name,
    guestPhone,
    guest_phone,
    lastStep,
    last_step,
    serviceCatalogId,
    service_catalog_id,
    scheduledDate,
    scheduled_date,
    scheduledTime,
    scheduled_time,
    ...rest
  } = data;

  const targetSessionId = String(session_id || sessionId || crypto.randomUUID());
  const targetUserId = String(user_id || userId || "");
  if (!targetUserId) throw new Error("business user id is required");

  const { data: rowId, error } = await (supabase as any).rpc(
    "public_track_abandoned_booking_v1",
    {
      p_business_user_id: targetUserId,
      p_session_id: targetSessionId,
      p_guest_email: guest_email || guestEmail || null,
      p_guest_name: guest_name || guestName || null,
      p_guest_phone: guest_phone || guestPhone || null,
      p_last_step: Number(last_step || lastStep || 0),
      p_service_catalog_id: service_catalog_id || serviceCatalogId || null,
      p_scheduled_date: scheduled_date || scheduledDate || null,
      p_scheduled_time: scheduled_time || scheduledTime || null,
      p_metadata: rest,
    },
  );

  if (error) throw error;
  return { id: rowId };
}
