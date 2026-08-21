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

  // NOTE: The uniqueness we need is enforced by *partial* unique indexes
  // (recovered=false), which PostgREST cannot target via ON CONFLICT.
  // So we emulate upsert: look up the active row, then update or insert.
  let existingId: string | null = null;
  {
    let q = supabase
      .from("abandoned_bookings")
      .select("id")
      .eq("user_id", input.businessUserId)
      .eq("recovered", false);
    if (email) q = q.ilike("guest_email", email);
    else q = q.eq("session_id", sessionId as string);
    const { data: found, error: findErr } = await q.maybeSingle();
    if (findErr && findErr.code !== "PGRST116") {
      return { error: { message: findErr.message } };
    }
    existingId = found?.id ?? null;
  }

  const { data, error } = existingId
    ? await supabase
        .from("abandoned_bookings")
        .update(payload as never)
        .eq("id", existingId)
        .select("id")
        .single()
    : await supabase
        .from("abandoned_bookings")
        .insert(payload as never)
        .select("id")
        .single();

  if (!error && data?.id) {
    void supabase.rpc("notify_abandoned_booking", { row_id: data.id });
  }
  return { error: error ? { message: error.message } : null };
}

/**
 * Mark this visitor's abandoned record as recovered (called on booking
 * success). Caller may match by email, by session, or both.
 */
export async function markBookingRecovered(
  businessUserId: string,
  guestEmail: string | null,
  sessionId?: string | null,
): Promise<{ error: { message: string } | null }> {
  const email = guestEmail?.trim().toLowerCase() || null;
  if (!email && !sessionId) return { error: null };

  let query = supabase
    .from("abandoned_bookings")
    .update({
      recovered: true,
      status: "recovered",
      recovered_at: new Date().toISOString(),
    } as never)
    .eq("user_id", businessUserId)
    .in("status", ["pending", "processing", "emailed"])
    .eq("recovered", false);

  if (email) {
    query = query.ilike("guest_email", email);
  } else if (sessionId) {
    query = query.eq("session_id", sessionId);
  }

  const { error } = await query;
  return { error: error ? { message: error.message } : null };
}
