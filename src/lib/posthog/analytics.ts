/**
 * PostHog analytics facade — thin, safe wrapper around posthog-js.
 *
 * Callable from anywhere (hooks, commands, edge-adjacent client code).
 * Fails silently when PostHog isn't loaded (SSR, tests, opted-out users).
 *
 * Event taxonomy (canonical — used by dashboards, funnels, and alerts):
 *   Appointment lifecycle:
 *     - "appointment created"
 *     - "appointment status changed"
 *     - "appointment confirmed"
 *     - "appointment completed"
 *     - "appointment cancelled"
 *   Checkout / payment:
 *     - "checkout started"
 *     - "payment succeeded"      (alias: "payment collected")
 *     - "payment failed"
 *     - "refund issued"
 *
 * Every event carries $groups.organization when organization_id is provided,
 * so PostHog group analytics segments the data by business tenant.
 */
import posthog from "posthog-js";

export type AnalyticsProps = Record<string, string | number | boolean | null | undefined>;

function safeCapture(event: string, props: AnalyticsProps = {}) {
  try {
    // posthog-js is a singleton — check __loaded to avoid throwing during SSR/tests.

    if (typeof window === "undefined" || !(posthog as any)?.__loaded) return;
    const { organization_id, ...rest } = props;
    const enriched: Record<string, unknown> = { ...rest };
    if (organization_id) {
      enriched.organization_id = organization_id;
      enriched.$groups = { organization: String(organization_id) };
    }
    posthog.capture(event, enriched);
  } catch {
    // Never let analytics break a user flow.
  }
}

// ── Appointment lifecycle ────────────────────────────────────────────────

export function trackAppointmentCreated(props: {
  appointment_id: string;
  organization_id: string;
  source: "public_booking" | "voice_agent" | "inline_writer" | "manual" | string;
  service_count?: number;
  amount_cents?: number;
  payment_choice?: "pay_now" | "pay_later" | string;
  status?: string;
  vehicle_count?: number;
}) {
  safeCapture("appointment created", props);
}

export function trackAppointmentStatusChanged(props: {
  appointment_id: string;
  organization_id?: string;
  from_status?: string;
  to_status: string;
  trigger?: "user" | "system" | "webhook" | string;
}) {
  safeCapture("appointment status changed", props);
  // Fan out to lifecycle-specific events so dashboards can key off them.
  if (props.to_status === "confirmed") {
    safeCapture("appointment confirmed", props);
  } else if (props.to_status === "completed") {
    safeCapture("appointment completed", props);
  } else if (
    props.to_status === "cancelled" ||
    props.to_status === "canceled"
  ) {
    safeCapture("appointment cancelled", props);
  }
}

// ── Checkout / payment ───────────────────────────────────────────────────

export function trackCheckoutStarted(props: {
  organization_id: string;
  appointment_id?: string;
  amount_cents?: number;
  currency?: string;
  provider?: "stripe" | "square" | string;
  service_count?: number;
}) {
  safeCapture("checkout started", props);
}

export function trackPaymentSucceeded(props: {
  organization_id?: string;
  appointment_id?: string;
  payment_id?: string;
  amount_cents?: number;
  currency?: string;
  provider?: string;
}) {
  safeCapture("payment succeeded", props);
  // Alias for the retention/revenue dashboards that key on "payment collected".
  safeCapture("payment collected", props);
}

export function trackPaymentFailed(props: {
  organization_id?: string;
  appointment_id?: string;
  amount_cents?: number;
  error_code?: string;
  error_message?: string;
  provider?: string;
}) {
  safeCapture("payment failed", props);
}

export function trackRefundIssued(props: {
  organization_id?: string;
  appointment_id?: string;
  payment_id?: string;
  refund_amount_cents?: number;
  reason?: string;
}) {
  safeCapture("refund issued", props);
}

export function trackPaymentRefunded(props: {
  organization_id?: string;
  appointment_id?: string;
  payment_id?: string;
  amount_cents?: number;
  currency?: string;
  reason?: string;
}) {
  safeCapture("payment refunded", props);
  // Alias for legacy dashboards that keyed on "refund issued".
  safeCapture("refund issued", {
    ...props,
    refund_amount_cents: props.amount_cents,
  });
}

// ── Generic escape hatch ────────────────────────────────────────────────

export function trackEvent(event: string, props: AnalyticsProps = {}) {
  safeCapture(event, props);
}
