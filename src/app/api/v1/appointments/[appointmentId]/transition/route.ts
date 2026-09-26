import { z } from 'zod';

import { transitionAppointmentCommand } from '@/server/application/appointments/transition-appointment';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ appointmentId: z.string().uuid() });
const bodySchema = z.object({
  status: z.enum(['confirmed','checked_in','in_progress','completed','cancelled','no_show']),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export async function POST(request: Request, context: { params: { appointmentId: string } }) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const { appointmentId } = paramsSchema.parse(context.params);
    const body = await parseJson(request, bodySchema);
    const appointment = await transitionAppointmentCommand({
      workspaceId: ctx.workspaceId,
      appointmentId,
      targetStatus: body.status,
      actorUserId: ctx.user.id,
      reason: body.reason ?? null,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ appointment }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
