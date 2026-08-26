import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const customerCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).default(""),
  company_name: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  address_line1: z.string().trim().max(250).optional(),
  address_line2: z.string().trim().max(250).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(24).optional(),
  notes: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) {
      return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
    }
    const { supabase } = await requireWorkspaceMember(workspaceId, undefined, request);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const search = url.searchParams.get("search")?.trim();
    let query = supabase
      .from("customers")
      .select("*")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
      .order("last_name")
      .order("first_name")
      .range(offset, offset + limit - 1);
    if (search) {
      query = query.or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`);
    }
    const { data, error } = await query;
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = customerCreateSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist"], request);
    const { workspace_id, address, ...customer } = body;
    const { data, error } = await supabase.from("customers").insert({
      ...customer,
      workspace_id,
      address_line1: customer.address_line1 || address || null,
      created_by: user.id,
    }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
