import { json, errorResponse, paginationSchema } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { ApiAppointment, isoToWorkspaceSchedule, legacyAppointment, loadAppointmentRelations, loadWorkspace } from "@/server/cutover/appointments";
import { z } from "zod";

const appointmentSchema = z.object({
  workspace_id: z.string().uuid(),
  customer_id: z.string().uuid(),
  vehicle_id: z.string().uuid().nullable().optional(),
  location_id: z.string().uuid().nullable().optional(),
  assigned_user_id: z.string().uuid().nullable().optional(),
  starts_at: z.string().datetime(),
  ends_at: z.string().datetime(),
  source: z.string().trim().max(40).default("staff"),
  status: z.string().trim().max(40).default("confirmed"),
  notes: z.string().max(5000).nullable().optional(),
  title: z.string().trim().max(200).optional(),
  description: z.string().max(5000).nullable().optional(),
  guest_name: z.string().max(200).nullable().optional(),
  guest_email: z.string().email().max(320).nullable().optional(),
  guest_phone: z.string().max(40).nullable().optional(),
  service_catalog_id: z.string().uuid().nullable().optional(),
  estimated_cost: z.number().nonnegative().nullable().optional(),
  tax_amount: z.number().nonnegative().nullable().optional(),
  location_address: z.string().max(500).nullable().optional(),
  customer_city: z.string().max(120).nullable().optional(),
  customer_state: z.string().max(120).nullable().optional(),
  customer_postal_code: z.string().max(24).nullable().optional(),
  override_availability: z.boolean().optional().default(false),
}).superRefine((v, ctx) => {
  if (new Date(v.ends_at) <= new Date(v.starts_at)) ctx.addIssue({ code: "custom", path: ["ends_at"], message: "ends_at must be after starts_at" });
  if (!v.vehicle_id) ctx.addIssue({ code: "custom", path: ["vehicle_id"], message: "vehicle_id is required by the canonical appointment workflow" });
});

function metadataFor(body: z.infer<typeof appointmentSchema>) {
  return {
    title: body.title ?? null,
    description: body.description ?? null,
    guest_name: body.guest_name ?? null,
    guest_email: body.guest_email ?? null,
    guest_phone: body.guest_phone ?? null,
    service_catalog_id: body.service_catalog_id ?? null,
    estimated_cost: body.estimated_cost ?? null,
    tax_amount: body.tax_amount ?? null,
    location_address: body.location_address ?? null,
    customer_city: body.customer_city ?? null,
    customer_state: body.customer_state ?? null,
    customer_postal_code: body.customer_postal_code ?? null,
    override_availability_requested: body.override_availability,
    location_id: body.location_id ?? null,
    assigned_user_id: body.assigned_user_id ?? null,
    source: body.source,
    legacy_starts_at: body.starts_at,
    legacy_ends_at: body.ends_at,
  };
}

async function transitionToRequestedStatus(request: Request, workspaceId: string, appointmentId: string, requested: string) {
  const post = (path: string, body: unknown) => serviceWriterApi<ApiAppointment>(request, path, {
    method: "POST",
    headers: { "idempotency-key": crypto.randomUUID() },
    body: JSON.stringify(body),
  });
  if (requested === "scheduled") return;
  if (requested === "cancelled") {
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/cancel`, { reason: "Created from legacy-compatible staff workflow" });
    return;
  }
  await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "confirmed" });
  if (requested === "confirmed") return;
  if (requested === "no_show") {
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "no_show" });
    return;
  }
  if (requested === "in_progress" || requested === "completed") {
    await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "in_progress" });
    if (requested === "completed") await post(`/api/v1/workspaces/${workspaceId}/appointments/${appointmentId}/transition`, { status: "completed" });
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) throw new Error("workspace_id is required");
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    const map: Array<[string, string]> = [["date", "date"], ["customer_id", "customerId"], ["vehicle_id", "vehicleId"], ["status", "status"]];
    for (const [legacy, canonical] of map) { const value = url.searchParams.get(legacy); if (value) params.set(canonical, value); }
    const [workspace, rows] = await Promise.all([
      loadWorkspace(request, workspaceId),
      serviceWriterApi<ApiAppointment[]>(request, `/api/v1/workspaces/${workspaceId}/appointments?${params}`),
    ]);
    const { customers, vehicles } = await loadAppointmentRelations(request, workspaceId, rows);
    const timezone = workspace.timezone || "UTC";
    return json({ data: rows.map((row) => legacyAppointment(row, timezone, customers.get(row.customerId), vehicles.get(row.vehicleId))), pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = appointmentSchema.parse(await request.json());
    const workspace = await loadWorkspace(request, body.workspace_id);
    const timezone = workspace.timezone || "UTC";
    const start = isoToWorkspaceSchedule(body.starts_at, timezone);
    const end = isoToWorkspaceSchedule(body.ends_at, timezone);
    if (start.localDate !== end.localDate) throw new Error("Appointments must start and end on the same workspace-local date.");
    const serviceIds = body.service_catalog_id ? [body.service_catalog_id] : [];
    const created = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments`, {
      method: "POST",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify({
        customerId: body.customer_id,
        vehicleId: body.vehicle_id,
        serviceIds,
        localDate: start.localDate,
        startMinute: start.minute,
        endMinute: end.minute,
        notes: body.notes ?? null,
        metadata: metadataFor(body),
      }),
    });
    await transitionToRequestedStatus(request, body.workspace_id, created.id, body.status);
    const finalRow = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${body.workspace_id}/appointments/${created.id}`);
    const { customers, vehicles } = await loadAppointmentRelations(request, body.workspace_id, [finalRow]);
    return json({ data: legacyAppointment(finalRow, timezone, customers.get(finalRow.customerId), vehicles.get(finalRow.vehicleId)) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
