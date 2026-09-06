/**
 * Booking Submit Queries — Read operations for the booking submission flow.
 */
import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch van technician assignment data after van auto-assignment.
 * Customer identity is resolved exclusively by the slug-scoped
 * public_booking_upsert_customer RPC; public booking must never query the
 * customers table directly by an owner/user identifier.
 */
export async function fetchVanForAssignment(vanId: string) {
  return supabase
    .from("vans")
    .select("assigned_technician_id")
    .eq("id", vanId)
    .single();
}
