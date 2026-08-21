import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const vehicleSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().optional(),
  vin: z.string().trim().max(32).optional(),
  year: z.number().int().min(1886).max(2200).optional(),
  make: z.string().trim().max(80).optional(),
  model: z.string().trim().max(120).optional(),
  license_plate: z.string().trim().max(30).optional(),
  mileage: z.number().int().min(0).optional(),
  mileage_unit: z.enum(["mi", "km"]).default("mi"),
  notes: z.string().max(5000).optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase.from("vehicles").select("*,customers(id,first_name,last_name)").eq("workspace_id", workspaceId).order("created_at", { ascending: false }).range(offset, offset + limit - 1);
    if (error) throw error;
    return json({ data: data ?? [], pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = vehicleSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "technician", "fleet_manager"]);
    const { data, error } = await supabase.from("vehicles").insert(body).select().single();
    if (error) throw error;
    return json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
