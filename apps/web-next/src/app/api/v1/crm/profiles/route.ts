import { z } from "zod";
import { errorResponse, json, paginationSchema, requireCrmCapability } from "@/server/api";

const profileCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  lifecycle_stage: z.enum(["new", "contacted", "qualified", "booked", "active", "due", "at_risk", "reactivated", "inactive"]).optional(),
  lead_source: z.string().trim().max(160).nullable().optional(),
  relationship_owner_id: z.string().uuid().nullable().optional(),
  next_action_at: z.string().datetime().nullable().optional(),
  preferred_channel: z.enum(["email", "sms", "phone", "none"]).nullable().optional(),
});

const profileUpdateSchema = profileCreateSchema.omit({ workspace_id: true, customer_id: true }).partial();

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id") || "";
    const pagination = paginationSchema.parse({
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });
    const search = url.searchParams.get("search")?.trim();
    const stage = url.searchParams.get("lifecycle_stage")?.trim();
    const { supabase } = await requireCrmCapability(request, workspaceId, "crm.view");

    let query = supabase
      .from("crm_profiles")
      .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at,customers(id,first_name,last_name,email,phone)", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);
    if (stage) query = query.eq("lifecycle_stage", stage);
    if (search) query = query.or(`lead_source.ilike.%${search}%,lifecycle_stage.ilike.%${search}%`);

    const { data, error, count } = await query;
    if (error) throw error;
    return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = profileCreateSchema.parse(await request.json());
    const { supabase } = await requireCrmCapability(request, payload.workspace_id, "crm.profile.write");
    const { data, error } = await supabase
      .from("crm_profiles")
      .insert(payload)
      .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at")
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const body = await request.json();
    const id = z.string().uuid().parse(body.id);
    const workspaceId = z.string().uuid().parse(body.workspace_id);
    const payload = profileUpdateSchema.parse(body);
    const { supabase } = await requireCrmCapability(request, workspaceId, "crm.profile.write");
    const { data, error } = await supabase
      .from("crm_profiles")
      .update(payload)
      .eq("id", id)
      .eq("workspace_id", workspaceId)
      .select("id,workspace_id,customer_id,lifecycle_stage,lead_source,relationship_owner_id,next_action_at,preferred_channel,last_contacted_at,last_service_at,created_at,updated_at")
      .single();
    if (error) throw error;
    return json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
