import { errorResponse, json } from "@/server/api";
import { ApiService, legacyService, serviceCode } from "@/server/cutover/services";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const rowSchema = z.object({
  name: z.string().trim().min(1).max(200), description: z.string().max(5000).nullable().optional(), category: z.string().max(200).nullable().optional(), labor_price: z.number().nonnegative().nullable().optional(), estimated_minutes: z.number().int().min(0).nullable().optional(), is_active: z.boolean().optional(), metadata: z.record(z.string(), z.unknown()).nullable().optional(), updated_at: z.string().datetime().optional(),
}).passthrough();
const postSchema = z.object({ workspace_id: z.string().uuid(), rows: z.array(rowSchema).min(1).max(100) });

export async function GET(request: Request) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const rows = await serviceWriterApi<ApiService[]>(request, `/api/v1/workspaces/${workspaceId}/services?includeArchived=true&limit=100&offset=0`);
    return json({ data: rows.map(legacyService) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const body = postSchema.parse(await request.json());
    const baseKey = ensureIdempotencyKey(request);
    const created: ApiService[] = [];
    for (let index = 0; index < body.rows.length; index += 1) {
      const row = body.rows[index];
      const metadata = { ...(row.metadata ?? {}), legacy_category: row.category ?? null };
      const service = await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${body.workspace_id}/services`, {
        method: "POST",
        headers: { "idempotency-key": `${baseKey}:${index}` },
        body: JSON.stringify({ categoryId: null, name: row.name, code: serviceCode(row.name, row.metadata?.code), description: row.description ?? null, basePriceCents: Math.round((row.labor_price ?? 0) * 100), laborMinutes: row.estimated_minutes ?? 0, taxable: row.metadata?.taxable !== false, sortOrder: Number(row.metadata?.sort_order ?? 0), metadata }),
      });
      if (row.is_active === false) {
        await serviceWriterApi(request, `/api/v1/workspaces/${body.workspace_id}/services/${service.id}`, { method: "PATCH", headers: { "idempotency-key": `${baseKey}:${index}:inactive` }, body: JSON.stringify({ status: "inactive" }) });
      }
      created.push(await serviceWriterApi<ApiService>(request, `/api/v1/workspaces/${body.workspace_id}/services/${service.id}`));
    }
    return json({ data: created.map(legacyService) }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
