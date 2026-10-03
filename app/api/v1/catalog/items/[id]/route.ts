import { errorResponse, json } from "@/server/api";
import { ApiService, legacyService } from "@/server/cutover/services";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const rowSchema = z.object({ name: z.string().trim().min(1).max(200).optional(), description: z.string().max(5000).nullable().optional(), category: z.string().max(200).nullable().optional(), labor_price: z.number().nonnegative().nullable().optional(), estimated_minutes: z.number().int().min(0).nullable().optional(), is_active: z.boolean().optional(), metadata: z.record(z.string(), z.unknown()).nullable().optional() }).passthrough();
const patchSchema = z.object({ workspace_id: z.string().uuid(), row: rowSchema });

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const row = await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${workspaceId}/services/${id}`);
    return json({ data: legacyService(row) });
  } catch (error) { return errorResponse(error); }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const id = z.string().uuid().parse((await context.params).id); const body = patchSchema.parse(await request.json());
    const current = await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${body.workspace_id}/services/${id}`);
    const metadata = { ...(current.metadata ?? {}), ...(body.row.metadata ?? {}) };
    if (body.row.category !== undefined) metadata.legacy_category = body.row.category;
    const patch: Record<string, unknown> = { metadata };
    if (body.row.name !== undefined) patch.name = body.row.name;
    if (body.row.description !== undefined) patch.description = body.row.description;
    if (body.row.labor_price !== undefined) patch.basePriceCents = Math.round((body.row.labor_price ?? 0) * 100);
    if (body.row.estimated_minutes !== undefined) patch.laborMinutes = body.row.estimated_minutes ?? 0;
    if (body.row.is_active !== undefined) patch.status = body.row.is_active ? "active" : "inactive";
    const updated = await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${body.workspace_id}/services/${id}`, { method: "PATCH", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify(patch) });
    return json({ data: legacyService(updated) });
  } catch (error) { return errorResponse(error); }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = z.string().uuid().parse((await context.params).id);
    const archived = await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${workspaceId}/services/${id}`, { method: "PATCH", headers: { "idempotency-key": ensureIdempotencyKey(request) }, body: JSON.stringify({ status: "archived" }) });
    return json({ data: legacyService(archived) });
  } catch (error) { return errorResponse(error); }
}
