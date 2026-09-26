import { z } from 'zod';

import { addWorkOrderItemCommand } from '@/server/application/work-orders/add-work-order-item';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ workOrderId: z.string().uuid() });
const money = z.string().regex(/^\d+(\.\d{1,4})?$/);
const bodySchema = z.object({
  serviceCatalogId: z.string().uuid().nullable().optional(),
  itemType: z.enum(['service','labor','part','fee','discount']),
  description: z.string().trim().min(1).max(500),
  quantity: z.string().regex(/^\d+(\.\d{1,4})?$/).refine((value) => Number(value) > 0),
  unitPrice: money.default('0'),
  taxRate: money.default('0'),
  sortOrder: z.number().int().min(0).default(0),
});

export async function POST(request: Request, context: { params: { workOrderId: string } }) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const { workOrderId } = paramsSchema.parse(context.params);
    const body = await parseJson(request, bodySchema);
    const item = await addWorkOrderItemCommand({
      workspaceId: ctx.workspaceId,
      workOrderId,
      ...body,
      serviceCatalogId: body.serviceCatalogId ?? null,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ item }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
