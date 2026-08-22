import { z } from "zod";
import { errorResponse, json, paginationSchema, requireCrmCapability } from "@/server/api";

const activitySchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  appointment_id: z.string().uuid().nullable().optional(),
  activity_type: z.enum(["call", "note", "follow_up", "campaign_interaction", "review", "referral", "service_milestone"]),
  summary: z.string().trim().min(1).max(4000),
  occurred_at: z.string().datetime().optional(),
  source_event_id: z.string().trim().max(240).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id") || "";
    const customerId = url.searchParams.get("customer_id");
    const pagination = paginationSchema.parse({
      limit: url.searchParams.get("limit") || undefined,
      offset: url.searchParams.get("offset") || undefined,
    });
    const { supabase } = await requireCrmCapability(request, workspaceId, "crm.view");

    let query = supabase
      .from("crm_activities")
      .select("id,workspace_id,customer_id,vehicle_id,appointment_id,activity_type,summary,occurred_at,created_by,source_event_id,created_at", { count: "exact" })
      .eq("workspace_id", workspaceId)
      .order("occurred_at", { ascending: false })
      .range(pagination.offset, pagination.offset + pagination.limit - 1);
    if (customerId) query = query.eq("customer_id", z.string().uuid().parse(customerId));

    const { data, error, count } = await query;
    if (error) throw error;
    return json({ data: data ?? [], meta: { limit: pagination.limit, offset: pagination.offset, total: count ?? 0 } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const payload = activitySchema.parse(await request.json());
    const { supabase, user } = await requireCrmCapability(request, payload.workspace_id, "crm.task.write");
    const { data, error } = await supabase
      .from("crm_activities")
      .insert({ ...payload, occurred_at: payload.occurred_at ?? new Date().toISOString(), created_by: user.id })
      .select("id,workspace_id,customer_id,vehicle_id,appointment_id,activity_type,summary,occurred_at,created_by,source_event_id,created_at")
      .single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
