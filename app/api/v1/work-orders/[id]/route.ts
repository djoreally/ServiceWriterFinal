import { json, errorResponse, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "assigned", "in_progress", "waiting_for_parts", "awaiting_approval", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  technician_notes: z.string().max(10000).nullable().optional(),
  tech_notes: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  signature_url: z.string().max(200000).nullable().optional(),
  vin_captured: z.string().trim().max(32).nullable().optional(),
  mileage_captured: z.number().int().min(0).nullable().optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
  updated_at: z.string().datetime().optional(),
});

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const workspaceId = new URL(request.url).searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase
      .from("work_orders")
      .select("*,customers(*),vehicles(*),locations(*),work_order_items(*),work_order_assignments(*),work_order_events(*)")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
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
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
    const { workspace_id, updated_at: _ignoredOptimisticHint, ...patch } = body;

    const { error } = await (supabase as any).rpc("patch_work_order_v1", {
      p_workspace_id: workspace_id,
      p_work_order_id: id,
      p_patch: patch,
    });
    if (error) throw error;

    const { data, error: readError } = await supabase
      .from("work_orders")
      .select("*")
      .eq("workspace_id", workspace_id)
      .eq("id", id)
      .single();
    if (readError) throw readError;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
