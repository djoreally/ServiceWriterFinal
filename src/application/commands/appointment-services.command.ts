/**
 * Appointment line-item commands against the canonical workspace schema.
 *
 * Phase 2: all data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged. The server resolves the workspace from the auth token.
 */
import { apiClient } from "@/lib/api-client";

export async function removeAppointmentService(serviceId: string): Promise<void> {
  try {
    await apiClient.delete(`/v1/appointments/services/${encodeURIComponent(serviceId)}`);
  } catch {
    throw new Error("Failed to remove service");
  }
}
