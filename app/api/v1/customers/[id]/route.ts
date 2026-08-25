import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const customerUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  company_name: z.string().trim().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  address_line1: z.string().trim().max(250).nullable().optional(),
  address_line2: z.string().trim().max(250).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(24).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one customer field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist"] as const;

function customerIdFromParams(params: { id: string }): string {
  return z.string().uuid().parse(params.id);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = customerIdFromParams(await context.params);
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase
      .from("customers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("id", id)
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = customerUpdateSchema.parse(await request.json());
    const id = customerIdFromParams(await context.params);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [...writeRoles]);
    const { workspace_id, address, ...customer } = body;
    const patch: Record<string, unknown> = { ...customer };
    if (Object.prototype.hasOwnProperty.call(body, "address")) {
      patch.address_line1 = address || null;
    }
    const { data, error } = await supabase
      .from("customers")
      .update(patch as never)
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
      .update({ status: "archived" } as never)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id,status")
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
