/**
 * Fleet Location Queries — Read operations for fleet location data.
 */
import { supabase } from "@/integrations/supabase/client";

/** Fetch active fleet clients for a user (for dropdown selects) */
export async function fetchFleetClientDropdown(userId: string) {
  return supabase
    .from("fleet_clients")
    .select("id, company_name")
    .eq("user_id", userId)
    .eq("status", "active")
    .order("company_name");
}

/** Fetch registration options for structured service-site onboarding */
export async function fetchFleetLocationRegistrationOptions(userId: string) {
  const [clients, contracts] = await Promise.all([
    supabase
      .from("fleet_clients")
      .select("id, company_name")
      .eq("user_id", userId)
      .eq("status", "active")
      .order("company_name"),
    supabase
      .from("fleet_contracts")
      .select("id, name, fleet_client_id")
      .eq("user_id", userId)
      .eq("is_active", true)
      .order("name"),
  ]);

  return {
    clients: clients.data ?? [],
    contracts: contracts.data ?? [],
  };
}
