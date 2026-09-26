import 'server-only';

import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';

import { getDb } from '@/db/client';
import { invoices, quotes } from '@/db/schema';
import { publishDomainEvent } from '@/server/events/publish';
import { claimIdempotency, completeIdempotency } from '@/server/idempotency/command-idempotency';

export async function issueInvoiceFromQuoteCommand(input: {
  workspaceId: string;
  quoteId: string;
  actorUserId: string;
  dueAt?: Date | null;
  traceId?: string | null;
  idempotencyKey: string;
}) {
  const db = getDb();
  const invoiceId = randomUUID();
  const correlationId = randomUUID();

  return db.transaction(async (tx) => {
    const claim = await claimIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'invoice.issue_from_quote',
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: {
        quoteId: input.quoteId,
        actorUserId: input.actorUserId,
        dueAt: input.dueAt?.toISOString() ?? null,
      },
    });
    if (claim.kind === 'replay') {
      if (!claim.resourceId) throw Object.assign(new Error('Idempotent invoice result is missing'), { status: 500, code: 'idempotency_resource_missing' });
      const [existing] = await tx.select().from(invoices).where(and(eq(invoices.workspaceId, input.workspaceId), eq(invoices.id, claim.resourceId))).limit(1);
      if (!existing) throw Object.assign(new Error('Idempotent invoice result no longer exists'), { status: 409, code: 'idempotency_resource_gone' });
      return existing;
    }

    const quoteRows = await tx.execute<{
      id: string;
      status: string;
      customer_id: string;
      vehicle_id: string | null;
      work_order_id: string | null;
      subtotal: string;
      tax_total: string;
      total: string;
    }>(sql`
      select id,status,customer_id,vehicle_id,work_order_id,subtotal,tax_total,total
      from quotes
      where workspace_id=${input.workspaceId} and id=${input.quoteId}
      for update
    `);
    const quote = quoteRows[0];
    if (!quote) throw Object.assign(new Error('Quote was not found in this workspace'), { status: 404, code: 'quote_not_found' });
    if (!['approved','converted'].includes(quote.status)) {
      throw Object.assign(new Error('Only an approved quote can be invoiced'), { status: 409, code: 'quote_not_approved' });
    }

    const existingRows = await tx.execute<{ id: string }>(sql`
      select id from invoices
      where workspace_id=${input.workspaceId}
        and metadata->>'source_quote_id'=${input.quoteId}
      limit 1
      for update
    `);
    if (existingRows[0]) {
      const [existing] = await tx.select().from(invoices).where(and(
        eq(invoices.workspaceId,input.workspaceId),
        eq(invoices.id,existingRows[0].id),
      )).limit(1);
      await completeIdempotency(tx, {
        workspaceId: input.workspaceId,
        commandName: 'invoice.issue_from_quote',
        idempotencyKey: input.idempotencyKey,
        responseStatus: 200,
        responseBody: { invoiceId: existing.id },
        resourceType: 'invoice',
        resourceId: existing.id,
      });
      return existing;
    }


    const issuedAt = new Date();
    const [invoice] = await tx.insert(invoices).values({
      id: invoiceId,
      workspaceId: input.workspaceId,
      customerId: quote.customer_id,
      vehicleId: quote.vehicle_id,
      workOrderId: quote.work_order_id,
      status: 'issued',
      subtotal: quote.subtotal,
      taxTotal: quote.tax_total,
      total: quote.total,
      amountPaid: '0',
      dueAt: input.dueAt ?? null,
      issuedAt,
      createdBy: input.actorUserId,
      metadata: { source_quote_id: input.quoteId },
    }).returning();

    if (quote.status === 'approved') {
      await tx.update(quotes).set({ status: 'converted', updatedAt: issuedAt }).where(and(
        eq(quotes.workspaceId,input.workspaceId),
        eq(quotes.id,input.quoteId),
      ));
    }

    await publishDomainEvent(tx, {
      workspaceId: input.workspaceId,
      aggregateType: 'invoice',
      aggregateId: invoice.id,
      eventType: 'invoice.issued',
      payload: {
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
        sourceQuoteId: input.quoteId,
        workOrderId: quote.work_order_id,
        customerId: quote.customer_id,
        vehicleId: quote.vehicle_id,
        subtotal: quote.subtotal,
        taxTotal: quote.tax_total,
        total: quote.total,
        issuedAt: issuedAt.toISOString(),
        dueAt: invoice.dueAt?.toISOString() ?? null,
      },
      traceId: input.traceId ?? null,
      correlationId,
      causationId: null,
      idempotencyKey: input.idempotencyKey,
    });

    await completeIdempotency(tx, {
      workspaceId: input.workspaceId,
      commandName: 'invoice.issue_from_quote',
      idempotencyKey: input.idempotencyKey,
      responseStatus: 201,
      responseBody: { invoiceId: invoice.id },
      resourceType: 'invoice',
      resourceId: invoice.id,
    });

    return invoice;
  });
}
