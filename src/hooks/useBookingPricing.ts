/**
 * useBookingPricing — Encapsulates public-booking pricing, fees and tax math.
 */
import { useMemo, useCallback } from "react";
import type { BookingState } from "@/hooks/useBookingState";
import { calculateCouponDiscount, type AppliedCoupon } from "@/components/booking/CouponRedemption";
import { formatMoney } from "@/lib/financialMath";
import { calculateExtraOilQuarts, parseOilCapacityToQuarts } from "@/lib/oilCapacity";
import { calculateDetailingQuote, type DetailingPricingRule } from "@/lib/detailing-pricing";

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
  selectedServices: BookingState["selectedServices"];
  selectedPackage: BookingState["selectedPackage"];
  vehicles: BookingState["vehicles"];
  vehicleServiceSelections?: BookingState["vehicleServiceSelections"];
  paymentChoice: BookingState["paymentChoice"];
  taxData: BookingState["taxData"];
  feeSettings: FeeSettings | null;
  oilPricePerQuart: number;
  currency: string;
  allowFluidFees?: boolean;
  appliedCoupon?: AppliedCoupon | null;
  detailingRules?: DetailingPricingRule[];
  detailingServiceIds?: string[];
}

type PricedService =
  | BookingState["selectedServices"][number]
  | NonNullable<BookingState["selectedPackage"]>["services"][number];

function isCategorizedService(service: PricedService): service is BookingState["selectedServices"][number] {
  return "category" in service;
}

function isOilService(service: PricedService): boolean {
  if (service.name.toLowerCase().includes("oil")) return true;
  return isCategorizedService(service)
    && typeof service.category === "string"
    && service.category.toLowerCase().includes("oil");
}

export function parseOilCapacity(capacity: string | undefined): number {
  return parseOilCapacityToQuarts(capacity) ?? 0;
}

export function buildFormatCurrency(currency: string) {
  const symbol =
    currency === "GHS" ? "₵" :
    currency === "NGN" ? "₦" :
    currency === "EUR" ? "€" :
    currency === "GBP" ? "£" : "$";
  return (amount: number) => `${symbol}${formatMoney(amount)}`;
}

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

  const vehicleSelections = useMemo<BookingState["vehicleServiceSelections"][string][]>(
    () => Object.values(vehicleServiceSelections).filter((selection) => selection.services.length > 0 || selection.package),
    [vehicleServiceSelections],
  );

  const activeServicesForPricing = useMemo<PricedService[]>(() => {
    if (vehicleSelections.length > 0) {
      return vehicleSelections.flatMap((selection): PricedService[] =>
        selection.package?.services?.length ? selection.package.services : selection.services,
      );
    }
    if (selectedPackage?.services?.length) return selectedPackage.services;
    return selectedServices;
  }, [vehicleSelections, selectedPackage, selectedServices]);

  // Waste-oil disposal is a service-scoped fee, not a provider-entry fee.
  // A shop may be an oil-change provider and still offer non-oil services, so
  // the fee must stay zero until the customer's actual selection contains oil.
  const hasOilService = useMemo(
    () => activeServicesForPricing.some(isOilService),
    [activeServicesForPricing],
  );

  const packageSubtotal = useMemo(
    () => vehicleSelections.reduce((sum, selection) => sum + (selection.package?.package_price || 0), 0),
    [vehicleSelections],
  );

  const oilPriceBreakdown = useMemo(() => {
    if (!hasOilService) return { extraQuarts: 0, pricePerQuart: oilPricePerQuart, total: 0 };

    const extraQuarts = vehicles.reduce((sum, vehicle) => {
      const hasBillableCapacity =
        vehicle.oilCapacitySource === "db" ||
        vehicle.oilCapacitySource === "ai" ||
        vehicle.oilCapacitySource === "manual";
      if (!hasBillableCapacity) return sum;
      return sum + calculateExtraOilQuarts(vehicle.oilCapacity);
    }, 0);

    return { extraQuarts, pricePerQuart: oilPricePerQuart, total: extraQuarts * oilPricePerQuart };
  }, [hasOilService, vehicles, oilPricePerQuart]);

  const oilPriceAdjustment = oilPriceBreakdown.total;

  const tireInventoryTotal = useMemo(() => vehicles.reduce((sum, vehicle) => {
    const quantity = Math.max(0, vehicle.tireFrontQuantity || 0) + Math.max(0, vehicle.tireRearQuantity || 0);
    return sum + (vehicle.tireInventoryItemId ? Number(vehicle.tireUnitPrice || 0) * quantity : 0);
  }, 0), [vehicles]);

  const detailingQuote = useMemo(() => activeServicesForPricing.reduce((quote, service) => {
    if (!detailingServiceIds.includes(service.id)) return quote;
    const servicePrice = "default_price" in service ? service.default_price : service.price || 0;
    const serviceDuration = "estimated_duration" in service ? service.estimated_duration || 60 : 60;
    const next = calculateDetailingQuote(Number(servicePrice), Number(serviceDuration), vehicles, detailingRules, service.id);
    quote.adjustment += next.adjustment;
    quote.durationAdjustment += next.durationAdjustment;
    quote.photoRequired ||= next.photoRequired;
    quote.quoteRequired ||= next.quoteRequired;
    quote.requirements.water ||= next.requirements.water;
    quote.requirements.power ||= next.requirements.power;
    quote.requirements.coveredArea ||= next.requirements.coveredArea;
    quote.estimateLabel = quote.quoteRequired ? "Quote required" : "Starting estimate";
    return quote;
  }, {
    adjustment: 0,
    durationAdjustment: 0,
    photoRequired: false,
    quoteRequired: false,
    requirements: { water: false, power: false, coveredArea: false },
    estimateLabel: "Starting estimate" as "Starting estimate" | "Quote required",
  }), [activeServicesForPricing, detailingRules, detailingServiceIds, vehicles]);

  const totalPrice = useMemo(() => {
    if (vehicleSelections.length > 0) {
      const individualSubtotal = vehicleSelections.reduce(
        (sum, selection) => sum + selection.services.reduce((serviceSum, service) => serviceSum + service.default_price, 0),
        0,
      );
      return packageSubtotal + individualSubtotal + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
    }
    if (selectedPackage) return Number(selectedPackage.package_price) + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
    return selectedServices.reduce((sum, service) => sum + service.default_price, 0) + oilPriceAdjustment + tireInventoryTotal + detailingQuote.adjustment;
  }, [vehicleSelections, packageSubtotal, selectedPackage, selectedServices, oilPriceAdjustment, tireInventoryTotal, detailingQuote.adjustment]);

  const discountAmount = useMemo(
    () => calculateCouponDiscount(appliedCoupon, totalPrice),
    [appliedCoupon, totalPrice],
  );

  const feeBreakdown = useMemo(() => {
    const wasteOilFee = allowFluidFees && hasOilService && feeSettings?.waste_oil_fee_enabled
      ? (feeSettings.waste_oil_fee || 0)
      : 0;

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
  }, [totalPrice, paymentChoice, feeSettings, allowFluidFees, hasOilService]);

  const preTaxTotal = useMemo(
    () => totalPrice - discountAmount + feeBreakdown.wasteOilFee + feeBreakdown.shopFee + feeBreakdown.surcharge,
    [totalPrice, discountAmount, feeBreakdown],
  );

  const grandTotal = useMemo(
    () => (taxData ? taxData.total : preTaxTotal),
    [taxData, preTaxTotal],
  );

  const totalDuration = useMemo(() => {
    const serviceDuration = vehicleSelections.length > 0
      ? vehicleSelections.reduce(
          (sum, selection) => sum + (selection.package
            ? (selection.package.estimated_duration || 60)
            : selection.services.reduce((serviceSum, service) => serviceSum + (service.estimated_duration || 60), 0)),
          0,
        )
      : selectedPackage
        ? selectedPackage.estimated_duration || 60
        : selectedServices.reduce((sum, service) => sum + (service.estimated_duration || 60), 0);
    const tireCapacityMinutes = vehicles.reduce(
      (sum, vehicle) => sum + ((vehicle.tireInventoryItemId
        ? (vehicle.tireFrontQuantity || 0) + (vehicle.tireRearQuantity || 0)
        : 0) * 20),
      0,
    );
    return Math.max(serviceDuration + detailingQuote.durationAdjustment, tireCapacityMinutes);
  }, [vehicleSelections, selectedPackage, selectedServices, vehicles, detailingQuote.durationAdjustment]);

  const getTotalPrice = useCallback(() => totalPrice, [totalPrice]);
  const getOilPriceAdjustment = useCallback(() => oilPriceAdjustment, [oilPriceAdjustment]);
  const getOilPriceBreakdown = useCallback(() => oilPriceBreakdown, [oilPriceBreakdown]);
  const getFeeBreakdown = useCallback((base: number) => {
    const wasteOilFee = allowFluidFees && hasOilService && feeSettings?.waste_oil_fee_enabled
      ? (feeSettings.waste_oil_fee || 0)
      : 0;
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
  }, [paymentChoice, feeSettings, allowFluidFees, hasOilService]);

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
    getTotalPrice,
    getOilPriceAdjustment,
    getOilPriceBreakdown,
    getFeeBreakdown,
    getPreTaxTotal,
    getGrandTotal,
    getTotalDuration,
  } as const;
}
