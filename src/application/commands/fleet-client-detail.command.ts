/**
 * Fleet Client Detail Commands — Write operations for fleet clients.
 */
import { apiClient } from "@/lib/api-client";

/** Update a fleet client. */
export async function updateFleetClient(id: string, data: Record<string, unknown>) {
  try {
    const { data: updated } = await apiClient.patch<{ data: unknown }>(`/v1/fleet/clients/${id}`, { data });
    return { data: updated, error: null };
  } catch (error) {
    return { data: null, error };
  }
}
