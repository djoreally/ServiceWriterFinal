/**
 * Customers Query - customer overview reads through the canonical Next.js API.
 */

import type { Customer } from "@/shared/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";
import { z } from "zod";

export interface CustomerOverviewResult {
  customers: Customer[];
  vehicleCounts: Record<string, number>;
  lastServiceDates: Record<string, string>;
}

const apiCustomerSchema = z.object({
  id: z.string().uuid(),
  first_name: z.string().min(1),
  // Historical single-word customer names are preserved with an empty last
  // name rather than inventing data during migration.
  last_name: z.string(),
  company_name: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

const apiVehicleSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
});

const apiServiceRecordSchema = z.object({
  id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  completed_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

interface OfflineRawFields {
  is_deleted?: boolean;
  server_id?: string;
  name?: string;
  email?: string | null;
  phone?: string | null;
  updated_at_local?: string | number;
  customer_server_id?: string | null;
}

function offlineRaw(record: { _raw: unknown }): OfflineRawFields {
  return record._raw as OfflineRawFields;
}

const CUSTOMER_OVERVIEW_TTL_MS = 5 * 60 * 1000;
const customerOverviewCache = new Map<string, { value: CustomerOverviewResult; expiresAt: number }>();
const customerOverviewInFlight = new Map<string, Promise<CustomerOverviewResult>>();

async function loadCustomerOverviewFromNextApi(workspaceId: string): Promise<CustomerOverviewResult> {
  const { nextApi } = await import("@/lib/nextApiClient");
  const [customerResponse, vehicleResponse, serviceResponse] = await Promise.all([
    nextApi.customers.list(workspaceId),
    nextApi.vehicles.list(workspaceId),
    nextApi.serviceRecords.list(workspaceId),
  ]);

  const customers = z.array(apiCustomerSchema).parse(customerResponse.data).map((customer) => ({
    id: customer.id,
    name: [customer.first_name, customer.last_name].filter(Boolean).join(" "),
    email: customer.email ?? null,
    phone: customer.phone ?? null,
    notes: customer.notes ?? null,
    created_at: customer.created_at,
    updated_at: customer.updated_at,
    user_id: "",
  })) as Customer[];

  const vehicles = z.array(apiVehicleSchema).parse(vehicleResponse.data);
  const serviceRecords = z.array(apiServiceRecordSchema).parse(serviceResponse.data);

  const vehicleCounts: Record<string, number> = {};
  for (const vehicle of vehicles) {
    if (vehicle.customer_id) {
      vehicleCounts[vehicle.customer_id] = (vehicleCounts[vehicle.customer_id] ?? 0) + 1;
    }
  }

  const lastServiceDates: Record<string, string> = {};
  const orderedRecords = [...serviceRecords].sort((a, b) => {
    const aDate = Date.parse(a.completed_at || a.created_at || "1970-01-01");
    const bDate = Date.parse(b.completed_at || b.created_at || "1970-01-01");
    return bDate - aDate;
  });
  for (const record of orderedRecords) {
    if (!record.customer_id || lastServiceDates[record.customer_id]) continue;
    const date = record.completed_at || record.created_at;
    if (date) lastServiceDates[record.customer_id] = date;
  }

  return { customers, vehicleCounts, lastServiceDates };
}

export async function fetchCustomerOverviewFromNextApi(workspaceId: string): Promise<CustomerOverviewResult> {
  const now = Date.now();
  const cached = customerOverviewCache.get(workspaceId);
  if (cached && cached.expiresAt > now) return cached.value;

  const existingRequest = customerOverviewInFlight.get(workspaceId);
  if (existingRequest) return existingRequest;

  const request = loadCustomerOverviewFromNextApi(workspaceId)
    .then((value) => {
      customerOverviewCache.set(workspaceId, {
        value,
        expiresAt: Date.now() + CUSTOMER_OVERVIEW_TTL_MS,
      });
      return value;
    })
    .finally(() => {
      customerOverviewInFlight.delete(workspaceId);
    });

  customerOverviewInFlight.set(workspaceId, request);
  return request;
}

export function invalidateCustomerOverview(workspaceId?: string): void {
  if (workspaceId) {
    customerOverviewCache.delete(workspaceId);
    customerOverviewInFlight.delete(workspaceId);
    return;
  }
  customerOverviewCache.clear();
  customerOverviewInFlight.clear();
}

export async function fetchCustomerOverviewFromOffline(): Promise<CustomerOverviewResult | null> {
  const database = getOfflineDatabase();
  if (!database) return null;

  const [customersRecords, vehiclesRecords] = await Promise.all([
    database.get("offline_customers").query().fetch(),
    database.get("offline_vehicles").query().fetch(),
  ]);

  const customers = customersRecords
    .filter((record) => !offlineRaw(record).is_deleted)
    .map((record) => {
      const raw = offlineRaw(record);
      return {
        id: raw.server_id || "",
        name: raw.name || "Unknown",
        email: raw.email || null,
        phone: raw.phone || null,
        created_at: new Date(raw.updated_at_local || Date.now()).toISOString(),
        updated_at: new Date(raw.updated_at_local || Date.now()).toISOString(),
        user_id: "",
        address: null as string | null,
        notes: null as string | null,
      };
    }) as Customer[];

  if (!customers.length) return null;

  const vehicleCounts: Record<string, number> = {};
  for (const record of vehiclesRecords) {
    const raw = offlineRaw(record);
    if (raw.is_deleted || !raw.customer_server_id) continue;
    vehicleCounts[raw.customer_server_id] = (vehicleCounts[raw.customer_server_id] || 0) + 1;
  }

  return { customers, vehicleCounts, lastServiceDates: {} };
}

export async function fetchCustomerOverview(): Promise<CustomerOverviewResult> {
  try {
    const context = await resolveCurrentWorkspace();
    if (!context) throw new Error("No active workspace");
    return await fetchCustomerOverviewFromNextApi(context.workspaceId);
  } catch (error) {
    if (await isOfflineEligibleForCurrentUser()) {
      const offlineResult = await fetchCustomerOverviewFromOffline();
      if (offlineResult) return offlineResult;
    }
    throw error;
  }
}
