/**
 * Quick Service Commands — Write operations for the QuickService wizard.
 */
import { supabase } from "@/integrations/supabase/client";

/** Create a new customer record. */
export async function insertCustomer(userId: string, data: {
  name: string; email?: string | null; phone?: string | null; address?: string | null; notes?: string | null;
}) {
  return supabase
    .from("customers")
    .insert([{ user_id: userId, ...data }])
    .select()
    .single();
}

/** Create a new vehicle record. */
export async function insertVehicle(userId: string, data: {
  customer_id: string; make: string; model: string; year: number;
  vin?: string | null; license_plate?: string | null; color?: string | null; mileage?: number | null; notes?: string | null;
}) {
  return supabase
    .from("vehicles")
    .insert([{ user_id: userId, ...data }])
    .select()
    .single();
}

/** Create a service record. */
export async function insertServiceRecord(userId: string, data: {
  customer_id: string; vehicle_id: string; service_date: string; service_type: string;
  description: string; parts_used?: string | null; labor_hours?: number | null;
  labor_cost?: number | null; parts_cost?: number | null; total_cost: number;
  status: string; notes?: string | null;
}) {
  return supabase
    .from("services")
    .insert([{ user_id: userId, ...data }]);
}
