import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const schema = z.object({
  workspace_id: z.string().uuid(),
  item_id: z.string().uuid(),
  evidence_url: z.string().url().max(2000).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = schema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);
    const { data: item, error: itemError } = await supabase.from("work_order_checklist_items").select("id, work_order_id, work_orders!inner(workspace_id)").eq("id", body.item_id).eq("work_orders.workspace_id", body.workspace_id).single();
    if (itemError || !item) throw itemError ?? new Error("Checklist item was not found in this workspace.");
    const { data, error } = await supabase.rpc("advance_checklist_step" as never, { p_item_id: body.item_id, p_evidence_url: body.evidence_url ?? null, p_notes: body.notes ?? null });
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
