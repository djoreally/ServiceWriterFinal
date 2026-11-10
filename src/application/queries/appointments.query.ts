import { z } from "zod";
import { addDays, endOfMonth, format, startOfMonth, startOfWeek } from "date-fns";
import { apiClient } from "@/lib/api-client";
import type { Appointment, BusinessHours, Customer, ServiceCatalogItem, Vehicle } from "@/shared/types";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";
import { appointmentStatusView } from "@/lib/status-vocabulary";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";

const customerApiSchema = z.object({
  id: z.string(), first_name: z.string().nullable().optional(), last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(), email: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(), address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(), region: z.string().nullable().optional(), postal_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(), created_at: z.string().optional(),
}).passthrough();

const vehicleApiSchema = z.object({
  id: z.string(), customer_id: z.string().nullable().optional(), make: z.string().nullable().optional(),
  model: z.string().nullable().optional(), year: z.number().nullable().optional(), vin: z.string().nullable().optional(),
  license_plate: z.string().nullable().optional(), plate_region: z.string().nullable().optional(),
  color: z.string().nullable().optional(), mileage: z.number().nullable().optional(), notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
}).passthrough();

const appointmentApiSchema = z.object({
  id: z.string(), customer_id: z.string().nullable().optional(), vehicle_id: z.string().nullable().optional(),
  starts_at: z.string(), ends_at: z.string(), status: z.string(), assigned_user_id: z.string().nullable().optional(),
  source: z.string(), notes: z.string().nullable().optional(), metadata: z.unknown().optional(),
  // B2/T-1: server-composed title fields (see @/lib/appointment-title).
  display_title: z.string().nullable().optional(), primary_service_name: z.string().nullable().optional(),
  confirmation_code: z.string().nullable().optional(),
  // B1/T-9: server-composed status presentation (see @/lib/status-vocabulary).
  status_label: z.string().nullable().optional(),
  status_tone: z.enum(["neutral", "info", "success", "warning", "danger"]).nullable().optional(),
  // P3: server-composed job money from the invoice facts (see
  // @/server/appointments/appointment-money) — list cards read job_due
  // verbatim when present instead of falling back to the locked quote.
  job_total: z.number().nullable().optional(), job_due: z.number().nullable().optional(),
  customers: z.union([customerApiSchema, z.array(customerApiSchema)]).nullable().optional(),
  vehicles: z.union([vehicleApiSchema, z.array(vehicleApiSchema)]).nullable().optional(),
}).passthrough();

type CustomerApiRow = z.infer<typeof customerApiSchema>;
type VehicleApiRow = z.infer<typeof vehicleApiSchema>;
type AppointmentApiRow = z.infer<typeof appointmentApiSchema>;

export interface AppointmentWithSource extends Appointment {
  source?: "manual" | "online_booking" | "ai_intake" | string;
  intake_responses?: Record<string, unknown> | null;
}
export interface AppointmentsPageErrors { appointments?: string; customers?: string; vehicles?: string; catalog?: string; }
export interface AppointmentScheduleVan { id: string; name: string; }
export interface AppointmentsPageData {
  userId: string; appointments: AppointmentWithSource[]; customers: Customer[]; vehicles: Vehicle[];
  serviceCatalog: ServiceCatalogItem[]; scheduleVans: AppointmentScheduleVan[]; businessHours: BusinessHours;
  errors: AppointmentsPageErrors; providerName: string; providerEmail: string | null;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  opening_time: "09:00", closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  slot_duration_minutes: 30, min_lead_time_hours: 2, buffer_time_before: 0, buffer_time_after: 0,
};
const DEFAULT_TIMEZONE = "America/New_York";

function localDateTime(iso: string, timezone: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || DEFAULT_TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}
function optionalString(value: unknown): string | undefined { return typeof value === "string" && value ? value : undefined; }
function metadataObject(value: unknown): Record<string, unknown> { return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function relatedCustomer(row: AppointmentApiRow): CustomerApiRow | null { return Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null; }
function relatedVehicle(row: AppointmentApiRow): VehicleApiRow | null { return Array.isArray(row.vehicles) ? row.vehicles[0] ?? null : row.vehicles ?? null; }
function hhmm(value: unknown, fallback: string): string {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value ?? ""));
  return match ? `${match[1].padStart(2, "0")}:${match[2]}` : fallback;
}

function mapCustomer(row: CustomerApiRow): Customer {
  return { id: row.id, name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Customer", phone: row.phone ?? "", email: row.email ?? "",
    address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", "), notes: row.notes ?? undefined, created_at: row.created_at };
}
function mapVehicle(row: VehicleApiRow): Vehicle {
  return { id: row.id, customer_id: row.customer_id ?? undefined, make: row.make || "Unknown", model: row.model || "Unknown",
    year: Number(row.year || new Date().getFullYear()), vin: row.vin ?? undefined, license_plate: row.license_plate ?? undefined,
    plate_state: row.plate_region ?? undefined, color: row.color ?? undefined, mileage: row.mileage ?? undefined,
    notes: row.notes ?? undefined, created_at: row.created_at };
}
function mapCatalog(row: { id: string; name: string; description: string | null; labor_price: number; estimated_minutes: number | null; category: string | null; is_active: boolean }): ServiceCatalogItem {
  return { id: row.id, name: row.name, description: row.description || "", default_price: Number(row.labor_price ?? 0),
    estimated_duration: row.estimated_minutes ?? undefined, category: row.category ?? undefined, is_active: row.is_active };
}
function mapAppointment(row: AppointmentApiRow, customerMap: Map<string, Customer>, vehicleMap: Map<string, Vehicle>, timezone: string): AppointmentWithSource {
  const metadata = metadataObject(row.metadata);
  const customerFromRelation = relatedCustomer(row);
  const customer = row.customer_id ? customerMap.get(row.customer_id) ?? (customerFromRelation ? mapCustomer(customerFromRelation) : null) : (customerFromRelation ? mapCustomer(customerFromRelation) : null);
  const vehicleFromRelation = relatedVehicle(row);
  const vehicle = row.vehicle_id ? vehicleMap.get(row.vehicle_id) ?? (vehicleFromRelation ? mapVehicle(vehicleFromRelation) : null) : (vehicleFromRelation ? mapVehicle(vehicleFromRelation) : null);
  const start = localDateTime(row.starts_at, timezone);
  const duration = Math.max(15, Math.round((Date.parse(row.ends_at) - Date.parse(row.starts_at)) / 60000));
  const guestName = optionalString(metadata.guest_name);
  // B2/T-1: the title is the server's composition (display_title) — the
  // client-side synthesis that used to live here is retired.
  const title = optionalString(row.display_title) ?? "Appointment";
  // B1/T-9: the server's composed status presentation wins; B1's own pure
  // view of the raw status is the fallback so label/tone can never drift.
  const statusView = appointmentStatusView(row.status);
  return { id: row.id, title, display_title: title, primary_service_name: optionalString(row.primary_service_name) ?? null,
    confirmation_code: optionalString(row.confirmation_code) ?? null,
    status_label: optionalString(row.status_label) ?? statusView.status_label,
    status_tone: row.status_tone ?? statusView.status_tone,
    scheduled_date: start.date, scheduled_time: start.time, duration_minutes: duration, status: row.status,
    customer, vehicle, guest_name: guestName ?? customer?.name ?? null, guest_email: optionalString(metadata.guest_email) ?? customer?.email ?? null,
    guest_phone: optionalString(metadata.guest_phone) ?? customer?.phone ?? null, notes: row.notes ?? optionalString(metadata.notes),
    description: optionalString(metadata.description) ?? row.notes ?? undefined, assigned_technician_id: row.assigned_user_id ?? null,
    source: row.source, intake_responses: metadata,
    job_total: row.job_total ?? undefined, job_due: row.job_due ?? undefined };
}

export interface AppointmentsViewWindow {
  viewMode: "today" | "week" | "month" | "board";
  anchor: Date;
}

/**
 * The starts_at window a view actually shows, in workspace-local days —
 * the same bucketing the views apply to scheduled_date: today and the
 * board show the anchor day; week shows Sunday–Saturday around the
 * anchor; month shows the calendar grid (the Sunday on/before the 1st
 * through the last day of the month).
 */
export function computeAppointmentsWindow(
  view: AppointmentsViewWindow,
  timezone: string,
): { from: string; to: string } {
  const parts = zonedDateTimeParts(view.anchor, timezone);
  const anchorLocal = new Date(parts.year, parts.month - 1, parts.day);
  const isoDay = (date: Date) => format(date, "yyyy-MM-dd");
  const startUtc = (date: Date) =>
    zonedLocalDateTimeToUtc(isoDay(date), "00:00:00", timezone).toISOString();
  switch (view.viewMode) {
    case "week": {
      const start = startOfWeek(anchorLocal, { weekStartsOn: 0 });
      return { from: startUtc(start), to: startUtc(addDays(start, 7)) };
    }
    case "month": {
      const start = startOfWeek(startOfMonth(anchorLocal), { weekStartsOn: 0 });
      const end = addDays(endOfMonth(anchorLocal), 1);
      return { from: startUtc(start), to: startUtc(end) };
    }
    default:
      return { from: startUtc(anchorLocal), to: startUtc(addDays(anchorLocal, 1)) };
  }
}

export interface AppointmentServiceLineRow {
  appointment_id: string;
  vehicle_id: string | null;
  price: number;
  quantity: number;
}

/**
 * Pure row assembly shared by the window load and the directory re-map
 * (Fix 3): retail filter + per-appointment service lines and vehicles.
 * With empty directories the rows map from their joined relations; the
 * page re-runs this with the full directories when they land.
 */
export function mapWindowAppointments(
  parsedRows: AppointmentApiRow[],
  serviceLines: AppointmentServiceLineRow[],
  customers: Customer[],
  vehicles: Vehicle[],
  timezone: string,
): AppointmentWithSource[] {
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const serviceLinesByAppointment = new Map<string, Array<{ price: number; quantity: number }>>();
  const vehicleIdsByAppointment = new Map<string, Set<string>>();
  serviceLines.forEach((line: any) => {
    if (!line.appointment_id) return;
    const current = serviceLinesByAppointment.get(line.appointment_id) ?? [];
    current.push({ price: Number(line.price ?? 0), quantity: Number(line.quantity ?? 1) });
    serviceLinesByAppointment.set(line.appointment_id, current);
    if (line.vehicle_id) {
      const ids = vehicleIdsByAppointment.get(line.appointment_id) ?? new Set<string>();
      ids.add(String(line.vehicle_id));
      vehicleIdsByAppointment.set(line.appointment_id, ids);
    }
  });
  return parsedRows
    .filter((row) => row.source !== "fleet_work_order" && !metadataObject(row.metadata).fleet_work_order_id)
    .map((row) => {
      const mapped = mapAppointment(row, customerMap, vehicleMap, timezone);
      const ids = vehicleIdsByAppointment.get(row.id) ?? new Set<string>();
      if (row.vehicle_id) ids.add(row.vehicle_id);
      const appointmentVehicles = Array.from(ids).map((id) => vehicleMap.get(id)).filter((vehicle): vehicle is Vehicle => Boolean(vehicle));
      return { ...mapped, vehicles: appointmentVehicles, appointment_services: serviceLinesByAppointment.get(row.id) ?? [] } as AppointmentWithSource;
    });
}

export interface AppointmentsWindowData {
  userId: string;
  appointments: AppointmentWithSource[];
  rawRows: AppointmentApiRow[];
  serviceLines: AppointmentServiceLineRow[];
  timezone: string;
  serviceCatalog: ServiceCatalogItem[];
  scheduleVans: AppointmentScheduleVan[];
  businessHours: BusinessHours;
  errors: AppointmentsPageErrors;
  providerName: string;
  providerEmail: string | null;
}

/**
 * The window load (Fix 3): everything the views need to paint — the
 * window's appointments with their service lines, the catalog, and the
 * scheduling settings. The full customer/vehicle directories are NOT
 * part of this load; they follow via fetchAppointmentDirectories.
 */
export async function fetchAppointmentsWindowData(
  view?: AppointmentsViewWindow,
): Promise<AppointmentsWindowData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to manage appointments.");
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  // Timezone first (best-effort): the fetch window is computed in
  // workspace-local days, and row mapping needs the same timezone.
  let timezone = DEFAULT_TIMEZONE;
  try {
    const workspaceResult = await apiClient.get<{ data: { timezone: string | null } | null }>(
      "/v1/appointments/workspace-context",
      { query: { selected_workspace_id: context.workspaceId } },
    );
    if (workspaceResult.data?.timezone) timezone = String(workspaceResult.data.timezone);
  } catch {
    /* the default timezone applies */
  }
  const window = view ? computeAppointmentsWindow(view, timezone) : undefined;

  const errors: AppointmentsPageErrors = {};
  const [appointmentsResult, catalogResult, scheduleResult] = await Promise.allSettled([
    nextApi.appointments.list(context.workspaceId, window),
    apiClient.get<{ data: Array<{ id: string; name: string; description: string | null; labor_price: number | string | null; estimated_minutes: number | null; category: string | null; is_active: boolean }> | null }>(
      "/v1/appointments/service-catalog",
      { query: { active: "true", selected_workspace_id: context.workspaceId } },
    ),
    apiClient.get<{ settings: Record<string, any> | null }>(
      "/v1/appointments/scheduling-settings",
      { query: { selected_workspace_id: context.workspaceId } },
    ),
  ]);

  const appointmentRows = appointmentsResult.status === "fulfilled" ? appointmentsResult.value.data : [];
  const catalogRows = catalogResult.status === "fulfilled" ? (catalogResult.value.data ?? []) : [];
  if (appointmentsResult.status === "rejected") errors.appointments = appointmentsResult.reason instanceof Error ? appointmentsResult.reason.message : "Failed to load appointments";
  if (catalogResult.status === "rejected") errors.catalog = "Failed to load service catalog";

  // Service lines for the fetched appointments only (Fix 3): the endpoint
  // scopes by appointment_ids, replacing the old whole-workspace pull.
  // Best-effort — a lines failure leaves rows without line detail, as a
  // rejected allSettled leg did before.
  const serviceLines: AppointmentServiceLineRow[] = [];
  if (appointmentsResult.status === "fulfilled" && appointmentRows.length > 0) {
    const ids = (appointmentRows as Array<{ id?: unknown }>)
      .map((row) => (typeof row.id === "string" ? row.id : ""))
      .filter(Boolean);
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const chunk = ids.slice(i, i + 500);
        const linesResult = await apiClient.get<{ data: AppointmentServiceLineRow[] | null }>(
          "/v1/appointments/service-lines",
          { query: { selected_workspace_id: context.workspaceId, appointment_ids: chunk.join(",") } },
        );
        serviceLines.push(...(linesResult.data ?? []));
      }
    } catch {
      serviceLines.length = 0;
    }
  }

  const rawRows = z.array(appointmentApiSchema).parse(appointmentRows);
  const appointments = mapWindowAppointments(rawRows, serviceLines, [], [], timezone);
  const serviceCatalog = catalogRows.map(mapCatalog);

  const scheduling = scheduleResult.status === "fulfilled" ? scheduleResult.value.settings : null;
  const rawDayHours = scheduling?.day_hours && typeof scheduling.day_hours === "object" && !Array.isArray(scheduling.day_hours) ? scheduling.day_hours as Record<string, any> : {};
  const configuredWorkingDays = Object.entries(rawDayHours)
    .filter(([, value]) => value && typeof value === "object" && (value as { is_open?: boolean }).is_open === true)
    .map(([day]) => day.charAt(0).toUpperCase() + day.slice(1));
  const businessHours: BusinessHours = {
    opening_time: hhmm(scheduling?.opening_time, DEFAULT_BUSINESS_HOURS.opening_time),
    closing_time: hhmm(scheduling?.closing_time, DEFAULT_BUSINESS_HOURS.closing_time),
    working_days: configuredWorkingDays.length ? configuredWorkingDays : (scheduling?.working_days ?? DEFAULT_BUSINESS_HOURS.working_days),
    slot_duration_minutes: Number(scheduling?.slot_duration_minutes ?? DEFAULT_BUSINESS_HOURS.slot_duration_minutes),
    min_lead_time_hours: Number(scheduling?.min_lead_time_hours ?? DEFAULT_BUSINESS_HOURS.min_lead_time_hours),
    buffer_time_before: Number(scheduling?.buffer_time_before ?? DEFAULT_BUSINESS_HOURS.buffer_time_before),
    buffer_time_after: Number(scheduling?.buffer_time_after ?? DEFAULT_BUSINESS_HOURS.buffer_time_after),
  };

  return { userId: user.id, appointments, rawRows, serviceLines, timezone, serviceCatalog, scheduleVans: [], businessHours, errors,
    providerName: "Service Writer", providerEmail: null };
}

export interface AppointmentDirectories {
  customers: Customer[];
  vehicles: Vehicle[];
  errors: AppointmentsPageErrors;
}

/**
 * The full customer/vehicle directories (Fix 3): the form pickers and
 * the full-record re-map. Loaded off the window's critical path — the
 * customers leg pages the whole table, which was the mount's long tail.
 */
export async function fetchAppointmentDirectories(): Promise<AppointmentDirectories> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  const errors: AppointmentsPageErrors = {};
  const [customersResult, vehiclesResult] = await Promise.allSettled([
    nextApi.customers.list(context.workspaceId),
    nextApi.vehicles.list(context.workspaceId),
  ]);
  const customerRows = customersResult.status === "fulfilled" ? customersResult.value.data : [];
  const vehicleRows = vehiclesResult.status === "fulfilled" ? vehiclesResult.value.data : [];
  if (customersResult.status === "rejected") errors.customers = customersResult.reason instanceof Error ? customersResult.reason.message : "Failed to load customers";
  if (vehiclesResult.status === "rejected") errors.vehicles = vehiclesResult.reason instanceof Error ? vehiclesResult.reason.message : "Failed to load vehicles";
  return {
    customers: z.array(customerApiSchema).parse(customerRows).map(mapCustomer),
    vehicles: z.array(vehicleApiSchema).parse(vehicleRows).map(mapVehicle),
    errors,
  };
}

/**
 * The single-shot page load: window data with the directories applied.
 * Kept for callers that need the complete picture in one promise; the
 * Appointments page itself loads in two phases (window first).
 */
export async function fetchAppointmentsPageData(
  view?: AppointmentsViewWindow,
): Promise<AppointmentsPageData> {
  const [windowData, directories] = await Promise.all([
    fetchAppointmentsWindowData(view),
    fetchAppointmentDirectories(),
  ]);
  return {
    userId: windowData.userId,
    appointments: mapWindowAppointments(
      windowData.rawRows,
      windowData.serviceLines,
      directories.customers,
      directories.vehicles,
      windowData.timezone,
    ),
    customers: directories.customers,
    vehicles: directories.vehicles,
    serviceCatalog: windowData.serviceCatalog,
    scheduleVans: windowData.scheduleVans,
    businessHours: windowData.businessHours,
    errors: { ...windowData.errors, ...directories.errors },
    providerName: windowData.providerName,
    providerEmail: windowData.providerEmail,
  };
}

export interface AppointmentPickerOption { id: string; title: string | null; status: string | null; scheduled_date: string | null; scheduled_time: string | null; customer_name: string | null; }

async function workspaceTimezone(): Promise<string> {
  const context = await resolveCurrentWorkspace();
  if (!context) return DEFAULT_TIMEZONE;
  const response = await apiClient.get<{ data: { timezone: string | null } | null }>(
    "/v1/appointments/workspace-context",
    { query: { selected_workspace_id: context.workspaceId } },
  );
  return response.data?.timezone || DEFAULT_TIMEZONE;
}

export async function fetchAppointmentPickerOption(appointmentId: string): Promise<AppointmentPickerOption | null> {
  const context = await resolveCurrentWorkspace(); if (!context) return null;
  const [response, timezone] = await Promise.all([nextApi.appointments.get(context.workspaceId, appointmentId), workspaceTimezone()]);
  const parsed = appointmentApiSchema.nullable().parse(response.data); if (!parsed) return null;
  const start = localDateTime(parsed.starts_at, timezone); const customer = relatedCustomer(parsed);
  const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null : null;
  return { id: parsed.id, title: customerName ? `${customerName} appointment` : "Appointment", status: parsed.status ?? null,
    scheduled_date: start.date, scheduled_time: start.time, customer_name: customerName };
}

export async function searchAppointmentPickerOptions(params: { userId: string; status: string; query: string; limit?: number }): Promise<AppointmentPickerOption[]> {
  const context = await resolveCurrentWorkspace(); if (!context) return [];
  const [response, timezone] = await Promise.all([nextApi.appointments.list(context.workspaceId), workspaceTimezone()]);
  const q = params.query.trim().toLowerCase();
  return z.array(appointmentApiSchema).parse(response.data)
    .filter((row) => params.status === "all" || row.status === params.status)
    .map((row) => { const start = localDateTime(row.starts_at, timezone); const customer = relatedCustomer(row);
      const customerName = customer ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null : null;
      return { id: row.id, title: customerName ? `${customerName} appointment` : "Appointment", status: row.status ?? null,
        scheduled_date: start.date, scheduled_time: start.time, customer_name: customerName } as AppointmentPickerOption; })
    .filter((row) => !q || `${row.title ?? ""} ${row.customer_name ?? ""}`.toLowerCase().includes(q)).slice(0, params.limit ?? 40);
}

export async function fetchReviewRequestStatusForService(_serviceRecordId: string, _userId: string): Promise<string | null> { return null; }
