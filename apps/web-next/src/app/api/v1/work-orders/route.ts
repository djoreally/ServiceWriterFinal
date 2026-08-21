import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const workOrderSchema = z.object({
  workspace_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  complaint: z.string().max(10000).optional(),
  location_address: z.string().max(500).nullable().optional(),
  location_lat: z.number().finite().nullable().optional(),
  location_lng: z.number().finite().nullable().optional(),
  technician_id: z.string().uuid().nullable().optional(),
  van_id: z.string().uuid().nullable().optional(),
  customer_notes: z.string().max(10000).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("work_orders").select("*,customers(id,first_name,last_name),vehicles(id,year,make,model),locations(id,name)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = workOrderSchema.parse(await request.json());
    const { supabase, user } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "dispatcher", "technician", "fleet_manager"]);
    const { data, error } = await supabase.from("work_orders").insert({ ...body, status: "draft", created_by: user.id, opened_at: new Date().toISOString() }).select().single();
    if (error) throw error;
    if (body.appointment_id) {
      await supabase.from("appointments").update({ status: "in_progress" }).eq("workspace_id", body.workspace_id).eq("id", body.appointment_id);
    }
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
