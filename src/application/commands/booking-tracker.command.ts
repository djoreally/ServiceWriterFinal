/**
 * Booking Tracker Commands — Funnel tracking for the public booking flow.
 *
 * Records every visitor's step into `abandoned_bookings`. Identity is
 * cookie-first (anonymous session_id) with email layered on top as soon
 * as the visitor types it. The DB scheduler
 * `promote_abandoned_bookings_to_signals` (every 15 min) converts stale
 * rows into `customer.booking_abandoned` retention signals that the
 * declined-service / win-back automation rules can target.
 */
import { supabase } from "@/integrations/supabase/client";

export interface TrackBookingProgressInput {
  businessUserId: string;
  /** Email if known; null for anonymous (cookie-only) tracking. */
  guestEmail: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  lastStep: number;
  /** Persistent anonymous cookie id. Required when email is null. */
  sessionId?: string | null;
  serviceCatalogId?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  metadata?: Record<string, unknown>;
}

/**
 * Upsert visitor progress. Conflict target depends on identity:
 *  • With email → (user_id, lower(guest_email))   [active row only]
 *  • Without email (anon) → (user_id, session_id) [active row only]
 *
 * Both partial unique indexes live in `abandoned_bookings`.
 */
export async function trackBookingProgress(
  input: TrackBookingProgressInput,
): Promise<{ error: { message: string } | null }> {
  const email = input.guestEmail?.trim().toLowerCase() || null;
  const sessionId = input.sessionId ?? null;

  // Must have at least one identity dimension
  if (!email && !sessionId) return { error: null };

  const payload = {
    user_id: input.businessUserId,
    guest_email: email,
    guest_name: input.guestName ?? null,
    guest_phone: input.guestPhone ?? null,
    last_step: input.lastStep,
    session_id: sessionId,
    service_catalog_id: input.serviceCatalogId ?? null,
    scheduled_date: input.scheduledDate ?? null,
    scheduled_time: input.scheduledTime ?? null,
    metadata: (input.metadata ?? {}) as never,
    status: "pending",
    last_attempted_at: new Date().toISOString(),
  };

  if (!sessionId) return { error: null };

  const { error } = await (supabase as any).rpc("public_track_abandoned_booking_v1", {
    p_business_user_id: payload.user_id,
    p_session_id: sessionId,
    p_guest_email: payload.guest_email,
    p_guest_name: payload.guest_name,
    p_guest_phone: payload.guest_phone,
    p_last_step: payload.last_step,
    p_service_catalog_id: payload.service_catalog_id,
    p_scheduled_date: payload.scheduled_date,
    p_scheduled_time: payload.scheduled_time,
    p_metadata: payload.metadata,
  });

  return { error: error ? { message: error.message } : null };
}

/**
 * Mark this visitor's abandoned record as recovered (called on booking
 * success). Caller may match by email, by session, or both.
 */
export async function markBookingRecovered(
  businessUserId: string,
  _guestEmail: string | null,
  sessionId?: string | null,
): Promise<{ error: { message: string } | null }> {
  if (!sessionId) return { error: null };

  const { error } = await (supabase as any).rpc("public_recover_abandoned_booking_v1", {
    p_business_user_id: businessUserId,
    p_session_id: sessionId,
  });
  return { error: error ? { message: error.message } : null };
}
