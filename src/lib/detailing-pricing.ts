import type { VehicleData } from "@/components/booking/VehicleEntry";

export type DetailingSize = "compact" | "midsize" | "large" | "oversize";
export type DetailingCondition = "light" | "moderate" | "heavy";

export interface DetailingPricingRule {
  id?: string;
  serviceCatalogId: string | null;
  sizeTier: DetailingSize;
  condition: DetailingCondition;
  priceMultiplier: number;
  durationMultiplier: number;
  flatFee: number;
  photoRequired: boolean;
  quoteRequired: boolean;
  requiresWater: boolean;
  requiresPower: boolean;
  requiresCoveredArea: boolean;
}

export interface DetailingQuoteResult {
  adjustment: number;
  durationAdjustment: number;
  photoRequired: boolean;
  quoteRequired: boolean;
  requirements: { water: boolean; power: boolean; coveredArea: boolean };
  estimateLabel: "Starting estimate" | "Quote required";
}

const SIZE_MULTIPLIER: Record<DetailingSize, number> = { compact: 1, midsize: 1.15, large: 1.3, oversize: 1.55 };
const CONDITION_MULTIPLIER: Record<DetailingCondition, number> = { light: 1, moderate: 1.25, heavy: 1.6 };

export function defaultDetailingRule(sizeTier: DetailingSize, condition: DetailingCondition): DetailingPricingRule {
  return {
    serviceCatalogId: null,
    sizeTier,
    condition,
    priceMultiplier: SIZE_MULTIPLIER[sizeTier] * CONDITION_MULTIPLIER[condition],
    durationMultiplier: Math.max(SIZE_MULTIPLIER[sizeTier], CONDITION_MULTIPLIER[condition]),
    flatFee: 0,
    photoRequired: condition === "heavy",
    quoteRequired: condition === "heavy" || sizeTier === "oversize",
    requiresWater: false,
    requiresPower: false,
    requiresCoveredArea: false,
  };
}

export function resolveDetailingRule(rules: DetailingPricingRule[], vehicle: VehicleData, serviceId?: string): DetailingPricingRule | null {
  if (!vehicle.detailingVehicleSize || !vehicle.detailingCondition) return null;
  return rules.find((rule) => rule.serviceCatalogId === serviceId && rule.sizeTier === vehicle.detailingVehicleSize && rule.condition === vehicle.detailingCondition)
    || rules.find((rule) => rule.serviceCatalogId === null && rule.sizeTier === vehicle.detailingVehicleSize && rule.condition === vehicle.detailingCondition)
    || defaultDetailingRule(vehicle.detailingVehicleSize, vehicle.detailingCondition);
}

export function calculateDetailingQuote(basePrice: number, baseDuration: number, vehicles: VehicleData[], rules: DetailingPricingRule[], serviceId?: string): DetailingQuoteResult {
  return vehicles.reduce<DetailingQuoteResult>((quote, vehicle) => {
    const rule = resolveDetailingRule(rules, vehicle, serviceId);
    if (!rule) return quote;
    quote.adjustment += Math.max(0, basePrice * (rule.priceMultiplier - 1) + rule.flatFee);
    quote.durationAdjustment += Math.max(0, Math.round(baseDuration * (rule.durationMultiplier - 1)));
    quote.photoRequired ||= rule.photoRequired;
    quote.quoteRequired ||= rule.quoteRequired;
    quote.requirements.water ||= rule.requiresWater;
    quote.requirements.power ||= rule.requiresPower;
    quote.requirements.coveredArea ||= rule.requiresCoveredArea;
    quote.estimateLabel = quote.quoteRequired ? "Quote required" : "Starting estimate";
    return quote;
  }, { adjustment: 0, durationAdjustment: 0, photoRequired: false, quoteRequired: false, requirements: { water: false, power: false, coveredArea: false }, estimateLabel: "Starting estimate" });
}
