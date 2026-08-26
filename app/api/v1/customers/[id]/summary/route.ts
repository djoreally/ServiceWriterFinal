import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const customerId = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);

    const { data: customer, error: customerError } = await supabase
      .from("customers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", customerId)
      .single();
    if (customerError || !customer) throw customerError ?? new Error("Customer not found");

    const [vehicles, services, quotes, appointments, payments] = await Promise.all([
      supabase.from("vehicles").select("*,vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
        .eq("workspace_id", workspaceId).eq("customer_id", customerId).neq("status", "archived").order("year", { ascending: false }),
      supabase.from("service_records").select("*")
        .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("completed_at", { ascending: false, nullsFirst: false }),
      supabase.from("quotes").select("*")
        .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("created_at", { ascending: false }),
      supabase.from("appointments").select("*")
        .eq("workspace_id", workspaceId).eq("customer_id", customerId).order("starts_at", { ascending: false }),
      supabase.from("payments").select("amount,status,currency_code,paid_at,metadata")
        .eq("workspace_id", workspaceId).eq("customer_id", customerId).eq("status", "succeeded").order("paid_at", { ascending: false, nullsFirst: false }),
    ]);

    for (const result of [vehicles, services, quotes, appointments, payments]) {
      if (result.error) throw result.error;
    }

    return json({
      data: {
        customer,
        vehicles: vehicles.data ?? [],
        service_records: services.data ?? [],
        quotes: quotes.data ?? [],
        appointments: appointments.data ?? [],
        payments: payments.data ?? [],
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
