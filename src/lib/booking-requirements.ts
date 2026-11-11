import type { VehicleData } from "@/components/booking/VehicleEntry";
import type { BookingRequirement } from "@/lib/service-category-policy";
import { hasValidRequestedTireQuantity } from "@/lib/tire-quantity";

export const TIRE_SIZE_PATTERN = /^(P|LT)?\d{3}\/\d{2}\s?(R|ZR)\d{2}([A-Z0-9]*)?$/i;

export function mergeBookingRequirements(requirementSets: Array<BookingRequirement[] | null | undefined>): BookingRequirement[] {
  const merged = new Set<BookingRequirement>();
  requirementSets.forEach((requirements) => requirements?.forEach((requirement) => merged.add(requirement)));
  if (merged.size === 0) merged.add("basic_vehicle");
  return Array.from(merged);
}

/** Canonical VIN format (same charset/length as the platform VIN helper). */
export const VIN_FORMAT_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

/**
 * Owner-ruled vehicle identification for the public booking flow: a vehicle
 * counts as identified when the customer gives ONE of the VIN or the license
 * plate (either alone is enough — both are never required). When neither is
 * given, the customer is on the manual year/make/model path and the engine is
 * required as well.
 */
export function vehicleHasRequiredIdentification(vehicle: VehicleData): boolean {
  if (VIN_FORMAT_PATTERN.test((vehicle.vin || "").trim().toUpperCase())) return true;
  if ((vehicle.licensePlate || "").trim().length > 0) return true;
  return Boolean(vehicle.year && vehicle.make && vehicle.model && vehicle.engine?.trim());
}

export function vehicleMeetsBookingRequirements(vehicle: VehicleData, requirements: BookingRequirement[]): boolean {
  if (!vehicle.year || !vehicle.make || !vehicle.model) return false;
  if (requirements.includes("tire_fitment") && !TIRE_SIZE_PATTERN.test(vehicle.tireSize?.trim() || "")) return false;
  if (requirements.includes("tire_quantity") && !hasValidRequestedTireQuantity(vehicle)) return false;
  if (requirements.includes("detailing_assessment")) {
    if (!vehicle.detailingVehicleSize || !vehicle.detailingCondition || !vehicle.detailingMobileAccessConfirmed) return false;
    if (vehicle.detailingPhotoRequired && !vehicle.detailingPhotos?.length) return false;
    if (vehicle.detailingWaterRequired && !vehicle.detailingHasWater) return false;
    if (vehicle.detailingPowerRequired && !vehicle.detailingHasPower) return false;
    if (vehicle.detailingCoveredAreaRequired && !vehicle.detailingHasCoveredArea) return false;
  }
  return true;
}

export function clearIncompatibleVehicleConfiguration(vehicle: VehicleData, requirements: BookingRequirement[]): VehicleData {
  return {
    ...vehicle,
    ...(!requirements.includes("tire_fitment") ? { tireSize: undefined, tireSizeSource: undefined } : {}),
    ...(!requirements.includes("detailing_assessment") ? { detailingVehicleSize: undefined, detailingCondition: undefined, detailingHasWater:undefined,detailingHasPower:undefined,detailingHasCoveredArea:undefined,detailingMobileAccessConfirmed:undefined,detailingPetHair:undefined,detailingBiohazard:undefined,detailingPhotos:undefined,detailingPhotoRequired:undefined,detailingQuoteRequired:undefined,detailingWaterRequired:undefined,detailingPowerRequired:undefined,detailingCoveredAreaRequired:undefined } : {}),
    ...(!requirements.includes("oil_fitment") ? { oilType: undefined, oilCapacity: undefined, oilCapacitySource: undefined } : {}),
  };
}
