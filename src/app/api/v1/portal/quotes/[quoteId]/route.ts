import { z } from 'zod';
import { and, asc, eq } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { quoteItems, quotes, customers, vehicles, workspaces, workspaceSettings } from '@/db/schema';
import { decideQuoteCommand } from '@/server/application/quotes/decide-quote';
import { verifyQuotePortalToken } from '@/server/auth/portal-token';
import { apiError, apiOk, requestId } from '@/server/http/api-response';
import { requestClientIp } from '@/server/http/client-ip';
import { corsPreflight, withCors } from '@/server/http/cors';
import { routeError } from '@/server/http/route-error';
import { parseJson } from '@/server/http/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const paramsSchema = z.object({ quoteId: z.string().uuid() });

const decideBodySchema = z.object({
  decision: z.enum(['approved', 'declined']),
  token: z.string().min(1),
  termsVersion: z.string().trim().max(128).nullable().optional(),
  reason: z.string().trim().max(1000).nullable().optional(),
});

export async function GET(request: Request, context: { params: { quoteId: string } }) {
  const id = requestId(request);
  try {
    const { quoteId } = paramsSchema.parse(context.params);
    const url = new URL(request.url);
    const token = url.searchParams.get('token') || request.headers.get('x-portal-token');

    if (!token) {
      return withCors(apiError(401, 'unauthorized', 'Portal authorization token required.', id), request);
    }

    const [quote] = await getDb()
      .select({
        id: quotes.id,
        workspaceId: quotes.workspaceId,
        status: quotes.status,
        subtotal: quotes.subtotal,
        taxTotal: quotes.taxTotal,
        total: quotes.total,
        expiresAt: quotes.expiresAt,
        createdAt: quotes.createdAt,
        updatedAt: quotes.updatedAt,
        customerFirstName: customers.firstName,
        customerLastName: customers.lastName,
        vehicleYear: vehicles.year,
        vehicleMake: vehicles.make,
        vehicleModel: vehicles.model,
        shopName: workspaces.name,
        shopPhone: workspaceSettings.phone,
        shopEmail: workspaceSettings.email,
        termsAndConditions: workspaceSettings.termsAndConditions,
      })
      .from(quotes)
      .innerJoin(workspaces, eq(workspaces.id, quotes.workspaceId))
      .leftJoin(workspaceSettings, eq(workspaceSettings.workspaceId, quotes.workspaceId))
      .innerJoin(customers, and(eq(customers.workspaceId, quotes.workspaceId), eq(customers.id, quotes.customerId)))
      .leftJoin(vehicles, and(eq(vehicles.workspaceId, quotes.workspaceId), eq(vehicles.id, quotes.vehicleId)))
      .where(eq(quotes.id, quoteId))
      .limit(1);

    if (!quote) {
      return withCors(apiError(404, 'quote_not_found', 'Quote not found.', id), request);
    }

    if (!verifyQuotePortalToken(token, quote.workspaceId, quote.id)) {
      return withCors(apiError(403, 'forbidden', 'Invalid or expired portal token.', id), request);
    }

    const items = await getDb()
      .select()
      .from(quoteItems)
      .where(and(eq(quoteItems.workspaceId, quote.workspaceId), eq(quoteItems.quoteId, quote.id)))
      .orderBy(asc(quoteItems.createdAt));

    return withCors(apiOk({ quote, items }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function POST(request: Request, context: { params: { quoteId: string } }) {
  const id = requestId(request);
  try {
    const { quoteId } = paramsSchema.parse(context.params);
    const body = await parseJson(request, decideBodySchema);

    const [quote] = await getDb()
      .select({ id: quotes.id, workspaceId: quotes.workspaceId })
      .from(quotes)
      .where(eq(quotes.id, quoteId))
      .limit(1);

    if (!quote) {
      return withCors(apiError(404, 'quote_not_found', 'Quote not found.', id), request);
    }

    if (!verifyQuotePortalToken(body.token, quote.workspaceId, quote.id)) {
      return withCors(apiError(403, 'forbidden', 'Invalid or expired portal token.', id), request);
    }

    const idempotencyKey = `portal-decide:${quote.id}:${body.decision}:${body.token.slice(-16)}`;

    const updated = await decideQuoteCommand({
      workspaceId: quote.workspaceId,
      quoteId: quote.id,
      decision: body.decision,
      approvalMethod: 'customer_link',
      termsVersion: body.termsVersion ?? null,
      signatureIp: requestClientIp(request),
      reason: body.reason ?? null,
      traceId: id,
      idempotencyKey,
    });

    return withCors(apiOk({ quote: updated }, id), request);
  } catch (error) {
    return withCors(routeError(error, id), request);
  }
}

export async function OPTIONS(request: Request) {
  return corsPreflight(request);
}
