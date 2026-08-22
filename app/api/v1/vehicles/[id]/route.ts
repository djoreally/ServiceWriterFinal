import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const vehicleUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vin: z.string().trim().max(32).nullable().optional(),
  year: z.number().int().min(1886).max(2200).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  license_plate: z.string().trim().max(30).nullable().optional(),
  plate_state: z.string().trim().max(2).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileage_unit: z.enum(["mi", "km"]).optional(),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one vehicle field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist", "technician", "fleet_manager"] as const;

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = vehicleUpdateSchema.parse(await request.json());
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [...writeRoles]);
    const { workspace_id, ...vehicle } = body;
    const { data, error } = await supabase
      .from("vehicles")
      .update(vehicle)
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
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(workspaceId, [...writeRoles]);
    const { data, error } = await supabase
      .from("vehicles")
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
