/**
 * Inventory Usage Query - Reads completed service records for reporting.
 * Oil usage is the technician-entered quantity on completed jobs
 * (`services.oil_quarts_used`), not inventory reservation rows.
 */

import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface UsageRow {
  id: string;
  consumed_at: string;
  day: string; // YYYY-MM-DD (local)
  inventory_item_id: string;
  item_name: string;
  item_category: string | null;
  quantity: number;
  unit: string;
  qty_in_qts: number; // completed-service oil quantity entered by technician
  source: "warehouse" | "van";
  van_id: string | null;
  van_name: string | null;
  appointment_id: string | null;
  customer_name: string | null;
  vehicle_label: string | null;
}

export interface UsageDayBucket {
  day: string;
  qty_qt: number;
  service_count: number;
}

export interface UsageItemBucket {
  inventory_item_id: string;
  name: string;
  qty_qt: number;
  raw_qty: number;
  unit: string;
}

export interface UsageTotals {
  total_qt: number;
  total_gal: number;
  service_count: number;
  top_item_name: string | null;
  top_item_qt: number;
}

export interface FetchOilUsageParams {
  from: Date;
  to: Date;
  itemIds?: string[];
  vanId?: string | null;
  source?: "van" | "warehouse" | null;
  search?: string | null;
  oilOnly?: boolean; // retained for API compatibility; completed job oil quantities are always oil-only
}

export interface OilItemOption {
  id: string;
  name: string;
}

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
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDateForQuery(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export async function fetchOilUsage(
  params: FetchOilUsageParams,
): Promise<FetchOilUsageResult> {
  const { from, to, itemIds, vanId, source, search } = params;

  const empty: FetchOilUsageResult = {
    rows: [],
    totals: { total_qt: 0, total_gal: 0, service_count: 0, top_item_name: null, top_item_qt: 0 },
    byDay: [],
    byItem: [],
    availableItems: [],
    availableVans: [],
  };

  const { data: { user } } = await getCurrentAuthUser();
  if (!user) return empty;

  // Facets come from completed service records because oil usage is based on the
  // quantity entered at job completion, not inventory reservation consumption.
  const [servicesRes, vansRes] = await Promise.all([
    supabase
      .from("services")
      .select(`
        id, completed_at, service_date, appointment_id, oil_quarts_used, status,
        appointments:appointments!services_appointment_id_fkey ( id, assigned_van_id,
          customers ( name ),
          vehicles ( year, make, model, oil_type )
        )
      `)
      .eq("user_id", user.id)
      .eq("status", "completed")
      .gt("oil_quarts_used", 0)
      .gte("service_date", formatDateForQuery(from))
      .lte("service_date", formatDateForQuery(to))
      .order("service_date", { ascending: false })
      .limit(5000),
    supabase.from("vans").select("id, name").eq("user_id", user.id).order("name"),
  ]);

  if (servicesRes.error) throw new Error(servicesRes.error.message);

  const availableVans = (vansRes.data ?? []).map((v: any) => ({ id: v.id, name: v.name }));
  const vanNameById = new Map<string, string>(availableVans.map((v) => [v.id, v.name] as [string, string]));

  const serviceRows = ((servicesRes.data ?? []) as any[]).filter((r) => {
    const oilType = r.appointments?.vehicles?.oil_type ?? "Motor Oil";
    if (itemIds?.length && !itemIds.includes(oilType)) return false;
    if (vanId && r.appointments?.assigned_van_id !== vanId) return false;
    if (source === "van" && !r.appointments?.assigned_van_id) return false;
    if (source === "warehouse" && r.appointments?.assigned_van_id) return false;
    return true;
  });

  const availableItems: OilItemOption[] = Array.from(
    new Set(((servicesRes.data ?? []) as any[]).map((r) => r.appointments?.vehicles?.oil_type ?? "Motor Oil")),
  )
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ id: name, name }));

  const rows: UsageRow[] = [];
  const searchLc = (search || "").trim().toLowerCase();
  for (const r of serviceRows) {
    const qty = Number(r.oil_quarts_used ?? 0);
    if (qty <= 0) continue;

    const oilType = r.appointments?.vehicles?.oil_type ?? "Motor Oil";
    const completedAt = r.completed_at || `${r.service_date}T00:00:00`;
    const veh = r.appointments?.vehicles;
    const vehicleLabel = veh ? `${veh.year ?? ""} ${veh.make ?? ""} ${veh.model ?? ""}`.trim() : null;
    const customerName = r.appointments?.customers?.name ?? null;
    const assignedVanId = r.appointments?.assigned_van_id ?? null;

    if (searchLc) {
      const hay = `${oilType} ${customerName ?? ""} ${vehicleLabel ?? ""}`.toLowerCase();
      if (!hay.includes(searchLc)) continue;
    }

    rows.push({
      id: r.id,
      consumed_at: completedAt,
      day: localDay(completedAt),
      inventory_item_id: oilType,
      item_name: oilType,
      item_category: "Oil",
      quantity: qty,
      unit: "qt",
      qty_in_qts: qty,
      source: assignedVanId ? "van" : "warehouse",
      van_id: assignedVanId,
      van_name: assignedVanId ? vanNameById.get(assignedVanId) ?? null : null,
      appointment_id: r.appointment_id,
      customer_name: customerName,
      vehicle_label: vehicleLabel || null,
    });
  }

  // Aggregations
  const dayMap = new Map<string, { qt: number; appts: Set<string> }>();
  const itemMap = new Map<string, UsageItemBucket>();
  const apptSet = new Set<string>();

  for (const row of rows) {
    if (row.appointment_id) apptSet.add(row.appointment_id);

    const dayBucket = dayMap.get(row.day) ?? { qt: 0, appts: new Set<string>() };
    dayBucket.qt += row.qty_in_qts;
    if (row.appointment_id) dayBucket.appts.add(row.appointment_id);
    dayMap.set(row.day, dayBucket);

    const itemBucket = itemMap.get(row.inventory_item_id) ?? {
      inventory_item_id: row.inventory_item_id,
      name: row.item_name,
      qty_qt: 0,
      raw_qty: 0,
      unit: row.unit,
    };
    itemBucket.qty_qt += row.qty_in_qts;
    itemBucket.raw_qty += row.quantity;
    itemMap.set(row.inventory_item_id, itemBucket);
  }

  const byDay: UsageDayBucket[] = Array.from(dayMap.entries())
    .map(([day, b]) => ({ day, qty_qt: Math.round(b.qt * 100) / 100, service_count: b.appts.size }))
    .sort((a, b) => (a.day < b.day ? -1 : 1));

  const byItem: UsageItemBucket[] = Array.from(itemMap.values())
    .sort((a, b) => b.qty_qt - a.qty_qt);

  const totalQt = rows.reduce((s, r) => s + r.qty_in_qts, 0);
  const top = byItem[0];

  return {
    rows,
    totals: {
      total_qt: Math.round(totalQt * 100) / 100,
      total_gal: Math.round((totalQt / 4) * 100) / 100,
      service_count: apptSet.size,
      top_item_name: top?.name ?? null,
      top_item_qt: top ? Math.round(top.qty_qt * 100) / 100 : 0,
    },
    byDay,
    byItem,
    availableItems,
    availableVans,
  };
}
