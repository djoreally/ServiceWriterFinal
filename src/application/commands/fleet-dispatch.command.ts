import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface DispatchScoreBreakdown {
  technicianId: string;
  technicianName: string;
  totalScore: number;
  factors: { distance: number; timeFit: number; priority: number; grouping: number; load: number };
  rationale: string[];
}

type FleetWorkOrderDispatchRow = Pick<
  Database["public"]["Tables"]["fleet_work_orders"]["Row"],
  "id" | "user_id" | "fleet_client_id" | "priority" | "status" | "assigned_technician_id"
>;
type TechnicianDispatchRow = Pick<Database["public"]["Tables"]["technicians"]["Row"], "id" | "name">;

const ACTIVE_ASSIGNMENT_STATUSES = ["assigned", "scheduled", "en_route", "in_progress"];

async function getCurrentUserId(): Promise<string> {
  const {
    data: { user },
  } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to dispatch work orders.");
  return user.id;
}

export async function getFleetDispatchScoreBreakdown(workOrderId: string): Promise<DispatchScoreBreakdown[]> {
  const userId = await getCurrentUserId();

  const [{ data: order }, { data: technicians }, { data: activeAssignments }] = await Promise.all([
    supabase
      .from("fleet_work_orders")
      .select("id,user_id,fleet_client_id,priority,status,assigned_technician_id")
      .eq("id", workOrderId)
      .eq("user_id", userId)
      .maybeSingle(),
    supabase.from("technicians").select("id,name").eq("is_active", true),
    supabase
      .from("fleet_work_orders")
      .select("id,user_id,fleet_client_id,priority,status,assigned_technician_id")
      .eq("user_id", userId)
      .in("status", ACTIVE_ASSIGNMENT_STATUSES),
  ]);

  if (!order) return [];

  const typedOrder = order as FleetWorkOrderDispatchRow;
  const loadByTech = new Map<string, number>();
  const groupingByTech = new Map<string, number>();

  for (const assignment of (activeAssignments ?? []) as FleetWorkOrderDispatchRow[]) {
    const techId = assignment.assigned_technician_id;
    if (!techId) continue;
    loadByTech.set(techId, (loadByTech.get(techId) ?? 0) + 1);
    if (assignment.fleet_client_id && assignment.fleet_client_id === typedOrder.fleet_client_id) {
      groupingByTech.set(techId, (groupingByTech.get(techId) ?? 0) + 1);
    }
  }

  const priorityWeight = typedOrder.priority === "urgent" ? 1 : typedOrder.priority === "high" ? 0.85 : 0.7;

  return ((technicians ?? []) as TechnicianDispatchRow[])
    .map((tech) => {
      const currentLoad = loadByTech.get(tech.id) ?? 0;
      const groupingHits = groupingByTech.get(tech.id) ?? 0;
      const load = Math.max(0, 100 - currentLoad * 20);
      const grouping = Math.min(100, 40 + groupingHits * 30);
      const distance = Math.max(40, 95 - currentLoad * 10);
      const timeFit = Math.max(35, 90 - currentLoad * 15);
      const priority = Math.round(priorityWeight * 100);
      const totalScore = Math.round(load * 0.2 + grouping * 0.25 + distance * 0.25 + timeFit * 0.2 + priority * 0.1);

      return {
        technicianId: tech.id,
        technicianName: tech.name,
        totalScore,
        factors: { distance, timeFit, priority, grouping, load },
        rationale: [
          `${currentLoad} active assignment(s)`,
          `${groupingHits} same-fleet grouping match(es)`,
          `priority weight ${priority}%`,
        ],
      };
    })
    .sort((a, b) => b.totalScore - a.totalScore);
}

export async function assignFleetWorkOrderWithOverride(input: {
  workOrderId: string;
  technicianId: string;
  vanId?: string | null;
  overrideReason?: string | null;
}): Promise<void> {
  const userId = await getCurrentUserId();

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

  await supabase.from("fleet_activity_logs").insert({
    fleet_work_order_id: input.workOrderId,
    user_id: userId,
    action: isOverride ? "dispatch_override" : "dispatch_scored_assignment",
    actor_role: "provider",
    details: {
      selected_technician_id: input.technicianId,
      selected_score: breakdown.find((entry) => entry.technicianId === input.technicianId)?.totalScore ?? null,
      recommended_technician_id: breakdown[0]?.technicianId ?? null,
      recommended_score: breakdown[0]?.totalScore ?? null,
      override_reason: input.overrideReason ?? null,
      scoring_breakdown: breakdown.slice(0, 5).map((entry) => ({
        technicianId: entry.technicianId,
        technicianName: entry.technicianName,
        totalScore: entry.totalScore,
        factors: entry.factors,
        rationale: entry.rationale,
      })),
    } satisfies Json,
  });
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
