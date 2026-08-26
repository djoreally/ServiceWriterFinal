import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({
  workspace_id: z.string().uuid(),
  status: z.string().trim().max(40).optional(),
  evidence_url: z.string().url().max(2000).optional(),
  notes: z.string().max(10000).optional(),
  completed_by: z.string().uuid().optional(),
  completed_at: z.string().datetime().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), { message: "At least one checklist field is required" });

export async function PATCH(request: Request, context: { params: Promise<{ itemId: string }> }) {
  try {
    const body = schema.parse(await request.json());
    const itemId = z.string().uuid().parse((await context.params).itemId);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"], request);
    const { data: item, error: itemError } = await supabase.from("work_order_checklist_items").select("id, work_order_id, work_orders!inner(workspace_id)").eq("id", itemId).eq("work_orders.workspace_id", body.workspace_id).single();
    if (itemError || !item) throw itemError ?? new Error("Checklist item was not found in this workspace.");
    const { workspace_id, ...patch } = body;
    const { data, error } = await supabase.from("work_order_checklist_items").update(patch).eq("id", itemId).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
