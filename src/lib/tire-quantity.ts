import type { VehicleData } from "@/components/booking/VehicleEntry";

export const DEFAULT_TIRE_QUANTITIES = {
  standard: { tireFrontQuantity: 4, tireRearQuantity: 0 },
  staggered: { tireFrontQuantity: 2, tireRearQuantity: 2 },
} as const;

const ALLOWED_STANDARD_QUANTITIES = new Set([1, 2, 4]);

export function getInitialTireQuantities(isStaggered: boolean) {
  return isStaggered
    ? { ...DEFAULT_TIRE_QUANTITIES.staggered }
    : { ...DEFAULT_TIRE_QUANTITIES.standard };
}

export function reconcileTireQuantitiesForFitment(
  vehicle: Pick<VehicleData, "rearTireSize" | "tireFrontQuantity" | "tireRearQuantity">,
  nextRearTireSize: string | undefined,
) {
  const wasStaggered = Boolean(vehicle.rearTireSize?.trim());
  const isStaggered = Boolean(nextRearTireSize?.trim());

  if (isStaggered) {
    if (!wasStaggered) return getInitialTireQuantities(true);

    return {
      tireFrontQuantity:
        vehicle.tireFrontQuantity !== undefined && vehicle.tireFrontQuantity <= 2
          ? vehicle.tireFrontQuantity
          : 2,
      tireRearQuantity:
        vehicle.tireRearQuantity !== undefined && vehicle.tireRearQuantity <= 2
          ? vehicle.tireRearQuantity
          : 2,
    };
  }

  if (wasStaggered) {
    const total = (vehicle.tireFrontQuantity ?? 0) + (vehicle.tireRearQuantity ?? 0);
    return {
      tireFrontQuantity: ALLOWED_STANDARD_QUANTITIES.has(total) ? total : 4,
      tireRearQuantity: 0,
    };
  }

  return {
    tireFrontQuantity:
      vehicle.tireFrontQuantity !== undefined &&
      ALLOWED_STANDARD_QUANTITIES.has(vehicle.tireFrontQuantity)
        ? vehicle.tireFrontQuantity
        : 4,
    tireRearQuantity: 0,
  };
}

export function getRequestedTireQuantity(
  vehicle: Pick<VehicleData, "tireFrontQuantity" | "tireRearQuantity">,
): number {
  return (vehicle.tireFrontQuantity ?? 0) + (vehicle.tireRearQuantity ?? 0);
}

export function hasValidRequestedTireQuantity(
  vehicle: Pick<
    VehicleData,
    "rearTireSize" | "tireFrontQuantity" | "tireRearQuantity"
  >,
): boolean {
  const front = vehicle.tireFrontQuantity;
  const rear = vehicle.tireRearQuantity ?? 0;

  if (front === undefined || !Number.isInteger(front) || !Number.isInteger(rear)) return false;

  if (vehicle.rearTireSize?.trim()) {
    return front >= 0 && front <= 2 && rear >= 0 && rear <= 2 && front + rear > 0;
  }

  return ALLOWED_STANDARD_QUANTITIES.has(front) && rear === 0;
}
