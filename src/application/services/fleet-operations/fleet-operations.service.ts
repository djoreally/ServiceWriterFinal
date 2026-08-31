
import { addDays, formatISO, startOfWeek } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import type { FleetOperationsOverview, FleetServiceRule, FleetUpcomingQueueRow, FleetVehicleOpsRow } from "./types";

type AnyRecord = Record<string, unknown>;
const db = supabase as any;

const DEFAULT_RULE: Omit<FleetServiceRule, "id" | "fleetClientId"> = {
  serviceClass: "light_duty",
  intervalMiles: 5000,
  intervalMonths: 3,
  baseLaborPackage: "PM-A Standard",
  basePrice: 149,
  isActive: true,
};

function buildDeterministicKey(parts: string[]): string {
  let hash = 5381;
  for (const part of parts) {
    for (let index = 0; index < part.length; index += 1) {
      hash = ((hash << 5) + hash) ^ part.charCodeAt(index);
    }
  }
  return `fleetops_${Math.abs(hash >>> 0).toString(36)}`;
}

export async function fetchFleetServiceRules(userId: string): Promise<FleetServiceRule[]> {
  const { data } = await db
    .from("fleet_service_rules")
    .select("id,fleet_client_id,service_class,interval_miles,interval_months,base_labor_package,base_price,is_active")
    .eq("user_id", userId)
    .eq("is_active", true);

  return ((data || []) as AnyRecord[]).map((row) => ({
    id: String(row.id),
    fleetClientId: (row.fleet_client_id as string | null) ?? null,
    serviceClass: String(row.service_class || "light_duty"),
    intervalMiles: Number(row.interval_miles || DEFAULT_RULE.intervalMiles),
    intervalMonths: Number(row.interval_months || DEFAULT_RULE.intervalMonths),
    baseLaborPackage: String(row.base_labor_package || DEFAULT_RULE.baseLaborPackage),
    basePrice: Number(row.base_price || DEFAULT_RULE.basePrice),
    isActive: Boolean(row.is_active),
  }));
}

export async function upsertFleetServiceRule(input: {
  userId: string;
  fleetClientId?: string | null;
  serviceClass: string;
  intervalMiles: number;
  intervalMonths: number;
  baseLaborPackage: string;
  basePrice: number;
}): Promise<void> {
  await db
    .from("fleet_service_rules")
    .upsert(
      {
        user_id: input.userId,
        fleet_client_id: input.fleetClientId || null,
        service_class: input.serviceClass,
        interval_miles: input.intervalMiles,
        interval_months: input.intervalMonths,
        base_labor_package: input.baseLaborPackage,
        base_price: input.basePrice,
        is_active: true,
      },
      { onConflict: "user_id,fleet_client_id,service_class" }
    );
}

async function refreshCanonicalDueState(userId: string): Promise<void> {
  const { error } = await db.rpc("refresh_fleet_due_status", { p_user_id: userId });
  if (error) throw new Error(error.message || "Failed to refresh fleet due state");
}

export async function fetchFleetOperationsOverview(userId: string): Promise<FleetOperationsOverview> {
  await refreshCanonicalDueState(userId);

  const [scheduleRes, historyRes] = await Promise.all([
    db
      .from("fleet_service_schedules")
      .select("id,fleet_client_id,fleet_vehicle_id,rule_id,service_class,due_date,due_mileage,status,base_labor_package,estimated_price,fleet_clients(company_name),fleet_vehicles(unit_number,vin,make,model,year,fleet_location_id,fleet_locations(name),last_service_date,last_service_mileage)")
      .eq("user_id", userId)
      .in("status", ["due", "overdue", "upcoming", "ok"]),
    db
      .from("fleet_work_orders")
      .select("fleet_client_id,completed_at,status")
      .eq("user_id", userId)
      .in("status", ["completed", "invoiced", "paid"]),
  ]);

  const rows: FleetVehicleOpsRow[] = ((scheduleRes.data || []) as AnyRecord[]).map((row) => {
    const vehicle = (row.fleet_vehicles as AnyRecord | null) || {};
    const location = (vehicle.fleet_locations as AnyRecord | null) || null;

    return {
      vehicleId: String(row.fleet_vehicle_id),
      fleetClientId: (row.fleet_client_id as string | null) ?? null,
      fleetClientName: ((row.fleet_clients as AnyRecord | null)?.company_name as string | null) ?? null,
      locationId: (vehicle.fleet_location_id as string | null) ?? null,
      locationName: (location?.name as string | null) ?? null,
      serviceClass: String(row.service_class || "light_duty"),
      unitNumber: (vehicle.unit_number as string | null) ?? null,
      vin: (vehicle.vin as string | null) ?? null,
      make: (vehicle.make as string | null) ?? null,
      model: (vehicle.model as string | null) ?? null,
      year: (vehicle.year as number | null) ?? null,
      lastServiceDate: (vehicle.last_service_date as string | null) ?? null,
      lastServiceMileage: (vehicle.last_service_mileage as number | null) ?? null,
      nextDueDate: (row.due_date as string | null) ?? null,
      nextDueMileage: (row.due_mileage as number | null) ?? null,
      status: String(row.status || "ok") as FleetVehicleOpsRow["status"],
      ruleId: (row.rule_id as string | null) ?? null,
      baseLaborPackage: String(row.base_labor_package || DEFAULT_RULE.baseLaborPackage),
      basePrice: Number(row.estimated_price || DEFAULT_RULE.basePrice),
    };
  });

  const vehiclesDue = rows.filter((row) => row.status === "due");
  const vehiclesOverdue = rows.filter((row) => row.status === "overdue");

  const workloadByWeek = new Map<string, number>();
  rows
    .filter((row) => row.nextDueDate)
    .forEach((row) => {
      const week = formatISO(startOfWeek(new Date(row.nextDueDate!), { weekStartsOn: 1 }), { representation: "date" });
      workloadByWeek.set(week, (workloadByWeek.get(week) || 0) + 1);
    });

  const now = new Date();
  const last30 = addDays(now, -30);
  const last90 = addDays(now, -90);
  const rollupMap = new Map<string, { fleetClientId: string | null; fleetClientName: string; completedServices30d: number; completedServices90d: number }>();
  ((historyRes.data || []) as AnyRecord[]).forEach((row) => {
    const clientId = (row.fleet_client_id as string | null) ?? "unknown";
    const existing = rollupMap.get(clientId) || {
      fleetClientId: clientId === "unknown" ? null : clientId,
      fleetClientName: clientId,
      completedServices30d: 0,
      completedServices90d: 0,
    };
    const completed = row.completed_at ? new Date(String(row.completed_at)) : null;
    if (completed && completed >= last30) existing.completedServices30d += 1;
    if (completed && completed >= last90) existing.completedServices90d += 1;
    rollupMap.set(clientId, existing);
  });

  const groupBy = (items: FleetVehicleOpsRow[], selector: (row: FleetVehicleOpsRow) => string | null) => {
    const map = new Map<string, { key: string; label: string; count: number }>();
    items.forEach((row) => {
      const key = selector(row) || "unassigned";
      const existing = map.get(key) || { key, label: key, count: 0 };
      existing.count += 1;
      map.set(key, existing);
    });
    return Array.from(map.values()).sort((a, b) => b.count - a.count);
  };

  return {
    vehiclesDue,
    vehiclesOverdue,
    upcomingWorkload: Array.from(workloadByWeek.entries())
      .map(([weekStart, count]) => ({ weekStart, count }))
      .sort((a, b) => a.weekStart.localeCompare(b.weekStart)),
    serviceHistoryRollups: Array.from(rollupMap.values()),
    groupedCounts: {
      byFleet: groupBy(rows, (row) => row.fleetClientId || "unassigned").map((entry) => {
        const sample = rows.find((row) => (row.fleetClientId || "unassigned") === entry.key);
        return { ...entry, label: sample?.fleetClientName || entry.key };
      }),
      byCustomer: groupBy(rows, (row) => row.fleetClientName),
      byLocation: groupBy(rows, (row) => row.locationName),
      byServiceClass: groupBy(rows, (row) => row.serviceClass),
    },
  };
}

export async function generateFleetServiceSchedules(userId: string, horizonDays = 90): Promise<number> {
  const horizonDate = formatISO(addDays(new Date(), horizonDays), { representation: "date" });
  const idempotencyKey = buildDeterministicKey([userId, "schedule_generation", horizonDate]);

  const { data: existingBatch } = await db
    .from("fleet_operation_batches")
    .select("id,status")
    .eq("user_id", userId)
    .eq("operation_type", "schedule_generation")
    .eq("idempotency_key", idempotencyKey)
    .in("status", ["running", "completed"])
    .maybeSingle();
  if (existingBatch?.id) return 0;

  const { data: operationBatch } = await db
    .from("fleet_operation_batches")
    .insert({
      user_id: userId,
      operation_type: "schedule_generation",
      status: "running",
      idempotency_key: idempotencyKey,
      context: { horizonDays, horizonDate },
    })
    .select("id")
    .maybeSingle();

  try {
    await refreshCanonicalDueState(userId);

    const { count } = await db
      .from("fleet_service_schedules")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .lte("due_date", horizonDate)
      .in("status", ["due", "overdue", "upcoming"]);

    if (operationBatch?.id) {
      await db
        .from("fleet_operation_batches")
        .update({ status: "completed", completed_at: new Date().toISOString() })
        .eq("id", operationBatch.id)
        .eq("user_id", userId);
    }

    return Number(count || 0);
  } catch (error) {
    if (operationBatch?.id) {
      await db
        .from("fleet_operation_batches")
        .update({
          status: "failed",
          error_message: error instanceof Error ? error.message : "schedule generation failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", operationBatch.id)
        .eq("user_id", userId);
    }
    throw error;
  }
}

export async function fetchUpcomingServiceQueue(userId: string): Promise<FleetUpcomingQueueRow[]> {
  await refreshCanonicalDueState(userId);

  const { data, error } = await db
    .from("fleet_service_schedules")
    .select("id,fleet_client_id,due_date,due_mileage,queue_status,proposed_scheduled_date,proposed_scheduled_time,route_batch_key,fleet_clients(company_name),fleet_vehicles(year,make,model,unit_number,fleet_locations(name))")
    .eq("user_id", userId)
    .in("queue_status", ["pending_review", "approved", "scheduled", "work_order_generated"])
    .order("due_date", { ascending: true, nullsFirst: false });

  if (error) {
    throw new Error(error.message || "Failed to fetch upcoming service queue");
  }

  return ((data || []) as AnyRecord[]).map((row) => {
    const vehicle = row.fleet_vehicles as AnyRecord | null;
    const location = (vehicle?.fleet_locations as AnyRecord | null) || null;
    return {
      id: String(row.id),
      fleetClientId: (row.fleet_client_id as string | null) ?? null,
      fleetClientName: ((row.fleet_clients as AnyRecord | null)?.company_name as string | null) ?? null,
      locationName: (location?.name as string | null) ?? null,
      vehicleLabel: `${vehicle?.year || ""} ${vehicle?.make || ""} ${vehicle?.model || ""} ${vehicle?.unit_number ? `#${vehicle.unit_number}` : ""}`.trim(),
      dueDate: (row.due_date as string | null) ?? null,
      dueMileage: (row.due_mileage as number | null) ?? null,
      queueStatus: String(row.queue_status || "pending_review"),
      proposedScheduledDate: (row.proposed_scheduled_date as string | null) ?? null,
      proposedScheduledTime: (row.proposed_scheduled_time as string | null) ?? null,
      routeBatchKey: (row.route_batch_key as string | null) ?? null,
    };
  });
}

export async function approveServiceSchedulesInBulk(input: {
  userId: string;
  scheduleIds: string[];
  proposedDate?: string | null;
  proposedTime?: string | null;
}): Promise<number> {
  if (!input.scheduleIds.length) return 0;
  const { data, error } = await db
    .from("fleet_service_schedules")
    .update({
      queue_status: "approved",
      approved_by: input.userId,
      approved_at: new Date().toISOString(),
      proposed_scheduled_date: input.proposedDate || null,
      proposed_scheduled_time: input.proposedTime || null,
    })
    .eq("user_id", input.userId)
    .in("id", input.scheduleIds)
    .select("id");
  if (error) throw new Error(error.message || "Failed to approve schedules");
  return (data || []).length;
}

export async function assignRouteBatchForSchedules(input: {
  userId: string;
  scheduleIds: string[];
  routeBatchKey: string;
}): Promise<number> {
  if (!input.scheduleIds.length) return 0;
  const { data, error } = await db
    .from("fleet_service_schedules")
    .update({
      route_batch_key: input.routeBatchKey,
      queue_status: "scheduled",
    })
    .eq("user_id", input.userId)
    .in("id", input.scheduleIds)
    .select("id");
  if (error) throw new Error(error.message || "Failed to assign route batch");
  return (data || []).length;
}
