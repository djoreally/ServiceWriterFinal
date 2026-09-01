/** Vehicles Query - vehicle overview reads through the canonical Next.js API. */

import type { Vehicle, Customer } from "@/shared/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { z } from "zod";

export interface VehicleOverviewResult {
  vehicles: Vehicle[];
  customers: Customer[];
  customerNames: Record<string, string>;
  lastServiceDates: Record<string, string>;
}

const apiVehicleSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  make: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  year: z.number().nullable().optional(),
  vin: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  license_plate: z.string().nullable().optional(),
  plate_region: z.string().nullable().optional(),
  mileage: z.number().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const apiCustomerSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1),
  last_name: z.string(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const apiServiceRecordSchema = z.object({
  vehicle_id: z.string().uuid().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

interface OfflineCustomerRecord {
  _raw: {
    is_deleted?: boolean;
    server_id: string;
    name?: string | null;
    email?: string | null;
    phone?: string | null;
    updated_at_local?: number | null;
  };
}

interface OfflineVehicleRecord {
  _raw: {
    is_deleted?: boolean;
    server_id: string;
    customer_server_id?: string | null;
    make?: string | null;
    model?: string | null;
    year?: number | string | null;
    vin?: string | null;
    updated_at_local?: number | null;
  };
}

const VEHICLE_OVERVIEW_TTL_MS = 5 * 60 * 1000;
const vehicleOverviewCache = new Map<string, { value: VehicleOverviewResult; expiresAt: number }>();
const vehicleOverviewInFlight = new Map<string, Promise<VehicleOverviewResult>>();

export function invalidateVehicleOverview(workspaceId?: string): void {
  if (workspaceId) {
    vehicleOverviewCache.delete(workspaceId);
    vehicleOverviewInFlight.delete(workspaceId);
    return;
  }
  vehicleOverviewCache.clear();
  vehicleOverviewInFlight.clear();
}

export async function fetchVehicleOverviewFromOffline(): Promise<VehicleOverviewResult | null> {
  const database = getOfflineDatabase();
  if (!database) return null;

  const [vehiclesRecords, customersRecords] = await Promise.all([
    database.get("offline_vehicles").query().fetch(),
    database.get("offline_customers").query().fetch(),
  ]);

  const customers = (customersRecords as unknown as OfflineCustomerRecord[])
    .filter((record) => !record._raw.is_deleted)
    .map((record) => ({
      id: record._raw.server_id,
      name: record._raw.name || "Unknown",
      email: record._raw.email || null,
      phone: record._raw.phone || null,
      created_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      updated_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      user_id: "",
      address: null as string | null,
      notes: null as string | null,
    })) as Customer[];

  const vehicles = (vehiclesRecords as unknown as OfflineVehicleRecord[])
    .filter((record) => !record._raw.is_deleted)
    .map((record) => ({
      id: record._raw.server_id,
      customer_id: record._raw.customer_server_id || null,
      make: record._raw.make || "Unknown",
      model: record._raw.model || "Unknown",
      year: Number(record._raw.year || new Date().getFullYear()),
      vin: record._raw.vin || null,
      created_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      updated_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      user_id: "",
      color: null,
      engine: null,
      image_url: null,
      license_plate: null,
      mileage: null,
      notes: null,
      odometer_measure: null,
      oil_capacity: null,
      oil_type: null,
      plate_state: null,
    })) as Vehicle[];

  if (!vehicles.length) return null;

  const customerNames: Record<string, string> = {};
  for (const customer of customers) customerNames[customer.id] = customer.name;
  return { vehicles, customers, customerNames, lastServiceDates: {} };
}

async function loadVehicleOverview(workspaceId: string): Promise<VehicleOverviewResult> {
  const { nextApi } = await import("@/lib/nextApiClient");
  const [vehicleResponse, customerResponse, serviceResponse] = await Promise.all([
    nextApi.vehicles.list(workspaceId),
    nextApi.customers.list(workspaceId),
    nextApi.serviceRecords.list(workspaceId),
  ]);

  const apiVehicles = z.array(apiVehicleSchema).parse(vehicleResponse.data);
  const apiCustomers = z.array(apiCustomerSchema).parse(customerResponse.data);
  const serviceRecords = z.array(apiServiceRecordSchema).parse(serviceResponse.data);

  const customers = apiCustomers.map((customer) => ({
    id: customer.id,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    notes: customer.notes ?? null,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    user_id: "",
  })) as Customer[];

  const vehicles = apiVehicles.map((vehicle) => ({
    id: vehicle.id,
    customer_id: vehicle.customer_id ?? null,
    make: vehicle.make || "Unknown",
    model: vehicle.model || "Unknown",
    year: vehicle.year ?? new Date().getFullYear(),
    vin: vehicle.vin ?? null,
    color: vehicle.color ?? null,
    license_plate: vehicle.license_plate ?? null,
    plate_state: vehicle.plate_region ?? null,
    mileage: vehicle.mileage ?? null,
    notes: vehicle.notes ?? null,
    created_at: vehicle.created_at,
    updated_at: vehicle.updated_at,
    user_id: "",
    engine: null,
    image_url: null,
    odometer_measure: null,
    oil_capacity: null,
    oil_type: null,
  })) as Vehicle[];

  const customerNames: Record<string, string> = {};
  for (const customer of customers) customerNames[customer.id] = customer.name;

  const lastServiceDates: Record<string, string> = {};
  const ordered = [...serviceRecords].sort((a, b) => {
    const aDate = Date.parse(a.completed_at || a.created_at || "1970-01-01");
    const bDate = Date.parse(b.completed_at || b.created_at || "1970-01-01");
    return bDate - aDate;
  });
  for (const record of ordered) {
    if (!record.vehicle_id || lastServiceDates[record.vehicle_id]) continue;
    const date = record.completed_at || record.created_at;
    if (date) lastServiceDates[record.vehicle_id] = date;
  }

  return { vehicles, customers, customerNames, lastServiceDates };
}

export async function fetchVehicleOverview(): Promise<VehicleOverviewResult> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace");

    const cached = vehicleOverviewCache.get(context.workspaceId);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const existingRequest = vehicleOverviewInFlight.get(context.workspaceId);
    if (existingRequest) return existingRequest;

    const request = loadVehicleOverview(context.workspaceId)
      .then((value) => {
        vehicleOverviewCache.set(context.workspaceId, {
          value,
          expiresAt: Date.now() + VEHICLE_OVERVIEW_TTL_MS,
        });
        return value;
      })
      .finally(() => {
        vehicleOverviewInFlight.delete(context.workspaceId);
      });

    vehicleOverviewInFlight.set(context.workspaceId, request);
    return await request;
  } catch (error) {
    if (await isOfflineEligibleForCurrentUser()) {
      const offlineResult = await fetchVehicleOverviewFromOffline();
      if (offlineResult) return offlineResult;
    }
    throw error;
  }
}
