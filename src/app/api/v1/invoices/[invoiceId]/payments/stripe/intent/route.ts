import { z } from 'zod';

import { requireWorkspaceContext } from '@/platform/auth/context';
import { STAFF_WRITE_ROLES } from '@/platform/auth/roles';
import { apiOk, requestId } from '@/server/http/api-response';
import { corsPreflight, withCors } from '@/server/http/cors';
import { requireIdempotencyKey } from '@/server/http/idempotency';
import { routeError } from '@/server/http/route-error';
import { createStripeInvoicePaymentIntent } from '@/server/payments/stripe/create-invoice-payment-intent';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ invoiceId: z.string().uuid() });

export async function POST(request: Request, context: { params: { invoiceId: string } }) {
  const id = requestId(request);
  try {
    const ctx = await requireWorkspaceContext(request, STAFF_WRITE_ROLES);
    const { invoiceId } = paramsSchema.parse(context.params);
    const idempotencyKey = requireIdempotencyKey(request);

    const paymentIntent = await createStripeInvoicePaymentIntent({
      workspaceId: ctx.workspaceId,
      invoiceId,
      idempotencyKey,
    });

    return withCors(apiOk({ paymentIntent }, id, 201), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
