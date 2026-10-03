import "server-only";

import { serviceWriterApi } from "@/server/service-writer-api";
import { zonedDateTimeParts, zonedLocalDateTimeToUtc } from "@/server/scheduling/timezone";

export type ApiWorkspace = Record<string, unknown> & { id: string; name?: string; timezone?: string };
export type ApiAppointment = Record<string, unknown> & {
  id: string;
  workspaceId: string;
  customerId: string;
  vehicleId: string;
  localDate: string;
  startMinute: number;
  endMinute: number;
  status: string;
  notes?: string | null;
  metadata?: Record<string, unknown> | null;
};
export type ApiCustomer = Record<string, unknown> & { id: string; firstName?: string; lastName?: string; companyName?: string | null; email?: string | null; phone?: string | null; addressLine1?: string | null; addressLine2?: string | null; city?: string | null; region?: string | null; postalCode?: string | null; notes?: string | null };
export type ApiVehicle = Record<string, unknown> & { id: string; customerId?: string | null; year?: number | null; make?: string | null; model?: string | null; vin?: string | null; licensePlate?: string | null; plateRegion?: string | null; color?: string | null; mileage?: number | null; notes?: string | null };

function pad(value: number) { return String(value).padStart(2, "0"); }

export function isoToWorkspaceSchedule(iso: string, timeZone: string) {
  const parts = zonedDateTimeParts(new Date(iso), timeZone);
  return {
    localDate: `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`,
    minute: parts.hour * 60 + parts.minute,
  };
}

export function scheduleToIso(localDate: string, minute: number, timeZone: string) {
  const hour = Math.floor(minute / 60);
  const mins = minute % 60;
  return zonedLocalDateTimeToUtc(localDate, `${pad(hour)}:${pad(mins)}:00`, timeZone).toISOString();
}

export async function loadWorkspace(request: Request, workspaceId: string) {
  return serviceWriterApi<ApiWorkspace>(request, `/api/v1/workspaces/${workspaceId}`);
}

export async function loadAppointmentRelations(request: Request, workspaceId: string, appointments: ApiAppointment[]) {
  const customerIds = [...new Set(appointments.map((row) => row.customerId).filter(Boolean))];
  const vehicleIds = [...new Set(appointments.map((row) => row.vehicleId).filter(Boolean))];
  const customers = new Map<string, ApiCustomer>();
  const vehicles = new Map<string, ApiVehicle>();
  await Promise.all([
    ...customerIds.map(async (id) => {
      try { customers.set(id, await serviceWriterApi<ApiCustomer>(request, `/api/v1/workspaces/${workspaceId}/customers/${id}`)); } catch { /* preserve appointment visibility */ }
    }),
    ...vehicleIds.map(async (id) => {
      try { vehicles.set(id, await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${workspaceId}/vehicles/${id}`)); } catch { /* preserve appointment visibility */ }
    }),
  ]);
  return { customers, vehicles };
}

export function legacyAppointment(row: ApiAppointment, timeZone: string, customer?: ApiCustomer | null, vehicle?: ApiVehicle | null) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const startsAt = typeof metadata.legacy_starts_at === "string" ? metadata.legacy_starts_at : scheduleToIso(row.localDate, row.startMinute, timeZone);
  const endsAt = typeof metadata.legacy_ends_at === "string" ? metadata.legacy_ends_at : scheduleToIso(row.localDate, row.endMinute, timeZone);
  return {
    ...row,
    workspace_id: row.workspaceId,
    customer_id: row.customerId,
    vehicle_id: row.vehicleId,
    starts_at: startsAt,
    ends_at: endsAt,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    customers: customer ? {
      id: customer.id,
      first_name: customer.firstName,
      last_name: customer.lastName,
      company_name: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      address_line1: customer.addressLine1,
      address_line2: customer.addressLine2,
      city: customer.city,
      region: customer.region,
      postal_code: customer.postalCode,
      notes: customer.notes,
    } : null,
    vehicles: vehicle ? {
      id: vehicle.id,
      customer_id: vehicle.customerId,
      year: vehicle.year,
      make: vehicle.make,
      model: vehicle.model,
      vin: vehicle.vin,
      license_plate: vehicle.licensePlate,
      plate_region: vehicle.plateRegion,
      color: vehicle.color,
      mileage: vehicle.mileage,
      notes: vehicle.notes,
    } : null,
    title: metadata.title ?? null,
    description: metadata.description ?? null,
    guest_name: metadata.guest_name ?? null,
    guest_email: metadata.guest_email ?? null,
    guest_phone: metadata.guest_phone ?? null,
    service_catalog_id: metadata.service_catalog_id ?? null,
    estimated_cost: metadata.estimated_cost ?? null,
    tax_amount: metadata.tax_amount ?? null,
    location_address: metadata.location_address ?? null,
    customer_city: metadata.customer_city ?? null,
    customer_state: metadata.customer_state ?? null,
    customer_postal_code: metadata.customer_postal_code ?? null,
  };
}
