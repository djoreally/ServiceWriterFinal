import { supabase } from "@/integrations/supabase/client";
import type { Appointment, BusinessHours, Customer, ServiceCatalogItem, Vehicle } from "@/shared/types";
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { fetchBusinessSettings, resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { nextApi } from "@/lib/nextApiClient";

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

function mapCustomer(row: any): Customer {
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

function mapVehicle(row: any): Vehicle {
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

function mapCatalog(row: any): ServiceCatalogItem {
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

function mapAppointment(row: any, customerMap: Map<string, Customer>, vehicleMap: Map<string, Vehicle>): AppointmentWithSource {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata as Record<string, any> : {};
  const customer = customerMap.get(row.customer_id) ?? null;
  const vehicle = row.vehicle_id ? vehicleMap.get(row.vehicle_id) ?? null : null;
  const startsAt = row.starts_at ?? `${row.scheduled_date}T${row.scheduled_time ?? "00:00"}:00`;
  const endsAt = row.ends_at ?? new Date(Date.parse(startsAt) + Number(row.duration_minutes ?? 60) * 60_000).toISOString();
  const start = localDateTime(startsAt);
  const duration = Math.max(15, Math.round((Date.parse(endsAt) - Date.parse(startsAt)) / 60000));
  const vehicleLabel = vehicle ? `${vehicle.year} ${vehicle.make} ${vehicle.model}` : "Vehicle";
  const title = row.title ?? metadata.title ?? metadata.service_name ?? (customer ? `${customer.name} — ${vehicleLabel}` : vehicleLabel);
  return {
    id: row.id,
    title,
    scheduled_date: start.date,
    scheduled_time: start.time,
    duration_minutes: duration,
    status: row.status,
    customer,
    vehicle,
    guest_name: row.guest_name ?? customer?.name ?? null,
    guest_email: row.guest_email ?? customer?.email ?? null,
    guest_phone: row.guest_phone ?? customer?.phone ?? null,
    notes: row.notes ?? metadata.notes ?? undefined,
    description: row.notes ?? metadata.description ?? undefined,
    assigned_technician_id: row.assigned_user_id ?? null,
    source: row.source,
    intake_responses: row.metadata && typeof row.metadata === "object" ? row.metadata : null,
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
    (supabase as any).from("service_catalog").select("*").eq("workspace_id", context.workspaceId).eq("is_active", true).order("name"),
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

  const customers = (customerRows as any[]).map(mapCustomer);
  const vehicles = (vehicleRows as any[]).map(mapVehicle);
  const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
  const vehicleMap = new Map(vehicles.map((vehicle) => [vehicle.id, vehicle]));
  const appointments = (appointmentRows as any[])
    .filter((row) => row.source !== "fleet_work_order" && !(row.metadata && typeof row.metadata === "object" && row.metadata.fleet_work_order_id))
    .map((row) => mapAppointment(row, customerMap, vehicleMap));
  const serviceCatalog = (catalogRows as any[]).map(mapCatalog);

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
  const row = response.data as any;
  if (!row) return null;
  const start = localDateTime(row.starts_at);
  const customerName = row.customers ? [row.customers.first_name, row.customers.last_name].filter(Boolean).join(" ") : null;
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
  return (response.data as any[])
    .filter((row) => params.status === "all" || row.status === params.status)
    .map((row) => {
      const start = localDateTime(row.starts_at);
      const customerName = row.customers ? [row.customers.first_name, row.customers.last_name].filter(Boolean).join(" ") : null;
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
