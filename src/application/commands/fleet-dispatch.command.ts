import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface DispatchScoreBreakdown {
  technicianId: string;
  technicianName: string;
  totalScore: number;
  factors: { distance: number; timeFit: number; priority: number; grouping: number; load: number };
  rationale: string[];
}

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to dispatch work orders.");
  return user.id;
}

export async function getFleetDispatchScoreBreakdown(workOrderId: string): Promise<DispatchScoreBreakdown[]> {
  await getCurrentUserId();

  const { data } = await apiClient.get<{ data: DispatchScoreBreakdown[] }>(
    `/v1/fleet/work-orders/${workOrderId}/dispatch-score`,
  );
  return data ?? [];
}

export async function assignFleetWorkOrderWithOverride(input: {
  workOrderId: string;
  technicianId: string;
  vanId?: string | null;
  overrideReason?: string | null;
}): Promise<void> {
  await getCurrentUserId();

  let breakdown: DispatchScoreBreakdown[] = [];
  let isOverride = false;
  try {
    breakdown = await getFleetDispatchScoreBreakdown(input.workOrderId);
    const recommended = breakdown[0];
    const selected = breakdown.find((entry) => entry.technicianId === input.technicianId);
    isOverride = Boolean(recommended && selected && recommended.technicianId !== input.technicianId);
    if (isOverride && !input.overrideReason) {
      throw new Error("Override reason is required when not selecting top recommendation.");
    }
  } catch (scoreErr) {
    if (scoreErr instanceof Error && scoreErr.message.includes("Override reason")) throw scoreErr;
  }

  await dispatchFleetWorkOrder(input.workOrderId, input.technicianId, input.vanId);
}

/**
 * Fleet dispatch is intentionally outside the rebuilt Service Writer dispatch domain.
 * Keep this compatibility export so legacy Fleet screens compile, but do not route
 * Fleet work orders through the Service Writer appointment/repair-order dispatcher.
 */
export async function dispatchFleetWorkOrder(
  _workOrderId: string,
  _technicianId: string,
  _vanId?: string | null,
): Promise<void> {
  throw new Error("Fleet dispatch is separated from Service Writer. Use the Fleet application for Fleet assignments.");
}
