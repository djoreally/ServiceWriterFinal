/**
 * Booking Submit Queries — Read operations for the booking submission flow.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fallback: find an existing customer by email when the upsert RPC errors. */
export async function findCustomerByEmail(userId: string, email: string) {
  return supabase
    .from("customers")
    .select("id")
    .eq("user_id", userId)
    .ilike("email", email)
    .maybeSingle();
}

/** Fetch van technician assignment data after van auto-assignment. */
export async function fetchVanForAssignment(vanId: string) {
  return supabase
    .from("vans")
    .select("assigned_technician_id")
    .eq("id", vanId)
    .single();
}
