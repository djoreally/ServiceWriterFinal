/* eslint-disable @typescript-eslint/no-explicit-any, no-empty */

/**
 * PublicBooking — Multi-step public booking page.
 *
 * This file is now a thin coordinator:
 *  • useBookingState   — centralised reducer state
 *  • useBookingPricing — all monetary calculations
 *  • useBookingSlots   — date/time logic + realtime
 *  • useBookingSubmit  — pay-now / pay-later flows
 *
 * The render layer delegates to extracted step components.
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useBookingState } from "@/hooks/useBookingState";
import { useBookingPricing, type FeeSettings } from "@/hooks/useBookingPricing";
import { useBookingSlots } from "@/hooks/useBookingSlots";
import { useBookingSubmit } from "@/hooks/useBookingSubmit";
import { useBookingTracker } from "@/hooks/useBookingTracker";
import { getAnonSessionId } from "@/lib/anonSession";
import { startPresence, stopPresence, updatePage, trackEvent } from "@/lib/livePresence";
import { verifyLocation } from "@/application/queries/booking-context.query";
import { updateVehicleContext, updateServiceContext } from "@/application/commands/booking-context.command";
import {
  fetchPublicBookingProfile,
  fetchPublicBusinessExtendedSettings,
  fetchPublicServiceCatalog,
  fetchPublicServicePackages,
  fetchPublicSubscriptionPlans,
  calculateTax as requestTaxCalculation,
  fetchBookingCustomerAccount,
  fetchCurrentBookingUser,
  fetchPublicBlockedDates,
} from "@/application/queries/public-booking.query";
import type { BookingRequirement } from "@/lib/service-category-policy";
import { mergeBookingRequirements, vehicleMeetsBookingRequirements } from "@/lib/booking-requirements";
import type { DetailingPricingRule } from "@/lib/detailing-pricing";
import { fetchPublicDetailingPricingRules } from "@/application/queries/detailing-pricing.query";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StickyActionBar } from "@/components/layout/PagePrimitives";

import { toast } from "@/components/ui/sonner";
import { Wrench, ArrowLeft, ArrowRight, Loader2 } from "lucide-react";
import { format, parse } from "date-fns";
import { geocodeAddress } from "@/application/queries/mapbox";
import { MAPBOX_ACCESS_TOKEN } from "@/lib/mapbox";
import {
  deriveWorkingDaysFromAreas,
  matchServiceAreas,
  milesBetween,
  type ServiceAreaRule,
} from "@/lib/serviceArea";

import type { VehicleData } from "@/components/booking/VehicleEntry";
import { useServiceCategoryPolicy } from "@/hooks/useServiceCategoryPolicy";
import { applyProviderVerticalDefault } from "@/lib/service-category-policy";

import { CheckoutProgress } from "@/components/booking/CheckoutProgress";
import { LocationStep } from "@/components/booking/steps/LocationStep";
import { VehicleStep } from "@/components/booking/steps/VehicleStep";
import { ServiceSelectionStep, type ServiceCatalogItem } from "@/components/booking/steps/ServiceSelectionStep";
import { ConfirmationStep } from "@/components/booking/steps/ConfirmationStep";
import { DateTimeStep } from "@/components/booking/steps/DateTimeStep";
import { ContactPaymentStep } from "@/components/booking/steps/ContactPaymentStep";
import { CheckoutOptionsStep } from "@/components/booking/steps/CheckoutOptionsStep";
import { CustomerLoginButton } from "@/components/booking/CustomerLoginButton";
import { QuoteRequestDialog } from "@/components/pricing/QuoteRequestDialog";

import { useWeatherGuard } from "@/hooks/useWeatherGuard";
import { FloatingVoiceAgent } from "@/components/voice-agent/FloatingVoiceAgent";
import { useSlotWeatherDecision } from "@/hooks/useSlotWeatherDecision";
import { useSuggestNextSlots } from "@/hooks/useSuggestNextSlots";
import { BookingJsonLd } from "@/components/booking/BookingJsonLd";
import { applySocialMeta } from "@/lib/seo";
import { dollarsToCents, toDollars } from '@/lib/financialMath';
import { TenantTrackingScripts } from '@/components/tracking/TenantTrackingScripts';
import { DEFAULT_OIL_PRICE_PER_QUART, resolveOilPricePerQuart } from "@/lib/oilPricing";
import { ProgressiveImage } from "@/components/media/ProgressiveImage";
import { AppointmentBar } from "@/components/booking/AppointmentBar";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Convert "HH:mm" to "h:mm AM/PM" for display */
function formatSlotTo12h(slot: string): string {
  try {
    const d = parse(slot, "HH:mm", new Date());
    return format(d, "h:mm a");
  } catch {
    return slot;
  }
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface BusinessProfile {
  id: string;
  user_id: string;
  business_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  logo_url: string | null;
  opening_time: string | null;
  closing_time: string | null;
  working_days: string[] | null;
  /** Per-weekday open/close windows configured by the shop. */
  day_hours: Record<string, unknown> | null;
  currency: string | null;
  service_radius_miles: number | null;
  service_address: string | null;
  service_coordinates: { lat: number; lng: number } | null;
  buffer_time_before: number;
  buffer_time_after: number;
  min_lead_time_hours: number;
  max_advance_days: number;
  slot_duration_minutes: number;
  /** ⚡ Security: boolean only — stripe_account_id is never exposed to the client */
  stripe_charges_enabled: boolean;
  payment_provider: string | null;
  square_charges_enabled: boolean;
  square_merchant_id: string | null;
  oil_price_per_quart: number;
  require_approval: boolean;
  // Fee settings
  waste_oil_fee_enabled: boolean;
  waste_oil_fee: number;
  shop_fee_enabled: boolean;
  shop_fee_type: string;
  shop_fee_value: number;
  shop_fee_description: string;
  surcharge_enabled: boolean;
  surcharge_type: string;
  surcharge_value: number;
  surcharge_description: string;
  // Weather Guard
  weather_guard_enabled: boolean;
  weather_guard_settings: unknown;
  service_area_rules?: ServiceAreaRule[];
  service_display_mode: "category_first" | "full_list";
  /** Provider verticals (oil_change | tires | detailing | mechanical). */
  service_verticals: string[];
}

/** Catalog service shape is owned by ServiceSelectionStep (single definition). */


interface ServicePackage {
  id: string;
  name: string;
  description: string | null;
  package_price: number;
  discount_type: string;
  discount_value: number;
  estimated_duration: number | null;
  services: Array<{ id: string; name: string; quantity: number; price: number }>;
}

interface PublicBookingProps {
  tenantSlug?: string;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const PublicBooking = ({ tenantSlug }: PublicBookingProps = {}) => {
  const { slug: routeSlug } = useParams<{ slug: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const slug = tenantSlug || routeSlug;

  const [business, setBusiness] = useState<BusinessProfile | null>(null);
  const [services, setServices] = useState<ServiceCatalogItem[]>([]);
  const [packages, setPackages] = useState<ServicePackage[]>([]);
  const [subscriptionPlans, setSubscriptionPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [blockedDates, setBlockedDates] = useState<string[]>([]);
  const [detailingRules, setDetailingRules] = useState<DetailingPricingRule[]>([]);

  // Force light theme
  useEffect(() => {
    const root = window.document.documentElement;
    root.classList.remove("dark");
    root.classList.add("light");
  }, []);

  // Live presence: heartbeat into live_sessions while this booking page is open
  useEffect(() => {
    const tenantId = business?.user_id;
    if (!tenantId) return;
    void startPresence(tenantId).then(() => {
      void trackEvent("booking_started", { slug });
    });
    return () => {
      stopPresence();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [business?.user_id]);

  // Step-change tracking is wired in a separate effect below (after `bs` is created).

  // URL-persisted initial step
  const initialStep = (() => {
    const p = searchParams.get("step");
    if (p) {
      const n = parseInt(p, 10);
      if (!isNaN(n) && n >= 1 && n <= 5) return n;
    }
    return 1;
  })();

  // Persistent booking draft.
  //
  // Scope is deliberately narrow:
  //  • Contact details (name / email / phone / notes) are NEVER persisted — a
  //    returning visitor must not find someone else's contact info pre-filled
  //    on a shared device.
  //  • Drafts expire after DRAFT_TTL_MS so a stale cart never resurfaces days
  //    later with prices or services that have since changed.
  //  • The draft is cleared the moment a booking is confirmed.
  const STORAGE_KEY = `booking-${slug}`;
  const DRAFT_TTL_MS = 2 * 60 * 60 * 1000;
  const clearBookingDraft = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
      sessionStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, [STORAGE_KEY]);
  const getSavedBookingData = useCallback(() => {
    try {
      const saved =
        localStorage.getItem(STORAGE_KEY) ?? sessionStorage.getItem(STORAGE_KEY);
      if (!saved) return null;
      const parsed = JSON.parse(saved);
      const savedAt = typeof parsed?.savedAt === "number" ? parsed.savedAt : 0;
      if (!savedAt || Date.now() - savedAt > DRAFT_TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch {
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [STORAGE_KEY]);

  // ── State (reducer) ────────────────────────────────────────────────────
  const savedData = getSavedBookingData();
  const { state: bs, dispatch } = useBookingState(savedData, initialStep);

  // Live presence — emit a funnel event whenever the booking step changes
  useEffect(() => {
    if (!business?.user_id) return;
    const path = `${window.location.pathname}?step=${bs.step}`;
    updatePage(path);
    void trackEvent("booking_step_changed", { step: bs.step });
  }, [bs.step, business?.user_id]);

  // Saved service IDs for restoring after services load
  const [selectedServiceIds] = useState<string[]>(savedData?.selectedServiceIds || []);

  // Step 5 has two sub-views: "options" (add-ons/coupon/rewards) then "contact"
  // (contact + payment). Splitting them prevents the "two Step 5 pages" stacked
  // feel and gives the user a single form per screen.
  const [step5View, setStep5View] = useState<"options" | "contact">("options");
  // Only surface contact validation after the user has engaged with the fields
  // (or attempted to submit). Prevents a nag before anything is typed.
  const [contactAttempted, setContactAttempted] = useState(false);
  const [quoteRequestOpen, setQuoteRequestOpen] = useState(false);

  useEffect(() => {
    if (bs.step !== 5) setStep5View("options");
  }, [bs.step]);

  // ── Step setter (syncs URL) ─────────────────────────────────────────────
  const setStep = useCallback(
    (newStep: number | ((prev: number) => number)) => {
      const nextStep = typeof newStep === "function" ? newStep(bs.step) : newStep;
      dispatch({ type: "SET_STEP", step: nextStep });
      const newParams = new URLSearchParams(searchParams);
      if (nextStep > 1) newParams.set("step", String(nextStep));
      else newParams.delete("step");
      setSearchParams(newParams, { replace: true });
    },
    [bs.step, searchParams, setSearchParams, dispatch],
  );

  // ── Fee settings derived from business ──────────────────────────────────
  const feeSettings: FeeSettings | null = business
    ? {
        waste_oil_fee_enabled: business.waste_oil_fee_enabled,
        waste_oil_fee: business.waste_oil_fee,
        shop_fee_enabled: business.shop_fee_enabled,
        shop_fee_type: business.shop_fee_type,
        shop_fee_value: business.shop_fee_value,
        shop_fee_description: business.shop_fee_description,
        surcharge_enabled: business.surcharge_enabled,
        surcharge_type: business.surcharge_type,
        surcharge_value: business.surcharge_value,
        surcharge_description: business.surcharge_description,
      }
    : null;

  // ── Category-driven vehicle selector policy ─────────────────────────────
  // Resolved BEFORE pricing so fluid-only fees (waste oil) can be gated.
  // Tire categories use the wheel/tire configurator and never show fluid specs.
  const selectedCatalogServiceIds = useMemo(() => {
    const assignedIds = Object.values(bs.vehicleServiceSelections).flatMap((selection) => selection.package
      ? selection.package.services.map((service) => service.id)
      : selection.services.map((service) => service.id));
    const ids = assignedIds.length > 0
      ? assignedIds
      : bs.selectedPackage
        ? bs.selectedPackage.services.map((service) => service.id)
        : bs.selectedServices.map((service) => service.id);
    return new Set(ids);
  }, [bs.vehicleServiceSelections, bs.selectedPackage, bs.selectedServices]);

  const selectedCategoryKeys = useMemo(() => {
    const fromCatalog = services
      .filter((service) => selectedCatalogServiceIds.has(service.id))
      .map((service) => service.category);
    const packageFallback =
      bs.selectedPackage && fromCatalog.length === 0 ? [bs.selectedPackage.name] : [];
    return [...fromCatalog, ...packageFallback];
  }, [services, selectedCatalogServiceIds, bs.selectedPackage]);

  const rawCategoryPolicy = useServiceCategoryPolicy(selectedCategoryKeys);

  /**
   * Effective policy = category match, else the provider's declared verticals.
   * A tire-only shop therefore opens the wheel/tire configurator (and never
   * shows oil information) even before a service is picked.
   */
  const categoryPolicy = useMemo(
    () => applyProviderVerticalDefault(rawCategoryPolicy, business?.service_verticals),
    [rawCategoryPolicy, business?.service_verticals],
  );

  /** Requirements the customer must satisfy for the current selection. */
  const bookingRequirements = useMemo<BookingRequirement[]>(() => {
    const fromCatalog = services
      .filter((service) => selectedCatalogServiceIds.has(service.id))
      .map((service) => service.booking_requirements ?? []);
    return mergeBookingRequirements([...fromCatalog, categoryPolicy.requirements]);
  }, [services, selectedCatalogServiceIds, categoryPolicy.requirements]);

  const needsTireFitment = bookingRequirements.includes("tire_fitment");
  const needsOilFitment = bookingRequirements.includes("oil_fitment") && categoryPolicy.showsFluidSpecs;

  /** Ids of selected services whose category requires a detailing assessment. */
  const detailingServiceIds = useMemo(() => services
    .filter((service) => selectedCatalogServiceIds.has(service.id) && (service.booking_requirements ?? []).includes("detailing_assessment"))
    .map((service) => service.id), [services, selectedCatalogServiceIds]);

  // ── Pricing hook ────────────────────────────────────────────────────────
  const pricing = useBookingPricing({
    selectedServices: bs.selectedServices,
    selectedPackage: bs.selectedPackage,
    vehicleServiceSelections: bs.vehicleServiceSelections,
    vehicles: bs.vehicles,
    paymentChoice: bs.paymentChoice,
    taxData: bs.taxData,
    feeSettings,
    oilPricePerQuart: business?.oil_price_per_quart ?? DEFAULT_OIL_PRICE_PER_QUART,
    currency: business?.currency || "USD",
    allowFluidFees: categoryPolicy.showsFluidSpecs,
    appliedCoupon: bs.appliedCoupon,
    detailingRules,
    detailingServiceIds,
  });


  // ── Weather Guard ──────────────────────────────────────────────────────
  const weatherGuard = useWeatherGuard({
    enabled: business?.weather_guard_enabled ?? false,
    settings: business?.weather_guard_settings ?? null,
    lat: business?.service_coordinates?.lat ?? null,
    lng: business?.service_coordinates?.lng ?? null,
    selectedDate: bs.selectedDate,
    openingTime: business?.opening_time ?? null,
    closingTime: business?.closing_time ?? null,
    windowDays: Math.min(business?.max_advance_days ?? 14, 14),
    defaultSlotDurationMinutes: business?.slot_duration_minutes ?? 60,
  });

  // Real-time slot decision via the weather-guard-check-slot edge function.
  // Reflects the same risk engine that drives Weather Guard automation
  // (BLOCK / SUGGEST_RESCHEDULE / WARN / OK) so customers see a consistent
  // story between what the shop sees internally and what they're allowed to book.
  const slotWeatherDecision = useSlotWeatherDecision({
    enabled: business?.weather_guard_enabled ?? false,
    businessUserId: business?.user_id,
    lat: business?.service_coordinates?.lat ?? null,
    lng: business?.service_coordinates?.lng ?? null,
    selectedDate: bs.selectedDate,
    selectedTime: bs.selectedTime,
    durationMinutes: pricing.getTotalDuration() || (business?.slot_duration_minutes ?? 60),
    scope: "outdoor",
  });

  // ── Slot / scheduling hook ─────────────────────────────────────────────
  const slots = useBookingSlots({
    businessUserId: business?.user_id,
    bookingSlug: slug,
    bookingContextId: bs.bookingContextId,
    openingTime: business?.opening_time ?? null,
    closingTime: business?.closing_time ?? null,
    slotDurationMinutes: business?.slot_duration_minutes ?? 30,
    bufferTimeBefore: business?.buffer_time_before ?? 0,
    bufferTimeAfter: business?.buffer_time_after ?? 0,
    minLeadTimeHours: business?.min_lead_time_hours ?? 2,
    maxAdvanceDays: business?.max_advance_days ?? 30,
    workingDays: business?.working_days ?? null,
    dayHours: business?.day_hours ?? null,
    selectedDate: bs.selectedDate,
    selectedTime: bs.selectedTime,
    bookedSlots: bs.bookedSlots,
    routeSafeSlots: bs.routeSafeSlots,
    isWeatherBlocked: weatherGuard.isWeatherBlocked,
    getTotalDuration: pricing.getTotalDuration,
    dispatch,
  });

  // ── Reschedule suggestion engine ───────────────────────────────────────
  // When the slot decision is SUGGEST_RESCHEDULE, the customer can ask for
  // alternatives — we scan the next few working days, drop conflicting /
  // weather-blocked slots, then verify candidates through the same
  // weather-guard-check-slot edge function for an engine-consistent answer.
  const suggestNext = useSuggestNextSlots({
    businessUserId: business?.user_id,
    lat: business?.service_coordinates?.lat ?? null,
    lng: business?.service_coordinates?.lng ?? null,
    weatherGuardEnabled: business?.weather_guard_enabled ?? false,
    weatherGuardSettings: business?.weather_guard_settings ?? null,
    workingDays: business?.working_days ?? null,
    openingTime: business?.opening_time ?? null,
    closingTime: business?.closing_time ?? null,
    slotDurationMinutes: business?.slot_duration_minutes ?? 30,
    bufferTimeBefore: business?.buffer_time_before ?? 0,
    bufferTimeAfter: business?.buffer_time_after ?? 0,
    minLeadTimeHours: business?.min_lead_time_hours ?? 2,
    maxAdvanceDays: business?.max_advance_days ?? 30,
    serviceDurationMinutes: pricing.getTotalDuration() || (business?.slot_duration_minutes ?? 60),
  });

  const setSelectedRewardInstance = useCallback((rewardInstanceId: string | null) => {
    dispatch({ type: "SET_SELECTED_REWARD_INSTANCE", rewardInstanceId });
  }, [dispatch]);

  const submit = useBookingSubmit({
    business: business
      ? {
          user_id: business.user_id,
          business_name: business.business_name,
          currency: business.currency,
          payment_provider: business.payment_provider,
          stripe_charges_enabled: business.stripe_charges_enabled,
          square_charges_enabled: business.square_charges_enabled,
          square_merchant_id: business.square_merchant_id,
          require_approval: business.require_approval,
        }
      : null,
    slug,
    bookingState: bs,
    dispatch,
    storageKey: STORAGE_KEY,
    bookingRequirements,
    getVehicleBookingRequirements: (vehicle) => vehicleBookingRequirements[vehicle.id] || ["basic_vehicle"],
    getOilPriceAdjustment: () => toDollars(pricing.getOilPriceAdjustment()),
    getOilPriceBreakdown: () => {
      const breakdown = pricing.getOilPriceBreakdown();
      return {
        ...breakdown,
        pricePerQuart: toDollars(breakdown.pricePerQuart),
        total: toDollars(breakdown.total),
      };
    },
    getTotalDuration: pricing.getTotalDuration,
    getPreTaxTotal: () => toDollars(pricing.getPreTaxTotal()),
    getGrandTotal: () => toDollars(pricing.getGrandTotal()),
    getDetailingAdjustment: () => pricing.detailingQuote.adjustment,
    fetchBookedSlots: slots.fetchBookedSlots,
    isWeatherBlocked: weatherGuard.isWeatherBlocked,
    weatherGuardContext: {
      enabled: business?.weather_guard_enabled ?? false,
      lat: business?.service_coordinates?.lat ?? null,
      lng: business?.service_coordinates?.lng ?? null,
    },
  });

  // ── Funnel tracking → retention engine ──────────────────────────────────
  // As soon as we have an email + business, write progress to abandoned_bookings.
  // Stale rows (idle 30+ min, not converted) get promoted to retention signals
  // by the `promote_abandoned_bookings_to_signals` cron job, then automation
  // rules (winback / recovery) can target them.
  // Persistent anonymous cookie id — established on first visit so we
  // can track every booking step even before the visitor types an email.
  const anonSessionIdRef = useRef<string>("");
  if (!anonSessionIdRef.current) {
    anonSessionIdRef.current = getAnonSessionId();
  }

  useBookingTracker({
    businessUserId: business?.user_id,
    guestEmail: bs.guestEmail,
    guestName: bs.guestName,
    guestPhone: bs.guestPhone,
    step: bs.step,
    sessionId: anonSessionIdRef.current,
    serviceCatalogId: bs.selectedServices[0]?.id ?? null,
    scheduledDate: bs.selectedDate ? bs.selectedDate.toISOString().slice(0, 10) : null,
    scheduledTime: bs.selectedTime || null,
    succeeded: bs.step === 6,
  });

  // ── Category-driven vehicle selector policy ─────────────────────────────
  // Tire categories use the wheel/tire configurator and never show fluid specs.
  // (Category-driven vehicle selector policy is resolved above, before pricing.)



  // ── Session persistence ─────────────────────────────────────────────────
  useEffect(() => {
    if (!slug) return;
    // Booking confirmed → the draft has served its purpose.
    if (bs.step >= 6) {
      clearBookingDraft();
      return;
    }
    const dataToSave = {
      customerAddress: bs.customerAddress,
      addressLine2: bs.addressLine2,
      city: bs.city,
      state: bs.state,
      zipCode: bs.zipCode,
      locationVerified: bs.locationVerified,
      distanceMessage: bs.distanceMessage,
      customerCoords: bs.customerCoords,
      bookingContextId: bs.bookingContextId,
      vehicles: bs.vehicles,
      selectedServiceIds: bs.selectedServices.map((s) => s.id),
      selectedPackageId: bs.selectedPackage?.id,
      vehicleServiceSelections: bs.vehicleServiceSelections,
      serviceViewMode: bs.serviceViewMode,
      selectedDate: bs.selectedDate?.toISOString(),
      selectedTime: bs.selectedTime,
      paymentChoice: bs.paymentChoice,
      transactionalSmsConsent: bs.transactionalSmsConsent,
      marketingSmsConsent: bs.marketingSmsConsent,
      marketingEmailConsent: bs.marketingEmailConsent,
      selectedRewardInstanceId: bs.selectedRewardInstanceId,
    };
    try {
      const serialized = JSON.stringify({ ...dataToSave, step: bs.step, savedAt: Date.now() });
      localStorage.setItem(STORAGE_KEY, serialized);
    } catch {}
  }, [slug, STORAGE_KEY, bs, clearBookingDraft]);

  // ── Fetch business + services ───────────────────────────────────────────
  useEffect(() => {
    const fetchBusinessAndServices = async () => {
      if (!slug) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const { data: rawBusinessData, error: businessError } = await fetchPublicBookingProfile(slug);
      const businessData = Array.isArray(rawBusinessData) ? rawBusinessData as Record<string, any>[] : null;

      if (businessError || !businessData || businessData.length === 0) {
        setNotFound(true);
        setLoading(false);
        return;
      }

      const profile = businessData[0];

      const { data: additionalSettings, error: additionalSettingsError } =
        (await fetchPublicBusinessExtendedSettings(slug)) as { data: any | null; error: unknown };
      if (additionalSettingsError) {
        console.warn("Public booking: extended settings query failed; using profile defaults.", additionalSettingsError);
      }

      setBusiness({
        id: "",
        user_id: profile.user_id,
        business_name: profile.business_name,
        phone: null,
        email: profile.email || null,
        address: null,
        logo_url: profile.logo_url || null,
        opening_time: profile.opening_time,
        closing_time: profile.closing_time,
        working_days: profile.working_days,
        day_hours:
          (additionalSettings as any)?.day_hours && typeof (additionalSettings as any).day_hours === "object"
            ? ((additionalSettings as any).day_hours as Record<string, unknown>)
            : null,
        currency: profile.currency,
        service_radius_miles: profile.service_radius_miles,
        service_address: profile.service_address,
        service_coordinates: profile.service_coordinates as { lat: number; lng: number } | null,
        buffer_time_before: profile.buffer_time_before ?? 0,
        buffer_time_after: profile.buffer_time_after ?? 0,
        min_lead_time_hours: profile.min_lead_time_hours ?? 2,
        max_advance_days: profile.max_advance_days ?? 30,
        slot_duration_minutes: profile.slot_duration_minutes ?? 30,
        stripe_charges_enabled: profile.stripe_charges_enabled || false,
        // A connected Stripe account (stripe_charges_enabled is computed as
        // "enabled AND account present") is authoritative when the extended
        // settings read is unavailable — never invent an unconfigured provider.
        payment_provider:
          additionalSettings?.payment_provider ?? (profile.stripe_charges_enabled ? "stripe" : null),

        square_charges_enabled: additionalSettings?.square_charges_enabled || false,
        square_merchant_id: additionalSettings?.square_merchant_id || null,
        oil_price_per_quart: resolveOilPricePerQuart(
          additionalSettings?.oil_price_per_quart,
          profile.oil_price_per_quart,
        ),
        require_approval: profile.require_approval ?? false,
        waste_oil_fee_enabled: additionalSettings?.waste_oil_fee_enabled ?? false,
        waste_oil_fee: Number(additionalSettings?.waste_oil_fee) || 0,
        shop_fee_enabled: additionalSettings?.shop_fee_enabled ?? false,
        shop_fee_type: additionalSettings?.shop_fee_type || "fixed",
        shop_fee_value: Number(additionalSettings?.shop_fee_value) || 0,
        shop_fee_description: additionalSettings?.shop_fee_description || "Shop Supplies Fee",
        surcharge_enabled: additionalSettings?.surcharge_enabled ?? false,
        surcharge_type: additionalSettings?.surcharge_type || "percentage",
        surcharge_value: Number(additionalSettings?.surcharge_value) || 0,
        surcharge_description: additionalSettings?.surcharge_description || "Card Processing Fee",
        weather_guard_enabled: additionalSettings?.weather_guard_enabled ?? (profile as any).weather_guard_enabled ?? false,
        weather_guard_settings: additionalSettings?.weather_guard_settings ?? (profile as any).weather_guard_settings ?? null,
        service_area_rules: Array.isArray((additionalSettings as any)?.day_hours?.service_area_rules)
          ? ((additionalSettings as any).day_hours.service_area_rules as ServiceAreaRule[])
          : [],
        service_display_mode: (additionalSettings as any)?.day_hours?.public_booking_service_display_mode === "category_first"
          ? "category_first"
          : "full_list",
        service_verticals: Array.isArray((additionalSettings as any)?.service_verticals)
          ? ((additionalSettings as any).service_verticals as string[])
          : ["oil_change"],
      });

      const { data: rawServicesData } = await fetchPublicServiceCatalog(slug);
      const servicesData = Array.isArray(rawServicesData) ? rawServicesData as ServiceCatalogItem[] : [];
      setServices(servicesData);
      fetchPublicDetailingPricingRules(profile.user_id).then(setDetailingRules).catch(()=>setDetailingRules([]));

      // Public blocked dates (fail-soft: empty list on error)
      fetchPublicBlockedDates(slug)
        .then(setBlockedDates)
        .catch(() => setBlockedDates([]));


      const { data: rawPackagesData } = await fetchPublicServicePackages(slug);
      const packagesData = Array.isArray(rawPackagesData) ? rawPackagesData as unknown as ServicePackage[] : [];
      setPackages(
        packagesData.map((p) => ({ ...p, services: p.services || [] })),
      );

      // Fetch subscription plans for this business
      const { data: plansData } = await fetchPublicSubscriptionPlans(profile.user_id);
      setSubscriptionPlans(plansData || []);

      // Restore selected services from the draft — but only services that are
      // still in the live, active catalog. A service the shop has since toggled
      // off must never reappear in a restored cart.
      if (servicesData) {
        const activeIds = new Set((servicesData as ServiceCatalogItem[]).map((s) => s.id));

        if (selectedServiceIds.length > 0) {
          const restored = (servicesData as ServiceCatalogItem[]).filter((s) =>
            selectedServiceIds.includes(s.id),
          );
          dispatch({ type: "SET_SELECTED_SERVICES", services: restored });
        }

        // Prune the per-vehicle selections the draft restored directly.
        const savedSelections = savedData?.vehicleServiceSelections as
          | Record<string, { services?: ServiceCatalogItem[]; package?: unknown }>
          | undefined;
        if (savedSelections && Object.keys(savedSelections).length > 0) {
          const pruned = Object.fromEntries(
            Object.entries(savedSelections).map(([vehicleId, selection]) => [
              vehicleId,
              {
                ...(selection as any),
                services: ((selection as any)?.services ?? []).filter((svc: ServiceCatalogItem) =>
                  activeIds.has(svc.id),
                ),
              },
            ]),
          );
          dispatch({ type: "SET_VEHICLE_SERVICE_SELECTIONS", selections: pruned as any });
        }
      }

      setLoading(false);
    };

    fetchBusinessAndServices();
  }, [slug, selectedServiceIds]); // eslint-disable-line react-hooks/exhaustive-deps

  const matchedServiceAreas = useMemo(() => {
    return matchServiceAreas(bs.customerCoords, business?.service_area_rules);
  }, [bs.customerCoords, business?.service_area_rules]);

  const areaWorkingDays = useMemo(() => {
    return deriveWorkingDaysFromAreas(matchedServiceAreas);
  }, [matchedServiceAreas]);

  // ── Social / OG meta per booking tenant ────────────────────────────────
  useEffect(() => {
    if (!business) return;

    const businessName = business.business_name || "Auto Shop";
    applySocialMeta({
      title: `${businessName} | Book Auto Service Online`,
      description: `Book service appointments online with ${businessName}. Choose services, pick a time, and confirm in minutes.`,
      url: window.location.href,
      image: business.logo_url || "/og-image.png",
      siteName: businessName,
    });
  }, [business]);

  // ── Tax calculation on step 5 ──────────────────────────────────────────
  const calculateTax = useCallback(async () => {
    if (!bs.customerAddress || (!bs.selectedServices.length && !bs.selectedPackage)) return;

    const amountInCents = dollarsToCents(toDollars(pricing.preTaxTotal));
    const productDescription = bs.selectedPackage
      ? `Package: ${bs.selectedPackage.name}`
      : bs.selectedServices.map((s) => s.name).join(", ");

    dispatch({ type: "SET_TAX_LOADING", loading: true });
    try {
      const { data, error } = await requestTaxCalculation({
        amount: amountInCents,
        currency: business?.currency || "USD",
        customer_address: {
          line1: bs.customerAddress,
          city: bs.city,
          state: bs.state,
          postal_code: bs.zipCode,
          country: "US",
        },
        product_description: productDescription,
        user_id: business?.user_id,
      });

      if (error) {
        console.error("Tax calculation error:", error);
        dispatch({ type: "SET_TAX_DATA", data: null });
      } else if (data?.success) {
        dispatch({
          type: "SET_TAX_DATA",
          data: {
            tax_amount: data.tax_amount / 100,
            total: data.total / 100,
            tax_breakdown:
              data.tax_breakdown?.map((b: { jurisdiction: string; rate: number; amount: number }) => ({
                ...b,
                jurisdiction: !b.jurisdiction || b.jurisdiction.toLowerCase() === "unknown" ? `${bs.state || "Local"} sales tax` : b.jurisdiction,
                amount: b.amount / 100,
              })) || [],
          },
        });
      }
    } catch (err) {
      console.error("Failed to calculate tax:", err);
      dispatch({ type: "SET_TAX_DATA", data: null });
    }
    dispatch({ type: "SET_TAX_LOADING", loading: false });
  }, [bs.customerAddress, bs.city, bs.state, bs.zipCode, bs.selectedServices, bs.selectedPackage, pricing.preTaxTotal, business, dispatch]);

  useEffect(() => {
    if (bs.step === 5) calculateTax();
  }, [bs.step, calculateTax]);

  // ── Location verification ──────────────────────────────────────────────
  const handleVerifyLocation = async (): Promise<boolean> => {
    const fullAddress = [bs.customerAddress, bs.addressLine2, bs.city, bs.state, bs.zipCode]
      .filter(Boolean)
      .join(", ");

    if (!fullAddress.trim()) {
      toast.error("Please enter your address");
      return false;
    }
    if (!business?.user_id) {
      toast.error("Business not loaded");
      return false;
    }
    dispatch({ type: "SET_VERIFYING_LOCATION", verifying: true });
    dispatch({ type: "SET_DISTANCE_MESSAGE", message: "" });

    try {
      const { data, error } = await verifyLocation(fullAddress, business.user_id);

      if (error) {
        console.error("verify-location error:", error);
        return await handleVerifyLocationFallback(fullAddress);
      }

      if (data?.valid) {
        const coords = data.location?.geocode ? { lat: data.location.geocode.lat, lng: data.location.geocode.lng } : undefined;
        if (coords && business.service_area_rules && business.service_area_rules.length > 0) {
          const matched = matchServiceAreas(coords, business.service_area_rules);
          if (matched.length === 0) {
            dispatch({ type: "SET_LOCATION_VERIFIED", verified: false, message: "Address is outside configured service areas." });
            return false;
          }
        }
        dispatch({
          type: "SET_LOCATION_VERIFIED",
          verified: true,
          message: data.message || "Service area confirmed!",
          coords,
          contextId: data.bookingContextId || undefined,
        });
        return true;
      } else {
        dispatch({ type: "SET_LOCATION_VERIFIED", verified: false, message: data?.message || "Outside service area" });
        return false;
      }
    } catch (err) {
      console.error("Verify location error:", err);
      return await handleVerifyLocationFallback(fullAddress);
    } finally {
      dispatch({ type: "SET_VERIFYING_LOCATION", verifying: false });
    }
  };

  const handleVerifyLocationFallback = async (fullAddress: string): Promise<boolean> => {
    if (!MAPBOX_ACCESS_TOKEN) {
      dispatch({ type: "SET_LOCATION_VERIFIED", verified: true, message: "Service area confirmed!" });
      dispatch({ type: "SET_VERIFYING_LOCATION", verifying: false });
      return true;
    }

    try {
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(fullAddress)}.json?access_token=${MAPBOX_ACCESS_TOKEN}&limit=1`;
      const res = await fetch(geocodeUrl);
      if (!res.ok) throw new Error("Geocoding failed");
      const geo = await res.json();
      const coords = geo?.features?.[0]?.center;
      if (!coords || coords.length < 2) {
        toast.error("Unable to geocode address. Please refine the address and try again.");
        dispatch({ type: "SET_VERIFYING_LOCATION", verifying: false });
        return false;
      }
      const [lng, lat] = coords;
      dispatch({ type: "SET_CUSTOMER_COORDS", coords: { lat, lng } });

      if (business?.service_area_rules && business.service_area_rules.length > 0) {
        const matched = matchServiceAreas({ lat, lng }, business.service_area_rules);
        if (matched.length > 0) {
          const names = matched.map((m) => m.label || m.address || "Configured Area").slice(0, 2).join(", ");
          dispatch({ type: "SET_LOCATION_VERIFIED", verified: true, message: `Serviceable area matched: ${names}` });
          return true;
        }
        dispatch({ type: "SET_LOCATION_VERIFIED", verified: false, message: "Address is outside configured service areas." });
        return false;
      } else if (business?.service_coordinates && business?.service_radius_miles != null) {
        const distance = milesBetween({ lat, lng }, business.service_coordinates);
        if (distance <= (business.service_radius_miles || 0)) {
          dispatch({ type: "SET_LOCATION_VERIFIED", verified: true, message: `Serviceable — ${distance.toFixed(1)} miles from shop` });
          return true;
        }
        const msg = `Out of service area — ${distance.toFixed(1)} miles from shop`;
        dispatch({ type: "SET_LOCATION_VERIFIED", verified: false, message: msg });
        return false;
      } else {
        dispatch({ type: "SET_LOCATION_VERIFIED", verified: true, message: "Service area confirmed!" });
        return true;
      }
    } catch (err) {
      console.error("Verify location fallback error", err);
      toast.error("Unable to verify location. Please try again.");
      return false;
    } finally {
      dispatch({ type: "SET_VERIFYING_LOCATION", verifying: false });
    }
  };

  // ── Service / package toggles ──────────────────────────────────────────
  const toggleService = (service: ServiceCatalogItem) => {
    dispatch({ type: "SET_SELECTED_PACKAGE", pkg: null });
    const exists = bs.selectedServices.find((s) => s.id === service.id);
    dispatch({
      type: "SET_SELECTED_SERVICES",
      services: exists ? bs.selectedServices.filter((s) => s.id !== service.id) : [...bs.selectedServices, service],
    });
    if (!exists) {
      navigator.vibrate?.(20);
      toast.success("Added to your appointment", { duration: 1600 });
    }
  };

  const selectPackage = (pkg: ServicePackage) => {
    dispatch({ type: "SET_SELECTED_SERVICES", services: [] });
    dispatch({ type: "SET_SELECTED_PACKAGE", pkg: bs.selectedPackage?.id === pkg.id ? null : pkg });
    if (bs.selectedPackage?.id !== pkg.id) {
      navigator.vibrate?.(20);
      toast.success("Added to your appointment", { duration: 1600 });
    }
  };

  // ── Step navigation ────────────────────────────────────────────────────
  const missingStep5Fields = (): string[] => {
    const missing: string[] = [];
    if (!bs.guestName.trim()) missing.push("Full Name");
    if (!bs.guestEmail.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bs.guestEmail)) missing.push("Email");
    if (!bs.guestPhone.trim()) missing.push("Phone Number");
    return missing;
  };

  const vehicleBookingRequirements = useMemo(() => {
    const result: Record<string, BookingRequirement[]> = {};
    for (const vehicle of bs.vehicles) {
      const selection = bs.vehicleServiceSelections[vehicle.id];
      const serviceIds = selection?.package ? selection.package.services.map((service) => service.id) : selection?.services.map((service) => service.id) || [];
      const requirements = services.filter((service) => serviceIds.includes(service.id)).map((service) => service.booking_requirements ?? []);
      result[vehicle.id] = mergeBookingRequirements([...requirements, ["basic_vehicle"]]);
    }
    return result;
  }, [bs.vehicles, bs.vehicleServiceSelections, services]);

  const canProceed = () => {
    switch (bs.step) {
      case 1:
        return !!bs.customerAddress.trim() && !!bs.city.trim() && !!bs.state.trim() && !!bs.zipCode.trim();
      case 2: {
        const enteredVehicles = bs.vehicles.filter((vehicle) => vehicle.year || vehicle.make || vehicle.model);
        return enteredVehicles.length > 0 && enteredVehicles.every((vehicle) => vehicleMeetsBookingRequirements(vehicle, ["basic_vehicle"]));
      }
      case 3: {
        const enteredVehicles = bs.vehicles.filter((vehicle) => vehicle.year && vehicle.make && vehicle.model);
        return enteredVehicles.length > 0 && enteredVehicles.every((vehicle) => {
          const selection = bs.vehicleServiceSelections[vehicle.id];
          return Boolean(selection?.package || selection?.services.length) && vehicleMeetsBookingRequirements(vehicle, vehicleBookingRequirements[vehicle.id] || ["basic_vehicle"]);
        });
      }
      case 4: {
        if (!bs.selectedDate || !bs.selectedTime || slotWeatherDecision.isBlocked) return false;
        // Fail-open: forecast errors don't block continuation.
        if (weatherGuard.isDayWeatherBlocked(bs.selectedDate)) return false;
        return !weatherGuard.isWeatherBlocked(bs.selectedTime, pricing.getTotalDuration() || undefined).blocked;
      }
      case 5:
        // Options sub-view has no required fields; contact sub-view requires all.
        return step5View === "options" ? true : missingStep5Fields().length === 0;
      default: return true;
    }
  };

  useEffect(() => {
    if (!bs.selectedDate) return;
    const selectedDateIsBlocked =
      blockedDates.includes(format(bs.selectedDate, "yyyy-MM-dd")) ||
      weatherGuard.isDayWeatherBlocked(bs.selectedDate);
    if (selectedDateIsBlocked) {
      dispatch({ type: "SET_SELECTED_DATE", date: undefined });
      dispatch({ type: "SET_SELECTED_TIME", time: "" });
      toast.error("That date is unavailable due to Weather Guard. Please choose another date.");
    }
  }, [blockedDates, bs.selectedDate, weatherGuard.isDayWeatherBlocked, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!bs.selectedTime) return;
    const weather = weatherGuard.isWeatherBlocked(bs.selectedTime, pricing.getTotalDuration() || undefined);
    if (weather.blocked) {
      dispatch({ type: "SET_SELECTED_TIME", time: "" });
      toast.error(`That time is unavailable due to weather: ${weather.reasons.join(", ")}`);
    }
  }, [bs.selectedTime, weatherGuard.isWeatherBlocked, pricing.getTotalDuration, dispatch]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNext = async () => {
    dispatch({ type: "SET_CHECKOUT_ERROR", error: null });

    if (bs.step === 5) {
      // First sub-view (add-ons/coupon/rewards) → advance to contact/payment.
      if (step5View === "options") {
        setStep5View("contact");
        // Scroll to top so the contact form is visible immediately.
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      // Contact sub-view → submit.
      if (bs.paymentChoice === "pay_now" && (business?.stripe_charges_enabled || business?.square_charges_enabled)) {
        submit.handlePayNow();
      } else {
        submit.handleSubmit();
      }
      return;
    }

    if (bs.step === 1) {
      const inServiceArea = await handleVerifyLocation();
      if (!inServiceArea) {
        const phone = business?.phone?.trim() || "(phone not available)";
        window.alert(`The business doesn't service that area. Please call for assistance at ${phone}.`);
        return;
      }
    }

    // Fire-and-forget context updates on step transitions
    if (bs.bookingContextId) {
      if (bs.step === 3) {
        const primary = bs.vehicles.find((v) => v.year && v.make && v.model);
        if (primary) {
          updateVehicleContext(bs.bookingContextId, {
            vehicleType: `${primary.year} ${primary.make} ${primary.model}`,
            durationModifierMinutes: 0,
          }).catch((err) => console.warn("Failed to update vehicle context:", err));
        }
      } else if (bs.step === 2) {
        const serviceNames = bs.selectedPackage
          ? [bs.selectedPackage.name]
          : bs.selectedServices.map((s) => s.name);
        updateServiceContext(bs.bookingContextId, {
          estimatedServiceMinutes: pricing.totalDuration,
          skillTags: serviceNames,
          mobileEligible: true,
        }).catch((err) => console.warn("Failed to update service context:", err));
      }
    }

    setStep(bs.step + 1);
  };

  const handleStepClick = (targetStep: number) => {
    if (targetStep < bs.step) {
      dispatch({ type: "SET_CHECKOUT_ERROR", error: null });
      setStep(targetStep);
    }
  };

  // ── Loading / Not Found ─────────────────────────────────────────────────
  if (loading) {
    return (
      <>
        {business?.user_id && <TenantTrackingScripts userId={business.user_id} />}
        <div className="min-h-screen bg-background flex items-center justify-center">
          <div className="animate-pulse text-muted-foreground">Loading...</div>
        </div>
      </>
    );
  }

  if (notFound) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardContent className="pt-6 text-center">
            <Wrench className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold mb-2">Shop Not Found</h1>
            <p className="text-muted-foreground">This booking link is invalid or has expired.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Render ──────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen overflow-x-hidden bg-background">
      {slug && <FloatingVoiceAgent slug={slug} businessName={business?.business_name ?? undefined} />}
      {/* Tenant tracking (GA4 / Google Ads / Meta Pixel) — must be mounted on the rendered page,
          not only the loading branch, so scripts actually inject on the live booking page. */}
      {business?.user_id && <TenantTrackingScripts userId={business.user_id} />}
      {/* ⚡ Schema.org JSON-LD for rich snippets */}
      {business && (
        <BookingJsonLd
          businessName={business.business_name || "Auto Shop"}
          address={business.address || undefined}
          phone={business.phone || undefined}
          email={business.email || undefined}
          logoUrl={business.logo_url || undefined}
          bookingUrl={window.location.href}
          services={services.map(s => ({ name: s.name, price: s.default_price, description: s.description }))}
        />
      )}
      {/* Header */}
      <header className="bg-card border-b border-border sticky top-0 z-10">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {business?.logo_url ? (
                <ProgressiveImage src={business.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-cover" placeholderClassName="h-10 w-10 rounded-lg" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
              ) : (
                <div className="bg-primary text-primary-foreground rounded-lg p-2">
                  <Wrench className="h-5 w-5" />
                </div>
              )}
              <span className="font-semibold text-lg">{business?.business_name || "Auto Shop"}</span>
            </div>
            <div className="flex items-center gap-4">
              {bs.step < 6 && (
                <span className="text-sm text-muted-foreground hidden sm:inline">Step {bs.step} of 5</span>
              )}
              {business?.user_id && bs.step < 6 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setQuoteRequestOpen(true)}
                >
                  Just need a price?
                </Button>
              )}
              {business?.user_id && (
                <CustomerLoginButton
                  providerId={business.user_id}
                  providerName={business.business_name || undefined}
                />
              )}
            </div>

          </div>
        </div>
      </header>

      {business?.user_id && (
        <QuoteRequestDialog
          open={quoteRequestOpen}
          onOpenChange={setQuoteRequestOpen}
          businessUserId={business.user_id}
          businessName={business.business_name || undefined}
          source="public_booking"
          defaults={{
            name: bs.guestName || undefined,
            email: bs.guestEmail || undefined,
            phone: bs.guestPhone || undefined,

          }}
        />
      )}



      {/* Progress */}
      {bs.step < 6 && (
        <div className="bg-muted/30 border-b border-border">
          <div className="container mx-auto px-4 py-3">
            <CheckoutProgress
              currentStep={bs.step}
              onStepClick={handleStepClick}
              completedSteps={Array.from({ length: bs.step - 1 }, (_, i) => i + 1)}
            />
          </div>
        </div>
      )}

      <main className="container mx-auto max-w-4xl px-4 py-6 pb-40 sm:py-8 sm:pb-44">
        {/* Step 1: Location */}
        {bs.step === 1 && (
          <LocationStep
            customerAddress={bs.customerAddress}
            addressLine2={bs.addressLine2}
            setCustomerAddress={(v) => dispatch({ type: "SET_ADDRESS_FIELD", field: "customerAddress", value: v })}
            setAddressLine2={(v) => dispatch({ type: "SET_ADDRESS_FIELD", field: "addressLine2", value: v })}
            city={bs.city}
            setCity={(v) => dispatch({ type: "SET_ADDRESS_FIELD", field: "city", value: v })}
            state={bs.state}
            setState={(v) => dispatch({ type: "SET_ADDRESS_FIELD", field: "state", value: v })}
            zipCode={bs.zipCode}
            setZipCode={(v) => dispatch({ type: "SET_ADDRESS_FIELD", field: "zipCode", value: v })}
            locationVerified={bs.locationVerified}
            setLocationVerified={(v) => dispatch({ type: "SET_LOCATION_VERIFIED", verified: v })}
            distanceMessage={bs.distanceMessage}
          />
        )}

        {/* Step 2: Vehicle entry */}
        {bs.step === 2 && (
          <VehicleStep
            vehicles={bs.vehicles}
            onVehiclesChange={(v) => dispatch({ type: "SET_VEHICLES", vehicles: v })}
            vehicleSelector={needsTireFitment && !needsOilFitment ? "wheel_tire" : "ymm_engine"}
            showFluidSpecs={needsOilFitment && bs.vehicles.length === 1}
            bookingRequirements={bookingRequirements}
            businessUserId={business?.user_id}
            detailingRules={detailingRules}
          />
        )}

        {/* Step 3: Assign services independently to each vehicle */}
        {bs.step === 3 && (
          <ServiceSelectionStep
            services={services}
            packages={packages}
            subscriptionPlans={subscriptionPlans}
            selectedServices={bs.selectedServices}
            selectedPackage={bs.selectedPackage}
            vehicles={bs.vehicles}
            vehicleServiceSelections={bs.vehicleServiceSelections}
            onVehicleServiceChange={(vehicleId, selection) => dispatch({ type: "SET_VEHICLE_SERVICE_SELECTION", vehicleId, selection })}
            onVehicleChange={(vehicleId, patch) => dispatch({ type: "SET_VEHICLES", vehicles: bs.vehicles.map((vehicle) => vehicle.id === vehicleId ? { ...vehicle, ...patch } : vehicle) })}
            businessUserId={business?.user_id}
            serviceViewMode={bs.serviceViewMode}
            setServiceViewMode={(v) => dispatch({ type: "SET_SERVICE_VIEW_MODE", mode: v })}
            onToggleService={toggleService}
            onSelectPackage={selectPackage}
            formatCurrency={pricing.formatCurrency}
            getTotalPrice={pricing.getTotalPrice}
            getTotalDuration={pricing.getTotalDuration}
            serviceDisplayMode={business?.service_display_mode || "full_list"}
            detailingRules={detailingRules}
          />
        )}

        {/* Step 4: Date & Time */}
        {bs.step === 4 && (
          <DateTimeStep
            selectedDate={bs.selectedDate}
            setSelectedDate={(d) => dispatch({ type: "SET_SELECTED_DATE", date: d })}
            selectedTime={bs.selectedTime}
            setSelectedTime={(t) => dispatch({ type: "SET_SELECTED_TIME", time: t })}
            bookedSlots={bs.bookedSlots}
            loadingSlots={bs.loadingSlots}
            workingDays={areaWorkingDays && areaWorkingDays.length > 0 ? areaWorkingDays : (business?.working_days || null)}
            dayHours={areaWorkingDays && areaWorkingDays.length > 0 ? null : (business?.day_hours || null)}
            maxAdvanceDays={business?.max_advance_days || 30}
            slotDurationMinutes={business?.slot_duration_minutes || 60}
            blockedDates={blockedDates}
            timeSlots={slots.timeSlots}
            isSlotBlocked={slots.isSlotBlocked}
            isSlotTooSoon={slots.isSlotTooSoon}
            isWeatherBlocked={weatherGuard.isWeatherBlocked}
            isDayWeatherBlocked={weatherGuard.isDayWeatherBlocked}
            weatherBlockedSlots={weatherGuard.blockedSlots}
            weatherLoading={weatherGuard.loading}
            weatherError={weatherGuard.error}
            slotDecision={slotWeatherDecision.result}
            slotDecisionLoading={slotWeatherDecision.loading}
            onAcknowledgeReschedule={slotWeatherDecision.dismiss}
            onClearSlot={() => {
              dispatch({ type: "SET_SELECTED_TIME", time: "" });
              suggestNext.reset();
            }}
            suggestedSlots={suggestNext.suggestions}
            suggestionsLoading={suggestNext.loading}
            suggestionsError={suggestNext.error}
            onRequestSuggestions={() => {
              if (bs.selectedDate) suggestNext.findSuggestions(bs.selectedDate);
            }}
            onSelectSuggestion={(date, time) => {
              const sameDay =
                bs.selectedDate &&
                bs.selectedDate.toDateString() === date.toDateString();
              if (sameDay) {
                dispatch({ type: "SET_SELECTED_TIME", time });
              } else {
                // useBookingSlots clears the selected time when the date
                // changes, so wait one tick before applying the new time.
                dispatch({ type: "SET_SELECTED_DATE", date });
                setTimeout(() => dispatch({ type: "SET_SELECTED_TIME", time }), 50);
              }
              suggestNext.reset();
            }}
            formatCurrency={pricing.formatCurrency}
            getTotalDuration={pricing.getTotalDuration}
            getTotalPrice={pricing.getTotalPrice}
            selectedServiceNames={
              bs.selectedPackage ? bs.selectedPackage.name : bs.selectedServices.map((s) => s.name).join(", ")
            }
          />
        )}

        {/* Step 5a: Add-ons / Coupon / Rewards */}
        {bs.step === 5 && step5View === "options" && business && (
          <CheckoutOptionsStep
            vehicles={bs.vehicles}
            selectedServices={bs.selectedServices}
            onAddService={(service) => {
              const catalogService = services.find((item) => item.id === service.id);
              const normalizedService: ServiceCatalogItem = {
                id: service.id,
                name: service.name,
                description: service.description ?? null,
                default_price: service.default_price,
                estimated_duration: null,
                category: service.category ?? null,
                category_id: catalogService?.category_id ?? null,
                booking_requirements: catalogService?.booking_requirements ?? ["basic_vehicle"],
              };
              dispatch({ type: "SET_SELECTED_SERVICES", services: [...bs.selectedServices, normalizedService] });
            }}
            onRemoveService={(serviceId: string) => {
              dispatch({
                type: "SET_SELECTED_SERVICES",
                services: bs.selectedServices.filter((s) => s.id !== serviceId),
              });
            }}
            getTotalPrice={pricing.getTotalPrice}
            getOilPriceAdjustment={pricing.getOilPriceAdjustment}
            getOilPriceBreakdown={pricing.getOilPriceBreakdown}
            formatCurrency={pricing.formatCurrency}
            businessUserId={business.user_id}
            guestEmail={bs.guestEmail}
            selectedRewardInstanceId={bs.selectedRewardInstanceId}
            onSelectedRewardInstanceChange={setSelectedRewardInstance}
            taxLoading={bs.taxLoading}
            taxData={bs.taxData}
            appliedCoupon={bs.appliedCoupon}
            setAppliedCoupon={(c) => dispatch({ type: "SET_APPLIED_COUPON", coupon: c })}
            feeSettings={feeSettings || undefined}
            detailingQuote={pricing.detailingQuote}
            paymentChoice={bs.paymentChoice}
          />
        )}

        {/* Step 5b: Contact & Payment */}
        {bs.step === 5 && step5View === "contact" && business && (
          <ContactPaymentStep
            guestName={bs.guestName}
            setGuestName={(v) => dispatch({ type: "SET_GUEST_FIELD", field: "guestName", value: v })}
            guestEmail={bs.guestEmail}
            setGuestEmail={(v) => dispatch({ type: "SET_GUEST_FIELD", field: "guestEmail", value: v })}
            guestPhone={bs.guestPhone}
            setGuestPhone={(v) => dispatch({ type: "SET_GUEST_FIELD", field: "guestPhone", value: v })}
            notes={bs.notes}
            setNotes={(v) => dispatch({ type: "SET_GUEST_FIELD", field: "notes", value: v })}
            emailVerified={bs.emailVerified}
            setEmailVerified={(v) => dispatch({ type: "SET_EMAIL_VERIFIED", verified: v })}
            paymentChoice={bs.paymentChoice}
            setPaymentChoice={(v) => dispatch({ type: "SET_PAYMENT_CHOICE", choice: v })}
            transactionalSmsConsent={bs.transactionalSmsConsent}
            setTransactionalSmsConsent={(value) => dispatch({ type: "SET_CONSENT_FIELD", field: "transactionalSmsConsent", value })}
            marketingSmsConsent={bs.marketingSmsConsent}
            setMarketingSmsConsent={(value) => dispatch({ type: "SET_CONSENT_FIELD", field: "marketingSmsConsent", value })}
            marketingEmailConsent={bs.marketingEmailConsent}
            setMarketingEmailConsent={(value) => dispatch({ type: "SET_CONSENT_FIELD", field: "marketingEmailConsent", value })}
            processingPayment={bs.processingPayment}
            paymentsEnabled={(() => {
              const p = business?.payment_provider;
              if (!p || p === "none" || pricing.detailingQuote.quoteRequired) return false;
              if (p === "square") return business?.square_charges_enabled || false;
              return business?.stripe_charges_enabled || false;
            })()}
            paymentProviderName={business?.payment_provider === "square" ? "Square" : "Stripe"}
            businessUserId={business?.user_id || ""}
            businessName={business?.business_name || ""}
            vehicles={bs.vehicles}
            selectedServices={bs.selectedServices}
            vehicleServiceSelections={bs.vehicleServiceSelections}
            selectedDate={bs.selectedDate}
            selectedTime={bs.selectedTime}
            customerAddress={bs.customerAddress}
            addressLine2={bs.addressLine2}
            city={bs.city}
            state={bs.state}
            zipCode={bs.zipCode}
            taxData={bs.taxData}
            getGrandTotal={pricing.getGrandTotal}
            quoteRequired={pricing.detailingQuote.quoteRequired}
            formatCurrency={pricing.formatCurrency}
            oilPricePerQuart={business?.oil_price_per_quart ?? DEFAULT_OIL_PRICE_PER_QUART}
            getPreTaxTotal={pricing.getPreTaxTotal}
            feeBreakdown={pricing.feeBreakdown}
            feeSettings={feeSettings || undefined}
            onPayNow={submit.handlePayNow}
            checkoutError={bs.checkoutError}
            setCheckoutError={(v) => dispatch({ type: "SET_CHECKOUT_ERROR", error: v })}
            setStep={setStep}
            showAuthDialog={bs.showAuthDialog}
            setShowAuthDialog={(v) => dispatch({ type: "SET_SHOW_AUTH_DIALOG", show: v })}
            authMode={bs.authMode}
            setAuthMode={(v) => dispatch({ type: "SET_AUTH_MODE", mode: v })}
            onAuthSuccess={() => {
              dispatch({ type: "SET_SHOW_AUTH_DIALOG", show: false });
              dispatch({ type: "SET_EMAIL_VERIFIED", verified: true });
              fetchCurrentBookingUser().then(({ data }) => {
                if (data?.user?.email) dispatch({ type: "SET_GUEST_FIELD", field: "guestEmail", value: data.user.email });
                if (!data?.user?.id) return;

                fetchBookingCustomerAccount(data.user.id).then(({ data: account }) => {
                  if (account?.full_name) dispatch({ type: "SET_GUEST_FIELD", field: "guestName", value: account.full_name });
                  if (account?.phone) dispatch({ type: "SET_GUEST_FIELD", field: "guestPhone", value: account.phone });
                });
              });
            }}
            onCreateAccount={submit.handleCreateAccount}
            onSubmitRetry={submit.handleSubmit}
          />
        )}

        {/* Step 6: Confirmation */}
        {bs.step === 6 && (
          <ConfirmationStep
            businessName={business?.business_name || "Auto Shop"}
            guestEmail={bs.guestEmail}
            vehicles={bs.vehicles}
            vehicleServiceSelections={bs.vehicleServiceSelections}
            selectedDate={bs.selectedDate}
            selectedTime={bs.selectedTime}
            customerAddress={bs.customerAddress}
            city={bs.city}
            state={bs.state}
            zipCode={bs.zipCode}
            paymentChoice={bs.paymentChoice}
            formatCurrency={pricing.formatCurrency}
            getGrandTotal={pricing.getGrandTotal}
            confirmationEmailStatus={bs.confirmationEmailStatus}
          />
        )}

        {bs.step < 6 && (
          <AppointmentBar
            vehicles={bs.vehicles}
            serviceName={bs.selectedPackage?.name || bs.selectedServices.map((service) => service.name).join(", ")}
            selectedDate={bs.selectedDate}
            selectedTime={bs.selectedTime}
            address={[bs.customerAddress, bs.addressLine2, bs.city, bs.state, bs.zipCode].filter(Boolean).join(", ")}
            total={pricing.formatCurrency(pricing.grandTotal)}
          />
        )}

        {/* Navigation */}
        {bs.step < 6 && (
          <StickyActionBar>
            <Button
              variant="outline"
              onClick={() => {
                if (bs.step === 5 && step5View === "contact") {
                  setStep5View("options");
                  window.scrollTo({ top: 0, behavior: "smooth" });
                  return;
                }
                setStep(bs.step - 1);
              }}
              disabled={bs.step === 1}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>

            {!(bs.step === 5 && step5View === "contact" && bs.paymentChoice === "pay_now" && (business?.stripe_charges_enabled || business?.square_charges_enabled)) && (
              <div
                className="flex flex-col items-end gap-1"
                onPointerDownCapture={() => {
                  if (bs.step === 5 && step5View === "contact") setContactAttempted(true);
                }}
              >
                <Button onClick={handleNext} disabled={!canProceed() || bs.submitting} className="gap-2">
                  {bs.submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : bs.step === 5 && step5View === "contact" ? (
                    "Complete Booking"
                  ) : (
                    <>
                      Continue
                      <ArrowRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
                {bs.step === 5 && step5View === "contact" && !bs.emailVerified && (
                  <p className="text-muted-foreground text-xs">
                    Enter your email above, then continue as a guest or sign in.
                  </p>
                )}
                {bs.step === 5 &&
                  step5View === "contact" &&
                  bs.emailVerified &&
                  (contactAttempted || !!bs.guestName.trim() || !!bs.guestPhone.trim()) &&
                  missingStep5Fields().length > 0 && (
                    <p className="text-xs text-destructive">
                      Please fill in: {missingStep5Fields().join(", ")}
                    </p>
                  )}

              </div>
            )}
          </StickyActionBar>
        )}
      </main>
    </div>
  );
};

export default PublicBooking;
