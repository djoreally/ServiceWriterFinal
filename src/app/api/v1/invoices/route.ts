import { z } from 'zod';

import { issueInvoiceFromQuoteCommand } from '@/server/application/invoices/issue-invoice-from-quote';
import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const bodySchema = z.object({
  quoteId: z.string().uuid(),
  dueAt: z.coerce.date().nullable().optional(),
});

export async function POST(request: Request) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const body = await parseJson(request, bodySchema);
    const invoice = await issueInvoiceFromQuoteCommand({
      workspaceId: ctx.workspaceId,
      quoteId: body.quoteId,
      actorUserId: ctx.user.id,
      dueAt: body.dueAt ?? null,
      traceId: id,
      idempotencyKey: requireIdempotencyKey(request),
    });
    return withCors(apiOk({ invoice }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
