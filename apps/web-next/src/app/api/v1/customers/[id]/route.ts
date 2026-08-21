import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const customerUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().min(1).max(100).optional(),
  company_name: z.string().trim().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one customer field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist"] as const;

function customerIdFromParams(params: { id: string }): string {
  return z.string().uuid().parse(params.id);
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = customerUpdateSchema.parse(await request.json());
    const id = customerIdFromParams(await context.params);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [...writeRoles]);
    const { workspace_id, ...customer } = body;
    const { data, error } = await supabase
      .from("customers")
      .update(customer)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const url = new URL(request.url);
    const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const id = customerIdFromParams(await context.params);
    const { supabase } = await requireWorkspaceMember(workspaceId, [...writeRoles]);
    const { data, error } = await supabase
      .from("customers")
      .update({ deleted_at: new Date().toISOString() })
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id, deleted_at")
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
