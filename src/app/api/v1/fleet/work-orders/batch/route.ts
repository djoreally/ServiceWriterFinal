import { z } from 'zod';

import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { createFleetBatchWorkOrdersCommand } from '@/server/application/fleet/create-fleet-work-orders';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  customerId: z.string().uuid(),
  poNumber: z.string().trim().max(100).nullable().optional(),
  vehicleIds: z.array(z.string().uuid()).min(1).max(100),
  serviceIds: z.array(z.string().uuid()).default([]),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  complaint: z.string().trim().max(2000).nullable().optional(),
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const body = await parseJson(request, bodySchema);
    const idempotencyKey = requireIdempotencyKey(request);

    const result = await createFleetBatchWorkOrdersCommand({
      workspaceId: ctx.workspaceId,
      customerId: body.customerId,
      poNumber: body.poNumber ?? null,
      vehicleIds: body.vehicleIds,
      serviceIds: body.serviceIds,
      priority: body.priority,
      complaint: body.complaint ?? null,
      actorUserId: ctx.user.id,
      idempotencyKey,
      traceId: id,
    });

    return withCors(apiOk(result, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
