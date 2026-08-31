import { z } from "zod";
import { productionSupabase } from "@/integrations/supabase/client";
import type { Appointment, BusinessHours, Customer, ServiceCatalogItem, Vehicle } from "@/shared/types";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";

const customerApiSchema = z.object({
  id: z.string(),
  first_name: z.string().nullable().optional(),
  last_name: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  address_line1: z.string().nullable().optional(),
  address_line2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  region: z.string().nullable().optional(),
  postal_code: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
}).passthrough();

const vehicleApiSchema = z.object({
  id: z.string(),
  customer_id: z.string().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  vin: z.string().nullable().optional(),
  license_plate: z.string().nullable().optional(),
  plate_region: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  mileage: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
}).passthrough();

const appointmentApiSchema = z.object({
  id: z.string(),
  // Public/guest bookings are valid before a customer record is linked.
  customer_id: z.string().nullable().optional(),
  vehicle_id: z.string().nullable().optional(),
  starts_at: z.string(),
  ends_at: z.string(),
  status: z.string(),
  assigned_user_id: z.string().nullable().optional(),
  source: z.string(),
  notes: z.string().nullable().optional(),
  metadata: z.unknown().optional(),
  customers: z.union([customerApiSchema, z.array(customerApiSchema)]).nullable().optional(),
}).passthrough();

type CustomerApiRow = z.infer<typeof customerApiSchema>;
type VehicleApiRow = z.infer<typeof vehicleApiSchema>;
type AppointmentApiRow = z.infer<typeof appointmentApiSchema>;

export interface AppointmentWithSource extends Appointment {
  source?: "manual" | "online_booking" | "ai_intake" | string;
  intake_responses?: Record<string, unknown> | null;
}

export interface AppointmentsPageErrors {
  appointments?: string;
  customers?: string;
  vehicles?: string;
  catalog?: string;
}

export interface AppointmentScheduleVan {
  id: string;
  name: string;
}

export interface AppointmentsPageData {
  userId: string;
  appointments: AppointmentWithSource[];
  customers: Customer[];
  vehicles: Vehicle[];
  serviceCatalog: ServiceCatalogItem[];
  scheduleVans: AppointmentScheduleVan[];
  businessHours: BusinessHours;
  errors: AppointmentsPageErrors;
  providerName: string;
  providerEmail: string | null;
}

const DEFAULT_BUSINESS_HOURS: BusinessHours = {
  opening_time: "09:00",
  closing_time: "17:00",
  working_days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  slot_duration_minutes: 60,
  min_lead_time_hours: 8,
  buffer_time_before: 0,
  buffer_time_after: 0,
};

const APP_TIMEZONE = "America/New_York";

function localDateTime(iso: string): { date: string; time: string } {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(iso));
  const get = (type: Intl.DateTimeFormatPartTypes) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, time: `${get("hour")}:${get("minute")}` };
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value ? value : undefined;
}

function metadataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function relatedCustomer(row: AppointmentApiRow): CustomerApiRow | null {
  return Array.isArray(row.customers) ? row.customers[0] ?? null : row.customers ?? null;
}

function mapCustomer(row: CustomerApiRow): Customer {
  return {
    id: row.id,
    name: [row.first_name, row.last_name].filter(Boolean).join(" ") || "Customer",
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: [row.address_line1, row.address_line2, row.city, row.region, row.postal_code].filter(Boolean).join(", "),
    notes: row.notes ?? undefined,
    created_at: row.created_at,
  };
}

function mapVehicle(row: VehicleApiRow): Vehicle {
  return {
    id: row.id,
    customer_id: row.customer_id ?? undefined,
    make: row.make || "Unknown",
    model: row.model || "Unknown",
    year: Number(row.year || new Date().getFullYear()),
    vin: row.vin ?? undefined,
    license_plate: row.license_plate ?? undefined,
    plate_state: row.plate_region ?? undefined,
    color: row.color ?? undefined,
    mileage: row.mileage ?? undefined,
    notes: row.notes ?? undefined,
    created_at: row.created_at,
  };
}

function mapCatalog(row: {
  id: string;
  name: string;
  description: string | null;
  labor_price: number;
  estimated_minutes: number | null;
  category: string | null;
  is_active: boolean;
}): ServiceCatalogItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description || "",
    default_price: Number(row.labor_price ?? 0),
    estimated_duration: row.estimated_minutes ?? undefined,
    category: row.category ?? undefined,
    is_active: row.is_active,
  };
}

function mapAppointment(row: AppointmentApiRow, customerMap: Map<string, Customer>, vehicleMap: Map<string, Vehicle>): AppointmentWithSource {
  const metadata = metadataObject(row.metadata);
  const customerFromRelation = relatedCustomer(row);
  const customer = row.customer_id
    ? customerMap.get(row.customer_id) ?? (customerFromRelation ? mapCustomer(customerFromRelation) : null)
    : (customerFromRelation ? mapCustomer(customerFromRelation) : null);
  const vehicle = row.vehicle_id ? vehicleMap.get(row.vehicle_id) ?? null : null;
  const startsAt = row.starts_at;
  const endsAt = row.ends_at;
  const start = localDateTime(startsAt);
  const duration = Math.max(15, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000));
  const guestName = optionalString(metadata.guest_name);
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle";
  const title = optionalString(metadata.title)
    ?? optionalString(metadata.service_name)
    ?? (customer ? `${customer.name} — ${vehicleLabel}` : (guestName ? `${guestName} — ${vehicleLabel}` : vehicleLabel));
  return {
    id: row.id,
    title,
    scheduled_date: start.date,
    scheduled_time: start.time,
    duration_minutes: duration,
    status: row.status,
    customer,
    vehicle,
    guest_name: guestName ?? customer?.name ?? null,
    guest_email: optionalString(metadata.guest_email) ?? customer?.email ?? null,
    guest_phone: optionalString(metadata.guest_phone) ?? customer?.phone ?? null,
    notes: row.notes ?? optionalString(metadata.notes),
    description: optionalString(metadata.description) ?? row.notes ?? undefined,
    assigned_technician_id: row.assigned_user_id ?? null,
    source: row.source,
    intake_responses: metadata,
  };
}

/** Fetch all data needed for the main Appointments page through Final's canonical contracts. */
export async function fetchAppointmentsPageData(): Promise<AppointmentsPageData> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("You must be logged in to manage appointments.");

  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");

  const errors: AppointmentsPageErrors = {};
  const [appointmentsResult, customersResult, vehiclesResult, settingsResult, catalogResult] = await Promise.allSettled([
    nextApi.appointments.list(context.workspaceId),
    nextApi.customers.list(context.workspaceId),
    nextApi.vehicles.list(context.workspaceId),
    fetchBusinessSettings(),
    productionSupabase.from("service_catalog").select("*").eq("workspace_id", context.workspaceId).eq("is_active", true).order("name"),
  ]);

  const customerRows = customersResult.status === "fulfilled" ? customersResult.value.data : [];
  const vehicleRows = vehiclesResult.status === "fulfilled" ? vehiclesResult.value.data : [];
  const appointmentRows = appointmentsResult.status === "fulfilled" ? appointmentsResult.value.data : [];
  const catalogRows = catalogResult.status === "fulfilled" ? (catalogResult.value.data ?? []) : [];

  if (appointmentsResult.status === "rejected") errors.appointments = appointmentsResult.reason instanceof Error ? appointmentsResult.reason.message : "Failed to load appointments";
  if (customersResult.status === "rejected") errors.customers = customersResult.reason instanceof Error ? customersResult.reason.message : "Failed to load customers";
  if (vehiclesResult.status === "rejected") errors.vehicles = vehiclesResult.reason instanceof Error ? vehiclesResult.reason.message : "Failed to load vehicles";
  if (catalogResult.status === "rejected" || (catalogResult.status === "fulfilled" && catalogResult.value.error)) {
    errors.catalog = "Failed to load service catalog";
  }

  const customers = z.array(customerApiSchema).parse(customerRows).map(mapCustomer);
  const vehicles = z.array(vehicleApiSchema).parse(vehicleRows).map(mapVehicle);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const appointments = z.array(appointmentApiSchema).parse(appointmentRows)
    .filter((row) => row.source !== "fleet_work_order" && !metadataObject(row.metadata).fleet_work_order_id)
    .map((row) => mapAppointment(row, customerMap, vehicleMap));
  const serviceCatalog = catalogRows.map(mapCatalog);

  const settings = settingsResult.status === "fulfilled" ? settingsResult.value : null;
  const businessHours: BusinessHours = settings ? {
    opening_time: settings.opening_time || DEFAULT_BUSINESS_HOURS.opening_time,
    closing_time: settings.closing_time || DEFAULT_BUSINESS_HOURS.closing_time,
    working_days: settings.working_days || DEFAULT_BUSINESS_HOURS.working_days,
    slot_duration_minutes: DEFAULT_BUSINESS_HOURS.slot_duration_minutes,
    min_lead_time_hours: DEFAULT_BUSINESS_HOURS.min_lead_time_hours,
    buffer_time_before: DEFAULT_BUSINESS_HOURS.buffer_time_before,
    buffer_time_after: DEFAULT_BUSINESS_HOURS.buffer_time_after,
  } : DEFAULT_BUSINESS_HOURS;

  return {
    userId: user.id,
    appointments,
    customers,
    vehicles,
    serviceCatalog,
    // Vans are not part of the canonical Service Writer core schema. Fleet and
    // fleet-resource scheduling are intentionally excluded from this rebuild.
    scheduleVans: [],
    businessHours,
    errors,
    providerName: settings?.business_name || "Service Writer",
    providerEmail: settings?.email || null,
  };
}

export interface AppointmentPickerOption {
  id: string;
  title: string | null;
  status: string | null;
  scheduled_date: string | null;
  scheduled_time: string | null;
  customer_name: string | null;
}

export async function fetchAppointmentPickerOption(appointmentId: string): Promise<AppointmentPickerOption | null> {
  const context = await resolveCurrentWorkspace();
  if (!context) return null;
  const response = await nextApi.appointments.get(context.workspaceId, appointmentId);
  const parsed = appointmentApiSchema.nullable().parse(response.data);
  if (!parsed) return null;
  const row = parsed;
  const start = localDateTime(row.starts_at);
  const customer = relatedCustomer(row);
  const customerName = customer
    ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
    : null;
  return {
    id: row.id,
    title: customerName ? `${customerName} appointment` : "Appointment",
    status: row.status ?? null,
    scheduled_date: start.date,
    scheduled_time: start.time,
    customer_name: customerName,
  };
}

export async function searchAppointmentPickerOptions(params: {
  userId: string;
  status: string;
  query: string;
  limit?: number;
}): Promise<AppointmentPickerOption[]> {
  const context = await resolveCurrentWorkspace();
  if (!context) return [];
  const response = await nextApi.appointments.list(context.workspaceId);
  const q = params.query.trim().toLowerCase();
  return z.array(appointmentApiSchema).parse(response.data)
    .filter((row) => params.status === "all" || row.status === params.status)
    .map((row) => {
      const start = localDateTime(row.starts_at);
      const customer = relatedCustomer(row);
      const customerName = customer
        ? [customer.first_name, customer.last_name].filter(Boolean).join(" ") || null
        : null;
      return {
        id: row.id,
        title: customerName ? `${customerName} appointment` : "Appointment",
        status: row.status ?? null,
        scheduled_date: start.date,
        scheduled_time: start.time,
        customer_name: customerName,
      } as AppointmentPickerOption;
    })
    .filter((row) => !q || `${row.title ?? ""} ${row.customer_name ?? ""}`.toLowerCase().includes(q))
    .slice(0, params.limit ?? 40);
}

/** Review requests are not yet a canonical Final table; callers treat null as not requested. */
export async function fetchReviewRequestStatusForService(_serviceRecordId: string, _userId: string): Promise<string | null> {
  return null;
}
