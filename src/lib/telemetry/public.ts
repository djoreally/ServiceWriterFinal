/**
 * Built-in telemetry — public booking funnel stream (client capture).
 *
 * The MOMS website collector's ids and payload shape, pointed at a
 * shop's public booking pages in Service Writer. The visitor is
 * anonymous: identity columns stay empty and the journey is carried by
 * the visitor id + session id (90-day / 30-minute scheme, see
 * `./identity-ids`), with the workspace resolved server-side from the
 * shop owner's user id (or an explicit workspace id when a caller has
 * one). Sends go to `POST /v1/telemetry/public-events` through the same
 * sanctioned API path as the rest of the app.
 *
 * The taxonomy is commerce psychology, not generic pageviews — every
 * event carries the money context in its properties payload (service
 * id/name, price shown, quote total, slot, add-ons), so a shop can
 * answer: which services do people look at and not buy, where does the
 * price scare them off, how long do they sit on the payment step.
 *
 * Funnel steps, in canonical order (mirrored server-side):
 *   landing → address → vehicle → service → time → details → payment →
 *   confirmed
 */
import { apiRequest } from "@/lib/api-client";
import { createTelemetryIds } from "./identity-ids";

export const BOOKING_FUNNEL_STEPS = [
  "landing",
  "address",
  "vehicle",
  "service",
  "time",
  "details",
  "payment",
  "confirmed",
] as const;

export type BookingFunnelStep = (typeof BOOKING_FUNNEL_STEPS)[number];

export type BookingCommerceEventType =
  | "service_viewed"
  | "service_selected"
  | "services_compared"
  | "time_slot_viewed"
  | "time_slot_selected"
  | "addons_viewed"
  | "addons_selected"
  | "price_shown"
  | "details_started"
  | "details_completed"
  | "payment_viewed"
  | "payment_started"
  | "booking_confirmed"
  | "booking_abandoned";

export interface ServiceContext {
  id: string;
  name?: string;
  price?: number;
}

const ids = createTelemetryIds("sw_book");

interface BookingContext {
  workspaceId?: string | null;
  ownerUserId?: string | null;
}

let context: BookingContext | null = null;

// Journey state for abandonment: when the journey started, which step
// the visitor is sitting on, and since when — so booking_abandoned can
// report the last step, the time spent on it, and the total elapsed.
let journeyStartedAt = 0;
let currentStep: BookingFunnelStep = "landing";
let stepEnteredAt = 0;
let confirmed = false;
let abandonListenerInstalled = false;

function deviceClass(): string {
  if (typeof window === "undefined") return "desktop";
  return window.innerWidth < 768 ? "mobile" : window.innerWidth < 1100 ? "tablet" : "desktop";
}

function send(
  eventType: "pageview" | "page_exit" | "funnel_step" | BookingCommerceEventType,
  funnelStep?: BookingFunnelStep,
  properties?: Record<string, unknown>,
): void {
  if (typeof window === "undefined" || !context) return;
  if (!context.workspaceId && !context.ownerUserId) return;
  try {
    const params = new URLSearchParams(window.location.search);
    const body = {
      session_id: ids.sessionId(),
      visitor_id: ids.visitorId(),
      event_type: eventType,
      funnel_step: funnelStep,
      url: window.location.href,
      title: document.title,
      occurred_at: new Date().toISOString(),
      referrer: document.referrer || undefined,
      viewport_width: window.innerWidth,
      viewport_height: window.innerHeight,
      device_class: deviceClass(),
      utm: {
        source: params.get("utm_source") ?? undefined,
        medium: params.get("utm_medium") ?? undefined,
        campaign: params.get("utm_campaign") ?? undefined,
      },
      workspace_id: context.workspaceId ?? undefined,
      owner_user_id: context.ownerUserId ?? undefined,
      metadata: properties,
    };
    void apiRequest("/v1/telemetry/public-events", {
      method: "POST",
      // apiRequest JSON-encodes plain-object bodies (see api-client).
      body: body as unknown as BodyInit,
      keepalive: true,
      timeout: 0,
    }).catch(() => undefined);
  } catch {
    // Telemetry never breaks booking.
  }
}

function noteStep(step: BookingFunnelStep): void {
  if (step !== currentStep) {
    currentStep = step;
    stepEnteredAt = Date.now();
  }
  if (step === "confirmed") confirmed = true;
}

function installAbandonListener(): void {
  if (abandonListenerInstalled || typeof window === "undefined") return;
  abandonListenerInstalled = true;
  window.addEventListener("pagehide", () => {
    if (!context || confirmed || !journeyStartedAt) return;
    const now = Date.now();
    send("booking_abandoned", currentStep, {
      last_step: currentStep,
      journey_elapsed_ms: now - journeyStartedAt,
      step_elapsed_ms: stepEnteredAt ? now - stepEnteredAt : 0,
    });
    send("page_exit", currentStep);
  });
}

/**
 * Bind the tracker to a shop and record the landing: a pageview plus
 * the `landing` funnel step under this visitor session.
 */
export function initBookingTelemetry(next: BookingContext): void {
  if (typeof window === "undefined") return;
  const changed =
    !context || context.workspaceId !== next.workspaceId || context.ownerUserId !== next.ownerUserId;
  context = next;
  installAbandonListener();
  if (changed) {
    journeyStartedAt = Date.now();
    stepEnteredAt = journeyStartedAt;
    currentStep = "landing";
    send("pageview");
    send("funnel_step", "landing");
  }
}

/** Record reaching a funnel screen (step navigation, no commerce payload). */
export function trackFunnelStep(step: BookingFunnelStep, properties?: Record<string, unknown>): void {
  noteStep(step);
  send("funnel_step", step, properties);
}

/** Generic commerce event under the current funnel step. */
export function trackBookingEvent(
  eventType: BookingCommerceEventType,
  step: BookingFunnelStep,
  properties?: Record<string, unknown>,
): void {
  noteStep(step);
  send(eventType, step, properties);
}

// ── Commerce helpers (the money-psychology set) ──────────────────────

export function trackServiceViewed(step: BookingFunnelStep, service: ServiceContext): void {
  trackBookingEvent("service_viewed", step, { services: [service], service_id: service.id });
}

export function trackServicesCompared(step: BookingFunnelStep, services: ServiceContext[]): void {
  if (services.length < 2) return;
  trackBookingEvent("services_compared", step, { services });
}

export function trackServiceSelected(
  step: BookingFunnelStep,
  services: ServiceContext[],
  quoteTotal?: number,
): void {
  trackBookingEvent("service_selected", step, {
    services,
    service_id: services[0]?.id,
    ...(quoteTotal !== undefined ? { quote_total: quoteTotal } : {}),
  });
}

export function trackTimeSlotViewed(step: BookingFunnelStep): void {
  trackBookingEvent("time_slot_viewed", step, {});
}

export function trackTimeSlotSelected(
  step: BookingFunnelStep,
  slot: { date?: string | null; time?: string | null },
): void {
  trackBookingEvent("time_slot_selected", step, { date: slot.date ?? null, time: slot.time ?? null });
}

export function trackAddonsViewed(step: BookingFunnelStep, addons: ServiceContext[]): void {
  trackBookingEvent("addons_viewed", step, { addons });
}

export function trackAddonsSelected(step: BookingFunnelStep, addons: ServiceContext[], quoteTotal?: number): void {
  trackBookingEvent("addons_selected", step, {
    addons,
    ...(quoteTotal !== undefined ? { quote_total: quoteTotal } : {}),
  });
}

/** The moment a price becomes visible — the scare-off detector. */
export function trackPriceShown(step: BookingFunnelStep, quoteTotal: number, services?: ServiceContext[]): void {
  trackBookingEvent("price_shown", step, {
    quote_total: quoteTotal,
    ...(services ? { services } : {}),
  });
}

export function trackDetailsStarted(step: BookingFunnelStep): void {
  trackBookingEvent("details_started", step, {});
}

export function trackDetailsCompleted(step: BookingFunnelStep): void {
  trackBookingEvent("details_completed", step, {});
}

export function trackPaymentViewed(step: BookingFunnelStep, quoteTotal?: number): void {
  trackBookingEvent("payment_viewed", step, {
    ...(quoteTotal !== undefined ? { quote_total: quoteTotal } : {}),
  });
}

export function trackPaymentStarted(step: BookingFunnelStep, quoteTotal?: number): void {
  trackBookingEvent("payment_started", step, {
    ...(quoteTotal !== undefined ? { quote_total: quoteTotal } : {}),
  });
}

export function trackBookingConfirmed(properties?: Record<string, unknown>): void {
  noteStep("confirmed");
  send("booking_confirmed", "confirmed", properties);
}
