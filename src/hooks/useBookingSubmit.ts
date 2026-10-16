/**
 * useBookingSubmit
 *
 * Public booking has one durable write boundary: commitPublicBooking().
 * Everything after that call is a side effect and must never determine whether
 * the booking exists.
 */
import { useCallback } from "react";
import { format } from "date-fns";
import { toast } from "@/components/ui/sonner";
import { resolveBookingSource } from "@/lib/attribution";
import { normalizePhoneToE164 } from "@/lib/phone";
import { bookingSchema, getFirstError } from "@/lib/validation";
import { parseCheckoutError } from "@/components/booking/checkoutErrors.utils";
import type { CheckoutErrorType } from "@/components/booking/CheckoutErrors";
import type { BookingAction, BookingState } from "@/hooks/useBookingState";
import type { Dollars } from "@/lib/money";
import { dollarsToCents, toDollars } from "@/lib/financialMath";
import { vehicleMeetsBookingRequirements } from "@/lib/booking-requirements";
import type { BookingRequirement } from "@/lib/service-category-policy";
import type { VehicleData } from "@/components/booking/VehicleEntry";
import { getRequestedTireQuantity } from "@/lib/tire-quantity";
import { buildAppointmentBookingConfiguration } from "@/lib/booking-configuration";
import {
  commitPublicBooking,
  type PublicBookingCommitService,
  type PublicBookingPaymentChoice,
} from "@/application/commands/public-booking-commit.command";
import {
  signUpBookingUser,
  createCustomerAccount,
  reserveBookingReward,
  applyBookingReward,
  redeemBookingReward,
  cancelBookingReward,
} from "@/application/commands/booking-submit.command";
import { reserveOilForBooking, reserveServicePartsForBooking } from "@/application/commands/booking-inventory.command";
import { autoDispatchPublicBooking } from "@/application/commands";
import { requestAppointmentProviderSync } from "@/application/commands/provider-sync.command";
import { completeBookingContext } from "@/application/commands/booking-context.command";
import { checkSlotRisk } from "@/application/queries/weather-guard.query";
import {
  resolveBookingFilterMatch,
  buildFilterMatchJobContext,
  filterMatchContextPayload,
  type VehicleFilterMatch,
} from "@/lib/bookingFilterMatch";
import { nextApi } from "@/lib/nextApiClient";
import { trackAppointmentCreated, trackCheckoutStarted } from "@/lib/posthog/analytics";

const RATE_LIMIT_MS = 15_000;
const MAX_SUBMISSIONS_PER_SESSION = 5;

const TRANSACTIONAL_SMS_CONSENT_TEXT =
  "I agree to receive appointment confirmations, reminders, and service updates by text. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. View the business Terms and Privacy Policy.";
const MARKETING_SMS_CONSENT_TEXT =
  "I agree to receive promotional text offers and service specials. Message frequency varies. Msg & data rates may apply. Reply STOP to opt out, HELP for help. Consent is not a condition of purchase. View the business Terms and Privacy Policy.";
const MARKETING_EMAIL_CONSENT_TEXT =
  "Email me maintenance reminders, offers, and updates. I can unsubscribe from marketing emails at any time.";

export interface SubmitDeps {
  business: {
    user_id: string;
    business_name: string | null;
    currency: string | null;
    payment_provider: string | null;
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
  getOilPriceAdjustment: () => Dollars;
  getOilPriceBreakdown: () => { extraQuarts: number; pricePerQuart: Dollars; total: Dollars };
  getTotalDuration: () => number;
  getPreTaxTotal: () => Dollars;
  getGrandTotal: () => Dollars;
  getDetailingAdjustment: () => number;
  fetchBookedSlots: (date: Date) => Promise<void>;
  isWeatherBlocked?: (slotTime: string, slotDurationMinutes?: number) => { blocked: boolean; reasons: string[] };
  weatherGuardContext?: {
    enabled: boolean;
    lat: number | null;
    lng: number | null;
  };
}

function newIdempotencyKey(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `booking-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function getOrCreateIdempotencyKey(storageKey: string): string {
  const key = `${storageKey}:commit-idempotency`;
  try {
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const created = newIdempotencyKey();
    sessionStorage.setItem(key, created);
    return created;
  } catch {
    return newIdempotencyKey();
  }
}

function clearIdempotencyKey(storageKey: string) {
  try {
    sessionStorage.removeItem(`${storageKey}:commit-idempotency`);
  } catch {
    // private browsing/storage failures are non-fatal after a committed booking
  }
}

function buildServiceItems(
  vehicles: VehicleData[],
  selections: BookingState["vehicleServiceSelections"],
  paymentChoice: PublicBookingPaymentChoice,
  pricePerQuart: number,
): PublicBookingCommitService[] {
  const items: PublicBookingCommitService[] = [];

  for (const vehicle of vehicles) {
    const selection = selections[vehicle.id];
    const selected = selection?.package?.services ?? selection?.services ?? [];
    for (const service of selected) {
      items.push({
        client_vehicle_id: vehicle.id,
        service_catalog_id: service.id || null,
        name: service.name,
        price: "price" in service ? service.price : service.default_price,
        quantity: "quantity" in service ? service.quantity || 1 : 1,
        is_prepaid: paymentChoice === "pay_now",
      });
    }

    const capacity = Number.parseFloat(String(vehicle.oilCapacity ?? ""));
    if (Number.isFinite(capacity) && capacity > 5 && pricePerQuart > 0) {
      items.push({
        client_vehicle_id: vehicle.id,
        service_catalog_id: null,
        name: "Additional Oil Quart",
        price: pricePerQuart,
        quantity: Math.ceil(capacity - 5),
        is_prepaid: paymentChoice === "pay_now",
      });
    }

    if (vehicle.tireInventoryItemId && vehicle.tireInventoryName && vehicle.tireUnitPrice) {
      items.push({
        client_vehicle_id: vehicle.id,
        service_catalog_id: null,
        name: `Tire — ${vehicle.tireInventoryName}${vehicle.tireInventorySku ? ` (${vehicle.tireInventorySku})` : ""}`,
        price: vehicle.tireUnitPrice,
        quantity: getRequestedTireQuantity(vehicle),
        is_prepaid: paymentChoice === "pay_now",
      });
    }

    if (vehicle.detailingVehicleSize && vehicle.detailingCondition) {
      const base = (selection?.services ?? []).reduce((sum, service) => sum + service.default_price, 0);
      const adjustment = Math.max(0, vehicle.detailingFlatFee || 0)
        + Math.max(0, (vehicle.detailingPriceMultiplier || 1) - 1) * base;
      if (adjustment > 0) {
        items.push({
          client_vehicle_id: vehicle.id,
          service_catalog_id: null,
          name: "Vehicle size & condition adjustment",
          price: adjustment,
          quantity: 1,
          is_prepaid: paymentChoice === "pay_now",
        });
      }
    }
  }

  return items;
}

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
    fetchBookedSlots,
    isWeatherBlocked,
    weatherGuardContext,
  } = deps;

  const {
    customerAddress, addressLine2, city, state, zipCode,
    customerCoords, bookingContextId,
    vehicles, selectedServices, selectedPackage, vehicleServiceSelections,
    selectedDate, selectedTime,
    guestName, guestEmail, guestPhone, notes,
    paymentChoice, transactionalSmsConsent, marketingSmsConsent, marketingEmailConsent,
    lastSubmissionTime, submissionCount, taxData, selectedRewardInstanceId,
  } = bookingState;

  const validateVehicleRequirements = useCallback((): boolean => {
    const valid = vehicles.length > 0 && vehicles.every((vehicle) =>
      vehicleMeetsBookingRequirements(
        vehicle,
        getVehicleBookingRequirements?.(vehicle) || bookingRequirements,
      ),
    );
    if (!valid) toast.error("Please complete all required vehicle and service details");
    return valid;
  }, [vehicles, getVehicleBookingRequirements, bookingRequirements]);

  const enforceWeatherGuard = useCallback(async (): Promise<boolean> => {
    if (!weatherGuardContext?.enabled || !selectedDate || !selectedTime) return false;
    const { lat, lng } = weatherGuardContext;
    if (lat == null || lng == null) return false;
    try {
      const [hh, mm] = selectedTime.split(":").map((n) => parseInt(n, 10));
      const start = new Date(selectedDate);
      start.setHours(Number.isNaN(hh) ? 0 : hh, Number.isNaN(mm) ? 0 : mm, 0, 0);
      const end = new Date(start.getTime() + Math.max(15, getTotalDuration() || 60) * 60_000);
      const decision = await checkSlotRisk({
        businessUserId: business?.user_id,
        lat,
        lng,
        start: start.toISOString(),
        end: end.toISOString(),
        scope: "outdoor",
      });
      if (decision.decision === "BLOCK") {
        toast.error(decision.message || "That time is unavailable due to forecasted weather.");
        return true;
      }
    } catch (error) {
      console.warn("[Booking] server weather preflight unavailable", error);
    }
    return false;
  }, [weatherGuardContext, selectedDate, selectedTime, getTotalDuration, business?.user_id]);

  const submitBooking = useCallback(async (choice: PublicBookingPaymentChoice) => {
    if (!business?.user_id || !slug || !selectedDate || !selectedTime) {
      toast.error("Booking session is incomplete. Please refresh and try again.");
      return;
    }
    if (submissionCount >= MAX_SUBMISSIONS_PER_SESSION) {
      toast.error("Too many booking attempts in this session. Please refresh the page.");
      return;
    }
    if (lastSubmissionTime && Date.now() - lastSubmissionTime < RATE_LIMIT_MS) {
      toast.error("Your last booking was just submitted. Please wait a moment before booking another appointment.");
      return;
    }
    if (!validateVehicleRequirements()) return;

    const localWeather = isWeatherBlocked?.(selectedTime, getTotalDuration() || undefined);
    if (localWeather?.blocked) {
      toast.error(`Selected time is blocked due to weather: ${localWeather.reasons.join(", ")}`);
      return;
    }
    if (await enforceWeatherGuard()) return;

    const contact = bookingSchema.safeParse({
      name: guestName.trim(),
      email: guestEmail.trim(),
      phone: normalizePhoneToE164(guestPhone.trim()) || guestPhone.trim() || undefined,
    });
    if (!contact.success) {
      toast.error(getFirstError(contact) || "Please correct your contact information.");
      return;
    }

    const fullAddress = [customerAddress, addressLine2, city, state, zipCode].filter(Boolean).join(", ").trim();
    if (!fullAddress) {
      toast.error("Please enter the service address.");
      return;
    }

    const oilBreakdown = getOilPriceBreakdown();
    const serviceItems = buildServiceItems(vehicles, vehicleServiceSelections, choice, oilBreakdown.pricePerQuart);
    if (!serviceItems.length) {
      toast.error("Please select at least one service.");
      return;
    }

    if (choice === "pay_now" && selectedRewardInstanceId) {
      toast.error("Please choose Pay at Service when using a reward so the discount is applied before payment.");
      return;
    }

    dispatch({ type: "SET_SUBMITTING", submitting: true });
    if (choice === "pay_now") dispatch({ type: "SET_PROCESSING_PAYMENT", processing: true });
    dispatch({ type: "SET_CHECKOUT_ERROR", error: null });

    const idempotencyKey = getOrCreateIdempotencyKey(storageKey);
    let filterMatches: VehicleFilterMatch[] = [];

    try {
      try {
        filterMatches = await resolveBookingFilterMatch({
          vehicles: vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model),
          serviceNames: serviceItems.map((item) => item.name),
        });
      } catch (error) {
        console.warn("[Booking] filter fitment lookup unavailable", error);
      }

      const vehicleSummary = vehicles
        .filter((vehicle) => vehicle.year && vehicle.make && vehicle.model)
        .map((vehicle) => `${vehicle.year} ${vehicle.make} ${vehicle.model}`)
        .join("; ");
      const serviceSummary = serviceItems
        .filter((item) => item.service_catalog_id)
        .map((item) => item.name)
        .join(", ");
      const { description, dispatchNotes } = buildFilterMatchJobContext({
        baseDescription: `Vehicles: ${vehicleSummary}\nServices: ${serviceSummary}\nPayment: ${choice === "pay_now" ? "Pay Online" : "Pay at Service"}`,
        matches: filterMatches,
      });

      if (choice === "pay_now") {
        trackCheckoutStarted({
          organization_id: business.user_id,
          amount_cents: Math.round((getGrandTotal() ?? 0) * 100),
          currency: (business.currency ?? "usd").toLowerCase(),
          provider: "stripe",
          service_count: serviceItems.filter((item) => item.service_catalog_id).length,
        });
      }

      const result = await commitPublicBooking({
        booking_slug: slug,
        idempotency_key: idempotencyKey,
        scheduled_date: format(selectedDate, "yyyy-MM-dd"),
        scheduled_time: selectedTime,
        duration_minutes: getTotalDuration(),
        title: serviceSummary || "Online booking",
        description,
        notes: notes.trim() || null,
        estimated_cost: getGrandTotal(),
        tax_amount: taxData?.tax_amount || 0,
        tax_rate: taxData?.tax_breakdown?.[0]?.rate || 0,
        currency: business.currency || "USD",
        payment_choice: choice,
        guest: {
          name: contact.data.name,
          email: contact.data.email,
          phone: contact.data.phone || guestPhone.trim(),
        },
        location: {
          address: fullAddress,
          lat: customerCoords?.lat ?? null,
          lng: customerCoords?.lng ?? null,
        },
        vehicles: vehicles.map((vehicle) => ({
          client_id: vehicle.id,
          year: vehicle.year,
          make: vehicle.make,
          model: vehicle.model,
          license_plate: vehicle.licensePlate || null,
          vin: vehicle.vin || null,
          mileage: vehicle.mileage || null,
          oil_type: vehicle.oilType || null,
          oil_capacity: vehicle.oilCapacity || null,
          image_url: vehicle.imageUrl || null,
          engine: vehicle.engine || null,
        })),
        services: serviceItems,
        configuration: buildAppointmentBookingConfiguration(vehicles, vehicleServiceSelections),
      });

      const appointmentId = result.appointment_id;
      const paymentId = result.payment_id;

      trackAppointmentCreated({
        appointment_id: appointmentId,
        organization_id: business.user_id,
        source: resolveBookingSource(),
        service_count: serviceItems.filter((item) => item.service_catalog_id).length,
        amount_cents: Math.round((getGrandTotal() ?? 0) * 100),
        payment_choice: choice,
        status: "confirmed",
        vehicle_count: vehicles.length,
      });

      // Reward is a post-commit financial adjustment for pay-at-service only.
      if (choice === "pay_later" && selectedRewardInstanceId) {
        try {
          const reserved = await reserveBookingReward({
            rewardInstanceId: selectedRewardInstanceId,
            appointmentId,
            providerId: business.user_id,
            customerEmail: contact.data.email,
            idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:reserve`,
            reservationMinutes: 30,
          });
          if (reserved.status === "reserved") {
            await applyBookingReward({
              rewardInstanceId: selectedRewardInstanceId,
              appointmentId,
              paymentRecordId: paymentId,
              subtotalCents: dollarsToCents(toDollars(getPreTaxTotal())),
              taxCents: taxData ? dollarsToCents(toDollars(taxData.tax_amount)) : 0,
              idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:apply`,
            });
            await redeemBookingReward({
              rewardInstanceId: selectedRewardInstanceId,
              appointmentId,
              paymentRecordId: paymentId,
              idempotencyKey: `booking:${appointmentId}:reward:${selectedRewardInstanceId}:redeem`,
            });
          } else {
            toast.warning("The reward could not be applied. The appointment is still confirmed.");
          }
        } catch (error) {
          console.warn("[Booking] reward adjustment failed", error);
          cancelBookingReward({ rewardInstanceId: selectedRewardInstanceId, reason: "booking_reward_adjustment_failed" }).catch(() => {});
          toast.warning("The reward could not be applied. The appointment is still confirmed.");
        }
      }

      // Non-critical operational side effects. None may invalidate the booking.
      if (zipCode) {
        autoDispatchPublicBooking({
          businessUserId: business.user_id,
          appointmentId,
          zipCode,
          notes: dispatchNotes ?? null,
        }).catch((error) => console.warn("[Booking] auto-dispatch failed", error));
      }

      for (const vehicle of vehicles) {
        const persistedVehicleId = result.vehicle_ids?.[vehicle.id];
        if (!persistedVehicleId) continue;
        reserveOilForBooking({
          appointmentId,
          businessUserId: business.user_id,
          vehicleId: persistedVehicleId,
          vanId: null,
        }).catch((error) => console.warn("[Booking] oil reservation failed", error));

        const selection = vehicleServiceSelections[vehicle.id];
        const catalogIds = (selection?.package?.services ?? selection?.services ?? [])
          .map((service) => service.id)
          .filter(Boolean);
        if (catalogIds.length) {
          reserveServicePartsForBooking({
            appointmentId,
            businessUserId: business.user_id,
            vehicleId: persistedVehicleId,
            vanId: null,
            serviceCatalogIds: catalogIds,
          }).catch((error) => console.warn("[Booking] parts reservation failed", error));
        }
      }

      requestAppointmentProviderSync({
        appointmentId,
        paymentRecordId: paymentId,
        syncMode: "payment_pending",
        guestEmail: contact.data.email,
      }).catch((error) => console.warn("[Booking] provider sync failed", error));

      dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "pending" });
      try {
        const confirmation = await nextApi.publicBooking.sendConfirmation(slug, {
          appointment_id: appointmentId,
          email: contact.data.email,
          phone: contact.data.phone || null,
          transactional_sms_consent: transactionalSmsConsent,
          marketing_sms_consent: marketingSmsConsent,
          marketing_email_consent: marketingEmailConsent,
          consent_texts: {
            transactional_sms: TRANSACTIONAL_SMS_CONSENT_TEXT,
            marketing_sms: MARKETING_SMS_CONSENT_TEXT,
            marketing_email: MARKETING_EMAIL_CONSENT_TEXT,
          },
        });
        dispatch({
          type: "SET_CONFIRMATION_EMAIL_STATUS",
          status: confirmation.data.status === "queued" ? "queued" : "failed",
        });
      } catch (error) {
        console.error("[Booking] confirmation delivery failed", { appointmentId, error });
        dispatch({ type: "SET_CONFIRMATION_EMAIL_STATUS", status: "failed" });
      }

      if (bookingContextId) {
        completeBookingContext(bookingContextId, {
          filter_matches: filterMatchContextPayload(filterMatches) as unknown as import("@/integrations/supabase/types").Json,
        }).catch(() => {});
      }

      try {
        sessionStorage.removeItem(storageKey);
        localStorage.removeItem(storageKey);
      } catch {
        // non-fatal
      }
      clearIdempotencyKey(storageKey);
      dispatch({ type: "RECORD_SUBMISSION" });

      if (choice === "pay_now" && result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }

      if (choice === "pay_now" && result.checkout_error) {
        toast.warning(result.checkout_error);
      }
      dispatch({ type: "BOOKING_SUCCESS" });
    } catch (error) {
      console.error("[Booking] commit failed", { idempotencyKey, error });
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("SLOT_UNAVAILABLE")) {
        toast.error("This time slot was just booked. Please select another time.");
        fetchBookedSlots(selectedDate).catch(() => {});
        dispatch({ type: "SET_STEP", step: 4 });
        return;
      }
      if (message.includes("DATE_BLOCKED") || message.includes("WEATHER_BLOCKED") || message.includes("WEATHER_UNVERIFIED")) {
        toast.error("That appointment time is no longer available. Please choose another date or time.");
        dispatch({ type: "SET_STEP", step: 4 });
        return;
      }
      dispatch({ type: "SET_CHECKOUT_ERROR", error: parseCheckoutError(error) });
    } finally {
      dispatch({ type: "SET_SUBMITTING", submitting: false });
      if (choice === "pay_now") dispatch({ type: "SET_PROCESSING_PAYMENT", processing: false });
    }
  }, [
    business, slug, selectedDate, selectedTime, submissionCount, lastSubmissionTime,
    validateVehicleRequirements, isWeatherBlocked, getTotalDuration, enforceWeatherGuard,
    guestName, guestEmail, guestPhone, customerAddress, addressLine2, city, state, zipCode,
    getOilPriceBreakdown, vehicles, vehicleServiceSelections, selectedRewardInstanceId,
    storageKey, notes, getGrandTotal, taxData, customerCoords, getPreTaxTotal, zipCode,
    transactionalSmsConsent, marketingSmsConsent, marketingEmailConsent, bookingContextId,
    fetchBookedSlots, dispatch,
  ]);

  const handlePayNow = useCallback(() => submitBooking("pay_now"), [submitBooking]);
  const handleSubmit = useCallback(() => submitBooking(paymentChoice === "pay_now" ? "pay_now" : "pay_later"), [submitBooking, paymentChoice]);

  const handleCreateAccount = useCallback(async (data: { email: string; password: string; name: string; phone?: string }) => {
    if (!business) throw new Error("Business not loaded");
    const { data: signupData, error: signupError } = await signUpBookingUser(data.email, data.password, data.name, data.phone);
    if (signupError) {
      if (signupError.message.includes("already registered")) throw new Error("This email is already registered. Please sign in instead.");
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
  }, [business, dispatch]);

  return { handlePayNow, handleSubmit, handleCreateAccount } as const;
}
