/** Vehicle Detail Queries — canonical vehicle detail compatibility adapters. */
import { getCurrentAuthUser } from "@/lib/auth/current-user";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { coreApiFetch } from "@/lib/coreApiFetch";

export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

type VehicleSummary = {
  vehicle: any;
  service_records: any[];
  appointments: any[];
  work_orders: any[];
  invoices: any[];
};

const summaryCache = new Map<string, Promise<VehicleSummary>>();

function metadataObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {};
}

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

async function fetchSummary(vehicleId: string): Promise<VehicleSummary> {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace");
  const cacheKey = `${context.workspaceId}:${vehicleId}`;
  let request = summaryCache.get(cacheKey);
  if (!request) {
    request = coreApiFetch<{ data: VehicleSummary }>(
      `/v1/vehicles/${vehicleId}/summary?workspace_id=${encodeURIComponent(context.workspaceId)}`,
    ).then((response) => response.data);
    summaryCache.set(cacheKey, request);
    request.finally(() => setTimeout(() => summaryCache.delete(cacheKey), 1000));
  }
  return request;
}

function legacyVehicle(vehicle: any) {
  const specs = Array.isArray(vehicle.vehicle_service_specs)
    ? vehicle.vehicle_service_specs[0]
    : vehicle.vehicle_service_specs;
  const meta = metadataObject(vehicle.metadata);
  return {
    ...vehicle,
    user_id: "",
    plate_state: vehicle.plate_region ?? null,
    odometer_measure: meta.odometer_measure ?? null,
    engine: specs?.engine ?? null,
    oil_type: specs?.oil_type ?? null,
    oil_capacity: specs?.oil_capacity ?? null,
    oil_filter: specs?.oil_filter ?? null,
  };
}

/** Fetch a vehicle by id. Workspace membership is enforced server-side. */
export async function fetchVehicleById(vehicleId: string, _userId: string) {
  try {
    const summary = await fetchSummary(vehicleId);
    return { data: legacyVehicle(summary.vehicle), error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch the vehicle's linked customer. */
export async function fetchCustomerById(customerId: string) {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) return { data: null, error: null };
    const response = await coreApiFetch<{ data: any }>(
      `/v1/customers/${customerId}?workspace_id=${encodeURIComponent(context.workspaceId)}`,
    );
    const customer = response.data;
    return {
      data: {
        id: customer.id,
        name: [customer.first_name, customer.last_name].filter(Boolean).join(" ") || "Customer",
        email: customer.email ?? null,
        phone: customer.phone ?? null,
      },
      error: null,
    };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch canonical service records mapped to the preserved service-history shape. */
export async function fetchVehicleServices(vehicleId: string) {
  try {
    const summary = await fetchSummary(vehicleId);
    const data = summary.service_records.map((record) => {
      const metadata = metadataObject(record.metadata);
      const serviceDate = record.completed_at || record.created_at;
      return {
        ...record,
        service_date: serviceDate ? serviceDate.slice(0, 10) : null,
        service_type: metadata.service_type || metadata.title || record.work_performed || "Service",
        description: record.work_performed || metadata.description || "",
        total_cost: Number(record.total_amount ?? 0),
        service_number: metadata.service_number ?? null,
        technician: metadata.technician ?? null,
        parts_used: metadata.parts_used ?? null,
      };
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch appointments mapped from canonical timestamps. */
export async function fetchVehicleAppointments(vehicleId: string) {
  try {
    const summary = await fetchSummary(vehicleId);
    const data = summary.appointments.map((appointment) => {
      const metadata = metadataObject(appointment.metadata);
      const local = localDateTime(appointment.starts_at);
      return {
        ...appointment,
        title: metadata.title || "Appointment",
        scheduled_date: local.date,
        scheduled_time: local.time,
        duration_minutes: Math.max(5, Math.round((Date.parse(appointment.ends_at) - Date.parse(appointment.starts_at)) / 60000)),
        description: metadata.description || appointment.notes || null,
        estimated_cost: metadata.estimated_cost != null ? Number(metadata.estimated_cost) : null,
      };
    });
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch canonical work orders mapped to old field names used by the preserved page. */
export async function fetchVehicleWorkOrders(vehicleId: string) {
  try {
    const summary = await fetchSummary(vehicleId);
    const data = summary.work_orders.map((workOrder) => ({
      ...workOrder,
      order_number: workOrder.number,
      tech_notes: workOrder.technician_notes ?? null,
      mileage_captured: null,
      technicians: null,
      customers: summary.vehicle.customers
        ? { id: summary.vehicle.customers.id, name: [summary.vehicle.customers.first_name, summary.vehicle.customers.last_name].filter(Boolean).join(" ") }
        : null,
      appointments: workOrder.appointment_id
        ? summary.appointments.find((appointment) => appointment.id === workOrder.appointment_id) ?? null
        : null,
    }));
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch real canonical invoices instead of treating service records as invoices. */
export async function fetchVehicleInvoices(vehicleId: string) {
  try {
    const summary = await fetchSummary(vehicleId);
    const data = summary.invoices.map((invoice) => ({
      ...invoice,
      service_number: invoice.invoice_number != null ? `INV-${invoice.invoice_number}` : null,
      service_date: (invoice.issued_at || invoice.created_at || "").slice(0, 10),
      total_cost: Number(invoice.total ?? 0),
      vehicle_id: vehicleId,
    }));
    return { data, error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fleet is a separate product and is intentionally not queried from Service Writer. */
export async function fetchFleetLinkForVehicle(
  _vin: string | null,
  _licensePlate: string | null,
): Promise<{ data: null; error: null }> {
  return { data: null, error: null };
}
