/**
 * Oil usage reporting.
 *
 * Completed service records are authoritative for actual oil consumed. Inventory
 * is optional and never required for this report to function.
 */

import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface UsageRow {
  id: string;
  consumed_at: string;
  day: string;
  inventory_item_id: string;
  item_name: string;
  item_category: string | null;
  quantity: number;
  unit: string;
  qty_in_qts: number;
  source: "completed_service" | "inventory_reconciled";
  van_id: string | null;
  van_name: string | null;
  appointment_id: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
}

export interface UsageDayBucket { day: string; qty_qt: number; service_count: number }
export interface UsageItemBucket { inventory_item_id: string; name: string; qty_qt: number; raw_qty: number; unit: string }
export interface UsageTotals { total_qt: number; total_gal: number; service_count: number; top_item_name: string | null; top_item_qt: number }
export interface FetchOilUsageParams {
  from: Date;
  to: Date;
  itemIds?: string[];
  vanId?: string | null;
  source?: "completed_service" | "inventory_reconciled" | null;
  search?: string | null;
  oilOnly?: boolean;
}
export interface OilItemOption { id: string; name: string }
export interface FetchOilUsageResult {
  rows: UsageRow[];
  totals: UsageTotals;
  byDay: UsageDayBucket[];
  byItem: UsageItemBucket[];
  availableItems: OilItemOption[];
  availableVans: { id: string; name: string }[];
}

function localDay(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function bookingOilType(metadata: unknown): string | null {
  const root = asRecord(metadata);
  const config = asRecord(root.booking_configuration);
  const vehicle = asRecord(config.vehicle);
  const oil = asRecord(vehicle.oil);
  const value = oil.oilType;
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function fetchOilUsage(params: FetchOilUsageParams): Promise<FetchOilUsageResult> {
  const empty: FetchOilUsageResult = {
    rows: [],
    totals: { total_qt: 0, total_gal: 0, service_count: 0, top_item_name: null, top_item_qt: 0 },
    byDay: [], byItem: [], availableItems: [], availableVans: [],
  };

  const workspace = await resolveCurrentWorkspace();
  if (!workspace?.workspaceId) return empty;
  const workspaceId = workspace.workspaceId;

  const servicesRes = await supabase
    .from("service_records")
    .select("id,appointment_id,customer_id,vehicle_id,completed_at,oil_quarts_used,metadata")
    .eq("workspace_id", workspaceId)
    .eq("status", "completed")
    .gt("oil_quarts_used", 0)
    .gte("completed_at", params.from.toISOString())
    .lte("completed_at", params.to.toISOString())
    .order("completed_at", { ascending: false })
    .limit(5000);
  if (servicesRes.error) throw new Error(servicesRes.error.message);

  const services = (servicesRes.data ?? []) as Array<{
    id: string; appointment_id: string | null; customer_id: string | null; vehicle_id: string | null;
    completed_at: string | null; oil_quarts_used: number | string | null; metadata: unknown;
  }>;
  if (!services.length) return empty;

  const customerIds = [...new Set(services.map((r) => r.customer_id).filter((v): v is string => !!v))];
  const vehicleIds = [...new Set(services.map((r) => r.vehicle_id).filter((v): v is string => !!v))];
  const appointmentIds = [...new Set(services.map((r) => r.appointment_id).filter((v): v is string => !!v))];
  const serviceIds = services.map((r) => r.id);

  const [customersRes, vehiclesRes, specsRes, appointmentsRes, movementsRes] = await Promise.all([
    customerIds.length ? supabase.from("customers").select("id,first_name,last_name,company_name").eq("workspace_id", workspaceId).in("id", customerIds) : Promise.resolve({ data: [], error: null }),
    vehicleIds.length ? supabase.from("vehicles").select("id,year,make,model").eq("workspace_id", workspaceId).in("id", vehicleIds) : Promise.resolve({ data: [], error: null }),
    vehicleIds.length ? supabase.from("vehicle_service_specs").select("vehicle_id,oil_type").eq("workspace_id", workspaceId).in("vehicle_id", vehicleIds) : Promise.resolve({ data: [], error: null }),
    appointmentIds.length ? supabase.from("appointments").select("id,metadata").eq("workspace_id", workspaceId).in("id", appointmentIds) : Promise.resolve({ data: [], error: null }),
    supabase.from("inventory_movements").select("service_record_id,inventory_item_id,location_id").eq("workspace_id", workspaceId).eq("movement_type", "consumption").in("service_record_id", serviceIds),
  ]);

  for (const result of [customersRes, vehiclesRes, specsRes, appointmentsRes, movementsRes]) {
    if (result.error) throw new Error(result.error.message);
  }

  const customerMap = new Map((customersRes.data ?? []).map((r: any) => [r.id, r]));
  const vehicleMap = new Map((vehiclesRes.data ?? []).map((r: any) => [r.id, r]));
  const specMap = new Map((specsRes.data ?? []).map((r: any) => [r.vehicle_id, r.oil_type as string | null]));
  const appointmentMap = new Map((appointmentsRes.data ?? []).map((r: any) => [r.id, r.metadata]));
  const reconciled = new Set((movementsRes.data ?? []).map((r: any) => r.service_record_id as string));

  const allRows: UsageRow[] = services.map((r) => {
    const qty = Number(r.oil_quarts_used ?? 0);
    const customer = r.customer_id ? customerMap.get(r.customer_id) : null;
    const vehicle = r.vehicle_id ? vehicleMap.get(r.vehicle_id) : null;
    const appointmentMetadata = r.appointment_id ? appointmentMap.get(r.appointment_id) : null;
    const oilType = (r.vehicle_id ? specMap.get(r.vehicle_id) : null) || bookingOilType(appointmentMetadata) || bookingOilType(r.metadata) || "Oil type not captured";
    const customerName = customer ? (customer.company_name || `${customer.first_name ?? ""} ${customer.last_name ?? ""}`.trim() || null) : null;
    const vehicleLabel = vehicle ? `${vehicle.year ?? ""} ${vehicle.make ?? ""} ${vehicle.model ?? ""}`.trim() || null : null;
    const consumedAt = r.completed_at || new Date(0).toISOString();
    return {
      id: r.id,
      consumed_at: consumedAt,
      day: localDay(consumedAt),
      inventory_item_id: oilType,
      item_name: oilType,
      item_category: "Oil",
      quantity: qty,
      unit: "qt",
      qty_in_qts: qty,
      source: reconciled.has(r.id) ? "inventory_reconciled" : "completed_service",
      van_id: null,
      van_name: null,
      appointment_id: r.appointment_id,
      customer_name: customerName,
      vehicle_label: vehicleLabel,
    };
  });

  const itemFilter = params.itemIds?.length ? new Set(params.itemIds) : null;
  const q = (params.search ?? "").trim().toLowerCase();
  const rows = allRows.filter((r) => {
    if (itemFilter && !itemFilter.has(r.inventory_item_id)) return false;
    if (params.source && r.source !== params.source) return false;
    if (q && !`${r.item_name} ${r.customer_name ?? ""} ${r.vehicle_label ?? ""}`.toLowerCase().includes(q)) return false;
    return true;
  });

  const availableItems = [...new Set(allRows.map((r) => r.item_name))].sort().map((name) => ({ id: name, name }));
  const dayMap = new Map<string, { qt: number; services: Set<string> }>();
  const itemMap = new Map<string, UsageItemBucket>();
  for (const row of rows) {
    const day = dayMap.get(row.day) ?? { qt: 0, services: new Set<string>() };
    day.qt += row.qty_in_qts; day.services.add(row.id); dayMap.set(row.day, day);
    const item = itemMap.get(row.inventory_item_id) ?? { inventory_item_id: row.inventory_item_id, name: row.item_name, qty_qt: 0, raw_qty: 0, unit: "qt" };
    item.qty_qt += row.qty_in_qts; item.raw_qty += row.quantity; itemMap.set(row.inventory_item_id, item);
  }

  const byDay = [...dayMap.entries()].map(([day, b]) => ({ day, qty_qt: Math.round(b.qt * 100) / 100, service_count: b.services.size })).sort((a, b) => a.day.localeCompare(b.day));
  const byItem = [...itemMap.values()].sort((a, b) => b.qty_qt - a.qty_qt);
  const totalQt = rows.reduce((sum, row) => sum + row.qty_in_qts, 0);
  const top = byItem[0];
  return {
    rows,
    totals: { total_qt: Math.round(totalQt * 100) / 100, total_gal: Math.round(totalQt / 4 * 100) / 100, service_count: rows.length, top_item_name: top?.name ?? null, top_item_qt: top?.qty_qt ?? 0 },
    byDay,
    byItem,
    availableItems,
    availableVans: [],
  };
}
