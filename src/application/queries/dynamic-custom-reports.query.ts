import { supabase } from "@/integrations/supabase/client";
import { type DimensionSchema, type MeasureSchema, type DynamicReportConfig } from "@/types/reporting";
import { format } from "date-fns";

export interface UnifiedReportingRecord {
  // Identity
  appointment_id: string | null;
  customer_id: string | null;

  // Dimensions
  city: string;
  postal_code: string;
  state: string;
  make: string;
  model: string;
  year: number;
  fuel_type: string;
  oil_type: string;
  oil_capacity: number;
  scheduled_time_slot: string;
  scheduled_date: string;
  client_type: string;
  status: string;
  service_type: string;
  origin_source: string;
  technician_name: string;
  van_name: string;

  // Measures
  total_billed: number;
  net_collected: number;
  balance_due: number;
  quarts_used: number;
  job_count: number;
  duration_minutes: number;
  actual_minutes: number;
  travel_minutes: number;

  // Spatial/Coordinates
  latitude?: number;
  longitude?: number;
}

export interface ReportingRecordsFilter {
  from?: Date;
  to?: Date;
  includeLegacy?: boolean;
}

/** Bucket a `HH:MM[:SS]` clock value into a booking window. */
export function timeSlotForClock(clock: string | null | undefined): string {
  if (!clock) return "Unknown";
  const hour = Number.parseInt(String(clock).split(":")[0], 10);
  if (!Number.isFinite(hour)) return "Unknown";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

/** Extract a 5-digit ZIP from any free-form address string. */
export function zipFromAddress(address: string | null | undefined): string | null {
  const match = (address || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

/** Extract the city portion from a "street, city, ST 19002" style address. */
export function cityFromAddress(address: string | null | undefined): string | null {
  const parts = (address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 2];
  // Guard against "PA 19002" landing in the city slot.
  if (/^[A-Z]{2}\s*\d{5}/.test(candidate)) return parts.length >= 3 ? parts[parts.length - 3] : null;
  return candidate.replace(/\s*\d{5}(-\d{4})?$/, "").trim() || null;
}

/** Extract a two-letter state code from a free-form address string. */
export function stateFromAddress(address: string | null | undefined): string | null {
  const match = (address || "").match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

/**
 * Unified reporting dataset.
 *
 * Appointments are the booking spine (retail business line); their linked
 * service record supplies billed/collected/oil measures. Fleet work orders are
 * the fleet business line. Location dimensions fall back from the appointment
 * columns to the appointment address, then to the customer record, because the
 * denormalized appointment city/ZIP columns are not always populated.
 */
export async function fetchRawReportingRecords(
  filter: ReportingRecordsFilter = {},
): Promise<UnifiedReportingRecord[]> {
  const fromDate = filter.from ? format(filter.from, "yyyy-MM-dd") : null;
  const toDate = filter.to ? format(filter.to, "yyyy-MM-dd") : null;

  let appointmentQuery = supabase
    .from("appointments")
    .select(`
      id,
      status,
      source,
      origin_source,
      data_origin,
      scheduled_date,
      scheduled_time,
      duration_minutes,
      estimated_duration_minutes,
      actual_start_time,
      actual_end_time,
      travel_time_minutes,
      estimated_cost,
      customer_id,
      customer_city,
      customer_postal_code,
      customer_state,
      location_address,
      location_lat,
      location_lng,
      technicians ( name ),
      vans ( name ),
      customers ( address, postal_code, latitude, longitude ),
      vehicles ( make, model, year, oil_type, oil_capacity ),
      services!services_appointment_id_fkey (
        service_type,
        status,
        total_cost,
        paid_amount,
        oil_quarts_used
      )
    `)
    .neq("source", "fleet_work_order")
    .is("deleted_at", null)
    .limit(5000);

  let fleetQuery = supabase
    .from("fleet_work_orders")
    .select(`
      id,
      status,
      total,
      invoice_paid_amount,
      invoice_balance_due,
      scheduled_date,
      scheduled_time,
      labor_hours,
      fleet_vehicles ( make, model, year, fuel_type ),
      fleet_locations ( city, postal_code, state ),
      technicians ( name ),
      vans ( name )
    `)
    .limit(5000);

  if (fromDate) {
    appointmentQuery = appointmentQuery.gte("scheduled_date", fromDate);
    fleetQuery = fleetQuery.gte("scheduled_date", fromDate);
  }
  if (toDate) {
    appointmentQuery = appointmentQuery.lte("scheduled_date", toDate);
    fleetQuery = fleetQuery.lte("scheduled_date", toDate);
  }

  const [appointmentsRes, fleetOrdersRes] = await Promise.all([appointmentQuery, fleetQuery]);

  if (appointmentsRes.error) throw appointmentsRes.error;
  if (fleetOrdersRes.error) throw fleetOrdersRes.error;

  const records: UnifiedReportingRecord[] = [];

  for (const appt of (appointmentsRes.data ?? []) as any[]) {
    if (!filter.includeLegacy && appt.data_origin === "legacy_import") continue;

    const vehicle = appt.vehicles || {};
    const customer = appt.customers || {};
    const service = Array.isArray(appt.services) ? appt.services[0] : appt.services;

    const address = appt.location_address || customer.address || "";
    const postal =
      appt.customer_postal_code ||
      zipFromAddress(appt.location_address) ||
      customer.postal_code ||
      zipFromAddress(customer.address) ||
      "Unknown";
    const city = appt.customer_city || cityFromAddress(address) || "Unknown";
    const state = appt.customer_state || stateFromAddress(address) || "Unknown";

    const billed = Number(service?.total_cost ?? appt.estimated_cost) || 0;
    const collected = Number(service?.paid_amount) || 0;

    const actualMinutes =
      appt.actual_start_time && appt.actual_end_time
        ? Math.max(
            0,
            Math.round(
              (new Date(appt.actual_end_time).getTime() - new Date(appt.actual_start_time).getTime()) / 60000,
            ),
          )
        : 0;

    const latitude = appt.location_lat ?? customer.latitude ?? null;
    const longitude = appt.location_lng ?? customer.longitude ?? null;

    records.push({
      appointment_id: appt.id,
      customer_id: appt.customer_id ?? null,
      city,
      postal_code: postal,
      state,
      make: vehicle.make || "Unknown",
      model: vehicle.model || "Unknown",
      year: Number(vehicle.year) || 0,
      fuel_type: vehicle.fuel_type || "Unknown",
      oil_type: vehicle.oil_type || "Unknown",
      oil_capacity: Number.parseFloat(vehicle.oil_capacity) || 0,
      scheduled_time_slot: timeSlotForClock(appt.scheduled_time),
      scheduled_date: appt.scheduled_date || "",
      client_type: "Retail",
      status: appt.status || "Unknown",
      service_type: service?.service_type || appt.title || "Unspecified",
      origin_source: appt.origin_source || appt.source || "direct",
      technician_name: appt.technicians?.name || "Unassigned",
      van_name: appt.vans?.name || "Unassigned",
      total_billed: billed,
      net_collected: collected,
      balance_due: Math.max(0, billed - collected),
      quarts_used: Number(service?.oil_quarts_used) || 0,
      job_count: 1,
      duration_minutes: Number(appt.duration_minutes || appt.estimated_duration_minutes) || 0,
      actual_minutes: actualMinutes,
      travel_minutes: Number(appt.travel_time_minutes) || 0,
      latitude: latitude != null ? Number(latitude) : undefined,
      longitude: longitude != null ? Number(longitude) : undefined,
    });
  }

  for (const wo of (fleetOrdersRes.data ?? []) as any[]) {
    const vehicle = wo.fleet_vehicles || {};
    const location = wo.fleet_locations || {};
    const totalVal = Number(wo.total) || 0;
    const paidVal = Number(wo.invoice_paid_amount) || 0;
    const balanceVal = wo.invoice_balance_due != null ? Number(wo.invoice_balance_due) : totalVal - paidVal;

    records.push({
      appointment_id: null,
      customer_id: null,
      city: location.city || "Unknown",
      postal_code: location.postal_code || "Unknown",
      state: location.state || "Unknown",
      make: vehicle.make || "Unknown",
      model: vehicle.model || "Unknown",
      year: Number(vehicle.year) || 0,
      fuel_type: vehicle.fuel_type || "Unknown",
      oil_type: vehicle.oil_type || "Unknown",
      oil_capacity: Number.parseFloat(vehicle.oil_capacity) || 0,
      scheduled_time_slot: timeSlotForClock(wo.scheduled_time),
      scheduled_date: wo.scheduled_date || "",
      client_type: "Fleet",
      status: wo.status || "Unknown",
      service_type: "Fleet work order",
      origin_source: "fleet",
      technician_name: wo.technicians?.name || "Unassigned",
      van_name: wo.vans?.name || "Unassigned",
      total_billed: totalVal,
      net_collected: paidVal,
      balance_due: Math.max(0, balanceVal),
      quarts_used: Number(wo.oil_quarts_used) || 0,
      job_count: 1,
      duration_minutes: Number(wo.labor_hours) > 0 ? Number(wo.labor_hours) * 60 : 0,
      actual_minutes: 0,
      travel_minutes: 0,
      latitude: location.latitude != null ? Number(location.latitude) : undefined,
      longitude: location.longitude != null ? Number(location.longitude) : undefined,
    });
  }

  return records;
}

export function pivotDataset(
  records: UnifiedReportingRecord[],
  config: DynamicReportConfig
): {
  pivotData: Record<string, Record<string, Record<string, number>>>; // RowKey -> ColKey -> { Metric -> Value }
  allRows: string[];
  allCols: string[];
  totals: Record<string, number>;
} {
  // Apply Filter Clauses
  const filtered = records.filter(record => {
    return config.filters.every(filter => {
      const val = (record as any)[filter.field];
      if (val === undefined) return true;

      switch (filter.operator) {
        case 'eq':
          return String(val).toLowerCase() === String(filter.value).toLowerCase();
        case 'neq':
          return String(val).toLowerCase() !== String(filter.value).toLowerCase();
        case 'gt':
          return Number(val) > Number(filter.value);
        case 'lt':
          return Number(val) < Number(filter.value);
        case 'contains':
          return String(val).toLowerCase().includes(String(filter.value).toLowerCase());
        case 'between':
          if (Array.isArray(filter.value)) {
            return Number(val) >= Number(filter.value[0]) && Number(val) <= Number(filter.value[1]);
          }
          return true;
        default:
          return true;
      }
    });
  });

  const pivotData: Record<string, Record<string, Record<string, number>>> = {};
  const rowSet = new Set<string>();
  const colSet = new Set<string>();
  const totals: Record<string, number> = {};

  filtered.forEach(record => {
    const rowKey = config.rows.length > 0
      ? config.rows.map(r => String((record as any)[r] ?? "Unknown")).join(" / ")
      : "Grand Total";
    const colKey = config.columns.length > 0
      ? config.columns.map(c => String((record as any)[c] ?? "Unknown")).join(" / ")
      : "Metric Value";

    rowSet.add(rowKey);
    colSet.add(colKey);

    if (!pivotData[rowKey]) pivotData[rowKey] = {};
    if (!pivotData[rowKey][colKey]) pivotData[rowKey][colKey] = {};

    config.values.forEach(v => {
      const mField = v.field;
      const mVal = Number((record as any)[mField]) || 0;

      if (pivotData[rowKey][colKey][mField] === undefined) {
        pivotData[rowKey][colKey][mField] = 0;
      }
      pivotData[rowKey][colKey][mField] += mVal;

      if (totals[mField] === undefined) totals[mField] = 0;
      totals[mField] += mVal;
    });
  });

  // Calculate Averages if config.values specifies average
  rowSet.forEach(r => {
    colSet.forEach(c => {
      if (pivotData[r] && pivotData[r][c]) {
        config.values.forEach(v => {
          if (v.aggregation === 'avg') {
            const countField = 'job_count';
            const count = pivotData[r][c][countField] || 1;
            pivotData[r][c][v.field] = pivotData[r][c][v.field] / count;
          }
        });
      }
    });
  });

  return {
    pivotData,
    allRows: Array.from(rowSet).sort(),
    allCols: Array.from(colSet).sort(),
    totals
  };
}
