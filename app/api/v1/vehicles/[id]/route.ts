import { errorResponse, json } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
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
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), { message: "At least one vehicle field is required" });

type ApiVehicle = Record<string, unknown> & { customerId?: string | null; metadata?: Record<string, unknown> | null };
type ApiCustomer = Record<string, unknown> & { id?: string; firstName?: string; lastName?: string; email?: string | null; phone?: string | null };

function legacyVehicle(row: ApiVehicle, customer?: ApiCustomer | null) {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  return {
    ...row,
    workspace_id: row.workspaceId,
    customer_id: row.customerId,
    license_plate: row.licensePlate,
    plate_region: row.plateRegion,
    mileage_unit: row.mileageUnit === "kilometers" ? "km" : "mi",
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    customers: customer ? { id: customer.id, first_name: customer.firstName, last_name: customer.lastName, email: customer.email, phone: customer.phone } : null,
    vehicle_service_specs: [{
      engine: metadata.engine ?? null,
      oil_type: metadata.oil_type ?? null,
      oil_capacity: metadata.oil_capacity ?? null,
      oil_filter: metadata.oil_filter ?? null,
      metadata: metadata.vehicle_service_specs_metadata ?? {},
    }],
  };
}

async function loadLegacyVehicle(request: Request, workspaceId: string, id: string) {
  const vehicle = await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${workspaceId}/vehicles/${id}`);
  let customer: ApiCustomer | null = null;
  if (vehicle.customerId) {
    try { customer = await serviceWriterApi<ApiCustomer>(request, `/api/v1/workspaces/${workspaceId}/customers/${vehicle.customerId}`); } catch { customer = null; }
  }
  return legacyVehicle(vehicle, customer);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    return json({ data: await loadLegacyVehicle(request, workspaceId, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = vehicleUpdateSchema.parse(await request.json());
    const id = z.string().uuid().parse((await context.params).id);
    const current = await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${body.workspace_id}/vehicles/${id}`);
    const patch: Record<string, unknown> = {};
    if (body.customer_id !== undefined) patch.customerId = body.customer_id;
    if (body.vin !== undefined) patch.vin = body.vin || null;
    if (body.year !== undefined) patch.year = body.year;
    if (body.make !== undefined) patch.make = body.make;
    if (body.model !== undefined) patch.model = body.model;
    if (body.trim !== undefined) patch.trim = body.trim;
    if (body.license_plate !== undefined) patch.licensePlate = body.license_plate;
    if (body.plate_region !== undefined || body.plate_state !== undefined) patch.plateRegion = body.plate_region ?? body.plate_state ?? null;
    if (body.color !== undefined) patch.color = body.color;
    if (body.mileage !== undefined) patch.mileage = body.mileage;
    if (body.mileage_unit !== undefined) patch.mileageUnit = body.mileage_unit === "km" ? "kilometers" : "miles";
    if (body.notes !== undefined) patch.notes = body.notes;

    if ([body.odometer_measure, body.engine, body.oil_type, body.oil_capacity, body.oil_filter].some((value) => value !== undefined)) {
      const metadata = current.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
      if (body.odometer_measure !== undefined) metadata.odometer_measure = body.odometer_measure;
      if (body.engine !== undefined) metadata.engine = body.engine;
      if (body.oil_type !== undefined) metadata.oil_type = body.oil_type;
      if (body.oil_capacity !== undefined) metadata.oil_capacity = body.oil_capacity;
      if (body.oil_filter !== undefined) metadata.oil_filter = body.oil_filter;
      patch.metadata = metadata;
    }

    await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${body.workspace_id}/vehicles/${id}`, {
      method: "PATCH",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify(patch),
    });
    return json({ data: await loadLegacyVehicle(request, body.workspace_id, id) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const data = await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${workspaceId}/vehicles/${id}`, {
      method: "DELETE",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
    });
    return json({ data: legacyVehicle(data) });
  } catch (error) {
    return errorResponse(error);
  }
}
