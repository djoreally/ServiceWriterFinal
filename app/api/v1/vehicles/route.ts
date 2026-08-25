import { json, errorResponse, paginationSchema, requireWorkspaceMember } from "@/server/api";
import { z } from "zod";

const vehicleSchema = z.object({
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
  mileage_unit: z.enum(["mi", "km"]).default("mi"),
  odometer_measure: z.string().trim().max(20).nullable().optional(),
  engine: z.string().trim().max(120).nullable().optional(),
  oil_type: z.string().trim().max(80).nullable().optional(),
  oil_capacity: z.string().trim().max(40).nullable().optional(),
  oil_filter: z.string().trim().max(100).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { supabase } = await requireWorkspaceMember(workspaceId);
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const { data, error } = await supabase
      .from("vehicles")
      .select("*,customers(id,first_name,last_name),vehicle_service_specs(engine,oil_type,oil_capacity,oil_filter,metadata)")
      .eq("workspace_id", workspaceId)
      .neq("status", "archived")
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
    const body = vehicleSchema.parse(await request.json());
    const { supabase } = await requireWorkspaceMember(body.workspace_id, ["owner", "admin", "manager", "service_advisor", "receptionist", "technician"]);
    const { engine, oil_type, oil_capacity, oil_filter, odometer_measure, plate_state, ...vehicleInput } = body;

    const { data: vehicle, error } = await supabase.from("vehicles").insert({
      ...vehicleInput,
      plate_region: body.plate_region ?? plate_state ?? null,
      metadata: odometer_measure ? { odometer_measure } : {},
    } as never).select().single();
    if (error) throw error;

    if (engine || oil_type || oil_capacity || oil_filter) {
      const { error: specsError } = await supabase.from("vehicle_service_specs").upsert({
        workspace_id: body.workspace_id,
        vehicle_id: vehicle.id,
        engine: engine ?? null,
        oil_type: oil_type ?? null,
        oil_capacity: oil_capacity ?? null,
        oil_filter: oil_filter ?? null,
        source: "service_writer",
        metadata: {},
      } as never, { onConflict: "workspace_id,vehicle_id" });
      if (specsError) throw specsError;
    }

    return json({ data: vehicle }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
