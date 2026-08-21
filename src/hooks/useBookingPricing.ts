/**
 * useBookingPricing — Encapsulates all pricing/fee/tax calculations
 * for the public booking flow.
 *
 * Extracted from PublicBooking.tsx to keep the page container as a
 * coordinator only. All monetary logic lives here.
 */

import { useMemo, useCallback } from "react";
import type { BookingState } from "@/hooks/useBookingState";
import { calculateCouponDiscount, type AppliedCoupon } from "@/components/booking/CouponRedemption";
import { formatMoney } from "@/lib/financialMath";
import { calculateExtraOilQuarts, parseOilCapacityToQuarts } from "@/lib/oilCapacity";
import { calculateDetailingQuote, type DetailingPricingRule } from "@/lib/detailing-pricing";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface FeeSettings {
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
}

export interface PricingDeps {
  /** Currently selected services from booking state */
  selectedServices: BookingState["selectedServices"];
  /** Currently selected package (if any) */
  selectedPackage: BookingState["selectedPackage"];
  /** Vehicle list (needed for oil capacity adjustments) */
  vehicles: BookingState["vehicles"];
  /** Optional per-vehicle services/packages. */
  vehicleServiceSelections?: BookingState["vehicleServiceSelections"];
  /** Payment choice affects surcharge calculation */
  paymentChoice: BookingState["paymentChoice"];
  /** Tax data from edge function */
  taxData: BookingState["taxData"];
  /** Business-level fee settings */
  feeSettings: FeeSettings | null;
  /** Oil price per extra quart (from business settings) */
  oilPricePerQuart: number;
  /** Currency code for formatting */
  currency: string;
  /**
   * Category-driven gate for fluid-related fees. Tire and detailing services
   * must never be charged a waste-oil disposal fee. Defaults to true.
   */
  allowFluidFees?: boolean;
  /** Applied coupon (drives discountAmount). */
  appliedCoupon?: AppliedCoupon | null;
  /** Detailing pricing rules loaded for this business. */
  detailingRules?: DetailingPricingRule[];
  /** Service ids that resolve to a detailing category. */
  detailingServiceIds?: string[];
}

type PricedService =
  | BookingState["selectedServices"][number]
  | NonNullable<BookingState["selectedPackage"]>["services"][number];

// ---------------------------------------------------------------------------
// Pure helpers (no hooks, testable)
// ---------------------------------------------------------------------------

function isCategorizedService(service: PricedService): service is BookingState["selectedServices"][number] {
  return "category" in service;
}

/** Parse oil capacity from string (e.g., "5.7 qts" -> 5.7) */
export function parseOilCapacity(capacity: string | undefined): number {
  return parseOilCapacityToQuarts(capacity) ?? 0;
}

/** Format an amount with the correct currency symbol. */
export function buildFormatCurrency(currency: string) {
  const symbol =
    currency === "GHS" ? "₵" :
    currency === "NGN" ? "₦" :
    currency === "EUR" ? "€" :
    currency === "GBP" ? "£" : "$";
  return (amount: number) => `${symbol}${formatMoney(amount)}`;
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookingPricing(deps: PricingDeps) {
  const {
    selectedServices,
    selectedPackage,
    vehicles,
    vehicleServiceSelections = {},
    paymentChoice,
    taxData,
    feeSettings,
    oilPricePerQuart,
    currency,
    allowFluidFees = true,
    appliedCoupon = null,
    detailingRules = [],
    detailingServiceIds = [],
  } = deps;


  const formatCurrency = useMemo(() => buildFormatCurrency(currency), [currency]);

  /** Get every service line represented by every vehicle selection. */
  const vehicleSelections = useMemo<BookingState["vehicleServiceSelections"][string][]>(() => Object.values(vehicleServiceSelections).filter((selection) => selection.services.length > 0 || selection.package), [vehicleServiceSelections]);
  const activeServicesForPricing = useMemo<PricedService[]>(() => {
    if (vehicleSelections.length > 0) {
      return vehicleSelections.flatMap((selection): PricedService[] => selection.package?.services?.length ? selection.package.services : selection.services);
    }
    if (selectedPackage?.services?.length) return selectedPackage.services;
    return selectedServices;
  }, [vehicleSelections, selectedPackage, selectedServices]);
  const packageSubtotal = useMemo(() => vehicleSelections.reduce((sum, selection) => sum + (selection.package?.package_price || 0), 0), [vehicleSelections]);

  /**
   * Oil price breakdown — structured to make per-quart math visible end-to-end.
   * Always whole-quart rounding (Math.ceil) × full per-quart price. No division.
   *
   * IMPORTANT: bill only resolved vehicle-spec capacities. Liter values are
   * converted to quarts before whole-quart rounding.
   */
  const oilPriceBreakdown = useMemo(() => {
    const hasOilService = activeServicesForPricing.some((s) =>
      s.name.toLowerCase().includes("oil") ||
      (isCategorizedService(s) &&
        typeof s.category === "string" &&
        s.category.toLowerCase().includes("oil"))
    );
    if (!hasOilService) {
      return { extraQuarts: 0, pricePerQuart: oilPricePerQuart, total: 0 };
    }

    const extraQuarts = vehicles.reduce((sum, vehicle) => {
      const hasBillableCapacity =
        vehicle.oilCapacitySource === "db" ||
        vehicle.oilCapacitySource === "ai" ||
        vehicle.oilCapacitySource === "manual";
      if (!hasBillableCapacity) return sum;
      return sum + calculateExtraOilQuarts(vehicle.oilCapacity);
    }, 0);

    return {
      extraQuarts,
      pricePerQuart: oilPricePerQuart,
      total: extraQuarts * oilPricePerQuart,
    };
  }, [activeServicesForPricing, vehicles, oilPricePerQuart]);

  /** Backward-compatible dollar total (sum). */
  const oilPriceAdjustment = oilPriceBreakdown.total;

  const tireInventoryTotal = useMemo(() => vehicles.reduce((sum, vehicle) => {
    const quantity = Math.max(0, vehicle.tireFrontQuantity || 0) + Math.max(0, vehicle.tireRearQuantity || 0);
    return sum + (vehicle.tireInventoryItemId ? Number(vehicle.tireUnitPrice || 0) * quantity : 0);
  }, 0), [vehicles]);

  const detailingQuote = useMemo(() => activeServicesForPricing.reduce((quote, service) => {
    if (!detailingServiceIds.includes(service.id)) return quote;
    const servicePrice = "default_price" in service ? service.default_price : service.price || 0;
    const serviceDuration = "estimated_duration" in service ? service.estimated_duration || 60 : 60;
    const next=calculateDetailingQuote(Number(servicePrice),Number(serviceDuration),vehicles,detailingRules,service.id);
    quote.adjustment+=next.adjustment;quote.durationAdjustment+=next.durationAdjustment;quote.photoRequired||=next.photoRequired;quote.quoteRequired||=next.quoteRequired;quote.requirements.water||=next.requirements.water;quote.requirements.power||=next.requirements.power;quote.requirements.coveredArea||=next.requirements.coveredArea;quote.estimateLabel=quote.quoteRequired?"Quote required":"Starting estimate";return quote;
  }, {adjustment:0,durationAdjustment:0,photoRequired:false,quoteRequired:false,requirements:{water:false,power:false,coveredArea:false},estimateLabel:"Starting estimate" as "Starting estimate"|"Quote required"}), [activeServicesForPricing,detailingRules,detailingServiceIds,vehicles]);

  /** Subtotal before fees and tax. */
  const totalPrice = useMemo(() => {
    if (vehicleSelections.length > 0) {
      const individualSubtotal = vehicleSelections.reduce((sum, selection) => sum + selection.services.reduce((serviceSum, service) => serviceSum + service.default_price, 0), 0);
      return packageSubtotal + individualSubtotal + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
    }
    if (selectedPackage) return Number(selectedPackage.package_price) + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
    return selectedServices.reduce((sum, s) => sum + s.default_price, 0) + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
  }, [vehicleSelections, packageSubtotal, selectedPackage, selectedServices, oilPriceAdjustment, tireInventoryTotal, detailingQuote.adjustment]);

  const discountAmount = useMemo(
    () => calculateCouponDiscount(appliedCoupon, totalPrice),
    [appliedCoupon, totalPrice],
  );

  /** Fee breakdown (waste oil, shop fee, surcharge). */
  const feeBreakdown = useMemo(() => {
    const wasteOilFee = allowFluidFees && feeSettings?.waste_oil_fee_enabled ? (feeSettings.waste_oil_fee || 0) : 0;

    let shopFee = 0;
    if (feeSettings?.shop_fee_enabled) {
      shopFee = (feeSettings.shop_fee_type || "fixed") === "percentage"
        ? totalPrice * ((feeSettings.shop_fee_value || 0) / 100)
        : feeSettings.shop_fee_value || 0;
    }

    let surcharge = 0;
    if (paymentChoice === "pay_now" && feeSettings?.surcharge_enabled) {
      const surchargeBase = totalPrice + wasteOilFee + shopFee;
      surcharge = (feeSettings.surcharge_type || "percentage") === "percentage"
        ? surchargeBase * ((feeSettings.surcharge_value || 0) / 100)
        : feeSettings.surcharge_value || 0;
    }

    return { wasteOilFee, shopFee, surcharge };
  }, [totalPrice, paymentChoice, feeSettings, allowFluidFees]);

  /** Pre-tax total (subtotal + fees). */
  const preTaxTotal = useMemo(
    () => totalPrice - discountAmount + feeBreakdown.wasteOilFee + feeBreakdown.shopFee + feeBreakdown.surcharge,
    [totalPrice, discountAmount, feeBreakdown],
  );

  /** Grand total (after tax if available). */
  const grandTotal = useMemo(
    () => (taxData ? taxData.total : preTaxTotal),
    [taxData, preTaxTotal],
  );

  /** Total estimated duration in minutes. */
  const totalDuration = useMemo(() => {
    const serviceDuration = vehicleSelections.length > 0
      ? vehicleSelections.reduce((sum, selection) => sum + (selection.package ? (selection.package.estimated_duration || 60) : selection.services.reduce((serviceSum, service) => serviceSum + (service.estimated_duration || 60), 0)), 0)
      : selectedPackage ? selectedPackage.estimated_duration || 60 : selectedServices.reduce((sum, s) => sum + (s.estimated_duration || 60), 0);
    // Tire fulfillment consumes lift/balancer capacity per wheel. Preserve configured
    // service time, but never expose a slot shorter than the physical tire workload.
    const tireCapacityMinutes = vehicles.reduce((sum,vehicle)=>sum+((vehicle.tireInventoryItemId ? (vehicle.tireFrontQuantity||0)+(vehicle.tireRearQuantity||0) : 0)*20),0);
    return Math.max(serviceDuration+detailingQuote.durationAdjustment,tireCapacityMinutes);
  }, [vehicleSelections, selectedPackage, selectedServices, vehicles, detailingQuote.durationAdjustment]);

  // Stable callback versions for child components that expect functions
  const getTotalPrice = useCallback(() => totalPrice, [totalPrice]);
  const getOilPriceAdjustment = useCallback(() => oilPriceAdjustment, [oilPriceAdjustment]);
  const getOilPriceBreakdown = useCallback(() => oilPriceBreakdown, [oilPriceBreakdown]);
  const getFeeBreakdown = useCallback((base: number) => {
    // Re-derive with arbitrary base for backward compat (used by CheckoutOptionsStep)
    const wasteOilFee = allowFluidFees && feeSettings?.waste_oil_fee_enabled ? (feeSettings.waste_oil_fee || 0) : 0;
    let shopFee = 0;
    if (feeSettings?.shop_fee_enabled) {
      shopFee = (feeSettings.shop_fee_type || "fixed") === "percentage"
        ? base * ((feeSettings.shop_fee_value || 0) / 100)
        : feeSettings.shop_fee_value || 0;
    }
    let surcharge = 0;
    if (paymentChoice === "pay_now" && feeSettings?.surcharge_enabled) {
      const surchargeBase = base + wasteOilFee + shopFee;
      surcharge = (feeSettings.surcharge_type || "percentage") === "percentage"
        ? surchargeBase * ((feeSettings.surcharge_value || 0) / 100)
        : feeSettings.surcharge_value || 0;
    }
    return { wasteOilFee, shopFee, surcharge };
  }, [paymentChoice, feeSettings, allowFluidFees]);
  const getPreTaxTotal = useCallback(() => preTaxTotal, [preTaxTotal]);
  const getGrandTotal = useCallback(() => grandTotal, [grandTotal]);
  const getTotalDuration = useCallback(() => totalDuration, [totalDuration]);

  return {
    formatCurrency,
    oilPriceAdjustment,
    oilPriceBreakdown,
    tireInventoryTotal,
    detailingQuote,
    totalPrice,
    discountAmount,
    feeBreakdown,
    preTaxTotal,
    grandTotal,
    totalDuration,
    // Stable callback versions for prop-drilling to step components
    getTotalPrice,
    getOilPriceAdjustment,
    getOilPriceBreakdown,
    getFeeBreakdown,
    getPreTaxTotal,
    getGrandTotal,
    getTotalDuration,
  } as const;
}
