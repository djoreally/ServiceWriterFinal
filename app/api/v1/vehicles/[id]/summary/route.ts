import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const vehicleId = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId);

    const { data: vehicle, error: vehicleError } = await supabase
      .from("vehicles")
      .select("*,customers(id,first_name,last_name,email,phone),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
      .eq("workspace_id", workspaceId)
      .eq("id", vehicleId)
      .single();
    if (vehicleError || !vehicle) throw vehicleError ?? new Error("Vehicle not found");

    const [services, appointments, workOrders, invoices] = await Promise.all([
      supabase.from("service_records").select("*")
        .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("completed_at", { ascending: false, nullsFirst: false }),
      supabase.from("appointments").select("*")
        .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("starts_at", { ascending: false }),
      supabase.from("work_orders").select("*")
        .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
      supabase.from("invoices").select("*")
        .eq("workspace_id", workspaceId).eq("vehicle_id", vehicleId).order("created_at", { ascending: false }),
    ]);

    for (const result of [services, appointments, workOrders, invoices]) {
      if (result.error) throw result.error;
    }

    return json({
      data: {
        vehicle,
        service_records: services.data ?? [],
        appointments: appointments.data ?? [],
        work_orders: workOrders.data ?? [],
        invoices: invoices.data ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
