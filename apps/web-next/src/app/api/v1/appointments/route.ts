import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const appointmentSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().optional(),
  location_id: z.string().uuid().optional(),
  assigned_user_id: z.string().uuid().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  source: z.string().trim().max(40).default("staff"),
  notes: z.string().max(5000).optional(),
}).superRefine((value, ctx) => {
  if (new Date(value.ends_at) <= new Date(value.starts_at)) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("appointments").select("*,customers(id,first_name,last_name),vehicles(id,year,make,model),locations(id,name)").eq("workspace_id", workspaceId).order("starts_at").range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = appointmentSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "dispatcher"]);
    const { data: conflicts, error: conflictError } = await supabase.from("appointments").select("id").eq("workspace_id", body.workspace_id).neq("status", "cancelled").lt("starts_at", body.ends_at).gt("ends_at", body.starts_at).limit(1);
    if (conflictError) throw conflictError;
    if (conflicts?.length) return json({ error: { code: "schedule_conflict", message: "The requested time overlaps an existing appointment." } }, { status: 409 });
    const { data, error } = await supabase.from("appointments").insert({ ...body, created_by: user.id }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
