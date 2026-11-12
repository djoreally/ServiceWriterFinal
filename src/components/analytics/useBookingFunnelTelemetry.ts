import { useEffect, useRef } from "react";
import {
  initBookingTelemetry,
  trackAddonsSelected,
  trackAddonsViewed,
  trackBookingConfirmed,
  trackDetailsCompleted,
  trackDetailsStarted,
  trackFunnelStep,
  trackPaymentStarted,
  trackPaymentViewed,
  trackPriceShown,
  trackServiceSelected,
  trackServiceViewed,
  trackServicesCompared,
  trackTimeSlotSelected,
  trackTimeSlotViewed,
  type BookingFunnelStep,
  type ServiceContext,
} from "@/lib/telemetry/public";

interface CatalogServiceLike {
  id: string;
  name: string;
  default_price: number;
  is_upsell?: boolean;
}

export interface BookingFunnelTelemetryInput {
  ownerUserId: string | null | undefined;
  step: number;
  step5View: "options" | "contact";
  services: CatalogServiceLike[];
  selectedServices: CatalogServiceLike[];
  selectedDate: Date | null;
  selectedTime: string | null;
  grandTotal: number;
  payNowStatus: string | null | undefined;
}

function toContext(service: CatalogServiceLike): ServiceContext {
  return { id: service.id, name: service.name, price: service.default_price };
}

function stepFor(step: number, step5View: "options" | "contact"): BookingFunnelStep {
  switch (step) {
    case 1:
      return "address";
    case 2:
      return "vehicle";
    case 3:
      return "service";
    case 4:
      return "time";
    case 5:
      return step5View === "contact" ? "payment" : "details";
    case 6:
      return "confirmed";
    default:
      return "landing";
  }
}

/**
 * Built-in telemetry for the public booking funnel — commerce
 * psychology, not pageviews. Wired beside the existing step-change
 * effect in PublicBooking; every emission is fire-and-forget and can
 * never break booking.
 *
 * Emits, under one visitor session: landing, per-step funnel events,
 * the viewed service menu + compared set, selections with the quote
 * total at that moment, price_shown whenever the total on screen
 * changes, time slot view/selection, add-on view/selection, details
 * start/completion, payment view/start, and booking_confirmed.
 * Abandonment (last step + time in journey) is emitted by the tracker
 * itself on pagehide when the journey never confirmed.
 */
export function useBookingFunnelTelemetry(input: BookingFunnelTelemetryInput): void {
  const { ownerUserId, step, step5View, services, selectedServices, selectedDate, selectedTime, grandTotal, payNowStatus } = input;
  const funnelStep = stepFor(step, step5View);

  const seenSteps = useRef<Set<string>>(new Set());
  const lastSelectedKey = useRef<string>("");
  const lastSlotKey = useRef<string>("");
  const lastPriceKey = useRef<string>("");
  const lastAddonsKey = useRef<string>("");
  const paymentStartedSent = useRef(false);
  const detailsCompletedSent = useRef(false);
  const confirmedSent = useRef(false);

  // Bind to the shop (landing) once the business profile resolves.
  useEffect(() => {
    if (!ownerUserId) return;
    initBookingTelemetry({ ownerUserId });
  }, [ownerUserId]);

  // Step navigation + per-step commerce moments.
  useEffect(() => {
    if (!ownerUserId) return;
    trackFunnelStep(funnelStep, { booking_step: step });

    const once = (key: string) => {
      if (seenSteps.current.has(key)) return false;
      seenSteps.current.add(key);
      return true;
    };

    if (step === 3 && services.length > 0 && once("service-menu")) {
      const menu = services.filter((service) => !service.is_upsell).map(toContext);
      for (const service of menu.slice(0, 50)) trackServiceViewed("service", service);
      trackServicesCompared("service", menu);
    }
    if (step === 4 && once("time-view")) {
      trackTimeSlotViewed("time");
    }
    if (step === 5 && step5View === "options" && once("addons-view")) {
      const addons = services.filter((service) => service.is_upsell).map(toContext);
      if (addons.length > 0) trackAddonsViewed("details", addons);
    }
    if (step === 5 && step5View === "contact" && once("payment-view")) {
      trackDetailsStarted("payment");
      trackPaymentViewed("payment", grandTotal > 0 ? grandTotal : undefined);
    }
    if (step === 6 && !confirmedSent.current) {
      confirmedSent.current = true;
      if (!detailsCompletedSent.current) {
        detailsCompletedSent.current = true;
        trackDetailsCompleted("confirmed");
      }
      trackBookingConfirmed({
        quote_total: grandTotal > 0 ? grandTotal : undefined,
        services: selectedServices.map(toContext),
      });
    }
  }, [ownerUserId, funnelStep, step, step5View, services, grandTotal, selectedServices]);

  // Service selection changes — with the quote total at that moment.
  useEffect(() => {
    if (!ownerUserId || step < 3) return;
    const key = selectedServices.map((service) => service.id).sort().join(",");
    if (!key || key === lastSelectedKey.current) return;
    lastSelectedKey.current = key;
    trackServiceSelected(funnelStep, selectedServices.map(toContext), grandTotal > 0 ? grandTotal : undefined);

    const addonIds = new Set(services.filter((service) => service.is_upsell).map((service) => service.id));
    const addons = selectedServices.filter((service) => addonIds.has(service.id));
    const addonsKey = addons.map((service) => service.id).sort().join(",");
    if (addons.length > 0 && addonsKey !== lastAddonsKey.current) {
      lastAddonsKey.current = addonsKey;
      trackAddonsSelected(funnelStep, addons.map(toContext), grandTotal > 0 ? grandTotal : undefined);
    }
  }, [ownerUserId, step, funnelStep, selectedServices, services, grandTotal]);

  // Price shown — whenever the on-screen total changes from step 3 on.
  useEffect(() => {
    if (!ownerUserId || step < 3 || step > 5 || !(grandTotal > 0)) return;
    const key = `${funnelStep}:${grandTotal}`;
    if (key === lastPriceKey.current) return;
    lastPriceKey.current = key;
    trackPriceShown(funnelStep, grandTotal, selectedServices.map(toContext));
  }, [ownerUserId, step, funnelStep, grandTotal, selectedServices]);

  // Time slot selection.
  useEffect(() => {
    if (!ownerUserId || !selectedDate || !selectedTime) return;
    const key = `${selectedDate.toISOString().slice(0, 10)}T${selectedTime}`;
    if (key === lastSlotKey.current) return;
    lastSlotKey.current = key;
    trackTimeSlotSelected("time", { date: key.slice(0, 10), time: selectedTime });
  }, [ownerUserId, selectedDate, selectedTime]);

  // Payment started — the pay-now flow is awaiting the customer's card.
  useEffect(() => {
    if (!ownerUserId || payNowStatus !== "awaiting_payment" || paymentStartedSent.current) return;
    paymentStartedSent.current = true;
    if (!detailsCompletedSent.current) {
      detailsCompletedSent.current = true;
      trackDetailsCompleted("payment");
    }
    trackPaymentStarted("payment", grandTotal > 0 ? grandTotal : undefined);
  }, [ownerUserId, payNowStatus, grandTotal]);
}
