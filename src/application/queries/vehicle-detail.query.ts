/**
 * Vehicle Detail Queries — Read operations for the vehicle detail page.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
/** Get current authenticated user */
export async function getCurrentUser() {
  const { data: { user } } = await getCurrentAuthUser();
  return user;
}

/** Fetch a vehicle by id with user_id guard (IDOR protection) */
export async function fetchVehicleById(vehicleId: string, userId: string) {
  return supabase
    .from("vehicles")
    .select("*")
    .eq("id", vehicleId)
    .eq("user_id", userId)
    .maybeSingle();
}

/** Fetch customer by id */
export async function fetchCustomerById(customerId: string) {
  return supabase
    .from("customers")
    .select("id, name, email, phone")
    .eq("id", customerId)
    .maybeSingle();
}

/** Fetch services for a vehicle */
export async function fetchVehicleServices(vehicleId: string) {
  return supabase
    .from("services")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });
}

/** Fetch appointments for a vehicle */
export async function fetchVehicleAppointments(vehicleId: string) {
  return supabase
    .from("appointments")
    .select("*")
    .eq("vehicle_id", vehicleId)
    .order("scheduled_date", { ascending: false });
}

/** Fetch work orders for a vehicle */
export async function fetchVehicleWorkOrders(vehicleId: string) {
  return supabase
    .from("work_orders")
    .select("id,order_number,status,completed_at,updated_at,tech_notes,mileage_captured,vehicle_id,customer_id,appointment_id,technicians(name),customers(id,name),appointments(id,title,scheduled_date,scheduled_time)")
    .eq("vehicle_id", vehicleId)
    .order("created_at", { ascending: false });
}

/** Fetch invoice-like service records for a vehicle */
export async function fetchVehicleInvoices(vehicleId: string) {
  return supabase
    .from("services")
    .select("id, service_number, service_date, total_cost, status, vehicle_id")
    .eq("vehicle_id", vehicleId)
    .order("service_date", { ascending: false });
}

/** Best-effort fleet linkage for a vehicle */
export async function fetchFleetLinkForVehicle(
  vin: string | null,
  licensePlate: string | null
): Promise<{ data: { id: string; fleet_clients: { company_name: string } | null } | null; error: unknown }> {
  if (!vin && !licensePlate) return { data: null, error: null };
  let query = supabase
    .from("fleet_vehicles")
    .select("id, fleet_clients(company_name)")
    .limit(1);
  if (vin) query = query.eq("vin", vin);
  else if (licensePlate) query = query.eq("license_plate", licensePlate);
  const result = await query.maybeSingle();
  return { data: result.data as any, error: result.error };
}
