/* eslint-disable react-hooks/exhaustive-deps */

/**
 * useBookingSubmit — Encapsulates booking submission logic (pay-later
 * and pay-now flows) including rate limiting, validation, and all
 * post-submission side-effects.
 *
 * Extracted from PublicBooking.tsx to keep the page as a coordinator.
 */

import { useCallback } from "react";
import { resolveBookingSource } from "@/lib/attribution";
import { toast } from "@/components/ui/sonner";
import {
  upsertBookingCustomer,
  upsertBookingVehicle,
  setVehicleTireSpec,
  bookAppointmentSafe,
  updateBookingAppointment,
  insertBookingAppointmentServices,
  insertBookingPaymentRecord,
  signUpBookingUser,
  createCustomerAccount,
  reserveBookingReward,
  applyBookingReward,
  redeemBookingReward,
  cancelBookingReward,
  type BookingServiceItem,
  saveAppointmentBookingConfiguration,
  reserveTireInventoryForAppointment,
} from "@/application/commands/booking-submit.command";
import { buildAppointmentBookingConfiguration } from "@/lib/booking-configuration";
import { findCustomerByEmail } from "@/application/queries/booking-submit.query";
import { reserveOilForBooking, reserveServicePartsForBooking } from "@/application/commands/booking-inventory.command";
import { format } from "date-fns";
import { normalizePhoneToE164 } from "@/lib/phone";
import { bookingSchema, getFirstError } from "@/lib/validation";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import { autoDispatchPublicBooking, startCheckout } from "@/application/commands";
import { completeBookingContext } from "@/application/commands/booking-context.command";
import {
  resolveBookingFilterMatch,
  buildFilterMatchJobContext,
  filterMatchContextPayload,
  type VehicleFilterMatch,
} from "@/lib/bookingFilterMatch";

import { supabase } from "@/integrations/supabase/client";
import { nextApi } from "@/lib/nextApiClient";

import { parseCheckoutError } from "@/components/booking/checkoutErrors.utils";
import type { CheckoutErrorType } from "@/components/booking/CheckoutErrors";
import {
  trackAppointmentCreated,
  trackCheckoutStarted,
} from "@/lib/posthog/analytics";
import type { BookingAction, BookingState } from "@/hooks/useBookingState";
import { dollarsToCents, toDollars } from "@/lib/financialMath";
import type { Dollars } from "@/lib/money";
import { requestAppointmentProviderSync } from "@/application/commands/provider-sync.command";
import { checkSlotRisk } from "@/application/queries/weather-guard.query";
import { vehicleMeetsBookingRequirements } from "@/lib/booking-requirements";
import type { BookingRequirement } from "@/lib/service-category-policy";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import { getRequestedTireQuantity } from "@/lib/tire-quantity";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

// Cooldown between SUCCESSFUL bookings to prevent accidental double-submits.
// Failed submissions do NOT trigger this gate (see RECORD_SUBMISSION dispatch).
// Was 60s — customers booking a second appointment back-to-back were getting
// confusing "rate limited" errors. 15s is enough to prevent double-clicks.
const RATE_LIMIT_MS = 15000;
const MAX_SUBMISSIONS_PER_SESSION = 5;

const TRANSACTIONAL_SMS_CONSENT_TEXT =
  "I agree to receive appointment confirmations, reminders, and service updates by text. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. View the business Terms and Privacy Policy.";
const MARKETING_SMS_CONSENT_TEXT =
  "I agree to receive promotional text offers and service specials. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase. View the business Terms and Privacy Policy.";
const MARKETING_EMAIL_CONSENT_TEXT =
  "Email me maintenance reminders, offers, and updates. I can unsubscribe from marketing emails at any time.";

function generateCorrelationId() {
  try {
    return crypto.randomUUID();
  } catch {
    return `booking-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SubmitDeps {
  business: {
    user_id: string;
    business_name: string | null;
    currency: string | null;
    payment_provider: string | null;
    /** ⚡ Security: boolean only — stripe_account_id is never exposed to the client */
    stripe_charges_enabled: boolean;
    square_charges_enabled: boolean;
    square_merchant_id: string | null;
    require_approval: boolean;
  } | null;
  slug: string | undefined;
  bookingState: BookingState;
  dispatch: React.Dispatch<BookingAction>;
  storageKey: string;
  bookingRequirements: BookingRequirement[];
  getVehicleBookingRequirements?: (vehicle: VehicleData) => BookingRequirement[];
  // Pricing callbacks
  getOilPriceAdjustment: () => Dollars;
  getOilPriceBreakdown: () => { extraQuarts: number; pricePerQuart: Dollars; total: Dollars };
  getTotalDuration: () => number;
  getPreTaxTotal: () => Dollars;
  getGrandTotal: () => Dollars;
  getDetailingAdjustment: () => number;
  // Slot refresh
  fetchBookedSlots: (date: Date) => Promise<void>;
  // Weather Guard validation (defense in depth)
  isWeatherBlocked?: (slotTime: string, slotDurationMinutes?: number) => { blocked: boolean; reasons: string[] };
  /** Coordinates + flag used to perform a server-trusted pre-flight weather check
   * (via the `weather-guard-check-slot` edge function) before booking. */
  weatherGuardContext?: {
    enabled: boolean;
    lat: number | null;
    lng: number | null;
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookingSubmit(deps: SubmitDeps) {
  const {
    business,
    slug,
    bookingState,
    dispatch,
    storageKey,
    bookingRequirements,
    getVehicleBookingRequirements,
    getOilPriceBreakdown,
    getTotalDuration,
    getPreTaxTotal,
    getGrandTotal,
    getDetailingAdjustment,
    fetchBookedSlots,
    isWeatherBlocked,
    weatherGuardContext,
  } = deps;

  // Destructure state for readability
  const {
    customerAddress, addressLine2, city, state, zipCode,
    customerCoords, bookingContextId,
    vehicles, selectedServices, selectedPackage, vehicleServiceSelections,
    selectedDate, selectedTime,
    guestName, guestEmail, guestPhone, notes,
    paymentChoice, transactionalSmsConsent, marketingSmsConsent, marketingEmailConsent,
    lastSubmissionTime, submissionCount,
    taxData,
    selectedRewardInstanceId,
  } = bookingState;

  /**
   * Server-trusted weather check. Hits the `weather-guard-check-slot` edge
   * function which evaluates the same risk engine as Weather Guard
   * automation. Returns `true` if the booking should be blocked.
   *
   * Defense in depth: even if the customer bypasses the UI guard (stale
   * tab, cached forecast, direct API call), this re-evaluation against
   * the live Open-Meteo forecast at submit time prevents the booking.
   */
  const enforceWeatherGuard = useCallback(async (): Promise<boolean> => {
    if (!weatherGuardContext?.enabled) return false;
    if (!selectedDate || !selectedTime) return false;
    const { lat, lng } = weatherGuardContext;
    if (lat == null || lng == null) return false;
    try {
      const [hh, mm] = selectedTime.split(":").map((n) => parseInt(n, 10));
      const start = new Date(selectedDate);
      start.setHours(Number.isNaN(hh) ? 0 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
      const duration = Math.max(15, getTotalDuration() || 60);
      const end = new Date(start.getTime() + duration * 60_000);
      const decision = await checkSlotRisk({
        businessUserId: business?.user_id,
        lat,
        lng,
        start: start.toISOString(),
        end: end.toISOString(),
        scope: "outdoor",
      });
      if (decision.decision === "BLOCK") {
        toast.error(
          decision.message ||
            "This time is unavailable due to forecasted weather. Please pick a different slot.",
        );
        return true;
      }
    } catch (err) {
      console.warn("[WeatherGuard] Pre-flight check failed; falling back to local guard:", err);
    }
    return false;
  }, [business?.user_id, weatherGuardContext, selectedDate, selectedTime, getTotalDuration]);

  const validateVehicleRequirements = useCallback((): boolean => {
    if (
      !vehicles.length ||
        !vehicles.every((vehicle) =>
        vehicleMeetsBookingRequirements(vehicle, getVehicleBookingRequirements?.(vehicle) || bookingRequirements),
      )
    ) {
      toast.error("Please complete all required vehicle and service details");
      return false;
    }
    return true;
  }, [bookingRequirements, vehicles]);

  // ── Pay Now (redirect to Stripe/Square checkout) ────────────────────────
  const handlePayNow = useCallback(async () => {
    if (!business) {
      toast.error("Business information not loaded");
      return;
    }
    if (!business.user_id) {
      console.error("[SECURITY] Missing tenant context (business.user_id)");
      toast.error("Booking session invalid. Please refresh and try again.");
      return;
    }

    // SECURITY: fail-closed provider resolution (never silently fall back to Stripe)
    const provider: "stripe" | "square" | "none" =
      business.payment_provider === "square"
        ? "square"
        : business.payment_provider === "stripe"
          ? "stripe"
          : "none";

    // ⚡ The RPC already computes stripe_charges_enabled as (enabled AND account_id IS NOT NULL)
    const paymentsEnabled =
      provider === "square"
        ? business.square_charges_enabled && !!business.square_merchant_id
        : provider === "stripe"
          ? business.stripe_charges_enabled
          : false;

    if (!paymentsEnabled) {
      console.error(`[SECURITY] Payment provider '${provider}' not connected or enabled`);
      dispatch({
        type: "SET_CHECKOUT_ERROR",
        error: {
          type: "provider_not_enabled" as CheckoutErrorType,
          message: "Online payments are not yet enabled for this business. Please choose \"Pay at Time of Service\" instead.",
        },
      });
      return;
    }

    if (!guestEmail || !guestName) {
      toast.error("Please fill in your contact information first");
      return;
    }
    if (!selectedServices.length && !selectedPackage) {
      toast.error("Please select at least one service");
      return;
    }
    if (!validateVehicleRequirements()) return;
    if (selectedTime) {
      const weather = isWeatherBlocked?.(selectedTime, getTotalDuration() || undefined);
      if (weather?.blocked) {
        toast.error(`Selected time is blocked due to weather: ${weather.reasons.join(", ")}`);
        return;
      }
    }
    // Server-trusted weather pre-flight (defense in depth)
    if (await enforceWeatherGuard()) return;

    dispatch({ type: "SET_PROCESSING_PAYMENT", processing: true });
    dispatch({ type: "SET_CHECKOUT_ERROR", error: null });

    const serviceCatalogIds = Object.values(vehicleServiceSelections).flatMap((selection) => selection.package ? selection.package.services.map((service) => service.id) : selection.services.map((service) => service.id));

    const origin = typeof window !== "undefined" ? window.location.origin : "";
    const activeProvider =
      business.payment_provider === "square"
        ? "square"
        : business.payment_provider === "stripe"
          ? "stripe"
          : null;

    if (!activeProvider) {
      dispatch({
        type: "SET_CHECKOUT_ERROR",
        error: {
          type: "provider_not_enabled" as CheckoutErrorType,
          message: "Online payments are not available for this business. Please choose \"Pay at Time of Service\" instead.",
        },
      });
      dispatch({ type: "SET_PROCESSING_PAYMENT", processing: false });
      return;
    }

    const oilBreakdown = getOilPriceBreakdown();
    const bookingConfiguration = buildAppointmentBookingConfiguration(vehicles, vehicleServiceSelections);
    trackCheckoutStarted({
      organization_id: business.user_id,
      amount_cents: Math.round((getGrandTotal() ?? 0) * 100),
      currency: (business.currency ?? "usd").toLowerCase(),
      provider: activeProvider,
      service_count: serviceCatalogIds.length,
    });
    const result = await startCheckout({
      tenantId: business.user_id,
      paymentProvider: activeProvider,
      serviceCatalogIds,
      customerEmail: guestEmail,
      customerName: guestName,
      customerPhone: normalizePhoneToE164(guestPhone) || guestPhone || undefined,
      bookingSource: resolveBookingSource(),
      oilPriceAdjustment: oilBreakdown.total,
      oilExtraQuarts: oilBreakdown.extraQuarts,
      oilPricePerQuart: oilBreakdown.pricePerQuart,
      appointmentData: {
        scheduledDate: selectedDate ? format(selectedDate, "yyyy-MM-dd") : "",
        scheduledTime: selectedTime,
        dropOffOption: "drop-off" as const,
        customerAddress: [customerAddress, addressLine2, city, state, zipCode].filter(Boolean).join(", "),
        vehicles: vehicles.map((v) => ({
          year: v.year,
          make: v.make,
          model: v.model,
          licensePlate: v.licensePlate,
          vin: v.vin,
          mileage: v.mileage,
        })),
        bookingConfiguration,
        vehicleServiceAssignments: Object.fromEntries(Object.entries(vehicleServiceSelections).map(([vehicleId, selection]) => [vehicleId, { serviceCatalogIds: selection.package ? selection.package.services.map((service) => service.id) : selection.services.map((service) => service.id), packageId: selection.package?.id || null }])),
        tireItems: bookingConfiguration.vehicles.flatMap((vehicle) => vehicle.tire?.inventoryItemId ? [{ inventoryItemId: vehicle.tire.inventoryItemId, quantity: vehicle.tire.frontQuantity + vehicle.tire.rearQuantity }] : []),
        notes: notes || undefined,
        consent: {
          transactionalSmsConsent,
          marketingSmsConsent,
          marketingEmailConsent,
          consentTexts: {
            transactionalSms: TRANSACTIONAL_SMS_CONSENT_TEXT,
            marketingSms: MARKETING_SMS_CONSENT_TEXT,
            marketingEmail: MARKETING_EMAIL_CONSENT_TEXT,
          },
        },
      },
      successUrl: `${origin}/booking-success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${origin}?payment=cancelled`,
    });

    if (result.success && result.redirectUrl) {
      if (typeof window !== "undefined") {
        window.location.href = result.redirectUrl;
      }
    } else if (result.error) {
      const errorTypeMap: Record<string, CheckoutErrorType> = {
        tenant_not_found: "unknown",
        payment_provider_not_enabled: "provider_not_enabled",
        validation_error: "unknown",
        rate_limited: "rate_limit",
        network_error: "network_error",
        unknown: "unknown",
      };
      dispatch({
        type: "SET_CHECKOUT_ERROR",
        error: { type: errorTypeMap[result.error.type] || "unknown", message: result.error.message },
      });
    }

    dispatch({ type: "SET_PROCESSING_PAYMENT", processing: false });
  }, [
    business, guestEmail, guestName, guestPhone, selectedServices, selectedPackage, vehicleServiceSelections, getVehicleBookingRequirements,
    selectedDate, selectedTime, customerAddress, addressLine2, city, state, zipCode,
    vehicles, notes, transactionalSmsConsent, marketingSmsConsent, marketingEmailConsent, getOilPriceBreakdown, getTotalDuration, getGrandTotal,
    dispatch, isWeatherBlocked, enforceWeatherGuard, validateVehicleRequirements,
  ]);

  // ── Pay Later (book directly) ──────────────────────────────────────────
  const handleSubmit = useCallback(async () => {
    const correlationId = generateCorrelationId();
    // Name exactly what is missing. This gate covers upstream steps (service /
    // date / time), never the contact fields the customer is looking at, so a
    // generic "complete all required fields" message sent people hunting in the
    // wrong place.
    if (!business) {
      toast.error("Booking session invalid. Please refresh and try again.");
      return;
    }
    const missing: string[] = [];
    if (!selectedServices.length && !selectedPackage) missing.push("a service");
    if (!selectedDate) missing.push("a date");
    if (!selectedTime) missing.push("an arrival window");
    if (missing.length) {
      toast.error(`Please go back and select ${missing.join(" and ")}.`);
      return;
    }

    if (!validateVehicleRequirements()) return;
    if (submissionCount >= MAX_SUBMISSIONS_PER_SESSION) {
      const message = "Too many successful bookings in this session. Please refresh before booking again.";
      toast.error(message);
      dispatch({
        type: "SET_CHECKOUT_ERROR",
        error: { type: "rate_limit" as CheckoutErrorType, message },
      });
      return;
    }
    const now = Date.now();
    if (now - lastSubmissionTime < RATE_LIMIT_MS) {
      const remaining = Math.ceil((RATE_LIMIT_MS - (now - lastSubmissionTime)) / 1000);
      const message = `Please wait ${remaining} seconds before submitting another booking`;
      toast.error(message);
      dispatch({
        type: "SET_CHECKOUT_ERROR",
        error: { type: "rate_limit" as CheckoutErrorType, message },
      });
      return;
    }
    const weather = isWeatherBlocked?.(selectedTime, getTotalDuration() || undefined);
    if (weather?.blocked) {
      toast.error(`Selected time is blocked due to weather: ${weather.reasons.join(", ")}`);
      return;
    }
    // Server-trusted weather pre-flight (defense in depth)
    if (await enforceWeatherGuard()) return;

    const validationResult = bookingSchema.safeParse({
      name: guestName.trim(),
      email: guestEmail.trim(),
      phone: normalizePhoneToE164(guestPhone.trim()) || guestPhone.trim() || undefined,
    });
    if (!validationResult.success) {
      toast.error(getFirstError(validationResult) || "Validation error");
      return;
    }

    dispatch({ type: "SET_SUBMITTING", submitting: true });
    dispatch({ type: "SET_CHECKOUT_ERROR", error: null });

    try {
      const fullAddress = [customerAddress, addressLine2, city, state, zipCode].filter(Boolean).join(", ");

      // Upsert customer
      let customerId: string | null = null;
      try {
        const { data: upsertedId, error: upsertError } = await upsertBookingCustomer({
          p_booking_slug: slug || "",
          p_email: validationResult.data.email,
          p_name: validationResult.data.name,
          p_phone: validationResult.data.phone || null,
          p_address: fullAddress || null,
        });
        if (upsertError) {
          console.error("Customer upsert error:", upsertError);
          const { data: existing } = await findCustomerByEmail(
            business.user_id,
            validationResult.data.email,
          );
          customerId = existing?.id || null;
        } else {
          customerId = upsertedId;
        }
      } catch (err) {
        console.error("Customer upsert failed:", err);
      }

      // Consent is persisted after the appointment exists (see below): the edge
      // function binds guest consent to the freshly created appointment.

      // Create vehicles
      const vehicleIds: string[] = [];
      for (const vehicle of vehicles) {
        if (!vehicle.year || !vehicle.make || !vehicle.model) continue;
        try {
          const { data: vehicleId, error: vehicleError } = await upsertBookingVehicle({
            p_booking_slug: slug || "",
            p_customer_email: validationResult.data.email,
            p_year: parseInt(vehicle.year),
            p_make: vehicle.make,
            p_model: vehicle.model,
            p_license_plate: vehicle.licensePlate || null,
            p_vin: vehicle.vin || null,
            p_mileage: vehicle.mileage ? parseInt(vehicle.mileage) : null,
            p_oil_type: vehicle.oilType || null,
            p_oil_capacity: vehicle.oilCapacity || null,
            p_image_url: vehicle.imageUrl || null,
            p_engine: vehicle.engine || null,
          });
          if (!vehicleError && vehicleId) {
            vehicleIds.push(vehicleId);
            // Tire vertical: persist the confirmed wheel/tire size (OE or override)
            // so the appointment carries the tire spec, not oil data.
            if (vehicle.tireSize) {
              const { error: tireError } = await setVehicleTireSpec({
                p_booking_slug: slug || "",
                p_customer_email: validationResult.data.email,
                p_vehicle_id: vehicleId,
                p_tire_size: vehicle.tireSize,
                p_tire_size_source: vehicle.tireSizeSource ?? "manual",
              });
              if (tireError) console.warn("[Booking] Tire spec save failed:", tireError);
            }
          } else if (vehicleError) console.error("Vehicle upsert error:", vehicleError);
        } catch (err) {
          console.error("Vehicle creation failed:", err);
        }
      }


      const validVehicles = vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model);
      const persistedVehicleIdsByClientId = Object.fromEntries(validVehicles.map((vehicle, index) => [vehicle.id, vehicleIds[index] || null]));

      // Build description with a stable vehicle-to-service grouping for staff notifications.
      const serviceNames = validVehicles.map((vehicle) => {
        const selection = vehicleServiceSelections[vehicle.id];
        const services = selection?.package ? `Package: ${selection.package.name} (${selection.package.services.map((service) => service.name).join(", ")})` : (selection?.services || []).map((service) => service.name).join(", ");
        return `${vehicle.year} ${vehicle.make} ${vehicle.model}: ${services || "No service selected"}`;
      }).join("; ");
      const vehicleInfoList = validVehicles
        .map((v) => `${v.year} ${v.make} ${v.model}${v.licensePlate ? ` (${v.licensePlate})` : ""}`)
        .join("; ");
      const baseDescription = `Vehicles: ${vehicleInfoList}\nServices: ${serviceNames}\nPayment: ${paymentChoice === "pay_now" ? "Paid Online" : "Pay at Service"}`;

      // Resolve the filter fitment for the selected vehicle(s) and attach it to the
      // job so the technician has the part numbers without looking them up.
      // Non-blocking: a lookup failure never breaks the booking.
      let filterMatches: VehicleFilterMatch[] = [];
      try {
        filterMatches = await resolveBookingFilterMatch({
          vehicles: vehicles.filter((v) => v.year && v.make && v.model),
          serviceNames: Object.values(vehicleServiceSelections).flatMap((selection) => selection.package ? selection.package.services.map((service) => service.name) : selection.services.map((service) => service.name)),
        });
      } catch (e) {
        console.warn("[Booking] Filter match resolution failed:", e);
      }
      const { description, dispatchNotes: filterMatchNote } = buildFilterMatchJobContext({
        baseDescription,
        matches: filterMatches,
      });


      // Geocode if needed
      let geocodedCoords: { lat: number; lng: number } | null = null;
      if (!customerCoords && fullAddress.trim() && MAPBOX_ACCESS_TOKEN) {
        try {
          const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
          const geores = await fetch(geocodeUrl);
          if (geores.ok) {
            const geo = await geores.json();
            const coords = geo?.features?.[0]?.center;
            if (coords?.length >= 2) {
              geocodedCoords = { lat: coords[1], lng: coords[0] };
              dispatch({ type: "SET_CUSTOMER_COORDS", coords: geocodedCoords });
            }
          }
        } catch (e) {
          console.warn("Geocode failed during submit", e);
        }
      }

      let rewardDiscountCents = 0;
      let rewardReserved = false;

      // Book appointment (atomic RPC)
      const { data: appointmentId, error: appointmentError } = await bookAppointmentSafe({
        p_booking_slug: slug || "",
        p_scheduled_date: format(selectedDate, "yyyy-MM-dd"),
        p_scheduled_time: selectedTime,
        p_duration_minutes: getTotalDuration(),
        p_title: serviceNames,
        p_guest_name: validationResult.data.name,
        p_guest_email: validationResult.data.email,
        p_guest_phone: validationResult.data.phone || null,
        p_description: description,
        p_notes: notes.trim() || null,
        p_estimated_cost: getGrandTotal(),
        p_tax_amount: taxData?.tax_amount || 0,
        p_service_catalog_id: selectedPackage?.services[0]?.id || selectedServices[0]?.id || null,
        p_vehicle_id: vehicleIds[0] || null,
        p_status: business.require_approval || vehicles.some((vehicle)=>vehicle.detailingQuoteRequired) ? "pending" : "confirmed",
      });

      if (appointmentId && !appointmentError) {
        const { error: configurationError } = await saveAppointmentBookingConfiguration(
          appointmentId,
          slug || "",
          buildAppointmentBookingConfiguration(vehicles, vehicleServiceSelections),
        );
        if (configurationError) throw new Error(`Could not save vehicle service configuration: ${configurationError.message}`);
        for (const configuredVehicle of buildAppointmentBookingConfiguration(vehicles, vehicleServiceSelections).vehicles) {
          const tire = configuredVehicle.tire;
          if (!tire?.inventoryItemId) continue;
          const { error: reserveError } = await reserveTireInventoryForAppointment(appointmentId,business.user_id,tire.inventoryItemId,tire.frontQuantity+tire.rearQuantity);
          if (reserveError) throw new Error(`Selected tire inventory is no longer available: ${reserveError.message}`);
        }
      }

      if (appointmentError) {
        const message = appointmentError.message || "";
        if (message.includes("DATE_BLOCKED")) {
          toast.error("That time is outside the provider's current booking hours or advance-booking window. Please choose another time.");
          dispatch({ type: "SET_STEP", step: 4 });
          return;
        }
        if (message.includes("WEATHER_BLOCKED") || message.includes("WEATHER_UNVERIFIED")) {
          toast.error(
            message.includes("WEATHER_UNVERIFIED")
              ? "Weather Guard could not verify that appointment time. Please refresh and choose another slot."
              : "That appointment time is unavailable due to Weather Guard. Please choose another date or time.",
          );
          dispatch({ type: "SET_STEP", step: 4 });
          return;
        }
        if (appointmentError.message?.includes("SLOT_UNAVAILABLE")) {
          toast.error("This time slot was just booked by another customer. Please select a different time.");
          if (selectedDate) fetchBookedSlots(selectedDate);
          dispatch({ type: "SET_STEP", step: 4 });
          return;
        }
        // Backend plumbing faults (missing grant, missing function, schema drift)
        // must never surface raw SQL text to a customer.
        const code = (appointmentError as { code?: string }).code || "";
        if (
          /permission denied/i.test(message) ||
          /does not exist/i.test(message) ||
          code === "42501" ||
          code === "42883" ||
          code === "PGRST202"
        ) {
          console.error("[booking] backend rejected secure public booking RPC", { code, message, correlationId });
          const friendly =
            "This shop's booking service is temporarily unavailable. Nothing was charged — please try again shortly or call the shop.";
          toast.error(friendly);
          dispatch({
            type: "SET_CHECKOUT_ERROR",
            error: { type: "unknown" as CheckoutErrorType, message: friendly },
          });
          return;
        }
        throw appointmentError;

      }

      if (appointmentId) {
        trackAppointmentCreated({
          appointment_id: String(appointmentId),
          organization_id: business.user_id,
          source: resolveBookingSource(),
          service_count: (selectedPackage?.services.length ?? selectedServices.length) || 0,
          amount_cents: Math.round((getGrandTotal() ?? 0) * 100),
          payment_choice: paymentChoice,
          status: business.require_approval ? "pending" : "confirmed",
          vehicle_count: vehicles.length,
        });
      }

      if (appointmentId && selectedRewardInstanceId) {
        try {
          const reserveResult = await reserveBookingReward({
            rewardInstanceId: selectedRewardInstanceId,
            appointmentId,
            providerId: business.user_id,
            customerEmail: validationResult.data.email,
            idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:reserve`,
            reservationMinutes: 30,
          });
          rewardReserved = reserveResult.status === "reserved";
          if (rewardReserved) {
            const applyResult = await applyBookingReward({
              rewardInstanceId: selectedRewardInstanceId,
              appointmentId,
              subtotalCents: dollarsToCents(toDollars(getPreTaxTotal())),
              taxCents: taxData ? dollarsToCents(toDollars(taxData.tax_amount)) : 0,
              idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:apply`,
            });
            rewardDiscountCents = Math.max(Number(applyResult.discount_cents || 0), 0);
          } else {
            toast.warning("Selected reward could not be reserved and was not applied to this booking.");
          }
        } catch (rewardError) {
          console.warn("[Booking] Reward reservation/application failed:", rewardError);
          toast.warning("Selected reward could not be applied. Your booking will continue without the reward discount.");
        }
      }

      // Post-booking: link customer, assign through dispatch boundary, set location
      let assignedVanId: string | null = null;
      if (appointmentId) {
        const updatePayload: Record<string, unknown> = {};
        if (customerId) updatePayload.customer_id = customerId;
        if (filterMatchNote) updatePayload.dispatch_notes = filterMatchNote;

        if (zipCode) {
          try {
            // Single server-side dispatch boundary for public bookings: works for
            // guests (anon) and signed-in customers alike.
            const dispatchResult = await autoDispatchPublicBooking({
              businessUserId: business.user_id,
              appointmentId,
              zipCode,
              notes: filterMatchNote ?? null,
            });
            if (!dispatchResult.assigned) {
              console.info("[Booking] Auto-dispatch skipped:", dispatchResult.reason);
            }
          } catch (e) {
            console.warn("Van auto-assignment failed:", e);
          }
        }

        if (fullAddress) updatePayload.location_address = fullAddress;
        const finalCoords = customerCoords || geocodedCoords;
        if (finalCoords) {
          updatePayload.location_lat = finalCoords.lat;
          updatePayload.location_lng = finalCoords.lng;
        }

        if (Object.keys(updatePayload).length > 0) {
          try {
            await updateBookingAppointment(appointmentId, updatePayload);
          } catch (e) {
            console.warn("Failed to update appointment:", e);
          }
        }
      }

      // Reserve inventory tied to this appointment (van-first, warehouse-fallback).
      // Two-track: (1) oil based on vehicle specs, (2) every part linked to the
      // booked services (filters, additives, etc.) via service_catalog_parts.
      // Non-blocking: failures are logged but never break the booking.
      if (appointmentId) {
        for (const vehicle of validVehicles) {
          const persistedVehicleId = persistedVehicleIdsByClientId[vehicle.id];
          if (!persistedVehicleId) continue;
          try {
            const reservation = await reserveOilForBooking({ appointmentId, businessUserId: business.user_id, vehicleId: persistedVehicleId, vanId: assignedVanId });
            if (reservation.shortage > 0) console.warn("[Booking] Oil reservation shortage:", reservation);
            else if (!reservation.skipped) console.info("[Booking] Reserved oil:", reservation);
          } catch (e) {
            console.warn("[Booking] Oil reservation failed:", e);
          }
        }
      }

      if (appointmentId) {
        try {
          for (const vehicle of validVehicles) {
            const selection = vehicleServiceSelections[vehicle.id];
            const catalogIds = (selection?.package ? selection.package.services.map((service) => service.id) : (selection?.services || []).map((service) => service.id)).filter((id): id is string => !!id);
            if (!catalogIds.length) continue;
            const partsRes = await reserveServicePartsForBooking({ appointmentId, businessUserId: business.user_id, vehicleId: persistedVehicleIdsByClientId[vehicle.id] ?? null, vanId: assignedVanId, serviceCatalogIds: catalogIds });
            const shortages = partsRes.reservations.filter((r) => r.shortage > 0);
            if (shortages.length) console.warn("[Booking] Parts reservation shortages:", shortages);
            if (partsRes.reservations.length) console.info("[Booking] Reserved parts:", partsRes.reservations.map((r) => `${r.itemName} ×${r.quantity}${r.unit ?? ""} (${r.source})`));
          }
        } catch (e) {
          console.warn("[Booking] Parts reservation failed:", e);
        }
      }

      // Create appointment_services line items
      if (appointmentId) {
        const serviceItems = Object.entries(vehicleServiceSelections).flatMap(([clientVehicleId, selection]) => {
          const vehicleId = persistedVehicleIdsByClientId[clientVehicleId] ?? null;
          return selection.package ? selection.package.services.map((service) => ({ vehicle_id: vehicleId, service_catalog_id: service.id || null, name: service.name, price: service.price, quantity: service.quantity || 1, is_prepaid: paymentChoice === "pay_now" })) : selection.services.map((service) => ({ vehicle_id: vehicleId, service_catalog_id: service.id, name: service.name, price: service.default_price, quantity: 1, is_prepaid: paymentChoice === "pay_now" }));
        });

        // Auto-add additional oil quarts line item based on vehicle oil capacity.
        // Itemized so the customer sees N qt × $price (no opaque fractional total).
        const oilBreakdownItem = getOilPriceBreakdown();
        if (oilBreakdownItem.extraQuarts > 0 && oilBreakdownItem.pricePerQuart > 0) {
            serviceItems.push({
              vehicle_id: persistedVehicleIdsByClientId[vehicles.find((vehicle) => vehicle.oilCapacitySource === "db" || vehicle.oilCapacitySource === "ai" || vehicle.oilCapacitySource === "manual")?.id || ""] || null,
              service_catalog_id: null,
              name: "Additional Oil Quart",
            price: oilBreakdownItem.pricePerQuart,
            quantity: oilBreakdownItem.extraQuarts,
            is_prepaid: paymentChoice === "pay_now",
          });
        }
        for (const vehicle of vehicles) {
          if (!vehicle.tireInventoryItemId || !vehicle.tireInventoryName || !vehicle.tireUnitPrice) continue;
          serviceItems.push({ vehicle_id: persistedVehicleIdsByClientId[vehicle.id] || null, service_catalog_id:null, name:`Tire — ${vehicle.tireInventoryName}${vehicle.tireInventorySku?` (${vehicle.tireInventorySku})`:""}`, price:vehicle.tireUnitPrice, quantity:getRequestedTireQuantity(vehicle), is_prepaid:paymentChoice==="pay_now" });
        }
        for (const vehicle of validVehicles) {
          if (!vehicle.detailingVehicleSize || !vehicle.detailingCondition) continue;
          const adjustment = Math.max(0, vehicle.detailingFlatFee || 0) + Math.max(0, (vehicle.detailingPriceMultiplier || 1) - 1) * (vehicleServiceSelections[vehicle.id]?.services || []).reduce((sum, service) => sum + service.default_price, 0);
          if (adjustment > 0) serviceItems.push({ vehicle_id: persistedVehicleIdsByClientId[vehicle.id] || null, service_catalog_id:null, name:"Vehicle size & condition adjustment", price:adjustment, quantity:1, is_prepaid:paymentChoice==="pay_now" });
        }

        if (serviceItems.length > 0) {
          try {
            await insertBookingAppointmentServices(appointmentId, slug || "", serviceItems as BookingServiceItem[]);
          } catch (err) {
            console.warn("[Booking] Failed to create appointment_services:", err);
          }
        }
      }

      // Create payment record for pay-later
      if (paymentChoice === "pay_later" && appointmentId) {
        try {
          const { data: paymentRecord } = await insertBookingPaymentRecord({
            user_id: business.user_id,
            appointment_id: appointmentId,
            booking_slug: slug || "",
            amount: Math.max(dollarsToCents(toDollars(getGrandTotal())) - rewardDiscountCents, 0),
            subtotal: Math.max(dollarsToCents(toDollars(getPreTaxTotal())) - rewardDiscountCents, 0),
            tax_amount: taxData ? dollarsToCents(toDollars(taxData.tax_amount)) : 0,
            tax_rate: taxData?.tax_breakdown?.[0]?.rate || 0,
            currency: business.currency?.toLowerCase() || "usd",
            status: "pending",
            payment_type: "pay_at_service",
            customer_email: validationResult.data.email,
            customer_name: validationResult.data.name,
          });

          if (selectedRewardInstanceId && rewardDiscountCents > 0) {
            try {
              await applyBookingReward({
                rewardInstanceId: selectedRewardInstanceId,
                appointmentId,
                paymentRecordId: paymentRecord?.id ?? null,
                subtotalCents: dollarsToCents(toDollars(getPreTaxTotal())),
                taxCents: taxData ? dollarsToCents(toDollars(taxData.tax_amount)) : 0,
                idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:apply-payment`,
              });
              await redeemBookingReward({
                rewardInstanceId: selectedRewardInstanceId,
                appointmentId,
                paymentRecordId: paymentRecord?.id ?? null,
                idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:redeem`,
              });
            } catch (rewardFinalizeError) {
              console.warn("[Booking] Reward finalization failed:", rewardFinalizeError);
            }
          }

          requestAppointmentProviderSync({
            appointmentId,
            paymentRecordId: paymentRecord?.id ?? null,
            syncMode: "payment_pending",
            guestEmail: validationResult.data.email,
          }).catch((syncError) => {
            console.warn("[Booking] Provider sync failed:", syncError);
          });
        } catch {
          // Don't fail booking if payment record creation fails
          requestAppointmentProviderSync({
            appointmentId,
            syncMode: "appointment_created",
            guestEmail: validationResult.data.email,
          }).catch((syncError) => {
            console.warn("[Booking] Provider sync fallback failed:", syncError);
          });
        }
      } else if (appointmentId) {
        requestAppointmentProviderSync({
          appointmentId,
          syncMode: "appointment_created",
          guestEmail: validationResult.data.email,
        }).catch((syncError) => {
          console.warn("[Booking] Provider sync failed:", syncError);
        });
      }



      // Send the transactional confirmation before showing the success screen.
      // The appointment remains valid if the provider is temporarily unavailable,
      // but the UI must report the delivery state truthfully.
      dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "pending" });
      if (appointmentId && slug) {
        try {
          await nextApi.publicBooking.sendConfirmation(String(slug), {
            appointment_id: String(appointmentId),
            email: validationResult.data.email,
            phone: validationResult.data.phone || null,
            transactional_sms_consent: transactionalSmsConsent,
            marketing_sms_consent: marketingSmsConsent,
            marketing_email_consent: marketingEmailConsent,
            consent_texts: {
              transactional_sms: TRANSACTIONAL_SMS_CONSENT_TEXT,
              marketing_sms: MARKETING_SMS_CONSENT_TEXT,
              marketing_email: MARKETING_EMAIL_CONSENT_TEXT,
            },
          });
          dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "sent" });
        } catch (emailError) {
          console.error("[Booking] Confirmation email failed", { appointmentId, emailError });
          dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "failed" });
        }
      } else {
        dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "failed" });
      }

      // Complete booking context
      if (bookingContextId) {
        completeBookingContext(bookingContextId, {
          filter_matches: filterMatchContextPayload(filterMatches) as unknown as import("@/integrations/supabase/types").Json,
        }).catch(() => {});
      }


      // Clear persisted draft (both session + local for backward compat)
      try {
        sessionStorage.removeItem(storageKey);
        localStorage.removeItem(storageKey);
      } catch {
        // Best-effort cleanup; storage may be unavailable in private browsing.
      }

      dispatch({ type: "RECORD_SUBMISSION" });
      dispatch({ type: "BOOKING_SUCCESS" });
    } catch (error) {
      console.error("Booking error:", {
        correlationId,
        error,
        payload: {
          tenant: business?.user_id,
          slug,
          services: selectedServices.map((s) => s.id),
          packageId: selectedPackage?.id,
          date: selectedDate ? format(selectedDate, "yyyy-MM-dd") : null,
          time: selectedTime,
          paymentChoice,
          guestEmail,
        },
      });
      if (selectedRewardInstanceId) {
        cancelBookingReward({
          rewardInstanceId: selectedRewardInstanceId,
          reason: "booking_submit_error",
        }).catch((cancelError) => {
          console.warn("[Booking] Reward rollback failed:", cancelError);
        });
      }
      const parsedError = parseCheckoutError(error);
      dispatch({ type: "SET_CHECKOUT_ERROR", error: parsedError });
    } finally {
      dispatch({ type: "SET_SUBMITTING", submitting: false });
    }
  }, [
    business, slug, selectedServices, selectedPackage, vehicleServiceSelections, getVehicleBookingRequirements, selectedDate, selectedTime,
    vehicles, guestName, guestEmail, guestPhone, notes, paymentChoice,
    transactionalSmsConsent, marketingSmsConsent, marketingEmailConsent,
    customerAddress, addressLine2, city, state, zipCode, customerCoords,
    bookingContextId, submissionCount, lastSubmissionTime, taxData, selectedRewardInstanceId, storageKey,
    getTotalDuration, getGrandTotal, getPreTaxTotal, getOilPriceBreakdown, getDetailingAdjustment,
    fetchBookedSlots, dispatch, isWeatherBlocked, enforceWeatherGuard, validateVehicleRequirements,
  ]);

  // ── Account creation ────────────────────────────────────────────────────
  const handleCreateAccount = useCallback(
    async (data: { email: string; password: string; name: string; phone?: string }) => {
      if (!business) throw new Error("Business not loaded");

      const { data: signupData, error: signupError } = await signUpBookingUser(
        data.email,
        data.password,
        data.name,
        data.phone,
      );

      if (signupError) {
        if (signupError.message.includes("already registered")) {
          throw new Error("This email is already registered. Please sign in instead.");
        }
        throw signupError;
      }

      if (signupData.user) {
        await createCustomerAccount({
          p_user_id: signupData.user.id,
          p_email: data.email,
          p_full_name: data.name,
          p_phone: data.phone || null,
          p_provider_id: business.user_id,
        });
        toast.success("Account created! You can view your bookings after confirming your email.");
      }

      dispatch({ type: "SET_GUEST_FIELD", field: "guestName", value: data.name });
      dispatch({ type: "SET_GUEST_FIELD", field: "guestEmail", value: data.email });
      if (data.phone) dispatch({ type: "SET_GUEST_FIELD", field: "guestPhone", value: data.phone });
      dispatch({ type: "SET_EMAIL_VERIFIED", verified: true });
    },
    [business, dispatch],
  );

  return { handlePayNow, handleSubmit, handleCreateAccount } as const;
}
