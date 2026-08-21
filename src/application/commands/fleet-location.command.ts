/**
 * Fleet Location Commands — Write operations for fleet locations.
 */
import { supabase } from "@/integrations/supabase/client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FleetLocationRegistrationPayload {
  user_id: string;
  fleet_client_id: string;
  default_contract_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  site_contact_name: string;
  site_contact_phone: string;
  site_contact_role: "site_manager" | "dispatch_coordinator" | "security" | "billing";
  service_window_start: string;
  service_window_end: string;
  access_instructions: string | null;
  access_profile: {
    gate_access: "none" | "guarded_gate" | "badge" | "code";
    security_checkin_required: boolean;
    ppe_required: boolean;
    parking_type: "street" | "lot" | "loading_dock" | "reserved";
  };
  scheduling_policy: {
    slot_interval_minutes: 15 | 30 | 60;
    max_jobs_per_slot: 1 | 2 | 3 | 4;
    dispatch_buffer_minutes: 0 | 15 | 30 | 45 | 60;
  };
  billing_context: {
    invoice_group: string;
    cost_center: string;
    billing_mode: "contract" | "time_and_materials" | "blended";
    tax_region: "local" | "state" | "exempt";
  };
  is_primary: boolean;
}

/** Insert a new fleet location */
export async function insertFleetLocation(payload: FleetLocationRegistrationPayload) {
  if (!payload.fleet_client_id) throw new Error("Fleet client is required.");
  if (!payload.default_contract_id) throw new Error("Default contract is required.");
  if (!payload.name || !payload.address || !payload.city || !payload.state || !payload.postal_code) {
    throw new Error("Location identity fields are required.");
  }
  if (!payload.site_contact_name || !payload.site_contact_phone) {
    throw new Error("Site contact name and phone are required.");
  }
  if (!payload.service_window_start || !payload.service_window_end) {
    throw new Error("Service window start/end are required.");
  }
  if (payload.service_window_start >= payload.service_window_end) {
    throw new Error("Service window end must be after start.");
  }

  const { data: contract } = await supabase
    .from("fleet_contracts")
    .select("id, fleet_client_id")
    .eq("id", payload.default_contract_id)
    .eq("user_id", payload.user_id)
    .maybeSingle();

  if (!contract || contract.fleet_client_id !== payload.fleet_client_id) {
    throw new Error("Selected contract must belong to the selected fleet client.");
  }

  return supabase.from("fleet_locations").insert({
    user_id: payload.user_id,
    fleet_client_id: payload.fleet_client_id,
    name: payload.name,
    address: payload.address,
    city: payload.city,
    state: payload.state,
    postal_code: payload.postal_code,
    site_contact_name: payload.site_contact_name,
    site_contact_phone: payload.site_contact_phone,
    service_window_start: payload.service_window_start,
    service_window_end: payload.service_window_end,
    access_instructions: payload.access_instructions,
    is_primary: payload.is_primary,
    notes: JSON.stringify({
      registration_version: "service_site_v1",
      site_contact_role: payload.site_contact_role,
      default_contract_id: payload.default_contract_id,
      access_profile: payload.access_profile,
      scheduling_policy: payload.scheduling_policy,
      billing_context: payload.billing_context,
    }),
  });
}

/** Update a fleet location */
export async function updateFleetLocation(
  locationId: string,
  payload: Partial<{
    fleet_client_id: string;
    name: string;
    address: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    site_contact_name: string | null;
    site_contact_phone: string | null;
    service_window_start: string | null;
    service_window_end: string | null;
    access_instructions: string | null;
    is_primary: boolean;
    notes: string | null;
  }>
) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  return supabase
    .from("fleet_locations")
    .update(payload)
    .eq("id", locationId)
    .eq("user_id", user.id);
}

/** Delete a fleet location */
export async function deleteFleetLocation(locationId: string) {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  return supabase
    .from("fleet_locations")
    .delete()
    .eq("id", locationId)
    .eq("user_id", user.id);
}
