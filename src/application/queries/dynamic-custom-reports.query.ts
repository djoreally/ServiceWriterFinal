import { supabase } from "@/integrations/supabase/client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { type DimensionSchema, type MeasureSchema, type DynamicReportConfig } from "@/types/reporting";
import { format } from "date-fns";

// This module is an explicit compatibility boundary over the live canonical
// schema. Generated Supabase types can lag production migrations, so keeping the
// boundary untyped prevents stale generated columns/relationships from forcing
// retired schema assumptions back into reporting code.
const db = supabase as any;

export interface UnifiedReportingRecord {
  appointment_id: string | null;
  customer_id: string | null;
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
  total_billed: number;
  net_collected: number;
  balance_due: number;
  quarts_used: number;
  job_count: number;
  duration_minutes: number;
  actual_minutes: number;
  travel_minutes: number;
  latitude?: number;
  longitude?: number;
}

export interface ReportingRecordsFilter {
  from?: Date;
  to?: Date;
  includeLegacy?: boolean;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function numeric(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function timeSlotForClock(clock: string | null | undefined): string {
  if (!clock) return "Unknown";
  const hour = Number.parseInt(String(clock).split(":")[0], 10);
  if (!Number.isFinite(hour)) return "Unknown";
  if (hour < 12) return "Morning";
  if (hour < 17) return "Afternoon";
  if (hour < 21) return "Evening";
  return "Night";
}

export function zipFromAddress(address: string | null | undefined): string | null {
  const match = (address || "").match(/\b(\d{5})(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

export function cityFromAddress(address: string | null | undefined): string | null {
  const parts = (address || "").split(",").map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const candidate = parts[parts.length - 2];
  if (/^[A-Z]{2}\s*\d{5}/.test(candidate)) return parts.length >= 3 ? parts[parts.length - 3] : null;
  return candidate.replace(/\s*\d{5}(-\d{4})?$/, "").trim() || null;
}

export function stateFromAddress(address: string | null | undefined): string | null {
  const match = (address || "").match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/);
  return match ? match[1] : null;
}

/**
 * Canonical reporting dataset.
 *
 * Appointments no longer have a PostgREST relationship to the retired
 * `technicians` table. Technician identity is `appointments.assigned_user_id`
 * -> `profiles.id`, resolved explicitly below. Service financials are likewise
 * loaded from canonical `service_records` rather than the retired `services`
 * relationship. Keeping these joins explicit prevents schema-cache drift from
 * taking down the entire Reports page.
 */
export async function fetchRawReportingRecords(
  filter: ReportingRecordsFilter = {},
): Promise<UnifiedReportingRecord[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("Select a workspace before viewing reports.");

  const fromDate = filter.from ? format(filter.from, "yyyy-MM-dd") : null;
  const toDate = filter.to ? format(filter.to, "yyyy-MM-dd") : null;

  let appointmentQuery = db
    .from("appointments")
    .select("id,customer_id,vehicle_id,assigned_user_id,status,starts_at,ends_at,source,metadata,customers(first_name,last_name,address_line1,address_line2,city,region,postal_code,metadata),vehicles(make,model,year,metadata,vehicle_service_specs(oil_type,oil_capacity,metadata))")
    .eq("workspace_id", context.workspaceId)
    .neq("source", "fleet_work_order")
    .limit(5000);

  if (fromDate) appointmentQuery = appointmentQuery.gte("starts_at", `${fromDate}T00:00:00`);
  if (toDate) appointmentQuery = appointmentQuery.lte("starts_at", `${toDate}T23:59:59`);

  const { data: appointments, error: appointmentError } = await appointmentQuery;
  if (appointmentError) throw appointmentError;

  const appointmentRows = (appointments ?? []) as Array<Record<string, any>>;
  const appointmentIds = appointmentRows.map((row) => row.id).filter(Boolean);
  const assignedUserIds = Array.from(new Set(
    appointmentRows
      .map((row) => row.assigned_user_id)
      .filter((value): value is string => typeof value === "string" && value.length > 0),
  ));

  const [serviceResult, profileResult] = await Promise.all([
    appointmentIds.length
      ? db
          .from("service_records")
          .select("appointment_id,status,work_performed,total_amount,oil_quarts_used,metadata,completed_at,started_at,created_at")
          .eq("workspace_id", context.workspaceId)
          .in("appointment_id", appointmentIds)
          .neq("status", "voided")
      : Promise.resolve({ data: [], error: null }),
    assignedUserIds.length
      ? db.from("profiles").select("id,display_name").in("id", assignedUserIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (serviceResult.error) throw serviceResult.error;
  if (profileResult.error) throw profileResult.error;

  const serviceRows = (serviceResult.data ?? []) as Array<Record<string, any>>;
  const profileRows = (profileResult.data ?? []) as Array<Record<string, any>>;
  const servicesByAppointment = new Map<string, Record<string, any>>();
  for (const service of serviceRows) {
    if (!service.appointment_id || servicesByAppointment.has(service.appointment_id)) continue;
    servicesByAppointment.set(service.appointment_id, service);
  }

  const profileNames = new Map<string, string>();
  for (const profile of profileRows) {
    if (profile.id) profileNames.set(profile.id, profile.display_name || "Technician");
  }

  const records: UnifiedReportingRecord[] = [];

  for (const appt of appointmentRows) {
    const metadata = objectValue(appt.metadata);
    const dataOrigin = String(metadata.data_origin ?? metadata.migration_source ?? "canonical");
    if (!filter.includeLegacy && dataOrigin === "legacy_import") continue;

    const customer = appt.customers;
    const vehicle = appt.vehicles;
    const service = servicesByAppointment.get(appt.id);
    const serviceMetadata = objectValue(service?.metadata);
    const vehicleMetadata = objectValue(vehicle?.metadata);
    const customerMetadata = objectValue(customer?.metadata);
    const specs = Array.isArray(vehicle?.vehicle_service_specs)
      ? vehicle?.vehicle_service_specs[0]
      : vehicle?.vehicle_service_specs;

    const address = String(
      metadata.location_address ??
      [customer?.address_line1, customer?.address_line2, customer?.city, customer?.region, customer?.postal_code]
        .filter(Boolean)
        .join(", ")
    );
    const postal = String(metadata.customer_postal_code ?? customer?.postal_code ?? zipFromAddress(address) ?? "Unknown");
    const city = String(metadata.customer_city ?? customer?.city ?? cityFromAddress(address) ?? "Unknown");
    const state = String(metadata.customer_state ?? customer?.region ?? stateFromAddress(address) ?? "Unknown");

    const billed = numeric(service?.total_amount ?? metadata.estimated_cost);
    const collected = numeric(serviceMetadata.paid_amount ?? metadata.paid_amount);
    const startsAt = new Date(appt.starts_at);
    const endsAt = new Date(appt.ends_at);
    const durationMinutes = Number.isFinite(startsAt.getTime()) && Number.isFinite(endsAt.getTime())
      ? Math.max(0, Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000))
      : 0;

    const actualStart = metadata.actual_start_time;
    const actualEnd = metadata.actual_end_time;
    const actualMinutes = typeof actualStart === "string" && typeof actualEnd === "string"
      ? Math.max(0, Math.round((Date.parse(actualEnd) - Date.parse(actualStart)) / 60_000))
      : 0;

    const latitude = numeric(metadata.location_lat ?? customerMetadata.latitude) || undefined;
    const longitude = numeric(metadata.location_lng ?? customerMetadata.longitude) || undefined;
    const oilCapacityRaw = specs?.oil_capacity ?? vehicleMetadata.oil_capacity;

    records.push({
      appointment_id: appt.id,
      customer_id: appt.customer_id ?? null,
      city,
      postal_code: postal,
      state,
      make: vehicle?.make || "Unknown",
      model: vehicle?.model || "Unknown",
      year: numeric(vehicle?.year),
      fuel_type: String(vehicleMetadata.fuel_type ?? "Unknown"),
      oil_type: String(specs?.oil_type ?? vehicleMetadata.oil_type ?? "Unknown"),
      oil_capacity: Number.parseFloat(String(oilCapacityRaw ?? "")) || 0,
      scheduled_time_slot: timeSlotForClock(appt.starts_at?.slice(11, 16)),
      scheduled_date: appt.starts_at?.slice(0, 10) ?? "",
      client_type: String(metadata.client_type ?? "Retail"),
      status: appt.status || "Unknown",
      service_type: String(serviceMetadata.service_type ?? metadata.title ?? service?.work_performed ?? "Unspecified"),
      origin_source: String(metadata.origin_source ?? appt.source ?? "direct"),
      technician_name: appt.assigned_user_id ? profileNames.get(appt.assigned_user_id) ?? "Assigned technician" : "Unassigned",
      van_name: String(metadata.van_name ?? metadata.assigned_van_name ?? "Unassigned"),
      total_billed: billed,
      net_collected: collected,
      balance_due: Math.max(0, billed - collected),
      quarts_used: numeric(service?.oil_quarts_used),
      job_count: 1,
      duration_minutes: durationMinutes,
      actual_minutes: Number.isFinite(actualMinutes) ? actualMinutes : 0,
      travel_minutes: numeric(metadata.travel_time_minutes),
      latitude,
      longitude,
    });
  }

  return records;
}

export function pivotDataset(
  records: UnifiedReportingRecord[],
  config: DynamicReportConfig
): {
  pivotData: Record<string, Record<string, Record<string, number>>>;
  allRows: string[];
  allCols: string[];
  totals: Record<string, number>;
} {
  const filtered = records.filter(record => {
    return config.filters.every(filter => {
      const val = record[filter.field as keyof UnifiedReportingRecord];
      if (val === undefined) return true;

      switch (filter.operator) {
        case "eq":
          return String(val).toLowerCase() === String(filter.value).toLowerCase();
        case "neq":
          return String(val).toLowerCase() !== String(filter.value).toLowerCase();
        case "gt":
          return Number(val) > Number(filter.value);
        case "lt":
          return Number(val) < Number(filter.value);
        case "contains":
          return String(val).toLowerCase().includes(String(filter.value).toLowerCase());
        case "between":
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
      ? config.rows.map(r => String(record[r as keyof UnifiedReportingRecord] ?? "Unknown")).join(" / ")
      : "Grand Total";
    const colKey = config.columns.length > 0
      ? config.columns.map(c => String(record[c as keyof UnifiedReportingRecord] ?? "Unknown")).join(" / ")
      : "Metric Value";

    rowSet.add(rowKey);
    colSet.add(colKey);

    if (!pivotData[rowKey]) pivotData[rowKey] = {};
    if (!pivotData[rowKey][colKey]) pivotData[rowKey][colKey] = {};

    config.values.forEach(v => {
      const mField = v.field;
      const mVal = Number(record[mField as keyof UnifiedReportingRecord]) || 0;

      if (pivotData[rowKey][colKey][mField] === undefined) {
        pivotData[rowKey][colKey][mField] = 0;
      }
      pivotData[rowKey][colKey][mField] += mVal;

      if (totals[mField] === undefined) totals[mField] = 0;
      totals[mField] += mVal;
    });
  });

  rowSet.forEach(r => {
    colSet.forEach(c => {
      if (pivotData[r] && pivotData[r][c]) {
        config.values.forEach(v => {
          if (v.aggregation === "avg") {
            const countField = "job_count";
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
    totals,
  };
}
