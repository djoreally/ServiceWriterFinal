/**
 * Appointment item sync — preserved appointment-form primary service sync.
 *
 * Phase 2: the sync runs server-side in the appointments Hono router
 * (`PUT /v1/appointment-items`); this module forwards the call through the
 * typed API client (`@/lib/api-client`), which attaches auth automatically.
 * The workspace travels only as a disambiguation hint — the server resolves
 * it from the auth token. Exported signature is unchanged.
 */
import { apiClient } from "@/lib/api-client";

export async function syncAppointmentPrimaryService(params: {
  workspaceId: string;
  appointmentId: string;
  serviceCatalogId: string | null;
}): Promise<void> {
  await apiClient.put("/v1/appointment-items", {
    selected_workspace_id: params.workspaceId,
    appointment_id: params.appointmentId,
    service_catalog_id: params.serviceCatalogId,
  });
}
