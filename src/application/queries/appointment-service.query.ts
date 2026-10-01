/** Canonical appointment-item and service-catalog access.
 *
 * Phase 2: data access goes through the typed API client
 * (`@/lib/api-client`) to the appointments Hono router. Exported signatures
 * are unchanged.
 */
import { apiClient } from "@/lib/api-client";
import { resolveCurrentWorkspace } from "@/application/queries/settings.query";

type AppointmentServiceInput = {
  appointment_id: string; service_catalog_id: string | null; name: string; description: string | null;
  price: number; quantity: number; is_prepaid: boolean; added_at_service: boolean;
};

async function workspaceId() {
  const context = await resolveCurrentWorkspace();
  if (!context) throw new Error("No active workspace is available.");
  return context.workspaceId;
}

async function resendUpdatedConfirmation(appointmentId: string) {
  try {
    await apiClient.post(`/v1/appointments/${encodeURIComponent(appointmentId)}/confirmation`, {});
  } catch (error) {
    throw new Error(error instanceof Error ? error.message : "Updated confirmation could not be sent.");
  }
}

export async function fetchActiveServiceCatalog() {
  const id = await workspaceId();
  const response = await apiClient.get<{ data: Array<{ id: string; name: string; description: string | null; labor_price: number | string | null }> }>(
    "/v1/appointments/service-catalog",
    { query: { active: "true", selected_workspace_id: id } },
  );
  const data = response.data ?? null;
  return {
    data: data?.map((service) => ({
      id: service.id, name: service.name, description: service.description,
      default_price: Number(service.labor_price),
    })) ?? null,
    error: null,
  };
}

export async function insertAppointmentService(data: AppointmentServiceInput) {
  const id = await workspaceId();
  const response = await apiClient.post<{ data: unknown; error: unknown }>(
    `/v1/appointments/${encodeURIComponent(data.appointment_id)}/services`,
    {
      service_catalog_id: data.service_catalog_id,
      name: data.name,
      description: data.description,
      price: data.price,
      quantity: data.quantity,
      is_prepaid: data.is_prepaid,
      added_at_service: data.added_at_service,
    },
    { query: { selected_workspace_id: id } },
  );
  if (!response.error) await resendUpdatedConfirmation(data.appointment_id);
  return { data: response.data ?? null, error: response.error ?? null };
}

export async function updateAppointmentService(id: string, data: AppointmentServiceInput) {
  const workspace_id = await workspaceId();
  const response = await apiClient.patch<{ data: unknown; error: unknown }>(
    `/v1/appointments/services/${encodeURIComponent(id)}`,
    {
      service_catalog_id: data.service_catalog_id,
      name: data.name,
      description: data.description,
      price: data.price,
      quantity: data.quantity,
      is_prepaid: data.is_prepaid,
      added_at_service: data.added_at_service,
    },
  );
  if (!response.error) await resendUpdatedConfirmation(data.appointment_id);
  return { data: response.data ?? null, error: response.error ?? null };
}
