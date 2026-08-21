import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const idSchema = z.string().uuid();
const updateSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "in_progress", "completed", "voided"]).optional(),
  complaint: z.string().max(10000).nullable().optional(),
  diagnosis: z.string().max(10000).nullable().optional(),
  work_performed: z.string().max(20000).nullable().optional(),
  oil_quarts_used: z.number().finite().min(0).max(1000).nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
  internal_notes: z.string().max(10000).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  started_at: z.string().datetime().nullable().optional(),
  completed_at: z.string().datetime().nullable().optional(),
});

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("service_records").select("*").eq("workspace_id", workspaceId).eq("id", id).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = idSchema.parse((await context.params).id);
    const body = updateSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician"]);
    const { workspace_id, ...updates } = body;
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
    const { supabase } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager", "service_advisor"]);
    const { error } = await supabase.from("service_records").delete().eq("workspace_id", workspaceId).eq("id", id);
    if (error) throw error;
    return json({ data: { id } });
  } catch (error) { return errorResponse(error); }
}
