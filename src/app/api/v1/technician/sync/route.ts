import { z } from 'zod';

import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_READ_ROLES } from '@/platform/auth/roles';
import { syncTechnicianOfflineQueue } from '@/server/application/technician/sync-offline-queue';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const actionSchema = z.object({
  actionId: z.string().min(1).max(128),
  type: z.enum(['start_job', 'complete_inspection', 'complete_job']),
  workOrderId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  notes: z.string().max(2000).nullable().optional(),
  workPerformed: z.string().max(5000).nullable().optional(),
  inspectionResults: z
    .array(
      z.object({
        itemId: z.string().uuid(),
        status: z.enum(['good', 'attention', 'urgent', 'not_applicable']),
        notes: z.string().max(1000).nullable().optional(),
      }),
    )
    .optional(),
  timestamp: z.string().datetime(),
});

const syncBodySchema = z.object({
  actions: z.array(actionSchema).min(1).max(50),
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_READ_ROLES);
    const body = await parseJson(request, syncBodySchema);

    const result = await syncTechnicianOfflineQueue({
      workspaceId: ctx.workspaceId,
      actorUserId: ctx.user.id,
      actions: body.actions,
    });

    return withCors(apiOk(result, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
