import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vehicle_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  quote_id: z.string().uuid().nullable().optional(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).optional(),
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
  metadata: z.record(z.string(), z.unknown()).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const body = updateSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"], request);
    const { workspace_id, ...updates } = body;

    if (updates.customer_id) {
      const { data: customer, error: customerError } = await supabase.from("customers").select("id").eq("workspace_id", workspace_id).eq("id", updates.customer_id).maybeSingle();
      if (customerError) throw customerError;
      if (!customer) return json({ error: { code: "customer_not_found", message: "Customer does not belong to this workspace." } }, { status: 409 });
    }
    if (updates.vehicle_id) {
      const { data: vehicle, error: vehicleError } = await supabase.from("vehicles").select("id,customer_id").eq("workspace_id", workspace_id).eq("id", updates.vehicle_id).maybeSingle();
      if (vehicleError) throw vehicleError;
      if (!vehicle) return json({ error: { code: "vehicle_not_found", message: "Vehicle does not belong to this workspace." } }, { status: 409 });
      if (updates.customer_id && vehicle.customer_id && vehicle.customer_id !== updates.customer_id) {
        return json({ error: { code: "vehicle_customer_mismatch", message: "Vehicle does not belong to the selected customer." } }, { status: 409 });
      }
    }

    const payload = { ...updates, ...(updates.status === "completed" ? { completed_by: user.id, completed_at: updates.completed_at ?? new Date().toISOString() } : {}) };
    const { data, error } = await supabase.from("service_records").update(payload).eq("workspace_id", workspace_id).eq("id", id).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager", "service_advisor"], request);

    const { data: current, error: currentError } = await supabase
      .from("service_records")
      .select("id,status,metadata")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (currentError || !current) throw currentError ?? new Error("Service record not found");

    const metadata = current.metadata && typeof current.metadata === "object"
      ? current.metadata as Record<string, unknown>
      : {};
    const { data, error } = await (supabase.from("service_records") as any)
      .update({
        status: "voided",
        metadata: {
          ...metadata,
          voided_at: new Date().toISOString(),
          voided_by: user.id,
        },
      })
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .select("id,status")
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
