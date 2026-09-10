/** Canonical appointment-item and service-catalog access. */
import { productionSupabase } from "@/integrations/supabase/client";
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

async function resendUpdatedConfirmation(appointmentId: string, workspace_id: string) {
  const { data: { session } } = await productionSupabase.auth.getSession();
  if (!session?.access_token) return;
  const response = await fetch(`/api/v1/appointments/${encodeURIComponent(appointmentId)}/confirmation`, {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ workspace_id }),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { error?: { message?: string } };
    throw new Error(body.error?.message || "Updated confirmation could not be sent.");
  }
}

export async function fetchActiveServiceCatalog() {
  const id = await workspaceId();
  const result = await productionSupabase.from("service_catalog").select("id,name,description,labor_price")
    .eq("workspace_id", id).eq("is_active", true).order("name");
  return {
    ...result,
    data: result.data?.map((service) => ({
      id: service.id, name: service.name, description: service.description,
      default_price: Number(service.labor_price),
    })) ?? null,
  };
}

export async function insertAppointmentService(data: AppointmentServiceInput) {
  const id = await workspaceId();
  const result = await productionSupabase.from("appointment_items").insert({
    workspace_id: id, appointment_id: data.appointment_id, service_catalog_id: data.service_catalog_id,
    item_type: "service", description: data.name, quantity: data.quantity, unit_price: data.price,
    is_prepaid: data.is_prepaid, added_at_service: data.added_at_service,
    metadata: { source: "appointment_detail", description: data.description },
  } as never).select().single();
  if (!result.error) await resendUpdatedConfirmation(data.appointment_id, id);
  return result;
}

export async function updateAppointmentService(id: string, data: AppointmentServiceInput) {
  const workspace_id = await workspaceId();
  const result = await productionSupabase.from("appointment_items").update({
    service_catalog_id: data.service_catalog_id, description: data.name, quantity: data.quantity,
    unit_price: data.price, is_prepaid: data.is_prepaid, added_at_service: data.added_at_service,
    metadata: { source: "appointment_detail", description: data.description },
  } as never).eq("workspace_id", workspace_id).eq("id", id).select().single();
  if (!result.error) await resendUpdatedConfirmation(data.appointment_id, workspace_id);
  return result;
}
