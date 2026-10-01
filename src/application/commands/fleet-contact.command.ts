/**
 * Fleet Contact Commands - Write operations for fleet contacts.
 */

import { apiClient } from "@/lib/api-client";

import { getCurrentAuthUser } from "@/lib/auth/current-user";
export interface FleetContactPayload {
  fleet_client_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  can_approve_work: boolean;
  receives_invoices: boolean;
  receives_reports: boolean;
  is_primary: boolean;
  // Expanded permissions
  view_vehicles: boolean;
  view_service_history: boolean;
  request_service: boolean;
  manage_vehicles: boolean;
  download_reports: boolean;
  approve_quotes: boolean;
  communication_preference: string;
}

/**
 * Fetch active fleet clients for the dropdown.
 */
export async function fetchFleetClientOptionsForContact(userId: string): Promise<{ id: string; company_name: string }[]> {
  const { data } = await apiClient.get<{ data: { id: string; company_name: string }[] }>(
    "/v1/fleet/clients/options",
  );
  return data ?? [];
}

/**
 * Create a new fleet contact.
 */
export async function createFleetContact(userId: string, payload: FleetContactPayload): Promise<void> {
  await apiClient.post("/v1/fleet/contacts", { payload });
}

/**
 * Update an existing fleet contact.
 */
export async function updateFleetContact(
  contactId: string,
  payload: Partial<FleetContactPayload>
): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  await apiClient.patch(`/v1/fleet/contacts/${contactId}`, { payload });
}

/**
 * Delete a fleet contact.
 */
export async function deleteFleetContact(contactId: string): Promise<void> {
  const { data: { user } } = await getCurrentAuthUser();
  if (!user) throw new Error("Unauthorized");

  await apiClient.delete(`/v1/fleet/contacts/${contactId}`);
}
