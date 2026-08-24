/** Customer Detail Query - canonical customer history bundle. */
import { coreApiFetch } from "@/lib/coreApiFetch";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

export interface CustomerDetailResult {
  customer: any;
  vehicles: any[];
  services: any[];
  quotes: any[];
  appointments: any[];
  /** Successful Final payments; amount is stored in dollars. */
  paymentRecords: { amount: number; status: string }[];
}

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

function objectValue(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

export async function fetchCustomerDetail(customerId: string): Promise<CustomerDetailResult | null> {
  if (!customerId || !UUID_REGEX.test(customerId)) return null;
  const context = await resolveCurrentWorkspace();
  if (!context) return null;

  type SummaryResponse = {
    data: {
      customer: any;
      vehicles: any[];
      service_records: any[];
      quotes: any[];
      appointments: any[];
      payments: any[];
    };
  };

  let response: SummaryResponse;
  try {
    response = await coreApiFetch<SummaryResponse>(
      `/v1/customers/${customerId}/summary?workspace_id=${encodeURIComponent(context.workspaceId)}`,
    );
  } catch {
    return null;
  }

  const source = response.data;
  const c = source.customer;
  const customer = {
    ...c,
    name: [c.first_name, c.last_name].filter(Boolean).join(" ") || "Customer",
    address: [c.address_line1, c.address_line2, c.city, c.region, c.postal_code].filter(Boolean).join(", ") || null,
  };

  const vehicles = source.vehicles.map((vehicle) => {
    const specs = Array.isArray(vehicle.vehicle_service_specs)
      ? vehicle.vehicle_service_specs[0]
      : vehicle.vehicle_service_specs;
    return {
      ...vehicle,
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
      ...record,
      service_date: serviceDate ? serviceDate.slice(0, 10) : new Date().toISOString().slice(0, 10),
      service_type: metadata.service_type || metadata.title || record.work_performed || "Service",
      description: record.work_performed || metadata.description || "",
      total_cost: Number(record.total_amount ?? 0),
      service_number: metadata.service_number ?? null,
      technician: metadata.technician ?? null,
      parts_used: metadata.parts_used ?? null,
    };
  });

  const quotes = source.quotes.map((quote) => ({
    ...quote,
    quote_number: quote.quote_number || `Q-${String(quote.id).slice(0, 8).toUpperCase()}`,
    quote_date: quote.created_at?.slice(0, 10) || new Date().toISOString().slice(0, 10),
    description: quote.description || "Quote",
    total_cost: Number(quote.total ?? 0),
  }));

  const appointments = source.appointments.map((appointment) => {
    const metadata = objectValue(appointment.metadata);
    const local = localDateTime(appointment.starts_at);
    return {
      ...appointment,
      title: metadata.title || "Appointment",
      description: metadata.description || appointment.notes || null,
      scheduled_date: local.date,
      scheduled_time: local.time,
      duration_minutes: Math.max(5, Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000)),
      estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : null,
    };
  });

  const paymentRecords = source.payments.map((payment) => ({
    amount: Number(payment.amount ?? 0),
    status: payment.status,
  }));

  return { customer, vehicles, services, quotes, appointments, paymentRecords };
}
