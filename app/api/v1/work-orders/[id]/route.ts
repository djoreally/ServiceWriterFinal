import { errorResponse, json } from "@/server/api";
import { ApiWorkOrder, canonicalWorkOrderStatus, legacyWorkOrder } from "@/server/cutover/work-orders";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const patchSchema = z.object({
  workspace_id: z.string().uuid(),
  status: z.enum(["draft", "scheduled", "assigned", "open", "in_progress", "waiting_for_parts", "awaiting_approval", "ready", "completed", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  complaint: z.string().max(10000).nullable().optional(), technician_notes: z.string().max(10000).nullable().optional(), tech_notes: z.string().max(10000).nullable().optional(), diagnosis: z.string().max(10000).nullable().optional(), technician_id: z.string().uuid().nullable().optional(), signature_url: z.string().max(200000).nullable().optional(), vin_captured: z.string().trim().max(32).nullable().optional(), mileage_captured: z.number().int().min(0).nullable().optional(), started_at: z.string().datetime().nullable().optional(), completed_at: z.string().datetime().nullable().optional(), updated_at: z.string().datetime().optional(),
}).refine((value) => Object.keys(value).some((key) => key !== "workspace_id" && key !== "updated_at"), { message: "At least one work-order field is required" });

async function transition(request: Request, workspaceId: string, id: string, current: string, target: string, key: string) {
  if (current === target) return;
  const order = ["draft", "open", "in_progress", "ready", "completed"];
  if (target === "cancelled") {
    await serviceWriterApi(request, `/api/v1/workspaces/${workspaceId}/work-orders/${id}/transition`, { method: "POST", headers: { "idempotency-key": `${key}:cancel` }, body: JSON.stringify({ status: "cancelled" }) });
    return;
  }
  const from = order.indexOf(current), to = order.indexOf(target);
  if (from < 0 || to < 0 || to < from) throw new Error(`Canonical work-order state cannot move from ${current} to ${target}`);
  for (let index = from + 1; index <= to; index += 1) {
    await serviceWriterApi(request, `/api/v1/workspaces/${workspaceId}/work-orders/${id}/transition`, { method: "POST", headers: { "idempotency-key": `${key}:transition:${order[index]}` }, body: JSON.stringify({ status: order[index] }) });
  }
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await params).id);
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const row = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${workspaceId}/work-orders/${id}`);
    return json({ data: await legacyWorkOrder(request, workspaceId, row) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await params).id); const body = patchSchema.parse(await request.json());
    const current = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${body.workspace_id}/work-orders/${id}`);
    const metadata = current.metadata && typeof current.metadata === "object" ? { ...current.metadata } : {};
    if (body.priority !== undefined) metadata.priority = body.priority;
    if (body.diagnosis !== undefined) metadata.diagnosis = body.diagnosis;
    if (body.signature_url !== undefined) metadata.signature_url = body.signature_url;
    if (body.vin_captured !== undefined) metadata.vin_captured = body.vin_captured;
    if (body.mileage_captured !== undefined) metadata.mileage_captured = body.mileage_captured;
    if (body.started_at !== undefined) metadata.started_at = body.started_at;
    if (body.completed_at !== undefined) metadata.completed_at = body.completed_at;
    if (body.status !== undefined) metadata.legacy_status = body.status;
    const patch: Record<string, unknown> = { metadata };
    if (body.technician_id !== undefined) patch.assignedTechnicianUserId = body.technician_id;
    if (body.complaint !== undefined) patch.customerConcern = body.complaint;
    if (body.technician_notes !== undefined || body.tech_notes !== undefined) patch.internalNotes = body.technician_notes ?? body.tech_notes ?? null;
    if (body.mileage_captured !== undefined) patch.odometerIn = body.mileage_captured;
    const key = ensureIdempotencyKey(request);
    await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/work-orders/${id}`, { method: "PATCH", headers: { "idempotency-key": `${key}:details` }, body: JSON.stringify(patch) });
    if (body.status) {
      const latest = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${body.workspace_id}/work-orders/${id}`);
      const target = canonicalWorkOrderStatus(body.status);
      if (target) await transition(request, body.workspace_id, id, latest.status, target, key);
    }
    const updated = await serviceWriterApi<ApiWorkOrder>(request, `/api/v1/workspaces/${body.workspace_id}/work-orders/${id}`);
    return json({ data: await legacyWorkOrder(request, body.workspace_id, updated) });
  } catch (error) { return errorResponse(error); }
}
