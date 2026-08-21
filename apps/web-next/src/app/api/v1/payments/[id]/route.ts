import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.string().max(40).optional(),
  cleared_at: z.string().datetime().nullable().optional(),
  settled_at: z.string().datetime().nullable().optional(),
  refund_amount: z.number().nonnegative().nullable().optional(),
  refund_reason: z.string().max(1000).nullable().optional(),
  refunded_at: z.string().datetime().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one payment field is required" });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("payment_records").select("*").eq("id", id).eq("user_id", user.id).is("deleted_at", null).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id, ...patch } = body;
    const { supabase, user } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { data, error } = await supabase.from("payment_records").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", user.id).is("deleted_at", null).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager"]);
    const { data, error } = await supabase.from("payment_records").update({ deleted_at: new Date().toISOString(), deleted_by: user.id, deleted_reason: "user_requested" }).eq("id", id).eq("user_id", user.id).is("deleted_at", null).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
