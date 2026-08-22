import { z } from "zod";
import { errorResponse, json, paginationSchema, requireCrmCapability } from "@/server/api";

const campaignSchema = z.object({
  workspace_id: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  purpose: z.enum(["marketing", "loyalty", "newsletter", "win_back", "review_request", "referral", "education"]),
  channel: z.enum(["email", "sms"]),
  template_id: z.string().uuid().nullable().optional(),
  segment_id: z.string().uuid().nullable().optional(),
  frequency_policy: z.record(z.string(), z.unknown()).optional(),
  scheduled_at: z.string().datetime().nullable().optional(),
});

const campaignProjection = "id,workspace_id,name,purpose,channel,template_id,segment_id,approval_state,frequency_policy,scheduled_at,created_by,approved_by,approved_at,created_at,updated_at";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id") || "";
    const pagination = paginationSchema.parse({
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });
    const state = url.searchParams.get("approval_state");
    const { supabase } = await requireCrmCapability(request, workspaceId, "crm.view");

    let query = supabase
      .from("crm_campaigns")
      .select(campaignProjection, { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("updated_at", { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);
    if (state) query = query.eq("approval_state", state);

    const { data, error, count } = await query;
    if (error) throw error;
    return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = campaignSchema.parse(await request.json());
    const { supabase, user } = await requireCrmCapability(request, payload.workspace_id, "crm.campaign.draft");
    const { data, error } = await supabase
      .from("crm_campaigns")
      .insert({ ...payload, created_by: user.id })
      .select(campaignProjection)
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
