import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { quotes } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

type QuoteDecision = 'approved' | 'declined';

export type DecideQuoteCommand = {
  workspaceId: string;
  quoteId: string;
  decision: QuoteDecision;
  actorUserId?: string | null;
  approvalMethod: 'staff' | 'customer_link';
  termsVersion?: string | null;
  signatureIp?: string | null;
  reason?: string | null;
  traceId?: string | null;
  idempotencyKey: string;
};

export async function decideQuoteCommand(input: DecideQuoteCommand) {
  const db = getDb();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.decide',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input,
    });
    if (claim.kind === 'replay') {
      const [existing] = await tx.select().from(quotes).where(and(eq(quotes.workspaceId, input.workspaceId), eq(quotes.id, input.quoteId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent quote result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }
    const rows = await tx.execute<{
      status: string;
      total: string;
      work_order_id: string | null;
      customer_id: string;
      vehicle_id: string | null;
    }>(sql`
      select status, total, work_order_id, customer_id, vehicle_id
      from quotes
      where workspace_id = ${input.workspaceId} and id = ${input.quoteId}
      for update
    `);
    const current = rows[0];
    if (!current) throw Object.assign(new Error('Quote was not found in this workspace'), { status: 404, code: 'quote_not_found' });

    if (current.status === input.decision) {
      const [existing] = await tx.select().from(quotes).where(and(
        eq(quotes.workspaceId, input.workspaceId),
        eq(quotes.id, input.quoteId),
      )).limit(1);
      return existing;
    }

    if (current.status !== 'sent') {
      throw Object.assign(new Error(`A quote in ${current.status} status cannot be ${input.decision}`), {
        status: 409,
        code: 'invalid_quote_transition',
      });
    }

    const decidedAt = new Date();
    const [quote] = await tx.update(quotes).set({
      status: input.decision,
      updatedAt: decidedAt,
      metadata: sql`coalesce(${quotes.metadata}, '{}'::jsonb) || ${JSON.stringify({
        decision: {
          method: input.approvalMethod,
          termsVersion: input.termsVersion ?? null,
          signatureIp: input.signatureIp ?? null,
          reason: input.reason ?? null,
        },
      })}::jsonb`,
    }).where(and(
      eq(quotes.workspaceId, input.workspaceId),
      eq(quotes.id, input.quoteId),
    )).returning();

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'quote',
      aggregateId: quote.id,
      eventType: `quote.${input.decision}`,
      payload: {
        quoteId: quote.id,
        workOrderId: current.work_order_id,
        customerId: current.customer_id,
        vehicleId: current.vehicle_id,
        approvedTotal: input.decision === 'approved' ? current.total : null,
        decidedAt: decidedAt.toISOString(),
        decision: input.decision,
        approvalMethod: input.approvalMethod,
        termsVersion: input.termsVersion ?? null,
        signatureIp: input.signatureIp ?? null,
        reason: input.reason ?? null,
        actorUserId: input.actorUserId ?? null,
      },
      traceId: input.traceId ?? null,
      correlationId,
      idempotencyKey: input.idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'quote.decide',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 200,
      responseBody: { quoteId: quote.id, status: quote.status },
      resourceType: 'quote',
      resourceId: quote.id,
    });

    return quote;
  });
}
