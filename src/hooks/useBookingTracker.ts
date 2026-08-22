/**
 * useBookingTracker — debounced cart-style tracker that records every step
 * a visitor takes through the public booking funnel.
 *
 * Identity model (cookie-first, email-secondary):
 *  • A persistent anonymous cookie session id identifies the visitor from
 *    step 1 — BEFORE they ever type an email.
 *  • As soon as an email is captured, the row is keyed by email so the
 *    retention engine can target the customer by address. We pass BOTH
 *    keys; the upsert conflict target switches in the command layer.
 *
 * Behavior:
 *  • Fires on every meaningful step / field change, debounced 1.5s.
 *  • Also fires on `pagehide` so we catch tab closes.
 *  • Caller invokes `recover()` after BOOKING_SUCCESS to mark the row
 *    `recovered = true` (DB trigger is a safety net).
 *
 * The DB scheduler `promote_abandoned_bookings_to_signals` (every 15 min)
 * promotes stale rows into `customer.booking_abandoned` retention signals
 * which automation rules (declined-service / win-back) can target.
 */
import { useEffect, useRef } from "react";
import { attributionProps, resolveBookingSource } from "@/lib/attribution";
import {
  trackBookingProgress,
  markBookingRecovered,
  type TrackBookingProgressInput,
} from "@/application/commands/booking-tracker.command";

interface UseBookingTrackerOptions {
  businessUserId: string | undefined;
  guestEmail: string;
  guestName?: string;
  guestPhone?: string;
  step: number;
  /** Persistent anonymous cookie id — required for pre-email tracking. */
  sessionId?: string | null;
  serviceCatalogId?: string | null;
  scheduledDate?: string | null;
  scheduledTime?: string | null;
  /** Stop tracking once the booking succeeds. */
  succeeded: boolean;
}

export function useBookingTracker(opts: UseBookingTrackerOptions) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastSentRef = useRef<string>("");
  const succeededRef = useRef(opts.succeeded);
  succeededRef.current = opts.succeeded;

  const email = opts.guestEmail?.trim();
  const hasEmail = !!email && email.includes("@");
  const sessionId = opts.sessionId ?? null;

  // Debounced write on dependency change
  useEffect(() => {
    if (!opts.businessUserId) return;
    if (succeededRef.current) return;
    // Need at least one identity dimension
    if (!hasEmail && !sessionId) return;

    const fingerprint = JSON.stringify({
      e: hasEmail ? email!.toLowerCase() : "",
      sid: sessionId ?? "",
      n: opts.guestName ?? "",
      p: opts.guestPhone ?? "",
      s: opts.step,
      sc: opts.serviceCatalogId ?? "",
      d: opts.scheduledDate ?? "",
      t: opts.scheduledTime ?? "",
    });
    if (fingerprint === lastSentRef.current) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      const payload: TrackBookingProgressInput = {
        businessUserId: opts.businessUserId!,
        guestEmail: hasEmail ? email! : null,
        guestName: opts.guestName ?? null,
        guestPhone: opts.guestPhone ?? null,
        lastStep: opts.step,
        sessionId,
        serviceCatalogId: opts.serviceCatalogId ?? null,
        scheduledDate: opts.scheduledDate ?? null,
        scheduledTime: opts.scheduledTime ?? null,
        metadata: { source: resolveBookingSource(), ...attributionProps() },
      };
      void trackBookingProgress(payload).then(({ error }) => {
        if (!error) lastSentRef.current = fingerprint;
        else if (process.env.NODE_ENV !== "production") {
          console.warn("[booking-tracker] write failed:", error.message);
        }
      });
    }, 1500);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [
    opts.businessUserId,
    email,
    hasEmail,
    sessionId,
    opts.guestName,
    opts.guestPhone,
    opts.step,
    opts.serviceCatalogId,
    opts.scheduledDate,
    opts.scheduledTime,
  ]);

  // Final flush on tab close — best-effort fire-and-forget.
  useEffect(() => {
    const handler = () => {
      if (succeededRef.current) return;
      if (!opts.businessUserId) return;
      if (!hasEmail && !sessionId) return;
      void trackBookingProgress({
        businessUserId: opts.businessUserId,
        guestEmail: hasEmail ? email! : null,
        guestName: opts.guestName ?? null,
        guestPhone: opts.guestPhone ?? null,
        lastStep: opts.step,
        sessionId,
        serviceCatalogId: opts.serviceCatalogId ?? null,
        scheduledDate: opts.scheduledDate ?? null,
        scheduledTime: opts.scheduledTime ?? null,
        metadata: { source: resolveBookingSource(), reason: "unload", ...attributionProps() },
      });
    };
    window.addEventListener("pagehide", handler);
    return () => window.removeEventListener("pagehide", handler);
  }, [
    opts.businessUserId,
    email,
    hasEmail,
    sessionId,
    opts.guestName,
    opts.guestPhone,
    opts.step,
    opts.serviceCatalogId,
    opts.scheduledDate,
    opts.scheduledTime,
  ]);

  // Recovery on success — DB trigger also handles this; redundant safeguard.
  useEffect(() => {
    if (!opts.succeeded || !opts.businessUserId) return;
    if (hasEmail) void markBookingRecovered(opts.businessUserId, email!);
    if (sessionId) void markBookingRecovered(opts.businessUserId, null, sessionId);
  }, [opts.succeeded, opts.businessUserId, hasEmail, email, sessionId]);
}
