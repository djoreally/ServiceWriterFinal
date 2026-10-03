import { errorResponse, json } from "@/server/api";
import { ApiAppointment } from "@/server/cutover/appointments";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const schema = z.object({ workspace_id: z.string().uuid() });

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id);
    const { workspace_id } = schema.parse(await request.json());
    let current = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspace_id}/appointments/${id}`);
    if (current.status === "in_progress") return json({ data: { id, status: current.status, already_started: true } });
    if (["completed", "cancelled", "no_show"].includes(current.status)) return json({ error: { code: "invalid_status", message: "This appointment can no longer be started." } }, { status: 409 });
    const key = ensureIdempotencyKey(request);
    if (current.status === "scheduled") {
      current = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspace_id}/appointments/${id}/transition`, { method: "POST", headers: { "idempotency-key": `${key}:confirm` }, body: JSON.stringify({ status: "confirmed" }) });
    }
    const data = await serviceWriterApi<ApiAppointment>(request, `/api/v1/workspaces/${workspace_id}/appointments/${id}/transition`, { method: "POST", headers: { "idempotency-key": `${key}:start` }, body: JSON.stringify({ status: "in_progress" }) });
    return json({ data: { id: data.id, status: data.status, metadata: data.metadata, updated_at: data.updatedAt, already_started: false } });
  } catch (error) {
    return errorResponse(error);
  }
}
