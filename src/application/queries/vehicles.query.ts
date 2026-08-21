/**
 * Vehicles Query - Read operations for vehicle overview screens.
 *
 * Uses direct Supabase calls instead of the API server.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Vehicle, Customer } from "@/shared/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

export interface VehicleOverviewResult {
  vehicles: Vehicle[];
  customers: Customer[];
  customerNames: Record<string, string>;
  lastServiceDates: Record<string, string>;
}

export async function fetchVehicleOverviewFromOffline(): Promise<VehicleOverviewResult | null> {
  const database = getOfflineDatabase();
  if (!database) {
    return null;
  }

  const [vehiclesRecords, customersRecords] = await Promise.all([
    database.get('offline_vehicles').query().fetch(),
    database.get('offline_customers').query().fetch(),
  ]);

  const customers = customersRecords
    .filter((record: any) => !record._raw.is_deleted)
    .map((record: any) => ({
      id: record._raw.server_id,
      name: record._raw.name || 'Unknown',
      email: record._raw.email || null,
      phone: record._raw.phone || null,
      created_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      updated_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      user_id: '',
      address: null as string | null,
      notes: null as string | null,
    })) as Customer[];

  const vehicles = vehiclesRecords
    .filter((record: any) => !record._raw.is_deleted)
    .map((record: any) => ({
      id: record._raw.server_id,
      customer_id: record._raw.customer_server_id || null,
      make: record._raw.make || 'Unknown',
      model: record._raw.model || 'Unknown',
      year: Number(record._raw.year || new Date().getFullYear()),
      vin: record._raw.vin || null,
      created_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      updated_at: new Date(record._raw.updated_at_local || Date.now()).toISOString(),
      user_id: '',
      color: null as string | null,
      engine: null as string | null,
      image_url: null as string | null,
      license_plate: null as string | null,
      mileage: null as number | null,
      notes: null as string | null,
      odometer_measure: null as string | null,
      oil_capacity: null as string | null,
      oil_type: null as string | null,
      plate_state: null as string | null,
    })) as Vehicle[];

  if (!vehicles.length) {
    return null;
  }

  const customerNames: Record<string, string> = {};
  for (const c of customers) {
    customerNames[c.id] = c.name;
  }

  return {
    vehicles,
    customers,
    customerNames,
    lastServiceDates: {},
  };
}

/**
 * Fetch vehicles, related customers, and last completed service dates.
 * Runs queries in parallel for performance.
 */
export async function fetchVehicleOverview(): Promise<VehicleOverviewResult> {
  const [vehiclesRes, customersRes, servicesRes] = await Promise.all([
    supabase
      .from("vehicles")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 9999),
    supabase
      .from("customers")
      .select("id, name")
      .range(0, 9999),
    supabase
      .from("services")
      .select("vehicle_id, service_date, status")
      .eq("status", "completed")
      .order("service_date", { ascending: false })
      .range(0, 9999),
  ]);

  if (vehiclesRes.error) {
    if (await isOfflineEligibleForCurrentUser()) {
      console.warn('[fetchVehicleOverview] falling back to offline snapshot', vehiclesRes.error.message);
      const offlineResult = await fetchVehicleOverviewFromOffline();
      if (offlineResult) {
        return offlineResult;
      }
    }
    throw new Error(vehiclesRes.error.message);
  }

  const vehicles = (vehiclesRes.data ?? []) as Vehicle[];
  const customers = (customersRes.data ?? []) as Customer[];

  // Build customer name map
  const customerNames: Record<string, string> = {};
  for (const c of customers) {
    customerNames[c.id] = c.name;
  }

  // Last service date per vehicle
  const lastServiceDates: Record<string, string> = {};
  if (servicesRes.data) {
    for (const s of servicesRes.data as Array<{ vehicle_id: string | null; service_date: string; status: string }>) {
      if (!s.vehicle_id) continue;
      if (!lastServiceDates[s.vehicle_id]) {
        lastServiceDates[s.vehicle_id] = s.service_date;
      }
    }
  }

  return { vehicles, customers, customerNames, lastServiceDates };
}
