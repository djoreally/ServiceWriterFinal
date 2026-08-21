import { json, errorResponse, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "assigned", "in_progress", "waiting_for_parts", "awaiting_approval", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  technician_notes: z.string().max(10000).optional(),
  tech_notes: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).optional(),
  signature_url: z.string().max(200000).nullable().optional(),
  vin_captured: z.string().trim().max(32).optional(),
  mileage_captured: z.number().int().min(0).optional(),
  started_at: z.string().datetime().optional(),
  completed_at: z.string().datetime().optional(),
  updated_at: z.string().datetime().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("work_orders").select("*,customers(*),vehicles(*),locations(*),work_order_items(*),work_order_assignments(*),work_order_events(*)").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = patchSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);
    const patch = { ...body };
    delete (patch as { workspace_id?: string }).workspace_id;
    const { data: current, error: currentError } = await supabase.from("work_orders").select("status").eq("workspace_id", body.workspace_id).eq("id", id).single();
    if (currentError) throw currentError;
    const { data, error } = await supabase.from("work_orders").update(patch).eq("workspace_id", body.workspace_id).eq("id", id).select().single();
    if (error) throw error;
    if (body.status && body.status !== current.status) {
      await supabase.from("work_order_events").insert({ workspace_id: body.workspace_id, work_order_id: id, actor_user_id: user.id, event_type: "status_changed", from_status: current.status, to_status: body.status });
    }
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
