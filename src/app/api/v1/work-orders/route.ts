import { z } from 'zod';

import { createWorkOrderCommand } from '@/server/application/work-orders/create-work-order';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson, parseSearchParams } from '@/server/http/validation';
import { listWorkOrders } from '@/server/repositories/work-orders.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const workOrderStatuses = ['draft','scheduled','assigned','in_progress','waiting_for_parts','awaiting_approval','completed','cancelled'] as const;
const priorities = ['low','normal','high','urgent'] as const;

const listSchema = z.object({
  status: z.enum(workOrderStatuses).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  appointmentId: z.string().uuid().nullable().optional(),
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  priority: z.enum(priorities).default('normal'),
  complaint: z.string().trim().max(5000).nullable().optional(),
  diagnosis: z.string().trim().max(5000).nullable().optional(),
  technicianNotes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_READ_ROLES);
    const query = parseSearchParams(request, listSchema);
    const workOrders = await listWorkOrders(ctx.workspaceId, query);
    return withCors(apiOk({ workOrders, limit: query.limit, offset: query.offset }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const body = await parseJson(request, createSchema);
    const workOrder = await createWorkOrderCommand({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      appointmentId: body.appointmentId ?? null,
      customerId: body.customerId,
      vehicleId: body.vehicleId ?? null,
      locationId: body.locationId ?? null,
      priority: body.priority,
      complaint: body.complaint ?? null,
      diagnosis: body.diagnosis ?? null,
      technicianNotes: body.technicianNotes ?? null,
      metadata: body.metadata,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ workOrder }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
