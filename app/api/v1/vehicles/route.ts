import { json, errorResponse, paginationSchema } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
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

type ApiVehicle = Record<string, unknown> & { customerId?: string | null; metadata?: Record<string, unknown> | null };
type ApiCustomer = Record<string, unknown> & { id?: string; firstName?: string; lastName?: string };

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
    customers: customer ? { id: customer.id, first_name: customer.firstName, last_name: customer.lastName } : null,
    vehicle_service_specs: [{
      engine: metadata.engine ?? null,
      oil_type: metadata.oil_type ?? null,
      oil_capacity: metadata.oil_capacity ?? null,
      oil_filter: metadata.oil_filter ?? null,
      metadata: metadata.vehicle_service_specs_metadata ?? {},
    }],
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), includeArchived: "false" });
    const search = url.searchParams.get("search")?.trim();
    const customerId = url.searchParams.get("customer_id")?.trim();
    if (search) params.set("search", search);
    if (customerId) params.set("customerId", customerId);
    const rows = await serviceWriterApi<ApiVehicle[]>(request, `/api/v1/workspaces/${workspaceId}/vehicles?${params}`);
    const ids = [...new Set(rows.map((row) => row.customerId).filter((id): id is string => typeof id === "string"))];
    const customers = new Map<string, ApiCustomer>();
    await Promise.all(ids.map(async (id) => {
      try {
        const customer = await serviceWriterApi<ApiCustomer>(request, `/api/v1/workspaces/${workspaceId}/customers/${id}`);
        customers.set(id, customer);
      } catch {
        // Preserve vehicle visibility even if a related customer was archived after the vehicle was created.
      }
    }));
    return json({ data: rows.map((row) => legacyVehicle(row, row.customerId ? customers.get(row.customerId) : null)), pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = vehicleSchema.parse(await request.json());
    const idempotencyKey = ensureIdempotencyKey(request);
    const metadata: Record<string, unknown> = {};
    if (body.odometer_measure) metadata.odometer_measure = body.odometer_measure;
    if (body.engine) metadata.engine = body.engine;
    if (body.oil_type) metadata.oil_type = body.oil_type;
    if (body.oil_capacity) metadata.oil_capacity = body.oil_capacity;
    if (body.oil_filter) metadata.oil_filter = body.oil_filter;
    const data = await serviceWriterApi<ApiVehicle>(request, `/api/v1/workspaces/${body.workspace_id}/vehicles`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        customerId: body.customer_id ?? null,
        vin: body.vin || null,
        year: body.year ?? null,
        make: body.make ?? null,
        model: body.model ?? null,
        trim: body.trim ?? null,
        licensePlate: body.license_plate ?? null,
        plateRegion: body.plate_region ?? body.plate_state ?? null,
        color: body.color ?? null,
        mileage: body.mileage ?? null,
        mileageUnit: body.mileage_unit === "km" ? "kilometers" : "miles",
        notes: body.notes ?? null,
        metadata,
      }),
    });
    return json({ data: legacyVehicle(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
