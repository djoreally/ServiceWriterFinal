import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const dispatchEventSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  work_order_id: z.string().uuid().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  event_type: z.enum(["assigned", "reassigned", "status_changed", "en_route", "arrived", "started", "paused", "completed", "cancelled", "note"]),
  previous_status: z.string().max(100).nullable().optional(),
  new_status: z.string().max(100).nullable().optional(),
  location: z.record(z.string(), z.unknown()).nullable().optional(),
  notes: z.string().max(10000).nullable().optional(),
}).refine((value) => Boolean(value.appointment_id || value.work_order_id), {
  message: "appointment_id or work_order_id is required",
  path: ["appointment_id"],
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("dispatch_events")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = dispatchEventSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);
    const { data, error } = await supabase.from("dispatch_events").insert({ ...body, performed_by: user.id }).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
