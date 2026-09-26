import { z } from 'zod';

import { decideQuoteCommand } from '@/server/application/quotes/decide-quote';
import { sendQuoteCommand } from '@/server/application/quotes/send-quote';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { requestClientIp } from '@/server/http/client-ip';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ quoteId: z.string().uuid() });
const bodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({
    action: z.enum(['approve','decline']),
    termsVersion: z.string().trim().max(128).nullable().optional(),
    reason: z.string().trim().max(1000).nullable().optional(),
  }),
]);

export async function POST(request: Request, context: { params: { quoteId: string } }) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const { quoteId } = paramsSchema.parse(context.params);
    const body = await parseJson(request, bodySchema);
    const idempotencyKey = requireIdempotencyKey(request);

    const quote = body.action === 'send'
      ? await sendQuoteCommand({
          workspaceId: ctx.workspaceId,
          quoteId,
          actorUserId: ctx.user.id,
          traceId: id,
          idempotencyKey,
        })
      : await decideQuoteCommand({
          workspaceId: ctx.workspaceId,
          quoteId,
          decision: body.action === 'approve' ? 'approved' : 'declined',
          actorUserId: ctx.user.id,
          approvalMethod: 'staff',
          termsVersion: body.termsVersion ?? null,
          signatureIp: requestClientIp(request),
          reason: body.reason ?? null,
          traceId: id,
          idempotencyKey,
        });

    return withCors(apiOk({ quote }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
