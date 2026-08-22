import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  invoice_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid().nullable().optional(),
  provider: z.string().trim().max(40).nullable().optional(),
  provider_payment_id: z.string().trim().max(200).nullable().optional(),
  status: z.string().trim().max(40).optional(),
  amount: z.number().nonnegative().optional(),
  currency_code: z.string().trim().length(3).toUpperCase().optional(),
  paid_at: z.string().datetime().nullable().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id"), { message: "At least one payment field is required" });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase.from("payments").select("*").eq("id", id).eq("workspace_id", workspaceId).single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const body = patchSchema.parse(await request.json());
    const { workspace_id, ...patch } = body;
    const { supabase } = await requireWorkspaceMember(workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"]);
    const { data, error } = await supabase.from("payments").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", id).eq("workspace_id", workspace_id).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const { supabase, user } = await requireWorkspaceMember(workspaceId, ["owner", "admin", "manager"]);
    const { data, error } = await supabase.from("payments").delete().eq("id", id).eq("workspace_id", workspaceId).select().single();
    if (error) throw error;
    return json({ data });
  } catch (error) { return errorResponse(error); }
}
