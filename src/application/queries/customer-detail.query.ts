/** Customer Detail Query - canonical customer history bundle. */
import { z } from "zod";
import { coreApiFetch } from "@/lib/coreApiFetch";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CustomerDetailCustomer {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  notes: string | null;
  created_at: string;
}

export interface CustomerDetailVehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string | null;
  license_plate: string | null;
  color: string | null;
  mileage: number | null;
  plate_state: string | null;
  engine: string | null;
  oil_type: string | null;
  oil_capacity: string | null;
  oil_filter: string | null;
}

export interface CustomerDetailService {
  id: string;
  service_date: string;
  service_type: string;
  description: string;
  total_cost: number;
  status: string;
  vehicle_id: string | null;
}

export interface CustomerDetailQuote {
  id: string;
  quote_number: string;
  quote_date: string;
  description: string;
  total_cost: number;
  status: string;
  vehicle_id: string | null;
}

export interface CustomerDetailAppointment {
  id: string;
  title: string;
  description: string | null;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  estimated_cost: number | null;
  status: string;
  vehicle_id: string | null;
}

export interface CustomerDetailResult {
  customer: CustomerDetailCustomer;
  vehicles: CustomerDetailVehicle[];
  services: CustomerDetailService[];
  quotes: CustomerDetailQuote[];
  appointments: CustomerDetailAppointment[];
  /** Legacy screen compatibility only: successful payment amounts exposed as cents. */
  paymentRecords: { amount: number; status: string }[];
}

const customerSchema = z.object({
  id: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  address_line1: z.string().nullable(),
  address_line2: z.string().nullable(),
  city: z.string().nullable(),
  region: z.string().nullable(),
  postal_code: z.string().nullable(),
  notes: z.string().nullable(),
  created_at: z.string(),
});

const vehicleSpecsSchema = z.object({
  engine: z.string().nullable(),
  oil_type: z.string().nullable(),
  oil_capacity: z.string().nullable(),
  oil_filter: z.string().nullable(),
}).passthrough();

const vehicleSchema = z.object({
  id: z.string(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  year: z.number().nullable(),
  vin: z.string().nullable(),
  license_plate: z.string().nullable(),
  plate_region: z.string().nullable(),
  color: z.string().nullable(),
  mileage: z.number().nullable(),
  vehicle_service_specs: z.union([vehicleSpecsSchema, z.array(vehicleSpecsSchema)]).nullable().optional(),
}).passthrough();

const serviceRecordSchema = z.object({
  id: z.string(),
  completed_at: z.string().nullable(),
  created_at: z.string(),
  work_performed: z.string().nullable(),
  total_amount: z.number(),
  status: z.string(),
  vehicle_id: z.string().nullable(),
  metadata: z.unknown(),
}).passthrough();

const quoteSchema = z.object({
  id: z.string(),
  created_at: z.string(),
  total: z.number(),
  status: z.string(),
  vehicle_id: z.string().nullable(),
  metadata: z.unknown(),
}).passthrough();

const appointmentSchema = z.object({
  id: z.string(),
  starts_at: z.string(),
  ends_at: z.string(),
  notes: z.string().nullable(),
  status: z.string(),
  vehicle_id: z.string().nullable(),
  metadata: z.unknown(),
}).passthrough();

const paymentSchema = z.object({
  amount: z.number(),
  status: z.string(),
}).passthrough();

const summarySchema = z.object({
  data: z.object({
    customer: customerSchema,
    vehicles: z.array(vehicleSchema),
    service_records: z.array(serviceRecordSchema),
    quotes: z.array(quoteSchema),
    appointments: z.array(appointmentSchema),
    payments: z.array(paymentSchema),
  }),
});

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function localDateTime(iso: string, timezone = "America/New_York") {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
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

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function optionalString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetailResult | null> {
  if (!customerId || !UUID_REGEX.test(customerId)) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  let response: z.infer<typeof summarySchema>;
  try {
    response = summarySchema.parse(
      await coreApiFetch<unknown>(
        `/v1/customers/${customerId}/summary?workspace_id=${encodeURIComponent(context.workspaceId)}`,
      ),
    );
  } catch {
    return null;
  }

  const source = response.data;
  const c = source.customer;
  const customer = {
    id: c.id,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer",
    email: c.email,
    phone: c.phone,
    address: [c.address_line1, c.address_line2, c.city, c.region, c.postal_code].filter(Boolean).join(", ") || null,
    notes: c.notes,
    created_at: c.created_at,
  };

  const vehicles = source.vehicles.map((vehicle) => {
    const specs = Array.isArray(vehicle.vehicle_service_specs)
      ? vehicle.vehicle_service_specs[0]
      : vehicle.vehicle_service_specs;
    return {
      id: vehicle.id,
      make: vehicle.make ?? "Unknown",
      model: vehicle.model ?? "Unknown",
      year: vehicle.year ?? new Date().getFullYear(),
      vin: vehicle.vin,
      license_plate: vehicle.license_plate,
      color: vehicle.color,
      mileage: vehicle.mileage,
      plate_state: vehicle.plate_region ?? null,
      engine: specs?.engine ?? null,
      oil_type: specs?.oil_type ?? null,
      oil_capacity: specs?.oil_capacity ?? null,
      oil_filter: specs?.oil_filter ?? null,
    };
  });

  const services = source.service_records.map((record) => {
    const metadata = objectValue(record.metadata);
    const serviceDate = record.completed_at || record.created_at;
    return {
      id: record.id,
      service_date: serviceDate ? serviceDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      service_type: optionalString(metadata.service_type) || optionalString(metadata.title) || record.work_performed || "Service",
      description: record.work_performed || optionalString(metadata.description) || "",
      total_cost: Number(record.total_amount ?? 0),
      status: record.status,
      vehicle_id: record.vehicle_id,
    };
  });

  const quotes = source.quotes.map((quote) => {
    const metadata = objectValue(quote.metadata);
    return {
      id: quote.id,
      quote_number: optionalString(metadata.quote_number) || `Q-${quote.id.slice(0, 8).toUpperCase()}`,
      quote_date: optionalString(metadata.quote_date) || quote.created_at.slice(0, 10),
      description: optionalString(metadata.description) || "Quote",
      total_cost: quote.total,
      status: quote.status,
      vehicle_id: quote.vehicle_id,
    };
  });

  const appointments = source.appointments.map((appointment) => {
    const metadata = objectValue(appointment.metadata);
    const local = localDateTime(appointment.starts_at);
    return {
      id: appointment.id,
      title: optionalString(metadata.title) || "Appointment",
      description: optionalString(metadata.description) || appointment.notes || null,
      scheduled_date: local.date,
      scheduled_time: local.time,
      duration_minutes: Math.max(5, Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000)),
      estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : null,
      status: appointment.status,
      vehicle_id: appointment.vehicle_id,
    };
  });

  // Final stores dollars. The preserved CustomerDetail screen still divides by
  // 100, so this adapter exposes cents until that legacy screen is rewritten.
  const paymentRecords = source.payments.map((payment) => ({
    amount: Math.round(Number(payment.amount ?? 0) * 100),
    status: payment.status,
  }));

  return { customer, vehicles, services, quotes, appointments, paymentRecords };
}
