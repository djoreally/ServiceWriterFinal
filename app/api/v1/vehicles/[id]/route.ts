import { errorResponse, json, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const vehicleUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid().nullable().optional(),
  vin: z.string().trim().max(32).nullable().optional(),
  year: z.number().int().min(1886).max(2200).nullable().optional(),
  make: z.string().trim().max(80).nullable().optional(),
  model: z.string().trim().max(120).nullable().optional(),
  trim: z.string().trim().max(120).nullable().optional(),
  license_plate: z.string().trim().max(30).nullable().optional(),
  plate_state: z.string().trim().max(20).nullable().optional(),
  plate_region: z.string().trim().max(20).nullable().optional(),
  color: z.string().trim().max(50).nullable().optional(),
  mileage: z.number().int().min(0).nullable().optional(),
  mileage_unit: z.enum(["mi", "km"]).optional(),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  oil_filter: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["active", "inactive", "sold", "archived"]).optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), {
  message: "At least one vehicle field is required",
});

const writeRoles = ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"] as const;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { data, error } = await supabase
      .from("vehicles")
      .select("*,customers(id,first_name,last_name,email,phone),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
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
    const body = vehicleUpdateSchema.parse(await request.json());
    const id = z.string().uuid().parse((await context.params).id);
    const { supabase } = await requireWorkspaceMember(body.workspace_id, [...writeRoles]);
    const { workspace_id, engine, oil_type, oil_capacity, oil_filter, odometer_measure, plate_state, ...vehicleInput } = body;

    const patch: Record<string, unknown> = { ...vehicleInput };
    if (Object.prototype.hasOwnProperty.call(body, "plate_state") && !Object.prototype.hasOwnProperty.call(body, "plate_region")) {
      patch.plate_region = plate_state ?? null;
    }
    if (Object.prototype.hasOwnProperty.call(body, "odometer_measure")) {
      const { data: current } = await supabase
        .from("vehicles")
        .select("metadata")
        .eq("workspace_id", workspace_id)
        .eq("id", id)
        .maybeSingle();
      const metadata = current?.metadata && typeof current.metadata === "object" && !Array.isArray(current.metadata)
        ? current.metadata as Record<string, unknown>
        : {};
      patch.metadata = { ...metadata, odometer_measure: odometer_measure ?? null };
    }

    const { data: vehicle, error } = await supabase
      .from("vehicles")
      .update(patch as never)
      .eq("id", id)
      .eq("workspace_id", workspace_id)
      .select()
      .single();
    if (error) throw error;

    if ([engine, oil_type, oil_capacity, oil_filter].some((value) => value !== undefined)) {
      const { data: currentSpecs } = await supabase
        .from("vehicle_service_specs")
        .select("engine,oil_type,oil_capacity,oil_filter,metadata")
        .eq("workspace_id", workspace_id)
        .eq("vehicle_id", id)
        .maybeSingle();
      const { error: specsError } = await supabase.from("vehicle_service_specs").upsert({
        workspace_id,
        vehicle_id: id,
        engine: engine !== undefined ? engine : currentSpecs?.engine ?? null,
        oil_type: oil_type !== undefined ? oil_type : currentSpecs?.oil_type ?? null,
        oil_capacity: oil_capacity !== undefined ? oil_capacity : currentSpecs?.oil_capacity ?? null,
        oil_filter: oil_filter !== undefined ? oil_filter : currentSpecs?.oil_filter ?? null,
        source: "service_writer",
        metadata: currentSpecs?.metadata ?? {},
      } as never, { onConflict: "workspace_id,vehicle_id" });
      if (specsError) throw specsError;
    }

    return json({ data: vehicle });
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
