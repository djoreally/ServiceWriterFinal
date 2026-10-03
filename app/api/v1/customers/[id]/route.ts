import { errorResponse, json } from "@/server/api";
import { ensureIdempotencyKey, serviceWriterApi } from "@/server/service-writer-api";
import { z } from "zod";

const customerUpdateSchema = z.object({
  workspace_id: z.string().uuid(),
  first_name: z.string().trim().min(1).max(100).optional(),
  last_name: z.string().trim().max(100).optional(),
  company_name: z.string().trim().max(200).nullable().optional(),
  email: z.string().email().nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  address: z.string().trim().max(500).nullable().optional(),
  address_line1: z.string().trim().max(250).nullable().optional(),
  address_line2: z.string().trim().max(250).nullable().optional(),
  city: z.string().trim().max(120).nullable().optional(),
  region: z.string().trim().max(120).nullable().optional(),
  postal_code: z.string().trim().max(24).nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
  status: z.enum(["active", "inactive", "archived"]).optional(),
}).refine((body) => Object.keys(body).some((key) => key !== "workspace_id"), { message: "At least one customer field is required" });

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

function customerIdFromParams(params: { id: string }): string {
  return z.string().uuid().parse(params.id);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = customerIdFromParams(await context.params);
    const data = await serviceWriterApi<Record<string, unknown>>(request, `/api/v1/workspaces/${workspaceId}/customers/${id}`);
    return json({ data: legacyCustomer(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const body = customerUpdateSchema.parse(await request.json());
    const id = customerIdFromParams(await context.params);
    const patch: Record<string, unknown> = {};
    if (body.first_name !== undefined) patch.firstName = body.first_name;
    if (body.last_name !== undefined) patch.lastName = body.last_name;
    if (body.company_name !== undefined) patch.companyName = body.company_name;
    if (body.email !== undefined) patch.email = body.email;
    if (body.phone !== undefined) patch.phone = body.phone;
    if (body.address_line1 !== undefined || body.address !== undefined) patch.addressLine1 = body.address_line1 ?? body.address ?? null;
    if (body.address_line2 !== undefined) patch.addressLine2 = body.address_line2;
    if (body.city !== undefined) patch.city = body.city;
    if (body.region !== undefined) patch.region = body.region;
    if (body.postal_code !== undefined) patch.postalCode = body.postal_code;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.status !== undefined) patch.status = body.status;
    const data = await serviceWriterApi<Record<string, unknown>>(request, `/api/v1/workspaces/${body.workspace_id}/customers/${id}`, {
      method: "PATCH",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
      body: JSON.stringify(patch),
    });
    return json({ data: legacyCustomer(data) });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const workspaceId = z.string().uuid().parse(new URL(request.url).searchParams.get("workspace_id"));
    const id = customerIdFromParams(await context.params);
    const data = await serviceWriterApi<Record<string, unknown>>(request, `/api/v1/workspaces/${workspaceId}/customers/${id}`, {
      method: "DELETE",
      headers: { "idempotency-key": ensureIdempotencyKey(request) },
    });
    return json({ data: legacyCustomer(data) });
  } catch (error) {
    return errorResponse(error);
  }
}
