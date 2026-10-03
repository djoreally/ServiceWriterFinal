import { json, errorResponse, paginationSchema } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const customerCreateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().max(100).default(""),
  company_name: z.string().trim().max(200).optional(),
  email: z.string().email().optional(),
  phone: z.string().trim().max(40).optional(),
  address: z.string().trim().max(500).optional(),
  address_line1: z.string().trim().max(250).optional(),
  address_line2: z.string().trim().max(250).optional(),
  city: z.string().trim().max(120).optional(),
  region: z.string().trim().max(120).optional(),
  postal_code: z.string().trim().max(24).optional(),
  notes: z.string().max(5000).optional(),
});

function legacyCustomer(row: Record<string, unknown>) {
  return {
    ...row,
    workspace_id: row.workspaceId,
    first_name: row.firstName,
    last_name: row.lastName,
    company_name: row.companyName,
    address_line1: row.addressLine1,
    address_line2: row.addressLine2,
    postal_code: row.postalCode,
    country_code: row.countryCode,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const workspaceId = url.searchParams.get("workspace_id");
    if (!workspaceId) return json({ error: { code: "missing_workspace", message: "workspace_id is required" } }, { status: 400 });
    const { limit, offset } = paginationSchema.parse(Object.fromEntries(url.searchParams));
    const params = new URLSearchParams({ limit: String(limit), offset: String(offset), includeArchived: "false" });
    const search = url.searchParams.get("search")?.trim();
    if (search) params.set("search", search);
    const rows = await serviceWriterApi<Record<string, unknown>[]>(request, `/api/v1/workspaces/${workspaceId}/customers?${params}`);
    return json({ data: rows.map(legacyCustomer), pagination: { limit, offset } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const body = customerCreateSchema.parse(await request.json());
    const idempotencyKey = ensureIdempotencyKey(request);
    const data = await serviceWriterApi<Record<string, unknown>>(request, `/api/v1/workspaces/${body.workspace_id}/customers`, {
      method: "POST",
      headers: { "idempotency-key": idempotencyKey },
      body: JSON.stringify({
        firstName: body.first_name,
        lastName: body.last_name,
        companyName: body.company_name ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        addressLine1: body.address_line1 ?? body.address ?? null,
        addressLine2: body.address_line2 ?? null,
        city: body.city ?? null,
        region: body.region ?? null,
        postalCode: body.postal_code ?? null,
        notes: body.notes ?? null,
      }),
    });
    return json({ data: legacyCustomer(data) }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
