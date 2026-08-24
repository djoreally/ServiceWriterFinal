import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const syncPrimaryServiceSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid(),
  service_catalog_id: z.string().uuid().nullable(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const appointmentId = url.searchParams.get("appointment_id");
    const { supabase } = await requireWorkspaceMember(workspaceId);

    let query = supabase
      .from("appointment_items")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });
    if (appointmentId) query = query.eq("appointment_id", z.string().uuid().parse(appointmentId));

    const { data, error } = await query;
    if (error) throw error;
    return json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}

/**
 * Synchronize the single primary service selected by the preserved appointment
 * form. Only rows tagged source=appointment_form are replaced; imported history
 * and technician-added line items remain untouched.
 */
export async function PUT(request: Request) {
  try {
    const body = syncPrimaryServiceSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [
      "owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher",
    ]);

    const { data: appointment, error: appointmentError } = await supabase
      .from("appointments")
      .select("id")
      .eq("workspace_id", body.workspace_id)
      .eq("id", body.appointment_id)
      .single();
    if (appointmentError || !appointment) {
      throw appointmentError ?? new Error("Appointment was not found in this workspace.");
    }

    let catalog: { id: string; name: string; labor_price: number | string } | null = null;
    if (body.service_catalog_id) {
      const { data, error } = await supabase
        .from("service_catalog")
        .select("id,name,labor_price")
        .eq("workspace_id", body.workspace_id)
        .eq("id", body.service_catalog_id)
        .eq("is_active", true)
        .single();
      if (error || !data) throw error ?? new Error("Service was not found in this workspace.");
      catalog = data as typeof catalog;
    }

    const { error: deleteError } = await supabase
      .from("appointment_items")
      .delete()
      .eq("workspace_id", body.workspace_id)
      .eq("appointment_id", body.appointment_id)
      .contains("metadata", { source: "appointment_form" });
    if (deleteError) throw deleteError;

    if (!catalog) return json({ data: null });

    const { data: item, error: insertError } = await supabase
      .from("appointment_items")
      .insert({
        workspace_id: body.workspace_id,
        appointment_id: body.appointment_id,
        service_catalog_id: catalog.id,
        item_type: "service",
        description: catalog.name,
        quantity: 1,
        unit_price: Number(catalog.labor_price ?? 0),
        sort_order: 0,
        metadata: { source: "appointment_form", role: "primary_service" },
      } as never)
      .select()
      .single();
    if (insertError) throw insertError;

    return json({ data: item });
  } catch (error) {
    return errorResponse(error);
  }
}
