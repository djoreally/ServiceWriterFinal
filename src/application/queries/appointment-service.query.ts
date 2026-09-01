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
  return productionSupabase.from("appointment_items").insert({
    workspace_id: id, appointment_id: data.appointment_id, service_catalog_id: data.service_catalog_id,
    item_type: "service", description: data.name, quantity: data.quantity, unit_price: data.price,
    is_prepaid: data.is_prepaid, added_at_service: data.added_at_service,
    metadata: { source: "appointment_detail", description: data.description },
  } as never).select().single();
}

export async function updateAppointmentService(id: string, data: AppointmentServiceInput) {
  const workspace_id = await workspaceId();
  return productionSupabase.from("appointment_items").update({
    service_catalog_id: data.service_catalog_id, description: data.name, quantity: data.quantity,
    unit_price: data.price, is_prepaid: data.is_prepaid, added_at_service: data.added_at_service,
    metadata: { source: "appointment_detail", description: data.description },
  } as never).eq("workspace_id", workspace_id).eq("id", id).select().single();
}
