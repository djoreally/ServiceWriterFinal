import type { Json } from "@/integrations/supabase/types";

export interface DispatchScoreBreakdown {
  technicianId: string;
  technicianName: string;
  totalScore: number;
  factors: { distance: number; timeFit: number; priority: number; grouping: number; load: number };
  rationale: string[];
}

const FLEET_DISPATCH_RETIRED = "Fleet dispatch is separated from Service Writer. Use the Fleet application for Fleet assignments.";

/** Embedded Fleet dispatch scoring is retired from Service Writer. */
export async function getFleetDispatchScoreBreakdown(_workOrderId: string): Promise<DispatchScoreBreakdown[]> {
  return [];
}

export async function assignFleetWorkOrderWithOverride(_input: {
  workOrderId: string;
  technicianId: string;
  vanId?: string | null;
  overrideReason?: string | null;
}): Promise<void> {
  throw new Error(FLEET_DISPATCH_RETIRED);
}

/** Compatibility export for stale callers. Performs no database/provider I/O. */
export async function dispatchFleetWorkOrder(
  _workOrderId: string,
  _technicianId: string,
  _vanId?: string | null,
): Promise<void> {
  throw new Error(FLEET_DISPATCH_RETIRED);
}

// Keep Json type referenced while legacy signatures are being removed downstream.
export type FleetDispatchLegacyDetails = Json;
