import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const serviceRecordSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).default("completed"),
  complaint: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  work_performed: z.string().max(20000).nullable().optional(),
  oil_quarts_used: z.number().finite().min(0).max(1000).nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
  internal_notes: z.string().max(10000).nullable().optional(),
  subtotal: z.number().nonnegative().nullable().optional(),
  tax_rate: z.number().min(0).max(100).nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  discount_amount: z.number().nonnegative().nullable().optional(),
  total_amount: z.number().nonnegative().nullable().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("service_records")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = serviceRecordSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
    const now = new Date().toISOString();

    if (body.customer_id) {
      const { data: customer, error: customerError } = await supabase
        .from("customers").select("id").eq("workspace_id", body.workspace_id).eq("id", body.customer_id).maybeSingle();
      if (customerError) throw customerError;
      if (!customer) return json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 });
    }
    if (body.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase
        .from("vehicles").select("id,customer_id").eq("workspace_id", body.workspace_id).eq("id", body.vehicle_id).maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!vehicle) return json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 });
      if (body.customer_id && vehicle.customer_id && vehicle.customer_id !== body.customer_id) {
        return json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 });
      }
    }

    const payload = {
      ...body,
      completed_by: body.status === "completed" ? user.id : null,
      completed_at: body.status === "completed" ? body.completed_at ?? now : body.completed_at ?? null,
    };
    const { data, error } = await supabase.from("service_records").insert(payload).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
