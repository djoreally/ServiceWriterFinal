import { z } from 'zod';

import { createAppointmentCommand } from '@/server/application/appointments/create-appointment';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { SERVICE_CATALOG_WRITE_ROLES, STAFF_READ_ROLES, STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson, parseSearchParams } from '@/server/http/validation';
import { listAppointments } from '@/server/repositories/appointments.repository';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const listSchema = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

const createSchema = z.object({
  customerId: z.string().uuid(),
  vehicleId: z.string().uuid().nullable().optional(),
  locationId: z.string().uuid().nullable().optional(),
  assignedUserId: z.string().uuid().nullable().optional(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  source: z.string().trim().min(1).max(64).default('staff'),
  confirmationCode: z.string().trim().max(128).nullable().optional(),
  notes: z.string().trim().max(5000).nullable().optional(),
  metadata: z.record(z.unknown()).default({}),
});

export async function GET(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_READ_ROLES);
    const query = parseSearchParams(request, listSchema);
    const appointments = await listAppointments(ctx.workspaceId, query);
    return withCors(apiOk({ appointments, limit: query.limit, offset: query.offset }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const body = await parseJson(request, createSchema);
    const appointment = await createAppointmentCommand({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      customerId: body.customerId,
      vehicleId: body.vehicleId ?? null,
      locationId: body.locationId ?? null,
      assignedUserId: body.assignedUserId ?? null,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      source: body.source,
      confirmationCode: body.confirmationCode ?? null,
      notes: body.notes ?? null,
      metadata: body.metadata,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ appointment }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
