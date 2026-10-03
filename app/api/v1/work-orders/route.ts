import { errorResponse, json, paginationSchema } from "@/server/api";
import { ApiWorkOrder, legacyWorkOrder } from "@/server/cutover/work-orders";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const workOrderSchema = z.object({
  workspace_id: z.string().uuid(), appointment_id: z.string().uuid().nullable().optional(), customer_id: z.string().uuid(), vehicle_id: z.string().uuid().nullable().optional(), location_id: z.string().uuid().nullable().optional(), priority: z.enum(["low","normal","high","urgent"]).default("normal"), complaint: z.string().max(10000).optional(), diagnosis: z.string().max(10000).nullable().optional(), technician_notes: z.string().max(10000).nullable().optional(), location_address: z.string().max(500).nullable().optional(), location_lat: z.number().finite().nullable().optional(), location_lng: z.number().finite().nullable().optional(), technician_id: z.string().uuid().nullable().optional(), van_id: z.string().uuid().nullable().optional(), customer_notes: z.string().max(10000).nullable().optional(),
});

export async function GET(request: Request) {
  try {
    const url = new URL(request.url); const workspaceId = z.string().uuid().parse(url.searchParams.get("workspace_id"));
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    for (const [legacy, canonical] of [["appointment_id","appointmentId"],["customer_id","customerId"],["vehicle_id","vehicleId"],["technician_id","assignedTechnicianUserId"],["status","status"]] as const) { const value = url.searchParams.get(legacy); if (value) params.set(canonical, value); }
    const rows = await serviceWriterApi<ApiWorkOrder[]>(request, `/api/v1/workspaces/${workspaceId}/work-orders?${params}`);
    return json({ data: await Promise.all(rows.map((row) => legacyWorkOrder(request, workspaceId, row))), pagination: { limit, offset } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = workOrderSchema.parse(await request.json());
    if (!body.vehicle_id && !body.appointment_id) return json({ error: { code: "vehicle_required", message: "Canonical work orders require a vehicle or an appointment that already has one." } }, { status: 409 });
    const metadata = { priority: body.priority, diagnosis: body.diagnosis ?? null, location_id: body.location_id ?? null, location_address: body.location_address ?? null, location_lat: body.location_lat ?? null, location_lng: body.location_lng ?? null, customer_notes: body.customer_notes ?? null, legacy_van_id: body.van_id ?? null };
    const key = ensureIdempotencyKey(request);
    let created: ApiWorkOrder;
    if (body.appointment_id) {
      created = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${body.appointment_id}/work-order`, { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ assignedTechnicianUserId: body.technician_id ?? null, customerConcern: body.complaint ?? null, internalNotes: body.technician_notes ?? null, metadata }) });
    } else {
      created = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${body.workspace_id}/work-orders`, { method: "POST", headers: { "idempotency-key": key }, body: JSON.stringify({ customerId: body.customer_id, vehicleId: body.vehicle_id, assignedTechnicianUserId: body.technician_id ?? null, customerConcern: body.complaint ?? null, internalNotes: body.technician_notes ?? null, lines: [], metadata }) });
    }
    return json({ data: await legacyWorkOrder(request, body.workspace_id, created) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
