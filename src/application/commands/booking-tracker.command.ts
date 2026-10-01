/**
 * Booking Tracker Commands — Funnel tracking for the public booking flow.
 *
 * Records every visitor's step into `abandoned_bookings`. Identity is
 * cookie-first (anonymous session_id) with email layered on top as soon
 * as the visitor types it.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";

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
  // Must have at least one identity dimension
  if (!input.guestEmail?.trim() && !input.sessionId) return { error: null };

  try {
    const response = await apiClient.post<{ data: unknown; error: { message?: string } | null }>(
      "/v1/appointments/booking-progress",
      {
        business_user_id: input.businessUserId,
        guest_email: input.guestEmail?.trim().toLowerCase() || null,
        guest_name: input.guestName ?? null,
        guest_phone: input.guestPhone ?? null,
        last_step: input.lastStep,
        session_id: input.sessionId ?? null,
        service_catalog_id: input.serviceCatalogId ?? null,
        scheduled_date: input.scheduledDate ?? null,
        scheduled_time: input.scheduledTime ?? null,
        metadata: input.metadata ?? {},
      },
    );
    return { error: response.error ? { message: response.error.message ?? "Failed to track booking progress" } : null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Failed to track booking progress" } };
  }
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
  if (!guestEmail?.trim() && !sessionId) return { error: null };

  try {
    const response = await apiClient.post<{ data: unknown; error: { message?: string } | null }>(
      "/v1/appointments/booking-recovered",
      {
        business_user_id: businessUserId,
        guest_email: guestEmail?.trim().toLowerCase() || null,
        session_id: sessionId ?? null,
      },
    );
    return { error: response.error ? { message: response.error.message ?? "Failed to mark booking recovered" } : null };
  } catch (error) {
    return { error: { message: error instanceof Error ? error.message : "Failed to mark booking recovered" } };
  }
}
