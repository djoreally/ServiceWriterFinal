import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { quotes } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export async function sendQuoteCommand(input: {
  workspaceId: string;
  quoteId: string;
  actorUserId: string;
  traceId?: string | null;
  idempotencyKey: string;
}) {
  const db = getDb();
  const correlationId = randomUUID();
  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.send',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input,
    });
    if (claim.kind === 'replay') {
      const [existing] = await tx.select().from(quotes).where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, input.quoteId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent quote result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }
    const rows = await tx.execute<{ status: string }>(sql`
      select status from quotes where workspace_id=${input.workspaceId} and id=${input.quoteId} for update
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Quote was not found in this workspace'), { status: 404, code: 'quote_not_found' });
    if (current.status === 'sent') {
      const [existing] = await tx.select().from(quotes).where(and(eq(quotes.workspaceId,input.workspaceId),eq(quotes.id,input.quoteId))).limit(1);
      return existing;
    }
    if (current.status !== 'draft') throw Object.assign(new Error('Only draft quotes can be sent'), { status: 409, code: 'invalid_quote_transition' });

    const sentAt = new Date();
    const [quote] = await tx.update(quotes).set({
      status: 'sent',
      updatedAt: sentAt,
      metadata: sql`coalesce(${quotes.metadata}, '{}'::jsonb) || ${JSON.stringify({ sentAt: sentAt.toISOString() })}::jsonb`,
    }).where(and(eq(quotes.workspaceId,input.workspaceId),eq(quotes.id,input.quoteId))).returning();

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: 'quote.sent',
      payload: { quoteId: quote.id, total: quote.total, sentAt: sentAt.toISOString(), actorUserId: input.actorUserId },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });
    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.send',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 200,
      responseBody: { quoteId: quote.id, status: quote.status },
      resourceType: 'quote',
      resourceId: quote.id,
    });

    return quote;
  });
}
