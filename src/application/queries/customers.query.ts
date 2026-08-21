/**
 * Customers Query - Read operations for customer overview screens.
 *
 * Uses direct Supabase calls instead of the API server.
 */

import { supabase } from "@/integrations/supabase/client";
import type { Customer } from "@/shared/types";
import { getOfflineDatabase } from "@/offline/database";
import { isOfflineEligibleForCurrentUser } from "@/offline/rollout";

export interface CustomerOverviewResult {
  customers: Customer[];
  vehicleCounts: Record<string, number>;
  lastServiceDates: Record<string, string>;
}

/** Internal type for appointment data used in vehicle/date aggregation */
interface AppointmentAggregateData {
  customer_id: string | null;
  vehicle_id: string | null;
  scheduled_date: string;
  guest_email: string | null;
}

export async function fetchCustomerOverviewFromOffline(): Promise<CustomerOverviewResult | null> {
  const database = getOfflineDatabase();
  if (!database) {
    return null;
  }

  const [customersRecords, vehiclesRecords] = await Promise.all([
    database.get('offline_customers').query().fetch(),
    database.get('offline_vehicles').query().fetch(),
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

  if (!customers.length) {
    return null;
  }

  const vehicleCounts: Record<string, number> = {};
  for (const record of vehiclesRecords as any[]) {
    if (record._raw.is_deleted) continue;
    const customerId = record._raw.customer_server_id;
    if (!customerId) continue;
    vehicleCounts[customerId] = (vehicleCounts[customerId] || 0) + 1;
  }

  return {
    customers,
    vehicleCounts,
    lastServiceDates: {},
  };
}

/**
 * Fetch customers along with aggregate vehicle counts and last service date.
 * Runs queries in parallel for performance.
 * 
 * Vehicle counts include:
 * - Vehicles explicitly linked to customer via customer_id
 * - Vehicles linked via appointments (vehicle_id on appointment with customer_id)
 * 
 * Last service dates include:
 * - Completed services from the services table
 * - Appointments (scheduled_date) for customers without completed services
 */
export async function fetchCustomerOverview(): Promise<CustomerOverviewResult> {
  const [customersRes, vehiclesRes, servicesRes, appointmentsRes] = await Promise.all([
    supabase
      .from("customers")
      .select("*")
      .order("created_at", { ascending: false })
      .range(0, 9999),
    supabase
      .from("vehicles")
      .select("id, customer_id")
      .range(0, 9999),
    supabase
      .from("services")
      .select("customer_id, service_date, status")
      .eq("status", "completed")
      .order("service_date", { ascending: false })
      .range(0, 9999),
    // Also fetch appointments with vehicle_id and customer_id for cross-referencing,
    // including guest bookings (customer_id may be null, matched via guest_email)
    supabase
      .from("appointments")
      .select("customer_id, vehicle_id, scheduled_date, guest_email")
      .order("scheduled_date", { ascending: false })
      .range(0, 9999),
  ]);

  if (customersRes.error) {
    if (await isOfflineEligibleForCurrentUser()) {
      console.warn('[fetchCustomerOverview] falling back to offline snapshot', customersRes.error.message);
      const offlineResult = await fetchCustomerOverviewFromOffline();
      if (offlineResult) {
        return offlineResult;
      }
    }
    throw new Error(customersRes.error.message);
  }

  const customers = (customersRes.data ?? []) as Customer[];

  // Build email → customer id map for matching guest appointments
  const emailToCustomerId: Record<string, string> = {};
  for (const c of customers) {
    if (c.email) {
      emailToCustomerId[c.email.toLowerCase()] = c.id;
    }
  }

  // Aggregate vehicle counts per customer from vehicles table
  const vehicleCounts: Record<string, number> = {};
  const countedVehicleIds = new Set<string>();
  
  if (vehiclesRes.data) {
    for (const v of vehiclesRes.data) {
      if (v.customer_id) {
        vehicleCounts[v.customer_id] = (vehicleCounts[v.customer_id] || 0) + 1;
        countedVehicleIds.add(v.id);
      }
    }
  }

  // Also count vehicles from appointments that aren't already counted
  // This catches vehicles created during booking that might have customer_id issues,
  // and vehicles from guest bookings matched by email
  if (appointmentsRes.data) {
    for (const appt of appointmentsRes.data as AppointmentAggregateData[]) {
      if (!appt.vehicle_id || countedVehicleIds.has(appt.vehicle_id)) continue;

      // Resolve the customer id: either directly set, or matched via guest_email
      const resolvedCustomerId = appt.customer_id
        ?? (appt.guest_email ? emailToCustomerId[appt.guest_email.toLowerCase()] : undefined);

      if (resolvedCustomerId) {
        vehicleCounts[resolvedCustomerId] = (vehicleCounts[resolvedCustomerId] || 0) + 1;
        countedVehicleIds.add(appt.vehicle_id);
      }
    }
  }

  // Find last completed service date per customer
  const lastServiceDates: Record<string, string> = {};
  if (servicesRes.data) {
    for (const s of servicesRes.data as Array<{ customer_id: string | null; service_date: string; status: string }>) {
      if (!s.customer_id) continue;
      if (!lastServiceDates[s.customer_id]) {
        lastServiceDates[s.customer_id] = s.service_date;
      }
    }
  }

  // For customers without completed services, use their most recent appointment date
  // Also handles guest bookings matched by email
  if (appointmentsRes.data) {
    for (const appt of appointmentsRes.data as AppointmentAggregateData[]) {
      const resolvedCustomerId = appt.customer_id
        ?? (appt.guest_email ? emailToCustomerId[appt.guest_email.toLowerCase()] : undefined);

      if (resolvedCustomerId && !lastServiceDates[resolvedCustomerId]) {
        lastServiceDates[resolvedCustomerId] = appt.scheduled_date;
      }
    }
  }

  return { customers, vehicleCounts, lastServiceDates };
}
