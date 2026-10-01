/**
 * Fleet Location Queries — Read operations for fleet location data.
 */
import { apiClient, ApiClientError } from "@/lib/api-client";

/** Fetch active fleet clients for a user (for dropdown selects) */
export async function fetchFleetClientDropdown(userId: string) {
  try {
    const { data } = await apiClient.get<{ data: Array<{ id: string; company_name: string }> }>(
      "/v1/fleet/clients/options",
    );
    return { data: data ?? [], error: null };
  } catch (error) {
    return { data: null, error };
  }
}

/** Fetch registration options for structured service-site onboarding */
export async function fetchFleetLocationRegistrationOptions(userId: string) {
  const { data } = await apiClient.get<{
    data: {
      clients: Array<{ id: string; company_name: string }>;
      contracts: Array<{ id: string; name: string; fleet_client_id: string }>;
    };
  }>("/v1/fleet/registration-options");
  return {
    clients: data?.clients ?? [],
    contracts: data?.contracts ?? [],
  };
}
